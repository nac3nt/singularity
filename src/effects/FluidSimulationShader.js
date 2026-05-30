import { Effect } from 'babylonjs';

export class FluidSimulationShader {
    static createShaders() {
        // --- 1. Init Density Shader ---
        Effect.ShadersStore["fluidInitDensityFragmentShader"] = `
            precision highp float;
            varying vec2 vUV;
            uniform vec3 uColorInner;
            uniform vec3 uColorOuter;
            uniform float uInnerRadius;
            uniform float uOuterRadius;

            float hash(vec2 p) {
                p = fract(p * vec2(123.34, 456.21));
                p += dot(p, p + 45.32);
                return fract(p.x * p.y);
            }

            void main() {
                vec2 pos = vUV - vec2(0.5);
                float r = length(pos);
                vec3 col = vec3(0.0);

                if (r >= uInnerRadius && r <= uOuterRadius) {
                    float t = (r - uInnerRadius) / max(0.001, uOuterRadius - uInnerRadius);
                    col = mix(uColorInner, uColorOuter, pow(t, 0.75));
                    
                    // Add initial noise structure
                    float n = hash(vUV * 123.45) * 0.4 + 0.8;
                    col *= n;
                }
                
                gl_FragColor = vec4(clamp(col, vec3(0.0), vec3(1.0)), 1.0);
            }
        `;

        // --- 2. Init Velocity Shader ---
        Effect.ShadersStore["fluidInitVelocityFragmentShader"] = `
            precision highp float;
            varying vec2 vUV;
            uniform float uInnerRadius;
            uniform float uOuterRadius;
            uniform float uShearStrength;

            void main() {
                vec2 pos = vUV - vec2(0.5);
                float r = length(pos);
                vec2 vel = vec2(0.0);

                if (r >= uInnerRadius && r <= uOuterRadius) {
                    vec2 dir = vec2(-pos.y, pos.x) / max(r, 0.001);
                    float speed = uShearStrength * inversesqrt(max(r, 0.001));
                    vel = dir * speed;
                }
                
                // Encode to [0.0, 1.0] for UNSIGNED_BYTE
                gl_FragColor = vec4(vel * 0.5 + 0.5, 0.0, 1.0);
            }
        `;

        // --- 3. Advection Shader ---
        Effect.ShadersStore["fluidAdvectFragmentShader"] = `
            precision highp float;
            varying vec2 vUV;
            uniform sampler2D uVelocity;
            uniform sampler2D uSource;
            uniform float uDt;
            uniform float uDissipation;
            uniform float uIsVelocity;

            void main() {
                // Decode velocity from [0.0, 1.0] to [-1.0, 1.0]
                vec2 vel = texture2D(uVelocity, vUV).xy * 2.0 - 1.0;
                vec2 coord = vUV - uDt * vel;
                
                vec4 sampled = texture2D(uSource, coord);
                
                if (uIsVelocity > 0.5) {
                    // Decode advected velocity
                    vec2 sourceVel = sampled.xy * 2.0 - 1.0;
                    // Apply dissipation and encode back to [0.0, 1.0]
                    gl_FragColor = vec4(clamp(sourceVel * uDissipation, vec2(-1.0), vec2(1.0)) * 0.5 + 0.5, 0.0, 1.0);
                } else {
                    // Density is always positive
                    gl_FragColor = vec4(clamp(sampled.rgb * uDissipation, vec3(0.0), vec3(1.0)), 1.0);
                }
            }
        `;

        // --- 4. Add Force Shader ---
        Effect.ShadersStore["fluidAddForceFragmentShader"] = `
            precision highp float;
            varying vec2 vUV;
            uniform sampler2D uVelocity;
            uniform float uDt;
            uniform float uInnerRadius;
            uniform float uOuterRadius;
            uniform float uShearStrength;
            uniform float uRecoveryRate;
            uniform float uInflowStrength;

            // Flare trigger
            uniform vec2 uFlarePos;
            uniform vec2 uFlareForce;
            uniform float uFlareRadius;
            uniform float uFlareActive;

            void main() {
                vec2 pos = vUV - vec2(0.5);
                float r = length(pos);
                
                // Decode velocity
                vec2 vel = texture2D(uVelocity, vUV).xy * 2.0 - 1.0;

                if (r >= uInnerRadius && r <= uOuterRadius) {
                    // Keplerian shear
                    vec2 orbitDir = vec2(-pos.y, pos.x) / max(r, 0.001);
                    float orbitSpeed = uShearStrength * inversesqrt(max(r, 0.001));
                    
                    // Radial accretion pull
                    vec2 inflowDir = -pos / max(r, 0.001);
                    vec2 targetVel = orbitDir * orbitSpeed + inflowDir * uInflowStrength * orbitSpeed;
                    
                    vel = mix(vel, targetVel, uRecoveryRate * uDt);
                } else if (r < uInnerRadius) {
                    // Pull inwards at event horizon
                    vec2 pullDir = -pos / max(r, 0.001);
                    vel = mix(vel, pullDir * uShearStrength * 2.5, uDt * 8.0);
                } else {
                    vel *= exp(-uDt * 4.0);
                }

                // Add active automatic flare force
                if (uFlareActive > 0.5) {
                    float dist = distance(vUV, uFlarePos);
                    if (dist < uFlareRadius) {
                        float w = 1.0 - (dist / uFlareRadius);
                        w = smoothstep(0.0, 1.0, w);
                        vel += uFlareForce * w * 12.0 * uDt;
                    }
                }

                // Clamp to [-1.0, 1.0] and encode
                vel = clamp(vel, vec2(-1.0), vec2(1.0));
                gl_FragColor = vec4(vel * 0.5 + 0.5, 0.0, 1.0);
            }
        `;

        // --- 5. Add Density Shader ---
        Effect.ShadersStore["fluidAddDensityFragmentShader"] = `
            precision highp float;
            varying vec2 vUV;
            uniform sampler2D uDensity;
            uniform float uDt;
            uniform float uInnerRadius;
            uniform float uOuterRadius;
            uniform vec3 uColorInner;
            uniform vec3 uColorOuter;

            // Flare trigger
            uniform vec2 uFlarePos;
            uniform vec3 uFlareColor;
            uniform float uFlareRadius;
            uniform float uFlareActive;

            // Noise for replenishment
            uniform float uTime;

            float hash(vec2 p) {
                p = fract(p * vec2(123.34, 456.21));
                p += dot(p, p + 45.32);
                return fract(p.x * p.y);
            }

            void main() {
                vec4 density = texture2D(uDensity, vUV);
                vec2 pos = vUV - vec2(0.5);
                float r = length(pos);

                // Drain density at event horizon (fast drain inside inner radius)
                if (r < uInnerRadius) {
                    density *= exp(-uDt * 8.0);
                }

                // Replenish outer edge to keep disk fed
                if (r >= uInnerRadius && r <= uOuterRadius) {
                    float outerEdge = uOuterRadius * 0.95;
                    if (r > outerEdge) {
                        float feedAmount = smoothstep(outerEdge, uOuterRadius, r) * (1.0 - smoothstep(uOuterRadius, uOuterRadius + 0.02, r));
                        float n = hash(vUV + vec2(sin(uTime * 0.2))) * 0.3 + 0.85;
                        vec3 feedColor = uColorOuter * feedAmount * 2.8 * n;
                        density.rgb += feedColor * uDt;
                    }
                } else if (r > uOuterRadius) {
                    density *= exp(-uDt * 4.0);
                }

                // Add active automatic flare density
                if (uFlareActive > 0.5) {
                    float dist = distance(vUV, uFlarePos);
                    if (dist < uFlareRadius) {
                        float w = 1.0 - (dist / uFlareRadius);
                        w = smoothstep(0.0, 1.0, w);
                        density.rgb += uFlareColor * w * 1.5 * uDt;
                    }
                }

                density.rgb = clamp(density.rgb, vec3(0.0), vec3(1.0));
                density.a = 1.0;
                gl_FragColor = density;
            }
        `;

        // --- 6. Vorticity Shader ---
        Effect.ShadersStore["fluidVorticityFragmentShader"] = `
            precision highp float;
            varying vec2 vUV;
            uniform sampler2D uVelocity;
            uniform vec2 uScale;

            void main() {
                // Decode velocities
                float L = texture2D(uVelocity, vUV - vec2(uScale.x, 0.0)).y * 2.0 - 1.0;
                float R = texture2D(uVelocity, vUV + vec2(uScale.x, 0.0)).y * 2.0 - 1.0;
                float B = texture2D(uVelocity, vUV - vec2(0.0, uScale.y)).x * 2.0 - 1.0;
                float T = texture2D(uVelocity, vUV + vec2(0.0, uScale.y)).x * 2.0 - 1.0;

                float curl = 0.5 * (R - L - (T - B));
                gl_FragColor = vec4(curl, 0.0, 0.0, 1.0);
            }
        `;

        // --- 7. Vorticity Force Shader ---
        Effect.ShadersStore["fluidVorticityForceFragmentShader"] = `
            precision highp float;
            varying vec2 vUV;
            uniform sampler2D uVelocity;
            uniform sampler2D uVorticity;
            uniform vec2 uScale;
            uniform float uStrength;
            uniform float uDt;

            void main() {
                float L = abs(texture2D(uVorticity, vUV - vec2(uScale.x, 0.0)).x);
                float R = abs(texture2D(uVorticity, vUV + vec2(uScale.x, 0.0)).x);
                float B = abs(texture2D(uVorticity, vUV - vec2(0.0, uScale.y)).x);
                float T = abs(texture2D(uVorticity, vUV + vec2(0.0, uScale.y)).x);
                float C = abs(texture2D(uVorticity, vUV).x);

                vec2 force = vec2(0.0);
                vec2 N = 0.5 * vec2(R - L, T - B);
                float len = length(N);
                if (len > 0.0001) {
                    N = N / len;
                    force = vec2(N.y, -N.x) * C * uStrength;
                }

                // Decode, apply force, clamp, and encode
                vec2 vel = texture2D(uVelocity, vUV).xy * 2.0 - 1.0;
                vel = clamp(vel + force * uDt, vec2(-1.0), vec2(1.0));
                gl_FragColor = vec4(vel * 0.5 + 0.5, 0.0, 1.0);
            }
        `;

        // --- 8. Divergence Shader ---
        Effect.ShadersStore["fluidDivergenceFragmentShader"] = `
            precision highp float;
            varying vec2 vUV;
            uniform sampler2D uVelocity;
            uniform vec2 uScale;

            void main() {
                // Decode velocities
                float L = texture2D(uVelocity, vUV - vec2(uScale.x, 0.0)).x * 2.0 - 1.0;
                float R = texture2D(uVelocity, vUV + vec2(uScale.x, 0.0)).x * 2.0 - 1.0;
                float B = texture2D(uVelocity, vUV - vec2(0.0, uScale.y)).y * 2.0 - 1.0;
                float T = texture2D(uVelocity, vUV + vec2(0.0, uScale.y)).y * 2.0 - 1.0;

                float div = 0.5 * (R - L + T - B);
                gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
            }
        `;

        // --- 9. Jacobi Pressure Shader ---
        Effect.ShadersStore["fluidJacobiFragmentShader"] = `
            precision highp float;
            varying vec2 vUV;
            uniform sampler2D uPressure;
            uniform sampler2D uDivergence;
            uniform vec2 uScale;

            void main() {
                // Decode pressure values
                float L = texture2D(uPressure, vUV - vec2(uScale.x, 0.0)).x * 2.0 - 1.0;
                float R = texture2D(uPressure, vUV + vec2(uScale.x, 0.0)).x * 2.0 - 1.0;
                float B = texture2D(uPressure, vUV - vec2(0.0, uScale.y)).x * 2.0 - 1.0;
                float T = texture2D(uPressure, vUV + vec2(0.0, uScale.y)).x * 2.0 - 1.0;

                float div = texture2D(uDivergence, vUV).x;

                float p = (L + R + B + T - div) * 0.25;
                
                // Clamp and encode back to [0.0, 1.0]
                p = clamp(p, -1.0, 1.0);
                gl_FragColor = vec4(p * 0.5 + 0.5, 0.0, 0.0, 1.0);
            }
        `;

        // --- 10. Project Shader ---
        Effect.ShadersStore["fluidProjectFragmentShader"] = `
            precision highp float;
            varying vec2 vUV;
            uniform sampler2D uVelocity;
            uniform sampler2D uPressure;
            uniform vec2 uScale;

            void main() {
                // Decode pressure values
                float L = texture2D(uPressure, vUV - vec2(uScale.x, 0.0)).x * 2.0 - 1.0;
                float R = texture2D(uPressure, vUV + vec2(uScale.x, 0.0)).x * 2.0 - 1.0;
                float B = texture2D(uPressure, vUV - vec2(0.0, uScale.y)).x * 2.0 - 1.0;
                float T = texture2D(uPressure, vUV + vec2(0.0, uScale.y)).x * 2.0 - 1.0;

                // Decode velocity
                vec2 vel = texture2D(uVelocity, vUV).xy * 2.0 - 1.0;
                vec2 grad = 0.5 * vec2(R - L, T - B);

                // Correct velocity, clamp, and encode
                vec2 correctedVel = clamp(vel - grad, vec2(-1.0), vec2(1.0));
                gl_FragColor = vec4(correctedVel * 0.5 + 0.5, 0.0, 1.0);
            }
        `;
    }
}
