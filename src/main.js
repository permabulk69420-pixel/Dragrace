/**
 * Nitro Strip - first person VR drag racing.
 *
 * Boots the renderer, builds the world and the car, and runs the loop through
 * renderer.setAnimationLoop so WebXR drives the timing on a headset.
 */
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

import { buildCar } from './car/car.js';
import { setupEnvironment } from './world/environment.js';
import { buildTrack } from './world/track.js';
import { Race, PHASE } from './world/race.js';
import { Vehicle } from './physics/vehicle.js';
import { Controls } from './input/controls.js';
import { EngineAudio } from './audio/engine.js';

const status = document.getElementById('status');
const progress = document.getElementById('progress');
const overlay = document.getElementById('overlay');
const hud = document.getElementById('hud');

const step = (pct, text) => {
  progress.style.width = `${pct}%`;
  if (text) status.textContent = text;
};

/* -------------------------------------------------------------------------- */
/* Renderer                                                                    */
/* -------------------------------------------------------------------------- */

step(8, 'Starting renderer…');

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
  stencil: false,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.05, 2000);
camera.position.set(0, 1.4, 6);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* -------------------------------------------------------------------------- */
/* World                                                                       */
/* -------------------------------------------------------------------------- */

step(22, 'Lighting the strip…');
const lights = setupEnvironment(renderer, scene);

step(40, 'Building the track…');
const track = buildTrack();
scene.add(track.object);

step(62, 'Building the car…');
const car = buildCar({ paint: 0xb3121b });
scene.add(car.root);

/* -------------------------------------------------------------------------- */
/* Player rig                                                                  */
/* -------------------------------------------------------------------------- */

// The rig hangs off the driver's eye point inside the cockpit, so the player
// rides with the car while the headset is still free to move them around
// inside it. Recentring shifts the rig so the headset lands on the eye point.
const rig = new THREE.Group();
rig.name = 'PlayerRig';
car.parts.driverAnchor.add(rig);

let recenterFrames = 0;
function recenter() {
  if (!renderer.xr.isPresenting) return;
  // camera.position is the head pose expressed in rig space.
  const head = camera.position.clone();
  const yaw = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ').y;
  rig.rotation.y -= yaw;
  const offset = head.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);
  rig.position.set(-offset.x, -offset.y, -offset.z);
}

step(74, 'Wiring up the controls…');
const controls = new Controls(renderer, rig);
const audio = new EngineAudio();
const vehicle = new Vehicle();
const race = new Race();

/* -------------------------------------------------------------------------- */
/* Cameras (desktop only - in VR the headset owns the view)                    */
/* -------------------------------------------------------------------------- */

const CAMERA_MODES = ['cockpit', 'chase', 'showcase', 'trackside'];
let cameraMode = 0;
const _camTarget = new THREE.Vector3();

function updateDesktopCamera(dt, time) {
  const mode = CAMERA_MODES[cameraMode];
  const carPos = car.root.position;
  const heading = car.root.rotation.y;
  const fwd = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading));

  if (mode === 'cockpit') {
    car.parts.driverAnchor.getWorldPosition(_camTarget);
    camera.position.lerp(_camTarget, 1);
    camera.quaternion.slerp(car.root.quaternion, Math.min(1, dt * 12));
  } else if (mode === 'chase') {
    const want = carPos.clone().addScaledVector(fwd, -7.5).add(new THREE.Vector3(0, 2.6, 0));
    camera.position.lerp(want, Math.min(1, dt * 4));
    camera.lookAt(carPos.x + fwd.x * 6, carPos.y + 1.1, carPos.z + fwd.z * 6);
  } else if (mode === 'showcase') {
    const a = time * 0.25;
    camera.position.set(
      carPos.x + Math.cos(a) * 7.5,
      1.9 + Math.sin(time * 0.4) * 0.7,
      carPos.z + Math.sin(a) * 7.5
    );
    camera.lookAt(carPos.x, carPos.y + 0.85, carPos.z);
  } else {
    camera.position.set(-11, 2.4, -20);
    camera.lookAt(carPos.x, carPos.y + 0.8, carPos.z);
  }
}

/* -------------------------------------------------------------------------- */
/* Entry points                                                                */
/* -------------------------------------------------------------------------- */

step(88, 'Almost there…');

const enter = document.getElementById('enter');
const vrSlot = document.getElementById('btn-vr');
const vrButton = VRButton.createButton(renderer, {
  optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'],
});
styleVRButton(vrButton);
vrSlot.replaceWith(vrButton);
enter.style.display = 'block';

function styleVRButton(el) {
  el.style.position = 'static';
  el.style.width = 'auto';
  el.style.padding = '13px 30px';
  el.style.margin = '6px';
  el.style.border = '1px solid #ff9d4d';
  el.style.borderRadius = '999px';
  el.style.background = 'linear-gradient(180deg, #ff8a2b, #e2560d)';
  el.style.color = '#1b0d02';
  el.style.font = '700 15px/1 ui-sans-serif, system-ui, sans-serif';
  el.style.letterSpacing = '.1em';
  el.style.textTransform = 'uppercase';
  el.style.opacity = '1';
  el.style.cursor = 'pointer';
  el.style.left = 'auto';
  el.style.bottom = 'auto';
  el.style.transform = 'none';
}

function beginSession() {
  overlay.classList.add('hidden');
  audio.start();
}

vrButton.addEventListener('click', beginSession);
document.getElementById('btn-desktop').addEventListener('click', () => {
  beginSession();
  hud.classList.add('on');
});

renderer.xr.addEventListener('sessionstart', () => {
  overlay.classList.add('hidden');
  hud.classList.remove('on');
  audio.start();
  recenterFrames = 8;
  renderer.xr.setFoveation(0.6);
  if (camera.parent !== rig) rig.add(camera);
});

renderer.xr.addEventListener('sessionend', () => {
  hud.classList.add('on');
  if (camera.parent === rig) {
    rig.remove(camera);
    camera.position.set(0, 1.5, 8);
    camera.rotation.set(0, 0, 0);
  }
});

/* -------------------------------------------------------------------------- */
/* Actions                                                                     */
/* -------------------------------------------------------------------------- */

function resetCar() {
  race.remember();
  vehicle.reset(12, 0);
  race.reset();
  car.root.position.set(0, 0, 12);
  car.root.rotation.set(0, 0, 0);
}

async function exportGlb() {
  status.textContent = 'Exporting car.glb…';
  overlay.classList.remove('hidden');
  const { exportCarGlb } = await import('./tools/exportGlb.js');
  await exportCarGlb();
  overlay.classList.add('hidden');
}

/* -------------------------------------------------------------------------- */
/* Loop                                                                        */
/* -------------------------------------------------------------------------- */

const clock = new THREE.Clock();
let elapsed = 0;
let hudTimer = 0;

resetCar();
step(100, 'Ready');

renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta());
  elapsed += dt;

  if (recenterFrames > 0 && renderer.xr.isPresenting) {
    recenterFrames--;
    if (recenterFrames === 0) recenter();
  }

  // --- input ---------------------------------------------------------------
  controls.update(dt, car.parts, vehicle.steerAngle);
  const events = controls.takeEvents();
  if (events.shiftUp) { vehicle.autoShift = false; vehicle.shiftUp(); audio.blip(160, 0.06, 0.15); }
  if (events.shiftDown) { vehicle.autoShift = false; vehicle.shiftDown(); }
  if (events.reset) resetCar();
  if (events.chute) { vehicle.chuteOut = !vehicle.chuteOut; audio.blip(70, 0.35, 0.3); }
  if (events.recenter) recenter();
  if (events.camera) cameraMode = (cameraMode + 1) % CAMERA_MODES.length;
  if (events.exportGlb) exportGlb();

  vehicle.throttle = controls.throttle;
  vehicle.brake = controls.brake;
  vehicle.clutchInput = controls.clutch;
  vehicle.steer = controls.steer;
  vehicle.lineLock = controls.lineLock;

  // --- simulate ------------------------------------------------------------
  vehicle.update(dt);
  race.update(vehicle, dt);

  // --- place the car -------------------------------------------------------
  car.root.position.set(vehicle.x, 0, vehicle.z);
  car.root.rotation.y = vehicle.heading;
  car.applyState(vehicle.state, dt);

  // Keep the shadow frustum on the car.
  lights.sun.position.set(vehicle.x + 26, 24, vehicle.z + 18);
  lights.sun.target.position.set(vehicle.x, 0, vehicle.z - 6);
  lights.sun.target.updateMatrixWorld();

  // --- feedback ------------------------------------------------------------
  audio.update(vehicle.state);
  track.tree.apply(race.lights);

  hudTimer += dt;
  if (hudTimer > 0.1) {
    hudTimer = 0;
    car.parts.dashScreen.draw(race.dashRows());
    track.scoreboard.draw(race.boardCells());
    if (!renderer.xr.isPresenting) updateHud();
  }

  if (!renderer.xr.isPresenting) updateDesktopCamera(dt, elapsed);
  renderer.render(scene, camera);
});

function updateHud() {
  const gear = vehicle.gear === 0 ? 'N' : vehicle.gear < 0 ? 'R' : String(vehicle.gear);
  document.getElementById('hud-gear').textContent = gear;
  document.getElementById('hud-speed').textContent = Math.round(vehicle.speedMph);
  const slip = Math.abs(vehicle.wheelSlip) > 0.2 ? ' · WHEELSPIN' : '';
  const rows = [
    `${Math.round(vehicle.rpm)} rpm${slip}`,
    `${race.message}`,
    race.phase === PHASE.RUNNING || race.phase === PHASE.FINISHED
      ? `ET <b>${race.elapsed.toFixed(2)}</b> · ${(race.reaction ?? 0).toFixed(3)} R/T · ${vehicle.distance.toFixed(0)} m`
      : `Tyre temp ${(vehicle.tyreTemp * 100).toFixed(0)}% · ${CAMERA_MODES[cameraMode]} cam`,
  ];
  document.getElementById('hud-info').innerHTML = rows.join('<br>');
}

// Expose a little of the internals for tinkering from the console.
Object.assign(window, { THREE, scene, renderer, car, vehicle, race, camera });
