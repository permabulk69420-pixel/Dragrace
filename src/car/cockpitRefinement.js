import * as THREE from 'three';
import { group, mesh, mergeStatic, tube } from './geom.js';

const FRONT_HEADER = Object.freeze({ x: 0, y: 1.345, z: -0.325 });
const CAGE_RADIUS = 0.026;

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

    // Front legs sit against the actual windscreen edges rather than beside the
    // driver's face. The old cage put their upper joint only 13 cm ahead of the
    // eye point, which made the header dominate the entire VR view.
    add([
      [side * 0.665, 1.335, -0.315],
      [side * 0.725, 1.190, -0.465],
      [side * 0.785, 0.985, -0.625],
      [side * 0.790, 0.410, -0.640],
      [side * 0.760, 0.335, -0.590],
    ], `FrontLeg_${suffix}`);

    // Main hoop follows the B-pillar and stays behind the driver's head.
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

    // Door protection remains substantial but is kept below elbow height so it
    // does not turn normal head movement into a wall of tubing.
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

  // The front header now hugs the roof edge, roughly 44 cm from the revised eye
  // point, instead of floating directly in front of the player's forehead.
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

  // Keep the compact wheel low enough to see the gauges, but bring it a small
  // amount toward the driver instead of pushing it deeper into the dashboard.
  if (parts.steeringWheel) {
    const scale = 0.93;
    parts.steeringWheel.scale.setScalar(scale);
    parts.steeringWheel.position.y -= 0.035;
    parts.steeringWheel.position.z += 0.015;
    parts.steeringWheelWorldRadius *= scale;
  }

  parts.cockpitMetrics = {
    frontHeader: { ...FRONT_HEADER },
    steeringWheelRadius: parts.steeringWheelWorldRadius,
    steeringWheelDriverOffset: 0.015,
    mainClusterDrop: 0.025,
    clusterVisorRemoved: true,
  };

  return cage;
}
