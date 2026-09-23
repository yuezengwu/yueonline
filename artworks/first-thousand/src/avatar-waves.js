// A few independent walks reveal faces without lighting the whole collection.
// All travel follows the supplied graph; occasional new roots start a new walk.
/** @param {number} count @param {ArrayLike<number>} links */
export function createAvatarWaves(count, links = []) {
  if (!Number.isInteger(count) || count < 0) throw new RangeError('Node count must be a nonnegative integer');
  const values = new Float32Array(count);
  const trails = [];
  const pulses = new Map();
  const walkers = [];
  let adjacency = Array.from({ length: count }, () => []);
  let edgeSet = new Set();
  let seed = 0xA7A7E5 ^ count;
  const random = () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const edgeKey = (a, b) => Math.min(a, b) * count + Math.max(a, b);
  const smoothstep = value => value * value * (3 - 2 * value);
  const pulseValue = pulse => {
    const age = pulse.age;
    const envelope = age < 0.5 ? smoothstep(age / 0.5)
      : age < 0.9 ? 1 : 1 - smoothstep(Math.min(1, (age - 0.9) / 1.7));
    return pulse.strength * envelope;
  };
  const illuminate = (node, age = 0) => {
    // Keep an existing envelope intact when two walks meet, avoiding flicker.
    if (!pulses.has(node) && pulses.size < 48) pulses.set(node, { age, strength: 0.78 + random() * 0.22 });
  };
  const chooseRoot = () => {
    let node = Math.floor(random() * count);
    for (let attempt = 0; attempt < 20 && pulses.has(node); attempt++) node = Math.floor(random() * count);
    return node;
  };
  const restart = walker => {
    walker.node = chooseRoot();
    walker.previous = -1;
    walker.remaining = 5 + Math.floor(random() * 7);
    walker.delay = 0.32 + random() * 0.2;
    walker.travel = null;
    illuminate(walker.node);
  };
  const refreshTrails = () => {
    trails.length = 0;
    for (const walker of walkers) {
      if (!walker.travel) continue;
      const travel = walker.travel;
      walker.trail.from = walker.node;
      walker.trail.to = travel.to;
      walker.trail.progress = travel.elapsed / travel.duration;
      walker.trail.strength = 0.65 * Math.sin(Math.PI * walker.trail.progress);
      trails.push(walker.trail);
    }
  };

  const waves = {
    // References remain stable; consume these after step() or setLinks().
    values,
    trails,
    /** @param {ArrayLike<number>} nextLinks */
    setLinks(nextLinks = []) {
      adjacency = Array.from({ length: count }, () => []);
      edgeSet = new Set();
      for (let i = 0; i + 1 < nextLinks.length; i += 2) {
        const a = nextLinks[i], b = nextLinks[i + 1];
        if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= count || b >= count || a === b) continue;
        const key = edgeKey(a, b);
        if (edgeSet.has(key)) continue;
        edgeSet.add(key);
        adjacency[a].push(b);
        adjacency[b].push(a);
      }
      for (const walker of walkers) {
        if (walker.travel && !edgeSet.has(edgeKey(walker.node, walker.travel.to))) {
          walker.travel = null;
          walker.delay = 0.1 + random() * 0.25;
        }
      }
      refreshTrails();
    },
    step(dt) {
      if (!Number.isFinite(dt) || dt <= 0) return 0;
      const elapsed = Math.min(dt, 0.1);
      for (const [node, pulse] of pulses) {
        pulse.age += elapsed;
        if (pulse.age >= 2.6) pulses.delete(node);
      }
      for (const walker of walkers) {
        if (walker.travel) {
          walker.travel.elapsed += elapsed;
          if (walker.travel.elapsed >= walker.travel.duration) {
            walker.previous = walker.node;
            walker.node = walker.travel.to;
            walker.travel = null;
            walker.remaining--;
            walker.delay = 0.32 + random() * 0.2;
            illuminate(walker.node);
          }
        } else {
          walker.delay -= elapsed;
          if (walker.delay > 0) continue;
          if (walker.remaining <= 0 || adjacency[walker.node].length === 0) {
            restart(walker);
            // Isolated nodes need no rapid repeated restarts.
            if (adjacency[walker.node].length === 0) walker.delay = 1.8 + random();
            continue;
          }
          const all = adjacency[walker.node];
          const forward = all.filter(node => node !== walker.previous);
          const unlit = forward.filter(node => !pulses.has(node));
          const candidates = unlit.length ? unlit : forward.length ? forward : all;
          walker.travel = {
            to: candidates[Math.floor(random() * candidates.length)],
            elapsed: 0,
            duration: 0.75 + random() * 0.2,
          };
        }
      }
      values.fill(0);
      for (const [node, pulse] of pulses) values[node] = pulseValue(pulse);
      refreshTrails();
      return elapsed;
    },
  };
  waves.setLinks(links);
  for (let i = 0; i < Math.min(16, Math.ceil(count / 3)); i++) {
    const node = chooseRoot();
    illuminate(node, 0.25 + random() * 1.5);
    walkers.push({
      node, previous: -1, remaining: 5 + Math.floor(random() * 7),
      delay: i * 0.16 + random() * 0.3, travel: null,
      trail: { from: node, to: node, progress: 0, strength: 0 },
    });
  }
  for (const [node, pulse] of pulses) values[node] = pulseValue(pulse);
  return waves;
}
