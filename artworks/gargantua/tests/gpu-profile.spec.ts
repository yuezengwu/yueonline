import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { GpuProfileSummary } from '../src/gpu-pass-profiler';

type QualityTier = 'standard' | 'high' | 'cinematic';
type ViewName = 'poster' | 'grazing' | 'crown' | 'solitude';

interface ProfileResult {
  quality: QualityTier;
  renderSize: string | undefined;
  summary: GpuProfileSummary;
  time: number;
  view: ViewName;
}

const baseURL = process.env.BH_BENCHMARK_URL ?? 'http://127.0.0.1:4173';
const outputDirectory = path.resolve(
  process.cwd(),
  '.runtime/gargantua/optimization-08b3',
);
const profileLabel = (process.env.BH_GPU_PROFILE_LABEL ?? 'manual')
  .replaceAll(/[^a-zA-Z0-9_-]/g, '-');
const qualities: QualityTier[] = ['standard', 'high', 'cinematic'];
const compositions: Array<{ time: number; view: ViewName }> = [
  { view: 'poster', time: 0 },
  { view: 'grazing', time: 2.4 },
  { view: 'crown', time: 6.2 },
  { view: 'solitude', time: 11.4 },
];

declare global {
  interface Window {
    __blackHoleGpuProfile?: () => GpuProfileSummary;
  }
}

test.describe('optimization 08B-3A — segmented GPU profile', () => {
  test.describe.configure({ mode: 'serial', timeout: 1_800_000 });

  test(`records ${profileLabel} ray, bloom, and post timings`, async ({ browser }) => {
    const results: ProfileResult[] = [];
    let environment: Record<string, unknown> | undefined;

    for (const { view, time } of compositions) {
      for (const quality of qualities) {
        const context = await browser.newContext({
          baseURL,
          colorScheme: 'dark',
          deviceScaleFactor: 1,
          locale: 'en-US',
          reducedMotion: 'reduce',
          viewport: { width: 480, height: 270 },
        });
        const page = await context.newPage();

        await page.goto(
          `/?profile=1&q=${quality}&cam=${view}&time=${time}`,
          { waitUntil: 'domcontentloaded', timeout: 180_000 },
        );
        const root = page.locator('html');
        await expect(root).toHaveAttribute('data-render-ready', 'true', {
          timeout: 180_000,
        });
        await expect(root).toHaveAttribute(
          'data-gpu-profiler',
          /^(ready|unsupported)$/,
          { timeout: 90_000 },
        );

        const pageResult = await page.evaluate(() => {
          const canvas = document.querySelector<HTMLCanvasElement>('#scene');
          const gl = canvas?.getContext('webgl2');
          const rendererInfo = gl?.getExtension('WEBGL_debug_renderer_info');

          return {
            renderSize: document.documentElement.dataset.renderSize,
            renderer: gl && rendererInfo
              ? gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL)
              : gl?.getParameter(gl.RENDERER) ?? null,
            summary: window.__blackHoleGpuProfile?.(),
            vendor: gl && rendererInfo
              ? gl.getParameter(rendererInfo.UNMASKED_VENDOR_WEBGL)
              : gl?.getParameter(gl.VENDOR) ?? null,
          };
        });

        expect(pageResult.summary).toBeDefined();
        const summary = pageResult.summary!;

        if (summary.status === 'ready') {
          expect(summary.sampleCount).toBeGreaterThanOrEqual(5);
          expect(summary.passes.ray?.medianMs).toBeGreaterThan(0);
          expect(summary.passes.bloom?.medianMs).toBeGreaterThan(0);
          expect(summary.passes.post?.medianMs).toBeGreaterThan(0);
          expect(summary.total?.medianMs).toBeGreaterThan(0);
        }

        environment ??= {
          browserVersion: browser.version(),
          nodeArchitecture: process.arch,
          nodePlatform: process.platform,
          renderer: pageResult.renderer,
          vendor: pageResult.vendor,
        };
        results.push({
          quality,
          renderSize: pageResult.renderSize,
          summary,
          time,
          view,
        });

        await context.close();
      }
    }

    await mkdir(outputDirectory, { recursive: true });
    await writeFile(
      path.join(outputDirectory, `gpu-profile-${profileLabel}.json`),
      `${JSON.stringify({ environment, results }, null, 2)}\n`,
      'utf8',
    );
  });
});
