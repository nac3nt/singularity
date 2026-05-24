import {
    Engine, Scene, ArcRotateCamera, Vector3,
    HDRCubeTexture, FxaaPostProcess
} from 'babylonjs';
import { LensingConfig } from '../Config.js';
import { PerformanceMonitor } from '../utils/PerformanceMonitor.js';
import { BlackHole } from '../components/BlackHole.js';

export class SceneManager {
    constructor() {
        this.canvas = document.getElementById('renderCanvas');
        this.engine = new Engine(this.canvas, true, { antialias: true, adaptToDeviceRatio: true });
        this.scene = null;
        this.camera = null;
        this.blackHole = null;
        this.performanceMonitor = null;
        // Activity and Framerate Throttling State
        this.lastInputTime = performance.now();
        this.isIdle = false;
        this.fpsCap = 60.0;
        this.lastFrameTime = performance.now();

        // Initialize application state with user-defined starting values
        this.settings = {
            schwarzschildRadius: LensingConfig.PRESETS.quasar.schwarzschildRadius, // 20.0
            blackHoleSpin: 0.99,
            lensStrength: 1.00,
            diskInnerRadius: 2.00,
            diskOuterRadius: 10.00,
            diskHeight: 0.05,
            diskNoiseScale: LensingConfig.PRESETS.quasar.diskNoiseScale,
            diskNoiseSpeed: 0.40,
            diskOpacity: 0.75,
            dopplerStrength: 1.0,
            redshiftStrength: 1.0,
            colorShiftEnabled: 1.0,
            atmosphereEnabled: LensingConfig.BACKGROUND.ATMOSPHERE_ENABLED,
            fpsLimitEnabled: LensingConfig.PERFORMANCE.FPS_LIMIT_ENABLED,
            filmGrainEnabled: LensingConfig.BACKGROUND.FILM_GRAIN_ENABLED,
            fxaaEnabled: LensingConfig.PERFORMANCE.FXAA_ENABLED,
            maxSteps: 500,
            colorInner: { ...LensingConfig.PRESETS.quasar.colorInner },
            colorOuter: { ...LensingConfig.PRESETS.quasar.colorOuter },
            renderScale: 1.00
        };

        this.fxaaPostProcess = null;
        this.initialize();
    }

    initialize() {
        this.createScene();
        this.setupEventHandlers();
        this.setupActivityTracker();
        this.setupUIBindings();
        
        // Set initial camera animation states
        this.isDriftingCamera = false;
        this.isTransitioningCamera = false;

        if (this.scene) {
            this.scene.executeWhenReady(() => {
                const loader = document.getElementById('loadingOverlay');
                const canvas = document.getElementById('renderCanvas');
                const ui = document.querySelector('.ui-overlay');

                // Fade in the render canvas
                if (canvas) {
                    canvas.classList.add('ready');
                }

                // Fade the loader background to transparent, revealing the black hole behind it
                if (loader) {
                    loader.classList.add('bg-transparent');
                }

                // Start rendering loop immediately (shaders are compiled, so it's smooth!)
                this.startRenderLoop();

                // Slow drift in the top-down view during the 2-second showcase
                this.isDriftingCamera = true;

                // Wait 2 seconds showing the top-down black hole under the shimmering text
                setTimeout(() => {
                    if (loader) {
                        loader.classList.add('fade-out');
                    }
                    if (ui) {
                        ui.classList.add('ready');
                    }

                    // Stop top drift and start transition to focus on the black hole in orbit view
                    this.isDriftingCamera = false;
                    this.isTransitioningCamera = true;
                }, 2000);
            });
        } else {
            this.startRenderLoop();
        }
    }

    createScene() {
        this.scene = new Scene(this.engine);
        this.performanceMonitor = new PerformanceMonitor(this.engine);

        this.setupEnvironment();
        this.setupCamera();

        // Instantiate black hole, passing SceneManager reference for dynamic configurations
        this.blackHole = new BlackHole(this.scene, this.camera, this.engine, this);

        this.setupAnimations();
        this.updatePostProcesses();
    }

    setupEnvironment() {
        try {
            const hdrTexture = new HDRCubeTexture(LensingConfig.HDR.TEXTURE_PATH, this.scene, LensingConfig.HDR.TEXTURE_SIZE);
            this.scene.environmentTexture = hdrTexture;
            this.scene.environmentIntensity = LensingConfig.LIGHTING.ENVIRONMENT_INTENSITY;
        } catch (error) {
            console.warn('HDR texture loading failed:', error);
        }
    }

    setupCamera() {
        // Initial camera view during loading: offset angles, target is center of the black hole
        this.camera = new ArcRotateCamera(
            'camera',
            Math.PI / 1.5, // Offset alpha
            0.01, // Offset beta (fully top view)
            650, // Offset radius
            Vector3.Zero(), // Target the black hole center
            this.scene
        );

        this.camera.attachControl(this.canvas, true);

        // Enhanced camera controls limits
        this.camera.lowerRadiusLimit = LensingConfig.CAMERA.MIN_RADIUS;
        this.camera.upperRadiusLimit = LensingConfig.CAMERA.MAX_RADIUS;
        this.camera.panningOriginTarget = Vector3.Zero();
        this.camera.panningInertia = 0.8;
        this.camera.panningAxis = new Vector3(1, 1, 0);

        // Adjust mouse/scroll sensitivity
        this.camera.panningSensibility = 1000 / LensingConfig.CAMERA.PAN_SENSITIVITY;
        this.camera.wheelPrecision = 50 / LensingConfig.CAMERA.ZOOM_SENSITIVITY;
    }



    setupAnimations() {
        let lastFpsUpdate = 0;
        this.scene.registerBeforeRender(() => {
            const deltaTime = this.engine.getDeltaTime();
            this.performanceMonitor.update();
            this.blackHole.update(deltaTime);

            // Update FPS display once per second if the panel is open
            const now = performance.now();
            if (now - lastFpsUpdate >= 1000) {
                const controlPanel = document.getElementById('controlPanel');
                if (controlPanel && !controlPanel.classList.contains('collapsed')) {
                    const fpsCounter = document.getElementById('fpsCounter');
                    if (fpsCounter) {
                        fpsCounter.textContent = `${this.performanceMonitor.getFPS()} FPS`;
                    }
                }
                lastFpsUpdate = now;
            }

            // Handle Camera Drift during loading
            if (this.isDriftingCamera) {
                this.camera.alpha += 0.00008 * deltaTime;
            }

            // Smoothly animate the camera to focus on the black hole when ready
            if (this.isTransitioningCamera) {
                const targetValues = {
                    alpha: 0.0,
                    beta: Math.PI / 2.3, // Lowered orbit view
                    radius: 450
                };

                const speed = 0.003 * deltaTime; // framerate-independent speed
                
                // Interpolate camera parameters
                this.camera.alpha = this.camera.alpha + (targetValues.alpha - this.camera.alpha) * speed;
                this.camera.beta = this.camera.beta + (targetValues.beta - this.camera.beta) * speed;
                this.camera.radius = this.camera.radius + (targetValues.radius - this.camera.radius) * speed;

                // Check if transition is complete
                if (Math.abs(this.camera.alpha - targetValues.alpha) < 0.01 &&
                    Math.abs(this.camera.beta - targetValues.beta) < 0.01 &&
                    Math.abs(this.camera.radius - targetValues.radius) < 2.0) {
                    
                    this.camera.alpha = targetValues.alpha;
                    this.camera.beta = targetValues.beta;
                    this.camera.radius = targetValues.radius;
                    this.isTransitioningCamera = false;

                    // Automatically enable auto-orbit behavior by default
                    this.camera.useAutoRotationBehavior = true;
                    this.camera.autoRotationBehavior.idleRotationSpeed = 0.05;
                    this.updateCamButtonState('btnCamOrbit');
                }
            }
        });
    }

    setupEventHandlers() {
        window.addEventListener('resize', () => {
            this.engine.resize();
        });

        window.addEventListener('keydown', (event) => {
            this.handleKeyPress(event);
        });

        window.addEventListener('error', (event) => {
            console.error('Runtime error:', event.error);
        });
    }

    setupActivityTracker() {
        const resetIdleTimer = () => {
            this.lastInputTime = performance.now();
            if (this.isIdle) {
                this.isIdle = false;
                this.fpsCap = 60.0; // Boost FPS back to 60 immediately on activity
            }
        };

        // Register window interaction listeners
        const events = ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'keydown', 'touchstart', 'touchmove'];
        events.forEach(evtName => {
            window.addEventListener(evtName, resetIdleTimer, { passive: true });
        });
    }

    setupUIBindings() {
        const toggleBtn = document.getElementById('togglePanelBtn');
        const controlPanel = document.getElementById('controlPanel');
        
        // Hide/Show sidebar panel
        if (toggleBtn && controlPanel) {
            toggleBtn.addEventListener('click', () => {
                controlPanel.classList.toggle('collapsed');
                toggleBtn.classList.toggle('panel-open');
            });
        }

        // Helper to link sliders
        const updateSlider = (id, valId, key, suffix = '') => {
            const slider = document.getElementById(id);
            const valDisplay = document.getElementById(valId);
            if (slider && valDisplay) {
                slider.value = this.settings[key];
                valDisplay.textContent = this.settings[key].toFixed(2) + suffix;
                
                slider.addEventListener('input', (e) => {
                    const val = parseFloat(e.target.value);
                    this.settings[key] = val;
                    valDisplay.textContent = val.toFixed(2) + suffix;
                });
            }
        };

        // Accretion disk and black hole range sliders
        updateSlider('radiusSlider', 'radiusVal', 'schwarzschildRadius', '');
        updateSlider('spinSlider', 'spinVal', 'blackHoleSpin');
        updateSlider('lensingSlider', 'lensingVal', 'lensStrength');
        updateSlider('diskInnerSlider', 'diskInnerVal', 'diskInnerRadius');
        updateSlider('diskOuterSlider', 'diskOuterVal', 'diskOuterRadius');
        updateSlider('diskHeightSlider', 'diskHeightVal', 'diskHeight');
        updateSlider('diskSpeedSlider', 'diskSpeedVal', 'diskNoiseSpeed');
        updateSlider('diskOpacitySlider', 'diskOpacityVal', 'diskOpacity');
        
        // Resolution Scaling (Hardware Scaling)
        const renderScaleSlider = document.getElementById('renderScaleSlider');
        const renderScaleVal = document.getElementById('renderScaleVal');
        if (renderScaleSlider && renderScaleVal) {
            renderScaleSlider.value = this.settings.renderScale;
            renderScaleVal.textContent = this.settings.renderScale.toFixed(2) + 'x';
            renderScaleSlider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                this.settings.renderScale = val;
                renderScaleVal.textContent = val.toFixed(2) + 'x';
                this.engine.setHardwareScalingLevel(1 / val);
            });
        }

        // Raymarching Step Counts
        const rayStepsSlider = document.getElementById('rayStepsSlider');
        const rayStepsVal = document.getElementById('rayStepsVal');
        if (rayStepsSlider && rayStepsVal) {
            rayStepsSlider.value = this.settings.maxSteps;
            rayStepsVal.textContent = Math.round(this.settings.maxSteps);
            rayStepsSlider.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                this.settings.maxSteps = val;
                rayStepsVal.textContent = val;
            });
        }

        // Helper to link check-toggles
        const bindToggle = (id, key, onChange = null) => {
            const toggle = document.getElementById(id);
            if (toggle) {
                toggle.checked = this.settings[key] > 0.5;
                toggle.addEventListener('change', (e) => {
                    this.settings[key] = e.target.checked ? 1.0 : 0.0;
                    if (onChange) onChange(e.target.checked);
                });
            }
        };

        bindToggle('dopplerToggle', 'dopplerStrength');
        bindToggle('redshiftToggle', 'redshiftStrength');
        bindToggle('colorShiftToggle', 'colorShiftEnabled');
        bindToggle('atmosphereToggle', 'atmosphereEnabled');
        bindToggle('fpsLimitToggle', 'fpsLimitEnabled');
        bindToggle('filmGrainToggle', 'filmGrainEnabled');
        bindToggle('fxaaToggle', 'fxaaEnabled', () => this.updatePostProcesses());

        // Preset button array listeners
        const presetButtons = document.querySelectorAll('.btn-preset');
        presetButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                presetButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const presetKey = btn.getAttribute('data-preset');
                this.applyPreset(presetKey);
            });
        });

        // Camera viewpoint buttons listeners
        const btnCamOrbit = document.getElementById('btnCamOrbit');
        const btnCamEdge = document.getElementById('btnCamEdge');
        const btnCamPolar = document.getElementById('btnCamPolar');
        const btnCamReset = document.getElementById('btnCamReset');

        if (btnCamOrbit) {
            btnCamOrbit.addEventListener('click', () => {
                this.updateCamButtonState('btnCamOrbit');
                this.camera.useAutoRotationBehavior = true;
                this.camera.autoRotationBehavior.idleRotationSpeed = 0.05;
                this.camera.beta = Math.PI / 2.3; // Lowered Y-angle
                this.camera.radius = 450;
            });
        }
        if (btnCamEdge) {
            btnCamEdge.addEventListener('click', () => {
                this.updateCamButtonState('btnCamEdge');
                this.camera.useAutoRotationBehavior = false;
                this.camera.alpha = 0;
                this.camera.beta = Math.PI / 2;
                this.camera.radius = 480;
            });
        }
        if (btnCamPolar) {
            btnCamPolar.addEventListener('click', () => {
                this.updateCamButtonState('btnCamPolar');
                this.camera.useAutoRotationBehavior = false;
                this.camera.alpha = Math.PI / 2;
                this.camera.beta = 0.01;
                this.camera.radius = 400;
            });
        }
        if (btnCamReset) {
            btnCamReset.addEventListener('click', () => {
                this.updateCamButtonState('btnCamReset');
                this.camera.useAutoRotationBehavior = false;
                this.camera.alpha = 0.0;
                this.camera.beta = Math.PI / 2.15;
                this.camera.radius = 450;
                this.camera.setTarget(Vector3.Zero());
            });
        }

        // Cancel camera auto-rotations when drag-orbiting is triggered
        this.canvas.addEventListener('pointerdown', () => {
            if (this.camera && this.camera.useAutoRotationBehavior) {
                this.camera.useAutoRotationBehavior = false;
                this.updateCamButtonState('');
            }
        });
    }

    applyPreset(key) {
        const preset = LensingConfig.PRESETS[key];
        if (!preset) return;

        // Update settings properties
        this.settings.schwarzschildRadius = preset.schwarzschildRadius;
        this.settings.blackHoleSpin = preset.blackHoleSpin;
        this.settings.lensStrength = preset.lensStrength;
        this.settings.diskInnerRadius = preset.diskInnerRadius;
        this.settings.diskOuterRadius = preset.diskOuterRadius;
        this.settings.diskHeight = preset.diskHeight;
        this.settings.diskNoiseScale = preset.diskNoiseScale;
        this.settings.diskNoiseSpeed = preset.diskNoiseSpeed;
        this.settings.diskOpacity = preset.diskOpacity;
        this.settings.dopplerStrength = preset.dopplerStrength;
        this.settings.redshiftStrength = preset.redshiftStrength;
        this.settings.colorShiftEnabled = preset.colorShiftEnabled;
        this.settings.atmosphereEnabled = preset.atmosphereEnabled;
        this.settings.fpsLimitEnabled = preset.fpsLimitEnabled !== undefined ? preset.fpsLimitEnabled : 1.0;
        this.settings.maxSteps = preset.maxSteps;
        this.settings.colorInner = { ...preset.colorInner };
        this.settings.colorOuter = { ...preset.colorOuter };

        // Synchronize HTML range slider displays
        const updateSliderEl = (id, valId, val, suffix = '') => {
            const el = document.getElementById(id);
            const valDisplay = document.getElementById(valId);
            if (el) el.value = val;
            if (valDisplay) valDisplay.textContent = val.toFixed(2) + suffix;
        };

        updateSliderEl('radiusSlider', 'radiusVal', preset.schwarzschildRadius, '');
        updateSliderEl('spinSlider', 'spinVal', preset.blackHoleSpin);
        updateSliderEl('lensingSlider', 'lensingVal', preset.lensStrength);
        updateSliderEl('diskInnerSlider', 'diskInnerVal', preset.diskInnerRadius);
        updateSliderEl('diskOuterSlider', 'diskOuterVal', preset.diskOuterRadius);
        updateSliderEl('diskHeightSlider', 'diskHeightVal', preset.diskHeight);
        updateSliderEl('diskSpeedSlider', 'diskSpeedVal', preset.diskNoiseSpeed);
        updateSliderEl('diskOpacitySlider', 'diskOpacityVal', preset.diskOpacity);

        const rayStepsSlider = document.getElementById('rayStepsSlider');
        const rayStepsVal = document.getElementById('rayStepsVal');
        if (rayStepsSlider) rayStepsSlider.value = preset.maxSteps;
        if (rayStepsVal) rayStepsVal.textContent = Math.round(preset.maxSteps);

        const dopplerToggle = document.getElementById('dopplerToggle');
        if (dopplerToggle) dopplerToggle.checked = preset.dopplerStrength > 0.5;

        const redshiftToggle = document.getElementById('redshiftToggle');
        if (redshiftToggle) redshiftToggle.checked = preset.redshiftStrength > 0.5;

        const colorShiftToggle = document.getElementById('colorShiftToggle');
        if (colorShiftToggle) colorShiftToggle.checked = preset.colorShiftEnabled > 0.5;

        const atmosphereToggle = document.getElementById('atmosphereToggle');
        if (atmosphereToggle) atmosphereToggle.checked = preset.atmosphereEnabled > 0.5;

        const fpsLimitToggle = document.getElementById('fpsLimitToggle');
        if (fpsLimitToggle) fpsLimitToggle.checked = this.settings.fpsLimitEnabled > 0.5;

        const filmGrainToggle = document.getElementById('filmGrainToggle');
        if (filmGrainToggle) filmGrainToggle.checked = this.settings.filmGrainEnabled > 0.5;

        const fxaaToggle = document.getElementById('fxaaToggle');
        if (fxaaToggle) fxaaToggle.checked = this.settings.fxaaEnabled > 0.5;

        this.updatePostProcesses();
    }

    updatePostProcesses() {
        if (!this.camera) return;
        
        const shouldEnable = this.settings.fxaaEnabled > 0.5;
        if (shouldEnable) {
            if (!this.fxaaPostProcess) {
                this.fxaaPostProcess = new FxaaPostProcess("fxaa", 1.0, this.camera);
            }
        } else {
            if (this.fxaaPostProcess) {
                this.fxaaPostProcess.dispose(this.camera);
                this.fxaaPostProcess = null;
            }
        }
    }

    handleKeyPress(event) {
        switch (event.key) {
            case 'r':
                this.camera.alpha = 0.0;
                this.camera.beta = Math.PI / 2.15;
                this.camera.radius = 450;
                this.camera.setTarget(Vector3.Zero());
                break;
            case 'p':
                console.log(`FPS: ${this.performanceMonitor.getFPS()}`);
                break;
            case 'd':
                this.scene.debugLayer.isVisible() ?
                    this.scene.debugLayer.hide() :
                    this.scene.debugLayer.show();
                break;
        }
    }

    updateCamButtonState(activeId) {
        const camButtons = document.querySelectorAll('.btn-camera');
        camButtons.forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.getElementById(activeId);
        if (activeBtn) activeBtn.classList.add('active');
    }

    startRenderLoop() {
        this.engine.runRenderLoop(() => {
            try {
                const now = performance.now();
                
                // 1. Idle Detection (transition cap to 35 FPS after 5 seconds of inactivity)
                if (!this.isIdle && (now - this.lastInputTime > 5000.0)) {
                    this.isIdle = true;
                    this.fpsCap = 35.0;
                }
                
                // 2. Framerate throttling regulator
                const elapsed = now - this.lastFrameTime;
                const limitFps = this.settings.fpsLimitEnabled > 0.5;
                const targetInterval = limitFps ? (1000.0 / this.fpsCap) : (this.isIdle ? 1000.0 / 35.0 : 0.0);
                
                if (elapsed >= targetInterval) {
                    // Update frame reference timestamp
                    this.lastFrameTime = now - (limitFps || this.isIdle ? (elapsed % targetInterval) : 0.0);
                    
                    // Render frame
                    this.scene.render();
                }
            } catch (error) {
                console.error('Render error:', error);
            }
        });
    }

    dispose() {
        if (this.fxaaPostProcess) {
            this.fxaaPostProcess.dispose(this.camera);
            this.fxaaPostProcess = null;
        }
        if (this.scene) {
            this.scene.dispose();
        }
        if (this.engine) {
            this.engine.dispose();
        }
    }
}
