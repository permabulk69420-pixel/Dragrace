import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THREE = await import(path.join(rootPath, 'node_modules/three/build/three.module.js'));
const {
  buildStaticCollisionWorld,
  collectStaticColliders,
} = await import(path.join(rootPath, 'src/world/staticCollision.js'));

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` - ${detail}` : ''}`);
  if (!ok) failures++;
};

const root = new THREE.Group();
root.name = 'CollisionFixture';
const landmarks = new THREE.Group();
landmarks.name = 'ArchitecturalLandmarks';
root.add(landmarks);

const building = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 4), new THREE.MeshBasicMaterial());
building.name = 'TestMainBlock';
building.position.set(0, 1.5, 0);
landmarks.add(building);

const rotated = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 3), new THREE.MeshBasicMaterial());
rotated.name = 'TestRotatedBlock';
rotated.position.set(12, 1.5, 0);
rotated.rotation.y = Math.PI / 4;
landmarks.add(rotated);

const overhead = new THREE.Mesh(new THREE.BoxGeometry(8, 1, 8), new THREE.MeshBasicMaterial());
overhead.name = 'TestOverheadBlock';
overhead.position.set(0, 8, 0);
landmarks.add(overhead);

const colliders = collectStaticColliders(root);
console.log('fixture colliders', JSON.stringify(colliders));
check('collector uses structural geometry and rejects overhead pieces',
  colliders.length === 2,
  `${colliders.length} colliders`);

const world = buildStaticCollisionWorld(root);
const vehicle = {
  x: 8,
  z: 0,
  heading: -Math.PI / 2,
  speed: 30,
  accel: 5,
  lateralAccel: 4,
};
world.reset({ x: -8, z: 0, heading: -Math.PI / 2, y: 0.82 });
const wallHit = world.resolve(vehicle, 1 / 30, 0.82);
console.log('wall hit', wallHit, vehicle);
const forwardAfterHit = new THREE.Vector2(-Math.sin(vehicle.heading), -Math.cos(vehicle.heading));
check('fast movement is swept into the actual wall', wallHit.collided && wallHit.collider?.source === 'TestMainBlock');
check('vehicle remains at the contact wall instead of teleporting elsewhere',
  vehicle.x < -3.4 && vehicle.x > -5.2,
  `x=${vehicle.x.toFixed(2)}`);
check('head-on wall impact reverses direction and removes speed',
  forwardAfterHit.x < -0.5 && Math.abs(vehicle.speed) < 30,
  `speed=${vehicle.speed.toFixed(2)}, forwardX=${forwardAfterHit.x.toFixed(2)}`);

const rotatedVehicle = {
  x: 18,
  z: 0,
  heading: -Math.PI / 2,
  speed: 24,
};
world.reset({ x: 5, z: 0, heading: -Math.PI / 2, y: 0.82 });
const rotatedHit = world.resolve(rotatedVehicle, 1 / 30, 0.82);
console.log('rotated hit', rotatedHit, rotatedVehicle);
check('oriented building walls collide at their real rotation',
  rotatedHit.collided && rotatedHit.collider?.source === 'TestRotatedBlock');

const clearVehicle = {
  x: 18,
  z: 20,
  heading: -Math.PI / 2,
  speed: 24,
};
world.reset({ x: -8, z: 20, heading: -Math.PI / 2, y: 0.82 });
const clearRun = world.resolve(clearVehicle, 1 / 30, 0.82);
console.log('clear run', clearRun, clearVehicle);
check('clear space remains driveable', !clearRun.collided && clearVehicle.x === 18);

const elevatedVehicle = {
  x: 8,
  z: 0,
  heading: -Math.PI / 2,
  speed: 30,
};
world.reset({ x: -8, z: 0, heading: -Math.PI / 2, y: 8 });
const elevatedRun = world.resolve(elevatedVehicle, 1 / 30, 8);
check('vertical separation prevents false collision beneath elevated roads', !elevatedRun.collided);

console.log(failures ? `\n${failures} static collision check(s) failed` : '\nall static collision checks passed');
process.exit(failures ? 1 : 0);
