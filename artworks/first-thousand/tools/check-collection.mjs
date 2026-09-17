import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = new URL('../public/', import.meta.url);
const data = JSON.parse(readFileSync(new URL('people.json', root), 'utf8'));
assert.ok(data.count >= 1000 && data.count <= 2240, 'Unexpected collection size.');
assert.equal(data.originalCount, 995);
assert.equal(data.schemaVersion, 2);
assert.notEqual(data.preview, true, 'Preview snapshots cannot be published.');
assert.equal(createHash('sha256').update(data.people.slice(0,995).map(p=>p.handle.toLowerCase()).join('\n')).digest('hex'), '43116afa71784ce46bcad80b2a1060e221307f58e8e060fe8a7eb3dfeaf1dfd8', 'Original cohort changed.');
assert.equal(data.layoutCapacity, 2240);
assert.equal(data.omittedSlots, data.layoutCapacity - data.count);
assert.equal(data.people.length, data.count);
assert.equal(new Set(data.people.map(p => p.handle.toLowerCase())).size, data.count);
assert.equal(data.atlasColumns, 48);
assert.equal(data.atlasRows, Math.ceil(data.count / data.atlasColumns));
assert.ok(Number.isFinite(Date.parse(data.capturedAt)));
for (const person of data.people) {
  assert.match(person.handle, /^[A-Za-z0-9_]{1,15}$/);
  assert.equal(person.profileUrl, `https://x.com/${person.handle}`);
  assert.equal(typeof person.displayName, 'string');
  assert.ok(person.displayName.length > 0);
  assert.equal(typeof person.bio, 'string');
  assert.ok(['available', 'empty', 'unavailable'].includes(person.bioStatus));
  assert.equal(person.bioStatus === 'available', person.bio.length > 0);
  assert.ok([undefined, 'profile', 'default', 'unavailable'].includes(person.avatarStatus));
}
assert.deepEqual(data.atlases.map(atlas=>atlas.tileSize).sort((a,b)=>a-b), [32,64,128]);
for (const atlas of data.atlases) {
  assert.match(atlas.sha256, /^[a-f0-9]{64}$/);
  assert.equal(atlas.file, `portraits-${atlas.sha256.slice(0,16)}.webp`);
  assert.equal(atlas.width, data.atlasColumns * atlas.tileSize);
  assert.equal(atlas.height, data.atlasRows * atlas.tileSize);
  const file = new URL(atlas.file, root);
  assert.equal(statSync(file).size, atlas.bytes);
  assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'), atlas.sha256, 'Atlas does not match the manifest.');
}
assert.ok(data.atlases.some(atlas=>Math.max(atlas.width,atlas.height)<=2048));
console.log(`Verified ${data.count} unique accounts, original cohort and ${data.atlases.length} content-verified atlas sizes. Overview omits ${data.omittedSlots} spare outer positions; exploration fills them.`);
