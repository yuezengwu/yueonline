import { expect, test } from '@playwright/test';
import path from 'node:path';

const renderTimeout = 120_000;
const currentArtworkDirectory = path.resolve(
  process.cwd(),
  'artworks/gargantua/artwork/current',
);

async function waitForShot(page: import('@playwright/test').Page): Promise<void> {
  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-render-ready', 'true', {
    timeout: renderTimeout,
  });
  await expect(root).toHaveAttribute('data-shot-ready', 'true', {
    timeout: renderTimeout,
  });
}

test.describe('optimization 08B — minimal artwork regression', () => {
  test.describe.configure({ mode: 'serial' });

  test('the production surface contains only artwork and failure recovery', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.setViewportSize({ width: 1200, height: 750 });
    await page.goto('/?shot=1&q=standard&cam=poster&time=0', {
      waitUntil: 'domcontentloaded',
    });
    await waitForShot(page);

    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-ui-mode', 'art');
    await expect(root).toHaveAttribute('data-palette-mode', 'observational');
    await expect(root).toHaveAttribute('data-flow-mode', 'trails');
    await expect(root).toHaveAttribute('data-sky-mode', 'deepfield');
    await expect(root).toHaveAttribute('data-sky-source', 'precomputed-cube');
    await expect(root).toHaveAttribute('data-sky-cube-size', '512');
    await expect(root).toHaveAttribute('data-sky-cube-fallback', 'none');
    await expect(root).toHaveAttribute('data-quality', 'standard');
    await expect(root).toHaveAttribute('data-quality-source', 'query');
    await expect(root).toHaveAttribute('data-adaptive-resolution', 'locked');
    await expect(root).toHaveAttribute('data-resolution-level', '0');
    await expect(root).toHaveAttribute('data-resolution-scale', '1.00');
    await expect(root).toHaveAttribute('data-steps', '200');
    await expect(root).toHaveAttribute('data-view', 'poster');
    await expect(root).toHaveAttribute('data-simulation-time', '0.000');
    await expect(root).toHaveAttribute('data-render-size', '1200x750');
    await expect(page.locator('#app > *')).toHaveCount(3);
    await expect(page.locator('#scene')).toBeVisible();
    await expect(page.locator('.screen-fx')).toBeHidden();
    await expect(page.locator('#site-return')).toBeHidden();
    await expect(page.locator('#error-overlay')).toBeHidden();
    await expect(page.locator('#hud, #parameters, #intro, #render-status')).toHaveCount(0);

    expect(await root.getAttribute('data-render-error')).toBeNull();
    expect(pageErrors).toEqual([]);
  });

  test('the personal-site route exposes one minimal return affordance', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 500 });
    await page.goto('/visuals/gargantua?q=standard&cam=poster&time=0', {
      waitUntil: 'domcontentloaded',
    });

    const root = page.locator('html');
    const siteReturn = page.locator('#site-return');
    await expect(root).toHaveAttribute('data-render-ready', 'true', {
      timeout: renderTimeout,
    });
    await expect(root).toHaveAttribute('data-website-entry', 'true');
    await expect(siteReturn).toBeVisible();
    await expect(siteReturn).toHaveClass(/\bback\b/);
    await expect(siteReturn).toHaveText('← 岳增五');
    await expect(siteReturn).toHaveCSS('color', 'rgb(160, 160, 160)');
    await expect(siteReturn).toHaveCSS('font-size', '14px');
    await expect(siteReturn).toHaveCSS('line-height', '20px');
    await expect(siteReturn).toHaveCSS('text-underline-offset', '2.5px');
    await expect(siteReturn).toHaveAttribute('href', '/');

    await siteReturn.hover();
    await expect(siteReturn).toHaveCSS('color', 'rgb(229, 229, 229)');
    await expect(siteReturn).toHaveCSS(
      'text-decoration-color',
      'rgb(160, 160, 160)',
    );
    await expect(page.locator('#app > *')).toHaveCount(3);
  });

  test('removed legacy parameters no longer reactivate old product modes', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 500 });
    await page.goto(
      '/?ui=replica&palette=replica&flow=replica&sky=replica&view=edge&quality=cinematic&ctime=9&intro=1&hud=1&nocine=1&capture=1&shot=1&q=standard&cam=poster&time=0',
      { waitUntil: 'domcontentloaded' },
    );
    await waitForShot(page);

    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-ui-mode', 'art');
    await expect(root).toHaveAttribute('data-palette-mode', 'observational');
    await expect(root).toHaveAttribute('data-flow-mode', 'trails');
    await expect(root).toHaveAttribute('data-sky-mode', 'deepfield');
    await expect(root).toHaveAttribute('data-quality', 'standard');
    await expect(root).toHaveAttribute('data-view', 'poster');
    await expect(root).toHaveAttribute('data-simulation-time', '0.000');
    await expect(page.locator('#hud, #parameters, #intro')).toHaveCount(0);
  });

  test('the artwork keeps playing and direct manipulation remains available', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 500 });
    await page.goto('/?cam=poster&time=0', {
      waitUntil: 'domcontentloaded',
    });

    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-render-ready', 'true', {
      timeout: renderTimeout,
    });
    await expect(page.locator('.screen-fx')).toBeVisible();
    await expect(root).toHaveAttribute('data-quality-source', 'adaptive');
    await expect(root).toHaveAttribute('data-adaptive-resolution', 'enabled');
    await expect(root).toHaveAttribute('data-resolution-level', /^[0-2]$/);
    await expect(root).toHaveAttribute('data-resolution-scale', /^(1\.00|0\.85|0\.70)$/);

    const startingTime = Number(await root.getAttribute('data-simulation-time'));
    await expect.poll(async () => (
      Number(await root.getAttribute('data-simulation-time'))
    )).toBeGreaterThan(startingTime);

    const startingDistance = Number(await root.getAttribute('data-camera-distance'));
    await page.mouse.move(400, 250);
    await page.mouse.wheel(0, -420);
    await expect.poll(async () => Math.abs(
      Number(await root.getAttribute('data-camera-distance')) - startingDistance,
    )).toBeGreaterThan(0.05);

    const startingInclination = Number(
      await root.getAttribute('data-camera-inclination'),
    );
    await page.mouse.move(400, 250);
    await page.mouse.down();
    await page.mouse.move(520, 150, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => Math.abs(
      Number(await root.getAttribute('data-camera-inclination'))
      - startingInclination,
    )).toBeGreaterThan(0.05);
    await expect(root).toHaveAttribute('data-view', 'custom');
  });

  const compositions = [
    {
      distance: '18.000',
      file: 'critical-graze.png',
      fov: '34.000',
      inclination: '4.500',
      time: 2.4,
      view: 'grazing',
    },
    {
      distance: '20.000',
      file: 'lensing-crown.png',
      fov: '38.000',
      inclination: '58.000',
      time: 6.2,
      view: 'crown',
    },
    {
      distance: '52.000',
      file: 'deep-solitude.png',
      fov: '52.000',
      inclination: '28.000',
      time: 11.4,
      view: 'solitude',
    },
  ] as const;

  for (const composition of compositions) {
    test(`${composition.view} remains pixel-reproducible`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));

      await page.setViewportSize({ width: 1440, height: 810 });
      await page.goto(
        `/?shot=1&q=high&cam=${composition.view}&time=${composition.time}`,
        { waitUntil: 'domcontentloaded' },
      );
      await waitForShot(page);

      const root = page.locator('html');
      await expect(root).toHaveAttribute('data-quality', 'high');
      await expect(root).toHaveAttribute('data-sky-source', 'precomputed-cube');
      await expect(root).toHaveAttribute('data-sky-cube-size', '1024');
      await expect(root).toHaveAttribute('data-sky-cube-fallback', 'none');
      await expect(root).toHaveAttribute('data-view', composition.view);
      await expect(root).toHaveAttribute('data-camera-distance', composition.distance);
      await expect(root).toHaveAttribute(
        'data-camera-inclination',
        composition.inclination,
      );
      await expect(root).toHaveAttribute('data-camera-fov', composition.fov);
      await expect(root).toHaveAttribute(
        'data-simulation-time',
        composition.time.toFixed(3),
      );
      await expect(page.locator('#app > *')).toHaveCount(3);
      await expect(page.locator('#error-overlay')).toBeHidden();

      expect(await root.getAttribute('data-render-error')).toBeNull();
      expect(pageErrors).toEqual([]);

      await page.screenshot({
        animations: 'disabled',
        path: path.resolve(currentArtworkDirectory, composition.file),
      });
    });
  }
});
