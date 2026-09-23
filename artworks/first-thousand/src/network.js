// Spatial demonstration links. No follower-to-follower relationships are inferred.
const EMPTY_FROZEN = Object.freeze([]);
const MAX_STEP = 0.1;
const TARGET_DEGREE = 6;

function assertSide(side) {
  if (!Number.isFinite(side) || side <= 0) throw new RangeError('Cube side must be positive and finite');
}

function assertHub(count, hubIndex) {
  if (!Number.isInteger(hubIndex) || hubIndex < -1 || hubIndex >= count) {
    throw new RangeError('Hub index must be -1 or an existing node index');
  }
}

export function wrapCoordinate(value, side) {
  assertSide(side);
  if (!Number.isFinite(value)) throw new RangeError('Coordinate must be finite');
  return ((value + side / 2) % side + side) % side - side / 2;
}

export function nearestImage(value, reference, side) {
  if (!Number.isFinite(reference)) throw new RangeError('Reference must be finite');
  return reference + wrapCoordinate(value - reference, side);
}

function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildLinks(positions, count, hubIndex = -1) {
  assertHub(count, hubIndex);
  const degrees = new Uint32Array(count);
  const neighbors = Array.from({ length: count }, () => new Set());
  const edges = [];
  const friendCount = count - (hubIndex >= 0 ? 1 : 0);
  const finish = () => {
    // The author is a separate connection layer, outside the friends' degree cap.
    if (hubIndex >= 0) {
      for (let member = 0; member < count; member++) {
        if (member === hubIndex) continue;
        edges.push(Math.min(member, hubIndex), Math.max(member, hubIndex));
        degrees[member]++;
        degrees[hubIndex]++;
      }
    }
    return { links: Uint32Array.from(edges), degrees };
  };
  const add = (a, b) => {
    if (a === b || neighbors[a].has(b) || degrees[a] >= TARGET_DEGREE || degrees[b] >= TARGET_DEGREE) return;
    neighbors[a].add(b);
    neighbors[b].add(a);
    degrees[a]++;
    degrees[b]++;
    edges.push(Math.min(a, b), Math.max(a, b));
  };

  if (friendCount <= 4) {
    for (let a = 0; a < count; a++) {
      if (a === hubIndex) continue;
      for (let b = a + 1; b < count; b++) if (b !== hubIndex) add(a, b);
    }
    return finish();
  }

  // A nearest-neighbor tour keeps the guaranteed connections predominantly local.
  // Joining both next neighbors on this tour gives every member degree four,
  // including isolated points and odd collection sizes, without unbounded hubs.
  const order = new Uint32Array(friendCount);
  const visited = new Uint8Array(count);
  if (hubIndex >= 0) visited[hubIndex] = 1;
  let current = hubIndex === 0 ? 1 : 0;
  for (let at = 0; at < friendCount; at++) {
    order[at] = current;
    visited[current] = 1;
    if (at === friendCount - 1) break;
    const offset = current * 3;
    const x = positions[offset], y = positions[offset + 1], z = positions[offset + 2];
    let closest = -1, distance = Infinity;
    for (let candidate = 0; candidate < count; candidate++) {
      if (visited[candidate]) continue;
      const p = candidate * 3;
      const dx = positions[p] - x, dy = positions[p + 1] - y, dz = positions[p + 2] - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < distance) { distance = d; closest = candidate; }
    }
    current = closest;
  }
  for (let i = 0; i < friendCount; i++) {
    add(order[i], order[(i + 1) % friendCount]);
    add(order[i], order[(i + 2) % friendCount]);
  }

  // Fill spare capacity with nearest available neighbors; check both endpoints.
  for (let a = 0; a < count; a++) {
    if (a === hubIndex) continue;
    const offset = a * 3;
    const x = positions[offset], y = positions[offset + 1], z = positions[offset + 2];
    while (degrees[a] < TARGET_DEGREE) {
      let closest = -1, distance = Infinity;
      for (let b = 0; b < count; b++) {
        if (b === hubIndex || a === b || degrees[b] >= TARGET_DEGREE || neighbors[a].has(b)) continue;
        const p = b * 3;
        const dx = positions[p] - x, dy = positions[p + 1] - y, dz = positions[p + 2] - z;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < distance) { distance = d; closest = b; }
      }
      if (closest < 0) break;
      add(a, closest);
    }
  }
  return finish();
}

export function createNetwork(count, side = 48, hubIndex = -1) {
  if (!Number.isInteger(count) || count < 0) throw new RangeError('Node count must be a nonnegative integer');
  assertSide(side);
  assertHub(count, hubIndex);
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const random = seededRandom(0xF17E2027);
  const half = side / 2;

  for (let i = 0; i < count; i++) {
    const p = i * 3;
    for (let axis = 0; axis < 3; axis++) positions[p + axis] = (random() - 0.5) * side;
    let x = random() * 2 - 1, y = random() * 2 - 1, z = random() * 2 - 1;
    const length = Math.hypot(x, y, z);
    if (length < 1e-8) { x = 1; y = 0; z = 0; }
    const speed = (0.3 + random() * 0.4) * (side / 48) / (length < 1e-8 ? 1 : length);
    velocities[p] = x * speed;
    velocities[p + 1] = y * speed;
    velocities[p + 2] = z * speed;
  }

  const network = {
    positions,
    velocities,
    side,
    hubIndex,
    ...buildLinks(positions, count, hubIndex),
    // Long tab suspension must not teleport the graph when animation resumes.
    step(dt, frozenIndices = EMPTY_FROZEN) {
      if (!Number.isFinite(dt) || dt <= 0) return 0;
      const elapsed = Math.min(dt, MAX_STEP);
      const frozenSet = frozenIndices instanceof Set;
      for (let i = 0; i < count; i++) {
        if (frozenSet ? frozenIndices.has(i) : frozenIndices.includes(i)) continue;
        for (let axis = 0; axis < 3; axis++) {
          const p = i * 3 + axis;
          let next = positions[p] + velocities[p] * elapsed;
          if (next > half) { next = side - next; velocities[p] = -Math.abs(velocities[p]); }
          else if (next < -half) { next = -side - next; velocities[p] = Math.abs(velocities[p]); }
          positions[p] = next;
        }
      }
      return elapsed;
    },
    // The renderer must read network.links again after rebuilding: arrays replace.
    rebuildLinks() {
      const graph = buildLinks(positions, count, hubIndex);
      network.links = graph.links;
      network.degrees = graph.degrees;
      return graph.links;
    },
  };
  return network;
}
