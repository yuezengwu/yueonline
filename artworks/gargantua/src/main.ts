import {
  BufferGeometry,
  Camera,
  Float32BufferAttribute,
  GLSL3,
  LinearSRGBColorSpace,
  Mesh,
  NoToneMapping,
  PerspectiveCamera,
  RawShaderMaterial,
  Scene,
  Vector2,
  Vector3,
  type WebGLCubeRenderTarget,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AdaptiveResolutionController } from './adaptive-resolution';
import { createDeepFieldCube } from './deep-field-cube';
import {
  GpuPassProfiler,
  type GpuPassName,
  type GpuProfileSummary,
} from './gpu-pass-profiler';
import './style.css';
import fullscreenVertexShader from './shaders/fullscreen.vert.glsl?raw';
import postFragmentShader from './shaders/post.frag.glsl?raw';
import postVertexShader from './shaders/post.vert.glsl?raw';
import schwarzschildFragmentShader from './shaders/schwarzschild.frag.glsl?raw';

type QualityTier = 'standard' | 'high' | 'cinematic';
type ViewName = 'poster' | 'grazing' | 'crown' | 'solitude';

interface QualityProfile {
  pixelRatioCap: number;
  steps: number;
}

interface ViewPreset {
  azimuth: number;
  distance: number;
  fov?: number;
  inclination: number;
}

const QUALITY_PROFILES: Record<QualityTier, QualityProfile> = {
  standard: { pixelRatioCap: 1, steps: 200 },
  high: { pixelRatioCap: 1.5, steps: 320 },
  cinematic: { pixelRatioCap: 2, steps: 460 },
};

const VIEW_PRESETS: Record<ViewName, ViewPreset> = {
  poster: { distance: 24, inclination: 38, azimuth: 30 },
  grazing: { distance: 18, inclination: 4.5, azimuth: 42, fov: 34 },
  crown: { distance: 20, inclination: 58, azimuth: -24, fov: 38 },
  solitude: { distance: 52, inclination: 28, azimuth: 215, fov: 52 },
};

const VISUAL = {
  bloomRadius: 0.2,
  bloomStrength: 0.35,
  bloomThreshold: 0.65,
  chromaticAberration: 0.0028,
  fov: 44,
  grain: 0.045,
  maxCameraDistance: 150,
  vignette: 1,
} as const;

const searchParameters = new URLSearchParams(window.location.search);
const shotMode = searchParameters.get('shot') === '1';
const gpuProfilingEnabled = searchParameters.get('profile') === '1';
const requestedQuality = searchParameters.get('q');
const requestedView = searchParameters.get('cam');
const requestedTime = Number.parseFloat(searchParameters.get('time') ?? '0');

function getRequiredElement<ElementType extends Element>(selector: string): ElementType {
  const element = document.querySelector<ElementType>(selector);

  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }

  return element;
}

function isQualityTier(value: string | null): value is QualityTier {
  return value === 'standard' || value === 'high' || value === 'cinematic';
}

function selectInitialQuality(): QualityTier {
  const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const renderPixels = window.innerWidth
    * window.innerHeight
    * devicePixelRatio
    * devicePixelRatio;
  const logicalCores = navigator.hardwareConcurrency || 8;
  const deviceMemory = (
    navigator as Navigator & { deviceMemory?: number }
  ).deviceMemory ?? 8;

  if (logicalCores <= 4 || deviceMemory <= 4 || renderPixels >= 6_000_000) {
    return 'standard';
  }

  if (logicalCores <= 8 || deviceMemory <= 8 || renderPixels >= 2_800_000) {
    return 'high';
  }

  return 'cinematic';
}

function isViewName(value: string | null): value is ViewName {
  return value !== null && Object.hasOwn(VIEW_PRESETS, value);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function sphericalToCartesian(preset: ViewPreset): Vector3 {
  const inclination = preset.inclination * Math.PI / 180;
  const azimuth = preset.azimuth * Math.PI / 180;

  return new Vector3(
    preset.distance * Math.cos(inclination) * Math.sin(azimuth),
    preset.distance * Math.sin(inclination),
    preset.distance * Math.cos(inclination) * Math.cos(azimuth),
  );
}

function createFullscreenTriangle(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute([
      -1, -1, 0,
      3, -1, 0,
      -1, 3, 0,
    ], 3),
  );
  return geometry;
}

const canvas = getRequiredElement<HTMLCanvasElement>('#scene');
const siteReturn = getRequiredElement<HTMLAnchorElement>('#site-return');
const errorOverlay = getRequiredElement<HTMLElement>('#error-overlay');
const errorMessage = getRequiredElement<HTMLElement>('#error-message');
const retryRenderer = getRequiredElement<HTMLButtonElement>('#retry-renderer');
const websiteEntry = window.location.pathname
  .replace(/\/+$/, '') === '/visuals/gargantua';

siteReturn.hidden = !websiteEntry || shotMode;
document.documentElement.dataset.websiteEntry = String(websiteEntry);

function showFatalError(
  summary: string,
  detail: unknown,
  errorCode: string,
): void {
  console.error(summary, detail);
  errorMessage.textContent = `${summary}. Reload the page to try again.`;
  errorOverlay.hidden = false;
  document.documentElement.dataset.renderError = errorCode;
}

const quality: QualityTier = isQualityTier(requestedQuality)
  ? requestedQuality
  : selectInitialQuality();
const view: ViewName = isViewName(requestedView) ? requestedView : 'poster';
const viewPreset = VIEW_PRESETS[view];
const verticalFov = viewPreset.fov ?? VISUAL.fov;
const simulationTime = Number.isFinite(requestedTime)
  ? Math.max(requestedTime, 0)
  : 0;
const qualityProfile = QUALITY_PROFILES[quality];
const adaptiveResolutionEnabled = !shotMode && !isQualityTier(requestedQuality);
const adaptiveResolution = adaptiveResolutionEnabled
  ? new AdaptiveResolutionController(performance.now())
  : null;
let resolutionScale = adaptiveResolution?.scale ?? 1;

const state = {
  frameCount: 0,
  fps: 0,
  fpsFrames: 0,
  fpsSampleStartedAt: performance.now(),
  lastGpuTelemetryAt: 0,
  lastFrameAt: performance.now(),
  lastTelemetryAt: 0,
  renderFailed: false,
  simulationTime,
};

document.documentElement.dataset.uiMode = 'art';
document.documentElement.dataset.paletteMode = 'observational';
document.documentElement.dataset.flowMode = 'trails';
document.documentElement.dataset.skyMode = 'deepfield';
document.documentElement.dataset.shot = String(shotMode);
document.documentElement.dataset.renderReady = 'false';
document.documentElement.dataset.quality = quality;
document.documentElement.dataset.qualitySource = isQualityTier(requestedQuality)
  ? 'query'
  : 'adaptive';
document.documentElement.dataset.adaptiveResolution = adaptiveResolutionEnabled
  ? 'enabled'
  : 'locked';
document.documentElement.dataset.resolutionLevel = '0';
document.documentElement.dataset.resolutionScale = resolutionScale.toFixed(2);
document.documentElement.dataset.steps = String(qualityProfile.steps);
document.documentElement.dataset.view = view;
document.documentElement.dataset.cursor = shotMode ? 'hidden' : 'visible';
document.documentElement.dataset.gpuProfiler = gpuProfilingEnabled
  ? 'initializing'
  : 'disabled';

let renderer: WebGLRenderer;

try {
  renderer = new WebGLRenderer({
    canvas,
    alpha: false,
    antialias: false,
    depth: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
} catch (error) {
  showFatalError('WebGL 2 initialization failed', error, 'initialization');
  throw error;
}

renderer.setClearColor(0x000000, 1);
renderer.outputColorSpace = LinearSRGBColorSpace;
renderer.toneMapping = NoToneMapping;

renderer.debug.onShaderError = (
  gl,
  program,
  vertexShader,
  fragmentShader,
): void => {
  state.renderFailed = true;
  showFatalError('Shader compilation failed', {
    fragment: gl.getShaderInfoLog(fragmentShader),
    program: gl.getProgramInfoLog(program),
    vertex: gl.getShaderInfoLog(vertexShader),
  }, 'shader');
};

const gpuProfiler = new GpuPassProfiler(
  renderer.getContext() as WebGL2RenderingContext,
  gpuProfilingEnabled,
  performance.now(),
);
document.documentElement.dataset.gpuProfiler = gpuProfiler.status;

declare global {
  interface Window {
    __blackHoleGpuProfile?: () => GpuProfileSummary;
  }
}

if (gpuProfilingEnabled) {
  window.__blackHoleGpuProfile = () => gpuProfiler.summary();
}

const scene = new Scene();
const fullscreenCamera = new Camera();
const observerCamera = new PerspectiveCamera(verticalFov, 1, 0.01, 240);
const geometry = createFullscreenTriangle();
const renderSize = new Vector2(1, 1);
const requestedDeepFieldCubeSize = quality === 'standard' ? 512 : 1024;

function initializeDeepFieldCube(): WebGLCubeRenderTarget {
  const maximumSize = renderer.capabilities.maxCubemapSize;
  const sizes = [
    Math.min(requestedDeepFieldCubeSize, maximumSize),
    Math.min(512, maximumSize),
    Math.min(256, maximumSize),
  ].filter((size, index, candidates) => (
    size >= 256 && candidates.indexOf(size) === index
  ));
  let lastError: unknown = new Error('No compatible cube-map size available.');

  for (const size of sizes) {
    try {
      return createDeepFieldCube(renderer, geometry, fullscreenCamera, size);
    } catch (error) {
      lastError = error;
      console.warn(`Deep-field cube initialization failed at ${size}px.`, error);
    }
  }

  showFatalError('Deep-space cache initialization failed', lastError, 'sky-cache');
  throw lastError;
}

const deepFieldCube = initializeDeepFieldCube();
document.documentElement.dataset.skySource = 'precomputed-cube';
document.documentElement.dataset.skyCubeSize = String(deepFieldCube.width);
document.documentElement.dataset.skyCubeFallback = deepFieldCube.width
  < requestedDeepFieldCubeSize
  ? 'reduced'
  : 'none';
const uniforms = {
  uResolution: { value: new Vector2(1, 1) },
  uTime: { value: state.simulationTime },
  uCameraPosition: { value: new Vector3() },
  uCameraTarget: { value: new Vector3(0, 0, 0) },
  uVerticalFov: { value: verticalFov },
  uDeepFieldCube: { value: deepFieldCube.texture },
};
const rayMaterial = new RawShaderMaterial({
  defines: {
    RAY_INTEGRATION_STEPS: qualityProfile.steps,
  },
  depthTest: false,
  depthWrite: false,
  fragmentShader: schwarzschildFragmentShader,
  glslVersion: GLSL3,
  uniforms,
  vertexShader: fullscreenVertexShader,
});
const fullscreenTriangle = new Mesh(geometry, rayMaterial);
fullscreenTriangle.frustumCulled = false;
scene.add(fullscreenTriangle);

observerCamera.position.copy(sphericalToCartesian(viewPreset));

const controls = new OrbitControls(observerCamera, canvas);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 1.62;
controls.maxDistance = VISUAL.maxCameraDistance;
controls.rotateSpeed = 0.55;
controls.zoomSpeed = 0.7;
controls.update();

const renderPass = new RenderPass(scene, fullscreenCamera);
const bloomPass = new UnrealBloomPass(
  new Vector2(1, 1),
  VISUAL.bloomStrength,
  VISUAL.bloomRadius,
  VISUAL.bloomThreshold,
);
const postPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new Vector2(1, 1) },
    uTime: { value: state.simulationTime },
    uVignette: { value: VISUAL.vignette },
    uGrain: { value: VISUAL.grain },
    uChromaticAberration: { value: VISUAL.chromaticAberration },
  },
  vertexShader: postVertexShader,
  fragmentShader: postFragmentShader,
});
const composer = new EffectComposer(renderer);
composer.addPass(renderPass);
composer.addPass(bloomPass);
composer.addPass(postPass);

type PassRender = (...parameters: any[]) => void;

function instrumentPass(
  passName: GpuPassName,
  pass: { render: PassRender },
): void {
  if (!gpuProfilingEnabled) {
    return;
  }

  const originalRender = pass.render.bind(pass);
  pass.render = (...parameters): void => {
    gpuProfiler.measure(passName, () => originalRender(...parameters));
  };
}

instrumentPass('ray', renderPass);
instrumentPass('bloom', bloomPass);
instrumentPass('post', postPass);

function resizeRenderer(): void {
  const width = Math.max(window.innerWidth, 1);
  const height = Math.max(window.innerHeight, 1);
  const basePixelRatio = Math.min(
    window.devicePixelRatio || 1,
    qualityProfile.pixelRatioCap,
  );
  const minimumPixelRatio = Math.min(basePixelRatio, 0.75);
  const pixelRatio = Math.max(
    basePixelRatio * resolutionScale,
    minimumPixelRatio,
  );

  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(width, height);
  renderer.getDrawingBufferSize(renderSize);
  uniforms.uResolution.value.copy(renderSize);
  postPass.uniforms.uResolution.value.copy(renderSize);
  bloomPass.resolution.copy(renderSize);
  observerCamera.aspect = width / height;
  observerCamera.updateProjectionMatrix();
  document.documentElement.dataset.pixelRatio = pixelRatio.toFixed(2);
  document.documentElement.dataset.renderSize = `${renderSize.x}x${renderSize.y}`;
}

function handleResize(): void {
  adaptiveResolution?.reset(performance.now());
  resizeRenderer();
}

function updateTelemetry(now: number, force: boolean = false): void {
  if (!force && now - state.lastTelemetryAt < 250) {
    return;
  }

  state.lastTelemetryAt = now;
  const distance = observerCamera.position.length();
  const inclination = Math.asin(
    clamp(observerCamera.position.y / Math.max(distance, 0.0001), -1, 1),
  ) * 180 / Math.PI;
  document.documentElement.dataset.cameraDistance = distance.toFixed(3);
  document.documentElement.dataset.cameraInclination = Math.abs(inclination).toFixed(3);
  document.documentElement.dataset.cameraFov = observerCamera.fov.toFixed(3);
}

function updateGpuTelemetry(now: number, force: boolean = false): void {
  if (
    !gpuProfilingEnabled
    || (!force && now - state.lastGpuTelemetryAt < 500)
  ) {
    return;
  }

  state.lastGpuTelemetryAt = now;
  const summary = gpuProfiler.summary();
  document.documentElement.dataset.gpuProfiler = summary.status;
  document.documentElement.dataset.gpuSamples = String(summary.sampleCount);

  if (
    summary.passes.ray
    && summary.passes.bloom
    && summary.passes.post
    && summary.total
  ) {
    document.documentElement.dataset.gpuRayMedianMs = summary.passes.ray.medianMs
      .toFixed(3);
    document.documentElement.dataset.gpuBloomMedianMs = summary.passes.bloom
      .medianMs.toFixed(3);
    document.documentElement.dataset.gpuPostMedianMs = summary.passes.post
      .medianMs.toFixed(3);
    document.documentElement.dataset.gpuTotalMedianMs = summary.total.medianMs
      .toFixed(3);
  }
}

let animationFrame = 0;

function renderFrame(now: number): void {
  if (state.renderFailed) {
    return;
  }

  const frameDuration = now - state.lastFrameAt;
  const deltaSeconds = clamp(frameDuration / 1000, 0, 0.1);
  state.lastFrameAt = now;

  if (!shotMode && document.visibilityState === 'visible') {
    state.simulationTime += deltaSeconds;
  }

  controls.update();
  uniforms.uCameraPosition.value.copy(observerCamera.position);
  uniforms.uCameraTarget.value.copy(controls.target);
  uniforms.uTime.value = state.simulationTime;
  postPass.uniforms.uTime.value = state.simulationTime;

  try {
    gpuProfiler.beginFrame(now);
    composer.render(deltaSeconds);
    gpuProfiler.endFrame();
  } catch (error) {
    gpuProfiler.endFrame();
    state.renderFailed = true;
    showFatalError('Rendering failed', error, 'runtime');
    return;
  }

  state.frameCount += 1;
  state.fpsFrames += 1;
  const fpsSampleDuration = now - state.fpsSampleStartedAt;

  if (fpsSampleDuration >= 1000) {
    state.fps = state.fpsFrames * 1000 / fpsSampleDuration;
    state.fpsFrames = 0;
    state.fpsSampleStartedAt = now;
    document.documentElement.dataset.frameRate = state.fps.toFixed(1);
  }

  document.documentElement.dataset.simulationTime = state.simulationTime.toFixed(3);
  document.documentElement.dataset.renderReady = 'true';
  updateTelemetry(now);
  updateGpuTelemetry(now);

  if (adaptiveResolution && document.visibilityState === 'visible') {
    const resolutionChange = adaptiveResolution.sample(now, frameDuration);

    if (resolutionChange) {
      resolutionScale = resolutionChange.scale;
      document.documentElement.dataset.resolutionLevel = String(
        resolutionChange.level,
      );
      document.documentElement.dataset.resolutionScale = resolutionScale.toFixed(2);
      resizeRenderer();
    }
  }

  if (shotMode && state.frameCount >= 4) {
    document.documentElement.dataset.shotReady = 'true';
    document.title = 'BLACK_HOLE_ART_SHOT_READY';
    return;
  }

  animationFrame = window.requestAnimationFrame(renderFrame);
}

function handleVisibilityChange(): void {
  const now = performance.now();
  state.lastFrameAt = now;
  adaptiveResolution?.reset(now);
}

function handleControlsStart(): void {
  document.documentElement.dataset.view = 'custom';
}

let cursorHideTimer: number | undefined;

function hideCursor(): void {
  if (shotMode) {
    return;
  }

  document.documentElement.dataset.cursor = 'hidden';
}

function revealCursor(): void {
  if (shotMode) {
    return;
  }

  document.documentElement.dataset.cursor = 'visible';

  if (cursorHideTimer !== undefined) {
    window.clearTimeout(cursorHideTimer);
  }

  cursorHideTimer = window.setTimeout(() => {
    cursorHideTimer = undefined;
    hideCursor();
  }, 1400);
}

function handleRetry(): void {
  window.location.reload();
}

function handleContextLost(event: Event): void {
  event.preventDefault();
  state.renderFailed = true;
  window.cancelAnimationFrame(animationFrame);
  showFatalError('WebGL context lost', 'The graphics context stopped responding.', 'context-lost');
}

resizeRenderer();
updateTelemetry(performance.now(), true);
updateGpuTelemetry(performance.now(), true);

window.addEventListener('resize', handleResize, { passive: true });
window.addEventListener('pointermove', revealCursor, { passive: true });
window.addEventListener('pointerdown', revealCursor, { passive: true });
document.documentElement.addEventListener('mouseleave', hideCursor);
document.addEventListener('visibilitychange', handleVisibilityChange);
controls.addEventListener('start', handleControlsStart);
retryRenderer.addEventListener('click', handleRetry);
canvas.addEventListener('webglcontextlost', handleContextLost);

animationFrame = window.requestAnimationFrame(renderFrame);
revealCursor();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    window.cancelAnimationFrame(animationFrame);

    if (cursorHideTimer !== undefined) {
      window.clearTimeout(cursorHideTimer);
    }

    window.removeEventListener('resize', handleResize);
    window.removeEventListener('pointermove', revealCursor);
    window.removeEventListener('pointerdown', revealCursor);
    document.documentElement.removeEventListener('mouseleave', hideCursor);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    controls.removeEventListener('start', handleControlsStart);
    retryRenderer.removeEventListener('click', handleRetry);
    canvas.removeEventListener('webglcontextlost', handleContextLost);
    renderer.debug.onShaderError = null;
    delete window.__blackHoleGpuProfile;
    gpuProfiler.dispose();
    controls.dispose();
    postPass.dispose();
    bloomPass.dispose();
    composer.dispose();
    deepFieldCube.dispose();
    geometry.dispose();
    rayMaterial.dispose();
    renderer.dispose();
  });
}
