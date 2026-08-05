import {
  BufferGeometry,
  Camera,
  ClampToEdgeWrapping,
  GLSL3,
  LinearFilter,
  Mesh,
  NoColorSpace,
  RawShaderMaterial,
  Scene,
  UnsignedByteType,
  WebGLCubeRenderTarget,
  WebGLRenderer,
} from 'three';
import fullscreenVertexShader from './shaders/fullscreen.vert.glsl?raw';
import deepFieldFragmentShader from './shaders/deep-field.frag.glsl?raw';

export function createDeepFieldCube(
  renderer: WebGLRenderer,
  geometry: BufferGeometry,
  camera: Camera,
  requestedSize: number,
): WebGLCubeRenderTarget {
  const size = Math.max(
    256,
    Math.min(requestedSize, renderer.capabilities.maxCubemapSize),
  );
  const renderTarget = new WebGLCubeRenderTarget(size, {
    depthBuffer: false,
    generateMipmaps: false,
    magFilter: LinearFilter,
    minFilter: LinearFilter,
    stencilBuffer: false,
    type: UnsignedByteType,
    wrapS: ClampToEdgeWrapping,
    wrapT: ClampToEdgeWrapping,
  });
  renderTarget.texture.colorSpace = NoColorSpace;
  renderTarget.texture.name = 'DeepFieldCube';

  const material = new RawShaderMaterial({
    depthTest: false,
    depthWrite: false,
    fragmentShader: deepFieldFragmentShader,
    glslVersion: GLSL3,
    uniforms: {
      uCubeFace: { value: 0 },
      uFaceSize: { value: size },
    },
    vertexShader: fullscreenVertexShader,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  const scene = new Scene();
  scene.add(mesh);
  const previousRenderTarget = renderer.getRenderTarget();
  const context = renderer.getContext();
  let failure: { error: unknown } | null = null;

  try {
    for (let face = 0; face < 6; face += 1) {
      material.uniforms.uCubeFace.value = face;
      renderer.setRenderTarget(renderTarget, face, 0);

      const framebufferStatus = context.checkFramebufferStatus(
        context.FRAMEBUFFER,
      );

      if (framebufferStatus !== context.FRAMEBUFFER_COMPLETE) {
        throw new Error(
          `Deep-field cube framebuffer incomplete: ${framebufferStatus}`,
        );
      }

      renderer.clear();
      renderer.render(scene, camera);
    }
  } catch (error) {
    failure = { error };
  } finally {
    renderer.setRenderTarget(previousRenderTarget);
    material.dispose();
  }

  if (failure) {
    renderTarget.dispose();
    throw failure.error;
  }

  return renderTarget;
}
