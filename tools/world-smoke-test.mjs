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
  'StreetFrontBuildings', 'UnderdeckLights', 'BarrierImpactSparks',
  'TrafficSignalHousings', 'TunnelPortalConcrete', 'IndustrialSmokestacks',
]) {
  check(`world node ${name}`, !!track.object.getObjectByName(name));
}

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
const openVehicle = { x: openPosition.x, z: openPosition.z, heading: track.route.atDistance(openDistance).heading, speed: 20 };
track.resetCollisions();
const openRoad = track.resolveVehicle(openVehicle, openDistance, 1 / 90);
check('unprotected street edges remain open', !openRoad.collided);

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
check('world draw calls stay Quest-conscious', draws < 150, `${draws} mesh draws`);
check('world triangle load stays practical', triangles < 450000, `${Math.round(triangles).toLocaleString()} rendered tris`);
check('repeated scenery is instanced', instances > 500, `${instances.toLocaleString()} instances`);
check('world remains compact enough to combine with existing car', draws + 164 < 315, `${draws + 164} estimated total draws`);

console.log(failures ? `\n${failures} world check(s) failed` : '\nall world checks passed');
process.exit(failures ? 1 : 0);
