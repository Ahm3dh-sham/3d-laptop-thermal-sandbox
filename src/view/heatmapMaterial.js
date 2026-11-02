import * as THREE from "three";

/**
 * Custom GLSL Heat-Map ShaderMaterial for thermal components.
 * - Blends Blue (25°C) -> Cyan (50°C) -> Yellow (75°C) -> Red (95°C+)
 * - Adds a soft Fresnel + emissive glow as temperature approaches/exceeds throttleThreshold
 * - Pulses bright crimson when uBottleneckPulse > 0 (limiting pipeline stage)
 * - Uses Three.js r186 `<tonemapping_fragment>` and `<colorspace_fragment>` chunks.
 */
export function createHeatmapMaterial({
  baseColor = 0x1e293b,
  initialTemp = 38.0,
  throttleTemp = 95.0,
  labelTexture = null,
} = {}) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTemp: { value: initialTemp },
      uThrottleTemp: { value: throttleTemp },
      uBottleneckPulse: { value: 0.0 },
      uSelected: { value: 0.0 },
      uHovered: { value: 0.0 },
      uBaseColor: { value: new THREE.Color(baseColor) },
      uHasLabel: { value: labelTexture ? 1.0 : 0.0 },
      uLabelMap: { value: labelTexture },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vViewNormal;
      varying vec3 vViewDir;
      varying float vIsTopFace;

      void main() {
        vUv = uv;
        vIsTopFace = step(0.85, normal.y);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewNormal = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTemp;
      uniform float uThrottleTemp;
      uniform float uBottleneckPulse;
      uniform float uSelected;
      uniform float uHovered;
      uniform vec3 uBaseColor;
      uniform float uHasLabel;
      uniform sampler2D uLabelMap;

      varying vec2 vUv;
      varying vec3 vViewNormal;
      varying vec3 vViewDir;
      varying float vIsTopFace;

      // Maps normalized temperature t in [0, 1] to Blue -> Cyan -> Yellow -> Red
      vec3 heatRamp(float t) {
        vec3 cCold   = vec3(0.08, 0.32, 0.88); // 25°C Cool Blue
        vec3 cWarm   = vec3(0.04, 0.68, 0.78); // 50°C Cyan-Teal
        vec3 cHot    = vec3(0.92, 0.68, 0.05); // 75°C Amber-Yellow
        vec3 cCrit   = vec3(0.94, 0.16, 0.16); // 95°C+ Thermal Red

        if (t < 0.35) {
          return mix(cCold, cWarm, t / 0.35);
        } else if (t < 0.70) {
          return mix(cWarm, cHot, (t - 0.35) / 0.35);
        } else {
          return mix(cHot, cCrit, clamp((t - 0.70) / 0.30, 0.0, 1.0));
        }
      }

      void main() {
        // Normalize temperature between 25°C and 100°C
        float normT = clamp((uTemp - 25.0) / 75.0, 0.0, 1.0);
        vec3 thermalColor = heatRamp(normT);

        // Simple directional key + ambient lighting in view space
        vec3 lightDir = normalize(vec3(0.45, 0.75, 0.5));
        float ndotl = max(dot(vViewNormal, lightDir), 0.0);
        float lighting = 0.42 + 0.58 * ndotl;

        // Blend base substrate with thermal map
        vec3 surfaceColor = mix(uBaseColor, thermalColor, 0.78) * lighting;

        // Overlay crisp die label on top face only (normal.y > 0.85)
        if (uHasLabel > 0.5 && vIsTopFace > 0.5) {
          vec4 labelSample = texture(uLabelMap, vUv);
          surfaceColor = mix(surfaceColor, labelSample.rgb, labelSample.a * 0.92);
        }

        // View-space Fresnel rim for throttle soft glow & selection highlight
        float fresnel = pow(1.0 - max(dot(vViewDir, vViewNormal), 0.0), 2.4);

        // Soft glow near/above throttle threshold (starts ramping 8°C below throttleTemp)
        float throttleProximity = smoothstep(uThrottleTemp - 8.0, uThrottleTemp + 2.0, uTemp);
        vec3 throttleGlow = vec3(1.0, 0.28, 0.08) * throttleProximity * (0.35 + 0.65 * fresnel);

        // Bottleneck red pulse (driven by sin wave in simulator render update)
        vec3 bottleneckGlow = vec3(1.0, 0.10, 0.18) * uBottleneckPulse * (0.45 + 0.55 * fresnel);

        // Hover / Selection crisp cyan rim
        float interactStrength = max(uSelected * 0.75, uHovered * 0.45);
        vec3 interactRim = vec3(0.22, 0.74, 0.97) * interactStrength * (0.3 + 0.7 * fresnel);

        vec3 finalColor = surfaceColor + throttleGlow + bottleneckGlow + interactRim;

        gl_FragColor = vec4(finalColor, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  return material;
}

/**
 * Generates a crisp CanvasTexture for component die markings (CPU, GPU, VRM, RAM, SSD, Battery).
 * Follows `threejs-textures`: tags CanvasTexture with `SRGBColorSpace` and disables mipmaps.
 */
export function createDieLabelTexture(title, subtitle = "") {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Subtle circuit border frame
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);

  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.font = "600 32px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, canvas.width / 2, subtitle ? 50 : 64);

  if (subtitle) {
    ctx.fillStyle = "rgba(220, 230, 242, 0.82)";
    ctx.font = "500 18px 'JetBrains Mono', monospace";
    ctx.fillText(subtitle, canvas.width / 2, 86);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}
