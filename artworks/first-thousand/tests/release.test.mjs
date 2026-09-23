import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReleaseServer, verifyRelease } from '../tools/verify-release.mjs';

const BASE = '/visuals/first-thousand';
// Real, lossless solid-color WebP fixtures: 1024×256, 2048×512,
// 4096×1024 and 128×128, independent of the production asset builder.
const images = {
  16: 'UklGRi4AAABXRUJQVlA4TCIAAAAv/8M/AAfQmzJ0rP8BgUCyv/cMRfQ/4z//+c9//vOf//wf',
  32: 'UklGRlAAAABXRUJQVlA4TEMAAAAv/8d/AAfQmzJ0rP8BgUCyv/kERfQ/4z//+c9//vOf//znP//5z3/+85///Oc///nPf/7zn//85z//+c9//vOf//zfAA==',
  64: 'UklGRtQAAABXRUJQVlA4TMgAAAAv/8//AAfQmzJ0rP8BIUHi/+9mIvqf8Z///Oc///nPf/7zn//85z//+c9//vOf//znP//5z3/+85///Oc///nPf/7zn//85z//+c9//vOf//znP//5z3/+85///Oc///nPf/7zn//85z//+c9//vOf//znP//5z3/+85///Oc///nPf/7zn//85z//+c9//vOf//znP//5z3/+85///Oc///nPf/7zn//85z//+c9//vOf//znP//5z3/+85///Oc///nPf/7vAQ==',
  portrait: 'UklGRiQAAABXRUJQVlA4TBcAAAAvf8AfAAfQmzJ0rP9hABLC//9KRP9T/wA=',
};
const cache = value => [{ key: 'Cache-Control', value }];
const config = {
  async rewrites() { return [{ source: BASE, destination: `${BASE}/index.html` }]; },
  async headers() { return [
    { source: `${BASE}/assets/:path*`, headers: cache('public, max-age=31536000, immutable') },
    ...['people.json', 'yue.jpg', 'THIRD_PARTY_LICENSES.txt'].map(file => ({ source: `${BASE}/assets/${file}`, headers: cache('public, max-age=0, must-revalidate') })),
  ]; },
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'first-thousand-release-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'assets'));
  const write = (file, data) => writeFile(join(directory, file), data);
  const atlases = [];
  for (const tileSize of [16, 32, 64]) {
    const bytes = Buffer.from(images[tileSize], 'base64'), sha256 = hash(bytes), file = `portraits-${sha256.slice(0, 16)}.webp`;
    await write(`assets/${file}`, bytes);
    atlases.push({ file, bytes: bytes.length, sha256, width: 64 * tileSize, height: 16 * tileSize, tileSize });
  }
  const bytes = Buffer.from(images.portrait, 'base64'), sha256 = hash(bytes), file = `portrait-${sha256.slice(0, 16)}.webp`;
  await write(`assets/${file}`, bytes);
  const data = { schemaVersion: 2, count: 1000, layoutCapacity: 4280, atlasColumns: 64, atlasRows: 16, atlases,
    people: Array.from({ length: 1000 }, (_, i) => ({ handle: `fixture_${i}` })),
    portraits: Array.from({ length: 1000 }, () => ({ file, bytes: bytes.length, sha256, width: 128, height: 128 })),
  };
  const save = () => write('assets/people.json', JSON.stringify(data));
  await save();
  await write('index.html', `<html><link rel="stylesheet" href="${BASE}/assets/style.css"><img src="${BASE}/assets/yue.jpg"><script type="module" src="${BASE}/assets/main.js"></script></html>`);
  await write('assets/main.js', `const base=()=>new URL('${BASE}/assets/', location.origin);fetch(new URL('people.json',base()));new Worker(new URL('./worker.js', '' + import.meta.url),{type:'module'});`);
  await write('assets/worker.js', `import {answer} from './worker-dependency.js';self.onmessage=()=>self.postMessage(answer);`);
  await write('assets/worker-dependency.js', 'export const answer=42;');
  await write('assets/style.css', 'html{background:black}');
  await write('assets/yue.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  await write('assets/THIRD_PARTY_LICENSES.txt', 'Fixture license');
  return { directory, data, write, save, options: { directory, config } };
}

test('final-output verifier follows a module worker dependency and serves the exact no-slash route with declared caching', async t => {
  const f = await fixture(t), result = await verifyRelease(f.options);
  assert.equal(result.count, 1000);
  assert.deepEqual(result.workers, [`${BASE}/assets/worker.js`]);
  assert.ok(result.modules.includes(`${BASE}/assets/worker-dependency.js`));
  assert.equal(result.uniquePortraits, 1, 'Content-deduplicated portraits must remain valid');
});

test('a missing single-person portrait fails final-output verification even when all display atlases exist', async t => {
  const f = await fixture(t);
  await rm(join(f.directory, 'assets', f.data.portraits[999].file));
  await assert.rejects(verifyRelease(f.options), /Missing release resource:.*portrait-/);
});

test('a missing transitive worker dependency fails even when the worker entry exists', async t => {
  const f = await fixture(t);
  await rm(join(f.directory, 'assets/worker-dependency.js'));
  await assert.rejects(verifyRelease(f.options), /Missing release resource:.*worker-dependency/);
});

test('a missing image referenced by emitted CSS fails instead of being hidden by a successful HTML load', async t => {
  const f = await fixture(t);
  await f.write('assets/style.css', '.avatar{background-image:url("./missing-face.webp")}');
  await assert.rejects(verifyRelease(f.options), /Missing release resource:.*missing-face.webp/);
});

test('relative document resource URLs fail under the actual no-trailing-slash address', async t => {
  const f = await fixture(t);
  await f.write('assets/main.js', `fetch('./assets/people.json');new Worker(new URL('./worker.js',import.meta.url),{type:'module'});`);
  await assert.rejects(verifyRelease(f.options), /Resource escapes the artwork route: \/visuals\/assets\/people.json/);
});

test('referenced image corruption fails by content hash, independently of manifest metadata', async t => {
  const f = await fixture(t), file = join(f.directory, 'assets', f.data.portraits[0].file);
  const bytes = await readFile(file); bytes[bytes.length - 1] ^= 1; await writeFile(file, bytes);
  await assert.rejects(verifyRelease(f.options), /Image hash mismatch/);
});

test('an immutable rule that overrides manifest revalidation fails cache verification', async t => {
  const f = await fixture(t);
  const bad = { ...config, headers: async () => [...await config.headers(), { source: `${BASE}/assets/:path*`, headers: cache('public, max-age=31536000, immutable') }] };
  await assert.rejects(verifyRelease({ ...f.options, config: bad }), /manifest must revalidate/);
});

test('HTTP headers must match the reviewed configuration, not merely the files on disk', async t => {
  const f = await fixture(t);
  const bad = { ...config, headers: async () => (await config.headers()).map(rule => rule.source.endsWith('people.json') ? { ...rule, headers: cache('public, max-age=31536000, immutable') } : rule) };
  const service = await createReleaseServer({ directory: f.directory, config: bad });
  t.after(() => service.close());
  await assert.rejects(verifyRelease({ ...f.options, origin: service.origin }), /HTTP cache differs.*people.json/);
});

test('oversized startup assets fail even when their filenames, dimensions and hashes are internally valid', async t => {
  const f = await fixture(t), atlas = f.data.atlases.find(a => a.tileSize === 16), old = join(f.directory, 'assets', atlas.file);
  const image = await readFile(old), junk = Buffer.alloc(1024 * 1024 + 8);
  junk.write('JUNK'); junk.writeUInt32LE(junk.length - 8, 4);
  const enlarged = Buffer.concat([image, junk]); enlarged.writeUInt32LE(enlarged.length - 8, 4);
  await rm(old); atlas.bytes = enlarged.length; atlas.sha256 = hash(enlarged); atlas.file = `portraits-${atlas.sha256.slice(0, 16)}.webp`;
  await f.write(`assets/${atlas.file}`, enlarged); await f.save();
  await assert.rejects(verifyRelease(f.options), /exceeds release transfer budget: 16px/);
});

test('unreferenced old giant atlases cannot silently remain in the deployment output', async t => {
  const f = await fixture(t);
  await f.write('assets/portraits-unused-old.webp', Buffer.from(images[64], 'base64'));
  await assert.rejects(verifyRelease(f.options), /Unreferenced portrait image leaked/);
});
