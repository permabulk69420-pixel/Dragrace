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
    verticalAngle > THREE.MathUtils.degToRad(17),
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

for (const name of ['tacho', 'speedo', 'boost']) {
  check(`primary gauge ${name} remains present`, !!root.getObjectByName(`Gauge_${name}`));
}

console.log(failures ? `\n${failures} cockpit check(s) failed` : '\ncockpit checks passed');
process.exit(failures ? 1 : 0);
