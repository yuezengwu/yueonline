import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadAssets } from '../src/assets.js';

function browserFixture(t) {
  const bytes = new Map(), dimensions = new Map(), urls = new Map(), requests = [];
  const digest = value => createHash('sha256').update(value).digest('hex');
  const asset = (prefix, payload, width, height, extra = {}) => {
    const data = Buffer.from(payload), sha256 = digest(data);
    const file = `${prefix}-${sha256.slice(0, 16)}.webp`;
    bytes.set(file, data); dimensions.set(data.toString('hex'), [width, height]);
    return { file, bytes: data.length, sha256, width, height, ...extra };
  };
  const people = Array.from({ length: 1000 }, (_, i) => ({ handle: `person_${i}`, displayName: `Person ${i}`, profileUrl: `https://x.com/person_${i}`, bio: '', bioStatus: 'empty' }));
  const data = { schemaVersion: 2, count: people.length, originalCount: 995, layoutCapacity: 4280, atlasColumns: 64, atlasRows: 16, people,
    atlases: [64, 32, 16].map(size => asset('portraits', `atlas${size}`, 64 * size, 16 * size, { tileSize: size })),
    portraits: people.map((_, index) => asset('portrait', `person${index}`, 128, 128)) };
  const failures = new Set(), corrupt = new Set(), pending = new Set(), draws = [];
  let counter = 0;
  function define(name, value) {
    const prior = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => prior ? Object.defineProperty(globalThis, name, prior) : delete globalThis[name]);
  }
  define('location', { origin: 'https://test.local', pathname: '/visuals/first-thousand' });
  define('innerWidth', 390);
  define('navigator', { connection: { saveData: false } });
  define('Image', class {
    src = ''; naturalWidth = 0; naturalHeight = 0;
    async decode() {
      if (this.src.endsWith('/assets/yue.jpg')) { this.naturalWidth = this.naturalHeight = 144; return; }
      const blob = urls.get(this.src);
      assert.ok(blob, 'image must be decoded from a verified local blob');
      const key = Buffer.from(await blob.arrayBuffer()).toString('hex');
      [this.naturalWidth, this.naturalHeight] = dimensions.get(key);
    }
  });
  define('document', { createElement(type) {
    assert.equal(type, 'canvas');
    return { width: 0, height: 0, getContext() { return { drawImage(...args) { draws.push(args); } }; } };
  } });
  t.mock.method(URL, 'createObjectURL', blob => { const url = `blob:test/${counter++}`; urls.set(url, blob); return url; });
  t.mock.method(URL, 'revokeObjectURL', url => urls.delete(url));
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(String(url).startsWith('https://test.local/visuals/first-thousand/assets/'), 'asset URL must survive a route without trailing slash');
    const name = String(url).split('/').pop(); requests.push(name);
    if (name === 'people.json') { assert.equal(options.cache, 'no-cache'); return Response.json(data); }
    if (pending.has(name)) return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
    if (failures.has(name)) return new Response('', { status: 404 });
    assert.ok(bytes.has(name), `no unexpected resource: ${name}`);
    return new Response(corrupt.has(name) ? Buffer.from('broken') : bytes.get(name));
  });
  return { data, requests, failures, corrupt, pending, urls, draws };
}

test('cold startup skips the large atlas and uses the deployment base without a trailing slash', async t => {
  const f = browserFixture(t), assets = await loadAssets(8192);
  assert.equal(assets.current.atlas.tileSize, 32);
  assert.deepEqual(f.requests, ['people.json', f.data.atlases[1].file]);
  assert.equal(assets.authorImage.src, 'https://test.local/visuals/first-thousand/assets/yue.jpg');
  assets.dispose(); assert.equal(f.urls.size, 0);
});

test('a corrupted startup atlas falls back to 16px and never tries the bigger image', async t => {
  const f = browserFixture(t); f.corrupt.add(f.data.atlases[1].file);
  const assets = await loadAssets(8192);
  assert.equal(assets.current.atlas.tileSize, 16);
  assert.deepEqual(f.requests, ['people.json', f.data.atlases[1].file, f.data.atlases[2].file]);
  assets.dispose();
});

test('refinement replaces and releases the previous shared atlas after consumers update', async t => {
  const f = browserFixture(t), assets = await loadAssets(8192), previous = assets.current;
  let released = false, callbackSawOld = false;
  previous.texture.addEventListener('dispose', () => { released = true; });
  assets.onChange(next => { callbackSawOld = !released && f.urls.has(previous.url); assert.equal(next.atlas.tileSize, 64); });
  await Promise.all([assets.sharpen(), assets.sharpen()]);
  assert.ok(callbackSawOld); assert.ok(released); assert.ok(!f.urls.has(previous.url));
  assert.equal(f.requests.filter(name => name === f.data.atlases[0].file).length, 1);
  assert.equal(f.urls.size, 1); assets.dispose();
});

test('single-person export requests only that portrait and bounds its decoded cache', async t => {
  const f = browserFixture(t), assets = await loadAssets(2048);
  const a = await assets.portrait(999), b = await assets.portrait(999);
  assert.equal(a, b); assert.equal(a.naturalWidth, 128);
  assert.deepEqual(f.requests, ['people.json', f.data.atlases[1].file, f.data.portraits[999].file]);
  for (let index = 0; index < 12; index++) await assets.portrait(index);
  assert.equal(f.urls.size, 9, 'one atlas and at most eight single portraits');
  assert.equal(a.naturalWidth, 128, 'cache eviction must not invalidate a portrait held by an in-flight export');
  assets.dispose(); assert.equal(f.urls.size, 0);
});

test('a missing single portrait falls back to the correct current tile without fetching any atlas', async t => {
  const f = browserFixture(t), assets = await loadAssets(8192);
  f.failures.add(f.data.portraits[999].file);
  const portrait = await assets.portrait(999);
  assert.equal(portrait.width, 32);
  assert.deepEqual(f.draws[0].slice(1, 5), [39 * 32, 15 * 32, 32, 32]);
  assert.deepEqual(f.requests, ['people.json', f.data.atlases[1].file, f.data.portraits[999].file]);
  await assert.rejects(assets.portrait(-1)); await assert.rejects(assets.portrait(1000));
  assets.dispose();
});

test('data saver and GPU limits retain the small usable atlas', async t => {
  const f = browserFixture(t), assets = await loadAssets(2048);
  await assets.sharpen(); assert.equal(assets.current.atlas.tileSize, 32);
  navigator.connection.saveData = true;
  await assets.sharpen(); assert.equal(f.requests.length, 2);
  assets.dispose();
});

test('refinement failure is nonfatal and dispose aborts outstanding refinement', async t => {
  const f = browserFixture(t), assets = await loadAssets(8192);
  f.failures.add(f.data.atlases[0].file);
  await assets.sharpen(); assert.equal(assets.current.atlas.tileSize, 32);
  f.failures.clear(); f.pending.add(f.data.atlases[0].file);
  const update = assets.sharpen(); assets.dispose(); await update;
  assert.equal(f.urls.size, 0);
});
