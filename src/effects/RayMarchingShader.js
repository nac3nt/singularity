import { Effect } from 'babylonjs';

export class RayMarchingShader {
    static createShader() {
        Effect.ShadersStore["blackHoleRayMarchFragmentShader"] = `
      precision highp float;

      // Uniforms
      uniform float time;
      uniform vec2 resolution;
      uniform vec3 cameraPosition;
      uniform vec3 cameraTarget;
      uniform vec3 cameraUp;
      uniform samplerCube envTexture; // HDR Environment (Cubemap)
      uniform float cameraTanHalfFov;
      
      // Black Hole Parameters
      uniform float schwarzschildRadius;
      uniform float diskInnerRadius;
      uniform float diskOuterRadius;
      uniform float diskHeight;
      uniform vec3 diskColorInner;
      uniform vec3 diskColorOuter;
      uniform float diskOpacity;
      uniform float diskNoiseScale;
      uniform float diskNoiseSpeed;
      uniform float dopplerStrength;
      uniform float redshiftStrength;
      
      // Performance & Physics controls
      uniform float maxSteps;
      uniform float colorShiftEnabled;
      uniform float blackHoleSpin;
      uniform float lensStrength;

      // Constants
      #define MAX_STEPS 500
      #define MAX_DIST 1000.0
      #define SURF_DIST 0.01
      #define PI 3.14159265359

      // --- Noise Functions ---
      float hash(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
      }

      float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 5; i++) {
              v += a * noise(p);
              p *= 2.0;
              a *= 0.5;
          }
          return v;
      }

      float hash3(vec3 p) {
          p = fract(p * vec3(123.34, 456.21, 789.43));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y * p.z);
      }

      // --- Ray Marching & Physics ---

      // Rotate vector
      vec3 rotateY(vec3 v, float angle) {
          float c = cos(angle);
          float s = sin(angle);
          return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
      }

      // Get ray direction
      vec3 getRayDir(vec2 uv, vec3 p, vec3 l, vec3 u, float tanHalfFov) {
          vec3 f = normalize(l - p);
          vec3 r = normalize(cross(f, u));
          vec3 up = cross(r, f);
          return normalize(f + tanHalfFov * (uv.x * r + uv.y * up));
      }

      // Disk height tapers from thick at inner edge to thin at outer edge
      float getLocalDiskHeight(float r) {
          float rNorm = clamp((r - diskInnerRadius) / (diskOuterRadius - diskInnerRadius), 0.0, 1.0);
          return diskHeight * (1.0 - 0.8 * rNorm);
      }

      // Volumetric 3D Accretion Disk Density using domain warping in seamless Cartesian coordinates
      float getDiskDensity(vec3 p) {
          float r = length(p.xz);
          if (r < diskInnerRadius || r > diskOuterRadius) return 0.0;
          
          float localHeight = getLocalDiskHeight(r);
          if (abs(p.y) > localHeight) return 0.0;

          // Differential rotation angle (Keplerian shearing: inner parts rotate faster)
          // The rotation angle decays as 1/sqrt(r) to match Kepler's orbital velocity
          float rotationAngle = time * diskNoiseSpeed * sqrt(diskInnerRadius / max(r, 0.0001));
          
          float c = cos(rotationAngle);
          float s = sin(rotationAngle);
          vec2 swirledXZ = vec2(
              c * p.x - s * p.z,
              s * p.x + c * p.z
          );

          // Continuous Cartesian UV mapping (no polar coordinate angle wrapping seams!)
          vec2 uv = swirledXZ * diskNoiseScale;
          
          float w1 = fbm(uv);
          float w2 = fbm(uv + vec2(w1, time * 0.05));
          float noiseVal = fbm(uv + vec2(w2 * 1.5, w1 * 0.4));
          
          // Smooth radial boundaries
          float innerFade = smoothstep(diskInnerRadius, diskInnerRadius + 1.5, r);
          
          // Gradual outer boundary fade spanning from the peak of the inner fade to the outer edge.
          // We limit fadeStart to at least the halfway point of the disk to handle narrow disk settings robustly.
          float fadeStart = min(diskInnerRadius + 1.5, diskInnerRadius + 0.5 * (diskOuterRadius - diskInnerRadius));
          float outerFade = smoothstep(diskOuterRadius, fadeStart, r);
          
          // Gaussian vertical density profile (disk is densest in the midplane)
          float distToCenterPlane = abs(p.y) / localHeight;
          float verticalFade = exp(-distToCenterPlane * distToCenterPlane * 2.5);

          return noiseVal * innerFade * outerFade * verticalFade * diskOpacity;
      }

      // Doppler & Redshift Calculation
      vec3 applyRelativisticEffects(vec3 color, vec3 p, vec3 dir) {
          float r = length(p);
          
          // True Keplerian velocity for Schwarzschild
          float v = sqrt(0.5 * schwarzschildRadius / r); 
          float gamma = 1.0 / sqrt(max(0.0001, 1.0 - v * v));
          
          // Direction of disk rotation (counter-clockwise in XZ plane)
          vec3 flowDir = vec3(0.0);
          float xzLen = length(vec2(p.x, p.z));
          if (xzLen > 0.0001) {
              flowDir = vec3(-p.z / xzLen, 0.0, p.x / xzLen);
          }
          float cosTheta = dot(dir, flowDir);
          
          // Relativistic Doppler factor
          float doppler = 1.0 / max(0.0001, gamma * (1.0 - v * cosTheta));
          
          // Gravitational Time Dilation (Redshift)
          float redshift = sqrt(max(0.0, 1.0 - schwarzschildRadius / r));
          
          // Total shift
          float totalShift = doppler * redshift;
          
          // Bolometric intensity scales with the cube of the shift
          float shiftFactor = pow(max(totalShift, 0.0001), 3.0 * redshiftStrength) * dopplerStrength + (1.0 - dopplerStrength);
          vec3 resultColor = color * shiftFactor;

          // Wavelength Shift (Doppler color temperature shift)
          if (colorShiftEnabled > 0.5) {
              if (totalShift > 1.0) {
                  // Blueshift: shift towards high temperature cyan/blue/white
                  float factor = clamp((totalShift - 1.0) * 1.5, 0.0, 0.9);
                  vec3 blueTint = vec3(0.65, 0.85, 1.15) * length(resultColor);
                  resultColor = mix(resultColor, blueTint, factor);
              } else {
                  // Redshift: shift towards low temperature deep red/infrared
                  float factor = clamp((1.0 - totalShift) * 1.8, 0.0, 0.95);
                  vec3 redTint = vec3(1.2, 0.35, 0.08) * length(resultColor) * totalShift;
                  resultColor = mix(resultColor, redTint, factor);
              }
          }
          
          return resultColor;
      }

      // Subtle white nebula wisps (procedural)
      vec3 renderNebula(vec3 dir) {
          vec3 p = dir * 2.0;
          float cloud = fbm(p.xy * 0.4 + p.z * 0.3);
          cloud = cloud * 0.7 + fbm(p.zy * 0.6 + p.x * 0.4 + 20.0) * 0.3;
          cloud = pow(cloud * 0.6 + 0.4, 1.5);
          float white = cloud * 0.05;
          return vec3(white);
      }

      // Highly realistic lensed starfield with O, B, A, F, G, K, M spectral colors
      vec3 renderStars(vec3 rd) {
          vec3 color = vec3(0.0);
          
          // Draw three layers of stars at different depth frequencies
          for (int i = 0; i < 3; i++) {
              float scale = 180.0 + float(i) * 120.0;
              vec3 p = rd * scale;
              vec3 ip = floor(p);
              vec3 fp = fract(p);
              
              // Retrieve deterministic pseudorandom offset
              float h1 = hash3(ip);
              float h2 = hash3(ip + vec3(17.31, 31.42, 59.83));
              float h3 = hash3(ip + vec3(93.12, 11.23, 47.92));
              
              // Only draw if we hit the spawn threshold (sparse distribution)
              if (h1 > 0.985) {
                  vec3 offset = vec3(h1, h2, h3);
                  vec3 pos = fp - offset;
                  float d = length(pos);
                  
                  // Star intensity falloff
                  float size = 0.015 + 0.02 * h2;
                  float star = smoothstep(size, 0.0, d);
                  
                  if (star > 0.0) {
                      // Stellar color based on spectral types
                      vec3 starColor = vec3(1.0);
                      float tempSeed = h3;
                      
                      if (tempSeed < 0.15) {
                          starColor = vec3(0.5, 0.7, 1.0); // O/B: Hot blue-white
                      } else if (tempSeed < 0.35) {
                          starColor = vec3(0.8, 0.9, 1.0); // A: White-blue
                      } else if (tempSeed < 0.65) {
                          starColor = vec3(1.0, 1.0, 1.0); // F/G: Pure white/Yellow-white
                      } else if (tempSeed < 0.85) {
                          starColor = vec3(1.0, 0.88, 0.65); // K: Amber-orange
                      } else {
                          starColor = vec3(1.0, 0.38, 0.18); // M: Cool red-orange
                      }
                      
                      // Twinkle animation
                      float twinkleSpeed = 2.0 + h1 * 4.0;
                      float twinkle = 0.5 + 0.5 * sin(time * twinkleSpeed + h2 * 10.0);
                      
                      color += starColor * star * twinkle * 2.0;
                  }
              }
          }
          return color;
      }

      void main(void) {
          vec2 uv = gl_FragCoord.xy / resolution.xy;
          uv = uv * 2.0 - 1.0;
          uv.x *= resolution.x / resolution.y;

          vec3 ro = cameraPosition;
          vec3 rd = getRayDir(uv, ro, cameraTarget, cameraUp, cameraTanHalfFov);

          vec3 col = vec3(0.0);
          vec3 p = ro;
          
          // Accumulate disk color (volumetric fields)
          vec3 diskCol = vec3(0.0);
          float diskAlpha = 0.0;

          bool hitHorizon = false;

          // Ray Marching Loop
          for(int i = 0; i < MAX_STEPS; i++) {
              if (float(i) >= maxSteps) {
                  break;
              }
              
              float r = length(p);
              
              // Event Horizon Check
              if (r < schwarzschildRadius) {
                  hitHorizon = true;
                  break;
              }
              
              // Escape Check
              if (r > MAX_DIST) {
                  break;
              }

              // Geodesic Light Bending (Exact Schwarzschild Geodesic Acceleration)
              vec3 h = cross(p, rd); // Angular momentum (conserved)
              float h2 = dot(h, h);
              float r2 = r * r;
              vec3 acceleration = -1.5 * schwarzschildRadius * p * h2 / max(r2 * r2 * r, 0.0001) * lensStrength;
              
              // Frame dragging (Lense-Thirring effect) pulling light in direction of spin (around Y-axis)
              vec3 spinAxis = vec3(0.0, 1.0, 0.0);
              float dragFactor = 2.0 * blackHoleSpin / max(r2 * r, 0.0001);
              vec3 dragForce = cross(spinAxis, p) * dragFactor;
              
              // Adaptive step size: shrink near photon sphere (1.5 Rs) for accuracy
              // and limit near disk for precise volumetric density sampling
              float distToPhotonSphere = abs(r - 1.5 * schwarzschildRadius);
              float localDiskHeight = (r > diskInnerRadius && r < diskOuterRadius) ? getLocalDiskHeight(r) : diskHeight;
              float diskDist = max(0.0, abs(p.y) - localDiskHeight * 2.0);
              float diskStepLimit = diskDist + localDiskHeight;
              float safeStep = max(0.1, min(distToPhotonSphere * 0.1, diskStepLimit));
              float stepSize = min(safeStep, r * 0.05);
              
              // Update direction and position (Semi-Implicit Euler step)
              rd = normalize(rd + (acceleration + dragForce) * stepSize);
              
              // Check volumetric density inside disk
              float checkHeight = (r > diskInnerRadius && r < diskOuterRadius) ? getLocalDiskHeight(r) * 2.0 : 0.0;
              bool insideDisk = (checkHeight > 0.0 && abs(p.y) < checkHeight);
              
              if (insideDisk) {
                  // Scale step size dynamically based on disk height to prevent step starvation (lag and black clipping)
                  float diskStepSize = max(0.02, diskHeight * 0.12);
                  stepSize = min(stepSize, diskStepSize);
                  
                  float stepDiskDensity = getDiskDensity(p) * stepSize;
                  
                  if (stepDiskDensity > 0.0005) {
                      // Temperature-based radial distribution approximating Novikov-Thorne temperature profile
                      float t = (r - diskInnerRadius) / (diskOuterRadius - diskInnerRadius);
                      vec3 diskBaseColor = mix(diskColorInner, diskColorOuter, pow(max(t, 0.0), 0.75));
                      
                      // Apply Relativistic Effects & Doppler Wavelength shifting
                      vec3 diskLensedColor = applyRelativisticEffects(diskBaseColor, p, rd);
                      
                      // Volumetric radiative transfer blend: add emission and subtract background light
                      float alpha = clamp(stepDiskDensity, 0.0, 1.0);
                      diskCol += diskLensedColor * stepDiskDensity * (1.0 - diskAlpha);
                      diskAlpha += alpha * (1.0 - diskAlpha);
                      
                      if (diskAlpha > 0.98) {
                          diskAlpha = 1.0;
                          break;
                      }
                  }
              }
              
              p += rd * stepSize;
          }

          // Background (Environment Cubemap + procedural starfield + nebula clouds)
          if (!hitHorizon && diskAlpha < 0.99) {
              // Full environmental HDR texture (gives bright space colors for clear lensing)
              vec3 bg = textureCube(envTexture, rd).rgb;
              
              // Procedural stars (lensed by bent light rays)
              vec3 stars = renderStars(rd);
              
              // Full procedural nebulae
              vec3 nebula = renderNebula(rd);
              
              vec3 finalSpace = bg + stars + nebula;
              
              // Attenuate background light using the accumulated volumetric absorption (diskAlpha)
              col = finalSpace * (1.0 - diskAlpha) + diskCol * 0.35;
          } else {
              col = diskCol * 0.35;
          }

          gl_FragColor = vec4(col, 1.0);
      }
    `;
    }
}
