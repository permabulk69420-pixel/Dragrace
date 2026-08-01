import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THREE = await import(path.join(rootPath, 'node_modules/three/build/three.module.js'));
const {
  buildStaticCollisionWorld,
  collectCourseBoundaryColliders,
  collectStaticColliders,
  StaticCollisionWorld,
} = await import(path.join(rootPath, 'src/world/staticCollision.js'));
const {
  courseRoute,
} = await import(path.join(rootPath, 'src/world/course.js'));

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

const boundaryColliders = collectCourseBoundaryColliders(courseRoute);
check('visible course walls become real short world-space colliders',
  boundaryColliders.length > 2000 && boundaryColliders.every((collider) => collider.type === 'box'),
  `${boundaryColliders.length} wall segments`);

function outwardHeading(frame) {
  const outward = new THREE.Vector3(frame.right.x, 0, frame.right.z).normalize();
  return {
    outward,
    heading: Math.atan2(-outward.x, -outward.z),
  };
}

function crossVisibleBoundary(fraction, expectedKind) {
  const distance = courseRoute.length * fraction;
  const frame = courseRoute.atDistance(distance);
  const { heading } = outwardHeading(frame);
  const start = courseRoute.pointAt(distance, 5.4, 0);
  const end = courseRoute.pointAt(distance, 12.0, 0);
  const centreY = frame.center.y + 0.82;
  const collisionWorld = new StaticCollisionWorld(boundaryColliders);
  collisionWorld.reset({ x: start.x, z: start.z, heading, y: centreY });
  const movingVehicle = {
    x: end.x,
    z: end.z,
    heading,
    speed: 28,
    accel: 3,
    lateralAccel: 5,
  };
  const hit = collisionWorld.resolve(movingVehicle, 1 / 30, centreY);
  const road = courseRoute.nearest(movingVehicle.x, movingVehicle.z, distance);
  return { hit, road, movingVehicle };
}

const concreteHit = crossVisibleBoundary(0.34, 'barrier');
check('concrete barrier collision uses its rendered world position',
  concreteHit.hit.collided && concreteHit.hit.collider?.kind === 'barrier' &&
  concreteHit.road.lateral > 6.0 && concreteHit.road.lateral < 8.2,
  `${concreteHit.hit.collider?.kind ?? 'none'} at ${concreteHit.road.lateral.toFixed(2)} m`);

const guardrailHit = crossVisibleBoundary(0.625, 'guardrail');
check('steel guardrail collision uses its rendered world position',
  guardrailHit.hit.collided && guardrailHit.hit.collider?.kind === 'guardrail' &&
  guardrailHit.road.lateral > 6.0 && guardrailHit.road.lateral < 8.4,
  `${guardrailHit.hit.collider?.kind ?? 'none'} at ${guardrailHit.road.lateral.toFixed(2)} m`);

const centreDistance = courseRoute.length * 0.34;
const centreStart = courseRoute.pointAt(centreDistance, 0, 0);
const centreEnd = courseRoute.pointAt(centreDistance + 24, 0, 0);
const centreFrame = courseRoute.atDistance(centreDistance);
const centreWorld = new StaticCollisionWorld(boundaryColliders);
centreWorld.reset({
  x: centreStart.x,
  z: centreStart.z,
  heading: centreFrame.heading,
  y: centreFrame.center.y + 0.82,
});
const centreVehicle = {
  x: centreEnd.x,
  z: centreEnd.z,
  heading: centreFrame.heading,
  speed: 22,
};
const centreRun = centreWorld.resolve(centreVehicle, 1 / 30, centreFrame.center.y + 0.82);
check('the road centre remains free of invisible containment', !centreRun.collided);

console.log(failures ? `\n${failures} static collision check(s) failed` : '\nall static collision checks passed');
process.exit(failures ? 1 : 0);
