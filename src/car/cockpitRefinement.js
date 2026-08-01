import * as THREE from 'three';
import { group, mesh, mergeStatic, roundedBox, tube } from './geom.js';

const FRONT_HEADER = Object.freeze({ x: 0, y: 1.345, z: -0.325 });
const CAGE_RADIUS = 0.026;

const CLUSTER_Y = 0.955;
const CLUSTER_Z = -0.445;
const CLUSTER_TILT = -0.35;
const WHEEL_DRIVER_OFFSET = 0.035;
const NEEDLE_WIDTH_SCALE = 0.42;
const NEEDLE_LENGTH_SCALE = 0.80;

const PRIMARY_GAUGE_RADII = Object.freeze({
  tacho: 0.068,
  speedo: 0.048,
  boost: 0.042,
});

function makeCageMaterial() {
  return new THREE.MeshStandardMaterial({
    name: 'RollCageGraphite',
    color: 0x343941,
    metalness: 0.72,
    roughness: 0.42,
    envMapIntensity: 0.9,
  });
}

function buildSightlineCage() {
  const source = group('RollCageSource');
  const material = makeCageMaterial();
  const add = (points, name, radius = CAGE_RADIUS) => {
    source.add(mesh(tube(points, radius, 8), material, name));
  };

  for (const side of [-1, 1]) {
    const suffix = side < 0 ? 'L' : 'R';

    add([
      [side * 0.665, 1.335, -0.315],
      [side * 0.725, 1.190, -0.465],
      [side * 0.785, 0.985, -0.625],
      [side * 0.790, 0.410, -0.640],
      [side * 0.760, 0.335, -0.590],
    ], `FrontLeg_${suffix}`);

    add([
      [side * 0.755, 0.335, 0.865],
      [side * 0.770, 0.860, 0.865],
      [side * 0.730, 1.190, 0.840],
      [side * 0.650, 1.315, 0.800],
    ], `MainHoopLeg_${suffix}`);

    add([
      [side * 0.665, 1.335, -0.315],
      [side * 0.650, 1.350, 0.220],
      [side * 0.650, 1.315, 0.800],
    ], `RoofRail_${suffix}`, 0.024);

    add([
      [side * 0.650, 1.315, 0.800],
      [side * 0.705, 0.975, 1.315],
      [side * 0.720, 0.430, 1.780],
    ], `RearStay_${suffix}`, 0.023);

    add([
      [side * 0.785, 0.440, -0.545],
      [side * 0.805, 0.610, 0.020],
      [side * 0.780, 0.790, 0.600],
    ], `DoorBarUpper_${suffix}`, 0.022);
    add([
      [side * 0.785, 0.720, -0.545],
      [side * 0.805, 0.575, 0.020],
      [side * 0.780, 0.430, 0.600],
    ], `DoorBarLower_${suffix}`, 0.022);
  }

  add([
    [-0.665, 1.335, -0.315],
    [0, 1.355, -0.325],
    [0.665, 1.335, -0.315],
  ], 'WindscreenHeader', 0.024);

  add([
    [-0.650, 1.315, 0.800],
    [0, 1.335, 0.815],
    [0.650, 1.315, 0.800],
  ], 'MainHoopTop');

  add([
    [-0.735, 1.075, 0.855],
    [0, 1.095, 0.865],
    [0.735, 1.075, 0.855],
  ], 'HarnessBar', 0.023);

  add([
    [-0.745, 0.355, 0.865],
    [0, 0.355, 0.875],
    [0.745, 0.355, 0.865],
  ], 'FloorCross', 0.022);

  add([
    [-0.720, 0.430, 0.855],
    [0.690, 1.190, 0.835],
  ], 'MainHoopDiagonal', 0.021);

  const cage = mergeStatic(source, 'RollCage');
  cage.userData.refinedSightline = true;
  cage.userData.frontHeader = { ...FRONT_HEADER };
  cage.userData.tubeRadius = CAGE_RADIUS;
  return cage;
}

function refinePrimaryGauges(interior, parts) {
  const dashboard = interior.getObjectByName('Dashboard');
  const tacho = interior.getObjectByName('Gauge_tacho');
  if (!dashboard || !tacho) return;

  // A new faceplate sits in front of the original embedded pod, so the whole
  // visible cluster can move down and toward the driver as one coherent unit.
  const faceplate = mesh(
    roundedBox(0.48, 0.19, 0.025, 0.035),
    parts.materials.matte,
    'RefinedGaugeFaceplate',
    { cast: false },
  );
  faceplate.position.set(tacho.position.x, CLUSTER_Y, CLUSTER_Z - 0.032);
  faceplate.rotation.x = CLUSTER_TILT;
  faceplate.userData.clusterFaceplate = true;
  dashboard.add(faceplate);

  for (const [name, radius] of Object.entries(PRIMARY_GAUGE_RADII)) {
    const holder = interior.getObjectByName(`Gauge_${name}`);
    if (!holder) continue;

    holder.position.y = CLUSTER_Y;
    holder.position.z = CLUSTER_Z;
    holder.rotation.x = CLUSTER_TILT;
    holder.userData.refinedCluster = true;

    // Rebuild the visible can and glass around the moved face. The original
    // static cans remain buried behind the new faceplate and cannot peek through.
    const can = mesh(
      new THREE.CylinderGeometry(radius * 1.05, radius * 1.05, 0.030, 28),
      parts.materials.matte,
      `Refined_${name}_Can`,
      { cast: false },
    );
    can.rotation.x = Math.PI / 2;
    can.position.z = -0.020;
    holder.add(can);

    const bezel = mesh(
      new THREE.TorusGeometry(radius * 1.005, 0.0035, 8, 32),
      parts.materials.blackAlloy,
      `Refined_${name}_Bezel`,
      { cast: false },
    );
    bezel.position.z = 0.002;
    holder.add(bezel);

    const glass = mesh(
      new THREE.CircleGeometry(radius * 0.975, 32),
      parts.materials.glass,
      `Refined_${name}_Glass`,
      { cast: false },
    );
    glass.position.z = 0.012;
    holder.add(glass);

    const blade = holder.getObjectByName(`${name}Blade`);
    if (blade) {
      blade.scale.x *= NEEDLE_WIDTH_SCALE;
      blade.scale.y *= NEEDLE_LENGTH_SCALE;
      blade.position.y *= NEEDLE_LENGTH_SCALE;
      blade.userData.refinedNeedle = true;
      blade.userData.widthScale = NEEDLE_WIDTH_SCALE;
      blade.userData.lengthScale = NEEDLE_LENGTH_SCALE;
    }
  }
}

/**
 * Replace the prototype cage and tune the pieces nearest the player's face.
 * This deliberately leaves physics and the exterior shell untouched.
 */
export function refineCockpit(interior, parts) {
  const oldCage = interior.getObjectByName('RollCage');
  oldCage?.removeFromParent();

  const cage = buildSightlineCage();
  interior.add(cage);
  parts.rollCage = cage;

  refinePrimaryGauges(interior, parts);

  if (parts.steeringWheel) {
    const scale = 0.93;
    parts.steeringWheel.scale.setScalar(scale);
    parts.steeringWheel.position.y -= 0.035;
    parts.steeringWheel.position.z += WHEEL_DRIVER_OFFSET;
    parts.steeringWheelWorldRadius *= scale;
  }

  parts.cockpitMetrics = {
    frontHeader: { ...FRONT_HEADER },
    steeringWheelRadius: parts.steeringWheelWorldRadius,
    steeringWheelDriverOffset: WHEEL_DRIVER_OFFSET,
    clusterY: CLUSTER_Y,
    clusterZ: CLUSTER_Z,
    primaryGaugesVerticallyCentred: true,
    needleWidthScale: NEEDLE_WIDTH_SCALE,
    needleLengthScale: NEEDLE_LENGTH_SCALE,
    clusterVisorRemoved: true,
  };

  return cage;
}
