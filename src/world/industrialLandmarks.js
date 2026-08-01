/** Authored dock and industrial landmarks with audited route clearance. */
import * as THREE from 'three';
import { DRIVEABLE_HALF_WIDTH } from './course.js';
import { makeSignTexture } from './materials.js';

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYLINDER_16 = new THREE.CylinderGeometry(1, 1, 1, 16, 1);
const UNIT_CYLINDER_24 = new THREE.CylinderGeometry(1, 1, 1, 24, 1);
const UNIT_SPHERE = new THREE.SphereGeometry(1, 20, 10);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

function gabledBayGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, 0);
  shape.lineTo(0.5, 0);
  shape.lineTo(0.5, 0.70);
  shape.lineTo(0, 1);
  shape.lineTo(-0.5, 0.70);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 1,
    steps: 1,
    bevelEnabled: false,
  });
  geometry.translate(0, 0, -0.5);
  geometry.computeVertexNormals();
  return geometry;
}

const GABLED_BAY = gabledBayGeometry();

function add(group, geometry, material, name, position, scale, rotation = null) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.position.set(...position);
  object.scale.set(...scale);
  if (rotation) object.rotation.set(...rotation);
  object.receiveShadow = true;
  group.add(object);
  return object;
}

function instances(group, geometry, material, transforms, name) {
  const object = new THREE.InstancedMesh(geometry, material, transforms.length);
  object.name = name;
  object.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  transforms.forEach(({ position, scale, rotation = [0, 0, 0] }, index) => {
    quaternion.setFromEuler(new THREE.Euler(...rotation));
    matrix.compose(new THREE.Vector3(...position), quaternion, new THREE.Vector3(...scale));
    object.setMatrixAt(index, matrix);
  });
  object.instanceMatrix.needsUpdate = true;
  group.add(object);
  return object;
}

function boxes(group, material, transforms, name) {
  return instances(group, UNIT_BOX, material, transforms, name);
}

function cylinderBetween(group, a, b, radius, material, name) {
  const direction = b.clone().sub(a);
  const length = direction.length();
  const object = new THREE.Mesh(UNIT_CYLINDER_16, material);
  object.name = name;
  object.position.copy(a).lerp(b, 0.5);
  object.quaternion.setFromUnitVectors(Y_AXIS, direction.normalize());
  object.scale.set(radius, length, radius);
  group.add(object);
  return object;
}

function industrialMaterials(materials) {
  return {
    steel: new THREE.MeshStandardMaterial({ color: 0x7e8b92, roughness: 0.42, metalness: 0.76 }),
    painted: new THREE.MeshStandardMaterial({ color: 0x49606c, roughness: 0.58, metalness: 0.52 }),
    rust: new THREE.MeshStandardMaterial({ color: 0x6e3d2b, roughness: 0.82, metalness: 0.34 }),
    pipe: new THREE.MeshStandardMaterial({ color: 0xb6a477, roughness: 0.45, metalness: 0.68 }),
    red: new THREE.MeshStandardMaterial({ color: 0xbf342b, roughness: 0.50, metalness: 0.42 }),
    white: new THREE.MeshStandardMaterial({ color: 0xd4d7d2, roughness: 0.58, metalness: 0.28 }),
    window: new THREE.MeshStandardMaterial({
      color: 0xbfe9ff,
      emissive: 0x4abcf4,
      emissiveIntensity: 2.7,
      roughness: 0.2,
    }),
    warehouse: materials.warehouse,
    door: materials.warehouseDoor,
    dark: materials.darkMetal,
    concrete: materials.concreteDark,
  };
}

function makeSawtoothWorks(m) {
  const g = new THREE.Group();
  g.name = 'Industrial_SawtoothWorks';
  g.userData.footprintRadius = 44;

  add(g, UNIT_BOX, m.concrete, 'SawtoothWorksYard', [0, -0.05, 0], [74, 0.18, 46]);

  instances(g, GABLED_BAY, m.warehouse, Array.from({ length: 5 }, (_, bay) => ({
    position: [-25.2 + bay * 12.6, 0, 0],
    scale: [12.4, 12.2, 34],
  })), 'SawtoothFactoryBays');
  add(g, UNIT_BOX, m.concrete, 'SawtoothPlinth', [0, 0.7, 0], [65, 1.4, 36]);

  const doors = [];
  const windows = [];
  for (let bay = 0; bay < 5; bay++) {
    const x = -25.2 + bay * 12.6;
    doors.push({ position: [x, 3.6, 17.15], scale: [8.2, 6.2, 0.20] });
    windows.push({ position: [x, 8.3, 17.28], scale: [8.5, 1.5, 0.16] });
  }
  boxes(g, m.door, doors, 'SawtoothLoadingDoors');
  boxes(g, m.window, windows, 'SawtoothClerestory');

  const vents = [];
  for (const x of [-25, -12.5, 0, 12.5, 25]) {
    vents.push({ position: [x, 13.2, -5], scale: [2.6, 1.6, 3.2] });
  }
  boxes(g, m.dark, vents, 'SawtoothRoofVents');

  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(17, 4.8),
    new THREE.MeshBasicMaterial({
      map: makeSignTexture('IRONWORKS', { sub: 'FOUNDRY 1908', colour: '#ff8b3d' }),
      toneMapped: false,
    })
  );
  sign.name = 'SawtoothWorksSign';
  sign.position.set(0, 12.6, 17.45);
  g.add(sign);
  return g;
}

function makeRefinery(m) {
  const g = new THREE.Group();
  g.name = 'Industrial_RefineryComplex';
  g.userData.footprintRadius = 51;

  add(g, UNIT_BOX, m.concrete, 'RefineryBundYard', [0, -0.05, 2], [74, 0.18, 68]);

  const tankPositions = [[-18, -8, 7.2], [0, -10, 6.0], [18, -7, 7.8], [-10, 13, 5.4], [10, 14, 5.8]];
  const tanks = [];
  const domes = [];
  const tankBands = [];
  for (const [x, z, r] of tankPositions) {
    const height = r * 1.65;
    tanks.push({ position: [x, height / 2, z], scale: [r, height, r] });
    domes.push({ position: [x, height, z], scale: [r * 0.98, r * 0.34, r * 0.98] });
    tankBands.push({ position: [x, height * 0.72, z], scale: [r * 1.02, 0.22, r * 1.02] });
  }
  instances(g, UNIT_CYLINDER_24, m.steel, tanks, 'RefineryStorageTanks');
  instances(g, UNIT_SPHERE, m.steel, domes, 'RefineryTankDomes');
  instances(g, UNIT_CYLINDER_24, m.red, tankBands, 'RefineryTankBands');

  instances(g, UNIT_CYLINDER_16, m.concrete, [-13, 13].map((x) => ({
    position: [x, 26, 22], scale: [1.7, 52, 1.7],
  })), 'RefineryStacks');
  const stackBands = [];
  for (const x of [-13, 13]) for (const y of [34, 40, 46, 52]) {
    stackBands.push({ position: [x, y, 22], scale: [1.78, 1.35, 1.78] });
  }
  instances(g, UNIT_CYLINDER_16, m.red, stackBands, 'RefineryStackBands');

  const rack = [];
  for (const x of [-26, -13, 0, 13, 26]) {
    rack.push({ position: [x, 4.2, 3], scale: [0.46, 8.4, 0.46] });
  }
  for (const y of [3.0, 5.3, 7.5]) rack.push({ position: [0, y, 3], scale: [53, 0.30, 0.35] });
  boxes(g, m.dark, rack, 'RefineryPipeRack');
  for (const y of [3.7, 5.9, 8.1]) {
    cylinderBetween(g, new THREE.Vector3(-26, y, 3), new THREE.Vector3(26, y, 3), 0.22, y > 7 ? m.red : m.pipe, 'RefineryProcessPipe');
  }
  return g;
}

function makePowerStation(m) {
  const g = new THREE.Group();
  g.name = 'Industrial_PowerStation';
  g.userData.footprintRadius = 46;
  add(g, UNIT_BOX, m.concrete, 'PowerStationServiceYard', [0, -0.05, 4], [68, 0.18, 61]);
  add(g, UNIT_BOX, m.rust, 'PowerStationBoilerHall', [0, 10.5, 0], [48, 21, 31]);
  add(g, UNIT_BOX, m.painted, 'PowerStationUpperBoilerHouse', [0, 25.5, -1.5], [33, 9, 24]);
  add(g, UNIT_BOX, m.concrete, 'PowerStationTurbineHall', [0, 5.5, 20], [54, 11, 17]);
  add(g, UNIT_BOX, m.dark, 'PowerStationCornice', [0, 21.2, 0], [50, 1.2, 33]);
  add(g, UNIT_BOX, m.dark, 'PowerStationUpperCornice', [0, 30.4, -1.5], [35, 0.9, 26]);

  const windows = [];
  for (const y of [6.5, 12.0, 17.5]) {
    for (const x of [-19, -12, -5, 5, 12, 19]) {
      windows.push({ position: [x, y, 15.62], scale: [3.8, 2.3, 0.16] });
      windows.push({ position: [x, y, -15.62], scale: [3.8, 2.3, 0.16] });
    }
  }
  boxes(g, m.window, windows, 'PowerStationWindows');

  const buttresses = [];
  for (const x of [-24.2, -16, -8, 0, 8, 16, 24.2]) {
    buttresses.push({ position: [x, 10.5, 15.82], scale: [0.65, 21, 0.55] });
    buttresses.push({ position: [x, 10.5, -15.82], scale: [0.65, 21, 0.55] });
  }
  for (const z of [-10, 0, 10]) {
    buttresses.push({ position: [-24.3, 10.5, z], scale: [0.55, 21, 0.65] });
    buttresses.push({ position: [24.3, 10.5, z], scale: [0.55, 21, 0.65] });
  }
  boxes(g, m.concrete, buttresses, 'PowerStationButtresses');

  instances(g, UNIT_CYLINDER_16, m.white, [-13, 13].map((x) => ({
    position: [x, 30, -6], scale: [2.0, 60, 2.0],
  })), 'PowerStationStacks');
  const stripeTransforms = [];
  for (const x of [-13, 13]) for (const y of [39, 46, 53, 59]) {
    stripeTransforms.push({ position: [x, y, -6], scale: [2.08, 1.8, 2.08] });
  }
  instances(g, UNIT_CYLINDER_16, m.red, stripeTransforms, 'PowerStationStackStripes');

  const ducts = [];
  for (const x of [-12, -4, 4, 12]) ducts.push({ position: [x, 34.0, -2], scale: [5.2, 4.6, 6.0] });
  boxes(g, m.painted, ducts, 'PowerStationRoofDucts');
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 4.5),
    new THREE.MeshBasicMaterial({
      map: makeSignTexture('NORTH GRID', { sub: 'POWER & LIGHT', colour: '#ffd256' }),
      toneMapped: false,
    })
  );
  sign.name = 'PowerStationSign';
  sign.position.set(0, 18.3, 15.95);
  g.add(sign);
  return g;
}

function place(route, group, { u, side, offset }) {
  const frame = route.atDistance(u * route.length);
  const radius = group.userData.footprintRadius;
  let distance = offset;
  let position;
  let road;
  for (let attempt = 0; attempt < 14; attempt++) {
    position = route.pointAt(u * route.length, side * distance, 0);
    position.y = 0;
    road = route.nearest(position.x, position.z);
    if (road.distanceToCentre >= DRIVEABLE_HALF_WIDTH + radius + 6) break;
    distance += 7;
  }
  if (!road || road.distanceToCentre < DRIVEABLE_HALF_WIDTH + radius + 6) return null;
  group.position.copy(position);
  group.rotation.y = Math.atan2(frame.center.x - position.x, frame.center.z - position.z);
  return {
    kind: group.name,
    x: position.x,
    z: position.z,
    radius,
    requiredGap: DRIVEABLE_HALF_WIDTH + 6,
  };
}

export function buildIndustrialLandmarks(route, materials) {
  const root = new THREE.Group();
  root.name = 'IndustrialLandmarks';
  const m = industrialMaterials(materials);
  const definitions = [
    { object: makeSawtoothWorks(m), u: 0.115, side: -1, offset: 59 },
    { object: makeRefinery(m), u: 0.175, side: 1, offset: 72 },
    { object: makePowerStation(m), u: 0.215, side: -1, offset: 88 },
  ];
  const footprints = [];
  for (const definition of definitions) {
    const footprint = place(route, definition.object, definition);
    if (!footprint) continue;
    root.add(definition.object);
    footprints.push(footprint);
  }
  root.userData.roadClearanceFootprints = footprints;
  return { object: root, footprints };
}
