precision highp float;

uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uTime;
uniform float uVignette;
uniform float uGrain;
uniform float uChromaticAberration;

varying vec2 vUv;

float grainNoise(vec2 coordinate) {
  return fract(sin(dot(coordinate, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 acesToneMap(vec3 value) {
  return clamp(
    (value * (2.51 * value + 0.03))
      / (value * (2.43 * value + 0.59) + 0.14),
    0.0,
    1.0
  );
}

void main() {
  vec2 centered = vUv - 0.5;
  float chromaOffset = uChromaticAberration * dot(centered, centered);
  vec2 offset = centered * chromaOffset;
  vec3 color = vec3(
    texture2D(tDiffuse, vUv + offset).r,
    texture2D(tDiffuse, vUv).g,
    texture2D(tDiffuse, vUv - offset).b
  );
  color = acesToneMap(color * 0.95);

  float aspect = uResolution.x / max(uResolution.y, 1.0);
  float vignette = smoothstep(
    1.32,
    0.28,
    length(centered * vec2(aspect, 1.0)) * 1.15
  );
  color *= mix(1.0, vignette, uVignette);

  float noise = grainNoise(
    gl_FragCoord.xy + fract(uTime * 13.7) * 97.0
  ) - 0.5;
  color += noise * uGrain * (1.0 - 0.45 * color);

  gl_FragColor = vec4(color, 1.0);
}
