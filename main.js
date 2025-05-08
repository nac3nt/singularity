import { Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight, MeshBuilder, Color3, StandardMaterial, GlowLayer, Texture, PointLight, LensFlareSystem, LensFlare, PlaneBuilder, HDRCubeTexture, PBRMaterial, CubeTexture, BackgroundMaterial } from 'babylonjs';
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

  // Lighting
  const hemiLight = new HemisphericLight('hemiLight', new Vector3(0, 1, 0), scene);
  hemiLight.intensity = 0.5;

  // Sun (emissive sphere)
  const sun = MeshBuilder.CreateSphere('sun', { diameter: 10, segments: 32 }, scene);
  const sunMaterial = new StandardMaterial('sunMat', scene);
  sunMaterial.emissiveColor = new Color3(1, 0.97, 0.85);
  sunMaterial.diffuseColor = new Color3(1, 0.97, 0.85);
  sunMaterial.specularColor = new Color3(1, 1, 1);
  sun.material = sunMaterial;

  // PointLight at the sun's position
  const sunLight = new PointLight('sunLight', new Vector3(0, 0, 0), scene);
  sunLight.intensity = 2.5;
  sunLight.diffuse = new Color3(1, 0.97, 0.85);
  sunLight.specular = new Color3(1, 1, 1);

  // Lens flare system (use a simple color instead of a texture)
  const lensFlareSystem = new LensFlareSystem('sunFlare', sunLight, scene);
  new LensFlare(1.0, 0, new Color3(1, 0.97, 0.85), null, lensFlareSystem);
  new LensFlare(0.5, 0.2, new Color3(1, 1, 1), null, lensFlareSystem);
  new LensFlare(0.2, 0.5, new Color3(1, 0.8, 0.3), null, lensFlareSystem);

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