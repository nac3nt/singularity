import { PostProcess } from 'babylonjs';
import { LensingConfig } from '../Config.js';
import { ShaderManager } from './ShaderManager.js';

export class LensingEffect {
    constructor(scene, camera, blackHole, engine) {
        this.scene = scene;
        this.camera = camera;
        this.blackHole = blackHole;
        this.engine = engine;
        this.postProcess = null;
        this.time = 0;
        this.createEffect();
    }

    createEffect() {
        ShaderManager.createGravitationalLensingShader();

        this.postProcess = new PostProcess(
            "gravitationalLensing",
            "gravitationalLensing",
            [
                "blackHoleCenter", "blackHoleRadius", "lensStrength",
                "aspectRatio", "lensEffectFalloffScale", "lensEffectAmplitude",
                "time", "transitionSoftness", "schwarzschildFactor"
            ],
            null,
            1.0,
            this.camera
        );

        this.postProcess.onApply = (effect) => {
            this.updateUniforms(effect);
        };
    }

    updateUniforms(effect) {
        const center = this.blackHole.getScreenPosition(this.camera, this.engine);
        const angularRadius = this.blackHole.getAngularRadius(this.camera);
        const normalizedScreenRadius = angularRadius / this.camera.fov;

        effect.setFloat2("blackHoleCenter", center.x, center.y);
        effect.setFloat("blackHoleRadius", normalizedScreenRadius);
        effect.setFloat("lensStrength", LensingConfig.LENSING.STRENGTH);
        effect.setFloat("aspectRatio", this.engine.getRenderWidth() / this.engine.getRenderHeight());
        effect.setFloat("lensEffectFalloffScale", LensingConfig.LENSING.FALLOFF_SCALE);
        effect.setFloat("lensEffectAmplitude", LensingConfig.LENSING.AMPLITUDE);
        effect.setFloat("time", this.time);
        effect.setFloat("transitionSoftness", LensingConfig.LENSING.TRANSITION_SOFTNESS);
        effect.setFloat("schwarzschildFactor", LensingConfig.LENSING.SCHWARZSCHILD_FACTOR);
    }

    update(deltaTime) {
        this.time += deltaTime * 0.001; // Convert to seconds
    }

    dispose() {
        if (this.postProcess) {
            this.postProcess.dispose();
        }
    }
}
