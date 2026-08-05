import { expect, test } from '@playwright/test';
import {
  ADAPTIVE_RESOLUTION_SCALES,
  AdaptiveResolutionController,
} from '../src/adaptive-resolution';

function sampleFor(
  controller: AdaptiveResolutionController,
  startedAt: number,
  duration: number,
  frameDuration: number,
): {
  changes: Array<{ level: number; scale: number }>;
  endedAt: number;
} {
  const changes: Array<{ level: number; scale: number }> = [];
  let now = startedAt;
  const end = startedAt + duration;

  while (now < end) {
    now += frameDuration;
    const change = controller.sample(now, frameDuration);

    if (change) {
      changes.push(change);
    }
  }

  return { changes, endedAt: now };
}

test.describe('optimization 08B-2 — adaptive resolution controller', () => {
  test('waits through warm-up and sustained slow frames before degrading', () => {
    const controller = new AdaptiveResolutionController(0);
    const warmup = sampleFor(controller, 0, 2_900, 50);

    expect(warmup.changes).toEqual([]);
    expect(controller.level).toBe(0);

    const slow = sampleFor(controller, warmup.endedAt, 2_700, 50);

    expect(slow.changes).toEqual([{ level: 1, scale: 0.85 }]);
    expect(controller.scale).toBe(ADAPTIVE_RESOLUTION_SCALES[1]);
  });

  test('uses cooldown and asymmetric recovery to avoid oscillation', () => {
    const controller = new AdaptiveResolutionController(0);
    const firstSlowPeriod = sampleFor(controller, 0, 13_500, 50);

    expect(firstSlowPeriod.changes).toEqual([
      { level: 1, scale: 0.85 },
      { level: 2, scale: 0.7 },
    ]);

    const earlyRecovery = sampleFor(
      controller,
      firstSlowPeriod.endedAt,
      11_000,
      1000 / 60,
    );
    expect(earlyRecovery.changes).toEqual([]);

    const fullRecovery = sampleFor(
      controller,
      earlyRecovery.endedAt,
      18_000,
      1000 / 60,
    );
    expect(fullRecovery.changes).toEqual([
      { level: 1, scale: 0.85 },
      { level: 0, scale: 1 },
    ]);
  });

  test('resets sampling after a long pause without changing the level', () => {
    const controller = new AdaptiveResolutionController(0);
    const degraded = sampleFor(controller, 0, 5_600, 50);

    expect(degraded.changes).toEqual([{ level: 1, scale: 0.85 }]);

    const pausedAt = degraded.endedAt + 1_500;
    expect(controller.sample(pausedAt, 1_500)).toBeNull();
    expect(controller.level).toBe(1);

    const afterPause = sampleFor(controller, pausedAt, 2_900, 50);
    expect(afterPause.changes).toEqual([]);
  });
});
