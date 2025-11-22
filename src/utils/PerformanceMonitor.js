import { LensingConfig } from '../Config.js';

export class PerformanceMonitor {
    constructor(engine) {
        this.engine = engine;
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.fps = 60;
        this.adaptiveQuality = LensingConfig.PERFORMANCE.ADAPTIVE_QUALITY;
    }

    update() {
        this.frameCount++;
        const currentTime = performance.now();

        if (currentTime - this.lastTime >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastTime = currentTime;

            if (this.adaptiveQuality) {
                this.adjustQuality();
            }
        }
    }

    adjustQuality() {
        const targetFps = LensingConfig.PERFORMANCE.TARGET_FPS;
        if (this.fps < targetFps * 0.8) {
            // Reduce quality
            console.log('Reducing quality for better performance');
        } else if (this.fps > targetFps * 1.1) {
            // Increase quality
            console.log('Increasing quality');
        }
    }

    getFPS() {
        return this.fps;
    }
}
