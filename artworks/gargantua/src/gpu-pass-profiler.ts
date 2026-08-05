export const GPU_PASS_NAMES = ['ray', 'bloom', 'post'] as const;

export type GpuPassName = typeof GPU_PASS_NAMES[number];
export type GpuProfilerStatus =
  | 'disabled'
  | 'unsupported'
  | 'warming'
  | 'sampling'
  | 'ready';

export interface GpuTimingStatistics {
  meanMs: number;
  medianMs: number;
  p95Ms: number;
}

export interface GpuProfileSummary {
  passes: Record<GpuPassName, GpuTimingStatistics | null>;
  sampleCount: number;
  status: GpuProfilerStatus;
  total: GpuTimingStatistics | null;
}

interface TimerQueryExtension {
  GPU_DISJOINT_EXT: number;
  TIME_ELAPSED_EXT: number;
}

interface PendingQuery {
  pass: GpuPassName;
  query: WebGLQuery;
  sampleId: number;
}

const MAX_PENDING_QUERIES = GPU_PASS_NAMES.length * 6;
const MAX_RETAINED_SAMPLES = 120;
const PROFILE_SAMPLE_INTERVAL_MS = 250;
const PROFILE_WARMUP_MS = 1_000;
const READY_SAMPLE_COUNT = 5;

function percentile(sortedValues: number[], rank: number): number {
  const index = Math.min(
    Math.ceil(rank * sortedValues.length) - 1,
    sortedValues.length - 1,
  );
  return sortedValues[Math.max(index, 0)];
}

function summarize(values: number[]): GpuTimingStatistics | null {
  if (values.length === 0) {
    return null;
  }

  const sortedValues = [...values].sort((left, right) => left - right);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;

  return {
    meanMs: mean,
    medianMs: percentile(sortedValues, 0.5),
    p95Ms: percentile(sortedValues, 0.95),
  };
}

export class GpuPassProfiler {
  private activeQuery: PendingQuery | null = null;
  private completedSamples = 0;
  private currentSampleId: number | null = null;
  private readonly enabled: boolean;
  private readonly extension: TimerQueryExtension | null;
  private readonly gl: WebGL2RenderingContext;
  private nextSampleAt: number;
  private readonly passSamples: Record<GpuPassName, number[]> = {
    bloom: [],
    post: [],
    ray: [],
  };
  private readonly pendingQueries: PendingQuery[] = [];
  private sampleId = 0;
  private readonly sampleParts = new Map<
    number,
    Partial<Record<GpuPassName, number>>
  >();
  private statusValue: GpuProfilerStatus;
  private readonly totalSamples: number[] = [];

  constructor(
    gl: WebGL2RenderingContext,
    enabled: boolean,
    startedAt: number,
  ) {
    this.enabled = enabled;
    this.gl = gl;
    this.extension = enabled
      ? (gl.getExtension(
        'EXT_disjoint_timer_query_webgl2',
      ) as TimerQueryExtension | null)
      : null;
    this.nextSampleAt = startedAt + PROFILE_WARMUP_MS;
    this.statusValue = !enabled
      ? 'disabled'
      : this.extension
        ? 'warming'
        : 'unsupported';
  }

  get status(): GpuProfilerStatus {
    return this.statusValue;
  }

  beginFrame(now: number): void {
    if (!this.enabled || !this.extension) {
      return;
    }

    this.collectCompletedQueries();

    if (
      now < this.nextSampleAt
      || this.pendingQueries.length >= MAX_PENDING_QUERIES
    ) {
      return;
    }

    this.currentSampleId = this.sampleId;
    this.sampleId += 1;
    this.nextSampleAt = now + PROFILE_SAMPLE_INTERVAL_MS;
    this.statusValue = this.completedSamples >= READY_SAMPLE_COUNT
      ? 'ready'
      : 'sampling';
  }

  measure(pass: GpuPassName, render: () => void): void {
    if (
      this.currentSampleId === null
      || !this.extension
      || this.activeQuery !== null
    ) {
      render();
      return;
    }

    const query = this.gl.createQuery();

    if (!query) {
      render();
      return;
    }

    const pendingQuery: PendingQuery = {
      pass,
      query,
      sampleId: this.currentSampleId,
    };
    this.activeQuery = pendingQuery;
    this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, query);

    try {
      render();
    } finally {
      this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
      this.activeQuery = null;
      this.pendingQueries.push(pendingQuery);
    }
  }

  endFrame(): void {
    this.currentSampleId = null;
  }

  summary(): GpuProfileSummary {
    this.collectCompletedQueries();

    return {
      passes: {
        bloom: summarize(this.passSamples.bloom),
        post: summarize(this.passSamples.post),
        ray: summarize(this.passSamples.ray),
      },
      sampleCount: this.completedSamples,
      status: this.statusValue,
      total: summarize(this.totalSamples),
    };
  }

  dispose(): void {
    if (this.activeQuery) {
      this.gl.deleteQuery(this.activeQuery.query);
      this.activeQuery = null;
    }

    for (const pendingQuery of this.pendingQueries) {
      this.gl.deleteQuery(pendingQuery.query);
    }

    this.pendingQueries.length = 0;
    this.sampleParts.clear();
  }

  private collectCompletedQueries(): void {
    if (!this.extension || this.pendingQueries.length === 0) {
      return;
    }

    const disjoint = Boolean(
      this.gl.getParameter(this.extension.GPU_DISJOINT_EXT),
    );

    if (disjoint) {
      for (const pendingQuery of this.pendingQueries) {
        this.gl.deleteQuery(pendingQuery.query);
      }

      this.pendingQueries.length = 0;
      this.sampleParts.clear();
      this.statusValue = 'sampling';
      return;
    }

    for (let index = this.pendingQueries.length - 1; index >= 0; index -= 1) {
      const pendingQuery = this.pendingQueries[index];
      const available = Boolean(this.gl.getQueryParameter(
        pendingQuery.query,
        this.gl.QUERY_RESULT_AVAILABLE,
      ));

      if (!available) {
        continue;
      }

      const elapsedNanoseconds = Number(this.gl.getQueryParameter(
        pendingQuery.query,
        this.gl.QUERY_RESULT,
      ));
      this.gl.deleteQuery(pendingQuery.query);
      this.pendingQueries.splice(index, 1);

      if (!Number.isFinite(elapsedNanoseconds) || elapsedNanoseconds < 0) {
        continue;
      }

      const parts = this.sampleParts.get(pendingQuery.sampleId) ?? {};
      parts[pendingQuery.pass] = elapsedNanoseconds / 1_000_000;
      this.sampleParts.set(pendingQuery.sampleId, parts);

      if (GPU_PASS_NAMES.every((pass) => parts[pass] !== undefined)) {
        this.completeSample(pendingQuery.sampleId, parts);
      }
    }

    // A driver can fail or invalidate one query while its sibling pass queries
    // still complete. Do not retain those permanently incomplete sample records.
    for (const sampleId of this.sampleParts.keys()) {
      const stillPending = this.pendingQueries.some(
        (pendingQuery) => pendingQuery.sampleId === sampleId,
      );

      if (!stillPending) {
        this.sampleParts.delete(sampleId);
      }
    }
  }

  private completeSample(
    sampleId: number,
    parts: Partial<Record<GpuPassName, number>>,
  ): void {
    const ray = parts.ray;
    const bloom = parts.bloom;
    const post = parts.post;

    if (ray === undefined || bloom === undefined || post === undefined) {
      return;
    }

    this.passSamples.ray.push(ray);
    this.passSamples.bloom.push(bloom);
    this.passSamples.post.push(post);
    this.totalSamples.push(ray + bloom + post);
    this.completedSamples += 1;
    this.sampleParts.delete(sampleId);

    for (const samples of [
      this.passSamples.ray,
      this.passSamples.bloom,
      this.passSamples.post,
      this.totalSamples,
    ]) {
      if (samples.length > MAX_RETAINED_SAMPLES) {
        samples.splice(0, samples.length - MAX_RETAINED_SAMPLES);
      }
    }

    this.statusValue = this.completedSamples >= READY_SAMPLE_COUNT
      ? 'ready'
      : 'sampling';
  }
}
