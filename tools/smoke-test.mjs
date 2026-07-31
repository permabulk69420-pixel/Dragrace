/**
 * Headless checks that run in CI: build the car, sanity-check the hierarchy,
 * then drive the physics through a full quarter-mile pass and assert the
 * numbers land somewhere a car like this actually would.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { buildCar } = await import(path.join(root, 'src/car/car.js'));
const { Vehicle } = await import(path.join(root, 'src/physics/vehicle.js'));
const { Race, PHASE } = await import(path.join(root, 'src/world/race.js'));
const { SPEC } = await import(path.join(root, 'src/car/spec.js'));

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` - ${detail}` : ''}`);
  if (!ok) failures++;
};

/* -- model ---------------------------------------------------------------- */

const { root: car, parts } = buildCar();
car.updateMatrixWorld(true);

const required = [
  'CarRoot', 'PitchPivot', 'Sprung', 'DriverAnchor',
  'Suspension_FL', 'Steer_FL', 'Spin_FL', 'Spin_RR',
  'SteeringWheel', 'Shifter', 'Pedal_throttle', 'Needle_tacho', 'BodyShell',
];
for (const name of required) check(`node ${name}`, !!car.getObjectByName(name));

let meshes = 0, triangles = 0;
car.traverse((o) => {
  if (!o.isMesh) return;
  meshes++;
  const idx = o.geometry.getIndex();
  triangles += (idx ? idx.count : o.geometry.attributes.position.count) / 3;
});
check('draw calls within budget', meshes < 220, `${meshes} meshes`);
check('triangles within budget', triangles < 200000, `${Math.round(triangles).toLocaleString()} tris`);

// Bounding box: this should measure like a car, in metres.
const { Box3, Vector3 } = await import(path.join(root, 'node_modules/three/build/three.module.js'));
// Measure the car itself: the stowed parachute and the wheelie bars are real
// parts, but they are not what "how big is this car" means.
const measured = car.clone(true);
for (const name of ['Chute', 'WheelieBars']) measured.getObjectByName(name)?.removeFromParent();
const box = new Box3().setFromObject(measured);
const size = box.getSize(new Vector3());
check('length 4.5-5.5 m', size.z > 4.5 && size.z < 5.5, `${size.z.toFixed(2)} m`);
check('width 1.8-2.3 m', size.x > 1.8 && size.x < 2.3, `${size.x.toFixed(2)} m`);
check('height 1.3-1.8 m', size.y > 1.3 && size.y < 1.8, `${size.y.toFixed(2)} m`);
check('sits on the ground', Math.abs(box.min.y) < 0.05, `min y ${box.min.y.toFixed(3)}`);

// The driver's eyes must be inside the cabin, not in the boot or the roof.
const eye = new Vector3();
parts.driverAnchor.getWorldPosition(eye);
check('eye point in the cockpit',
  eye.y > 0.95 && eye.y < 1.35 && Math.abs(eye.z) < 0.8 && eye.x < 0,
  `(${eye.x.toFixed(2)}, ${eye.y.toFixed(2)}, ${eye.z.toFixed(2)})`);

/* -- physics -------------------------------------------------------------- */

const v = new Vehicle();
v.reset(0.4, 0);

// Warm the slicks with a burnout, then launch on the two-step.
v.lineLock = true;
v.throttle = 1;
for (let i = 0; i < 3 * 120; i++) v.update(1 / 120);
check('burnout spins the tyres', v.wheelSlip > 0.3, `slip ${v.wheelSlip.toFixed(2)}`);
check('burnout heats the tyres', v.tyreTemp > 0.6, `temp ${(v.tyreTemp * 100).toFixed(0)}%`);

v.lineLock = false;
v.reset(0.4, 0);
v.tyreTemp = 0.95;
v.brake = 1;
v.throttle = 1;
for (let i = 0; i < 120; i++) v.update(1 / 120);
check('two-step holds the revs', v.rpm > 3600 && v.rpm < 4600, `${Math.round(v.rpm)} rpm`);
check('brakes hold the car', Math.abs(v.speed) < 0.5, `${v.speed.toFixed(2)} m/s`);

v.brake = 0;
const race = new Race();
race.phase = PHASE.RUNNING;
race.stageMark = 0;
race.reaction = 0;

let t = 0;
let sixty = null;
while (t < 30 && v.distance < SPEC.quarterMile) {
  v.update(1 / 120);
  race.update(v, 1 / 120);
  t += 1 / 120;
  if (sixty === null && v.distance >= 18.288) sixty = t;
}
check('completes the quarter', v.distance >= SPEC.quarterMile, `${v.distance.toFixed(1)} m in ${t.toFixed(2)} s`);
check('60 ft time is plausible', sixty > 0.9 && sixty < 2.6, `${sixty?.toFixed(3)} s`);
check('ET is plausible', t > 7 && t < 14, `${t.toFixed(3)} s`);
check('trap speed is plausible', v.speedMph > 110 && v.speedMph < 200, `${v.speedMph.toFixed(1)} mph`);
check('shifted up through the box', v.gear >= 3, `gear ${v.gear}`);

// Frame-rate independence: the same run at 30 Hz and 144 Hz must agree.
const runAt = (hz) => {
  const car2 = new Vehicle();
  car2.reset(0.4, 0);
  car2.tyreTemp = 0.95;
  car2.throttle = 1;
  let time = 0;
  while (time < 30 && car2.distance < SPEC.quarterMile) {
    car2.update(1 / hz);
    time += 1 / hz;
  }
  return time;
};
const slow = runAt(30);
const fast = runAt(144);
check('frame-rate independent', Math.abs(slow - fast) < 0.15, `30 Hz ${slow.toFixed(3)} s vs 144 Hz ${fast.toFixed(3)} s`);

// The parachute has to actually slow it down.
v.throttle = 0;
v.chuteOut = true;
const before = v.speed;
for (let i = 0; i < 120; i++) v.update(1 / 120);
check('parachute slows the car', v.speed < before - 4, `${before.toFixed(1)} -> ${v.speed.toFixed(1)} m/s`);

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
