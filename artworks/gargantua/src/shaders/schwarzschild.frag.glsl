precision highp float;
precision highp int;

out vec4 outColor;

uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uCameraPosition;
uniform vec3 uCameraTarget;
uniform float uVerticalFov;
uniform samplerCube uDeepFieldCube;

const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;
const float SCHWARZSCHILD_RADIUS = 1.0;
const float HORIZON_RADIUS = 1.03;
const float ESCAPE_RADIUS = 48.0;
const float DISK_INNER_RADIUS = 2.75;
const float DISK_OUTER_RADIUS = 40.0;
const float DOPPLER_LIMIT = 1.85;
const float NEAR_OPACITY = 0.9;
const float FAR_OPACITY = 0.8;
const float DISK_BRIGHTNESS = 1.0;
const float ROTATION_SPEED = 1.0;

float hash11(float value) {
  value = fract(value * 0.1031);
  value *= value + 33.33;
  value *= value + value;
  return fract(value);
}

float hash31(vec3 value) {
  value = fract(value * 0.1031);
  value += dot(value, value.yzx + 33.33);
  return fract((value.x + value.y) * value.z);
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

vec3 cameraRay(vec2 fragmentCoordinate) {
  vec2 screen = (fragmentCoordinate - 0.5 * uResolution) / uResolution.y;
  vec3 forward = normalize(uCameraTarget - uCameraPosition);
  vec3 referenceUp = abs(forward.y) > 0.995
    ? vec3(0.0, 0.0, 1.0)
    : vec3(0.0, 1.0, 0.0);
  vec3 right = normalize(cross(forward, referenceUp));
  vec3 up = normalize(cross(right, forward));
  float focalLength = 1.0 / tan(radians(uVerticalFov) * 0.5);

  return normalize(
    forward * focalLength + right * screen.x + up * screen.y
  );
}

float diskFlux(float radius);

vec3 observationalDiskColor(float radius, float frequencyShift) {
  float normalizedFlux = clamp(diskFlux(radius) / 0.05666, 0.0, 1.0);
  float temperature = pow(normalizedFlux, 0.43);
  vec3 ember = vec3(0.48, 0.035, 0.008);
  vec3 copper = vec3(1.08, 0.30, 0.045);
  vec3 ivory = vec3(1.08, 0.82, 0.50);
  vec3 blueWhite = vec3(0.88, 0.97, 1.12);
  vec3 gradedColor = mix(
    ember,
    copper,
    smoothstep(0.02, 0.30, temperature)
  );
  gradedColor = mix(
    gradedColor,
    ivory,
    smoothstep(0.24, 0.68, temperature)
  );
  gradedColor = mix(
    gradedColor,
    blueWhite,
    smoothstep(0.64, 0.96, temperature)
  );
  float luminance = max(dot(
    gradedColor,
    vec3(0.2126, 0.7152, 0.0722)
  ), 0.0001);
  float redShift = 1.0 - smoothstep(0.72, 1.0, frequencyShift);
  float blueShift = smoothstep(1.04, 1.42, frequencyShift);
  gradedColor *= mix(vec3(1.0), vec3(1.08, 0.94, 0.88), redShift * 0.18);
  gradedColor *= mix(vec3(1.0), vec3(0.92, 0.98, 1.08), blueShift * 0.18);
  float gradedLuminance = max(dot(
    gradedColor,
    vec3(0.2126, 0.7152, 0.0722)
  ), 0.0001);

  return gradedColor * luminance / gradedLuminance;
}

float diskFlux(float radius) {
  float safeRadius = max(radius, 3.001);
  float normalizedRadius = safeRadius / 3.0;
  return pow(normalizedRadius, -3.0)
    * (1.0 - inversesqrt(normalizedRadius));
}

float diskRadialGlow(float radius) {
  float flux = diskFlux(radius);
  float innerHighlight = exp(-pow((radius - 3.12) * 3.0, 2.0)) * 2.75;
  float outerFade = smoothstep(
    DISK_OUTER_RADIUS,
    DISK_OUTER_RADIUS - 14.0,
    radius
  );
  return (flux * 11.0 + innerHighlight) * outerFade;
}

float wrappedAngle(float angle) {
  return atan(sin(angle), cos(angle));
}

float accretionFlowTracers(
  vec3 crossing,
  float radius,
  out float headSignal
) {
  float azimuth = atan(crossing.z, crossing.x);
  float flowDirection = ROTATION_SPEED < 0.0 ? -1.0 : 1.0;
  float speedScale = abs(ROTATION_SPEED);
  float tracerInnerRadius = max(DISK_INNER_RADIUS + 0.42, 3.18);
  float tracerOuterRadius = max(
    tracerInnerRadius + 0.1,
    min(DISK_OUTER_RADIUS - 1.0, 24.0)
  );
  float tailSignal = 0.0;
  headSignal = 0.0;

  for (int tracerIndex = 0; tracerIndex < 12; tracerIndex += 1) {
    float seed = float(tracerIndex) + 1.0;
    float radialSeed = hash11(seed * 4.731 + 0.17);
    float angleSeed = hash11(seed * 9.173 + 2.41);
    float shapeSeed = hash11(seed * 13.117 + 4.83);
    float brightnessSeed = hash11(seed * 17.719 + 7.29);
    float tracerRadius = mix(
      tracerInnerRadius,
      tracerOuterRadius,
      pow(radialSeed, 2.15)
    );
    float innerWeight = 1.0 - smoothstep(4.0, 19.0, tracerRadius);
    float orbitalRate = 0.72
      * pow(3.0 / max(tracerRadius, 0.5), 1.5)
      * speedScale;
    float headAngle = angleSeed * TAU
      + flowDirection * uTime * orbitalRate;
    float alongOrbit = wrappedAngle(azimuth - headAngle) * flowDirection;
    float radialWidth = mix(0.22, 0.62, smoothstep(
      tracerInnerRadius,
      tracerOuterRadius,
      tracerRadius
    )) * mix(0.84, 1.18, shapeSeed);
    float radialDistance = (radius - tracerRadius) / radialWidth;
    float radialMask = exp(-radialDistance * radialDistance * 1.45);
    float headWidth = mix(0.040, 0.065, 1.0 - innerWeight)
      * mix(0.82, 1.20, shapeSeed);
    float head = exp(-pow(alongOrbit / headWidth, 2.0));
    float tailLength = mix(0.16, 0.42, innerWeight)
      * mix(0.82, 1.18, shapeSeed);
    float tailDistance = max(-alongOrbit, 0.0);
    float behindHead = 1.0 - smoothstep(-0.012, 0.018, alongOrbit);
    float tailCutoff = 1.0 - smoothstep(
      tailLength * 0.72,
      tailLength,
      tailDistance
    );
    float tail = behindHead
      * exp(-tailDistance / max(tailLength * 0.44, 0.001))
      * tailCutoff;
    float brightness = mix(0.52, 0.92, brightnessSeed);
    float rareHotspot = step(0.87, brightnessSeed) * 0.28;

    headSignal += radialMask * head * (brightness + rareHotspot);
    tailSignal += radialMask * tail * brightness;
  }

  headSignal = min(headSignal, 1.65);
  return min(tailSignal, 1.35);
}

float diskTexture(
  vec3 crossing,
  float radius,
  out float filamentSignal
) {
  float orbitalRate = ROTATION_SPEED
    * 1.1
    * pow(3.0 / max(radius, 0.5), 1.5);
  float phase = atan(crossing.z, crossing.x) + uTime * orbitalRate;
  vec2 direction = vec2(cos(phase), sin(phase));
  vec2 rotatingPoint = direction * radius;

  float warp = fbm4(vec3(
    rotatingPoint * 1.45,
    3.0 + uTime * 0.025
  ));
  float innerWeight = smoothstep(18.0, 4.0, radius);
  float cloud = fbm4(vec3(
    rotatingPoint * 0.36 + warp * innerWeight,
    uTime * 0.08 + warp * 0.7
  ));

  vec2 anisotropicPoint = vec2(
    rotatingPoint.x * 3.2,
    rotatingPoint.y * 21.5
  );
  float filaments = fbm4(vec3(
    anisotropicPoint,
    uTime * 0.14 + warp
  ));
  float filamentContrast = mix(
    0.74,
    1.18,
    mix(0.5, filaments, innerWeight)
  );

  float laneNoise = fbm4(vec3(
    rotatingPoint * 3.35 + vec2(warp * 1.8, 7.0),
    uTime * 0.05
  ));
  float laneMask = mix(
    0.69,
    1.22,
    smoothstep(0.34, 0.76, laneNoise)
  );
  float cloudMask = mix(
    0.34,
    1.24,
    smoothstep(0.32, 0.76, cloud)
  );

  filamentSignal = smoothstep(0.56, 0.86, filaments) * laneMask;
  return cloudMask * filamentContrast * laneMask;
}

vec3 diskEmission(
  vec3 crossing,
  vec3 rayDirection,
  out float opacity
) {
  float radius = length(crossing.xz);

  if (radius < DISK_INNER_RADIUS || radius > DISK_OUTER_RADIUS) {
    opacity = 0.0;
    return vec3(0.0);
  }

  float flux = diskFlux(radius);
  float filamentSignal;
  float pattern = diskTexture(crossing, radius, filamentSignal);

  float intensity = flux * 11.0 * pattern;
  intensity += exp(-pow((radius - 3.12) * 3.0, 2.0)) * 2.75;
  float outerFade = smoothstep(
    DISK_OUTER_RADIUS,
    DISK_OUTER_RADIUS - 14.0,
    radius
  );
  intensity *= outerFade;

  float headSignal;
  float tailSignal = accretionFlowTracers(
    crossing,
    radius,
    headSignal
  );
  float innerWeight = 1.0 - smoothstep(4.0, 19.0, radius);
  float flowEmission = tailSignal * mix(0.54, 0.78, innerWeight)
    + headSignal * mix(0.82, 1.18, innerWeight);
  float localFlowGlow = tailSignal * 0.42 + headSignal * 0.50;
  intensity = intensity * (1.0 + flowEmission)
    + localFlowGlow * (0.24 + diskRadialGlow(radius) * 0.82);

  float orbitalSpeed = min(
    sqrt(0.5 / max(radius, SCHWARZSCHILD_RADIUS * 1.01)),
    0.95
  );
  float lorentzFactor = inversesqrt(max(
    1.0 - orbitalSpeed * orbitalSpeed,
    0.0001
  ));
  float azimuth = atan(crossing.z, crossing.x);
  vec3 orbitalDirection = normalize(vec3(
    -sin(azimuth),
    0.0,
    cos(azimuth)
  ));
  float dopplerFactor = 1.0 / max(
    lorentzFactor
      * (1.0 - dot(orbitalDirection * orbitalSpeed, rayDirection)),
    0.001
  );
  dopplerFactor = clamp(dopplerFactor, 0.5, DOPPLER_LIMIT);
  float gravitationalShift = sqrt(max(
    1.0 - SCHWARZSCHILD_RADIUS
      / max(radius, SCHWARZSCHILD_RADIUS * 1.01),
    0.0001
  ));

  float frequencyShift = dopplerFactor * gravitationalShift;
  vec3 color = observationalDiskColor(radius, frequencyShift);
  color *= intensity * pow(frequencyShift, 4.0);
  color *= 1.0 + filamentSignal * 0.16;

  opacity = mix(
    FAR_OPACITY,
    NEAR_OPACITY,
    smoothstep(13.0, 4.0, radius)
  ) * outerFade;

  return color;
}

vec3 sampleDeepFieldCube(vec3 direction) {
  vec4 encoded = texture(uDeepFieldCube, direction);
  return encoded.rgb * encoded.a * 4.0;
}

void main() {
  vec3 position = uCameraPosition;
  vec3 velocity = cameraRay(gl_FragCoord.xy);
  vec3 accumulatedColor = vec3(0.0);
  float transmission = 1.0;
  float minimumRadius = 100000.0;
  float lastRadius = length(position);

  for (
    int stepIndex = 0;
    stepIndex < RAY_INTEGRATION_STEPS;
    stepIndex += 1
  ) {
    float radius = length(position);
    minimumRadius = min(minimumRadius, radius);
    lastRadius = radius;

    if (radius < HORIZON_RADIUS) {
      transmission = 0.0;
      break;
    }

    if (
      radius > ESCAPE_RADIUS
      && dot(position, velocity) > 0.0
    ) {
      break;
    }

    vec3 angularMomentum = cross(position, velocity);
    float angularMomentumSquared = max(
      dot(angularMomentum, angularMomentum),
      0.000000000001
    );
    float radiusSquared = max(radius * radius, 0.00000001);
    vec3 acceleration = -1.5
      * SCHWARZSCHILD_RADIUS
      * angularMomentumSquared
      * position
      / (radiusSquared * radiusSquared * radius);
    float stepSize = max(
      0.012,
      radius * mix(0.02, 0.06, smoothstep(6.0, 20.0, radius))
    );

    velocity = normalize(velocity + acceleration * stepSize);
    vec3 nextPosition = position + velocity * stepSize;

    if (abs(position.y) < 0.45) {
      float planarRadius = length(position.xz);

      if (
        planarRadius > DISK_INNER_RADIUS
        && planarRadius < DISK_OUTER_RADIUS
      ) {
        float density = exp(-abs(position.y) * 30.0)
          * 0.009
          * smoothstep(DISK_OUTER_RADIUS - 1.0, 10.0, planarRadius);
        float hazeShift = sqrt(max(
          1.0 - SCHWARZSCHILD_RADIUS
            / max(planarRadius, SCHWARZSCHILD_RADIUS * 1.01),
          0.0001
        ));
        vec3 hazeColor = observationalDiskColor(planarRadius, hazeShift);
        vec3 haze = transmission
          * diskRadialGlow(planarRadius)
          * density
          * stepSize
          * DISK_BRIGHTNESS
          * 0.82
          * hazeColor;
        accumulatedColor += haze;
      }
    }

    if (position.y * nextPosition.y <= 0.0) {
      float crossingProgress = abs(position.y)
        / (abs(position.y) + abs(nextPosition.y) + 0.00001);
      vec3 crossing = mix(position, nextPosition, crossingProgress);
      float crossingRadius = length(crossing.xz);

      if (
        crossingRadius > DISK_INNER_RADIUS
        && crossingRadius < DISK_OUTER_RADIUS
      ) {
        float opacity;
        vec3 emission = diskEmission(
          crossing,
          velocity,
          opacity
        );
        vec3 contribution = transmission
          * opacity
          * emission
          * DISK_BRIGHTNESS
          * 0.82;
        accumulatedColor += contribution;
        transmission *= 1.0 - opacity;

        if (transmission < 0.02) {
          position = nextPosition;
          break;
        }
      }
    }

    position = nextPosition;
  }

  if (transmission > 0.02) {
    float escapeDimming = clamp(
      (lastRadius - HORIZON_RADIUS) * 0.45,
      0.45,
      1.0
    );
    vec3 backgroundColor = sampleDeepFieldCube(velocity) * escapeDimming;
    accumulatedColor += transmission * backgroundColor;
  }

  float photonRing = exp(-pow((minimumRadius - 1.55) * 4.0, 2.0));
  vec3 photonRingColor = vec3(1.0, 0.91, 0.78)
    * photonRing
    * 0.055;
  accumulatedColor += photonRingColor;

  outColor = vec4(max(accumulatedColor, 0.0), 1.0);
}
