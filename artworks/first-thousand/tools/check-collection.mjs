import { readFileSync, statSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { validateCollection } from '../src/collection.js';
import { LAYOUT_CAPACITY } from '../src/original-layout.js';

const root = new URL('../public/assets/', import.meta.url);
assert.ok(lstatSync(root).isDirectory() && !lstatSync(root).isSymbolicLink(), 'Release assets must be an independent directory.');
const data = validateCollection(JSON.parse(readFileSync(new URL('people.json', root), 'utf8')), LAYOUT_CAPACITY);
assert.notEqual(data.preview, true, 'Preview snapshots cannot be published.');
assert.equal(createHash('sha256').update(data.people.slice(0,995).map(p=>p.handle.toLowerCase()).join('\n')).digest('hex'), '43116afa71784ce46bcad80b2a1060e221307f58e8e060fe8a7eb3dfeaf1dfd8', 'Original cohort changed.');
assert.equal(data.omittedSlots, LAYOUT_CAPACITY - data.count);
assert.equal(data.atlasColumns, 64);
assert.ok(Number.isFinite(Date.parse(data.capturedAt)));
assert.deepEqual(data.atlases.map(atlas=>atlas.tileSize).sort((a,b)=>a-b), [16,32,64]);
assert.ok(data.atlases.some(atlas=>Math.max(atlas.width,atlas.height)<=2048));
assert.ok(Array.isArray(data.portraits) && data.portraits.length === data.count, 'Every account must have an on-demand portrait.');
assert.equal(data.delivery?.schemaVersion, 1);
assert.match(data.delivery.sourceManifestSha256, /^[a-f0-9]{64}$/);
assert.match(data.delivery.sourceAtlasSha256, /^[a-f0-9]{64}$/);
assert.equal(data.delivery.atlasEncoding, 'lossy-webp');
assert.equal(data.delivery.portraitEncoding, 'lossless-webp');

const verified = new Map();
function verifyFile(item, prefix) {
  assert.match(item.sha256, /^[a-f0-9]{64}$/);
  assert.equal(item.file, `${prefix}-${item.sha256.slice(0,16)}.webp`);
  assert.ok(Number.isInteger(item.bytes) && item.bytes > 0);
  const file = new URL(item.file, root);
  assert.ok(!lstatSync(file).isSymbolicLink(), 'Release images must be physical files.');
  assert.equal(statSync(file).size, item.bytes);
  if (!verified.has(item.file)) verified.set(item.file, createHash('sha256').update(readFileSync(file)).digest('hex'));
  assert.equal(verified.get(item.file), item.sha256, `${item.file} does not match the manifest.`);
}
for (const atlas of data.atlases) {
  assert.equal(atlas.width, data.atlasColumns * atlas.tileSize);
  assert.equal(atlas.height, data.atlasRows * atlas.tileSize);
  verifyFile(atlas, 'portraits');
}
for (const portrait of data.portraits) {
  assert.equal(portrait.width, 128);
  assert.equal(portrait.height, 128);
  verifyFile(portrait, 'portrait');
}
assert.ok(statSync(new URL('yue.jpg', root)).size > 0);
assert.ok(statSync(new URL('THIRD_PARTY_LICENSES.txt', root)).size > 0);
console.log(`Verified ${data.count} unique accounts, original cohort, ${data.atlases.length} delivery atlases and ${data.portraits.length} on-demand portraits (${verified.size} unique image files). Overview omits ${data.omittedSlots} spare outer positions; exploration fills them.`);
