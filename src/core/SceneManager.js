import {
    Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight,
    MeshBuilder, Color3, GlowLayer, Texture,
    HDRCubeTexture, BackgroundMaterial
} from 'babylonjs';
import { LensingConfig } from '../Config.js';
import { PerformanceMonitor } from '../utils/PerformanceMonitor.js';
import { BlackHole } from '../components/BlackHole.js';
import { LensingEffect } from '../effects/LensingEffect.js';

export class SceneManager {
    constructor() {
        this.canvas = document.getElementById('renderCanvas');
        this.engine = new Engine(this.canvas, true, { antialias: true, adaptToDeviceRatio: true });
        this.scene = null;
        this.camera = null;
        this.blackHole = null;
        this.lensingEffect = null;
        this.glowLayer = null;
        this.performanceMonitor = null;
        this.glowTime = 0;

        this.initialize();
    }

    initialize() {
        this.createScene();
        this.setupEventHandlers();
        this.startRenderLoop();
    }

    createScene() {
        this.scene = new Scene(this.engine);
        this.performanceMonitor = new PerformanceMonitor(this.engine);

        // Enhanced environment setup
        this.setupEnvironment();
        this.setupCamera();
        this.setupLighting();

        // Create enhanced black hole
        this.blackHole = new BlackHole(this.scene);

        // Setup lensing effect
        this.lensingEffect = new LensingEffect(this.scene, this.camera, this.blackHole, this.engine);

        // Enhanced glow effect
        this.setupGlowEffect();

        // Setup animations
        this.setupAnimations();
    }

    setupEnvironment() {
        try {
            // Load HDR environment
            const hdrTexture = new HDRCubeTexture(LensingConfig.HDR.TEXTURE_PATH, this.scene, LensingConfig.HDR.TEXTURE_SIZE);
            this.scene.environmentTexture = hdrTexture;
            this.scene.environmentIntensity = LensingConfig.LIGHTING.ENVIRONMENT_INTENSITY;

            // Enhanced background setup
            const backgroundMaterial = new BackgroundMaterial('backgroundMaterial', this.scene);
            backgroundMaterial.backFaceCulling = false;
            backgroundMaterial.reflectionTexture = new Texture(
                LensingConfig.HDR.TEXTURE_PATH,
                this.scene,
                false, false,
                Texture.BILINEAR_SAMPLINGMODE,
                null, null, undefined, true
            );
            backgroundMaterial.reflectionTexture.coordinatesMode = Texture.FIXED_EQUIRECTANGULAR_MODE;

            const backgroundSphere = MeshBuilder.CreateSphere('backgroundSphere', {
                segments: LensingConfig.BACKGROUND.SPHERE_SEGMENTS,
                diameter: LensingConfig.BACKGROUND.SPHERE_DIAMETER
            }, this.scene);

            backgroundSphere.material = backgroundMaterial;
            backgroundSphere.infiniteDistance = true;
            backgroundSphere.isPickable = false;
        } catch (error) {
            console.warn('HDR texture loading failed, using fallback environment:', error);
            this.setupFallbackEnvironment();
        }
    }

    setupFallbackEnvironment() {
        // Fallback environment for when HDR fails to load
        this.scene.createDefaultSkybox(null, true, 1000);
    }

    setupCamera() {
        this.camera = new ArcRotateCamera(
            'camera',
            LensingConfig.CAMERA.ALPHA,
            LensingConfig.CAMERA.BETA,
            LensingConfig.CAMERA.INITIAL_RADIUS,
            Vector3.Zero(),
            this.scene
        );

        this.camera.attachControl(this.canvas, true);

        // Enhanced camera controls
        this.camera.lowerRadiusLimit = LensingConfig.CAMERA.MIN_RADIUS;
        this.camera.upperRadiusLimit = LensingConfig.CAMERA.MAX_RADIUS;
        this.camera.panningOriginTarget = Vector3.Zero();
        this.camera.panningInertia = 0.8;
        this.camera.panningAxis = new Vector3(1, 1, 0);

        // Adjust sensitivity
        this.camera.panningSensibility = 1000 / LensingConfig.CAMERA.PAN_SENSITIVITY;
        this.camera.wheelPrecision = 50 / LensingConfig.CAMERA.ZOOM_SENSITIVITY;
    }

    setupLighting() {
        const hemiLight = new HemisphericLight('hemiLight', new Vector3(0, 1, 0), this.scene);
        hemiLight.intensity = LensingConfig.LIGHTING.HEMI_INTENSITY;
        hemiLight.groundColor = new Color3(0.1, 0.05, 0.2);
    }

    setupGlowEffect() {
        this.glowLayer = new GlowLayer('glow', this.scene, {
            blurKernelSize: LensingConfig.GLOW.INITIAL_BLUR_KERNEL
        });
        this.glowLayer.intensity = LensingConfig.GLOW.INITIAL_INTENSITY;

        // Make the black hole glow subtly
        this.glowLayer.addIncludedOnlyMesh(this.blackHole.mesh);
    }

    setupAnimations() {
        this.scene.registerBeforeRender(() => {
            const deltaTime = this.engine.getDeltaTime();

            // Update performance monitor
            this.performanceMonitor.update();

            // Update black hole
            this.blackHole.update(deltaTime);

            // Update lensing effect
            this.lensingEffect.update(deltaTime);

            // Animate glow effect
            this.updateGlowAnimation(deltaTime);
        });
    }

    updateGlowAnimation(deltaTime) {
        this.glowTime += deltaTime * LensingConfig.GLOW.ANIMATION.SPEED;

        const config = LensingConfig.GLOW.ANIMATION;
        this.glowLayer.intensity = config.INTENSITY_BASE +
            config.INTENSITY_AMPLITUDE * Math.sin(this.glowTime);

        const blur = config.BLUR_BASE +
            config.BLUR_AMPLITUDE * Math.sin(this.glowTime + config.BLUR_PHASE_OFFSET);

        const roundedBlur = Math.round(blur);
        if (this.glowLayer.blurKernelSize !== roundedBlur) {
            this.glowLayer.blurKernelSize = roundedBlur;
        }
    }

    setupEventHandlers() {
        // Enhanced resize handling
        window.addEventListener('resize', () => {
            this.engine.resize();
        });

        // Keyboard controls for debugging
        window.addEventListener('keydown', (event) => {
            this.handleKeyPress(event);
        });

        // Error handling
        window.addEventListener('error', (event) => {
            console.error('Runtime error:', event.error);
        });
    }

    handleKeyPress(event) {
        switch (event.key) {
            case 'r':
                // Reset camera position
                this.camera.setTarget(Vector3.Zero());
                this.camera.radius = LensingConfig.CAMERA.INITIAL_RADIUS;
                break;
            case 'p':
                // Toggle performance info
                console.log(`FPS: ${this.performanceMonitor.getFPS()}`);
                break;
            case 'd':
                // Toggle debug info
                this.scene.debugLayer.isVisible() ?
                    this.scene.debugLayer.hide() :
                    this.scene.debugLayer.show();
                break;
        }
    }

    startRenderLoop() {
        this.engine.runRenderLoop(() => {
            try {
                this.scene.render();
            } catch (error) {
                console.error('Render error:', error);
            }
        });
    }

    dispose() {
        // Clean up resources
        if (this.lensingEffect) {
            this.lensingEffect.dispose();
        }

        if (this.scene) {
            this.scene.dispose();
        }

        if (this.engine) {
            this.engine.dispose();
        }
    }
}
