import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const W = 3.4;
const L = 6.0;
const xMin = -L / 2;
const xMax = L / 2;
const zFront = -W / 2;
const zBack = W / 2;
const hFront = 2.7;
const hBack = 2.5;
const slope = (hBack - hFront) / W;
const hMax = Math.max(hFront, hBack);
const doorOpeningTop = 2.04;
const doorOpeningWidth = 2.1;
const doorOpeningHalfWidth = doorOpeningWidth / 2;
const doorReturnWidth = 0.08;
const doorFrameWidth = 0.07;
const doorRailHeight = 0.07;
const doorFrameDepth = 0.11;
const wallThickness = 0.14;
const exteriorWallGap = 0.006;
const topFrameThickness = 0.08;
const POV_EYE_HEIGHT = 1.75;
const POV_WALK_SPEED = 1.45;
const POV_BOUNDS = {
  minX: xMin + 0.18,
  maxX: xMax - 0.18,
  minZ: zFront + 0.18,
  maxZ: zBack - 0.18,
};
const lightSwitchPosition = new THREE.Vector3(-1.28, 1.18, zFront + 0.022);
const baseDownlightIntensity = 1.25;
const baseDownlightEmissiveIntensity = 2.8;
const exteriorGrassWidth = 14;
const exteriorGrassDepth = 10;
const exteriorGroundY = -0.026;
const exteriorStepWidth = doorOpeningWidth + 0.48;
const exteriorStepDepth = 0.78;
const exteriorStepBackZ = zFront - exteriorWallGap - wallThickness - 0.015;
const exteriorStepFrontZ = exteriorStepBackZ - exteriorStepDepth;
const fenceBounds = {
  minX: -exteriorGrassWidth / 2 + 0.34,
  maxX: exteriorGrassWidth / 2 - 0.34,
  minZ: -exteriorGrassDepth / 2 + 0.34,
  maxZ: exteriorGrassDepth / 2 - 0.34,
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc8ee);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.42;
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.05, 80);
scene.add(camera);

const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.08;
orbitControls.screenSpacePanning = true;
orbitControls.minDistance = 0.7;
orbitControls.maxDistance = 12;
orbitControls.maxPolarAngle = Math.PI * 0.49;
orbitControls.target.set(0, 1.0, 0);
orbitControls.update();

const povControls = new PointerLockControls(camera, renderer.domElement);
const clock = new THREE.Clock();
const povButton = document.getElementById('povButton');
const wallCutawayButton = document.getElementById('wallCutawayButton');
const povReticle = document.getElementById('povReticle');
const lightPanel = document.getElementById('lightPanel');
const closeLightPanel = document.getElementById('closeLightPanel');
const lightPower = document.getElementById('lightPower');
const lightBrightness = document.getElementById('lightBrightness');
const lightBrightnessValue = document.getElementById('lightBrightnessValue');
const lightTemperature = document.getElementById('lightTemperature');
const lightTemperatureValue = document.getElementById('lightTemperatureValue');
const lightColor = document.getElementById('lightColor');
const movement = {
  forward: false,
  back: false,
  left: false,
  right: false,
};
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const downlightLights = [];
const downlightDisks = [];
const lightSwitchTargets = [];
const shelfGlowLights = [];
const screenGlowLights = [];
const downlightState = {
  on: true,
  brightness: 1,
  temperature: 3000,
  tint: '#ffffff',
};
let ambientLight = null;
let hemisphereLight = null;
let sunLight = null;
let fillLight = null;
let doorLight = null;
let isPovMode = false;
let isLightPanelOpen = false;
let wallCutawayEnabled = false;
let keepPovOnUnlock = false;
let pointerLockPendingExitOnFailure = false;
let pointerLockFailureTimer = null;
let isExitingPov = false;
let lightSwitchRocker = null;
let ceilingMesh = null;
let grassGroundMesh = null;
let grassBladeMesh = null;
let woodenStepGroup = null;
let backyardFenceGroup = null;

function clampPovPosition() {
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, POV_BOUNDS.minX, POV_BOUNDS.maxX);
  camera.position.y = POV_EYE_HEIGHT;
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, POV_BOUNDS.minZ, POV_BOUNDS.maxZ);
}

function setPovCamera() {
  camera.fov = 74;
  camera.position.set(-0.1, POV_EYE_HEIGHT, 0.45);
  camera.rotation.set(0, 0, 0);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  clampPovPosition();
}

function finishPovExit() {
  isExitingPov = false;
  pointerLockPendingExitOnFailure = false;
  if (pointerLockFailureTimer) {
    clearTimeout(pointerLockFailureTimer);
    pointerLockFailureTimer = null;
  }
  setPovModeActive(false);
  setOrbitCamera();
}

function requestPovPointerLock({ exitOnFailure = true } = {}) {
  if (!isPovMode || isLightPanelOpen || povControls.isLocked) return;
  pointerLockPendingExitOnFailure = exitOnFailure;
  if (pointerLockFailureTimer) clearTimeout(pointerLockFailureTimer);

  let lockRequest = null;
  try {
    lockRequest = renderer.domElement.requestPointerLock();
  } catch (error) {
    console.warn('Pointer lock was unavailable.', error);
    if (exitOnFailure) finishPovExit();
    return;
  }

  if (lockRequest && typeof lockRequest.catch === 'function') {
    lockRequest.catch((error) => {
      console.warn('Pointer lock was unavailable.', error);
      pointerLockPendingExitOnFailure = false;
      if (exitOnFailure && isPovMode && !isLightPanelOpen && !povControls.isLocked) finishPovExit();
    });
  }

  pointerLockFailureTimer = window.setTimeout(() => {
    pointerLockFailureTimer = null;
    if (pointerLockPendingExitOnFailure && isPovMode && !isLightPanelOpen && !povControls.isLocked) {
      pointerLockPendingExitOnFailure = false;
      finishPovExit();
    }
  }, 900);
}

function enterPovMode() {
  setPovCamera();
  setPovModeActive(true);
  requestPovPointerLock({ exitOnFailure: true });
}

function setPovButtonActive(isActive) {
  if (!povButton) return;
  povButton.textContent = isActive ? 'POV Active' : 'Enter POV';
  povButton.classList.toggle('is-active', isActive);
  povButton.setAttribute('aria-pressed', String(isActive));
  povButton.title = isActive ? 'POV mode is active' : 'Enter first-person POV mode';
  if (povReticle) povReticle.hidden = !isActive || isLightPanelOpen;
}

function setWallCutawayButtonActive(isActive) {
  if (!wallCutawayButton) return;
  wallCutawayButton.textContent = isActive ? 'Walls Transparent' : 'Wall Cutaway';
  wallCutawayButton.classList.toggle('is-active', isActive);
  wallCutawayButton.setAttribute('aria-pressed', String(isActive));
  wallCutawayButton.title = isActive ? 'Turn wall transparency off' : 'Turn wall transparency on';
}

function setWallCutawayEnabled(isEnabled) {
  wallCutawayEnabled = Boolean(isEnabled);
  setWallCutawayButtonActive(wallCutawayEnabled);
  const cutawaySides = updateCutawayWalls();
  renderer.render(scene, camera);
  return cutawaySides;
}

function resetMovement() {
  movement.forward = false;
  movement.back = false;
  movement.left = false;
  movement.right = false;
}

function setPovModeActive(isActive) {
  isPovMode = isActive;
  updateCeilingMaterial();
  orbitControls.enabled = !isActive;
  setPovButtonActive(isActive);
  if (!isActive) closeDownlightPanel({ relock: false });
  if (!isActive) resetMovement();
}

function exitPovMode() {
  if (povControls.isLocked) {
    isExitingPov = true;
    povControls.unlock();
    return;
  }
  finishPovExit();
}

if (povButton) {
  povButton.addEventListener('click', () => {
    if (isPovMode) {
      exitPovMode();
      return;
    }
    enterPovMode();
  });
}

if (wallCutawayButton) {
  wallCutawayButton.addEventListener('click', () => {
    setWallCutawayEnabled(!wallCutawayEnabled);
  });
}

povControls.addEventListener('lock', () => {
  pointerLockPendingExitOnFailure = false;
  if (pointerLockFailureTimer) {
    clearTimeout(pointerLockFailureTimer);
    pointerLockFailureTimer = null;
  }
  setPovModeActive(true);
});

povControls.addEventListener('unlock', () => {
  if (isExitingPov) {
    finishPovExit();
    return;
  }
  if (keepPovOnUnlock) {
    keepPovOnUnlock = false;
    setPovModeActive(true);
    return;
  }
  if (isPovMode && !isLightPanelOpen && !pointerLockPendingExitOnFailure) finishPovExit();
});

function kelvinToRgb(kelvin) {
  const temp = kelvin / 100;
  let red;
  let green;
  let blue;

  if (temp <= 66) {
    red = 255;
    green = 99.4708025861 * Math.log(temp) - 161.1195681661;
    blue = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  } else {
    red = 329.698727446 * ((temp - 60) ** -0.1332047592);
    green = 288.1221695283 * ((temp - 60) ** -0.0755148492);
    blue = 255;
  }

  return new THREE.Color(
    THREE.MathUtils.clamp(red, 0, 255) / 255,
    THREE.MathUtils.clamp(green, 0, 255) / 255,
    THREE.MathUtils.clamp(blue, 0, 255) / 255,
  );
}

function getDownlightColor() {
  const temperatureColor = kelvinToRgb(downlightState.temperature);
  const tintColor = new THREE.Color(downlightState.tint);
  return new THREE.Color(
    temperatureColor.r * tintColor.r,
    temperatureColor.g * tintColor.g,
    temperatureColor.b * tintColor.b,
  );
}

function syncLightPanel() {
  if (lightPower) lightPower.checked = downlightState.on;
  if (lightBrightness) lightBrightness.value = String(Math.round(downlightState.brightness * 100));
  if (lightBrightnessValue) lightBrightnessValue.textContent = `${Math.round(downlightState.brightness * 100)}%`;
  if (lightTemperature) lightTemperature.value = String(downlightState.temperature);
  if (lightTemperatureValue) lightTemperatureValue.textContent = `${downlightState.temperature}K`;
  if (lightColor) lightColor.value = downlightState.tint;
}

function updateLightSwitchVisual() {
  if (!lightSwitchRocker) return;
  lightSwitchRocker.position.y = lightSwitchPosition.y + (downlightState.on ? 0.016 : -0.016);
  lightSwitchRocker.rotation.x = downlightState.on ? -0.16 : 0.16;
}

function downlightsAreIlluminating() {
  return downlightState.on && downlightState.brightness > 0;
}

function updateCeilingMaterial() {
  if (!ceilingMesh) return;
  const useSolidPovCeiling = isPovMode;
  ceilingMesh.material = useSolidPovCeiling ? materials.ceilingPovDark : materials.ceilingCutaway;
  ceilingMesh.castShadow = true;
  ceilingMesh.receiveShadow = !useSolidPovCeiling;
  ceilingMesh.userData.currentMaterial = useSolidPovCeiling ? 'ceilingPovDark' : 'ceilingCutaway';
}

function applyEnvironmentLighting() {
  const downlightsOn = downlightsAreIlluminating();
  if (ambientLight) ambientLight.intensity = downlightsOn ? 0.62 : 0;
  if (hemisphereLight) hemisphereLight.intensity = downlightsOn ? 0.78 : 0;
  if (sunLight) sunLight.intensity = downlightsOn ? 2.15 : 0;
  if (fillLight) fillLight.intensity = downlightsOn ? 0.38 : 0;
  if (doorLight) doorLight.intensity = downlightsOn ? 0.42 : 2.45;

  for (const light of screenGlowLights) {
    light.intensity = downlightsOn ? light.userData.dayIntensity : light.userData.darkIntensity;
  }
  for (const light of shelfGlowLights) {
    light.intensity = downlightsOn ? light.userData.dayIntensity : light.userData.darkIntensity;
  }

  materials.ledBlue.emissiveIntensity = downlightsOn ? 2.3 : 3.1;
  renderer.toneMappingExposure = downlightsOn ? 1.42 : 1.08;
  updateCeilingMaterial();
}

function applyDownlightState() {
  const color = getDownlightColor();
  const intensity = downlightState.on ? baseDownlightIntensity * downlightState.brightness : 0;
  const emissiveIntensity = downlightState.on ? baseDownlightEmissiveIntensity * downlightState.brightness : 0;

  for (const light of downlightLights) {
    light.color.copy(color);
    light.intensity = intensity;
  }

  materials.warmLight.color.copy(color);
  materials.warmLight.emissive.copy(color);
  materials.warmLight.emissiveIntensity = emissiveIntensity;
  for (const disk of downlightDisks) {
    disk.material = materials.warmLight;
  }

  updateLightSwitchVisual();
  applyEnvironmentLighting();
  syncLightPanel();
}

function openDownlightPanel() {
  if (!lightPanel) return;
  isLightPanelOpen = true;
  lightPanel.hidden = false;
  resetMovement();
  if (povReticle) povReticle.hidden = true;
}

function closeDownlightPanel({ relock = true } = {}) {
  isLightPanelOpen = false;
  if (lightPanel) lightPanel.hidden = true;
  if (povReticle) povReticle.hidden = !isPovMode;
  if (relock && isPovMode) requestPovPointerLock({ exitOnFailure: false });
}

function toggleDownlightsFromSwitch() {
  downlightState.on = !downlightState.on;
  applyDownlightState();
}

function openDownlightSettingsFromSwitch() {
  openDownlightPanel();
  if (povControls.isLocked) {
    keepPovOnUnlock = true;
    povControls.unlock();
  }
}

if (closeLightPanel) {
  closeLightPanel.addEventListener('click', () => closeDownlightPanel());
}

if (lightPower) {
  lightPower.addEventListener('change', () => {
    downlightState.on = lightPower.checked;
    applyDownlightState();
  });
}

if (lightBrightness) {
  lightBrightness.addEventListener('input', () => {
    downlightState.brightness = Number(lightBrightness.value) / 100;
    applyDownlightState();
  });
}

if (lightTemperature) {
  lightTemperature.addEventListener('input', () => {
    downlightState.temperature = Number(lightTemperature.value);
    applyDownlightState();
  });
}

if (lightColor) {
  lightColor.addEventListener('input', () => {
    downlightState.tint = lightColor.value;
    applyDownlightState();
  });
}

function updateMovementState(event, isPressed) {
  if (!isPovMode) return;
  if (event.code === 'Escape' && isPressed) {
    if (isLightPanelOpen) {
      closeDownlightPanel();
      event.preventDefault();
      return;
    }
    exitPovMode();
    return;
  }
  if (isLightPanelOpen) return;
  switch (event.code) {
    case 'KeyW':
      movement.forward = isPressed;
      break;
    case 'KeyS':
      movement.back = isPressed;
      break;
    case 'KeyA':
      movement.left = isPressed;
      break;
    case 'KeyD':
      movement.right = isPressed;
      break;
    default:
      return;
  }
  event.preventDefault();
}

window.addEventListener('keydown', (event) => updateMovementState(event, true));
window.addEventListener('keyup', (event) => updateMovementState(event, false));

function getLightSwitchHit(event) {
  if (povControls.isLocked) {
    pointerNdc.set(0, 0);
  } else {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNdc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
  }
  raycaster.setFromCamera(pointerNdc, camera);
  return raycaster.intersectObjects(lightSwitchTargets, false)[0] || null;
}

renderer.domElement.addEventListener('click', (event) => {
  if (!isPovMode) return;
  const hit = getLightSwitchHit(event);
  if (hit) {
    event.preventDefault();
    toggleDownlightsFromSwitch();
    return;
  }
  if (!povControls.isLocked && !isLightPanelOpen) {
    event.preventDefault();
    requestPovPointerLock({ exitOnFailure: false });
  }
});

renderer.domElement.addEventListener('contextmenu', (event) => {
  if (!isPovMode) return;
  event.preventDefault();
  const hit = getLightSwitchHit(event);
  if (!hit) return;
  openDownlightSettingsFromSwitch();
});

const materials = {
  wall: new THREE.MeshStandardMaterial({
    color: 0x222222,
    roughness: 0.72,
    metalness: 0.03,
    side: THREE.DoubleSide,
  }),
  wallGroove: new THREE.LineBasicMaterial({ color: 0x070707, transparent: true, opacity: 0.75 }),
  ceilingGroove: new THREE.LineBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.35 }),
  floorGroove: new THREE.LineBasicMaterial({ color: 0x0a0705, transparent: true, opacity: 0.8 }),
  wallCutaway: new THREE.MeshStandardMaterial({
    color: 0x202020,
    roughness: 0.76,
    metalness: 0.02,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  }),
  exteriorWall: new THREE.MeshStandardMaterial({
    color: 0x171819,
    roughness: 0.64,
    metalness: 0.04,
    side: THREE.DoubleSide,
  }),
  exteriorWallCutaway: new THREE.MeshStandardMaterial({
    color: 0x171819,
    roughness: 0.64,
    metalness: 0.04,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  }),
  ceilingCutaway: new THREE.MeshStandardMaterial({
    color: 0x202020,
    roughness: 0.76,
    metalness: 0.02,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  }),
  ceilingPovDark: new THREE.MeshBasicMaterial({
    color: 0x050505,
    side: THREE.DoubleSide,
  }),
  walnut: new THREE.MeshStandardMaterial({ color: 0x3b2519, roughness: 0.5, metalness: 0.08 }),
  walnutDark: new THREE.MeshStandardMaterial({ color: 0x26170f, roughness: 0.55, metalness: 0.05 }),
  black: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.55, metalness: 0.18 }),
  graphite: new THREE.MeshStandardMaterial({ color: 0x101214, roughness: 0.68, metalness: 0.06 }),
  fabric: new THREE.MeshStandardMaterial({ color: 0x303030, roughness: 0.9, metalness: 0.0 }),
  cushion: new THREE.MeshStandardMaterial({ color: 0x4b413b, roughness: 0.88, metalness: 0.0 }),
  cushionAccent: new THREE.MeshStandardMaterial({ color: 0x26334a, roughness: 0.86, metalness: 0.0 }),
  keyCap: new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.7, metalness: 0.03 }),
  accentKey: new THREE.MeshStandardMaterial({ color: 0x263b58, roughness: 0.65, metalness: 0.04 }),
  switchPlate: new THREE.MeshStandardMaterial({ color: 0xd8d2c7, roughness: 0.46, metalness: 0.02 }),
  switchRocker: new THREE.MeshStandardMaterial({ color: 0xf1eadf, roughness: 0.42, metalness: 0.02 }),
  screen: new THREE.MeshStandardMaterial({ color: 0x020202, roughness: 0.18, metalness: 0.25 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0x3c5061,
    transparent: true,
    opacity: 0.58,
    roughness: 0.1,
    metalness: 0.0,
    transmission: 0.08,
    thickness: 0.06,
  }),
  ledBlue: new THREE.MeshStandardMaterial({
    color: 0x1e3cff,
    emissive: 0x2448ff,
    emissiveIntensity: 2.3,
    roughness: 0.35,
  }),
  warmLight: new THREE.MeshStandardMaterial({
    color: 0xfff0cf,
    emissive: 0xffd18a,
    emissiveIntensity: 2.8,
    roughness: 0.2,
  }),
  whiteConsole: new THREE.MeshStandardMaterial({ color: 0xd6d2ca, roughness: 0.4, metalness: 0.08 }),
  plant: new THREE.MeshStandardMaterial({ color: 0x1f5d2d, roughness: 0.8 }),
};

function heightAtZ(z) {
  return hFront + (z - zFront) * slope;
}

function wallTopAtZ(z) {
  return heightAtZ(z) + topFrameThickness;
}

function frontShellCenterZ() {
  return zFront - exteriorWallGap - wallThickness / 2;
}

function addBox(group, name, size, pos, mat, cast = true, receive = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mat);
  mesh.name = name;
  mesh.position.set(pos.x, pos.y, pos.z);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  group.add(mesh);
  return mesh;
}

function addCylinder(group, name, radius, depth, pos, mat, segments = 48, cast = true) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, segments), mat);
  mesh.name = name;
  mesh.position.set(pos.x, pos.y, pos.z);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addSlopedSideWall(group, name, x, outwardSign, mat) {
  const outerX = x + outwardSign * wallThickness;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    x, 0, zFront,
    x, 0, zBack,
    x, wallTopAtZ(zBack), zBack,
    x, wallTopAtZ(zFront), zFront,
    outerX, 0, zFront,
    outerX, 0, zBack,
    outerX, wallTopAtZ(zBack), zBack,
    outerX, wallTopAtZ(zFront), zFront,
  ]), 3));
  geometry.setIndex([
    4, 7, 6, 4, 6, 5,
    0, 4, 7, 0, 7, 3,
    1, 2, 6, 1, 6, 5,
    3, 7, 6, 3, 6, 2,
    0, 1, 5, 0, 5, 4,
  ]);
  geometry.computeVertexNormals();
  const wall = new THREE.Mesh(geometry, mat);
  wall.name = name;
  wall.castShadow = true;
  wall.receiveShadow = true;
  group.add(wall);
  return wall;
}

function addPillow(group, name, pos, scale, mat, rotY = 0) {
  const pillow = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16), mat);
  pillow.name = name;
  pillow.position.set(pos.x, pos.y, pos.z);
  pillow.scale.set(scale.x, scale.y, scale.z);
  pillow.rotation.y = rotY;
  pillow.castShadow = true;
  pillow.receiveShadow = true;
  group.add(pillow);
  return pillow;
}

function plantPotCenterY(surfaceY, scale) {
  return surfaceY + (scale * 1.35) / 2;
}

function seededRandom(index, salt = 0) {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function makePlane(width, height, mat) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

function getSceneObjectBounds() {
  scene.updateMatrixWorld(true);
  const bounds = [];
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  scene.traverse((object) => {
    if (!object.isMesh || !object.name) return;
    box.setFromObject(object);
    if (box.isEmpty()) return;
    box.getSize(size);
    box.getCenter(center);
    bounds.push({
      name: object.name,
      min: box.min.toArray(),
      max: box.max.toArray(),
      center: center.toArray(),
      size: size.toArray(),
    });
  });
  return bounds;
}

function getExteriorGrassState() {
  const bounds = getSceneObjectBounds().filter((item) => item.name.startsWith('exterior-') && item.name.includes('grass'));
  return {
    hasLawn: Boolean(grassGroundMesh),
    hasBlades: Boolean(grassBladeMesh),
    bladeCount: grassBladeMesh?.userData.bladeCount ?? 0,
    bladeExclusion: grassBladeMesh?.userData.exclusion ?? null,
    bounds,
  };
}

function addLineSegments(group, points, material) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.LineSegments(geometry, material);
  group.add(line);
  return line;
}

function canvasTexture(draw) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  draw(ctx, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

const floorTexture = canvasTexture((ctx, w, h) => {
  const boardH = 86;
  const tones = ['#241307', '#301a0b', '#3b2210', '#291609', '#452817'];
  ctx.fillStyle = '#1a0d05';
  ctx.fillRect(0, 0, w, h);

  for (let y = 0; y < h; y += boardH) {
    const tone = tones[(y / boardH) % tones.length];
    const grad = ctx.createLinearGradient(0, y, 0, y + boardH);
    grad.addColorStop(0, '#170c05');
    grad.addColorStop(0.18, tone);
    grad.addColorStop(0.72, tone);
    grad.addColorStop(1, '#120804');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y, w, boardH - 2);

    ctx.strokeStyle = 'rgba(216,145,73,0.22)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const yy = y + 13 + i * 9 + Math.sin((y + i) * 0.19) * 2.5;
      ctx.moveTo(0, yy);
      for (let x = 0; x < w; x += 120) {
        ctx.bezierCurveTo(x + 38, yy - 7, x + 72, yy + 8, x + 120, yy + Math.sin((x + y) * 0.012) * 4);
      }
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(238,171,91,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 80; x < w; x += 240) {
      const knotY = y + boardH * (0.34 + 0.18 * Math.sin((x + y) * 0.02));
      ctx.ellipse(x + Math.sin(y * 0.03) * 24, knotY, 32, 7, Math.sin(x) * 0.2, 0, Math.PI * 2);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0,0,0,0.72)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
});
floorTexture.repeat.set(3.2, 2.2);
const floorMat = new THREE.MeshStandardMaterial({
  map: floorTexture,
  color: 0xffffff,
  roughness: 0.52,
  metalness: 0.03,
});

const rugTexture = canvasTexture((ctx, w, h) => {
  ctx.fillStyle = '#211b18';
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 18000; i += 1) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const warm = 32 + Math.random() * 36;
    ctx.fillStyle = `rgba(${warm + 12}, ${warm + 4}, ${warm}, ${0.12 + Math.random() * 0.22})`;
    ctx.fillRect(x, y, 1 + Math.random() * 2.6, 1 + Math.random() * 2.6);
  }

  ctx.strokeStyle = 'rgba(168,126,92,0.2)';
  ctx.lineWidth = 1.2;
  for (let x = 16; x < w; x += 22) {
    ctx.beginPath();
    ctx.moveTo(x + Math.sin(x * 0.08) * 3, 0);
    ctx.lineTo(x + Math.cos(x * 0.07) * 3, h);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(92,74,64,0.34)';
  for (let y = 18; y < h; y += 18) {
    ctx.beginPath();
    ctx.moveTo(0, y + Math.sin(y * 0.09) * 2);
    ctx.lineTo(w, y + Math.cos(y * 0.08) * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(184,139,99,0.42)';
  ctx.lineWidth = 18;
  ctx.strokeRect(36, 36, w - 72, h - 72);
  ctx.strokeStyle = 'rgba(42,33,29,0.82)';
  ctx.lineWidth = 8;
  ctx.strokeRect(72, 72, w - 144, h - 144);
  ctx.strokeStyle = 'rgba(122,92,76,0.32)';
  ctx.lineWidth = 5;
  for (let i = 0; i < 5; i += 1) {
    const offset = 132 + i * 84;
    ctx.beginPath();
    ctx.moveTo(offset, 112);
    ctx.lineTo(w - offset * 0.62, h - 112);
    ctx.stroke();
  }
});
const rugMat = new THREE.MeshStandardMaterial({
  map: rugTexture,
  color: 0xffffff,
  roughness: 0.98,
  metalness: 0.0,
});

const grassTexture = canvasTexture((ctx, w, h) => {
  const base = ctx.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, '#24582a');
  base.addColorStop(0.38, '#367d34');
  base.addColorStop(0.72, '#2d6a2d');
  base.addColorStop(1, '#1a441f');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 36000; i += 1) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const g = 72 + Math.random() * 92;
    ctx.fillStyle = `rgba(${18 + Math.random() * 34}, ${g}, ${24 + Math.random() * 36}, ${0.08 + Math.random() * 0.26})`;
    ctx.fillRect(x, y, 0.8 + Math.random() * 2.4, 1.5 + Math.random() * 6.5);
  }

  for (let stripe = -w; stripe < w * 2; stripe += 128) {
    const stripeGrad = ctx.createLinearGradient(stripe, 0, stripe + 92, h);
    stripeGrad.addColorStop(0, 'rgba(222,245,164,0)');
    stripeGrad.addColorStop(0.48, 'rgba(222,245,164,0.08)');
    stripeGrad.addColorStop(1, 'rgba(222,245,164,0)');
    ctx.fillStyle = stripeGrad;
    ctx.save();
    ctx.translate(stripe, 0);
    ctx.rotate(-0.18);
    ctx.fillRect(0, -h * 0.4, 64, h * 1.8);
    ctx.restore();
  }

  for (let i = 0; i < 1600; i += 1) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const len = 12 + Math.random() * 34;
    ctx.strokeStyle = Math.random() > 0.42 ? 'rgba(118,178,67,0.32)' : 'rgba(16,65,26,0.28)';
    ctx.lineWidth = 0.8 + Math.random() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.sin(i) * 9, y - len * 0.5, x + Math.cos(i * 0.7) * 12, y - len);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(12,42,17,0.16)';
  for (let i = 0; i < 170; i += 1) {
    ctx.beginPath();
    ctx.ellipse(Math.random() * w, Math.random() * h, 14 + Math.random() * 42, 5 + Math.random() * 15, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
});
grassTexture.repeat.set(2.4, 1.8);
const grassMat = new THREE.MeshStandardMaterial({
  map: grassTexture,
  color: 0xffffff,
  roughness: 0.96,
  metalness: 0.0,
});
const grassBladeMat = new THREE.MeshBasicMaterial({
  color: 0x71c24d,
  side: THREE.DoubleSide,
  toneMapped: false,
  transparent: true,
  opacity: 0.48,
  depthWrite: false,
});

const exteriorTimberTexture = canvasTexture((ctx, w, h) => {
  const tones = ['#8b5a2b', '#a8743c', '#71471f', '#9a6632', '#5f3919'];
  ctx.fillStyle = '#6b421d';
  ctx.fillRect(0, 0, w, h);

  for (let y = 0; y < h; y += 96) {
    const tone = tones[(y / 96) % tones.length];
    const grad = ctx.createLinearGradient(0, y, 0, y + 96);
    grad.addColorStop(0, '#533016');
    grad.addColorStop(0.2, tone);
    grad.addColorStop(0.68, tone);
    grad.addColorStop(1, '#3f2410');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y, w, 92);

    ctx.strokeStyle = 'rgba(255,214,145,0.16)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < 7; i += 1) {
      const yy = y + 12 + i * 11 + Math.sin(i + y * 0.03) * 2;
      ctx.moveTo(0, yy);
      for (let x = 0; x < w; x += 130) {
        ctx.bezierCurveTo(x + 32, yy - 4, x + 78, yy + 6, x + 130, yy + Math.sin((x + y) * 0.01) * 4);
      }
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(19,10,4,0.55)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
});
exteriorTimberTexture.repeat.set(2.3, 1.15);
const exteriorTimberMat = new THREE.MeshStandardMaterial({
  map: exteriorTimberTexture,
  color: 0xffffff,
  roughness: 0.64,
  metalness: 0.03,
});
const exteriorTimberDarkMat = new THREE.MeshStandardMaterial({
  color: 0x4e2f17,
  roughness: 0.7,
  metalness: 0.02,
});
const fencePaleTimberMat = new THREE.MeshStandardMaterial({
  color: 0xb9925d,
  roughness: 0.74,
  metalness: 0.0,
});
const fenceShadowMat = new THREE.MeshStandardMaterial({
  color: 0x6a4725,
  roughness: 0.82,
  metalness: 0.0,
});

const room = new THREE.Group();
const office = new THREE.Group();
const lounge = new THREE.Group();
const exterior = new THREE.Group();
const cutawayWallMeshes = [];
scene.add(exterior, room, office, lounge);

function registerCutawayWall(mesh, side, cutawayMaterial) {
  mesh.userData.cutawaySide = side;
  mesh.userData.solidMaterial = mesh.material;
  mesh.userData.cutawayMaterial = cutawayMaterial;
  mesh.userData.originalCastShadow = mesh.castShadow;
  mesh.userData.originalReceiveShadow = mesh.receiveShadow;
  cutawayWallMeshes.push(mesh);
  return mesh;
}

function closestWallSideOnAxis(value, min, max, lowSide, highSide) {
  return Math.abs(value - min) <= Math.abs(value - max) ? lowSide : highSide;
}

function getOutsideCutawaySides() {
  if (!wallCutawayEnabled) return new Set();
  if (isPovMode) return new Set();
  const clampedZ = THREE.MathUtils.clamp(camera.position.z, zFront, zBack);
  const outsideFootprint = camera.position.x < xMin || camera.position.x > xMax || camera.position.z < zFront || camera.position.z > zBack;
  const aboveRoof = camera.position.y > heightAtZ(clampedZ) + 0.18;
  if (!outsideFootprint && !aboveRoof) return new Set();

  return new Set([
    closestWallSideOnAxis(camera.position.x, xMin, xMax, 'left', 'right'),
    closestWallSideOnAxis(camera.position.z, zFront, zBack, 'front', 'back'),
  ]);
}

function updateCutawayWalls() {
  const cutawaySides = getOutsideCutawaySides();
  for (const mesh of cutawayWallMeshes) {
    const shouldCutAway = cutawaySides.has(mesh.userData.cutawaySide);
    mesh.material = shouldCutAway ? mesh.userData.cutawayMaterial : mesh.userData.solidMaterial;
    mesh.castShadow = shouldCutAway ? false : mesh.userData.originalCastShadow;
    mesh.receiveShadow = shouldCutAway ? false : mesh.userData.originalReceiveShadow;
    mesh.renderOrder = shouldCutAway ? 1 : 0;
  }
  return [...cutawaySides];
}

function addRoomShell() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(L, W), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 0);
  floor.receiveShadow = true;
  room.add(floor);

  const floorLines = [];
  for (let z = zFront + 0.18; z < zBack; z += 0.24) {
    floorLines.push(new THREE.Vector3(xMin, 0.006, z), new THREE.Vector3(xMax, 0.006, z));
  }
  addLineSegments(room, floorLines, materials.floorGroove);

  const frontWallHeight = wallTopAtZ(zFront);
  const backWallHeight = wallTopAtZ(zBack);
  const frontSideWallWidth = (L - doorOpeningWidth) / 2;
  const leftFrontWallCenter = xMin + frontSideWallWidth / 2;
  const rightFrontWallCenter = xMax - frontSideWallWidth / 2;
  const backWall = makePlane(L, backWallHeight, materials.wall);
  backWall.name = 'interior-back-wall';
  backWall.position.set(0, backWallHeight / 2, zBack);
  backWall.rotation.y = Math.PI;
  registerCutawayWall(backWall, 'back', materials.wallCutaway);
  room.add(backWall);

  const frontLeft = makePlane(frontSideWallWidth, frontWallHeight, materials.wall);
  frontLeft.name = 'interior-front-wall-left-of-door';
  frontLeft.position.set(leftFrontWallCenter, frontWallHeight / 2, zFront);
  registerCutawayWall(frontLeft, 'front', materials.wallCutaway);
  room.add(frontLeft);
  const frontRight = makePlane(frontSideWallWidth, frontWallHeight, materials.wall);
  frontRight.name = 'interior-front-wall-right-of-door';
  frontRight.position.set(rightFrontWallCenter, frontWallHeight / 2, zFront);
  registerCutawayWall(frontRight, 'front', materials.wallCutaway);
  room.add(frontRight);
  const frontAboveHeight = frontWallHeight - doorOpeningTop;
  const frontAbove = makePlane(doorOpeningWidth, frontAboveHeight, materials.wall);
  frontAbove.name = 'interior-front-wall-above-door';
  frontAbove.position.set(0, doorOpeningTop + frontAboveHeight / 2, zFront);
  registerCutawayWall(frontAbove, 'front', materials.wallCutaway);
  room.add(frontAbove);

  const endWallMaterial = materials.wall;
  const endVertices = (x) => new Float32Array([
    x, 0, zFront,
    x, 0, zBack,
    x, backWallHeight, zBack,
    x, frontWallHeight, zFront,
  ]);
  for (const x of [xMin, xMax]) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(endVertices(x), 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    const wall = new THREE.Mesh(geometry, endWallMaterial);
    const side = x === xMin ? 'left' : 'right';
    wall.name = side === 'left' ? 'interior-office-end-wall' : 'interior-lounge-end-wall';
    wall.receiveShadow = true;
    registerCutawayWall(wall, side, materials.wallCutaway);
    room.add(wall);
  }

  const ceilingGeometry = new THREE.BufferGeometry();
  ceilingGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    xMin, hFront, zFront,
    xMax, hFront, zFront,
    xMax, hBack, zBack,
    xMin, hBack, zBack,
  ]), 3));
  ceilingGeometry.setIndex([0, 1, 2, 0, 2, 3]);
  ceilingGeometry.computeVertexNormals();
  ceilingMesh = new THREE.Mesh(ceilingGeometry, materials.ceilingCutaway);
  ceilingMesh.name = 'sloped-ceiling';
  ceilingMesh.castShadow = true;
  ceilingMesh.receiveShadow = true;
  ceilingMesh.userData.currentMaterial = 'ceilingCutaway';
  room.add(ceilingMesh);

  const ceilingLines = [];
  for (let z = zFront + 0.18; z < zBack; z += 0.18) {
    const y = heightAtZ(z) - 0.012;
    ceilingLines.push(new THREE.Vector3(xMin, y, z), new THREE.Vector3(xMax, y, z));
  }
  addLineSegments(room, ceilingLines, materials.ceilingGroove);

  const wallLines = [];
  for (let x = xMin + 0.15; x < xMax; x += 0.18) {
    wallLines.push(new THREE.Vector3(x, 0.01, zBack - 0.006), new THREE.Vector3(x, backWallHeight - 0.02, zBack - 0.006));
  }
  for (let x = xMin + 0.15; x < -doorOpeningHalfWidth; x += 0.18) {
    wallLines.push(new THREE.Vector3(x, 0.01, zFront + 0.006), new THREE.Vector3(x, frontWallHeight - 0.02, zFront + 0.006));
  }
  for (let x = doorOpeningHalfWidth; x < xMax; x += 0.18) {
    wallLines.push(new THREE.Vector3(x, 0.01, zFront + 0.006), new THREE.Vector3(x, frontWallHeight - 0.02, zFront + 0.006));
  }
  for (let x = -doorOpeningHalfWidth + 0.15; x <= doorOpeningHalfWidth - 0.15; x += 0.18) {
    wallLines.push(new THREE.Vector3(x, 2.05, zFront + 0.006), new THREE.Vector3(x, frontWallHeight - 0.02, zFront + 0.006));
  }
  for (let z = zFront + 0.15; z < zBack; z += 0.18) {
    wallLines.push(new THREE.Vector3(xMin + 0.006, 0.01, z), new THREE.Vector3(xMin + 0.006, wallTopAtZ(z) - 0.02, z));
    wallLines.push(new THREE.Vector3(xMax - 0.006, 0.01, z), new THREE.Vector3(xMax - 0.006, wallTopAtZ(z) - 0.02, z));
  }
  addLineSegments(room, wallLines, materials.wallGroove);

  addSlidingDoor();
  addLightSwitch();
  addDownlights();
}

function addSlidingDoor() {
  const door = new THREE.Group();
  const doorZ = frontShellCenterZ();
  const innerPanelWidth = doorOpeningWidth - doorFrameWidth * 2;
  const glassHeight = doorOpeningTop - doorRailHeight * 2;
  const glassWidth = (innerPanelWidth - doorFrameWidth) / 2;
  const glassY = doorRailHeight + glassHeight / 2;
  const glassLeftX = -doorFrameWidth / 2 - glassWidth / 2;
  const glassRightX = doorFrameWidth / 2 + glassWidth / 2;

  const glassLeft = addBox(door, 'smoky-door-left', { x: glassWidth, y: glassHeight, z: 0.032 }, { x: glassLeftX, y: glassY, z: doorZ + 0.012 }, materials.glass, false, false);
  const glassRight = addBox(door, 'smoky-door-right', { x: glassWidth, y: glassHeight, z: 0.032 }, { x: glassRightX, y: glassY, z: doorZ + 0.004 }, materials.glass, false, false);
  glassLeft.renderOrder = 2;
  glassRight.renderOrder = 2;
  const railMat = materials.black;
  addBox(door, 'sliding-door-recessed-threshold', { x: doorOpeningWidth, y: 0.045, z: wallThickness + 0.06 }, { x: 0, y: 0.022, z: doorZ + 0.02 }, railMat);
  addBox(door, 'door-top-rail', { x: doorOpeningWidth, y: doorRailHeight, z: doorFrameDepth }, { x: 0, y: doorOpeningTop - doorRailHeight / 2, z: doorZ }, railMat);
  addBox(door, 'door-bottom-rail', { x: doorOpeningWidth, y: doorRailHeight, z: doorFrameDepth }, { x: 0, y: doorRailHeight / 2, z: doorZ }, railMat);
  addBox(door, 'door-left-frame', { x: doorFrameWidth, y: doorOpeningTop, z: doorFrameDepth }, { x: -doorOpeningHalfWidth + doorFrameWidth / 2, y: doorOpeningTop / 2, z: doorZ }, railMat);
  addBox(door, 'door-right-frame', { x: doorFrameWidth, y: doorOpeningTop, z: doorFrameDepth }, { x: doorOpeningHalfWidth - doorFrameWidth / 2, y: doorOpeningTop / 2, z: doorZ }, railMat);
  addBox(door, 'door-centre-frame', { x: doorFrameWidth, y: glassHeight, z: doorFrameDepth * 0.88 }, { x: 0, y: glassY, z: doorZ - 0.006 }, railMat);
  addBox(door, 'roller-blind-box', { x: 2.05, y: 0.09, z: 0.12 }, { x: 0, y: 2.22, z: zFront + 0.035 }, railMat);
  room.add(door);
}

function addLightSwitch() {
  const switchGroup = new THREE.Group();
  switchGroup.name = 'downlight-control-switch';
  const plate = addBox(
    switchGroup,
    'light-switch-wall-plate',
    { x: 0.16, y: 0.25, z: 0.018 },
    { x: lightSwitchPosition.x, y: lightSwitchPosition.y, z: lightSwitchPosition.z },
    materials.switchPlate,
    true,
    false,
  );
  lightSwitchRocker = addBox(
    switchGroup,
    'light-switch-rocker',
    { x: 0.07, y: 0.13, z: 0.024 },
    { x: lightSwitchPosition.x, y: lightSwitchPosition.y, z: lightSwitchPosition.z + 0.014 },
    materials.switchRocker,
    true,
    false,
  );
  lightSwitchTargets.push(plate, lightSwitchRocker);
  room.add(switchGroup);
  updateLightSwitchVisual();
}

function addDownlights() {
  const xs = [-2.25, -0.75, 0.75, 2.25];
  const zs = [-0.75, 0.75];
  const normal = new THREE.Vector3(0, 1, -slope).normalize();
  const baseNormal = new THREE.Vector3(0, 1, 0);
  for (const x of xs) {
    for (const z of zs) {
      const y = heightAtZ(z) - 0.018;
      const disk = addCylinder(room, 'philips-hue-recessed-downlight', 0.078, 0.018, { x, y, z }, materials.warmLight, 56, false);
      disk.quaternion.setFromUnitVectors(baseNormal, normal);
      downlightDisks.push(disk);
      const trim = addCylinder(room, 'black-downlight-trim', 0.096, 0.012, { x, y: y + 0.002, z }, materials.black, 56, false);
      trim.quaternion.setFromUnitVectors(baseNormal, normal);
      const light = new THREE.PointLight(0xffd9a1, baseDownlightIntensity, 5.2, 1.65);
      light.position.set(x, y - 0.28, z);
      light.castShadow = true;
      light.shadow.mapSize.set(768, 768);
      room.add(light);
      downlightLights.push(light);
    }
  }
}

function getExteriorStepExclusion() {
  return {
    minX: -exteriorStepWidth / 2 - 0.16,
    maxX: exteriorStepWidth / 2 + 0.16,
    minZ: exteriorStepFrontZ - 0.14,
    maxZ: exteriorStepBackZ + 0.12,
  };
}

function isInsideGrassBlockedArea(x, z) {
  const podExclusion = {
    minX: xMin - wallThickness - 0.18,
    maxX: xMax + wallThickness + 0.18,
    minZ: zFront - wallThickness - 0.18,
    maxZ: zBack + wallThickness + 0.18,
  };
  const stepExclusion = getExteriorStepExclusion();
  const insidePodPad = x > podExclusion.minX && x < podExclusion.maxX && z > podExclusion.minZ && z < podExclusion.maxZ;
  const insideStepPad = x > stepExclusion.minX && x < stepExclusion.maxX && z > stepExclusion.minZ && z < stepExclusion.maxZ;
  return insidePodPad || insideStepPad;
}

function addExteriorGrass() {
  grassGroundMesh = new THREE.Mesh(new THREE.PlaneGeometry(exteriorGrassWidth, exteriorGrassDepth), grassMat);
  grassGroundMesh.name = 'exterior-procedural-grass-lawn';
  grassGroundMesh.rotation.x = -Math.PI / 2;
  grassGroundMesh.position.set(0, exteriorGroundY, 0);
  grassGroundMesh.receiveShadow = true;
  grassGroundMesh.castShadow = false;
  grassGroundMesh.userData.bounds = {
    min: [-exteriorGrassWidth / 2, exteriorGroundY, -exteriorGrassDepth / 2],
    max: [exteriorGrassWidth / 2, exteriorGroundY, exteriorGrassDepth / 2],
  };
  exterior.add(grassGroundMesh);

  const bladeCount = 3200;
  const bladeGeometry = new THREE.PlaneGeometry(1, 1, 1, 2);
  bladeGeometry.translate(0, 0.5, 0);
  grassBladeMesh = new THREE.InstancedMesh(bladeGeometry, grassBladeMat, bladeCount);
  grassBladeMesh.name = 'exterior-varied-grass-blades';
  grassBladeMesh.castShadow = false;
  grassBladeMesh.receiveShadow = false;
  grassBladeMesh.userData.bladeCount = bladeCount;
  grassBladeMesh.userData.exclusion = {
    minX: xMin - wallThickness - 0.18,
    maxX: xMax + wallThickness + 0.18,
    minZ: zFront - wallThickness - 0.18,
    maxZ: zBack + wallThickness + 0.18,
  };
  grassBladeMesh.userData.stepExclusion = getExteriorStepExclusion();

  const dummy = new THREE.Object3D();
  let placed = 0;
  for (let i = 0; placed < bladeCount && i < bladeCount * 8; i += 1) {
    const x = (seededRandom(i, 1) - 0.5) * (exteriorGrassWidth - 0.35);
    const z = (seededRandom(i, 2) - 0.5) * (exteriorGrassDepth - 0.35);
    if (isInsideGrassBlockedArea(x, z)) continue;

    const height = 0.028 + seededRandom(i, 3) * 0.062;
    const width = 0.007 + seededRandom(i, 4) * 0.015;
    dummy.position.set(x, exteriorGroundY + 0.004, z);
    dummy.rotation.set(0, seededRandom(i, 5) * Math.PI * 2, (seededRandom(i, 6) - 0.5) * 0.46);
    dummy.scale.set(width, height, 1);
    dummy.updateMatrix();
    grassBladeMesh.setMatrixAt(placed, dummy.matrix);

    placed += 1;
  }
  grassBladeMesh.instanceMatrix.needsUpdate = true;
  grassBladeMesh.computeBoundingBox();
  grassBladeMesh.computeBoundingSphere();
  exterior.add(grassBladeMesh);
}

function addWoodenStep() {
  woodenStepGroup = new THREE.Group();
  woodenStepGroup.name = 'exterior-door-timber-step';
  const stepCenterZ = exteriorStepBackZ - exteriorStepDepth / 2;
  const stepTopY = exteriorGroundY + 0.084;
  const plankHeight = 0.042;
  const plankGap = 0.026;
  const plankCount = 4;
  const plankDepth = (exteriorStepDepth - plankGap * (plankCount + 1)) / plankCount;

  addBox(
    woodenStepGroup,
    'exterior-step-dark-underframe',
    { x: exteriorStepWidth + 0.08, y: 0.055, z: exteriorStepDepth - 0.06 },
    { x: 0, y: exteriorGroundY + 0.028, z: stepCenterZ },
    exteriorTimberDarkMat,
    true,
    true,
  );

  for (let i = 0; i < plankCount; i += 1) {
    const z = exteriorStepBackZ - plankGap - plankDepth / 2 - i * (plankDepth + plankGap);
    const plank = addBox(
      woodenStepGroup,
      'exterior-step-oiled-hardwood-plank',
      { x: exteriorStepWidth, y: plankHeight, z: plankDepth },
      { x: 0, y: stepTopY - plankHeight / 2, z },
      exteriorTimberMat,
      true,
      true,
    );
    plank.userData.plankIndex = i;
  }

  addBox(
    woodenStepGroup,
    'exterior-step-front-fascia',
    { x: exteriorStepWidth + 0.1, y: 0.12, z: 0.055 },
    { x: 0, y: exteriorGroundY + 0.041, z: exteriorStepFrontZ + 0.03 },
    exteriorTimberDarkMat,
    true,
    true,
  );
  addBox(
    woodenStepGroup,
    'exterior-step-left-side-cheek',
    { x: 0.055, y: 0.11, z: exteriorStepDepth - 0.08 },
    { x: -exteriorStepWidth / 2 - 0.028, y: exteriorGroundY + 0.039, z: stepCenterZ },
    exteriorTimberDarkMat,
    true,
    true,
  );
  addBox(
    woodenStepGroup,
    'exterior-step-right-side-cheek',
    { x: 0.055, y: 0.11, z: exteriorStepDepth - 0.08 },
    { x: exteriorStepWidth / 2 + 0.028, y: exteriorGroundY + 0.039, z: stepCenterZ },
    exteriorTimberDarkMat,
    true,
    true,
  );

  for (const x of [-exteriorStepWidth * 0.32, exteriorStepWidth * 0.32]) {
    addBox(
      woodenStepGroup,
      'exterior-step-hidden-support-runner',
      { x: 0.08, y: 0.064, z: exteriorStepDepth - 0.12 },
      { x, y: exteriorGroundY + 0.005, z: stepCenterZ },
      materials.black,
      true,
      true,
    );
  }

  exterior.add(woodenStepGroup);
}

function addFencePost(group, name, x, z) {
  const postHeight = 1.22;
  const post = addBox(
    group,
    `${name}-post`,
    { x: 0.12, y: postHeight, z: 0.12 },
    { x, y: exteriorGroundY + postHeight / 2, z },
    fenceShadowMat,
    true,
    true,
  );
  addBox(
    group,
    `${name}-post-cap`,
    { x: 0.18, y: 0.06, z: 0.18 },
    { x, y: exteriorGroundY + postHeight + 0.03, z },
    fencePaleTimberMat,
    true,
    true,
  );
  return post;
}

function addFenceRun(group, name, axis, fixed, from, to) {
  const span = Math.abs(to - from);
  const center = (from + to) / 2;
  const railY = [0.41, 0.83];
  const railThickness = 0.065;
  const picketSpacing = 0.24;
  const picketCount = Math.max(2, Math.floor(span / picketSpacing));

  addFencePost(group, `${name}-start`, axis === 'x' ? from : fixed, axis === 'x' ? fixed : from);
  addFencePost(group, `${name}-end`, axis === 'x' ? to : fixed, axis === 'x' ? fixed : to);

  for (let p = from + 1.35; p < to - 0.4; p += 1.35) {
    addFencePost(group, `${name}-mid-${Math.round((p - from) * 100)}`, axis === 'x' ? p : fixed, axis === 'x' ? fixed : p);
  }

  for (const y of railY) {
    addBox(
      group,
      `${name}-horizontal-rail`,
      axis === 'x' ? { x: span, y: railThickness, z: 0.07 } : { x: 0.07, y: railThickness, z: span },
      axis === 'x'
        ? { x: center, y: exteriorGroundY + y, z: fixed }
        : { x: fixed, y: exteriorGroundY + y, z: center },
      fenceShadowMat,
      true,
      true,
    );
  }

  for (let i = 0; i <= picketCount; i += 1) {
    const t = i / picketCount;
    const p = THREE.MathUtils.lerp(from + 0.18, to - 0.18, t);
    const height = 0.86 + seededRandom(i, name.length) * 0.12;
    const topTilt = (seededRandom(i, name.length + 2) - 0.5) * 0.025;
    const picket = addBox(
      group,
      `${name}-vertical-slat`,
      axis === 'x' ? { x: 0.07, y: height, z: 0.04 } : { x: 0.04, y: height, z: 0.07 },
      axis === 'x'
        ? { x: p, y: exteriorGroundY + height / 2 + 0.08, z: fixed + topTilt }
        : { x: fixed + topTilt, y: exteriorGroundY + height / 2 + 0.08, z: p },
      fencePaleTimberMat,
      true,
      true,
    );
    picket.userData.fenceRun = name;
  }
}

function addBackyardFence() {
  backyardFenceGroup = new THREE.Group();
  backyardFenceGroup.name = 'exterior-backyard-timber-fence';
  const gateHalfWidth = 1.42;

  addFenceRun(backyardFenceGroup, 'back-fence', 'x', fenceBounds.maxZ, fenceBounds.minX, fenceBounds.maxX);
  addFenceRun(backyardFenceGroup, 'left-fence', 'z', fenceBounds.minX, fenceBounds.minZ, fenceBounds.maxZ);
  addFenceRun(backyardFenceGroup, 'right-fence', 'z', fenceBounds.maxX, fenceBounds.minZ, fenceBounds.maxZ);
  addFenceRun(backyardFenceGroup, 'front-left-fence', 'x', fenceBounds.minZ, fenceBounds.minX, -gateHalfWidth);
  addFenceRun(backyardFenceGroup, 'front-right-fence', 'x', fenceBounds.minZ, gateHalfWidth, fenceBounds.maxX);

  for (const x of [-gateHalfWidth, gateHalfWidth]) {
    addFencePost(backyardFenceGroup, x < 0 ? 'front-gate-left' : 'front-gate-right', x, fenceBounds.minZ);
  }

  exterior.add(backyardFenceGroup);
}

function addExterior() {
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x070809, roughness: 0.55, metalness: 0.25 });
  const frontShellZ = frontShellCenterZ();
  const backShellZ = zBack + exteriorWallGap + wallThickness / 2;
  const frontWallHeight = wallTopAtZ(zFront);
  const backWallHeight = wallTopAtZ(zBack);
  const frontSideWallWidth = (L - doorOpeningWidth) / 2;
  const leftFrontWallCenter = xMin + frontSideWallWidth / 2;
  const rightFrontWallCenter = xMax - frontSideWallWidth / 2;
  const leftReturnCenter = -doorOpeningHalfWidth - doorReturnWidth / 2;
  const rightReturnCenter = doorOpeningHalfWidth + doorReturnWidth / 2;
  const headReturnWidth = doorOpeningWidth + doorReturnWidth * 2;
  const shellLength = L + wallThickness * 2 + topFrameThickness;
  const shellDepth = wallThickness + 0.055;
  const sideCapY = (hFront + hBack) / 2 + topFrameThickness / 2;
  const sideCapAngle = -Math.atan(slope);

  registerCutawayWall(addBox(exterior, 'front-exterior-wall-thickness-left', { x: frontSideWallWidth, y: frontWallHeight, z: wallThickness }, { x: leftFrontWallCenter, y: frontWallHeight / 2, z: frontShellZ }, materials.exteriorWall, false), 'front', materials.exteriorWallCutaway);
  registerCutawayWall(addBox(exterior, 'front-exterior-wall-thickness-right', { x: frontSideWallWidth, y: frontWallHeight, z: wallThickness }, { x: rightFrontWallCenter, y: frontWallHeight / 2, z: frontShellZ }, materials.exteriorWall, false), 'front', materials.exteriorWallCutaway);
  registerCutawayWall(addBox(exterior, 'front-exterior-wall-thickness-above-door', { x: doorOpeningWidth, y: frontWallHeight - doorOpeningTop, z: wallThickness }, { x: 0, y: doorOpeningTop + (frontWallHeight - doorOpeningTop) / 2, z: frontShellZ }, materials.exteriorWall, false), 'front', materials.exteriorWallCutaway);
  registerCutawayWall(addBox(exterior, 'sliding-door-left-wall-return', { x: doorReturnWidth, y: doorOpeningTop, z: wallThickness }, { x: leftReturnCenter, y: doorOpeningTop / 2, z: frontShellZ }, materials.exteriorWall, false), 'front', materials.exteriorWallCutaway);
  registerCutawayWall(addBox(exterior, 'sliding-door-right-wall-return', { x: doorReturnWidth, y: doorOpeningTop, z: wallThickness }, { x: rightReturnCenter, y: doorOpeningTop / 2, z: frontShellZ }, materials.exteriorWall, false), 'front', materials.exteriorWallCutaway);
  registerCutawayWall(addBox(exterior, 'sliding-door-head-wall-return', { x: headReturnWidth, y: doorReturnWidth, z: wallThickness }, { x: 0, y: doorOpeningTop + doorReturnWidth / 2, z: frontShellZ }, materials.exteriorWall, false), 'front', materials.exteriorWallCutaway);
  registerCutawayWall(addBox(exterior, 'back-exterior-wall-thickness', { x: shellLength, y: backWallHeight, z: wallThickness }, { x: 0, y: backWallHeight / 2, z: backShellZ }, materials.exteriorWall, false), 'back', materials.exteriorWallCutaway);

  registerCutawayWall(addSlopedSideWall(exterior, 'office-end-exterior-wall-thickness', xMin, -1, materials.exteriorWall), 'left', materials.exteriorWallCutaway);
  registerCutawayWall(addSlopedSideWall(exterior, 'lounge-end-exterior-wall-thickness', xMax, 1, materials.exteriorWall), 'right', materials.exteriorWallCutaway);

  addBox(exterior, 'outer-front-wall-cap', { x: shellLength, y: topFrameThickness, z: shellDepth }, { x: 0, y: hFront + topFrameThickness / 2, z: frontShellZ }, edgeMat, false);
  addBox(exterior, 'outer-back-wall-cap', { x: shellLength, y: topFrameThickness, z: shellDepth }, { x: 0, y: hBack + topFrameThickness / 2, z: backShellZ }, edgeMat, false);
  const officeCap = addBox(exterior, 'outer-office-end-cap', { x: wallThickness + 0.04, y: 0.08, z: W + wallThickness * 2 }, { x: xMin - wallThickness / 2, y: sideCapY, z: 0 }, edgeMat, false);
  officeCap.rotation.x = sideCapAngle;
  const loungeCap = addBox(exterior, 'outer-lounge-end-cap', { x: wallThickness + 0.04, y: 0.08, z: W + wallThickness * 2 }, { x: xMax + wallThickness / 2, y: sideCapY, z: 0 }, edgeMat, false);
  loungeCap.rotation.x = sideCapAngle;
}

function makeScreenTexture(kind) {
  return canvasTexture((ctx, w, h) => {
    ctx.fillStyle = '#050609';
    ctx.fillRect(0, 0, w, h);
    if (kind === 'tv') {
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#14204d');
      sky.addColorStop(0.42, '#27315f');
      sky.addColorStop(0.44, '#0c101a');
      sky.addColorStop(1, '#040507');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = '#07080e';
      ctx.beginPath();
      ctx.moveTo(0, h * 0.48);
      for (let x = 0; x <= w; x += 80) {
        ctx.lineTo(x, h * (0.38 + 0.12 * Math.sin(x * 0.018)));
      }
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(74,210,255,0.7)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 16; i += 1) {
        const y = h * (0.58 + i * 0.022);
        ctx.beginPath();
        ctx.moveTo(w * 0.18, y);
        ctx.lineTo(w * 0.82, y - i * 4);
        ctx.stroke();
      }

      ctx.fillStyle = '#55d7ff';
      ctx.fillRect(w * 0.09, h * 0.08, w * 0.16, h * 0.035);
      ctx.fillStyle = '#d77cff';
      ctx.fillRect(w * 0.74, h * 0.08, w * 0.17, h * 0.035);
      ctx.strokeStyle = 'rgba(255,255,255,0.38)';
      ctx.lineWidth = 2;
      ctx.strokeRect(w * 0.04, h * 0.04, w * 0.92, h * 0.88);
    } else {
      ctx.fillStyle = '#081018';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 34; i += 1) {
        ctx.fillStyle = i % 3 === 0 ? '#3bd6ff' : i % 3 === 1 ? '#8c59ff' : '#4eaa7f';
        const y = 40 + i * 24;
        ctx.fillRect(36 + Math.random() * 75, y, 90 + Math.random() * 350, 7);
      }
    }
  });
}

function addMonitor(group, name, pos, width, height, rotY = 0, textureKind = 'code') {
  const frame = addBox(group, `${name}-frame`, { x: 0.035, y: height + 0.06, z: width + 0.06 }, pos, materials.black);
  frame.rotation.y = rotY;
  const texture = makeScreenTexture(textureKind);
  if (textureKind === 'tv') {
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
    );
    screen.name = `${name}-screen`;
    screen.position.set(pos.x, pos.y, pos.z + 0.062);
    screen.castShadow = false;
    screen.receiveShadow = false;
    screen.renderOrder = 3;
    group.add(screen);
    return screen;
  }
  const screenMat = new THREE.MeshStandardMaterial({
    map: texture,
    emissive: 0x081024,
    emissiveIntensity: 0.75,
    roughness: 0.22,
    metalness: 0.08,
  });
  const screen = addBox(group, `${name}-screen`, { x: 0.02, y: height, z: width }, { x: pos.x + 0.022, y: pos.y, z: pos.z }, screenMat);
  screen.rotation.y = rotY;
  return screen;
}

function addMonitorStand(group, name, pos, width, height, rotY = 0) {
  const deskTopY = 0.795;
  const frameBottomY = pos.y - (height + 0.06) / 2;
  const postHeight = Math.max(0.16, frameBottomY - deskTopY + 0.03);
  const standX = pos.x + 0.16;
  const standZ = pos.z;

  const base = addBox(
    group,
    `${name}-desk-stand-base`,
    { x: 0.28, y: 0.028, z: Math.min(width * 0.62, 0.36) },
    { x: standX + 0.02, y: deskTopY + 0.014, z: standZ },
    materials.black,
  );
  base.rotation.y = rotY;

  const post = addBox(
    group,
    `${name}-monitor-stand-post`,
    { x: 0.045, y: postHeight, z: 0.065 },
    { x: standX, y: deskTopY + postHeight / 2, z: standZ },
    materials.black,
  );
  post.rotation.y = rotY;

  const bracket = addBox(
    group,
    `${name}-rear-monitor-bracket`,
    { x: 0.16, y: 0.052, z: Math.min(width * 0.44, 0.26) },
    { x: pos.x + 0.075, y: frameBottomY + 0.045, z: standZ },
    materials.black,
  );
  bracket.rotation.y = rotY;
}

function addOffice() {
  addBox(office, 'office-sit-stand-desk-walnut-top', { x: 0.72, y: 0.07, z: 2.0 }, { x: -2.58, y: 0.76, z: 0 }, materials.walnut);
  addBox(office, 'left-dark-storage-drawer', { x: 0.48, y: 0.62, z: 0.36 }, { x: -2.45, y: 0.34, z: -0.78 }, materials.graphite);
  addBox(office, 'right-dark-storage-drawer', { x: 0.48, y: 0.62, z: 0.36 }, { x: -2.45, y: 0.34, z: 0.78 }, materials.graphite);
  addBox(office, 'desk-left-leg', { x: 0.06, y: 0.725, z: 0.06 }, { x: -2.18, y: 0.3625, z: -0.72 }, materials.black);
  addBox(office, 'desk-right-leg', { x: 0.06, y: 0.725, z: 0.06 }, { x: -2.18, y: 0.3625, z: 0.72 }, materials.black);

  addMonitor(office, 'central-studio-display-style-monitor', { x: -2.86, y: 1.22, z: 0 }, 0.54, 0.32, 0, 'code');
  addMonitorStand(office, 'central-studio-display-style-monitor', { x: -2.86, y: 1.22, z: 0 }, 0.54, 0.32, 0);
  addMonitor(office, 'left-side-monitor', { x: -2.84, y: 1.18, z: -0.57 }, 0.46, 0.28, -0.18, 'code');
  addMonitorStand(office, 'left-side-monitor', { x: -2.84, y: 1.18, z: -0.57 }, 0.46, 0.28, -0.18);
  addMonitor(office, 'right-side-monitor', { x: -2.84, y: 1.18, z: 0.57 }, 0.46, 0.28, 0.18, 'code');
  addMonitorStand(office, 'right-side-monitor', { x: -2.84, y: 1.18, z: 0.57 }, 0.46, 0.28, 0.18);
  addBox(office, 'monitor-arm-bar', { x: 0.06, y: 0.05, z: 1.34 }, { x: -2.7, y: 1.02, z: 0 }, materials.black);

  for (const side of [-1, 1]) {
    const zCenter = side * 0.23;
    addBox(office, side < 0 ? 'split-mechanical-keyboard-left-base' : 'split-mechanical-keyboard-right-base', { x: 0.18, y: 0.026, z: 0.42 }, { x: -2.26, y: 0.808, z: zCenter }, materials.black);
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        addBox(
          office,
          'low-profile-keycap',
          { x: 0.032, y: 0.012, z: 0.045 },
          { x: -2.205 - row * 0.042, y: 0.827, z: zCenter - side * 0.145 + side * col * 0.062 },
          row === 0 && col === 4 ? materials.accentKey : materials.keyCap,
          true,
          false,
        );
      }
    }
  }
  const mouse = addPillow(office, 'ergonomic-black-mouse-right-side-of-desk', { x: -2.32, y: 0.815, z: 0.88 }, { x: 0.052, y: 0.018, z: 0.078 }, materials.black);
  mouse.rotation.y = -0.15;

  for (const y of [1.61, 1.91]) {
    addBox(office, 'floating-dark-walnut-office-shelf', { x: 0.24, y: 0.05, z: 2.35 }, { x: -2.87, y, z: 0 }, materials.walnut);
    addBox(office, 'matching-cyan-undershelf-led-strip', { x: 0.024, y: 0.018, z: 2.22 }, { x: -2.76, y: y - 0.055, z: 0 }, materials.ledBlue, false);
    const shelfGlow = new THREE.PointLight(0x385cff, 0.28, 2.2, 1.8);
    shelfGlow.name = 'cyan-undershelf-glow-light';
    shelfGlow.position.set(-2.7, y - 0.08, 0);
    shelfGlow.userData.dayIntensity = 0.28;
    shelfGlow.userData.darkIntensity = 0.82;
    office.add(shelfGlow);
    shelfGlowLights.push(shelfGlow);
  }
  addPottedPlant(office, { x: -2.86, y: plantPotCenterY(1.61 + 0.05 / 2, 0.075), z: -1.02 }, 0.075);
  addPottedPlant(office, { x: -2.75, y: plantPotCenterY(0.76 + 0.07 / 2, 0.09), z: 1.03 }, 0.09);

  addOfficeChair();
}

function addOfficeChair() {
  addBox(office, 'ergonomic-chair-seat', { x: 0.46, y: 0.11, z: 0.52 }, { x: -1.72, y: 0.52, z: 0 }, materials.fabric);
  const back = addBox(office, 'ergonomic-chair-mesh-back', { x: 0.12, y: 0.78, z: 0.5 }, { x: -1.56, y: 0.9, z: 0 }, materials.fabric);
  back.rotation.z = -0.08;
  addCylinder(office, 'chair-gas-lift', 0.045, 0.42, { x: -1.72, y: 0.28, z: 0 }, materials.black, 16);
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2;
    const arm = addBox(office, 'chair-star-base-arm', { x: 0.62, y: 0.045, z: 0.07 }, { x: -1.72, y: 0.09, z: 0 }, materials.black);
    arm.rotation.y = angle;
    const wheel = addCylinder(office, 'chair-wide-caster-wheel', 0.052, 0.065, { x: -1.72 + Math.cos(angle) * 0.34, y: 0.052, z: Math.sin(angle) * 0.34 }, materials.graphite, 18);
    wheel.rotation.x = Math.PI / 2;
  }
  addBox(office, 'chair-left-armrest', { x: 0.24, y: 0.055, z: 0.06 }, { x: -1.72, y: 0.72, z: -0.34 }, materials.black);
  addBox(office, 'chair-right-armrest', { x: 0.24, y: 0.055, z: 0.06 }, { x: -1.72, y: 0.72, z: 0.34 }, materials.black);
}

function addPottedPlant(group, pos, scale = 0.12) {
  addCylinder(group, 'matte-black-plant-pot', scale, scale * 1.35, pos, materials.black, 28);
  for (let i = 0; i < 9; i += 1) {
    const leaf = addCylinder(group, 'small-green-plant-leaf', scale * 0.16, scale * (2.2 + Math.random()), { x: pos.x, y: pos.y + scale * 1.15, z: pos.z }, materials.plant, 8);
    leaf.rotation.x = Math.random() * 1.1;
    leaf.rotation.z = Math.random() * Math.PI;
  }
}

function addLounge() {
  addMonitor(lounge, 'large-wall-mounted-oled-gaming-tv', { x: 2.05, y: 1.36, z: zFront + 0.055 }, 1.56, 0.86, Math.PI / 2, 'tv');
  addBox(lounge, 'dark-walnut-media-unit-top', { x: 1.9, y: 0.08, z: 0.38 }, { x: 2.05, y: 0.46, z: zFront + 0.25 }, materials.walnut);
  addBox(lounge, 'matte-black-media-unit-body', { x: 1.9, y: 0.36, z: 0.35 }, { x: 2.05, y: 0.24, z: zFront + 0.24 }, materials.graphite);
  addBox(lounge, 'soundbar', { x: 0.9, y: 0.045, z: 0.07 }, { x: 2.05, y: 0.5225, z: zFront + 0.05 }, materials.black);
  addBox(lounge, 'ps5-style-console-white-side', { x: 0.16, y: 0.58, z: 0.12 }, { x: 2.8, y: 0.79, z: zFront + 0.23 }, materials.whiteConsole);
  addBox(lounge, 'ps5-style-console-black-core', { x: 0.04, y: 0.52, z: 0.13 }, { x: 2.8, y: 0.76, z: zFront + 0.23 }, materials.black);
  addBox(lounge, 'game-controller', { x: 0.18, y: 0.035, z: 0.11 }, { x: 2.52, y: 0.5175, z: zFront + 0.09 }, materials.black);

  addBox(lounge, 'charcoal-fold-out-couch-seat', { x: 1.78, y: 0.28, z: 0.72 }, { x: 2.05, y: 0.33, z: 1.04 }, materials.fabric);
  addBox(lounge, 'charcoal-fold-out-couch-front-panel', { x: 1.7, y: 0.13, z: 0.22 }, { x: 2.05, y: 0.2, z: 0.6 }, materials.fabric);
  addBox(lounge, 'charcoal-couch-back', { x: 1.86, y: 0.74, z: 0.18 }, { x: 2.05, y: 0.72, z: 1.46 }, materials.fabric);
  addBox(lounge, 'charcoal-couch-left-arm', { x: 0.18, y: 0.55, z: 0.78 }, { x: 1.05, y: 0.54, z: 1.04 }, materials.fabric);
  addBox(lounge, 'charcoal-couch-right-arm', { x: 0.18, y: 0.55, z: 0.78 }, { x: 2.88, y: 0.54, z: 1.04 }, materials.fabric);
  for (const x of [1.55, 2.05, 2.55]) {
    addBox(lounge, 'separate-couch-cushion', { x: 0.47, y: 0.035, z: 0.68 }, { x, y: 0.49, z: 1.02 }, materials.fabric);
  }
  addPillow(lounge, 'soft-couch-back-cushion-left', { x: 1.55, y: 0.82, z: 1.33 }, { x: 0.18, y: 0.26, z: 0.08 }, materials.cushion, 0.04);
  addPillow(lounge, 'soft-couch-back-cushion-centre', { x: 2.05, y: 0.82, z: 1.34 }, { x: 0.2, y: 0.27, z: 0.08 }, materials.cushionAccent, 0);
  addPillow(lounge, 'soft-couch-back-cushion-right', { x: 2.52, y: 0.82, z: 1.33 }, { x: 0.18, y: 0.26, z: 0.08 }, materials.cushion, -0.04);
  const throwLeft = addBox(lounge, 'rectangular-throw-cushion-left', { x: 0.32, y: 0.09, z: 0.24 }, { x: 1.62, y: 0.58, z: 0.92 }, materials.cushion);
  throwLeft.rotation.y = 0.12;
  const throwRight = addBox(lounge, 'rectangular-throw-cushion-right', { x: 0.32, y: 0.09, z: 0.24 }, { x: 2.46, y: 0.58, z: 0.92 }, materials.cushionAccent);
  throwRight.rotation.y = -0.12;
  addBox(lounge, 'large-woven-area-rug', { x: 1.82, y: 0.022, z: 1.74 }, { x: 2.0, y: 0.019, z: -0.39 }, rugMat, false);

  addBox(lounge, 'caster-coffee-table-walnut-top', { x: 1.02, y: 0.06, z: 0.58 }, { x: 2.05, y: 0.39, z: 0.2 }, materials.walnut);
  addBox(lounge, 'coffee-table-lower-mesh-shelf', { x: 0.92, y: 0.035, z: 0.5 }, { x: 2.05, y: 0.18, z: 0.2 }, materials.black);
  for (const dx of [-0.43, 0.43]) {
    for (const dz of [-0.24, 0.24]) {
      addBox(lounge, 'coffee-table-slim-support-leg', { x: 0.045, y: 0.165, z: 0.045 }, { x: 2.05 + dx, y: 0.2775, z: 0.2 + dz }, materials.black);
    }
  }
  for (const dx of [-0.44, 0.44]) {
    for (const dz of [-0.23, 0.23]) {
      const wheel = addCylinder(lounge, 'coffee-table-caster-wheel', 0.035, 0.035, { x: 2.05 + dx, y: 0.035, z: 0.2 + dz }, materials.black, 18);
      wheel.rotation.x = Math.PI / 2;
    }
  }
  addPottedPlant(lounge, { x: 1.28, y: plantPotCenterY(0.46 + 0.08 / 2, 0.12), z: zFront + 0.27 }, 0.12);
  addBox(lounge, 'black-vertical-acoustic-panel-tv-side', { x: 0.08, y: 1.05, z: 0.09 }, { x: 2.94, y: 1.25, z: zFront + 0.09 }, materials.black);
  addBox(lounge, 'black-vertical-acoustic-panel-door-side', { x: 0.08, y: 0.94, z: 0.09 }, { x: 1.12, y: 1.2, z: zFront + 0.09 }, materials.black);
}

function setupLights() {
  ambientLight = new THREE.AmbientLight(0xd7e4f3, 0.62);
  scene.add(ambientLight);
  hemisphereLight = new THREE.HemisphereLight(0xeaf5ff, 0x5f7d3a, 0.78);
  scene.add(hemisphereLight);
  sunLight = new THREE.DirectionalLight(0xfff1d1, 2.15);
  sunLight.position.set(-4.6, 7.0, -5.2);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -6;
  sunLight.shadow.camera.right = 6;
  sunLight.shadow.camera.top = 5;
  sunLight.shadow.camera.bottom = -5;
  scene.add(sunLight);
  fillLight = new THREE.DirectionalLight(0xaec8ff, 0.38);
  fillLight.position.set(4, 2.5, 3);
  scene.add(fillLight);

  doorLight = new THREE.SpotLight(0x7fb7df, 0.42, 6.2, Math.PI * 0.34, 0.72, 1.15);
  doorLight.name = 'tinted-door-daylight';
  doorLight.position.set(0, 1.35, zFront - 0.38);
  doorLight.target.position.set(0.18, 0.78, 0.55);
  doorLight.castShadow = true;
  doorLight.shadow.mapSize.set(1024, 1024);
  scene.add(doorLight, doorLight.target);

  const officeScreenLight = new THREE.PointLight(0x5f8cff, 0.42, 3.2, 1.85);
  officeScreenLight.name = 'office-monitor-screen-glow';
  officeScreenLight.position.set(-2.12, 1.04, 0);
  officeScreenLight.userData.dayIntensity = 0.42;
  officeScreenLight.userData.darkIntensity = 0.92;
  scene.add(officeScreenLight);
  screenGlowLights.push(officeScreenLight);

  const tvScreenLight = new THREE.PointLight(0x52d7ff, 0.48, 3.8, 1.75);
  tvScreenLight.name = 'tv-screen-glow';
  tvScreenLight.position.set(2.02, 1.08, zFront + 0.62);
  tvScreenLight.userData.dayIntensity = 0.48;
  tvScreenLight.userData.darkIntensity = 1.1;
  scene.add(tvScreenLight);
  screenGlowLights.push(tvScreenLight);
}

function setOrbitCamera() {
  camera.fov = 56;
  camera.position.set(0.28, 8.2, 3.55);
  orbitControls.target.set(0, 0.45, -0.05);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  orbitControls.update();
}

function getBackyardExteriorState() {
  const bounds = getSceneObjectBounds();
  return {
    hasWoodenStep: Boolean(woodenStepGroup),
    hasFence: Boolean(backyardFenceGroup),
    stepBounds: bounds.filter((item) => item.name.startsWith('exterior-step')),
    fenceObjectCount: backyardFenceGroup?.children.length ?? 0,
    fenceBounds,
  };
}

addExteriorGrass();
addExterior();
addWoodenStep();
addBackyardFence();
addRoomShell();
addOffice();
addLounge();
setupLights();
applyDownlightState();
setOrbitCamera();
setWallCutawayButtonActive(wallCutawayEnabled);
updateCutawayWalls();

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  if (!isPovMode) setOrbitCamera();
  updateCutawayWalls();
  renderer.render(scene, camera);
});

window.__podDebug = {
  getCameraPosition: () => camera.position.toArray(),
  getCameraRotation: () => camera.rotation.toArray(),
  getCameraFov: () => camera.fov,
  setOrbitCaptureView: ({ position, target, fov = 56 }) => {
    if (povControls.isLocked) povControls.unlock();
    setPovModeActive(false);
    camera.fov = fov;
    camera.position.fromArray(position);
    orbitControls.target.fromArray(target);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    orbitControls.update();
    const cutawaySides = updateCutawayWalls();
    renderer.render(scene, camera);
    return {
      position: camera.position.toArray(),
      target: orbitControls.target.toArray(),
      fov: camera.fov,
      cutawaySides,
    };
  },
  isPovMode: () => isPovMode,
  isPovLocked: () => povControls.isLocked,
  isOrbitEnabled: () => orbitControls.enabled,
  getPovEyeHeight: () => POV_EYE_HEIGHT,
  getPovBounds: () => ({ ...POV_BOUNDS }),
  getLightSwitchPosition: () => lightSwitchPosition.toArray(),
  isLightPanelOpen: () => isLightPanelOpen,
  getDownlightState: () => ({ ...downlightState }),
  getCeilingMaterialState: () => ({
    material: ceilingMesh?.userData.currentMaterial ?? null,
    transparent: Boolean(ceilingMesh?.material?.transparent),
    opacity: ceilingMesh?.material?.opacity ?? 1,
    castShadow: Boolean(ceilingMesh?.castShadow),
  }),
  getRoofHeightState: () => ({
    doorSide: heightAtZ(zFront),
    noDoorSide: heightAtZ(zBack),
  }),
  getSceneObjectBounds,
  getExteriorGrassState,
  getBackyardExteriorState,
  isWallCutawayEnabled: () => wallCutawayEnabled,
  setWallCutawayEnabled,
  getDownlightIntensities: () => downlightLights.map((light) => light.intensity),
  getDownlightColorHex: () => (downlightLights[0] ? `#${downlightLights[0].color.getHexString()}` : null),
  setDownlightsOn: (isOn) => {
    downlightState.on = Boolean(isOn);
    applyDownlightState();
    return { ...downlightState };
  },
  getEnvironmentLightIntensities: () => ({
    ambient: ambientLight?.intensity ?? null,
    hemisphere: hemisphereLight?.intensity ?? null,
    sun: sunLight?.intensity ?? null,
    fill: fillLight?.intensity ?? null,
    door: doorLight?.intensity ?? null,
    screens: screenGlowLights.map((light) => light.intensity),
    shelves: shelfGlowLights.map((light) => light.intensity),
  }),
  aimAtLightSwitch: () => {
    camera.position.set(-1.28, POV_EYE_HEIGHT, -0.78);
    camera.lookAt(lightSwitchPosition);
    camera.updateMatrixWorld(true);
    clampPovPosition();
  },
  testLightSwitchCenterHit: () => {
    pointerNdc.set(0, 0);
    raycaster.setFromCamera(pointerNdc, camera);
    return raycaster.intersectObjects(lightSwitchTargets, false).length > 0;
  },
  getCutawayWallSides: () => updateCutawayWalls(),
};

let frames = 0;
function animate() {
  const delta = Math.min(clock.getDelta(), 0.05);

  if (isPovMode) {
    if (movement.forward) povControls.moveForward(POV_WALK_SPEED * delta);
    if (movement.back) povControls.moveForward(-POV_WALK_SPEED * delta);
    if (movement.left) povControls.moveRight(-POV_WALK_SPEED * delta);
    if (movement.right) povControls.moveRight(POV_WALK_SPEED * delta);
    clampPovPosition();
  } else {
    orbitControls.update();
  }

  updateCutawayWalls();
  renderer.render(scene, camera);
  frames += 1;
  if (frames > 12) window.__renderReady = true;
  requestAnimationFrame(animate);
}
animate();
