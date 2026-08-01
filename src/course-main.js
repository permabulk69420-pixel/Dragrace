/**
 * Bayfront Circuit - course preview.
 *
 * Boots a renderer, builds the world from src/course/, and puts a first-person
 * viewpoint in it so the circuit can be driven round on a headset or at a desk.
 * The drag strip in index.html is untouched; this is a separate entry point.
 *
 * There is no car here on purpose. The vehicle lives in src/car/ and gets
 * dropped in later - see docs/COURSE.md for the two calls that takes.
 */
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

import { buildCourse, setupSky } from './course/index.js';
import { PreviewRig, carPlaceholder, MODES } from './course/preview.js';
import { PreviewInput } from './course/input.js';
import { DISTRICTS } from './course/layout.js';

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

step(4, 'Starting renderer…');

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
  stencil: false,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// 2 km of draw distance: the far side of the circuit and the skyline are both
// meant to be visible from the viaduct.
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 2600);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* -------------------------------------------------------------------------- */
/* World                                                                       */
/* -------------------------------------------------------------------------- */

step(10, 'Painting the sky…');
const sky = setupSky(renderer, scene, { mood: 'dusk' });

const course = buildCourse({
  onProgress: (pct, label) => step(10 + pct * 0.85, label),
});
scene.add(course.object);

/* -------------------------------------------------------------------------- */
/* Viewpoint                                                                   */
/* -------------------------------------------------------------------------- */

const rig = new PreviewRig(course);
scene.add(rig.group);
rig.group.add(camera);

const input = new PreviewInput(renderer, renderer.domElement);
const lapTimer = course.newLapTimer();

// Where the car will go, shown on the grid until it exists.
const placeholder = carPlaceholder();
const slot = course.gridSlots(1)[0];
placeholder.position.copy(slot.position);
placeholder.rotation.y = slot.heading;
scene.add(placeholder);

let showPlaceholder = true;
let mode = rig.mode;

/* -------------------------------------------------------------------------- */
/* Entry points                                                                */
/* -------------------------------------------------------------------------- */

const enter = document.getElementById('enter');
const vrSlot = document.getElementById('btn-vr');
const vrButton = VRButton.createButton(renderer, {
  optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'],
});
styleVRButton(vrButton);
vrSlot.replaceWith(vrButton);
enter.style.display = 'block';

function styleVRButton(el) {
  Object.assign(el.style, {
    position: 'static',
    width: 'auto',
    padding: '13px 30px',
    margin: '6px',
    border: '1px solid #ff9d4d',
    borderRadius: '999px',
    background: 'linear-gradient(180deg, #ff8a2b, #e2560d)',
    color: '#1b0d02',
    font: '700 15px/1 ui-sans-serif, system-ui, sans-serif',
    letterSpacing: '.1em',
    textTransform: 'uppercase',
    opacity: '1',
    cursor: 'pointer',
    left: 'auto',
    bottom: 'auto',
    transform: 'none',
  });
}

function begin() {
  overlay.classList.add('hidden');
  hud.classList.add('on');
}

vrButton.addEventListener('click', begin);
document.getElementById('btn-desktop').addEventListener('click', () => {
  begin();
  renderer.domElement.requestPointerLock?.();
});
document.getElementById('btn-ride').addEventListener('click', () => {
  begin();
  rig.mode = 'ride';
  rig.rideS = course.track.query(rig.position.x, rig.position.z).s;
});

renderer.xr.addEventListener('sessionstart', () => {
  overlay.classList.add('hidden');
  hud.classList.remove('on');
  renderer.xr.setFoveation(0.5);
  input.lookYaw = 0;
  input.lookPitch = 0;
});
renderer.xr.addEventListener('sessionend', () => hud.classList.add('on'));

/* -------------------------------------------------------------------------- */
/* Loop                                                                        */
/* -------------------------------------------------------------------------- */

const clock = new THREE.Clock();
let hudTimer = 0;
let frames = 0;
let fps = 0;
let fpsTimer = 0;

step(100, 'Ready');

renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta());

  input.update();
  const events = input.takeEvents();
  if (events.mode) mode = rig.nextMode();
  if (events.ride) {
    rig.mode = rig.mode === 'ride' ? 'drive' : 'ride';
    rig.rideS = course.track.query(rig.position.x, rig.position.z).s;
    mode = rig.mode;
  }
  if (events.reset) {
    rig.reset(0);
    lapTimer.reset();
  }
  if (events.marker) {
    showPlaceholder = !showPlaceholder;
    placeholder.visible = showPlaceholder;
  }
  if (events.recentre) input.lookYaw = 0;

  rig.update(dt, input);

  // Outside VR the head is the mouse; in VR the headset owns the view and the
  // rig only carries it around.
  if (!renderer.xr.isPresenting) {
    camera.position.set(0, 0, 0);
    camera.rotation.set(input.lookPitch + rig.pitch, 0, rig.roll * 0.35);
  }

  const road = lapTimer.update(rig.position.x, rig.position.z, dt, {
    offTrack: !course.surface(rig.position.x, rig.position.z).onRoad,
  });

  course.update(dt, rig.position, sky);

  frames++;
  fpsTimer += dt;
  if (fpsTimer > 0.5) {
    fps = frames / fpsTimer;
    frames = 0;
    fpsTimer = 0;
  }

  hudTimer += dt;
  if (hudTimer > 0.12 && !renderer.xr.isPresenting) {
    hudTimer = 0;
    drawHud(road);
  }

  renderer.render(scene, camera);
});

function drawHud(road) {
  const timing = lapTimer.readout();
  document.getElementById('hud-speed').textContent = Math.round(Math.abs(rig.speedKph));
  document.getElementById('hud-mode').textContent = mode.toUpperCase();
  const district = DISTRICTS[road.district]?.label ?? road.district;
  document.getElementById('hud-info').innerHTML = [
    `<b>${district}</b> · ${(road.s / 1000).toFixed(2)} / ${(course.length / 1000).toFixed(2)} km`,
    `LAP ${timing.lap} · <b>${timing.current}</b> · best ${timing.best}`,
    `sector ${timing.sector} · ${road.onRoad ? 'on track' : 'off track'} · ${fps.toFixed(0)} fps`,
  ].join('<br>');
}

// Handy from the console when tuning the layout.
Object.assign(window, { THREE, scene, renderer, camera, course, rig, lapTimer, MODES });
