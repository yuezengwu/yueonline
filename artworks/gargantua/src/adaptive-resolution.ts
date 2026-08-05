export const ADAPTIVE_RESOLUTION_SCALES = [1, 0.85, 0.70] as const;

export interface AdaptiveResolutionChange {
  level: number;
  scale: number;
}

const COOLDOWN_DURATION_MS = 5_000;
const DOWNGRADE_FRAME_TIME_MS = 25;
const DOWNGRADE_SUSTAIN_MS = 2_500;
const FRAME_TIME_SMOOTHING = 0.10;
const LONG_FRAME_RESET_MS = 1_000;
const UPGRADE_FRAME_TIME_MS = 18.5;
const UPGRADE_SUSTAIN_MS = 8_000;
const WARMUP_DURATION_MS = 3_000;

export class AdaptiveResolutionController {
  private cooldownUntil: number;
  private fastDuration = 0;
  private levelIndex = 0;
  private samplingStartsAt: number;
  private slowDuration = 0;
  private smoothedFrameTime: number | null = null;

  constructor(startedAt: number) {
    this.cooldownUntil = startedAt;
    this.samplingStartsAt = startedAt + WARMUP_DURATION_MS;
  }

  get level(): number {
    return this.levelIndex;
  }

  get scale(): number {
    return ADAPTIVE_RESOLUTION_SCALES[this.levelIndex];
  }

  reset(now: number): void {
    this.cooldownUntil = now;
    this.fastDuration = 0;
    this.samplingStartsAt = now + WARMUP_DURATION_MS;
    this.slowDuration = 0;
    this.smoothedFrameTime = null;
  }

  sample(
    now: number,
    frameDuration: number,
  ): AdaptiveResolutionChange | null {
    if (
      !Number.isFinite(now)
      || !Number.isFinite(frameDuration)
      || frameDuration <= 0
    ) {
      return null;
    }

    if (frameDuration > LONG_FRAME_RESET_MS) {
      this.reset(now);
      return null;
    }

    if (now < this.samplingStartsAt || now < this.cooldownUntil) {
      return null;
    }

    this.smoothedFrameTime = this.smoothedFrameTime === null
      ? frameDuration
      : this.smoothedFrameTime
        + (frameDuration - this.smoothedFrameTime) * FRAME_TIME_SMOOTHING;

    if (this.smoothedFrameTime > DOWNGRADE_FRAME_TIME_MS) {
      this.fastDuration = 0;
      this.slowDuration += frameDuration;

      if (this.slowDuration >= DOWNGRADE_SUSTAIN_MS) {
        if (this.levelIndex < ADAPTIVE_RESOLUTION_SCALES.length - 1) {
          return this.changeLevel(this.levelIndex + 1, now);
        }

        this.slowDuration = 0;
      }

      return null;
    }

    if (this.smoothedFrameTime < UPGRADE_FRAME_TIME_MS) {
      this.slowDuration = 0;
      this.fastDuration += frameDuration;

      if (this.fastDuration >= UPGRADE_SUSTAIN_MS) {
        if (this.levelIndex > 0) {
          return this.changeLevel(this.levelIndex - 1, now);
        }

        this.fastDuration = 0;
      }

      return null;
    }

    this.fastDuration = 0;
    this.slowDuration = 0;
    return null;
  }

  private changeLevel(
    nextLevel: number,
    now: number,
  ): AdaptiveResolutionChange {
    this.cooldownUntil = now + COOLDOWN_DURATION_MS;
    this.fastDuration = 0;
    this.levelIndex = nextLevel;
    this.slowDuration = 0;
    this.smoothedFrameTime = null;

    return {
      level: this.level,
      scale: this.scale,
    };
  }
}
