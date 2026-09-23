import assert from 'node:assert/strict';
import test from 'node:test';
import { createAvatarWaves } from '../src/avatar-waves.js';

function ring(count) {
  return Uint32Array.from(Array.from({ length: count }, (_, i) => [i, (i + 1) % count]).flat());
}
const snapshot = waves => ({ values: Array.from(waves.values), trails: structuredClone(waves.trails) });

test('waves stay sparse, smooth, and travel exclusively over graph edges', () => {
  const count = 2027;
  const waves = createAvatarWaves(count, ring(count));
  const values = waves.values, trails = waves.trails;
  let litSamples = 0, sampleCount = 0, travellingSamples = 0;
  let previous = values.slice();
  for (let frame = 0; frame < 7200; frame++) {
    waves.step(1 / 60);
    assert.equal(waves.values, values);
    assert.equal(waves.trails, trails);
    assert.ok(trails.length <= 16);
    let visible = 0;
    for (let i = 0; i < count; i++) {
      assert.ok(values[i] >= 0 && values[i] <= 1);
      assert.ok(Math.abs(values[i] - previous[i]) < 0.06, 'A face must fade without a brightness jump');
      if (values[i] > 0.2) visible++;
    }
    assert.ok(visible <= 48, 'At most 48 faces can be visible at once');
    for (const trail of trails) {
      assert.ok(Math.abs(trail.from - trail.to) === 1 || Math.abs(trail.from - trail.to) === count - 1);
      assert.ok(trail.progress >= 0 && trail.progress <= 1);
      assert.ok(trail.strength >= 0 && trail.strength <= 1);
    }
    if (frame > 300) { litSamples += visible; sampleCount++; travellingSamples += trails.length; }
    previous = values.slice();
  }
  const average = litSamples / sampleCount;
  assert.ok(average >= 20 && average <= 48, `Expected sparse overlapping faces, got ${average.toFixed(1)}`);
  assert.ok(travellingSamples / sampleCount >= 6, 'Several independent waves should be moving');
});

test('zero, negative, and non-finite time preserve every animation state', () => {
  const waves = createAvatarWaves(50, ring(50));
  for (let i = 0; i < 20; i++) waves.step(0.05);
  const before = snapshot(waves);
  for (const dt of [0, -1, NaN, Infinity, -Infinity, undefined]) assert.equal(waves.step(dt), 0);
  assert.deepEqual(snapshot(waves), before);
  assert.equal(waves.step(3600), 0.1, 'Tab resumption must not fast-forward the waves');
});

test('graph replacements immediately discard obsolete trails and use new edges', () => {
  const waves = createAvatarWaves(60, ring(60));
  for (let i = 0; i < 20; i++) waves.step(0.05);
  assert.ok(waves.trails.length > 0);
  const before = waves.values.slice();
  waves.setLinks([]);
  assert.equal(waves.trails.length, 0);
  assert.deepEqual(waves.values, before, 'Graph refresh must leave existing fades intact');
  for (let i = 0; i < 30; i++) {
    waves.step(0.1);
    assert.equal(waves.trails.length, 0);
  }
  waves.setLinks(Uint32Array.from(Array.from({ length: 30 }, (_, i) => [i, i + 30]).flat()));
  let sawTrail = false;
  for (let i = 0; i < 100; i++) {
    waves.step(0.1);
    for (const trail of waves.trails) {
      sawTrail = true;
      assert.equal(Math.abs(trail.from - trail.to), 30);
    }
  }
  assert.ok(sawTrail);
});

test('empty and isolated collections remain valid and malformed edges are ignored', () => {
  for (const count of [0, 1, 2]) {
    const waves = createAvatarWaves(count, [-1, 0, 0, 9999, 0, 0, NaN, 1, 0]);
    for (let i = 0; i < 100; i++) waves.step(0.1);
    assert.equal(waves.values.length, count);
    assert.equal(waves.trails.length, 0);
    assert.ok(Array.from(waves.values).every(value => Number.isFinite(value) && value >= 0 && value <= 1));
  }
  assert.throws(() => createAvatarWaves(-1), RangeError);
  assert.throws(() => createAvatarWaves(1.5), RangeError);
});
