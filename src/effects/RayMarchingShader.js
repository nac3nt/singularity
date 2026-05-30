import { Effect } from 'babylonjs';

export class RayMarchingShader {
    static createShader() {
        Effect.ShadersStore["blackHoleRayMarchFragmentShader"] = `
      precision highp float;

      // Uniforms
      uniform float time;
      uniform float diskTime;
      uniform vec2 resolution;
      uniform vec3 cameraPosition;
      uniform vec3 cameraTarget;
      uniform vec3 cameraUp;
      uniform samplerCube envTexture; // HDR Environment (Cubemap)
      uniform sampler2D fluidDensityTexture; // Dynamic GPGPU fluid simulation texture
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
      uniform float atmosphereEnabled;
      uniform float filmGrainEnabled;
      uniform float invDiskWidth;
      uniform float sqrtDiskInnerRadius;
      uniform float sqrtHalfRs;

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

      float fbm3(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 3; i++) {
              v += a * noise(p);
              p *= 2.0;
              a *= 0.5;
          }
          return v;
      }

      float fbm4(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
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
          float rNorm = clamp((r - diskInnerRadius) * invDiskWidth, 0.0, 1.0);
          return diskHeight * (1.0 - 0.8 * rNorm);
      }

      // Volumetric 3D Accretion Disk Density and Color from GPGPU Fluid Simulation
      vec4 getDiskDensityAndColor(vec3 p) {
          float r = length(p.xz);
          if (r < diskInnerRadius || r > diskOuterRadius) return vec4(0.0);
          
          float localHeight = getLocalDiskHeight(r);
          if (abs(p.y) > localHeight * 2.0) return vec4(0.0);

          // Map Cartesian coordinates to UV space [-diskOuterRadius, diskOuterRadius] -> [0.0, 1.0]
          vec2 uv = p.xz / (2.0 * diskOuterRadius) + 0.5;
          vec4 fluidSample = texture2D(fluidDensityTexture, uv);
          
          float rawDensity = length(fluidSample.rgb); // Use intensity of colors as density
          float fluidPresence = smoothstep(0.05, 0.45, rawDensity);
          float rNorm = clamp((r - diskInnerRadius) * invDiskWidth, 0.0, 1.0);
          vec3 radialColor = mix(diskColorInner, diskColorOuter, pow(max(rNorm, 0.0), 0.75));
          vec3 fluidColor = max(fluidSample.rgb, radialColor * 0.2);
          vec3 baseColor = mix(radialColor, fluidColor, fluidPresence * 0.75);
          baseColor *= 0.65 + rawDensity * 0.75;

          // Smooth radial boundaries
          float innerFade = smoothstep(diskInnerRadius, diskInnerRadius + 1.2, r);
          
          // Gradual outer boundary fade spanning from the peak of the inner fade to the outer edge.
          float fadeStart = min(diskInnerRadius + 1.2, diskInnerRadius + 0.5 * (diskOuterRadius - diskInnerRadius));
          float outerFade = smoothstep(diskOuterRadius, fadeStart, r);
          
          // Gaussian vertical density profile (disk is densest in the midplane)
          float distToCenterPlane = abs(p.y) / localHeight;
          float verticalFade = exp(-distToCenterPlane * distToCenterPlane * 2.0);

          float density = max(rawDensity, 0.14) * innerFade * outerFade * verticalFade * diskOpacity * 4.5;
          return vec4(baseColor, density);
      }

      // Doppler & Redshift Calculation
      vec3 applyRelativisticEffects(vec3 color, vec3 p, vec3 dir) {
          float r = length(p);
          
          // True Keplerian velocity for Schwarzschild (optimized to avoid division and sqrt on GPU)
          float v = sqrtHalfRs * inversesqrt(max(r, 0.0001)); 
          float gamma = inversesqrt(max(0.0001, 1.0 - v * v));
          
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
          float redshift = sqrt(max(0.0, 1.0 - schwarzschildRadius / max(r, 0.0001)));
          
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

      // Rich multi-chromatic procedural nebula (cosmic dust & gas)
      vec3 renderNebula(vec3 dir) {
          vec3 p = dir * 2.5;
          
          // Layer 1: Base gas density
          float n1 = fbm(p.xy * 0.3 + p.z * 0.2);
          // Layer 2: Fine structures and turbulence
          float n2 = fbm(p.zy * 0.5 + p.x * 0.3 + vec2(12.3, 45.6));
          
          float density = n1 * 0.65 + n2 * 0.35;
          density = pow(density, 2.4); // Sharpen boundaries & increase contrast
          
          // Color palettes based on FBM coordinates and density
          vec3 col1 = vec3(0.08, 0.01, 0.18); // Deep space violet
          vec3 col2 = vec3(0.0, 0.35, 0.45);  // Teal ionized hydrogen
          vec3 col3 = vec3(0.45, 0.08, 0.22); // Magenta dust lanes
          
          // Interpolate colors based on noise patterns
          vec3 gasColor = mix(col1, col2, n1);
          gasColor = mix(gasColor, col3, n2 * 0.8);
          
          // Apply density mask and boost glow intensity (from 0.45 to 0.85)
          return gasColor * density * 0.85;
      }

      // Highly realistic lensed starfield with galactic density, diffraction spikes, and atmospheric control
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
              
              // Modulation of star density based on galactic equator distance
              vec3 cellDir = normalize(ip + vec3(0.5));
              float distToEquator = abs(dot(cellDir, normalize(vec3(0.18, 0.96, 0.18))));
              float densityMod = exp(-distToEquator * 3.5);
              float threshold = 0.998 - 0.022 * densityMod;
              
              // Only draw if we hit the spawn threshold (sparse distribution)
              if (h1 > threshold) {
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
                      
                      // Atmospheric or Space Twinkle animation
                      float twinkle = 1.0;
                      if (atmosphereEnabled > 0.5) {
                          // Rapid atmospheric scintillation with varying frequency per star
                          float twinkleSpeed = 4.0 + h1 * 6.0;
                          float wave = sin(time * twinkleSpeed) * 0.6 + cos(time * twinkleSpeed * 1.6 + h2 * 10.0) * 0.4;
                          twinkle = 0.15 + 0.85 * (0.5 + 0.5 * wave);
                      } else {
                          // Space mode: slow, elegant physical sensor shimmer to keep the space environment alive
                          float twinkleSpeed = 1.2 + h1 * 1.8;
                          float wave = sin(time * twinkleSpeed) * 0.7 + cos(time * twinkleSpeed * 1.4 + h2 * 8.0) * 0.3;
                          twinkle = 0.7 + 0.3 * (0.5 + 0.5 * wave);
                      }
                      
                      // Add diffraction spikes for very bright stars
                      if (h2 > 0.88) {
                          // Project the displacement onto the plane perpendicular to the ray direction
                          vec3 r_proj = pos - dot(pos, rd) * rd;
                          
                          // Establish perpendicular coordinate system on the tangent plane
                          vec3 right = normalize(cross(rd, vec3(0.0, 1.0, 0.001)));
                          vec3 up = cross(right, rd);
                          
                          float x = dot(r_proj, right);
                          float y = dot(r_proj, up);
                          
                          float spikeScale = size * 7.0;
                          float spike1 = smoothstep(0.002, 0.0, abs(x)) * smoothstep(spikeScale, 0.0, abs(y));
                          float spike2 = smoothstep(0.002, 0.0, abs(y)) * smoothstep(spikeScale, 0.0, abs(x));
                          
                          star += (spike1 + spike2) * 0.5 * h2;
                      }
                      
                      color += starColor * star * twinkle * 3.2;
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
              
              // CPU division elimination optimization inside loop:
              // Replace 2 separate GPU divisions with a single reciprocal calculation
              float invR = 1.0 / max(r, 0.0001);
              float invR2 = invR * invR;
              float invR3 = invR2 * invR;
              float invR5 = invR2 * invR3;
              
              vec3 acceleration = -1.5 * schwarzschildRadius * p * h2 * invR5 * lensStrength;
              
              // Frame dragging (Lense-Thirring effect) pulling light in direction of spin (around Y-axis)
              vec3 spinAxis = vec3(0.0, 1.0, 0.0);
              float dragFactor = 2.0 * blackHoleSpin * invR3;
              vec3 dragForce = cross(spinAxis, p) * dragFactor;
              
              // Adaptive step size: shrink near photon sphere (1.5 Rs) for accuracy
              // and limit near disk for precise volumetric density sampling.
              // Calculate the actual distance to the disk volume to avoid clamping step size at large radii.
              float distToPhotonSphere = abs(r - 1.5 * schwarzschildRadius);
              float localDiskHeight = (r > diskInnerRadius && r < diskOuterRadius) ? getLocalDiskHeight(r) : diskHeight;
              
              float distToDisk = 0.0;
              if (r > diskOuterRadius) {
                  distToDisk = r - diskOuterRadius;
              } else if (r < diskInnerRadius) {
                  distToDisk = diskInnerRadius - r;
              } else {
                  distToDisk = max(0.0, abs(p.y) - localDiskHeight * 2.0);
              }
              
              float diskStepLimit = distToDisk + localDiskHeight;
              float safeStep = max(0.1, min(distToPhotonSphere * 0.1, diskStepLimit));
              
              // Ray escape step-size acceleration:
              // If we are outside the disk's outer radius, traveling outward, and away from the disk midplane,
              // we can take much larger step sizes because space is nearly flat here.
              float stepFactor = 0.05;
              if (r > diskOuterRadius && dot(p, rd) > 0.0 && abs(p.y) > localDiskHeight * 2.0) {
                  stepFactor = 0.20;
              }
              float stepSize = min(safeStep, r * stepFactor);
              
              // Update direction and position (Semi-Implicit Euler step)
              rd = normalize(rd + (acceleration + dragForce) * stepSize);
              
              // Check volumetric density inside disk
              float checkHeight = (r > diskInnerRadius && r < diskOuterRadius) ? getLocalDiskHeight(r) * 2.0 : 0.0;
              bool insideDisk = (checkHeight > 0.0 && abs(p.y) < checkHeight);
              
              if (insideDisk) {
                  // Scale step size dynamically based on disk height and ray vertical direction (angle)
                  // to prevent step starvation for steep rays, while allowing fast traversal for edge-on rays.
                  float diskStepSize = max(0.02, (diskHeight * 0.12) / max(abs(rd.y), 0.005));
                  stepSize = min(stepSize, diskStepSize);
                  
                  vec4 diskSample = getDiskDensityAndColor(p);
                  float grazingDamping = mix(0.55, 1.0, smoothstep(0.03, 0.18, abs(rd.y)));
                  float stepDiskDensity = diskSample.w * stepSize * grazingDamping;
                  
                  if (stepDiskDensity > 0.0005) {
                      vec3 diskBaseColor = diskSample.rgb;
                      
                      // Apply Relativistic Effects & Doppler Wavelength shifting
                      vec3 diskLensedColor = applyRelativisticEffects(diskBaseColor, p, rd);
                      
                      // Volumetric radiative transfer blend: add emission and subtract background light
                      float alpha = clamp(stepDiskDensity * 0.45, 0.0, 0.85);
                      diskCol += diskLensedColor * stepDiskDensity * 1.2 * (1.0 - diskAlpha);
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
              bg = bg * 1.6; // Scale brightness
              bg = pow(bg, vec3(1.15)); // Adjust contrast
              
              // Procedural stars (lensed by bent light rays)
              vec3 stars = renderStars(rd);
              
              // Full procedural nebulae
              vec3 nebula = renderNebula(rd);
              
              vec3 finalSpace = bg + stars + nebula;
              
              // Attenuate background light using the accumulated volumetric absorption (diskAlpha)
              col = finalSpace * (1.0 - diskAlpha) + diskCol * 0.65;
          } else {
              col = diskCol * 0.65;
          }

          // Procedural film grain (very cheap, eliminates color banding in dark space)
          if (filmGrainEnabled > 0.5) {
              // High-frequency isotropic white noise changing chaotically every frame to avoid striping
              vec2 seed = gl_FragCoord.xy + vec2(sin(time * 9.1), cos(time * 15.3)) * 100.0;
              float grain = fract(sin(dot(seed, vec2(12.9898, 78.233))) * 43758.5453);
              col += vec3(grain - 0.5) * 0.035;
          }

          gl_FragColor = vec4(col, 1.0);
      }
    `;
    }
}
