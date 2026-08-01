import * as THREE from 'three';
import { group, mesh, mergeStatic, tube } from './geom.js';

const FRONT_HEADER = Object.freeze({ x: 0, y: 1.345, z: -0.325 });
const CAGE_RADIUS = 0.026;
const WHEEL_DRIVER_OFFSET = 0.035;

// The original cluster was baked into Dashboard_MatteBlack and Dashboard_Glass.
// This box isolates only that pod/can/glass region, leaving the suede dash skin,
// vents, mirror and centre-console hardware untouched.
const PRIMARY_CLUSTER_BOX = new THREE.Box3(
  new THREE.Vector3(-0.65, 0.89, -0.68),
  new THREE.Vector3(-0.10, 1.11, -0.43),
);

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

function removeTrianglesInsideBox(target, box) {
  const geometry = target.geometry;
  const position = geometry?.getAttribute('position');
  if (!position) return 0;

  const sourceIndex = geometry.getIndex();
  const indices = sourceIndex
    ? Array.from(sourceIndex.array)
    : Array.from({ length: position.count }, (_, index) => index);

  const kept = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  let removed = 0;

  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i];
    const ib = indices[i + 1];
    const ic = indices[i + 2];
    a.fromBufferAttribute(position, ia);
    b.fromBufferAttribute(position, ib);
    c.fromBufferAttribute(position, ic);
    centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3);

    if (box.containsPoint(centroid)) {
      removed++;
    } else {
      kept.push(ia, ib, ic);
    }
  }

  if (removed > 0) {
    geometry.setIndex(kept);
    geometry.clearGroups();
    geometry.setDrawRange(0, kept.length);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }

  return removed;
}

function removePrimaryGaugeAssembly(interior, parts) {
  const dashboard = interior.getObjectByName('Dashboard');
  let strippedTriangles = 0;

  if (dashboard) {
    dashboard.traverse((object) => {
      if (!object.isMesh) return;
      const materialName = object.material?.name;
      if (materialName === 'MatteBlack' || materialName === 'Glass') {
        strippedTriangles += removeTrianglesInsideBox(object, PRIMARY_CLUSTER_BOX);
      }
    });
  }

  // These groups contain the three faces, needles and hubs that were deliberately
  // kept separate from the baked dashboard so they could animate.
  for (const name of ['tacho', 'speedo', 'boost']) {
    interior.getObjectByName(`Gauge_${name}`)?.removeFromParent();
    delete parts.needles[name];
  }

  // Defensive cleanup for the short-lived refinement pass. New builds no longer
  // create these, but this prevents accidental duplication during hot reloads.
  for (const name of ['RefinedGaugeFaceplate', 'Refined_tacho_Can', 'Refined_speedo_Can', 'Refined_boost_Can']) {
    interior.getObjectByName(name)?.removeFromParent();
  }

  return strippedTriangles;
}

/**
 * Replace the prototype cage, preserve the revised wheel position, and remove
 * the temporary procedural instrument cluster so the raw dash is available for
 * future GLB instruments.
 */
export function refineCockpit(interior, parts) {
  const oldCage = interior.getObjectByName('RollCage');
  oldCage?.removeFromParent();

  const cage = buildSightlineCage();
  interior.add(cage);
  parts.rollCage = cage;

  const strippedDashboardTriangles = removePrimaryGaugeAssembly(interior, parts);

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
    primaryGaugeClusterRemoved: true,
    strippedDashboardTriangles,
    rawDashReadyForGlbInstruments: true,
  };

  return cage;
}
