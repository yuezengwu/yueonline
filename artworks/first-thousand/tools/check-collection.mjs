import { readFileSync, statSync } from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../public/', import.meta.url);
const data = JSON.parse(readFileSync(new URL('people.json', root), 'utf8'));
assert.ok(data.count >= 900 && data.count <= 1000, 'Unexpected collection size.');
assert.equal(data.layoutCapacity, 1000);
assert.equal(data.omittedSlots, 1000 - data.count);
assert.equal(data.people.length, data.count);
assert.equal(new Set(data.people.map(p => p.handle.toLowerCase())).size, data.count);
assert.equal(data.atlasColumns, 32);
assert.equal(data.atlasRows, 32);
assert.ok(Number.isFinite(Date.parse(data.capturedAt)));
for (const person of data.people) {
  assert.match(person.handle, /^[A-Za-z0-9_]{1,15}$/);
  assert.equal(person.profileUrl, `https://x.com/${person.handle}`);
  assert.equal(typeof person.displayName, 'string');
  assert.ok(person.displayName.length > 0);
  assert.equal(typeof person.bio, 'string');
  assert.ok(['available', 'empty', 'unavailable'].includes(person.bioStatus));
  assert.equal(person.bioStatus === 'available', person.bio.length > 0);
}
assert.ok(statSync(new URL('portraits.webp', root)).size > 100_000);
console.log(`Verified ${data.count} unique profile records; ${data.omittedSlots} unavailable slots have no placeholder.`);
