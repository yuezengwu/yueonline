import * as THREE from 'three';
import { createNetwork, nearestImage } from './network.js';
import { createPhotoWall } from './photo-wall.js';
import { loadAssets } from './assets.js';
import { createKeepsake } from './keepsake.js';
import { createPeopleSearch } from './people-search.js';
import { createAvatarWaves } from './avatar-waves.js';

const $ = id => document.getElementById(id);
const compact = () => innerWidth <= 700;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = THREE.MathUtils.clamp;
const canvas = $('scene');
const target = new THREE.Vector3();
const right = new THREE.Vector3(), up = new THREE.Vector3(), scratch = new THREE.Vector3();
const projected = new THREE.Vector3(), viewPoint = new THREE.Vector3();
const portraitSize = 1.98;
// Screen diameters in CSS pixels; the GPU and hit testing share these sizes.
const avatarSizes = { overview: 28, depthScale: 600, minimum: 12, maximum: 36, hover: 96, selectedMin: 104, selectedMax: 180 };
let photoWall, assets, peopleSearch, keepsake;
let detailTexture = null, detailGeneration = 0;
let presentation = 'space', wallVisited = false, wallNeedsFocus = false;
let collection, people = [], atlas, atlasImage, authorImage, atlasTexture, authorTexture, authorIndex = -1;
const authorUvScale = new THREE.Vector2(1, 1);
let renderer, scene, camera, network, pointGeometry, pointMaterial;
let lineGeometry, lineColors, linePositions, lineMaterial, cube, selectedPortrait, hoverPortrait, highlightGeometry, highlightPositions;
let ready = false, stopped = false, paused = reducedMotion.matches, frame = 0, lastTime = 0;
let mode = 'overview', yaw = .52, pitch = .24, distance = 100;
let selected = -1, hovered = -1, flight = null, hoverPointer = null, lastHoverTime = 0, graphClock = 0;
let pointers = new Map(), pointerStart = null, dragged = false, previousPinch = 0, previousCenter = null;
let traveled = 0, lastDiagnostics = 0;
let tileCopies = [], visibleTiles = [], linkWorker, pendingGraph = false, graphRequest = 0;
let avatarWaves, waveLines, waveGeometry, wavePositions, waveColors;
let authorGeometry, authorLinePositions, authorLineColors;
const authorWorld = new THREE.Vector3(), authorEndpoint = new THREE.Vector3(), authorDirection = new THREE.Vector3();
let avatarBlend = 0, avatarTarget = 0, hoverScale = 0, selectedScale = 0;
let previousHovered = -1, previousSelected = -1;
const selectedOffset = new THREE.Vector3(), hoverOffset = new THREE.Vector3(), lastPickOffset = new THREE.Vector3();
const frustum = new THREE.Frustum(), projectionView = new THREE.Matrix4(), tileBox = new THREE.Box3();
const tileHalf = new THREE.Vector3(), tileMinimum = new THREE.Vector3(), tileMaximum = new THREE.Vector3();
const requestRender = () => { if (!frame && ready && !stopped && !document.hidden && presentation === 'space') frame = requestAnimationFrame(render); };

function fitDistance() {
  const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
  const horizontal = Math.atan(Math.tan(halfFov) * camera.aspect);
  return network.side * .83 / Math.sin(Math.min(halfFov, horizontal)) * (compact() ? 1.06 : .95);
}
function direction(out = scratch) {
  return out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
}
function updateCamera() {
  camera.position.copy(direction()).multiplyScalar(distance).add(target);
  camera.lookAt(target); camera.updateMatrixWorld();
}
function syncOrbit() {
  scratch.copy(camera.position).sub(target); distance = scratch.length();
  yaw = Math.atan2(scratch.x, scratch.z); pitch = Math.asin(clamp(scratch.y / distance, -1, 1));
}
function updateAtmosphere() {
  const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const fadeFar = (network.side - 2) / Math.sqrt(1 + tangent * tangent * (1 + camera.aspect * camera.aspect));
  camera.far = mode === 'overview' ? 2000 : fadeFar + 2; camera.updateProjectionMatrix();
  scene.fog = mode === 'roam' ? new THREE.Fog('#000000', fadeFar * .45, fadeFar) : null;
  pointMaterial.uniforms.uFade.value.set(fadeFar * .45, fadeFar);
}
function setMode(next) {
  mode = next; avatarTarget = mode === 'roam' ? 1 : 0;
  if (reducedMotion.matches) avatarBlend = avatarTarget;
  cube.visible = mode === 'overview'; updateAtmosphere();
  const label = mode === 'overview' ? '进入空间' : '返回全景';
  $('view-toggle').textContent = label; $('view-toggle').setAttribute('aria-label', label);
  canvas.setAttribute('aria-label', mode === 'overview'
    ? '全景：拖动或方向键旋转，滚轮或捏合缩放，搜索定位朋友'
    : '头像空间：点击查看个人介绍，拖动或方向键无限漫游，滚轮或捏合缩放，Home 返回全景');
  canvas.dataset.mode = mode;
}
function clearSelection() {
  clearDetailPortrait();
  selected = -1; wallNeedsFocus = false; $('wall-author').setAttribute('aria-pressed', 'false'); if (selectedPortrait) selectedPortrait.visible = false; $('profile').hidden = true;
  $('selection-marker').hidden = true; delete canvas.dataset.selected; photoWall?.select(-1);
  requestRender();
  history.replaceState(null, '', location.pathname + location.search);
}
function animateCamera(endCamera, endTarget) {
  if (reducedMotion.matches) {
    camera.position.copy(endCamera); target.copy(endTarget); camera.lookAt(target);
    camera.updateMatrixWorld(); syncOrbit(); flight = null;
  } else {
    flight = { start: performance.now(), fromCamera: camera.position.clone(), fromTarget: target.clone(), endCamera, endTarget };
  }
  requestRender();
}
function interruptFlight() { if (flight) { flight = null; syncOrbit(); } }
function overview() {
  if (!ready) return;
  clearSelection(); hovered = -1; hoverPointer = null; hoverPortrait.visible = false; $('hover-label').hidden = true;
  setMode('overview'); yaw = .52; pitch = .24;
  animateCamera(direction(new THREE.Vector3()).multiplyScalar(fitDistance()), new THREE.Vector3());
}
function zoom(factor) {
  if (!ready) return;
  interruptFlight(); hoverPointer = null; hovered = -1;
  if (mode === 'roam' && distance * factor > 38) { overview(); return; }
  distance = clamp(distance * factor, 3.6, fitDistance() * 1.5);
  if (mode === 'overview' && distance < 38) setMode('roam');
  updateCamera();
  requestRender();
}
function setPresentation(next) {
  if (!ready || !photoWall || next === presentation) return;
  const wall = next === 'wall';
  presentation = next;
  document.body.dataset.view = next; canvas.dataset.view = next;
  $('mode-space').setAttribute('aria-pressed', String(!wall));
  $('mode-wall').setAttribute('aria-pressed', String(wall));
  $('wall-layer').hidden = !wall; $('space-controls').hidden = wall; $('wall-controls').hidden = !wall;
  $('selection-marker').hidden = wall; peopleSearch?.close(); clearSpaceInput();
  hovered = -1; hoverPointer = null; hoverPortrait.visible = false; $('hover-label').hidden = true;
  if (wall) {
    interruptFlight(); cancelAnimationFrame(frame); frame = 0;
    if (!wallVisited) { photoWall.open(selected, { focus: true }); if (selected >= 0) photoWall.locate(selected); }
    else { photoWall.resume(selected); if (wallNeedsFocus && selected >= 0) photoWall.locate(selected); }
    wallVisited = true; wallNeedsFocus = false;
    void assets.sharpen();
  } else {
    photoWall.close(); lastTime = 0; setMode(mode);
    canvas.focus({ preventScroll: true }); requestRender();
  }
  $('announcement').textContent = wall ? '已切换到照片墙' : '已切换到空间';
}
function enterSpace() {
  if (!ready) return;
  setMode('roam');
  animateCamera(direction(new THREE.Vector3()).multiplyScalar(18).add(target), target.clone());
}
function panPixels(dx, dy) {
  interruptFlight();
  const units = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / innerHeight;
  right.setFromMatrixColumn(camera.matrixWorld, 0); up.setFromMatrixColumn(camera.matrixWorld, 1);
  target.addScaledVector(right, -dx * units).addScaledVector(up, dy * units);
  traveled += Math.hypot(dx, dy) * units;
  // Rebase by whole cells to keep GPU coordinates precise after long journeys.
  for (const axis of ['x', 'y', 'z']) if (Math.abs(target[axis]) > network.side * 16) {
    const shift = Math.round(target[axis] / network.side) * network.side;
    target[axis] -= shift; selectedOffset[axis] -= shift; hoverOffset[axis] -= shift;
  }
  updateCamera(); requestRender();
}
function positionFor(index, out = scratch, offset = null) {
  out.fromArray(network.positions, index * 3);
  if (offset) return out.add(offset);
  if (index === selected) return out.add(selectedOffset);
  if (index === hovered) return out.add(hoverOffset);
  if (mode === 'roam') for (const axis of ['x', 'y', 'z']) out[axis] = nearestImage(out[axis], target[axis], network.side);
  return out;
}
function updateDisplayPositions() { pointGeometry.attributes.position.needsUpdate = true; }
function updateTiles() {
  visibleTiles.length = 0;
  if (mode === 'overview') {
    tileCopies.forEach((group, i) => { group.visible = i === 0; if (!i) { group.position.set(0, 0, 0); visibleTiles.push(group.position); } });
    return;
  }
  // A 3x3x3 neighborhood extends at least 48 units from the camera. The
  // depth fade is aspect-adjusted to finish inside that radial distance.
  projectionView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(projectionView);
  const side = network.side, cx = Math.round(camera.position.x / side) * side, cy = Math.round(camera.position.y / side) * side, cz = Math.round(camera.position.z / side) * side;
  tileHalf.setScalar(side / 2); let i = 0;
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    const group = tileCopies[i++]; group.position.set(cx + x * side, cy + y * side, cz + z * side);
    tileMinimum.copy(group.position).sub(tileHalf); tileMaximum.copy(group.position).add(tileHalf); tileBox.set(tileMinimum, tileMaximum);
    group.visible = frustum.intersectsBox(tileBox); if (group.visible) visibleTiles.push(group.position);
  }
}
function screenPoint(index, offset = null) {
  positionFor(index, viewPoint, offset); viewPoint.applyMatrix4(camera.matrixWorldInverse);
  if (viewPoint.z >= -.1) return null;
  positionFor(index, projected, offset); projected.project(camera);
  if (projected.z > 1 || projected.z < -1) return null;
  const unit = innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * -viewPoint.z);
  return { x: (projected.x * .5 + .5) * innerWidth, y: (.5 - projected.y * .5) * innerHeight, depth: -viewPoint.z, unit };
}
function smallPortraitPixels(depth) {
  return clamp(avatarSizes.depthScale / Math.max(1, depth), avatarSizes.minimum, avatarSizes.maximum);
}
function ambientPortraitPixels(index, depth) {
  const pulse = avatarWaves.values[index];
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(3, avatarSizes.overview, pulse), smallPortraitPixels(depth), avatarBlend);
}
function pick(x, y) {
  const candidates = /** @type {Array<[number, THREE.Vector3, boolean]>} */ ([[selected, selectedOffset, true], [hovered, hoverOffset, false]]);
  for (const [index, offset, expanded] of candidates) {
    if (index < 0) continue;
    const p = screenPoint(index, offset), radius = expanded ? selectedPortrait.scale.x * (p?.unit || 0) / 2 : hoverPortrait.scale.x * (p?.unit || 0) / 2;
    if (p && (mode !== 'roam' || p.depth < camera.far - 5) && Math.hypot(x - p.x, y - p.y) <= radius) { lastPickOffset.copy(offset); return index; }
  }
  let best = -1, score = Infinity;
  for (const offset of visibleTiles) for (let i = 0; i < people.length; i++) {
    const p = screenPoint(i, offset); if (!p || (mode === 'roam' && p.depth > camera.far - 5)) continue;
    const d = Math.hypot(x - p.x, y - p.y);
    if (d <= Math.max(8, ambientPortraitPixels(i, p.depth) / 2) && d + p.depth * .006 < score) { best = i; score = d + p.depth * .006; lastPickOffset.copy(offset); }
  }
  return best;
}
function hoverAt(x, y) { hovered = pick(x, y); if (hovered >= 0) hoverOffset.copy(lastPickOffset); }
function updateProfile() {
  const person = people[selected];
  $('wall-author').setAttribute('aria-pressed', String(selected === authorIndex));
  $('profile').hidden = false; $('person-name').textContent = person.displayName;
  $('person-handle').textContent = `@${person.handle}`; $('person-bio').textContent = person.bio || ''; $('person-bio').hidden = !person.bio?.trim();
  /** @type {HTMLAnchorElement} */ ($('person-link')).href = `https://x.com/${encodeURIComponent(person.handle)}`;
  $('avatar-note').hidden = person.avatarStatus !== 'unavailable';
  $('make-photo').hidden = selected === authorIndex;
}
// One selection path owns identity, profile, URL and both renderers' highlight.
// A view may select without moving its camera; search explicitly calls locate.
function selectPerson(index, offset = null) {
  if (!ready || index < 0 || index >= people.length) return;
  const p = new THREE.Vector3().fromArray(network.positions, index * 3);
  if (offset) p.add(offset); else for (const axis of ['x', 'y', 'z']) p[axis] = nearestImage(p[axis], target[axis], network.side);
  selectedOffset.copy(p).sub(scratch.fromArray(network.positions, index * 3));
  selected = index; hovered = -1; hoverPointer = null;
  updateProfile(); canvas.dataset.selected = people[index].handle; photoWall?.select(index);
  void loadDetailPortrait(index);
  history.replaceState(null, '', `${location.pathname}${location.search}#${encodeURIComponent(people[index].handle)}`);
  $('announcement').textContent = `已选中 ${people[index].displayName}，个人介绍位于右下角。`;
  requestRender();
}
function clearDetailPortrait() {
  detailGeneration++;
  if (selectedPortrait) {
    selectedPortrait.material.uniforms.uDetailIndex.value = -1;
    selectedPortrait.material.uniforms.uDetail.value = atlasTexture;
  }
  photoWall?.setPortrait(-1, null);
  detailTexture?.dispose(); detailTexture = null;
}
async function loadDetailPortrait(index) {
  clearDetailPortrait();
  if (index === authorIndex) return;
  const generation = detailGeneration;
  try {
    const image = await assets.portrait(index);
    if (generation !== detailGeneration || selected !== index || stopped) return;
    detailTexture = new THREE.Texture(image);
    detailTexture.colorSpace = THREE.SRGBColorSpace;
    detailTexture.minFilter = THREE.LinearFilter; detailTexture.generateMipmaps = false;
    detailTexture.needsUpdate = true;
    selectedPortrait.material.uniforms.uDetail.value = detailTexture;
    selectedPortrait.material.uniforms.uDetailIndex.value = index;
    photoWall?.setPortrait(index, detailTexture);
    requestRender();
  } catch { /* Selection stays usable with the shared atlas. */ }
}
function openProfile(index) {
  if (index >= 0 && index < people.length) window.open(`https://x.com/${encodeURIComponent(people[index].handle)}`, '_blank', 'noopener,noreferrer');
}
function locate(index, offset = null) {
  if (!ready || index < 0 || index >= people.length) return;
  interruptFlight(); selectPerson(index, offset);
  if (presentation === 'wall') photoWall.locate(index);
  else {
    wallNeedsFocus = true; setMode('roam'); void assets.sharpen();
    const focusTarget = new THREE.Vector3().fromArray(network.positions, index * 3).add(selectedOffset);
    if (compact()) { up.setFromMatrixColumn(camera.matrixWorld, 1); focusTarget.addScaledVector(up, -1.2); }
    animateCamera(direction(new THREE.Vector3()).multiplyScalar(compact() ? 11.4 : 11).add(focusTarget), focusTarget);
  }
  requestRender();
}
function clearSpaceInput() {
  for (const id of pointers.keys()) if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  pointers.clear(); pointerStart = null; previousPinch = 0; previousCenter = null; dragged = false;
}
function pauseActiveView() {
  if (presentation === 'wall') photoWall.pause();
  else { interruptFlight(); clearSpaceInput(); }
  peopleSearch?.close();
}
function updatePortrait(mesh, index, isSelected) {
  mesh.visible = index >= 0;
  if (!mesh.visible) return null;
  const offset = isSelected ? selectedOffset : hoverOffset;
  const p = screenPoint(index, offset);
  if (!p || p.x < -250 || p.x > innerWidth + 250 || p.y < -250 || p.y > innerHeight + 250) { mesh.visible = false; return null; }
  positionFor(index, mesh.position, offset); mesh.quaternion.copy(camera.quaternion);
  const baseSize = ambientPortraitPixels(index, p.depth) / p.unit;
  const expandedSize = isSelected ? clamp(portraitSize * p.unit, avatarSizes.selectedMin, avatarSizes.selectedMax) / p.unit : avatarSizes.hover / p.unit;
  mesh.scale.setScalar(THREE.MathUtils.lerp(baseSize, expandedSize, isSelected ? selectedScale : hoverScale));
  mesh.material.uniforms.uPortrait.value = index; mesh.material.uniforms.uOpacity.value = mode === 'roam' ? clamp((camera.far - 2 - p.depth) / 5, 0, 1) : 1;
  if (mesh.material.uniforms.uOpacity.value <= .01) { mesh.visible = false; return null; }
  return p;
}
function updateAuthorLines() {
  let cursor = 0;
  for (const offset of visibleTiles) {
    // Both ends use their real moving positions in the same periodic cell.
    positionFor(authorIndex, authorWorld, offset);
    const authorPoint = screenPoint(authorIndex, offset);
    const isSelected = selected === authorIndex && selectedOffset.equals(offset);
    const isHovered = hovered === authorIndex && hoverOffset.equals(offset);
    const radius = isSelected ? selectedPortrait.scale.x / 2 : isHovered ? hoverPortrait.scale.x / 2
      : authorPoint ? ambientPortraitPixels(authorIndex, authorPoint.depth) / (2 * authorPoint.unit) : 0;
    for (let i = 0; i < people.length; i++) {
      if (i === authorIndex) continue;
      let fade = 1;
      if (mode === 'roam') {
        const p = screenPoint(i, offset);
        if (!p || p.x < -40 || p.x > innerWidth + 40 || p.y < -40 || p.y > innerHeight + 40) continue;
        const range = pointMaterial.uniforms.uFade.value;
        fade = 1 - THREE.MathUtils.smoothstep(p.depth, range.x, range.y);
        if (fade < .015) continue;
      }
      positionFor(i, authorEndpoint, offset);
      authorDirection.copy(authorEndpoint).sub(authorWorld);
      const length = authorDirection.length();
      if (length <= radius) continue;
      authorDirection.multiplyScalar(radius / length).add(authorWorld);
      authorDirection.toArray(authorLinePositions, cursor); authorEndpoint.toArray(authorLinePositions, cursor + 3);
      const light = (isSelected ? .018 : isHovered ? .012 : .008) * fade;
      for (let axis = 0; axis < 6; axis++) authorLineColors[cursor + axis] = light;
      cursor += 6;
    }
  }
  authorGeometry.setDrawRange(0, cursor / 3);
  // Only the populated prefix changes; unused periodic copies need no upload.
  for (const attribute of [authorGeometry.attributes.position, authorGeometry.attributes.color]) {
    attribute.clearUpdateRanges();
    if (cursor > 0) { attribute.addUpdateRange(0, cursor); attribute.needsUpdate = true; }
  }
  canvas.dataset.authorUploadBytes = String(cursor * Float32Array.BYTES_PER_ELEMENT * 2);
}
function updateWaveLines() {
  let cursor = 0;
  waveLines.visible = mode === 'overview';
  if (!waveLines.visible) return;
  const positions = network.positions;
  for (const trail of avatarWaves.trails) {
    // A short luminous segment travels along the same edge that carries the reveal.
    const tail = Math.max(0, trail.progress - .28), head = trail.progress;
    if (cursor + 6 > wavePositions.length) break;
    for (const t of [tail, head]) {
      for (let axis = 0; axis < 3; axis++) {
        wavePositions[cursor] = THREE.MathUtils.lerp(positions[trail.from * 3 + axis], positions[trail.to * 3 + axis], t);
        waveColors[cursor++] = trail.strength * (t === tail ? .045 : .42);
      }
    }
  }
  waveGeometry.setDrawRange(0, cursor / 3);
  waveGeometry.attributes.position.needsUpdate = true;
  waveGeometry.attributes.color.needsUpdate = true;
}
function updateLines() {
  const edges = network.links, p = network.positions;
  let lineCount = 0;
  for (let k = 0; k < edges.length; k += 2) {
    const a = edges[k], b = edges[k + 1];
    if (a === authorIndex || b === authorIndex) continue;
    const offset = lineCount * 3; lineCount += 2;
    let length2 = 0;
    for (let axis = 0; axis < 3; axis++) {
      linePositions[offset + axis] = p[a * 3 + axis]; linePositions[offset + 3 + axis] = p[b * 3 + axis];
      length2 += (p[a * 3 + axis] - p[b * 3 + axis]) ** 2;
    }
    const light = .006 + .038 * Math.exp(-length2 / 90);
    for (let j = 0; j < 6; j++) lineColors[offset + j] = light;
  }
  let highlightCount = 0;
  const focused = /** @type {Array<[number, THREE.Vector3]>} */ ([[selected, selectedOffset], [hovered, hoverOffset]]);
  for (const [index, offset] of focused) {
    if (index < 0 || index === authorIndex) continue;
    for (let k = 0; k < edges.length; k += 2) {
      if (edges[k] !== index && edges[k + 1] !== index) continue;
      for (const endpoint of [edges[k], edges[k + 1]]) {
        positionFor(endpoint, scratch, offset); scratch.toArray(highlightPositions, highlightCount); highlightCount += 3;
      }
    }
  }
  highlightGeometry.setDrawRange(0, highlightCount / 3); highlightGeometry.attributes.position.needsUpdate = true;
  lineGeometry.setDrawRange(0, lineCount);
  lineGeometry.attributes.position.needsUpdate = true; lineGeometry.attributes.color.needsUpdate = true;
}
function render(now) {
  frame = 0; if (!ready || stopped || presentation !== 'space') return;
  const dt = lastTime ? Math.min((now - lastTime) / 1000, .05) : 0; lastTime = now;
  if (!paused) {
    network.step(dt, [selected, hovered]); avatarWaves.step(dt); graphClock += dt;
    if (graphClock >= 3 && !flight && pointers.size === 0 && linkWorker && !pendingGraph) {
      const positions = network.positions.slice(); pendingGraph = true; graphClock = 0;
      linkWorker.postMessage({ id: ++graphRequest, positions: positions.buffer, count: people.length, hubIndex: authorIndex }, [positions.buffer]);
    }
  }
  const ease = reducedMotion.matches ? 1 : 1 - Math.exp(-dt * 13);
  avatarBlend = THREE.MathUtils.lerp(avatarBlend, avatarTarget, ease);
  if (Math.abs(avatarBlend - avatarTarget) < .001) avatarBlend = avatarTarget;
  if (selected !== previousSelected) { selectedScale = 0; previousSelected = selected; }
  if (hovered !== previousHovered) { hoverScale = 0; previousHovered = hovered; }
  selectedScale = Math.min(1, selectedScale + (reducedMotion.matches ? 1 : dt * 4.5));
  hoverScale = Math.min(1, hoverScale + (reducedMotion.matches ? 1 : dt * 5.5));
  if (flight) {
    const raw = Math.min(1, (now - flight.start) / 1050), t = raw * raw * (3 - 2 * raw);
    camera.position.lerpVectors(flight.fromCamera, flight.endCamera, t); target.lerpVectors(flight.fromTarget, flight.endTarget, t);
    camera.lookAt(target); camera.updateMatrixWorld(); if (raw >= 1) { flight = null; syncOrbit(); }
  }
  updateDisplayPositions(); updateTiles();
  if (hoverPointer && !flight && !pointers.size && now - lastHoverTime > 100) { hoverAt(hoverPointer.x, hoverPointer.y); lastHoverTime = now; }
  const selectedPoint = updatePortrait(selectedPortrait, photoWall?.isOpen() ? -1 : selected, true);
  const hoverPoint = updatePortrait(hoverPortrait, (hovered === selected && hoverOffset.equals(selectedOffset)) ? -1 : hovered, false);
  const marker = $('selection-marker'); marker.hidden = !selectedPoint;
  if (selectedPoint) {
    marker.style.opacity = selectedPortrait.material.uniforms.uOpacity.value; marker.style.left = `${selectedPoint.x}px`; marker.style.top = `${selectedPoint.y}px`;
    marker.style.width = marker.style.height = `${selectedPortrait.scale.x * selectedPoint.unit + 8}px`;
  }
  const label = $('hover-label'); label.hidden = !hoverPoint;
  if (hoverPoint) {
    label.textContent = people[hovered].displayName;
    label.style.left = `${clamp(hoverPoint.x, 100, innerWidth - 100)}px`; label.style.top = `${Math.min(hoverPoint.y + avatarSizes.hover / 2 + 10, innerHeight - 95)}px`;
  }
  pointMaterial.uniforms.uSelected.value = photoWall?.isOpen() ? -1 : selected; pointMaterial.uniforms.uHovered.value = hovered;
  if (selected >= 0) positionFor(selected, pointMaterial.uniforms.uSelectedPosition.value, selectedOffset);
  if (hovered >= 0) positionFor(hovered, pointMaterial.uniforms.uHoveredPosition.value, hoverOffset);
  pointMaterial.uniforms.uDpr.value = renderer.getPixelRatio();
  pointMaterial.uniforms.uAvatarBlend.value = avatarBlend;
  pointGeometry.attributes.aPulse.needsUpdate = true;
  pointMaterial.uniforms.uDepth.value = mode === 'overview' ? distance + network.side : network.side;
  pointMaterial.uniforms.uRoam.value = mode === 'roam' ? 1 : 0;
  updateLines(); updateAuthorLines(); updateWaveLines(); renderer.render(scene, camera);
  if (now - lastDiagnostics > 250 || paused) {
    canvas.dataset.distance = distance.toFixed(2); canvas.dataset.yaw = yaw.toFixed(3);
    canvas.dataset.target = target.toArray().map(v => v.toFixed(2)).join(','); canvas.dataset.traveled = traveled.toFixed(2);
    canvas.dataset.hovered = hovered >= 0 ? people[hovered].handle : '';
    canvas.dataset.avatars = String(mode === 'roam' ? people.length : avatarWaves.values.reduce((count, v) => count + Number(v > .15), 0));
    canvas.dataset.avatarStyle = 'original-circle-white-border';
    canvas.dataset.avatarSize = mode === 'roam' ? `${avatarSizes.minimum}–${avatarSizes.maximum}px` : `3–${avatarSizes.overview}px`;
    canvas.dataset.expandedAvatars = String(Number(selectedPortrait.visible) + Number(hoverPortrait.visible));
    const authorPoint = screenPoint(authorIndex);
    canvas.dataset.authorVisible = String(!!authorPoint && authorPoint.x >= 0 && authorPoint.x <= innerWidth && authorPoint.y >= 0 && authorPoint.y <= innerHeight);
    canvas.dataset.authorScreen = authorPoint ? `${authorPoint.x.toFixed(1)},${authorPoint.y.toFixed(1)}` : '';
    canvas.dataset.authorPulse = avatarWaves.values[authorIndex].toFixed(3);
    canvas.dataset.authorPosition = Array.from(network.positions.subarray(authorIndex * 3, authorIndex * 3 + 3), v => v.toFixed(3)).join(',');
    canvas.dataset.authorConnections = String(network.degrees[authorIndex]);
    canvas.dataset.authorVisibleLines = String(authorGeometry.drawRange.count / 2);
    canvas.dataset.avatarBlend = avatarBlend.toFixed(3);
    canvas.dataset.waveTrails = String(mode === 'overview' ? avatarWaves.trails.length : 0);
    canvas.dataset.waveSample = avatarWaves.values.map((v, i) => v > .5 ? i + 1 : 0).filter(Boolean).slice(0, 8).join(',');
    canvas.dataset.edges = String(network.links.length / 2); canvas.dataset.minDegree = String(Math.min(...network.degrees)); canvas.dataset.maxDegree = String(Math.max(...network.degrees));
    canvas.dataset.motion = paused ? 'paused' : 'running'; canvas.dataset.nodeSample = network.positions.slice(0, 3).join(',');
    canvas.dataset.drawCalls = String(renderer.info.render.calls); canvas.dataset.tiles = String(visibleTiles.length); lastDiagnostics = now;
  }
  if (!paused || flight || avatarBlend !== avatarTarget || (selected >= 0 && selectedScale < 1) || (hovered >= 0 && hoverScale < 1)) requestRender();
}
function createPortrait(texture) {
  const material = new THREE.ShaderMaterial({
    uniforms: { uAtlas: { value: texture }, uDetail: { value: texture }, uDetailIndex: { value: -1 }, uAuthor: { value: authorTexture }, uAuthorIndex: { value: authorIndex }, uAuthorUvScale: { value: authorUvScale }, uGrid: { value: new THREE.Vector2(collection.atlasColumns, collection.atlasRows) }, uOpacity: { value: 1 }, uPortrait: { value: 0 }, uInset: { value: .5 / atlas.tileSize } },
    alphaToCoverage: true, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform sampler2D uAtlas;uniform sampler2D uDetail;uniform float uDetailIndex;uniform sampler2D uAuthor;uniform float uAuthorIndex;uniform vec2 uAuthorUvScale;uniform vec2 uGrid;uniform float uOpacity;uniform float uPortrait;uniform float uInset;varying vec2 vUv;
      void main(){float radius=length(vUv-.5);float alpha=1.-smoothstep(.5-max(fwidth(radius),.001),.5,radius);if(alpha<=0.)discard;
      vec3 color;
      if(abs(uPortrait-uAuthorIndex)<.5){color=texture2D(uAuthor,(vUv-.5)*uAuthorUvScale+.5).rgb;}
      else if(abs(uPortrait-uDetailIndex)<.5){color=texture2D(uDetail,vUv).rgb;}
      else{vec2 cell=vec2(mod(uPortrait,uGrid.x),floor(uPortrait/uGrid.x));vec2 uv=clamp(vUv,uInset,1.-uInset);
      color=texture2D(uAtlas,vec2((cell.x+uv.x)/uGrid.x,(uGrid.y-cell.y-1.+uv.y)/uGrid.y)).rgb;}
      color=mix(color,vec3(1.),smoothstep(.5-2.2*fwidth(radius),.5-1.2*fwidth(radius),radius));
      gl_FragColor=vec4(color,alpha*uOpacity);
      #include <colorspace_fragment>
      }`
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material); mesh.visible = false; mesh.renderOrder = 10; scene.add(mesh); return mesh;
}
function buildSpace(texture) {
  network = createNetwork(people.length, 48, authorIndex);
  avatarWaves = createAvatarWaves(people.length, network.links);
  pointGeometry = new THREE.BufferGeometry();
  pointGeometry.setAttribute('position', new THREE.BufferAttribute(network.positions, 3).setUsage(THREE.DynamicDrawUsage));
  pointGeometry.setAttribute('aId', new THREE.BufferAttribute(Float32Array.from(people, (_, i) => i), 1));
  pointGeometry.setAttribute('aPulse', new THREE.BufferAttribute(avatarWaves.values, 1).setUsage(THREE.DynamicDrawUsage));
  pointMaterial = new THREE.ShaderMaterial({
    uniforms: { uAtlas: { value: texture }, uAuthor: { value: authorTexture }, uAuthorIndex: { value: authorIndex }, uAuthorUvScale: { value: authorUvScale }, uGrid: { value: new THREE.Vector2(collection.atlasColumns, collection.atlasRows) }, uInset: { value: .5 / atlas.tileSize }, uAvatarBlend: { value: 0 }, uSelectedPosition: { value: new THREE.Vector3() }, uHoveredPosition: { value: new THREE.Vector3() }, uFade: { value: new THREE.Vector2(22, 48) }, uRoam: { value: 0 }, uDpr: { value: renderer.getPixelRatio() }, uDepth: { value: 150 }, uSelected: { value: -1 }, uHovered: { value: -1 } },
    transparent: true, depthWrite: false,
    vertexShader: `attribute float aId;attribute float aPulse;uniform vec3 uSelectedPosition;uniform vec3 uHoveredPosition;uniform vec2 uFade;uniform float uRoam;uniform float uDpr;uniform float uDepth;uniform float uSelected;uniform float uHovered;uniform float uAvatarBlend;varying float vAlpha;varying float vReveal;varying float vId;
      void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;
      float smallSize=clamp(${avatarSizes.depthScale.toFixed(1)}/max(1.,-p.z),${avatarSizes.minimum.toFixed(1)},${avatarSizes.maximum.toFixed(1)});
      gl_PointSize=mix(mix(3.,${avatarSizes.overview.toFixed(1)},aPulse),smallSize,uAvatarBlend)*uDpr;
      vId=aId;vReveal=mix(aPulse,1.,uAvatarBlend);vAlpha=.55+.45*(1.-smoothstep(0.,uDepth,-p.z));
      vAlpha*=mix(1.,1.-smoothstep(uFade.x,uFade.y,-p.z),uRoam);vec3 world=(modelMatrix*vec4(position,1.)).xyz;
      if((abs(aId-uSelected)<.5&&distance(world,uSelectedPosition)<.01)||(abs(aId-uHovered)<.5&&distance(world,uHoveredPosition)<.01))vAlpha=0.;}`,
    fragmentShader: `uniform sampler2D uAtlas;uniform sampler2D uAuthor;uniform float uAuthorIndex;uniform vec2 uAuthorUvScale;uniform vec2 uGrid;uniform float uInset;varying float vAlpha;varying float vReveal;varying float vId;
      void main(){float r=length(gl_PointCoord-.5);float aa=max(fwidth(r),.001);if(r>.5||vAlpha<.005)discard;
      vec2 portraitUv=vec2(gl_PointCoord.x,1.-gl_PointCoord.y);vec3 color;
      if(abs(vId-uAuthorIndex)<.5){color=texture2D(uAuthor,(portraitUv-.5)*uAuthorUvScale+.5).rgb;}
      else{vec2 cell=vec2(mod(vId,uGrid.x),floor(vId/uGrid.x));vec2 uv=clamp(portraitUv,uInset,1.-uInset);
      color=texture2D(uAtlas,vec2((cell.x+uv.x)/uGrid.x,(uGrid.y-cell.y-1.+uv.y)/uGrid.y)).rgb;}
      float rim=smoothstep(.5-1.8*aa,.5-.8*aa,r);
      color=mix(color,vec3(1.),rim);
      float reveal=smoothstep(.02,.45,vReveal);
      float alpha=mix(1.-smoothstep(.3,.5,r),(1.-smoothstep(.5-aa,.5,r))*(.35+.65*vReveal),reveal);
      gl_FragColor=vec4(mix(vec3(1.),color,reveal),alpha*vAlpha);
      #include <colorspace_fragment>
      }`
  });
  pointGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), network.side * Math.sqrt(3) / 2);
  linePositions = new Float32Array(people.length * 10 * 3); lineColors = new Float32Array(linePositions.length);
  lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3).setUsage(THREE.DynamicDrawUsage));
  lineGeometry.setAttribute('color', new THREE.BufferAttribute(lineColors, 3).setUsage(THREE.DynamicDrawUsage));
  lineMaterial = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .7, depthWrite: false });
  lineGeometry.boundingSphere = pointGeometry.boundingSphere.clone();
  for (let i = 0; i < 27; i++) {
    const group = new THREE.Group(), points = new THREE.Points(pointGeometry, pointMaterial), lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    points.renderOrder = 1; group.add(lines, points); group.visible = false; tileCopies.push(group); scene.add(group);
  }
  try {
    linkWorker = new Worker(new URL('./graph-worker.js', import.meta.url), { type: 'module' });
    linkWorker.onmessage = ({ data }) => {
      if (data.id !== graphRequest || stopped) return;
      pendingGraph = false; network.links = data.links; network.degrees = data.degrees; avatarWaves.setLinks(network.links);
      if (selected >= 0) updateProfile(); requestRender();
    };
    linkWorker.onerror = () => { linkWorker.terminate(); linkWorker = null; pendingGraph = false; };
  } catch { linkWorker = null; } // Stable initial connections remain usable without workers.
  highlightPositions = new Float32Array(2 * 10 * 2 * 3); highlightGeometry = new THREE.BufferGeometry();
  highlightGeometry.setAttribute('position', new THREE.BufferAttribute(highlightPositions, 3).setUsage(THREE.DynamicDrawUsage)); highlightGeometry.setDrawRange(0, 0);
  const highlightedLines = new THREE.LineSegments(highlightGeometry, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: .5, depthWrite: false }));
  highlightedLines.frustumCulled = false; highlightedLines.renderOrder = 2; scene.add(highlightedLines);
  wavePositions = new Float32Array(64 * 6); waveColors = new Float32Array(wavePositions.length);
  waveGeometry = new THREE.BufferGeometry();
  waveGeometry.setAttribute('position', new THREE.BufferAttribute(wavePositions, 3).setUsage(THREE.DynamicDrawUsage));
  waveGeometry.setAttribute('color', new THREE.BufferAttribute(waveColors, 3).setUsage(THREE.DynamicDrawUsage));
  waveGeometry.setDrawRange(0, 0);
  waveLines = new THREE.LineSegments(waveGeometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .8, depthWrite: false }));
  waveLines.frustumCulled = false; scene.add(waveLines);
  authorLinePositions = new Float32Array((people.length - 1) * 27 * 6); authorLineColors = new Float32Array(authorLinePositions.length);
  authorGeometry = new THREE.BufferGeometry();
  authorGeometry.setAttribute('position', new THREE.BufferAttribute(authorLinePositions, 3).setUsage(THREE.DynamicDrawUsage));
  authorGeometry.setAttribute('color', new THREE.BufferAttribute(authorLineColors, 3).setUsage(THREE.DynamicDrawUsage)); authorGeometry.setDrawRange(0, 0);
  const authorLines = new THREE.LineSegments(authorGeometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .42, depthWrite: false, fog: false }));
  authorLines.frustumCulled = false; scene.add(authorLines);
  const box = new THREE.BoxGeometry(network.side, network.side, network.side);
  cube = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: '#333333', transparent: true, opacity: .7 })); box.dispose(); scene.add(cube);
  selectedPortrait = createPortrait(texture); hoverPortrait = createPortrait(texture); hoverPortrait.renderOrder = 11;
  distance = fitDistance(); updateCamera(); setMode('overview');
  canvas.dataset.count = String(people.length); canvas.dataset.shape = 'cube'; canvas.dataset.connectionType = 'spatial-demo';
  canvas.dataset.authorId = String(authorIndex);
  ready = true; requestRender();
}
$('view-toggle').addEventListener('click', () => mode === 'overview' ? enterSpace() : overview());
$('wall-view-toggle').addEventListener('click', () => { photoWall?.toggleOverview(); canvas.focus({ preventScroll: true }); });
$('wall-author').addEventListener('click', () => selectPerson(authorIndex));
$('wall-author').addEventListener('dblclick', () => openProfile(authorIndex));
$('retry').addEventListener('click', () => location.reload());
$('mode-space').addEventListener('click', () => setPresentation('space'));
$('mode-wall').addEventListener('click', () => setPresentation('wall'));
$('close-profile').addEventListener('click', () => { clearSelection(); requestRender(); });
reducedMotion.addEventListener('change', e => { paused = e.matches; if (flight && e.matches) { camera.position.copy(flight.endCamera); target.copy(flight.endTarget); flight = null; camera.lookAt(target); camera.updateMatrixWorld(); syncOrbit(); } requestRender(); });

canvas.addEventListener('pointerdown', e => {
  if (!ready || presentation !== 'space') return; interruptFlight(); hoverPointer = null;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture(e.pointerId);
  if (pointers.size === 1) { pointerStart = { x: e.clientX, y: e.clientY, rotate: e.altKey || e.button === 2 }; dragged = false; }
  else dragged = true;
  previousPinch = 0; previousCenter = null;
});
canvas.addEventListener('pointermove', e => {
  if (!ready || presentation !== 'space') return;
  if (!pointers.has(e.pointerId)) { if (e.pointerType !== 'touch') { hoverPointer = { x: e.clientX, y: e.clientY }; hoverAt(e.clientX, e.clientY); requestRender(); } return; }
  const old = pointers.get(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size >= 2) {
    const [a, b] = [...pointers.values()], next = Math.hypot(a.x - b.x, a.y - b.y), center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (previousPinch > 0) zoom(previousPinch / next);
    if (previousCenter && mode === 'roam') panPixels(center.x - previousCenter.x, center.y - previousCenter.y);
    previousPinch = next; previousCenter = center; dragged = true; return;
  }
  if (pointerStart && Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y) > 5) dragged = true;
  if (dragged) {
    hovered = -1;
    if (mode === 'overview' || pointerStart?.rotate) {
      yaw -= (e.clientX - old.x) * .005; pitch = clamp(pitch + (e.clientY - old.y) * .005, -1.45, 1.45); updateCamera(); requestRender();
    } else panPixels(e.clientX - old.x, e.clientY - old.y);
  }
});
canvas.addEventListener('pointerup', e => {
  if (!ready || presentation !== 'space') return;
  pointers.delete(e.pointerId);
  if (!dragged && pointerStart && !pointers.size) { const hit = pick(e.clientX, e.clientY); if (hit >= 0) locate(hit, lastPickOffset); else { clearSelection(); hovered = -1; requestRender(); } }
  if (!pointers.size) pointerStart = null;
  previousPinch = 0; previousCenter = null;
});
function cancelSpacePointer(e) {
  if (presentation !== 'space' || !pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId); dragged = true; pointerStart = null; previousPinch = 0; previousCenter = null;
}
canvas.addEventListener('pointercancel', cancelSpacePointer);
canvas.addEventListener('lostpointercapture', cancelSpacePointer);
function cancelSpaceGesture() {
  clearSpaceInput(); hoverPointer = null; hovered = -1; requestRender();
}
addEventListener('blur', cancelSpaceGesture);
canvas.addEventListener('pointerleave', () => { if (presentation !== 'space') return; hoverPointer = null; if (!pointers.size) hovered = -1; requestRender(); });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => {
  if (!ready || presentation !== 'space') return;
  e.preventDefault(); hoverPointer = null; hovered = -1;
  const multiplier = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
  if (mode === 'roam' && e.shiftKey && !e.ctrlKey && !e.metaKey) panPixels(-e.deltaX * multiplier, -e.deltaY * multiplier);
  else zoom(Math.exp(clamp(e.deltaY * multiplier, -120, 120) * .0025));
}, { passive: false });
canvas.addEventListener('keydown', e => {
  if (!ready || presentation !== 'space' || e.isComposing) return;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
    e.preventDefault(); interruptFlight(); hovered = -1; hoverPointer = null;
    if (mode === 'roam') {
      const step = e.shiftKey ? 320 : 85;
      panPixels(e.key === 'ArrowLeft' ? step : e.key === 'ArrowRight' ? -step : 0, e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0);
    } else {
      if (e.key === 'ArrowLeft') yaw -= .12; if (e.key === 'ArrowRight') yaw += .12;
      if (e.key === 'ArrowUp') pitch = clamp(pitch + .1, -1.45, 1.45); if (e.key === 'ArrowDown') pitch = clamp(pitch - .1, -1.45, 1.45);
      updateCamera(); requestRender();
    }
  }
  if (e.key === '+' || e.key === '=') zoom(.8); if (e.key === '-') zoom(1.25);
  if (e.key === 'Home') { e.preventDefault(); overview(); }
  if (e.key === 'Enter' && selected >= 0) { e.preventDefault(); openProfile(selected); }
});
canvas.addEventListener('dblclick', e => {
  if (!ready || presentation !== 'space' || dragged) return;
  const index = pick(e.clientX, e.clientY); if (index >= 0) openProfile(index);
});
canvas.addEventListener('webglcontextlost', e => {
  e.preventDefault(); stopped = true; ready = false; cancelAnimationFrame(frame); frame = 0;
  photoWall?.stop(); peopleSearch?.close(); clearSpaceInput();
  document.querySelectorAll('header button, header input, footer button').forEach(control => { /** @type {HTMLButtonElement | HTMLInputElement} */ (control).disabled = true; });
  $('profile').hidden = true; $('loading').hidden = true; $('error').hidden = false;
  $('error-message').textContent = '画面显示已中断，请重新载入。';
});
canvas.addEventListener('webglcontextrestored', () => location.reload());
document.addEventListener('keydown', e => {
  if (!ready || presentation !== 'space' || /** @type {HTMLDialogElement} */ ($('photo-dialog')).open || e.defaultPrevented || e.isComposing) return;
  if (e.key === 'Escape') {
    $('results').hidden = true;
    clearSelection(); hovered = -1; requestRender();
  }
});
addEventListener('resize', () => {
  if (!renderer) return;
  renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  if (!ready) return;
  updateAtmosphere();
  if (mode === 'overview') { distance = fitDistance(); updateCamera(); }
  if (selected >= 0) updateProfile(); requestRender();
});
document.addEventListener('visibilitychange', () => { lastTime = 0; if (document.hidden) cancelSpaceGesture(); else requestRender(); });
async function start() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight); renderer.setClearColor('#000000');
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(43, innerWidth / innerHeight, .08, 2000);
  assets = await loadAssets(renderer.capabilities.maxTextureSize);
  if (stopped) { assets.dispose(); return; }
  collection = assets.collection; people = [...collection.people];
  ({ atlas, image: atlasImage, texture: atlasTexture } = assets.current);
  ({ authorImage, authorTexture } = assets);
  authorIndex = people.findIndex(person => person.handle.toLowerCase() === 'zengwuy');
  if (authorIndex < 0) {
    authorIndex = people.length;
    people.push({ displayName: '岳增五', handle: 'ZengwuY', profileUrl: 'https://x.com/ZengwuY', bio: '', bioStatus: 'empty', avatarStatus: 'profile' });
  }
  const authorEdge = Math.min(authorImage.naturalWidth, authorImage.naturalHeight);
  authorUvScale.set(authorEdge / authorImage.naturalWidth, authorEdge / authorImage.naturalHeight);
  buildSpace(atlasTexture);
  photoWall = createPhotoWall({ canvas, renderer, collection, atlasTexture, atlas, authorIndex, dedication: $('dedication'),
    onSelect: selectPerson, onClearSelection: clearSelection, onOpenProfile: openProfile,
    onViewChange: ({ overview }) => { $('wall-view-toggle').textContent = overview ? '回到中心' : '看见所有人'; },
    onSharpen: () => assets.sharpen(),
  });
  peopleSearch = createPeopleSearch({ people, collection, atlasImage, authorImage, authorIndex,
    onLocate: index => { locate(index); canvas.focus({ preventScroll: true }); },
    onClearSelection: clearSelection, onFocus: pauseActiveView,
  });
  keepsake = createKeepsake({ selection: () => selected < 0 || selected === authorIndex ? null : { index: selected, person: people[selected] },
    portrait: index => assets.portrait(index), authorImage, pause: pauseActiveView,
    restoreFocus: () => { $('make-photo').focus({ preventScroll: true }); requestRender(); },
  });
  assets.onChange(next => {
    ({ atlas, image: atlasImage, texture: atlasTexture } = next);
    for (const material of [pointMaterial, selectedPortrait.material, hoverPortrait.material]) {
      material.uniforms.uAtlas.value = atlasTexture; material.uniforms.uInset.value = .5 / atlas.tileSize;
      if (material.uniforms.uDetailIndex?.value < 0) material.uniforms.uDetail.value = atlasTexture;
    }
    photoWall.setAtlas(atlasTexture, atlas); peopleSearch.setAtlas(atlasImage); requestRender();
  });
  let initial = ''; try { initial = decodeURIComponent(location.hash.slice(1)); } catch { /* Invalid links open the overview. */ }
  const found = people.findIndex(p => p.handle.toLowerCase() === initial.toLowerCase()); if (found >= 0) locate(found);
  $('loading').hidden = true; document.body.dataset.ready = 'true';
  /** @type {HTMLButtonElement} */ ($('mode-space')).disabled = false;
  /** @type {HTMLButtonElement} */ ($('mode-wall')).disabled = false;
  /** @type {HTMLInputElement} */ ($('search')).disabled = false;
}
start().catch(error => { $('loading').hidden = true; $('error').hidden = false; $('error-message').textContent = `${error.message}，请重新载入。`; console.error(error); });
addEventListener('pagehide', event => {
  if (event.persisted) return;
  stopped = true; linkWorker?.terminate(); cancelAnimationFrame(frame);
  clearDetailPortrait();
  photoWall?.destroy(); peopleSearch?.destroy(); keepsake?.destroy(); assets?.dispose(); scene?.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); }); renderer?.dispose();
});
