import { 
  Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight, 
  MeshBuilder, Color3, StandardMaterial, GlowLayer, Texture, 
  HDRCubeTexture, BackgroundMaterial, PostProcess, Matrix, Effect,
  PBRMaterial, Animation, AnimationGroup, Tools
} from 'babylonjs';
import 'babylonjs-loaders';

// --- Enhanced Configuration System ---
class LensingConfig {
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

// --- Utility Classes ---
class MathUtils {
  static clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  static lerp(a, b, t) {
    return a + (b - a) * t;
  }

  static smoothstep(edge0, edge1, x) {
    const t = this.clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }
}

class PerformanceMonitor {
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

// --- Enhanced Shader System ---
class ShaderManager {
  static createGravitationalLensingShader() {
    Effect.ShadersStore["gravitationalLensingFragmentShader"] = `
      precision highp float;
      
      // Varyings
      varying vec2 vUV;
      
      // Uniforms
      uniform sampler2D textureSampler;
      uniform vec2 blackHoleCenter;
      uniform float blackHoleRadius;
      uniform float lensStrength;
      uniform float aspectRatio;
      uniform float lensEffectFalloffScale;
      uniform float lensEffectAmplitude;
      uniform float time; // For subtle time-based effects
      uniform float transitionSoftness;
      uniform float schwarzschildFactor;
      
      // Enhanced noise function for subtle distortions
      float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
      }
      
      float noise(vec2 st) {
        vec2 i = floor(st);
        vec2 f = fract(st);
        float a = random(i);
        float b = random(i + vec2(1.0, 0.0));
        float c = random(i + vec2(0.0, 1.0));
        float d = random(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }

      void main(void) {
        vec2 uv = vUV;
        vec2 toCenter = uv - blackHoleCenter;
        
        // Correct for aspect ratio
        toCenter.x *= aspectRatio;
        float dist = length(toCenter);
        float r = blackHoleRadius;
        float rs = r * schwarzschildFactor;
        float theta = atan(toCenter.y, toCenter.x);
        
        // Enhanced lensing calculation
        float lensingRange = r * 8.0;
        float fadeStart = r * 6.0;
        float fade = 1.0;
        
        if (dist > fadeStart) {
          fade = 1.0 - smoothstep(fadeStart, lensingRange, dist);
        }
        
        if (dist < lensingRange && dist > 0.0001) {
          float b = max(dist, 0.0001);
          
          // Improved Schwarzschild deflection with time-based perturbation
          float baseAlpha = lensStrength * rs / b;
          float timeEffect = 1.0 + 0.02 * sin(time * 0.5 + theta * 3.0);
          float alpha = baseAlpha * timeEffect;
          
          // Clamp deflection
          alpha = clamp(alpha, -${LensingConfig.LENSING.MAX_DEFLECTION}, ${LensingConfig.LENSING.MAX_DEFLECTION});
          
          // Apply enhanced deflection with exponential falloff
          float falloffTerm = exp(-dist / (r * lensEffectFalloffScale));
          float newDist = dist + fade * alpha * falloffTerm * lensEffectAmplitude;
          
          // Add subtle noise for more realistic distortion
          float noiseScale = 0.001 * fade * falloffTerm;
          newDist += noiseScale * noise(uv * 100.0 + time * 0.1);
          
          // Calculate new UV coordinates
          vec2 offset = newDist * vec2(cos(theta), sin(theta));
          offset.x /= aspectRatio;
          uv = blackHoleCenter + offset;
        }
        
        // Enhanced event horizon rendering with improved transition
        float transitionDelta = transitionSoftness;
        float shadowMix = smoothstep(r - transitionDelta, r + transitionDelta, dist);
        
        // Sample background with bounds checking
        uv = clamp(uv, vec2(0.0), vec2(1.0));
        vec4 backgroundColor = texture2D(textureSampler, uv);
        
        // Create more realistic black hole appearance
        vec3 blackHoleColor = vec3(0.0);
        
        // Add subtle accretion disk glow near the event horizon
        if (dist > r && dist < r * 1.5) {
          float glowIntensity = (1.5 * r - dist) / (0.5 * r);
          glowIntensity = pow(glowIntensity, 2.0) * 0.1;
          blackHoleColor = mix(blackHoleColor, vec3(1.0, 0.6, 0.2), glowIntensity);
        }
        
        gl_FragColor = mix(vec4(blackHoleColor, 1.0), backgroundColor, shadowMix);
      }
    `;
  }
}

// --- Enhanced Black Hole Class ---
class BlackHole {
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

// --- Enhanced Lensing Effect Class ---
class LensingEffect {
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

// --- Enhanced Scene Manager ---
class SceneManager {
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

// --- Initialize Application ---
try {
  const sceneManager = new SceneManager();
  
  // Expose for debugging
  window.sceneManager = sceneManager;
  
} catch (error) {
  console.error('Failed to initialize application:', error);
  
  // Show user-friendly error message
  const canvas = document.getElementById('renderCanvas');
  if (canvas) {
    canvas.style.display = 'none';
    const errorDiv = document.createElement('div');
    errorDiv.innerHTML = `
      <div style="text-align: center; padding: 50px; color: #ff6b6b;">
        <h2>Failed to Load Gravitational Lensing Visualization</h2>
        <p>Please check the console for more details.</p>
        <p>Make sure your browser supports WebGL and the HDR texture file is available.</p>
      </div>
    `;
    canvas.parentNode.insertBefore(errorDiv, canvas);
  }
}