import { Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight, MeshBuilder, Color3, StandardMaterial, GlowLayer, Texture, HDRCubeTexture, BackgroundMaterial, PostProcess, Matrix, Effect } from 'babylonjs';
import 'babylonjs-loaders';

const canvas = document.getElementById('renderCanvas');
const engine = new Engine(canvas, true);

// --- Configuration Constants ---
const HDR_TEXTURE_PATH = 'models/HDR_subdued_blue_nebulae.hdr';
const HDR_TEXTURE_SIZE = 2048;

const BACKGROUND_SPHERE_DIAMETER = 2000;
const BACKGROUND_SPHERE_SEGMENTS = 32;

const CAMERA_ALPHA = Math.PI / 2;
const CAMERA_BETA = Math.PI / 2.5;
const CAMERA_INITIAL_RADIUS = 50;

const HEMI_LIGHT_INTENSITY = 0.5;

const BLACK_HOLE_DIAMETER = 20;
const BLACK_HOLE_SEGMENTS = 32;
const BLACK_HOLE_WORLD_RADIUS = BLACK_HOLE_DIAMETER / 2;

const LENSING_STRENGTH = 0.45;

const GLOW_LAYER_INITIAL_BLUR_KERNEL_SIZE = 256;
const GLOW_LAYER_INITIAL_INTENSITY = 3.0;
const GLOW_ANIM_SPEED = 0.00015;
const GLOW_ANIM_INTENSITY_BASE = GLOW_LAYER_INITIAL_INTENSITY;
const GLOW_ANIM_INTENSITY_AMP = 0.3;
const GLOW_ANIM_BLUR_BASE = 238;
const GLOW_ANIM_BLUR_AMP = 18;
const GLOW_ANIM_BLUR_PHASE_OFFSET = 1.5;
// --- End Configuration Constants ---

function createScene() {
  const scene = new Scene(engine);

  // 1. Load HDR environment texture for lighting
  const hdrTexture = new HDRCubeTexture(HDR_TEXTURE_PATH, scene, HDR_TEXTURE_SIZE);
  scene.environmentTexture = hdrTexture;

  // 2. Create a seamless equirectangular HDRI background
  const backgroundMaterial = new BackgroundMaterial('backgroundMaterial', scene);
  backgroundMaterial.backFaceCulling = false;
  backgroundMaterial.reflectionTexture = new Texture(HDR_TEXTURE_PATH, scene, false, false, Texture.BILINEAR_SAMPLINGMODE, null, null, undefined, true); // isHDR = true
  backgroundMaterial.reflectionTexture.coordinatesMode = Texture.FIXED_EQUIRECTANGULAR_MODE;

  const backgroundSphere = MeshBuilder.CreateSphere('backgroundSphere', { segments: BACKGROUND_SPHERE_SEGMENTS, diameter: BACKGROUND_SPHERE_DIAMETER }, scene);
  backgroundSphere.material = backgroundMaterial;
  backgroundSphere.infiniteDistance = true;
  backgroundSphere.isPickable = false;

  // Camera
  const camera = new ArcRotateCamera('camera', CAMERA_ALPHA, CAMERA_BETA, CAMERA_INITIAL_RADIUS, Vector3.Zero(), scene);
  camera.attachControl(canvas, true);
  // Disable zooming (mouse wheel)
  camera.lowerRadiusLimit = camera.radius;
  camera.upperRadiusLimit = camera.radius;

  // Lighting
  const hemiLight = new HemisphericLight('hemiLight', new Vector3(0, 1, 0), scene);
  hemiLight.intensity = HEMI_LIGHT_INTENSITY;

  // Add a black hole (dark sphere) at the origin
  const blackHole = MeshBuilder.CreateSphere('blackHole', { diameter: BLACK_HOLE_DIAMETER, segments: BLACK_HOLE_SEGMENTS }, scene);
  const blackHoleMaterial = new StandardMaterial('blackHoleMat', scene);
  blackHoleMaterial.diffuseColor = new Color3(0, 0, 0);
  blackHoleMaterial.specularColor = new Color3(0, 0, 0);
  blackHoleMaterial.emissiveColor = new Color3(0, 0, 0);
  blackHole.material = blackHoleMaterial;

  // Gravitational lensing post-process
  // Accurate lensing using a custom fragment shader
  Effect.ShadersStore["gravitationalLensingFragmentShader"] = `
    precision highp float;
    varying vec2 vUV;
    uniform sampler2D textureSampler;
    uniform vec2 blackHoleCenter;
    uniform float blackHoleRadius;
    uniform float lensStrength;
    uniform float aspectRatio;
    void main(void) {
      vec2 uv = vUV;
      vec2 toCenter = uv - blackHoleCenter;
      // Correct for aspect ratio so the black hole is circular
      toCenter.x *= aspectRatio;
      float dist = length(toCenter);
      float r = blackHoleRadius;
      float rs = r * 0.5; // Schwarzschild radius (approx)
      float theta = atan(toCenter.y, toCenter.x);
      float d = dist;
      // Physically accurate Schwarzschild lensing approximation
      float lensingRange = r * 8.0;
      float maxDeflection = 1.5; // Clamp to avoid over-bending
      float fadeStart = r * 6.0;
      float fade = 1.0;
      if (dist > fadeStart) {
        fade = 1.0 - smoothstep(fadeStart, lensingRange, dist);
      }
      if (dist < lensingRange) {
        float b = max(dist, 0.0001);
        // Schwarzschild deflection: alpha = 4GM/(c^2 b) ~ 2rs/b (in units)
        float alpha = lensStrength * rs / b; // Deflection angle
        alpha = clamp(alpha, -maxDeflection, maxDeflection);
        float newDist = dist + fade * alpha * exp(-dist / r) * 2.5; // Stronger, but clamped, lensing
        // Undo aspect ratio correction for uv
        vec2 offset = newDist * vec2(cos(theta), sin(theta));
        offset.x /= aspectRatio;
        uv = blackHoleCenter + offset;
      }
      // Hard black hole shadow (event horizon)
      // if (dist < r) {
      //   gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      //   return;
      // }
      // vec4 bg = texture2D(textureSampler, uv);
      // gl_FragColor = bg;

      // Smoother transition for event horizon to reduce aliasing/rings
      // 'r' is normalized screen radius. 'dist' is in a similar space (Y normalized, X aspect-corrected).
      // A small delta for the transition width in this normalized space.
      float transitionDelta = 0.003; // Adjust for desired softness. ~1.5-3% of a typical 'r' value.
      float shadowMix = smoothstep(r - transitionDelta, r + transitionDelta, dist);

      vec4 backgroundColor = texture2D(textureSampler, uv);
      gl_FragColor = mix(vec4(0.0, 0.0, 0.0, 1.0), backgroundColor, shadowMix);
    }
  `;

  const blackHoleScreenPos = () => {
    // Project black hole position to screen space
    const bhPos = blackHole.position;
    const projected = Vector3.Project(
      bhPos,
      blackHole.getWorldMatrix(), // Use actual world matrix for robustness
      scene.getTransformMatrix(),
      camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
    );
    return { x: projected.x / engine.getRenderWidth(), y: 1.0 - projected.y / engine.getRenderHeight() };
  };

  const lensing = new PostProcess(
    "gravitationalLensing",
    "gravitationalLensing",
    ["blackHoleCenter", "blackHoleRadius", "lensStrength", "aspectRatio"],
    null,
    1.0,
    camera
  );
  lensing.onApply = function(effect) {
    const center = blackHoleScreenPos();
    effect.setFloat2("blackHoleCenter", center.x, center.y);

    // Calculate normalizedScreenRadius based on angular size for stability during panning.
    // BLACK_HOLE_WORLD_RADIUS is the actual radius of the black hole in world units.
    // camera.radius is the distance from the camera to its target (the black hole's center).
    // camera.fov is the camera's vertical field of view in radians.
    // The angular radius of the black hole as seen by the camera:
    const angularRadius = Math.atan(BLACK_HOLE_WORLD_RADIUS / camera.radius);

    // The shader's `blackHoleRadius` (our `normalizedScreenRadius`) should be the
    // black hole's radius as a fraction of the screen height.
    // If angular diameter = fov, normalized radius = 0.5. So, angular radius / fov.
    const normalizedScreenRadius = angularRadius / camera.fov;

    effect.setFloat("blackHoleRadius", normalizedScreenRadius);
    effect.setFloat("lensStrength", LENSING_STRENGTH);
    effect.setFloat("aspectRatio", engine.getRenderWidth() / engine.getRenderHeight());
  };

  // Bloom/Glow effect
  const glowLayer = new GlowLayer('glow', scene, { blurKernelSize: GLOW_LAYER_INITIAL_BLUR_KERNEL_SIZE });
  glowLayer.intensity = GLOW_LAYER_INITIAL_INTENSITY;

  // Animate the glow for a living sun effect
  let glowTime = 0;
  scene.registerBeforeRender(() => {
    glowTime += engine.getDeltaTime() * GLOW_ANIM_SPEED;
    glowLayer.intensity = GLOW_ANIM_INTENSITY_BASE + GLOW_ANIM_INTENSITY_AMP * Math.sin(glowTime);
    const blur = GLOW_ANIM_BLUR_BASE + GLOW_ANIM_BLUR_AMP * Math.sin(glowTime + GLOW_ANIM_BLUR_PHASE_OFFSET);
    if (glowLayer.blurKernelSize !== Math.round(blur)) {
      glowLayer.blurKernelSize = Math.round(blur);
    }
  });

  return scene;
}

const scene = createScene();
engine.runRenderLoop(() => {
  scene.render();
});

window.addEventListener('resize', () => {
  engine.resize();
}); 