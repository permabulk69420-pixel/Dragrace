/**
 * Authored architectural landmarks for Midnight Circuit.
 *
 * These are deliberately built as recognisable structures rather than another
 * random-box scatter. Each kit has a different silhouette, façade rhythm and
 * rooftop language, and every placement is footprint-audited against the full
 * route before it is admitted to the world.
 */
import * as THREE from 'three';
import { DRIVEABLE_HALF_WIDTH } from './course.js';
import { makeSignTexture } from './materials.js';

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYLINDER_12 = new THREE.CylinderGeometry(1, 1, 1, 12, 1);
const UNIT_CYLINDER_24 = new THREE.CylinderGeometry(1, 1, 1, 24, 1);
const UNIT_CONE_16 = new THREE.ConeGeometry(1, 1, 16, 1);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

function part(group, geometry, material, name, position, scale, rotation = null) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.position.set(...position);
  object.scale.set(...scale);
  if (rotation) object.rotation.set(...rotation);
  object.receiveShadow = true;
  group.add(object);
  return object;
}

function instancedBoxes(group, material, transforms, name) {
  const object = new THREE.InstancedMesh(UNIT_BOX, material, transforms.length);
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

function signMaterial(text, sub, colour) {
  return new THREE.MeshBasicMaterial({
    map: makeSignTexture(text, { sub, colour, width: 1024, height: 384 }),
    toneMapped: false,
  });
}

function architecturalMaterials(materials) {
  const blueGlass = materials.buildingGlass.clone();
  blueGlass.name = 'LandmarkBlueGlass';
  blueGlass.color.set(0x8bb8c9);
  blueGlass.emissiveIntensity = 0.42;
  blueGlass.roughness = 0.28;
  blueGlass.metalness = 0.38;

  const smokeGlass = materials.buildingGlass.clone();
  smokeGlass.name = 'LandmarkSmokeGlass';
  smokeGlass.color.set(0x71808d);
  smokeGlass.emissiveIntensity = 0.30;
  smokeGlass.roughness = 0.36;

  const limestone = materials.buildingConcrete.clone();
  limestone.name = 'LandmarkLimestone';
  limestone.color.set(0xc4b39d);
  limestone.emissiveIntensity = 0.30;

  const brick = materials.buildingBrick.clone();
  brick.name = 'LandmarkBrick';
  brick.color.set(0xa76650);
  brick.emissiveIntensity = 0.36;

  return {
    blueGlass,
    smokeGlass,
    limestone,
    brick,
    trim: new THREE.MeshStandardMaterial({ color: 0xb9c2c7, roughness: 0.32, metalness: 0.72 }),
    darkTrim: new THREE.MeshStandardMaterial({ color: 0x151a20, roughness: 0.45, metalness: 0.68 }),
    warmWindow: new THREE.MeshStandardMaterial({
      color: 0xffd7a0,
      emissive: 0xff8a32,
      emissiveIntensity: 3.2,
      roughness: 0.22,
    }),
    coolWindow: new THREE.MeshStandardMaterial({
      color: 0xb8e9ff,
      emissive: 0x45bfff,
      emissiveIntensity: 3.0,
      roughness: 0.2,
    }),
    neonPink: new THREE.MeshBasicMaterial({ color: 0xff4ac8, toneMapped: false }),
    neonCyan: new THREE.MeshBasicMaterial({ color: 0x4de4ff, toneMapped: false }),
    copper: new THREE.MeshStandardMaterial({ color: 0x705647, roughness: 0.43, metalness: 0.66 }),
    plaza: materials.concrete,
  };
}

function makeArtDecoTower(m) {
  const g = new THREE.Group();
  g.name = 'Landmark_ArtDecoHotel';
  g.userData.footprintRadius = 21;

  part(g, UNIT_BOX, m.plaza, 'HotelPlaza', [0, -0.05, 1.5], [41, 0.18, 33]);

  part(g, UNIT_BOX, m.limestone, 'HotelPodium', [0, 3.2, 0], [28, 6.4, 19]);
  part(g, UNIT_CYLINDER_12, m.limestone, 'HotelMainTower', [0, 30, 0], [10.5, 47, 7.4]);
  part(g, UNIT_CYLINDER_12, m.limestone, 'HotelUpperSetback', [0, 58.5, 0], [7.8, 10, 5.7]);
  part(g, UNIT_BOX, m.copper, 'HotelCrown', [0, 66, 0], [11.2, 5.2, 8.4]);
  part(g, UNIT_BOX, m.darkTrim, 'HotelEntrance', [0, 3.1, 9.68], [8.2, 4.7, 0.45]);
  part(g, UNIT_BOX, m.trim, 'HotelCanopy', [0, 5.2, 11.4], [10.5, 0.34, 3.8]);

  const fins = [];
  for (const x of [-8, -4, 0, 4, 8]) {
    fins.push({ position: [x, 28, 7.55], scale: [0.30, 41, 0.42] });
    fins.push({ position: [x, 28, -7.55], scale: [0.30, 41, 0.42] });
  }
  for (const x of [-5.5, 0, 5.5]) {
    fins.push({ position: [x, 61.5, 5.82], scale: [0.24, 9.5, 0.34] });
  }
  instancedBoxes(g, m.trim, fins, 'HotelVerticalFins');

  instancedBoxes(g, m.darkTrim, [9, 17, 43, 53, 63].map((y) => ({
    position: [0, y, 0],
    scale: [22.0 - Math.max(0, y - 43) * 0.20, 0.26, 15.4 - Math.max(0, y - 43) * 0.13],
  })), 'HotelShadowLedges');

  const crownGlow = part(g, UNIT_BOX, m.warmWindow, 'HotelCrownGlow', [0, 66.2, 4.25], [7.8, 2.2, 0.18]);
  crownGlow.castShadow = false;
  part(g, UNIT_CYLINDER_12, m.trim, 'HotelSpire', [0, 72.7, 0], [0.16, 8.5, 0.16]);
  part(g, UNIT_PLANE, signMaterial('VESPER', 'HOTEL', '#ffb14a'), 'HotelSign', [0, 8.8, 9.93], [10.2, 3.1, 1]);
  return g;
}

function makeArcTower(m) {
  const g = new THREE.Group();
  g.name = 'Landmark_CurvedGlassTower';
  g.userData.footprintRadius = 21;
  part(g, UNIT_BOX, m.plaza, 'ArcTowerPlaza', [0, -0.05, 0], [40, 0.18, 34]);
  part(g, UNIT_BOX, m.darkTrim, 'ArcTowerPodium', [0, 2.8, 0], [30, 5.6, 20]);
  part(g, UNIT_CYLINDER_24, m.blueGlass, 'ArcTowerBody', [0, 33, 0], [13.6, 61, 9.4]);
  part(g, UNIT_CYLINDER_24, m.smokeGlass, 'ArcTowerCrown', [0, 66.5, 0], [10.4, 6, 7.2]);

  const rings = [];
  for (let y = 8; y < 64; y += 5.2) {
    rings.push({ position: [0, y, 0], scale: [27.7, 0.16, 19.3] });
  }
  instancedBoxes(g, m.trim, rings, 'ArcTowerFloorBands');
  instancedBoxes(g, m.darkTrim, [-9.4, -4.7, 0, 4.7, 9.4].map((x) => ({
    position: [x, 34, 9.55], scale: [0.22, 58, 0.28],
  })), 'ArcTowerMullions');
  part(g, UNIT_CYLINDER_24, m.coolWindow, 'ArcTowerHalo', [0, 70.2, 0], [10.8, 0.34, 7.6]);
  part(g, UNIT_CYLINDER_12, m.trim, 'ArcTowerAntenna', [0, 76, 0], [0.13, 11.5, 0.13]);
  part(g, UNIT_PLANE, signMaterial('ORBIT', 'TECH PLAZA', '#4de4ff'), 'ArcTowerSign', [0, 5.2, 10.08], [10.5, 3.0, 1]);
  return g;
}

function makeParkingGarage(m) {
  const g = new THREE.Group();
  g.name = 'Landmark_ParkingStructure';
  g.userData.footprintRadius = 24;
  part(g, UNIT_BOX, m.plaza, 'GarageForecourt', [0, -0.05, 0], [47, 0.18, 37]);
  part(g, UNIT_BOX, m.darkTrim, 'GarageInterior', [0, 11.5, 0], [34, 22, 23]);

  const slabs = [];
  const rails = [];
  for (let level = 0; level <= 7; level++) {
    const y = 0.65 + level * 3.2;
    slabs.push({ position: [0, y, 0], scale: [36, 0.42, 25] });
    if (level > 0) rails.push({ position: [0, y + 1.1, 12.55], scale: [36, 0.34, 0.28] });
  }
  instancedBoxes(g, m.limestone, slabs, 'GarageFloorSlabs');
  instancedBoxes(g, m.trim, rails, 'GarageFacadeRails');

  const columns = [];
  for (const x of [-15.8, -8, 0, 8, 15.8]) {
    for (const z of [-11.2, 11.2]) columns.push({ position: [x, 11.5, z], scale: [0.55, 22, 0.55] });
  }
  instancedBoxes(g, m.limestone, columns, 'GarageColumns');
  part(g, UNIT_BOX, m.blueGlass, 'GarageStairCore', [-12.8, 16.5, -6.2], [6.4, 31, 7.4]);
  part(g, UNIT_BOX, m.trim, 'GarageRampA', [-2.4, 6.4, 12.0], [20, 0.40, 3.1], [0, 0, -0.15]);
  part(g, UNIT_BOX, m.trim, 'GarageRampB', [5.0, 14.8, 12.0], [20, 0.40, 3.1], [0, 0, 0.15]);
  part(g, UNIT_PLANE, signMaterial('PARK', '24 HOURS', '#62d8ff'), 'GarageSign', [10.8, 17, 12.82], [10, 3.5, 1]);
  return g;
}

function makeBrickLoft(m) {
  const g = new THREE.Group();
  g.name = 'Landmark_BrickLoft';
  g.userData.footprintRadius = 25;
  part(g, UNIT_BOX, m.plaza, 'LoftCourtyard', [0, -0.05, 1], [49, 0.18, 39]);
  part(g, UNIT_BOX, m.brick, 'LoftMainBlock', [0, 10.5, 0], [38, 21, 23]);
  part(g, UNIT_BOX, m.limestone, 'LoftStoneBase', [0, 1.15, 0], [39, 2.3, 24]);
  part(g, UNIT_BOX, m.copper, 'LoftCornice', [0, 21.4, 0], [40.5, 1.05, 25.4]);

  const windows = [];
  for (const y of [5.2, 10.6, 16.0]) {
    for (const x of [-15.2, -9.1, -3.0, 3.0, 9.1, 15.2]) {
      windows.push({ position: [x, y, 11.62], scale: [3.6, 3.25, 0.16] });
    }
  }
  instancedBoxes(g, m.warmWindow, windows, 'LoftArchedWindows');

  const platforms = [];
  for (const y of [6.8, 12.2, 17.6]) {
    platforms.push({ position: [14.2, y, 12.35], scale: [6.2, 0.22, 1.55] });
    platforms.push({ position: [16.9, y + 1.5, 12.55], scale: [0.18, 3.0, 1.7], rotation: [0, 0, -0.45] });
  }
  instancedBoxes(g, m.darkTrim, platforms, 'LoftFireEscapes');

  part(g, UNIT_CYLINDER_12, m.copper, 'LoftWaterTank', [-8.5, 27.8, -2.0], [4.1, 8.5, 4.1]);
  part(g, UNIT_CONE_16, m.copper, 'LoftTankRoof', [-8.5, 32.7, -2.0], [4.5, 2.2, 4.5]);
  const tankLegs = [];
  for (const x of [-10.6, -6.4]) for (const z of [-4.1, 0.1]) {
    tankLegs.push({ position: [x, 22.9, z], scale: [0.28, 4.0, 0.28] });
  }
  instancedBoxes(g, m.darkTrim, tankLegs, 'LoftTankLegs');
  part(g, UNIT_PLANE, signMaterial('RIVET', 'LOFTS', '#ff8752'), 'LoftSign', [-8.0, 19.0, 11.81], [10.0, 3.1, 1]);
  return g;
}

function makeTwinTower(m) {
  const g = new THREE.Group();
  g.name = 'Landmark_TwinTowerSkybridge';
  g.userData.footprintRadius = 29;
  part(g, UNIT_BOX, m.plaza, 'TwinTowerPlaza', [0, -0.05, 1], [57, 0.18, 40]);
  part(g, UNIT_BOX, m.darkTrim, 'TwinTowerPodium', [0, 3.2, 0], [42, 6.4, 22]);
  part(g, UNIT_BOX, m.smokeGlass, 'TwinTowerWest', [-10.5, 30, 0], [16, 53, 15]);
  part(g, UNIT_BOX, m.blueGlass, 'TwinTowerEast', [10.5, 36, 0], [16, 65, 15]);
  part(g, UNIT_BOX, m.blueGlass, 'TwinTowerBridge', [0, 31, 0], [10.8, 6.2, 11]);
  part(g, UNIT_BOX, m.trim, 'TwinTowerWestCrown', [-10.5, 57.3, 0], [17.2, 1.6, 16.2]);
  part(g, UNIT_BOX, m.trim, 'TwinTowerEastCrown', [10.5, 69.3, 0], [17.2, 1.6, 16.2]);
  const bands = [];
  for (const x of [-10.5, 10.5]) {
    const max = x < 0 ? 54 : 66;
    for (let y = 10; y < max; y += 6) bands.push({ position: [x, y, 7.62], scale: [16.5, 0.18, 0.22] });
  }
  instancedBoxes(g, m.trim, bands, 'TwinTowerBands');
  part(g, UNIT_PLANE, signMaterial('AXIOM', 'WORLD HQ', '#9b7cff'), 'TwinTowerSign', [0, 31, 5.63], [8.8, 3.0, 1]);
  return g;
}

function makeNeonGarage(m, materials) {
  const g = new THREE.Group();
  g.name = 'Landmark_TunerGarage';
  g.userData.footprintRadius = 26;
  part(g, UNIT_BOX, m.plaza, 'TunerGarageForecourt', [0, -0.05, 3], [51, 0.18, 39]);
  part(g, UNIT_BOX, materials.warehouse, 'TunerGarageHall', [0, 4.7, 0], [41, 9.4, 22]);
  part(g, UNIT_BOX, m.darkTrim, 'TunerGarageParapet', [0, 9.7, 0], [42.5, 1.1, 23.5]);

  const bays = [];
  for (const x of [-14.5, -7.2, 0, 7.2, 14.5]) {
    bays.push({ position: [x, 4.0, 11.14], scale: [5.8, 6.6, 0.20] });
  }
  instancedBoxes(g, materials.warehouseDoor, bays, 'TunerGarageBays');
  part(g, UNIT_BOX, m.darkTrim, 'TunerGarageCanopy', [0, 7.7, 13.0], [38, 0.34, 4.2]);
  part(g, UNIT_BOX, m.neonCyan, 'TunerGarageNeonCyan', [0, 8.1, 13.18], [36, 0.11, 0.08]);
  part(g, UNIT_BOX, m.neonPink, 'TunerGarageNeonPink', [0, 7.75, 13.18], [25, 0.09, 0.08]);
  part(g, UNIT_PLANE, signMaterial('REDLINE', 'TUNING & DYNO', '#ff4b45'), 'TunerGarageSign', [0, 11.5, 11.84], [17.5, 4.5, 1]);

  const roofUnits = [];
  for (const x of [-13, -4.5, 5, 14]) roofUnits.push({ position: [x, 11.0, -2], scale: [4.2, 2.0, 3.6] });
  instancedBoxes(g, materials.roof, roofUnits, 'TunerGarageRoofUnits');
  return g;
}

function makeBroadcastTower(m) {
  const g = new THREE.Group();
  g.name = 'Landmark_BroadcastTower';
  g.userData.footprintRadius = 18;
  part(g, UNIT_BOX, m.plaza, 'BroadcastTowerPlaza', [0, -0.05, 0], [35, 0.18, 35]);
  part(g, UNIT_CYLINDER_12, m.smokeGlass, 'BroadcastBase', [0, 25, 0], [10, 48, 10]);
  part(g, UNIT_CYLINDER_12, m.blueGlass, 'BroadcastCrown', [0, 53, 0], [13.5, 8, 13.5]);
  part(g, UNIT_CYLINDER_24, m.coolWindow, 'BroadcastObservationRing', [0, 57.2, 0], [14.2, 0.55, 14.2]);
  part(g, UNIT_CONE_16, m.darkTrim, 'BroadcastRoof', [0, 63.2, 0], [10.8, 7.0, 10.8]);
  part(g, UNIT_CYLINDER_12, m.trim, 'BroadcastMast', [0, 78, 0], [0.22, 28, 0.22]);
  const mastBands = [];
  for (const y of [68, 74, 80, 86]) mastBands.push({ position: [0, y, 0], scale: [3.6, 0.18, 3.6] });
  instancedBoxes(g, m.neonCyan, mastBands, 'BroadcastMastBeacons');
  part(g, UNIT_PLANE, signMaterial('PULSE', 'FM 99.7', '#51e5ff'), 'BroadcastSign', [0, 54, 13.58], [10.5, 3.1, 1]);
  return g;
}

function clearanceAt(route, x, z, radius, margin = 5.5) {
  const road = route.nearest(x, z);
  const requiredGap = DRIVEABLE_HALF_WIDTH + radius + margin;
  return { ok: road.distanceToCentre >= requiredGap, requiredGap, road };
}

function placeLandmark(route, group, { u, side, offset, scale = 1 }) {
  const frame = route.atDistance(u * route.length);
  const radius = group.userData.footprintRadius * scale;
  let resolvedOffset = offset;
  let position;
  let clearance;
  for (let attempt = 0; attempt < 12; attempt++) {
    position = route.pointAt(u * route.length, side * resolvedOffset, 0);
    position.y = 0;
    clearance = clearanceAt(route, position.x, position.z, radius);
    if (clearance.ok) break;
    resolvedOffset += 6;
  }
  if (!clearance?.ok) return null;

  group.position.copy(position);
  group.rotation.y = Math.atan2(frame.center.x - position.x, frame.center.z - position.z);
  group.scale.setScalar(scale);
  group.userData.placement = { u, side, offset: resolvedOffset };
  return {
    kind: group.name,
    x: position.x,
    z: position.z,
    radius,
    requiredGap: DRIVEABLE_HALF_WIDTH + 5.5,
  };
}

export function buildArchitecturalLandmarks(route, materials) {
  const root = new THREE.Group();
  root.name = 'ArchitecturalLandmarks';
  const m = architecturalMaterials(materials);
  const definitions = [
    { build: () => makeNeonGarage(m, materials), u: 0.075, side: 1, offset: 43, scale: 1.00 },
    { build: () => makeBroadcastTower(m), u: 0.475, side: 1, offset: 60, scale: 1.00 },
    { build: () => makeArtDecoTower(m), u: 0.525, side: -1, offset: 48, scale: 1.00 },
    { build: () => makeParkingGarage(m), u: 0.565, side: 1, offset: 45, scale: 0.96 },
    { build: () => makeArcTower(m), u: 0.615, side: 1, offset: 54, scale: 1.00 },
    { build: () => makeTwinTower(m), u: 0.665, side: -1, offset: 62, scale: 1.00 },
    { build: () => makeBrickLoft(m), u: 0.865, side: -1, offset: 46, scale: 1.00 },
    { build: () => makeParkingGarage(m), u: 0.905, side: 1, offset: 47, scale: 0.82 },
    { build: () => makeArtDecoTower(m), u: 0.935, side: -1, offset: 52, scale: 0.76 },
    { build: () => makeArcTower(m), u: 0.975, side: 1, offset: 58, scale: 0.72 },
  ];

  const footprints = [];
  for (const definition of definitions) {
    const landmark = definition.build();
    const footprint = placeLandmark(route, landmark, definition);
    if (!footprint) continue;
    root.add(landmark);
    footprints.push(footprint);
  }
  root.userData.roadClearanceFootprints = footprints;
  return { object: root, footprints, materials: m };
}
