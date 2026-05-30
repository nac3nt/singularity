import { RenderTargetTexture, Texture, Engine, EffectRenderer, EffectWrapper, Color4 } from 'babylonjs';
import { FluidSimulationShader } from '../effects/FluidSimulationShader.js';

class DoubleBuffer {
    constructor(rtt1, rtt2) {
        this.read = rtt1;
        this.write = rtt2;
    }
    swap() {
        const temp = this.read;
        this.read = this.write;
        this.write = temp;
    }
    dispose() {
        if (this.read) this.read.dispose();
        if (this.write) this.write.dispose();
    }
}

export class FluidSimulation {
    constructor(scene, engine, settings) {
        this.scene = scene;
        this.engine = engine;
        this.settings = settings;

        // Register custom fluid shaders in ShadersStore
        FluidSimulationShader.createShaders();

        // Create EffectRenderer for fullscreen quad passes
        this.effectRenderer = new EffectRenderer(this.engine);

        // Grid resolution
        this.resolution = settings.fluidResolution || 256;

        this.initEffectWrappers();
        this.initTextures();

        // Active flare properties
        this.flare = {
            active: 0.0,
            pos: { x: 0.5, y: 0.5 },
            force: { x: 0.0, y: 0.0 },
            color: { r: 1.0, g: 1.0, b: 1.0 },
            radius: 0.04,
            timer: 0.0
        };

        this.resetRequested = true;
    }

    initEffectWrappers() {
        this.initDensityWrapper = this.createFluidEffectWrapper({
            engine: this.engine,
            name: "fluidInitDensity",
            fragmentShader: "fluidInitDensity",
            uniformNames: ["uColorInner", "uColorOuter", "uInnerRadius", "uOuterRadius"]
        });

        this.initVelocityWrapper = this.createFluidEffectWrapper({
            engine: this.engine,
            name: "fluidInitVelocity",
            fragmentShader: "fluidInitVelocity",
            uniformNames: ["uInnerRadius", "uOuterRadius", "uShearStrength"]
        });

        this.advectWrapper = this.createFluidEffectWrapper({
            engine: this.engine,
            name: "fluidAdvect",
            fragmentShader: "fluidAdvect",
            uniformNames: ["uDt", "uDissipation", "uIsVelocity"],
            samplerNames: ["uVelocity", "uSource"]
        });

        this.addForceWrapper = this.createFluidEffectWrapper({
            engine: this.engine,
            name: "fluidAddForce",
            fragmentShader: "fluidAddForce",
            uniformNames: [
                "uDt", "uInnerRadius", "uOuterRadius", "uShearStrength", 
                "uRecoveryRate", "uInflowStrength",
                "uFlarePos", "uFlareForce", "uFlareRadius", "uFlareActive"
            ],
            samplerNames: ["uVelocity"]
        });

        this.addDensityWrapper = this.createFluidEffectWrapper({
            engine: this.engine,
            name: "fluidAddDensity",
            fragmentShader: "fluidAddDensity",
            uniformNames: [
                "uDt", "uInnerRadius", "uOuterRadius", "uColorInner", "uColorOuter",
                "uFlarePos", "uFlareColor", "uFlareRadius", "uFlareActive", "uTime"
            ],
            samplerNames: ["uDensity"]
        });

        this.vorticityWrapper = this.createFluidEffectWrapper({
            engine: this.engine,
            name: "fluidVorticity",
            fragmentShader: "fluidVorticity",
            uniformNames: ["uScale"],
            samplerNames: ["uVelocity"]
        });

        this.vorticityForceWrapper = this.createFluidEffectWrapper({
            engine: this.engine,
            name: "fluidVorticityForce",
            fragmentShader: "fluidVorticityForce",
            uniformNames: ["uScale", "uStrength", "uDt"],
            samplerNames: ["uVelocity", "uVorticity"]
        });

        this.divergenceWrapper = this.createFluidEffectWrapper({
            engine: this.engine,
            name: "fluidDivergence",
            fragmentShader: "fluidDivergence",
            uniformNames: ["uScale"],
            samplerNames: ["uVelocity"]
        });

        this.jacobiWrapper = this.createFluidEffectWrapper({
            engine: this.engine,
            name: "fluidJacobi",
            fragmentShader: "fluidJacobi",
            uniformNames: ["uScale"],
            samplerNames: ["uPressure", "uDivergence"]
        });

        this.projectWrapper = this.createFluidEffectWrapper({
            engine: this.engine,
            name: "fluidProject",
            fragmentShader: "fluidProject",
            uniformNames: ["uScale"],
            samplerNames: ["uVelocity", "uPressure"]
        });
    }

    createFluidEffectWrapper(options) {
        return new EffectWrapper({
            ...options,
            useShaderStore: true
        });
    }

    createRTT(name) {
        const options = {
            generateMipMaps: false,
            type: Engine.TEXTURETYPE_UNSIGNED_BYTE,
            format: Engine.TEXTUREFORMAT_RGBA,
            samplingMode: Texture.BILINEAR_SAMPLINGMODE,
            generateDepthBuffer: false,
            generateStencilBuffer: false
        };
        return new RenderTargetTexture(name, this.resolution, this.scene, options);
    }

    initTextures() {
        this.velocityBuffer = new DoubleBuffer(
            this.createRTT("velocity1"),
            this.createRTT("velocity2")
        );

        this.densityBuffer = new DoubleBuffer(
            this.createRTT("density1"),
            this.createRTT("density2")
        );

        this.pressureBuffer = new DoubleBuffer(
            this.createRTT("pressure1"),
            this.createRTT("pressure2")
        );

        this.divergenceRTT = this.createRTT("divergence");
        this.vorticityRTT = this.createRTT("vorticity");
    }

    initializeDisk() {
        this.resetRequested = true;
    }

    initializeDiskData() {
        const initDensityEffect = this.initDensityWrapper.effect;
        const initVelocityEffect = this.initVelocityWrapper.effect;

        if (initDensityEffect && initVelocityEffect && initDensityEffect.isReady() && initVelocityEffect.isReady()) {
            const innerR = (this.settings.diskInnerRadius || 3.0) / (this.settings.diskOuterRadius || 12.0) * 0.5;
            const outerR = 0.5;
            const cInner = this.settings.colorInner || { r: 0.9, g: 0.85, b: 0.6 };
            const cOuter = this.settings.colorOuter || { r: 0.6, g: 0.15, b: 0.05 };
            const shearStrength = 0.08 * (this.settings.diskNoiseSpeed || 0.85);

            // 1. Initialize Density RTTs
            initDensityEffect.setFloat3("uColorInner", cInner.r, cInner.g, cInner.b);
            initDensityEffect.setFloat3("uColorOuter", cOuter.r, cOuter.g, cOuter.b);
            initDensityEffect.setFloat("uInnerRadius", innerR);
            initDensityEffect.setFloat("uOuterRadius", outerR);
            this.effectRenderer.render(this.initDensityWrapper, this.densityBuffer.read);
            this.effectRenderer.render(this.initDensityWrapper, this.densityBuffer.write);

            // 2. Initialize Velocity RTTs
            initVelocityEffect.setFloat("uInnerRadius", innerR);
            initVelocityEffect.setFloat("uOuterRadius", outerR);
            initVelocityEffect.setFloat("uShearStrength", shearStrength);
            this.effectRenderer.render(this.initVelocityWrapper, this.velocityBuffer.read);
            this.effectRenderer.render(this.initVelocityWrapper, this.velocityBuffer.write);

            // 3. Clear pressure textures
            this.clearRTT(this.pressureBuffer.read);
            this.clearRTT(this.pressureBuffer.write);
            
            this.resetRequested = false;
        } else {
            // Retry next frame if shaders aren't compiled yet
            this.resetRequested = true;
        }
    }

    clearRTT(rtt) {
        // Babylon 9 binds the render target wrapper, not the internal texture.
        if (rtt && rtt.renderTarget) {
            this.engine.bindFramebuffer(rtt.renderTarget);
            this.engine.clear(new Color4(0, 0, 0, 0), true, true, true);
            this.engine.unBindFramebuffer(rtt.renderTarget);
        }
    }

    getDensityTexture() {
        return this.densityBuffer.read;
    }

    triggerFlare(pos, force, color, radius, duration) {
        this.flare.pos = { ...pos };
        this.flare.force = { ...force };
        this.flare.color = { ...color };
        this.flare.radius = radius;
        this.flare.timer = duration;
        this.flare.active = 1.0;
    }

    updateFlare(dt) {
        if (this.flare.active > 0.5) {
            this.flare.timer -= dt;
            if (this.flare.timer <= 0) {
                this.flare.active = 0.0;
            }
        } else {
            // Trigger automatic flare representing magnetic reconnection / accretion instabilities
            const freq = this.settings.fluidTurbulenceFreq !== undefined ? this.settings.fluidTurbulenceFreq : 0.02;
            if (Math.random() < freq) {
                this.triggerRandomFlare();
            }
        }
    }

    triggerRandomFlare() {
        const angle = Math.random() * Math.PI * 2;
        const innerR = (this.settings.diskInnerRadius || 3.0) / (this.settings.diskOuterRadius || 12.0) * 0.5;
        const r = innerR + Math.random() * (0.45 - innerR);

        // Position in UV coordinates [0.0 - 1.0]
        const pos = {
            x: 0.5 + Math.cos(angle) * r,
            y: 0.5 + Math.sin(angle) * r
        };

        // Instability velocity vector (orbital shear injection)
        const orbitTangent = { x: -Math.sin(angle), y: Math.cos(angle) };
        const outwardRadial = { x: Math.cos(angle), y: Math.sin(angle) };

        const tangentMult = (Math.random() * 0.4 + 0.8) * 0.22;
        const radialMult = (Math.random() - 0.5) * 0.12;

        const force = {
            x: orbitTangent.x * tangentMult + outwardRadial.x * radialMult,
            y: orbitTangent.y * tangentMult + outwardRadial.y * radialMult
        };

        // Flare color matching physical disk profile (hot flare)
        const cInner = this.settings.colorInner || { r: 0.9, g: 0.85, b: 0.6 };
        const color = {
            r: cInner.r * 2.8,
            g: cInner.g * 2.5,
            b: cInner.b * 1.8
        };

        const radius = 0.025 + Math.random() * 0.03;
        const duration = 0.2 + Math.random() * 0.4; // seconds

        this.triggerFlare(pos, force, color, radius, duration);
    }

    step(dt) {
        // Safeguard dt to prevent huge integration steps
        dt = Math.min(dt, 0.03);

        if (this.resetRequested) {
            this.initializeDiskData();
            return;
        }

        const dx = 1.0 / this.resolution;

        // --- 1. Advect Velocity ---
        const advectEffect = this.advectWrapper.effect;
        if (advectEffect && advectEffect.isReady()) {
            // Velocity advection is dampened by fluid viscosity (viscous drag)
            const viscosity = this.settings.fluidViscosity !== undefined ? this.settings.fluidViscosity : 0.995;
            this.advectWrapper.effect.setFloat("uDt", dt);
            this.advectWrapper.effect.setFloat("uDissipation", viscosity);
            this.advectWrapper.effect.setFloat("uIsVelocity", 1.0); // True for velocity
            this.advectWrapper.effect.setTexture("uVelocity", this.velocityBuffer.read);
            this.advectWrapper.effect.setTexture("uSource", this.velocityBuffer.read);
            this.effectRenderer.render(this.advectWrapper, this.velocityBuffer.write);
            this.velocityBuffer.swap();
        }

        // --- 2. Advect Density ---
        if (advectEffect && advectEffect.isReady()) {
            // Gas density is conserved (no advection decay)
            this.advectWrapper.effect.setFloat("uDt", dt);
            this.advectWrapper.effect.setFloat("uDissipation", 1.0);
            this.advectWrapper.effect.setFloat("uIsVelocity", 0.0); // False for density
            this.advectWrapper.effect.setTexture("uVelocity", this.velocityBuffer.read);
            this.advectWrapper.effect.setTexture("uSource", this.densityBuffer.read);
            this.effectRenderer.render(this.advectWrapper, this.densityBuffer.write);
            this.densityBuffer.swap();
        }

        // --- 3. Apply Forces (Keplerian Shear + Inflow Pull + Flare) ---
        const forceEffect = this.addForceWrapper.effect;
        if (forceEffect && forceEffect.isReady()) {
            const innerR = (this.settings.diskInnerRadius || 3.0) / (this.settings.diskOuterRadius || 12.0) * 0.5;
            const outerR = 0.5;
            const shearStrength = 0.08 * (this.settings.diskNoiseSpeed || 0.85);
            const recoveryRate = 6.0; // Enforces Keplerian shape over time
            const inflowStrength = this.settings.fluidInflowStrength !== undefined ? this.settings.fluidInflowStrength : 0.15;

            forceEffect.setFloat("uDt", dt);
            forceEffect.setFloat("uInnerRadius", innerR);
            forceEffect.setFloat("uOuterRadius", outerR);
            forceEffect.setFloat("uShearStrength", shearStrength);
            forceEffect.setFloat("uRecoveryRate", recoveryRate);
            forceEffect.setFloat("uInflowStrength", inflowStrength);

            this.updateFlare(dt);
            forceEffect.setVector2("uFlarePos", this.flare.pos);
            forceEffect.setVector2("uFlareForce", this.flare.force);
            forceEffect.setFloat("uFlareRadius", this.flare.radius);
            forceEffect.setFloat("uFlareActive", this.flare.active);

            forceEffect.setTexture("uVelocity", this.velocityBuffer.read);
            this.effectRenderer.render(this.addForceWrapper, this.velocityBuffer.write);
            this.velocityBuffer.swap();
        }

        // --- 4. Apply Density Updates (Drain + Edge Feed + Flare Injection) ---
        const densityEffect = this.addDensityWrapper.effect;
        if (densityEffect && densityEffect.isReady()) {
            const innerR = (this.settings.diskInnerRadius || 3.0) / (this.settings.diskOuterRadius || 12.0) * 0.5;
            const outerR = 0.5;
            const cInner = this.settings.colorInner || { r: 0.9, g: 0.85, b: 0.6 };
            const cOuter = this.settings.colorOuter || { r: 0.6, g: 0.15, b: 0.05 };

            densityEffect.setFloat("uDt", dt);
            densityEffect.setFloat("uInnerRadius", innerR);
            densityEffect.setFloat("uOuterRadius", outerR);
            densityEffect.setFloat3("uColorInner", cInner.r, cInner.g, cInner.b);
            densityEffect.setFloat3("uColorOuter", cOuter.r, cOuter.g, cOuter.b);

            densityEffect.setVector2("uFlarePos", this.flare.pos);
            densityEffect.setFloat3("uFlareColor", this.flare.color.r, this.flare.color.g, this.flare.color.b);
            densityEffect.setFloat("uFlareRadius", this.flare.radius);
            densityEffect.setFloat("uFlareActive", this.flare.active);
            densityEffect.setFloat("uTime", performance.now() * 0.001);

            densityEffect.setTexture("uDensity", this.densityBuffer.read);
            this.effectRenderer.render(this.addDensityWrapper, this.densityBuffer.write);
            this.densityBuffer.swap();
        }

        // --- 5. Vorticity Confinement ---
        const vorticityStrength = this.settings.fluidVorticity !== undefined ? this.settings.fluidVorticity : 2.0;
        if (vorticityStrength > 0.0) {
            const vorticityEffect = this.vorticityWrapper.effect;
            const vorticityForceEffect = this.vorticityForceWrapper.effect;

            if (vorticityEffect && vorticityForceEffect && vorticityEffect.isReady() && vorticityForceEffect.isReady()) {
                vorticityEffect.setFloat2("uScale", dx, dx);
                vorticityEffect.setTexture("uVelocity", this.velocityBuffer.read);
                this.effectRenderer.render(this.vorticityWrapper, this.vorticityRTT);

                vorticityForceEffect.setFloat2("uScale", dx, dx);
                vorticityForceEffect.setFloat("uStrength", vorticityStrength);
                vorticityForceEffect.setFloat("uDt", dt);
                vorticityForceEffect.setTexture("uVelocity", this.velocityBuffer.read);
                vorticityForceEffect.setTexture("uVorticity", this.vorticityRTT);
                this.effectRenderer.render(this.vorticityForceWrapper, this.velocityBuffer.write);
                this.velocityBuffer.swap();
            }
        }

        // --- 6. Compute Divergence ---
        const divergenceEffect = this.divergenceWrapper.effect;
        if (divergenceEffect && divergenceEffect.isReady()) {
            divergenceEffect.setFloat2("uScale", dx, dx);
            divergenceEffect.setTexture("uVelocity", this.velocityBuffer.read);
            this.effectRenderer.render(this.divergenceWrapper, this.divergenceRTT);
        }

        // --- 7. Jacobi Pressure Relaxation (20 iterations) ---
        const jacobiEffect = this.jacobiWrapper.effect;
        if (jacobiEffect && jacobiEffect.isReady()) {
            jacobiEffect.setFloat2("uScale", dx, dx);
            jacobiEffect.setTexture("uDivergence", this.divergenceRTT);

            for (let i = 0; i < 20; i++) {
                jacobiEffect.setTexture("uPressure", this.pressureBuffer.read);
                this.effectRenderer.render(this.jacobiWrapper, this.pressureBuffer.write);
                this.pressureBuffer.swap();
            }
        }

        // --- 8. Project (Divergence-Free Velocity) ---
        const projectEffect = this.projectWrapper.effect;
        if (projectEffect && projectEffect.isReady()) {
            projectEffect.setFloat2("uScale", dx, dx);
            projectEffect.setTexture("uVelocity", this.velocityBuffer.read);
            projectEffect.setTexture("uPressure", this.pressureBuffer.read);
            this.effectRenderer.render(this.projectWrapper, this.velocityBuffer.write);
            this.velocityBuffer.swap();
        }
    }

    resize(newSize) {
        if (newSize === this.resolution) return;
        this.resolution = newSize;

        this.velocityBuffer.dispose();
        this.densityBuffer.dispose();
        this.pressureBuffer.dispose();
        this.divergenceRTT.dispose();
        this.vorticityRTT.dispose();

        this.initTextures();
        this.initializeDisk();
    }

    dispose() {
        this.velocityBuffer.dispose();
        this.densityBuffer.dispose();
        this.pressureBuffer.dispose();
        this.divergenceRTT.dispose();
        this.vorticityRTT.dispose();

        this.initDensityWrapper.dispose();
        this.initVelocityWrapper.dispose();
        this.advectWrapper.dispose();
        this.addForceWrapper.dispose();
        this.addDensityWrapper.dispose();
        this.vorticityWrapper.dispose();
        this.vorticityForceWrapper.dispose();
        this.divergenceWrapper.dispose();
        this.jacobiWrapper.dispose();
        this.projectWrapper.dispose();

        this.effectRenderer.dispose();
    }
}
