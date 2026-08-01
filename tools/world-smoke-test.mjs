/**
 * Headless construction audit for the browser-generated world.  A tiny canvas
 * mock is enough for CanvasTexture creation and catches runtime/geometry errors
 * without needing Chromium or a GPU in CI.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class CanvasMock {
  constructor() {
    this.width = 300;
    this.height = 150;
    this.style = {};
  }

  getContext() {
    const gradient = { addColorStop() {} };
    const functions = {
      createLinearGradient: () => gradient,
      createRadialGradient: () => gradient,
      getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
      putImageData() {},
      measureText: (text) => ({ width: String(text).length * 10 }),
    };
    return new Proxy(functions, {
      get(target, property) {
        if (property in target) return target[property];
        return () => {};
      },
      set(target, property, value) {
        target[property] = value;
        return true;
      },
    });
  }
}

globalThis.document = {
  createElement: (tag) => tag === 'canvas' ? new CanvasMock() : { style: {} },
};

const THREE = await import(path.join(root, 'node_modules/three/build/three.module.js'));
const { buildTrack } = await import(path.join(root, 'src/world/track.js'));

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` - ${detail}` : ''}`);
  if (!ok) failures++;
};

const track = buildTrack();
track.object.updateMatrixWorld(true);
track.startLights.apply({ red: false, amber: true, green: false });
track.scoreboard.draw({
  title: 'WORLD TEST',
  cells: [['LAP', '0:00.000'], ['SECTOR', '--'], ['PROGRESS', '0%'], ['SPEED', '0 MPH']],
});
track.update(1.25, track.spawn.position);

check('world root constructed', track.object.name === 'MidnightCircuitWorld');
check('spawn and surface contract agree',
  Math.abs(track.surfaceAt(track.spawn.position.x, track.spawn.position.z).lateral) < 0.1);

for (const name of [
  'CourseAsphalt', 'CourseShoulders', 'StartFinishGantry', 'HarbourTunnelShell',
  'CityBuildings', 'ShippingContainers', 'ViaductPillars', 'StreetLightPoles',
  'TunnelLights', 'CircuitScoreboard', 'ViaductUnderside', 'ViaductGirderWeb_1',
  'TunnelArchRibs', 'AsphaltRepairs', 'AmberLaneReflectors', 'ChainLinkFence_1',
  'ChamferedTowers', 'SetbackTowers', 'RoundCornerTowers', 'GabledWarehouses',
  'WarehouseLoadingDoors', 'UnderdeckLights', 'BarrierImpactSparks',
  'TrafficSignalHousings', 'TunnelPortalConcrete', 'IndustrialSmokestacks',
  'FarMountainRidge', 'NearMountainRidge', 'GuardrailPosts',
  'ArchitecturalLandmarks', 'IndustrialLandmarks', 'Landmark_ArtDecoHotel',
  'Landmark_CurvedGlassTower', 'Landmark_ParkingStructure',
  'Industrial_SawtoothWorks', 'Industrial_RefineryComplex',
]) {
  check(`world node ${name}`, !!track.object.getObjectByName(name));
}

check('bad street-front filler is completely removed',
  !track.object.getObjectByName('StreetFrontBuildings') &&
  !track.object.getObjectByName('ShopAwnings') &&
  !track.object.getObjectByName('LitShopfronts'));

check('road-overlapping low-quality tree generator is removed',
  !track.object.getObjectByName('BoulevardTreeTrunks') &&
  !track.object.getObjectByName('BoulevardTreeCrowns'));

check('pyramid mountain primitives are removed',
  !track.object.getObjectByName('Hills'));

const towerFamilies = [
  'ChamferedTowers', 'SetbackTowers', 'RoundCornerTowers',
  'CrownedOfficeTowers', 'SlabHotels',
]
  .map((name) => track.object.getObjectByName(name));
const towerCount = towerFamilies.reduce((sum, family) => sum + family.count, 0);
check('skyline uses fewer background buildings across varied silhouettes',
  towerCount >= 90 && towerCount <= 120 &&
  new Set(towerFamilies.map((family) => family.geometry.uuid)).size === 5,
  `${towerCount} background buildings across 5 silhouette families`);

const courseScenery = track.object.getObjectByName('CourseScenery');
const clearanceFootprints = courseScenery.userData.roadClearanceFootprints ?? [];
const clearanceViolations = clearanceFootprints.filter((footprint) => {
  const nearest = track.route.nearest(footprint.x, footprint.z);
  return nearest.distanceToCentre - footprint.radius < footprint.requiredGap - 0.001;
});
check('every large scenery footprint clears the carriageway',
  clearanceFootprints.length > 100 && clearanceViolations.length === 0,
  `${clearanceFootprints.length} audited footprints, ${clearanceViolations.length} violations`);

const underside = track.object.getObjectByName('ViaductUnderside');
const undersideNormals = underside.geometry.getAttribute('normal');
check('overpass soffit has downward-facing normals',
  Array.from(undersideNormals.array).some((_value, index, values) => index % 3 === 1 && values[index] < -0.65));

const barrierDistance = track.route.length * 0.34;
const barrierFrame = track.route.atDistance(barrierDistance);
const barrierOutward = new THREE.Vector3(barrierFrame.right.x, 0, barrierFrame.right.z).normalize();
const barrierStart = track.route.pointAt(barrierDistance, 9.4, 0);
const barrierVehicle = {
  x: barrierStart.x,
  z: barrierStart.z,
  heading: Math.atan2(-barrierOutward.x, -barrierOutward.z),
  speed: 32,
  accel: 4,
  lateralAccel: 8,
};
track.resetCollisions();
const barrierHit = track.resolveVehicle(barrierVehicle, barrierDistance, 1 / 90);
const correctedTravel = new THREE.Vector3(
  -Math.sin(barrierVehicle.heading),
  0,
  -Math.cos(barrierVehicle.heading)
);
check('visible roadside barriers resolve vehicle penetration',
  barrierHit.collided && Math.abs(barrierHit.road.lateral) < 7.4,
  `${barrierHit.zone?.kind ?? 'none'} at ${barrierHit.road.lateral.toFixed(2)} m`);
check('barrier impact deflects inward and scrubs speed',
  correctedTravel.dot(barrierOutward) < 0 && barrierVehicle.speed < 32,
  `${barrierVehicle.speed.toFixed(1)} m/s after hit`);

const openDistance = track.route.length * 0.625;
const openPosition = track.route.pointAt(openDistance, 11.5, 0);
const openFrame = track.route.atDistance(openDistance);
const openOutward = new THREE.Vector3(openFrame.right.x, 0, openFrame.right.z).normalize();
const openVehicle = {
  x: openPosition.x,
  z: openPosition.z,
  heading: Math.atan2(-openOutward.x, -openOutward.z),
  speed: 20,
};
track.resetCollisions();
const openRoad = track.resolveVehicle(openVehicle, openDistance, 1 / 90);
check('formerly open street edge now has visible physical guardrail collision',
  openRoad.collided && openRoad.zone?.kind === 'guardrail' && Math.abs(openRoad.road.lateral) > 7,
  `${openRoad.zone?.kind ?? 'none'} contact at ${openRoad.road.lateral.toFixed(2)} m, not road centre`);

let uncoveredSamples = 0;
for (let i = 0; i < 200; i++) {
  const distance = track.route.length * ((i + 0.5) / 200);
  const frame = track.route.atDistance(distance);
  const position = track.route.pointAt(distance, 12.0, 0);
  const outward = new THREE.Vector3(frame.right.x, 0, frame.right.z).normalize();
  const vehicle = {
    x: position.x,
    z: position.z,
    heading: Math.atan2(-outward.x, -outward.z),
    speed: 18,
  };
  track.resetCollisions();
  if (!track.resolveVehicle(vehicle, distance, 1 / 90).collided) uncoveredSamples++;
}
check('visible edge collision covers the complete lap', uncoveredSamples === 0,
  `${uncoveredSamples} uncovered samples`);

const tunnelDistance = track.route.length * 0.75;
const tunnelFrame = track.route.atDistance(tunnelDistance);
const tunnelOutward = new THREE.Vector3(tunnelFrame.right.x, 0, tunnelFrame.right.z).normalize();
const tunnelStart = track.route.pointAt(tunnelDistance, 9.8, 0);
const tunnelVehicle = {
  x: tunnelStart.x,
  z: tunnelStart.z,
  heading: Math.atan2(-tunnelOutward.x, -tunnelOutward.z),
  speed: 24,
};
track.resetCollisions();
const tunnelHit = track.resolveVehicle(tunnelVehicle, tunnelDistance, 1 / 90);
check('harbour tunnel walls collide', tunnelHit.collided && tunnelHit.zone?.kind === 'tunnel');

let draws = 0;
let triangles = 0;
let instances = 0;
let finite = true;
const invalidNodes = [];
const matrix = new THREE.Matrix4();
track.object.traverse((object) => {
  if (!object.isMesh) return;
  draws++;
  const position = object.geometry?.attributes?.position;
  if (!position || Array.from(position.array).some((value) => !Number.isFinite(value))) {
    finite = false;
    invalidNodes.push(`${object.name}:geometry`);
  }
  const index = object.geometry?.getIndex();
  const baseTriangles = (index ? index.count : position?.count ?? 0) / 3;
  const multiplier = object.isInstancedMesh ? object.count : 1;
  triangles += baseTriangles * multiplier;
  if (object.isInstancedMesh) {
    instances += object.count;
    for (let i = 0; i < object.count; i++) {
      object.getMatrixAt(i, matrix);
      if (matrix.elements.some((value) => !Number.isFinite(value))) {
        finite = false;
        invalidNodes.push(`${object.name}:instance-${i}`);
      }
    }
  }
});

check('world geometry contains only finite values', finite, invalidNodes.slice(0, 5).join(', '));
check('world draw calls stay bounded after the landmark upgrade', draws < 290, `${draws} mesh draws`);
check('world triangle load stays practical', triangles < 450000, `${Math.round(triangles).toLocaleString()} rendered tris`);
check('repeated scenery is instanced', instances > 500, `${instances.toLocaleString()} instances`);
check('world remains bounded enough to combine with existing car', draws + 164 < 460, `${draws + 164} estimated total draws`);

console.log(failures ? `\n${failures} world check(s) failed` : '\nall world checks passed');
process.exit(failures ? 1 : 0);
