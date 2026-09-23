import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { buildLinks, createNetwork, nearestImage, wrapCoordinate } from '../src/network.js';
import { createAvatarWaves } from '../src/avatar-waves.js';

function assertGraph(network, count, hubIndex = -1) {
  assert.ok(network.links instanceof Uint32Array);
  assert.ok(network.degrees instanceof Uint32Array);
  assert.equal(network.links.length % 2, 0);
  const measured = new Uint32Array(count);
  const unique = new Set();
  for (let i = 0; i < network.links.length; i += 2) {
    const a = network.links[i], b = network.links[i + 1];
    assert.ok(a >= 0 && a < count && b >= 0 && b < count);
    assert.ok(a < b, 'Canonical edge endpoints exclude self connections');
    const key = `${a}:${b}`;
    assert.ok(!unique.has(key), 'Undirected edges must not repeat');
    unique.add(key);
    measured[a]++;
    measured[b]++;
  }
  assert.deepEqual(measured, network.degrees);
  for (let member = 0; member < count; member++) {
    const degree = measured[member];
    if (hubIndex < 0) {
      assert.ok(degree >= Math.min(3, count - 1) && degree <= Math.min(10, count - 1));
    } else if (member === hubIndex) {
      assert.equal(degree, count - 1, 'The author connects to every other member without overflow');
    } else {
      assert.ok(unique.has(`${Math.min(member, hubIndex)}:${Math.max(member, hubIndex)}`));
      assert.ok(degree >= Math.min(4, count - 2) + 1 && degree <= Math.min(6, count - 2) + 1,
        'Friends retain their bounded local graph plus one author connection');
    }
  }
}

test('all 2,027 real collection slots have unique bounded positions and 3–10 connections', () => {
  const started = performance.now();
  const network = createNetwork(2027);
  const built = performance.now();
  assert.ok(network.positions instanceof Float32Array);
  assert.ok(network.velocities instanceof Float32Array);
  assert.equal(network.positions.length, 2027 * 3);
  const positions = new Set();
  for (let i = 0; i < 2027; i++) positions.add(Array.from(network.positions.subarray(i * 3, i * 3 + 3)).join(','));
  assert.equal(positions.size, 2027);
  for (const p of network.positions) assert.ok(p >= -24 && p <= 24);
  assertGraph(network, 2027);

  const duplicate = createNetwork(2027);
  assert.deepEqual(network.positions, duplicate.positions);
  assert.deepEqual(network.velocities, duplicate.velocities);
  assert.deepEqual(network.links, duplicate.links);

  // A global random graph has cube-scale lengths; our typical edges stay local.
  const lengths = [];
  for (let i = 0; i < network.links.length; i += 2) {
    const a = network.links[i] * 3, b = network.links[i + 1] * 3;
    lengths.push(Math.hypot(...[0, 1, 2].map(axis => network.positions[a + axis] - network.positions[b + axis])));
  }
  lengths.sort((a, b) => a - b);
  assert.ok(lengths[Math.floor(lengths.length * 0.9)] < network.side / 4, 'At least 90% of links remain local');

  network.step(0.1);
  const rebuildStarted = performance.now();
  const links = network.rebuildLinks();
  const rebuilt = performance.now();
  assert.equal(links, network.links);
  assertGraph(network, 2027);
  console.log(`2027 nodes: build ${(built - started).toFixed(1)} ms; rebuild ${(rebuilt - rebuildStarted).toFixed(1)} ms; ${links.length / 2} edges; p90 distance ${lengths[Math.floor(lengths.length * 0.9)].toFixed(2)}`);
});

test('reflection keeps moving nodes inside the cube and freezes selected/hovered nodes', () => {
  const network = createNetwork(2027);
  const frozen = [0, 2026];
  const before = frozen.map(index => network.positions.slice(index * 3, index * 3 + 3));
  for (let step = 0; step < 1800; step++) network.step(step % 3 === 0 ? 10 : 1 / 30, frozen);
  frozen.forEach((index, i) => assert.deepEqual(network.positions.slice(index * 3, index * 3 + 3), before[i]));
  for (const p of network.positions) assert.ok(Number.isFinite(p) && p >= -24 && p <= 24);
  network.rebuildLinks();
  assertGraph(network, 2027);

  network.positions[3] = 23.999;
  network.velocities[3] = 1;
  network.step(0.1, new Set(frozen));
  assert.ok(network.positions[3] < 24 && network.velocities[3] < 0);
  network.positions[4] = -23.999;
  network.velocities[4] = -1;
  network.step(0.1);
  assert.ok(network.positions[4] > -24 && network.velocities[4] > 0);

  const snapshot = network.positions.slice();
  for (const dt of [0, -1, NaN, Infinity]) assert.equal(network.step(dt), 0);
  assert.deepEqual(network.positions, snapshot);
  assert.equal(network.step(3600), 0.1);
});

test('periodic helpers preserve translation identities and nearest image distance', () => {
  const side = 48;
  assert.equal(wrapCoordinate(24, side), -24);
  assert.equal(wrapCoordinate(-24, side), -24);
  assert.equal(nearestImage(-23, 23, side), 25);
  assert.equal(nearestImage(23, -23, side), -25);
  for (const value of [-1080.25, -72, -24, -0.2, 0, 23.999, 24, 1791.3]) {
    const wrapped = wrapCoordinate(value, side);
    assert.ok(wrapped >= -side / 2 && wrapped < side / 2);
    for (let multiple = -20; multiple <= 20; multiple++) {
      assert.ok(Math.abs(wrapCoordinate(value + multiple * side, side) - wrapped) < 1e-9);
    }
    for (const reference of [-1000, -26, 0, 25, 1024]) {
      const nearest = nearestImage(value, reference, side);
      assert.ok(Math.abs(nearest - reference) <= side / 2);
      assert.ok(Math.abs((nearest - value) / side - Math.round((nearest - value) / side)) < 1e-9);
      assert.ok(Math.abs(nearestImage(value, reference + side, side) - nearest - side) < 1e-9);
    }
  }
});

test('tiny collections use every possible neighbor and invalid input is rejected', () => {
  for (let count = 0; count <= 12; count++) {
    const network = createNetwork(count, 12);
    assertGraph(network, count);
    network.step(1 / 60);
    network.rebuildLinks();
    assertGraph(network, count);
    if (count < 4) assert.equal(network.links.length / 2, Math.max(0, count * (count - 1) / 2));
  }
  for (const count of [-1, 0.5, NaN]) assert.throws(() => createNetwork(count), RangeError);
  for (const side of [0, -10, Infinity, NaN]) assert.throws(() => createNetwork(4, side), RangeError);
});

test('2,028 members include one moving author connected to every friend, including author index zero', () => {
  const count = 2028;
  const ordinaryNetwork = createNetwork(count);
  for (const hubIndex of [2027, 0]) {
    const network = createNetwork(count, 48, hubIndex);
    const hubOffset = hubIndex * 3;
    assert.equal(network.hubIndex, hubIndex);
    assert.deepEqual(network.positions, ordinaryNetwork.positions, 'Author has the same initial distribution as ordinary nodes');
    assert.deepEqual(network.velocities, ordinaryNetwork.velocities, 'Author has the same movement as ordinary nodes');
    const authorBefore = network.positions.slice(hubOffset, hubOffset + 3);
    assertGraph(network, count, hubIndex);

    const friend = hubIndex === 0 ? 1 : 0;
    const before = network.positions.slice(friend * 3, friend * 3 + 3);
    for (let step = 0; step < 600; step++) network.step(1 / 30);
    assert.notDeepEqual(network.positions.slice(friend * 3, friend * 3 + 3), before);
    assert.notDeepEqual(network.positions.slice(hubOffset, hubOffset + 3), authorBefore);
    for (const position of network.positions) assert.ok(position >= -24 && position <= 24);
    assert.equal(network.rebuildLinks(), network.links);
    assertGraph(network, count, hubIndex);

    const authorFrozen = network.positions.slice(hubOffset, hubOffset + 3);
    network.step(0.1, [hubIndex]);
    network.step(0.1, new Set([hubIndex]));
    assert.deepEqual(network.positions.slice(hubOffset, hubOffset + 3), authorFrozen,
      'Selected or hovered author freezes using the same rules as other nodes');
    network.step(0.1);
    assert.notDeepEqual(network.positions.slice(hubOffset, hubOffset + 3), authorFrozen);

    network.positions[hubOffset] = 23.999;
    network.velocities[hubOffset] = 1;
    network.step(0.1);
    assert.ok(network.positions[hubOffset] < 24 && network.velocities[hubOffset] < 0,
      'Author reflects at the same cube boundary as other nodes');
    network.rebuildLinks();
    assertGraph(network, count, hubIndex);
  }
});

test('3,500 friends plus the author retain complete bounded connections, selection and avatar waves after rebuilding', () => {
  const friendCount = 3500, count = friendCount + 1, hubIndex = friendCount;
  const started = performance.now();
  const network = createNetwork(count, 48, hubIndex);
  const built = performance.now();
  assert.equal(network.positions.length, count * 3);
  assert.equal(network.velocities.length, count * 3);
  const positions = new Set();
  for (let index = 0; index < count; index++) positions.add(network.positions.slice(index * 3, index * 3 + 3).join(','));
  assert.equal(positions.size, count);
  assertGraph(network, count, hubIndex);

  const selected = friendCount - 1;
  const selectedBefore = network.positions.slice(selected * 3, selected * 3 + 3);
  const authorBefore = network.positions.slice(hubIndex * 3, hubIndex * 3 + 3);
  const waves = createAvatarWaves(count, network.links);
  const stepStarted = performance.now();
  for (let step = 0; step < 120; step++) {
    network.step(1 / 60, [selected]);
    waves.step(1 / 60);
    assert.ok(waves.values.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
    assert.ok(waves.trails.every(trail => trail.from >= 0 && trail.from < count && trail.to >= 0 && trail.to < count));
  }
  const stepped = performance.now();
  assert.equal(waves.values.length, count);
  assert.deepEqual(network.positions.slice(selected * 3, selected * 3 + 3), selectedBefore);
  assert.notDeepEqual(network.positions.slice(hubIndex * 3, hubIndex * 3 + 3), authorBefore);
  for (const value of network.positions) assert.ok(Number.isFinite(value) && value >= -24 && value <= 24);
  const rebuildStarted = performance.now();
  network.rebuildLinks();
  const rebuilt = performance.now();
  assertGraph(network, count, hubIndex);
  waves.setLinks(network.links);
  waves.step(1 / 60);
  const edges = new Set();
  for (let i = 0; i < network.links.length; i += 2) edges.add(`${network.links[i]}:${network.links[i + 1]}`);
  for (const trail of waves.trails) assert.ok(edges.has(`${Math.min(trail.from, trail.to)}:${Math.max(trail.from, trail.to)}`));
  console.log(`${count} nodes: build ${(built - started).toFixed(1)} ms; rebuild ${(rebuilt - rebuildStarted).toFixed(1)} ms; 120 motion/wave steps with checks ${(stepped - stepStarted).toFixed(1)} ms; ${network.links.length / 2} edges; author degree ${network.degrees[hubIndex]}`);
});

test('author is fully excluded from friend graph construction', () => {
  const count = 85, hubIndex = 32;
  const network = createNetwork(count, 48, hubIndex);
  const memberIds = Array.from({ length: count }, (_, i) => i).filter(i => i !== hubIndex);
  const friendPositions = Float32Array.from(memberIds.flatMap(i => Array.from(network.positions.subarray(i * 3, i * 3 + 3))));
  const friendsOnly = buildLinks(friendPositions, count - 1);
  const expectedFriendEdges = Array.from(friendsOnly.links, i => memberIds[i]);
  const actualFriendEdges = [];
  for (let i = 0; i < network.links.length; i += 2) {
    if (network.links[i] !== hubIndex && network.links[i + 1] !== hubIndex) {
      actualFriendEdges.push(network.links[i], network.links[i + 1]);
    }
  }
  assert.deepEqual(actualFriendEdges, expectedFriendEdges);
  assert.deepEqual(buildLinks(network.positions, count, hubIndex), {
    links: network.links,
    degrees: network.degrees,
  });
});

test('author hub handles singleton and tiny collections and rejects invalid indices', () => {
  assertGraph(createNetwork(0), 0);
  for (let count = 1; count <= 12; count++) {
    for (let hubIndex = 0; hubIndex < count; hubIndex++) {
      const network = createNetwork(count, 12, hubIndex);
      assertGraph(network, count, hubIndex);
      const authorBefore = network.positions.slice(hubIndex * 3, hubIndex * 3 + 3);
      network.step(1 / 60, new Set([count - 1]));
      network.rebuildLinks();
      assertGraph(network, count, hubIndex);
      const authorAfter = network.positions.slice(hubIndex * 3, hubIndex * 3 + 3);
      if (hubIndex === count - 1) assert.deepEqual(authorAfter, authorBefore);
      else assert.notDeepEqual(authorAfter, authorBefore);
      if (count <= 5) assert.equal(network.links.length / 2, count * (count - 1) / 2);
    }
  }
  for (const hubIndex of [-2, 0.5, 4, NaN, Infinity]) {
    assert.throws(() => createNetwork(4, 48, hubIndex), RangeError);
    assert.throws(() => buildLinks(new Float32Array(12), 4, hubIndex), RangeError);
  }
  assert.throws(() => createNetwork(0, 48, 0), RangeError);
});
