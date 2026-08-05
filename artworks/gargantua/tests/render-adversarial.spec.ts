import { expect, test } from '@playwright/test';
import type { GpuProfileSummary } from '../src/gpu-pass-profiler';

const renderTimeout = 120_000;

declare global {
  interface Window {
    __blackHoleGpuProfile?: () => GpuProfileSummary;
  }
}

test.describe('optimization 08B-3 — adversarial rendering audit', () => {
  test.describe.configure({ mode: 'serial' });

  for (const [quality, cubeSize] of [
    ['standard', '512'],
    ['high', '1024'],
    ['cinematic', '1024'],
  ] as const) {
    test(`${quality} initializes a complete sky cache without WebGL errors`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));

      await page.setViewportSize({ width: 640, height: 360 });
      await page.goto(`/?shot=1&q=${quality}&cam=poster&time=0`, {
        waitUntil: 'domcontentloaded',
      });
      const root = page.locator('html');
      await expect(root).toHaveAttribute('data-shot-ready', 'true', {
        timeout: renderTimeout,
      });
      await expect(root).toHaveAttribute('data-sky-source', 'precomputed-cube');
      await expect(root).toHaveAttribute('data-sky-cube-size', cubeSize);
      await expect(root).toHaveAttribute('data-sky-cube-fallback', 'none');

      const webGlError = await page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>('#scene');
        const gl = canvas?.getContext('webgl2');
        return gl?.getError() ?? -1;
      });

      expect(webGlError).toBe(0);
      expect(await root.getAttribute('data-render-error')).toBeNull();
      expect(pageErrors).toEqual([]);
    });
  }

  test('rapid resizing and direct manipulation do not destabilize the cache', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.setViewportSize({ width: 900, height: 600 });
    await page.goto('/?q=standard&cam=poster&time=0', {
      waitUntil: 'domcontentloaded',
    });
    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-render-ready', 'true', {
      timeout: renderTimeout,
    });

    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1280, height: 400 },
      { width: 800, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(root).toHaveAttribute(
        'data-render-size',
        `${viewport.width}x${viewport.height}`,
      );
    }

    await page.mouse.move(400, 400);
    await page.mouse.down();
    await page.mouse.move(650, 180, { steps: 12 });
    await page.mouse.up();
    await page.mouse.wheel(0, -500);
    await expect(root).toHaveAttribute('data-view', 'custom');
    await expect(root).toHaveAttribute('data-sky-cube-size', '512');
    expect(await root.getAttribute('data-render-error')).toBeNull();
    expect(pageErrors).toEqual([]);
  });

  test('GPU profiling stays invisible and degrades safely when timers are unavailable', async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 270 });
    await page.goto('/?profile=1&q=standard&cam=poster&time=0', {
      waitUntil: 'domcontentloaded',
    });
    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-render-ready', 'true', {
      timeout: renderTimeout,
    });
    await expect(root).toHaveAttribute(
      'data-gpu-profiler',
      /^(ready|unsupported)$/,
      { timeout: 90_000 },
    );
    await expect(root).toHaveAttribute('data-gpu-samples', /^\d+$/);
    await expect(page.locator('#app > *')).toHaveCount(3);
    await expect(page.locator('#error-overlay')).toBeHidden();

    const summary = await page.evaluate(() => window.__blackHoleGpuProfile?.());
    expect(summary).toBeDefined();

    if (summary?.status === 'ready') {
      expect(summary.sampleCount).toBeGreaterThanOrEqual(5);
      expect(summary.passes.ray?.medianMs).toBeGreaterThan(0);
      expect(summary.passes.bloom?.medianMs).toBeGreaterThan(0);
      expect(summary.passes.post?.medianMs).toBeGreaterThan(0);
      await expect(root).toHaveAttribute('data-gpu-ray-median-ms', /^\d+\.\d{3}$/);
      await expect(root).toHaveAttribute('data-gpu-bloom-median-ms', /^\d+\.\d{3}$/);
      await expect(root).toHaveAttribute('data-gpu-post-median-ms', /^\d+\.\d{3}$/);
      await expect(root).toHaveAttribute('data-gpu-total-median-ms', /^\d+\.\d{3}$/);
    }
  });

  test('context loss exposes only the required recovery surface', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 360 });
    await page.goto('/?q=standard&cam=poster&time=0', {
      waitUntil: 'domcontentloaded',
    });
    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-render-ready', 'true', {
      timeout: renderTimeout,
    });

    const extensionAvailable = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('#scene');
      const gl = canvas?.getContext('webgl2');
      const extension = gl?.getExtension('WEBGL_lose_context');
      extension?.loseContext();
      return extension !== null && extension !== undefined;
    });

    test.skip(!extensionAvailable, 'WEBGL_lose_context is unavailable.');
    await expect(root).toHaveAttribute('data-render-error', 'context-lost');
    await expect(page.locator('#error-overlay')).toBeVisible();
    await expect(page.locator('#app > *')).toHaveCount(3);
  });
});
