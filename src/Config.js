export class LensingConfig {
    static HDR = {
        TEXTURE_PATH: '/models/HDR_subdued_blue_nebulae.hdr',
        TEXTURE_SIZE: 2048
    };

    static BACKGROUND = {
        SPHERE_DIAMETER: 2000,
        SPHERE_SEGMENTS: 32
    };

    static CAMERA = {
        ALPHA: Math.PI / 2,
        BETA: Math.PI / 3,
        INITIAL_RADIUS: 500,
        MIN_RADIUS: 100,
        MAX_RADIUS: 1200,
        PAN_SENSITIVITY: 0.8,
        ZOOM_SENSITIVITY: 0.5
    };

    static LIGHTING = {
        HEMI_INTENSITY: 0.5,
        ENVIRONMENT_INTENSITY: 1.0
    };

    static BLACK_HOLE = {
        DIAMETER: 20,
        SEGMENTS: 64,
        get WORLD_RADIUS() { return this.DIAMETER / 2; }
    };

    static Lensing = {
        STRENGTH: 0.55,
        FALLOFF_SCALE: 1.5,
        AMPLITUDE: 2.8,
        MAX_DEFLECTION: 1.5,
        TRANSITION_SOFTNESS: 0.003,
        SCHWARZSCHILD_FACTOR: 0.5
    };

    static ACCRETION_DISK = {
        INNER_RADIUS: 3.0,
        OUTER_RADIUS: 12.0,
        HEIGHT: 0.05,
        COLOR_INNER: { r: 0.9, g: 0.85, b: 0.6 },
        COLOR_OUTER: { r: 0.6, g: 0.15, b: 0.05 },
        NOISE_SCALE: 0.15,
        NOISE_SPEED: 0.3,
        OPACITY: 0.7
    };

    static PHYSICS = {
        DOPPLER_STRENGTH: 1.0,
        REDSHIFT_STRENGTH: 1.0,
        LORENTZ_BOOST: 0.3
    };

    static GLOW = {
        INITIAL_BLUR_KERNEL: 256,
        INITIAL_INTENSITY: 3.0,
        ANIMATION: {
            SPEED: 0.00015,
            INTENSITY_BASE: 3.0,
            INTENSITY_AMPLITUDE: 0.3,
            BLUR_BASE: 238,
            BLUR_AMPLITUDE: 18,
            BLUR_PHASE_OFFSET: 1.5
        }
    };

    static PERFORMANCE = {
        TARGET_FPS: 60,
        ADAPTIVE_QUALITY: true,
        LOD_DISTANCE_THRESHOLD: 100,
        RENDER_SCALE: 1.0,
        MAX_STEPS: 250
    };

    static PRESETS = {
        quasar: {
            title: "Realistic Active",
            schwarzschildRadius: 20.0,
            blackHoleSpin: 0.90,
            lensStrength: 0.55,
            diskInnerRadius: 3.0,
            diskOuterRadius: 12.0,
            diskHeight: 0.05,
            diskNoiseScale: 0.15,
            diskNoiseSpeed: 0.85,
            diskOpacity: 0.7,
            dopplerStrength: 1.0,
            redshiftStrength: 1.0,
            colorShiftEnabled: 1.0,
            maxSteps: 250,
            colorInner: { r: 0.9, g: 0.85, b: 0.6 },
            colorOuter: { r: 0.6, g: 0.15, b: 0.05 }
        },
        stellar: {
            title: "Stellar-Mass",
            schwarzschildRadius: 12.0,
            blackHoleSpin: 0.40,
            lensStrength: 0.75,
            diskInnerRadius: 3.0,
            diskOuterRadius: 10.0,
            diskHeight: 0.07,
            diskNoiseScale: 0.22,
            diskNoiseSpeed: 0.85,
            diskOpacity: 0.85,
            dopplerStrength: 1.0,
            redshiftStrength: 1.0,
            colorShiftEnabled: 1.0,
            maxSteps: 250,
            colorInner: { r: 0.85, g: 0.45, b: 0.1 },
            colorOuter: { r: 0.4, g: 0.05, b: 0.02 }
        },
        gargantua: {
            title: "Artistic Gold",
            schwarzschildRadius: 24.0,
            blackHoleSpin: 0.95,
            lensStrength: 0.45,
            diskInnerRadius: 3.2,
            diskOuterRadius: 15.0,
            diskHeight: 0.03,
            diskNoiseScale: 0.12,
            diskNoiseSpeed: 0.85,
            diskOpacity: 0.6,
            dopplerStrength: 0.0,
            redshiftStrength: 0.3,
            colorShiftEnabled: 0.0,
            maxSteps: 250,
            colorInner: { r: 0.95, g: 0.8, b: 0.4 },
            colorOuter: { r: 0.8, g: 0.45, b: 0.15 }
        },
        scientific: {
            title: "Scientific Grid",
            schwarzschildRadius: 16.0,
            blackHoleSpin: 0.0,
            lensStrength: 1.2,
            diskInnerRadius: 3.0,
            diskOuterRadius: 13.0,
            diskHeight: 0.02,
            diskNoiseScale: 0.05,
            diskNoiseSpeed: 0.85,
            diskOpacity: 0.3,
            dopplerStrength: 0.0,
            redshiftStrength: 0.0,
            colorShiftEnabled: 0.0,
            maxSteps: 200,
            colorInner: { r: 0.4, g: 0.7, b: 1.0 },
            colorOuter: { r: 0.1, g: 0.3, b: 0.6 }
        }
    };
}
