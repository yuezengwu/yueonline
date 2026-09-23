import { buildLinks } from './network.js';

// Spatial demonstration links only; rebuilding off-thread keeps motion smooth.
self.onmessage = ({ data: { id, positions, count, hubIndex = -1 } }) => {
  const { links, degrees } = buildLinks(new Float32Array(positions), count, hubIndex);
  self.postMessage({ id, links, degrees }, { transfer: [links.buffer, degrees.buffer] });
};
