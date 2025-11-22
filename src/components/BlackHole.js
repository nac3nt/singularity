import { MeshBuilder, PBRMaterial, Color3, Animation, Vector3 } from 'babylonjs';
import { LensingConfig } from '../Config.js';

export class BlackHole {
    constructor(scene) {
        this.scene = scene;
        this.mesh = null;
        this.material = null;
        this.animationTime = 0;
        this.createBlackHole();
    }

    createBlackHole() {
        // Create enhanced black hole geometry
        this.mesh = MeshBuilder.CreateSphere('blackHole', {
            diameter: LensingConfig.BLACK_HOLE.DIAMETER,
            segments: LensingConfig.BLACK_HOLE.SEGMENTS
        }, this.scene);

        // Use PBR material for more realistic appearance
        this.material = new PBRMaterial('blackHoleMat', this.scene);
        this.material.baseColor = new Color3(0, 0, 0);
        this.material.metallic = 0.0;
        this.material.roughness = 1.0;
        this.material.emissiveColor = new Color3(0, 0, 0);

        // Disable back face culling for better appearance
        this.material.backFaceCulling = false;

        this.mesh.material = this.material;

        // Add subtle animation
        this.createAnimation();
    }

    createAnimation() {
        // Subtle rotation animation
        const rotationAnimation = Animation.CreateAndStartAnimation(
            'blackHoleRotation',
            this.mesh,
            'rotation.y',
            30, // 30 FPS
            3000, // 100 seconds for full rotation
            0,
            Math.PI * 2,
            Animation.ANIMATIONLOOPMODE_CYCLE
        );
    }

    getScreenPosition(camera, engine) {
        const projected = Vector3.Project(
            this.mesh.position,
            this.mesh.getWorldMatrix(),
            this.scene.getTransformMatrix(),
            camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
        );

        return {
            x: projected.x / engine.getRenderWidth(),
            y: 1.0 - projected.y / engine.getRenderHeight()
        };
    }

    getAngularRadius(camera) {
        return Math.atan(LensingConfig.BLACK_HOLE.WORLD_RADIUS / camera.radius);
    }

    update(deltaTime) {
        this.animationTime += deltaTime;
        // Add any per-frame updates here
    }
}
