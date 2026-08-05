precision highp float;
precision highp int;

out vec4 outColor;

uniform int uCubeFace;
uniform float uFaceSize;

const float SKY_FLOOR = 0.04;
const float STAR_BRIGHTNESS = 1.0;
const float SKY_RGBM_RANGE = 4.0;

float hash31(vec3 value) {
  value = fract(value * 0.1031);
  value += dot(value, value.yzx + 33.33);
  return fract((value.x + value.y) * value.z);
}

vec3 hash33(vec3 value) {
  vec3 projected = vec3(
    dot(value, vec3(127.1, 311.7, 74.7)),
    dot(value, vec3(269.5, 183.3, 246.1)),
    dot(value, vec3(113.5, 271.9, 124.6))
  );
  return fract(sin(projected) * 43758.5453123);
}

float valueNoise(vec3 position) {
  vec3 cell = floor(position);
  vec3 local = fract(position);
  vec3 blend = local * local * (3.0 - 2.0 * local);

  float nearLower = mix(
    hash31(cell),
    hash31(cell + vec3(1.0, 0.0, 0.0)),
    blend.x
  );
  float nearUpper = mix(
    hash31(cell + vec3(0.0, 1.0, 0.0)),
    hash31(cell + vec3(1.0, 1.0, 0.0)),
    blend.x
  );
  float farLower = mix(
    hash31(cell + vec3(0.0, 0.0, 1.0)),
    hash31(cell + vec3(1.0, 0.0, 1.0)),
    blend.x
  );
  float farUpper = mix(
    hash31(cell + vec3(0.0, 1.0, 1.0)),
    hash31(cell + vec3(1.0, 1.0, 1.0)),
    blend.x
  );

  return mix(
    mix(nearLower, nearUpper, blend.y),
    mix(farLower, farUpper, blend.y),
    blend.z
  );
}

float fbm4(vec3 position) {
  float result = 0.0;
  float amplitude = 0.5333333;

  for (int octave = 0; octave < 4; octave += 1) {
    result += amplitude * valueNoise(position);
    position = position * 2.03 + vec3(11.3, 7.1, 13.7);
    amplitude *= 0.5;
  }

  return result;
}

vec3 deepFieldStarColor(float temperatureClass) {
  vec3 warmWhite = vec3(1.08, 0.88, 0.70);
  vec3 neutralWhite = vec3(1.0, 0.98, 0.93);
  vec3 coolWhite = vec3(0.78, 0.90, 1.10);
  vec3 color = mix(
    warmWhite,
    neutralWhite,
    smoothstep(0.08, 0.48, temperatureClass)
  );
  color = mix(
    color,
    coolWhite,
    smoothstep(0.58, 0.94, temperatureClass)
  );
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));

  return mix(vec3(luminance), color, 0.58);
}

vec3 deepFieldStarLayer(
  vec3 direction,
  float scale,
  float threshold,
  float brightness,
  float sharpness
) {
  vec3 latticePosition = direction * scale;
  vec3 baseCell = floor(latticePosition);
  vec3 localPosition = fract(latticePosition);
  vec3 radiance = vec3(0.0);

  for (int xIndex = 0; xIndex <= 1; xIndex += 1) {
    for (int yIndex = 0; yIndex <= 1; yIndex += 1) {
      for (int zIndex = 0; zIndex <= 1; zIndex += 1) {
        vec3 cellOffset = vec3(
          float(xIndex),
          float(yIndex),
          float(zIndex)
        );
        vec3 cell = baseCell + cellOffset;
        vec3 randomValue = hash33(cell + vec3(17.0, 31.0, 47.0));

        if (randomValue.x <= threshold) {
          continue;
        }

        vec3 delta = cellOffset + randomValue - localPosition;
        float distanceSquared = dot(delta, delta);
        float luminosityRank = clamp(
          (randomValue.x - threshold) / max(1.0 - threshold, 0.0001),
          0.0,
          1.0
        );
        float luminosity = mix(
          0.42,
          1.0,
          pow(luminosityRank, 2.0)
        );
        float core = exp(-distanceSquared * sharpness)
          * brightness
          * luminosity;
        float rareStar = step(0.965, luminosityRank);
        float halo = exp(-distanceSquared * 18.0)
          * brightness
          * rareStar
          * 0.13;
        vec3 starColor = deepFieldStarColor(randomValue.z);

        radiance += starColor * (core + halo);
      }
    }
  }

  return radiance;
}

vec3 celestialAnchor(
  vec3 direction,
  vec3 anchorDirection,
  vec3 color,
  float brightness
) {
  float angularError = 1.0 - max(dot(
    direction,
    normalize(anchorDirection)
  ), 0.0);
  float core = exp(-angularError * 190000.0) * brightness;
  float halo = exp(-angularError * 12000.0) * brightness * 0.072;

  return color * (core + halo);
}

vec3 deepFieldSky(vec3 direction) {
  vec3 d = normalize(direction);
  vec3 bandNormal = normalize(vec3(0.07, 0.64, -0.77));
  vec3 accentDirection = normalize(vec3(0.86, 0.08, -0.50));
  float latitude = dot(d, bandNormal);
  float broadBand = exp(-latitude * latitude * 28.0);
  float bandCore = exp(-latitude * latitude * 150.0);
  float cloud = fbm4(d * 3.8 + vec3(4.2, 9.7, 2.3));
  float dustNoise = fbm4(d * 10.5 + vec3(17.0, 3.0, 11.0));
  float fineStructure = fbm4(d * 21.0 + vec3(5.0, 19.0, 7.0));
  float sideBias = mix(
    0.52,
    1.0,
    smoothstep(-0.42, 0.62, dot(d, accentDirection))
  );
  float cloudDensity = smoothstep(0.28, 0.78, cloud);
  float dust = smoothstep(
    0.48,
    0.82,
    dustNoise * 0.78 + fineStructure * 0.28 + bandCore * 0.10
  );
  float visibleBand = broadBand
    * mix(0.24, 1.0, cloudDensity)
    * sideBias
    * (1.0 - dust * 0.72);
  vec3 radiance = SKY_FLOOR * vec3(0.045, 0.055, 0.078);
  vec3 coldCirrus = vec3(0.090, 0.112, 0.150);
  vec3 neutralCirrus = vec3(0.138, 0.142, 0.138);
  radiance += mix(coldCirrus, neutralCirrus, cloud)
    * visibleBand
    * 1.58;
  radiance += vec3(0.075, 0.080, 0.088)
    * bandCore
    * sideBias
    * mix(0.18, 0.62, cloudDensity)
    * (1.0 - dust * 0.86);

  vec3 direction2 = normalize(vec3(
    d.x * 0.82 + d.y * 0.57,
    -d.x * 0.57 + d.y * 0.82,
    d.z
  ));
  vec3 direction3 = normalize(vec3(
    d.x * 0.58 + d.z * 0.81,
    d.y,
    -d.x * 0.81 + d.z * 0.58
  ));
  vec3 stars = deepFieldStarLayer(d, 42.0, 0.952, 0.66, 90.0);
  stars += deepFieldStarLayer(
    direction2,
    78.0,
    0.962,
    0.48,
    106.0
  );
  stars += deepFieldStarLayer(
    direction3,
    142.0,
    0.976,
    0.34,
    132.0
  );
  stars += celestialAnchor(
    d,
    vec3(-0.177, -0.507, -0.844),
    vec3(0.92, 0.97, 1.08),
    1.04
  );
  stars += celestialAnchor(
    d,
    vec3(-0.672, -0.462, -0.579),
    vec3(1.06, 0.92, 0.78),
    0.78
  );
  stars += celestialAnchor(
    d,
    vec3(-0.126, -0.759, -0.638),
    vec3(0.98, 0.98, 0.94),
    0.70
  );
  stars += celestialAnchor(
    d,
    vec3(-0.436, -0.799, -0.415),
    vec3(0.84, 0.93, 1.08),
    0.92
  );
  stars += celestialAnchor(
    d,
    vec3(-0.038, -0.633, -0.774),
    vec3(1.04, 0.96, 0.84),
    0.62
  );
  float dustTransmission = 1.0 - bandCore * dust * 0.64;
  radiance += stars * dustTransmission * 1.28;

  return radiance * STAR_BRIGHTNESS;
}

vec3 cubeFaceDirection(vec2 coordinate, int face) {
  if (face == 0) {
    return normalize(vec3(1.0, -coordinate.y, -coordinate.x));
  }

  if (face == 1) {
    return normalize(vec3(-1.0, -coordinate.y, coordinate.x));
  }

  if (face == 2) {
    return normalize(vec3(coordinate.x, 1.0, coordinate.y));
  }

  if (face == 3) {
    return normalize(vec3(coordinate.x, -1.0, -coordinate.y));
  }

  if (face == 4) {
    return normalize(vec3(coordinate.x, -coordinate.y, 1.0));
  }

  return normalize(vec3(-coordinate.x, -coordinate.y, -1.0));
}

vec4 encodeRgbm(vec3 radiance) {
  vec3 scaled = max(radiance, 0.0) / SKY_RGBM_RANGE;
  float multiplier = max(max(scaled.r, scaled.g), scaled.b);
  multiplier = clamp(ceil(multiplier * 255.0) / 255.0, 1.0 / 255.0, 1.0);
  return vec4(scaled / multiplier, multiplier);
}

void main() {
  vec2 coordinate = gl_FragCoord.xy / uFaceSize * 2.0 - 1.0;
  vec3 direction = cubeFaceDirection(coordinate, uCubeFace);
  outColor = encodeRgbm(deepFieldSky(direction));
}
