import { test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

type QualityTier = 'standard' | 'high' | 'cinematic';
type ViewName = 'poster' | 'grazing' | 'crown' | 'solitude';

interface BenchmarkScenario {
  deviceScaleFactor: number;
  family: 'composition' | 'desktop-scale' | 'mobile-scale' | 'software-relative';
  quality: QualityTier;
  time: number;
  view: ViewName;
  viewport: {
    height: number;
    width: number;
  };
}

interface FrameMetrics {
  averageFps: number | null;
  frameCount: number;
  meanFrameMs: number | null;
  p50FrameMs: number | null;
  p95FrameMs: number | null;
  sampleDurationMs: number;
}

interface ScenarioResult extends BenchmarkScenario {
  firstFrameMs?: number;
  frameMetrics?: FrameMetrics;
  pageFrameRate?: number | null;
  pixelRatio?: number;
  renderSize?: string;
  status: 'complete' | 'error';
  error?: string;
}

declare global {
  interface Window {
    __blackHoleBenchmarkFrames?: number[];
  }
}

const benchmarkLabel = (process.env.BH_BENCHMARK_LABEL ?? 'manual')
  .replaceAll(/[^a-zA-Z0-9_-]/g, '-');
const baseURL = process.env.BH_BENCHMARK_URL ?? 'http://127.0.0.1:4173';
const outputDirectory = path.resolve(
  process.cwd(),
  '.runtime/gargantua/optimization-08b',
);
const warmupDurationMs = 2_000;
const sampleDurationMs = 5_000;
const renderTimeoutMs = 180_000;
const benchmarkSuite = process.env.BH_BENCHMARK_SUITE === 'gpu-matrix'
  ? 'gpu-matrix'
  : 'software-relative';
const qualityTiers: QualityTier[] = ['standard', 'high', 'cinematic'];
const compositions: Array<{
  time: number;
  view: ViewName;
}> = [
  { view: 'poster', time: 0 },
  { view: 'grazing', time: 2.4 },
  { view: 'crown', time: 6.2 },
  { view: 'solitude', time: 11.4 },
];

const allScenarios: BenchmarkScenario[] = [
  ...compositions.flatMap(({ view, time }) => qualityTiers.map((quality) => ({
    deviceScaleFactor: 2,
    family: 'composition' as const,
    quality,
    time,
    view,
    viewport: { width: 1440, height: 810 },
  }))),
  ...qualityTiers.map((quality) => ({
    deviceScaleFactor: 2,
    family: 'desktop-scale' as const,
    quality,
    time: 0,
    view: 'poster' as const,
    viewport: { width: 1920, height: 1080 },
  })),
  ...qualityTiers.map((quality) => ({
    deviceScaleFactor: 3,
    family: 'mobile-scale' as const,
    quality,
    time: 0,
    view: 'poster' as const,
    viewport: { width: 390, height: 844 },
  })),
];
const softwareRelativeScenarios: BenchmarkScenario[] = compositions.flatMap(({
  view,
  time,
}) => qualityTiers.map((quality) => ({
  deviceScaleFactor: 1,
  family: 'software-relative' as const,
  quality,
  time,
  view,
  viewport: { width: 480, height: 270 },
})));
const requestedScenarioLimit = Number.parseInt(
  process.env.BH_BENCHMARK_LIMIT ?? '',
  10,
);
const selectedScenarios = benchmarkSuite === 'software-relative'
  ? softwareRelativeScenarios
  : allScenarios;
const scenarios = Number.isFinite(requestedScenarioLimit)
  ? selectedScenarios.slice(0, Math.max(requestedScenarioLimit, 1))
  : selectedScenarios;

function round(value: number, digits: number = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentile(sortedValues: number[], percentileRank: number): number | null {
  if (sortedValues.length === 0) {
    return null;
  }

  const index = Math.min(
    Math.ceil(percentileRank * sortedValues.length) - 1,
    sortedValues.length - 1,
  );
  return round(sortedValues[Math.max(index, 0)]);
}

function summarizeFrames(frameTimes: number[], sampleStartedAt: number): FrameMetrics {
  const sampledFrames = frameTimes.filter((time) => time >= sampleStartedAt);
  const intervals = sampledFrames.slice(1).map((time, index) => (
    time - sampledFrames[index]
  ));
  const sortedIntervals = [...intervals].sort((left, right) => left - right);
  const measuredDuration = sampledFrames.length >= 2
    ? sampledFrames.at(-1)! - sampledFrames[0]
    : 0;
  const meanFrameMs = intervals.length > 0
    ? intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length
    : null;

  return {
    averageFps: measuredDuration > 0
      ? round(intervals.length * 1_000 / measuredDuration)
      : null,
    frameCount: sampledFrames.length,
    meanFrameMs: meanFrameMs === null ? null : round(meanFrameMs),
    p50FrameMs: percentile(sortedIntervals, 0.5),
    p95FrameMs: percentile(sortedIntervals, 0.95),
    sampleDurationMs: round(measuredDuration),
  };
}

function scenarioName(scenario: BenchmarkScenario): string {
  return [
    scenario.family,
    `${scenario.viewport.width}x${scenario.viewport.height}`,
    `dpr${scenario.deviceScaleFactor}`,
    scenario.view,
    scenario.quality,
  ].join('/');
}

test.describe('optimization 08B — performance benchmark', () => {
  test.describe.configure({ mode: 'serial', timeout: 1_800_000 });

  test(`records ${benchmarkLabel} runtime metrics`, async ({ browser }) => {
    const results: ScenarioResult[] = [];
    let environment: Record<string, unknown> | undefined;

    for (const scenario of scenarios) {
      const context = await browser.newContext({
        baseURL,
        colorScheme: 'dark',
        deviceScaleFactor: scenario.deviceScaleFactor,
        locale: 'en-US',
        reducedMotion: 'reduce',
        viewport: scenario.viewport,
      });
      const page = await context.newPage();

      await page.addInitScript(() => {
        const frameTimes: number[] = [];
        window.__blackHoleBenchmarkFrames = frameTimes;

        function collectFrame(time: number): void {
          frameTimes.push(time);
          window.requestAnimationFrame(collectFrame);
        }

        window.requestAnimationFrame(collectFrame);
      });

      try {
        await page.goto(
          `/?q=${scenario.quality}&cam=${scenario.view}&time=${scenario.time}`,
          { waitUntil: 'domcontentloaded', timeout: renderTimeoutMs },
        );
        await page.locator('html').waitFor({ state: 'attached' });
        await page.waitForFunction(() => (
          document.documentElement.dataset.renderReady === 'true'
          || document.documentElement.dataset.renderError !== undefined
        ), undefined, { timeout: renderTimeoutMs });

        const renderError = await page.locator('html').getAttribute('data-render-error');
        if (renderError) {
          throw new Error(`Renderer reported ${renderError}`);
        }

        const firstFrameMs = await page.evaluate(() => performance.now());
        await page.waitForTimeout(warmupDurationMs);
        const sampleStartedAt = await page.evaluate(() => performance.now());
        await page.waitForTimeout(sampleDurationMs);

        const pageData = await page.evaluate(() => {
          const canvas = document.querySelector<HTMLCanvasElement>('#scene');
          const gl = canvas?.getContext('webgl2');
          const debugRendererInfo = gl?.getExtension('WEBGL_debug_renderer_info');
          const root = document.documentElement.dataset;

          return {
            deviceMemory: (
              navigator as Navigator & { deviceMemory?: number }
            ).deviceMemory ?? null,
            frameRate: Number.parseFloat(root.frameRate ?? ''),
            frameTimes: window.__blackHoleBenchmarkFrames ?? [],
            hardwareConcurrency: navigator.hardwareConcurrency,
            pixelRatio: Number.parseFloat(root.pixelRatio ?? ''),
            renderSize: root.renderSize,
            renderer: gl && debugRendererInfo
              ? gl.getParameter(debugRendererInfo.UNMASKED_RENDERER_WEBGL)
              : gl?.getParameter(gl.RENDERER) ?? null,
            userAgent: navigator.userAgent,
            vendor: gl && debugRendererInfo
              ? gl.getParameter(debugRendererInfo.UNMASKED_VENDOR_WEBGL)
              : gl?.getParameter(gl.VENDOR) ?? null,
          };
        });

        environment ??= {
          browserVersion: browser.version(),
          deviceMemory: pageData.deviceMemory,
          hardwareConcurrency: pageData.hardwareConcurrency,
          nodeArchitecture: process.arch,
          nodePlatform: process.platform,
          renderer: pageData.renderer,
          userAgent: pageData.userAgent,
          vendor: pageData.vendor,
        };

        const result: ScenarioResult = {
          ...scenario,
          firstFrameMs: round(firstFrameMs),
          frameMetrics: summarizeFrames(pageData.frameTimes, sampleStartedAt),
          pageFrameRate: Number.isFinite(pageData.frameRate)
            ? round(pageData.frameRate)
            : null,
          pixelRatio: pageData.pixelRatio,
          renderSize: pageData.renderSize,
          status: 'complete',
        };
        results.push(result);
        console.log(
          `${scenarioName(scenario)}: ${result.frameMetrics?.averageFps ?? 'n/a'} fps`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ ...scenario, error: message, status: 'error' });
        console.log(`${scenarioName(scenario)}: ERROR ${message}`);
      } finally {
        await context.close();
      }
    }

    const output = {
      benchmark: 'optimization-08b',
      benchmarkSuite,
      environment,
      label: benchmarkLabel,
      measuredAt: new Date().toISOString(),
      methodology: {
        note: 'Chromium RAF cadence; compare runs on the same machine and renderer only.',
        sampleDurationMs,
        scenarioCount: scenarios.length,
        warmupDurationMs,
      },
      results,
    };

    await mkdir(outputDirectory, { recursive: true });
    const outputPath = path.join(outputDirectory, `benchmark-${benchmarkLabel}.json`);
    await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    console.log(`Benchmark written to ${outputPath}`);
  });
});
