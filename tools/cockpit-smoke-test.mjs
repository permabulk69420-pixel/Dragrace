import * as THREE from 'three';
import { buildCar } from '../src/car/car.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` - ${detail}` : ''}`);
  if (!ok) failures++;
};

const { root, parts } = buildCar({ procedural: false });
root.updateMatrixWorld(true);

const cage = root.getObjectByName('RollCage');
check('refined roll cage is installed', !!cage?.userData.refinedSightline);

const eye = new THREE.Vector3();
parts.driverAnchor.getWorldPosition(eye);

if (cage?.userData.frontHeader) {
  const header = cage.localToWorld(new THREE.Vector3(
    cage.userData.frontHeader.x,
    cage.userData.frontHeader.y,
    cage.userData.frontHeader.z,
  ));
  const distance = eye.distanceTo(header);
  check('windscreen header stays clear of the headset near field',
    distance > 0.40,
    `${distance.toFixed(3)} m from eye`);

  const verticalAngle = Math.atan2(header.y - eye.y, Math.hypot(header.x - eye.x, header.z - eye.z));
  check('windscreen header sits above the primary driving sightline',
    verticalAngle > THREE.MathUtils.degToRad(15),
    `${THREE.MathUtils.radToDeg(verticalAngle).toFixed(1)} deg above eye`);
}

const wheelCentre = new THREE.Vector3();
parts.steeringWheel.getWorldPosition(wheelCentre);
const wheelDistance = eye.distanceTo(wheelCentre);
check('steering wheel is at a believable arm distance',
  wheelDistance > 0.48 && wheelDistance < 0.68,
  `${wheelDistance.toFixed(3)} m`);
check('steering grab radius matches the refined wheel',
  parts.steeringWheelWorldRadius > 0.15 && parts.steeringWheelWorldRadius < 0.17,
  `${parts.steeringWheelWorldRadius.toFixed(3)} m`);
check('wheel moved slightly toward the driver',
  parts.cockpitMetrics?.steeringWheelDriverOffset === 0.035,
  `${parts.cockpitMetrics?.steeringWheelDriverOffset ?? 'missing'} m`);

const gauges = ['tacho', 'speedo', 'boost']
  .map((name) => root.getObjectByName(`Gauge_${name}`));
for (const [index, name] of ['tacho', 'speedo', 'boost'].entries()) {
  check(`primary gauge ${name} remains present`, !!gauges[index]);
}

check('primary gauges share one vertical centre',
  gauges.every(Boolean) && Math.max(...gauges.map((g) => g.position.y)) - Math.min(...gauges.map((g) => g.position.y)) < 1e-6,
  gauges.filter(Boolean).map((g) => g.position.y.toFixed(3)).join(', '));
check('primary gauges have moved forward from the embedded pod',
  gauges.every((g) => g && g.position.z > -0.47),
  gauges.filter(Boolean).map((g) => g.position.z.toFixed(3)).join(', '));
check('new cluster faceplate hides the abandoned static cans',
  !!root.getObjectByName('RefinedGaugeFaceplate'));

for (const name of ['tacho', 'speedo', 'boost']) {
  const blade = root.getObjectByName(`${name}Blade`);
  check(`${name} needle is substantially thinner`,
    blade?.userData.widthScale === 0.42,
    `${blade?.userData.widthScale ?? 'missing'}x`);
  check(`${name} needle is twenty percent shorter`,
    blade?.userData.lengthScale === 0.8,
    `${blade?.userData.lengthScale ?? 'missing'}x`);
}

console.log(failures ? `\n${failures} cockpit check(s) failed` : '\ncockpit checks passed');
process.exit(failures ? 1 : 0);
