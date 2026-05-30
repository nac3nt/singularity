import { PostProcess } from 'babylonjs';
import { LensingConfig } from '../Config.js';
import { RayMarchingShader } from '../effects/RayMarchingShader.js';

export class BlackHole {
    constructor(scene, camera, engine, sceneManager = null) {
        this.scene = scene;
        this.camera = camera;
        this.engine = engine;
        this.sceneManager = sceneManager;
        this.mesh = null;
        this.postProcess = null;
        this.time = 0;
        this.diskTime = 0;

        this.createBlackHole();
    }

    createBlackHole() {
        // Register the shader
        RayMarchingShader.createShader();

        // Create the post-process in standard (LDR) mode.
        this.postProcess = new PostProcess(
            "blackHoleRayMarch",
            "blackHoleRayMarch",
            [
                "time", "diskTime", "resolution", "cameraPosition", "cameraTarget", "cameraUp",
                "cameraTanHalfFov", "schwarzschildRadius", "lensStrength",
                "diskInnerRadius", "diskOuterRadius", "diskHeight",
                "diskColorInner", "diskColorOuter", "diskOpacity",
                "diskNoiseScale", "diskNoiseSpeed",
                "dopplerStrength", "redshiftStrength",
                "maxSteps", "colorShiftEnabled",
                "blackHoleSpin", "atmosphereEnabled", "filmGrainEnabled",
                "invDiskWidth", "sqrtDiskInnerRadius", "sqrtHalfRs"
            ],
            ["envTexture", "fluidDensityTexture"],
            1.0,
            this.camera
        );

        this.postProcess.onApply = (effect) => {
            this.updateUniforms(effect);
        };
    }

    updateUniforms(effect) {
        // Fetch dynamic settings from SceneManager or fall back to LensingConfig
        const settings = this.sceneManager ? this.sceneManager.settings : null;

        // Camera uniforms
        effect.setFloat("time", this.time);
        effect.setFloat("diskTime", this.diskTime);
        effect.setFloat2("resolution", this.engine.getRenderWidth(), this.engine.getRenderHeight());
        effect.setVector3("cameraPosition", this.camera.position);
        effect.setVector3("cameraTarget", this.camera.target);
        effect.setVector3("cameraUp", this.camera.upVector);
        effect.setFloat("cameraTanHalfFov", Math.tan(this.camera.fov * 0.5));

        // Environment
        if (this.scene.environmentTexture) {
            effect.setTexture("envTexture", this.scene.environmentTexture);
        }

        // Physical and Visual parameters (Dynamic or Static fallback)
        const rs = settings ? settings.schwarzschildRadius : (LensingConfig.BLACK_HOLE.WORLD_RADIUS * 2.0);
        effect.setFloat("schwarzschildRadius", rs);
        effect.setFloat("sqrtHalfRs", Math.sqrt(0.5 * rs));

        const lensStrength = settings ? settings.lensStrength : LensingConfig.Lensing.STRENGTH;
        effect.setFloat("lensStrength", lensStrength);

        // Kerr metric frame-dragging spin
        const blackHoleSpin = settings ? settings.blackHoleSpin : 0.90;
        effect.setFloat("blackHoleSpin", blackHoleSpin);

        // Accretion Disk Dimensions (Relative to Schwarzschild Radius)
        const diskInner = settings ? settings.diskInnerRadius : LensingConfig.ACCRETION_DISK.INNER_RADIUS;
        const diskOuter = settings ? settings.diskOuterRadius : LensingConfig.ACCRETION_DISK.OUTER_RADIUS;
        const diskHeight = settings ? settings.diskHeight : LensingConfig.ACCRETION_DISK.HEIGHT;

        const wDiskInner = rs * diskInner;
        const wDiskOuter = rs * diskOuter;
        effect.setFloat("diskInnerRadius", wDiskInner);
        effect.setFloat("diskOuterRadius", wDiskOuter);
        effect.setFloat("diskHeight", rs * diskHeight);

        effect.setFloat("invDiskWidth", 1.0 / Math.max(0.0001, wDiskOuter - wDiskInner));
        effect.setFloat("sqrtDiskInnerRadius", Math.sqrt(wDiskInner));

        // Accretion Disk Colors (RGB)
        const cInner = settings ? settings.colorInner : LensingConfig.ACCRETION_DISK.COLOR_INNER;
        const cOuter = settings ? settings.colorOuter : LensingConfig.ACCRETION_DISK.COLOR_OUTER;
        effect.setFloat3("diskColorInner", cInner.r, cInner.g, cInner.b);
        effect.setFloat3("diskColorOuter", cOuter.r, cOuter.g, cOuter.b);

        // Accretion Disk Noise & Opacity
        const diskOpacity = settings ? settings.diskOpacity : LensingConfig.ACCRETION_DISK.OPACITY;
        const diskNoiseScale = settings ? settings.diskNoiseScale : LensingConfig.ACCRETION_DISK.NOISE_SCALE;
        const diskNoiseSpeed = settings ? settings.diskNoiseSpeed : LensingConfig.ACCRETION_DISK.NOISE_SPEED;

        effect.setFloat("diskOpacity", diskOpacity);
        effect.setFloat("diskNoiseScale", diskNoiseScale);
        effect.setFloat("diskNoiseSpeed", diskNoiseSpeed);

        // Relativistic effects toggles/factors
        const dopplerStrength = settings ? settings.dopplerStrength : LensingConfig.PHYSICS.DOPPLER_STRENGTH;
        const redshiftStrength = settings ? settings.redshiftStrength : LensingConfig.PHYSICS.REDSHIFT_STRENGTH;
        const colorShiftEnabled = settings ? settings.colorShiftEnabled : 1.0;

        effect.setFloat("dopplerStrength", dopplerStrength);
        effect.setFloat("redshiftStrength", redshiftStrength);
        effect.setFloat("colorShiftEnabled", colorShiftEnabled);

        const atmosphereEnabled = settings ? settings.atmosphereEnabled : 1.0;
        effect.setFloat("atmosphereEnabled", atmosphereEnabled);

        const filmGrainEnabled = settings ? settings.filmGrainEnabled : 1.0;
        effect.setFloat("filmGrainEnabled", filmGrainEnabled);

        // Performance clamping
        const maxSteps = settings ? settings.maxSteps : LensingConfig.PERFORMANCE.MAX_STEPS;
        effect.setFloat("maxSteps", maxSteps);

        // Bind fluid simulation density texture
        if (this.sceneManager && this.sceneManager.fluidSimulation) {
            const fluidTex = this.sceneManager.fluidSimulation.getDensityTexture();
            if (fluidTex) {
                effect.setTexture("fluidDensityTexture", fluidTex);
            }
        }
    }

    update(deltaTime) {
        // Increment uniform time counter
        this.time += deltaTime * 0.001;

        // Fetch dynamic settings from SceneManager or fall back to LensingConfig
        const settings = this.sceneManager ? this.sceneManager.settings : null;
        const diskNoiseSpeed = settings ? settings.diskNoiseSpeed : LensingConfig.ACCRETION_DISK.NOISE_SPEED;
        
        // Accumulate disk time scaled by gas swirl speed
        this.diskTime += deltaTime * 0.001 * diskNoiseSpeed;
    }

    dispose() {
        if (this.postProcess) {
            this.postProcess.dispose();
        }
    }
}
