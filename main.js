import { Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight, MeshBuilder, Color3, StandardMaterial, GlowLayer, Texture, PointLight, LensFlareSystem, LensFlare, PlaneBuilder, HDRCubeTexture, PBRMaterial, CubeTexture, BackgroundMaterial, PostProcess, Matrix, Effect } from 'babylonjs';
import 'babylonjs-loaders';

const canvas = document.getElementById('renderCanvas');
const engine = new Engine(canvas, true);

function createScene() {
  const scene = new Scene(engine);

  // 1. Load HDR environment texture for lighting
  const hdrTexture = new HDRCubeTexture('models/HDR_subdued_blue_nebulae.hdr', scene, 2048);
  scene.environmentTexture = hdrTexture;

  // 2. Create a seamless equirectangular HDRI background
  const backgroundMaterial = new BackgroundMaterial('backgroundMaterial', scene);
  backgroundMaterial.backFaceCulling = false;
  backgroundMaterial.reflectionTexture = new Texture('models/HDR_subdued_blue_nebulae.hdr', scene, false, false, Texture.BILINEAR_SAMPLINGMODE, null, null, undefined, true); // isHDR = true
  backgroundMaterial.reflectionTexture.coordinatesMode = Texture.FIXED_EQUIRECTANGULAR_MODE;

  const backgroundSphere = MeshBuilder.CreateSphere('backgroundSphere', { segments: 32, diameter: 2000 }, scene);
  backgroundSphere.material = backgroundMaterial;
  backgroundSphere.infiniteDistance = true;
  backgroundSphere.isPickable = false;

  // Camera
  const camera = new ArcRotateCamera('camera', Math.PI / 2, Math.PI / 2.5, 50, Vector3.Zero(), scene);
  camera.attachControl(canvas, true);
  // Disable zooming (mouse wheel)
  camera.lowerRadiusLimit = camera.radius;
  camera.upperRadiusLimit = camera.radius;

  // Lighting
  const hemiLight = new HemisphericLight('hemiLight', new Vector3(0, 1, 0), scene);
  hemiLight.intensity = 0.5;

  // Add a black hole (dark sphere) at the origin
  const blackHole = MeshBuilder.CreateSphere('blackHole', { diameter: 20, segments: 32 }, scene);
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
      if (dist < r) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }
      // Only lensing: no artificial glow color, just the lensed background
      vec4 bg = texture2D(textureSampler, uv);
      gl_FragColor = bg;
    }
  `;

  const blackHoleScreenPos = () => {
    // Project black hole position to screen space
    const bhPos = blackHole.position;
    const projected = Vector3.Project(
      bhPos,
      Matrix.Identity(),
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
    effect.setFloat("blackHoleRadius", 0.14); // Increased for larger black hole
    effect.setFloat("lensStrength", 0.45); // Stronger lensing
    effect.setFloat("aspectRatio", engine.getRenderWidth() / engine.getRenderHeight());
  };

  // Bloom/Glow effect
  const glowLayer = new GlowLayer('glow', scene, { blurKernelSize: 256 });
  glowLayer.intensity = 3.0;

  // Animate the glow for a living sun effect
  let glowTime = 0;
  scene.registerBeforeRender(() => {
    glowTime += engine.getDeltaTime() * 0.00015; // Slow animation
    // Subtle sine wave for intensity (range: 2.7 - 3.3)
    glowLayer.intensity = 3.0 + 0.3 * Math.sin(glowTime);
    // Optional: Subtle sine wave for blur (range: 220 - 256)
    const blur = 238 + 18 * Math.sin(glowTime + 1.5); // phase offset
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