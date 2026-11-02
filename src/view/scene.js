import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createLaptopAssembly } from "./laptopModel.js";
import { createAirflowParticles } from "./particles.js";

/**
 * Creates a self-contained Three.js thermal viewport (Scene, Camera, WebGLRenderer,
 * OrbitControls, Studio Lighting, Exploded Laptop Assembly, and Airflow Particles).
 * Follows `threejs-fundamentals`, `threejs-lighting`, and `threejs-performance`.
 */
export function createThermalViewport(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
  } catch (err) {
    console.warn("WebGLRenderer initialization failed:", err);
    return null;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.debug.checkShaderErrors = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // r186 soft default (never PCFSoftShadowMap)

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x08090c);

  // Subtle environment reflections via RoomEnvironment
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  scene.environment = pmrem.fromScene(roomEnv, 0.04).texture;
  scene.environmentIntensity = 0.45;
  roomEnv.dispose();
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  const defaultCamPos = new THREE.Vector3(0.0, 4.9, 6.2);
  const defaultTarget = new THREE.Vector3(0.0, 0.55, -0.15);
  camera.position.copy(defaultCamPos);

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(defaultTarget);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 3.2;
  controls.maxDistance = 13.5;
  controls.maxPolarAngle = Math.PI / 2 + 0.08;
  controls.zoomToCursor = true;
  controls.update();

  // Three-point studio lighting + subtle lab floor grid
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
  keyLight.position.set(4.5, 7.5, 4.0);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.left = -4.2;
  keyLight.shadow.camera.right = 4.2;
  keyLight.shadow.camera.top = 4.2;
  keyLight.shadow.camera.bottom = -4.2;
  keyLight.shadow.camera.near = 1.0;
  keyLight.shadow.camera.far = 16.0;
  keyLight.shadow.normalBias = 0.02;
  keyLight.shadow.bias = -0.0002;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.75);
  fillLight.position.set(-5.0, 3.5, 3.0);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.9);
  rimLight.position.set(0.0, 4.0, -5.5);
  scene.add(rimLight);

  // Subtle reference floor grid
  const gridHelper = new THREE.GridHelper(11, 22, 0x1e293b, 0x111827);
  gridHelper.position.y = -0.14;
  scene.add(gridHelper);

  const laptop = createLaptopAssembly();
  scene.add(laptop.root);

  const particles = createAirflowParticles(140);
  scene.add(particles.mesh);

  function resize() {
    const parent = canvas.parentElement;
    if (!parent || parent.hidden) return;
    const width = Math.max(parent.clientWidth, 1);
    const height = Math.max(parent.clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  function resetCamera() {
    camera.position.copy(defaultCamPos);
    controls.target.copy(defaultTarget);
    controls.update();
  }

  function renderFrame(simState, delta, elapsed, reducedMotion) {
    controls.update(delta);
    laptop.update(simState, delta, elapsed, reducedMotion);
    particles.update(simState, laptop.getExplodeTarget(), delta, reducedMotion);
    renderer.render(scene, camera);
  }

  resize();

  return {
    renderer,
    scene,
    camera,
    controls,
    laptop,
    particles,
    resize,
    resetCamera,
    renderFrame,
  };
}
