export class LensingConfig {
    static HDR = {
        TEXTURE_PATH: 'models/HDR_subdued_blue_nebulae.hdr',
        TEXTURE_SIZE: 2048
    };

    static BACKGROUND = {
        SPHERE_DIAMETER: 2000,
        SPHERE_SEGMENTS: 32
    };

    static CAMERA = {
        ALPHA: Math.PI / 2,
        BETA: Math.PI / 2.5,
        INITIAL_RADIUS: 50,
        MIN_RADIUS: 20,
        MAX_RADIUS: 200,
        PAN_SENSITIVITY: 0.8,
        ZOOM_SENSITIVITY: 0.5
    };

    static LIGHTING = {
        HEMI_INTENSITY: 0.5,
        ENVIRONMENT_INTENSITY: 1.0
    };

    static BLACK_HOLE = {
        DIAMETER: 20,
        SEGMENTS: 64, // Increased for smoother appearance
        get WORLD_RADIUS() { return this.DIAMETER / 2; }
    };

    static LENSING = {
        STRENGTH: 0.55,
        FALLOFF_SCALE: 1.5,
        AMPLITUDE: 2.8,
        MAX_DEFLECTION: 1.5,
        TRANSITION_SOFTNESS: 0.003,
        SCHWARZSCHILD_FACTOR: 0.5
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
        LOD_DISTANCE_THRESHOLD: 100
    };
}
