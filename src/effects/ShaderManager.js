import { Effect } from 'babylonjs';
import { LensingConfig } from '../Config.js';

export class ShaderManager {
    static createGravitationalLensingShader() {
        Effect.ShadersStore["gravitationalLensingFragmentShader"] = `
      precision highp float;
      
      // Varyings
      varying vec2 vUV;
      
      // Uniforms
      uniform sampler2D textureSampler;
      uniform vec2 blackHoleCenter;
      uniform float blackHoleRadius;
      uniform float lensStrength;
      uniform float aspectRatio;
      uniform float lensEffectFalloffScale;
      uniform float lensEffectAmplitude;
      uniform float time; // For subtle time-based effects
      uniform float transitionSoftness;
      uniform float schwarzschildFactor;
      
      // Enhanced noise function for subtle distortions
      float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
      }
      
      float noise(vec2 st) {
        vec2 i = floor(st);
        vec2 f = fract(st);
        float a = random(i);
        float b = random(i + vec2(1.0, 0.0));
        float c = random(i + vec2(0.0, 1.0));
        float d = random(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }

      void main(void) {
        vec2 uv = vUV;
        vec2 toCenter = uv - blackHoleCenter;
        
        // Correct for aspect ratio
        toCenter.x *= aspectRatio;
        float dist = length(toCenter);
        float r = blackHoleRadius;
        float rs = r * schwarzschildFactor;
        float theta = atan(toCenter.y, toCenter.x);
        
        // Enhanced lensing calculation
        float lensingRange = r * 8.0;
        float fadeStart = r * 6.0;
        float fade = 1.0;
        
        if (dist > fadeStart) {
          fade = 1.0 - smoothstep(fadeStart, lensingRange, dist);
        }
        
        if (dist < lensingRange && dist > 0.0001) {
          float b = max(dist, 0.0001);
          
          // Improved Schwarzschild deflection with time-based perturbation
          float baseAlpha = lensStrength * rs / b;
          float timeEffect = 1.0 + 0.02 * sin(time * 0.5 + theta * 3.0);
          float alpha = baseAlpha * timeEffect;
          
          // Clamp deflection
          alpha = clamp(alpha, -${LensingConfig.LENSING.MAX_DEFLECTION}, ${LensingConfig.LENSING.MAX_DEFLECTION});
          
          // Apply enhanced deflection with exponential falloff
          float falloffTerm = exp(-dist / (r * lensEffectFalloffScale));
          float newDist = dist + fade * alpha * falloffTerm * lensEffectAmplitude;
          
          // Add subtle noise for more realistic distortion
          float noiseScale = 0.001 * fade * falloffTerm;
          newDist += noiseScale * noise(uv * 100.0 + time * 0.1);
          
          // Calculate new UV coordinates
          vec2 offset = newDist * vec2(cos(theta), sin(theta));
          offset.x /= aspectRatio;
          uv = blackHoleCenter + offset;
        }
        
        // Enhanced event horizon rendering with improved transition
        float transitionDelta = transitionSoftness;
        float shadowMix = smoothstep(r - transitionDelta, r + transitionDelta, dist);
        
        // Sample background with bounds checking
        uv = clamp(uv, vec2(0.0), vec2(1.0));
        vec4 backgroundColor = texture2D(textureSampler, uv);
        
        // Create more realistic black hole appearance
        vec3 blackHoleColor = vec3(0.0);
        
        // Add subtle accretion disk glow near the event horizon
        if (dist > r && dist < r * 1.5) {
          float glowIntensity = (1.5 * r - dist) / (0.5 * r);
          glowIntensity = pow(glowIntensity, 2.0) * 0.1;
          blackHoleColor = mix(blackHoleColor, vec3(1.0, 0.6, 0.2), glowIntensity);
        }
        
        gl_FragColor = mix(vec4(blackHoleColor, 1.0), backgroundColor, shadowMix);
      }
    `;
    }
}
