import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frameRate = 30;
const width = 1920;
const height = 1080;
const bitRate = 48_000_000;
const baseUrl = process.env.GARGANTUA_RECORD_URL
  ?? 'http://127.0.0.1:4173';
const toolDirectory = path.dirname(fileURLToPath(import.meta.url));
const websiteDirectory = path.resolve(toolDirectory, '../../..');
const version = process.env.GARGANTUA_RECORD_VERSION ?? 'v2';
const outputDirectory = process.env.GARGANTUA_RECORD_OUTPUT
  ?? path.resolve(
    websiteDirectory,
    `../../.runtime/website/gargantua-demo/${version}`,
  );

const shotProfiles = {
  v1: [
    {
      duration: 4.2,
      end: {
        azimuth: 219,
        distance: 43,
        fov: 52,
        inclination: 28,
        time: 15.6,
      },
      name: '01-deep-solitude',
      start: {
        azimuth: 215,
        distance: 52,
        fov: 52,
        inclination: 28,
        time: 11.4,
      },
    },
    {
      duration: 5,
      end: {
        azimuth: 44,
        distance: 22.5,
        fov: 44,
        inclination: 38,
        time: 7,
      },
      name: '02-hero-orbit',
      start: {
        azimuth: 30,
        distance: 24,
        fov: 44,
        inclination: 38,
        time: 2,
      },
    },
    {
      duration: 4.5,
      end: {
        azimuth: 48,
        distance: 18,
        fov: 34,
        inclination: 7,
        time: 6.9,
      },
      name: '03-critical-graze',
      start: {
        azimuth: 42,
        distance: 18,
        fov: 34,
        inclination: 3.5,
        time: 2.4,
      },
    },
    {
      duration: 5.2,
      end: {
        azimuth: -18,
        distance: 21,
        fov: 38,
        inclination: 63,
        time: 11.4,
      },
      name: '04-lensing-crown',
      start: {
        azimuth: -24,
        distance: 19.5,
        fov: 38,
        inclination: 53,
        time: 6.2,
      },
    },
  ],
  v2: [
    {
      duration: 4.2,
      end: {
        azimuth: 221,
        distance: 35,
        fov: 52,
        inclination: 31,
        time: 15.6,
      },
      name: '01-deep-solitude',
      start: {
        azimuth: 215,
        distance: 56,
        fov: 52,
        inclination: 26,
        time: 11.4,
      },
    },
    {
      duration: 5,
      end: {
        azimuth: 36,
        distance: 22,
        fov: 44,
        inclination: 44,
        time: 7,
      },
      name: '02-hero-orbit',
      start: {
        azimuth: 30,
        distance: 26,
        fov: 44,
        inclination: 28,
        time: 2,
      },
    },
    {
      duration: 4.5,
      end: {
        azimuth: 45,
        distance: 17.5,
        fov: 34,
        inclination: 13,
        time: 6.9,
      },
      name: '03-critical-graze',
      start: {
        azimuth: 42,
        distance: 19,
        fov: 34,
        inclination: 1.5,
        time: 2.4,
      },
    },
    {
      duration: 5.2,
      end: {
        azimuth: -20,
        distance: 23,
        fov: 38,
        inclination: 72,
        time: 11.4,
      },
      name: '04-lensing-crown',
      start: {
        azimuth: -24,
        distance: 21,
        fov: 38,
        inclination: 45,
        time: 6.2,
      },
    },
  ],
};

const shots = shotProfiles[version];

if (!shots) {
  throw new Error(`Unknown recording version: ${version}`);
}

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  args: [
    '--disable-gpu-sandbox',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--use-angle=metal',
  ],
  headless: true,
});

try {
  const context = await browser.newContext({
    acceptDownloads: true,
    colorScheme: 'dark',
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    viewport: { height, width },
  });
  const page = await context.newPage();

  page.on('console', (message) => {
    if (message.type() === 'error') {
      console.error(`[browser] ${message.text()}`);
    }
  });

  for (const shot of shots) {
    const target = `${baseUrl}/?record=1&q=cinematic&cam=poster&time=0`;
    await page.goto(target, {
      timeout: 120_000,
      waitUntil: 'domcontentloaded',
    });
    await page.locator('html[data-render-ready="true"]').waitFor({
      timeout: 120_000,
    });
    await page.waitForFunction(() => Boolean(window.__gargantuaRecording), null, {
      timeout: 30_000,
    });

    await page.evaluate((initialFrame) => {
      window.__gargantuaRecording.setFrame(initialFrame);
      document.querySelector('.screen-fx')?.setAttribute('hidden', '');
    }, shot.start);
    await page.waitForTimeout(500);

    const mimeType = await page.evaluate(async ({ bitRate, frameRate }) => {
      const canvas = document.querySelector('#scene');
      const candidates = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
      ];
      const selectedMimeType = candidates.find((candidate) => (
        MediaRecorder.isTypeSupported(candidate)
      ));

      if (!(canvas instanceof HTMLCanvasElement) || !selectedMimeType) {
        throw new Error('Canvas recording is unavailable.');
      }

      const stream = canvas.captureStream(frameRate);
      const chunks = [];
      const recorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
        videoBitsPerSecond: bitRate,
      });

      window.__stopGargantuaRecording = () => new Promise((resolve, reject) => {
        recorder.addEventListener('error', () => {
          reject(recorder.error ?? new Error('MediaRecorder failed.'));
        }, { once: true });
        recorder.addEventListener('stop', () => {
          const blob = new Blob(chunks, { type: selectedMimeType });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.download = 'clip.webm';
          anchor.href = url;
          anchor.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
          resolve();
        }, { once: true });
        recorder.stop();
      });

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      });

      await new Promise((resolve) => {
        recorder.addEventListener('start', resolve, { once: true });
        recorder.start(250);
      });

      return selectedMimeType;
    }, { bitRate, frameRate });

    console.log(`recording ${shot.name} (${shot.duration.toFixed(1)}s, ${mimeType})`);

    await page.evaluate(({ duration, end, start, version }) => new Promise((resolve) => {
      const startedAt = performance.now();
      const interpolate = (from, to, amount) => from + (to - from) * amount;
      const ease = version === 'v2'
        ? (amount) => (1 - Math.cos(Math.PI * amount)) / 2
        : (amount) => (amount < 0.5
          ? 4 * amount * amount * amount
          : 1 - Math.pow(-2 * amount + 2, 3) / 2
        );

      const animate = (now) => {
        const progress = Math.min((now - startedAt) / (duration * 1_000), 1);
        const easedProgress = ease(progress);
        window.__gargantuaRecording.setFrame({
          azimuth: interpolate(start.azimuth, end.azimuth, easedProgress),
          distance: interpolate(start.distance, end.distance, easedProgress),
          fov: interpolate(start.fov, end.fov, easedProgress),
          inclination: interpolate(
            start.inclination,
            end.inclination,
            easedProgress,
          ),
          time: interpolate(start.time, end.time, progress),
        });

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };

      requestAnimationFrame(animate);
    }), { ...shot, version });

    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
    await page.evaluate(() => window.__stopGargantuaRecording());
    const download = await downloadPromise;
    const outputPath = path.join(outputDirectory, `${shot.name}.webm`);
    await download.saveAs(outputPath);
    console.log(`saved ${outputPath}`);
  }

  await context.close();
} finally {
  await browser.close();
}

console.log(JSON.stringify({
  frameRate,
  height,
  outputDirectory,
  shots: shots.map(({ duration, name }) => ({ duration, name })),
  version,
  width,
}, null, 2));
