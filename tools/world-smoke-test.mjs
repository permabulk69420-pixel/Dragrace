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
  'TunnelLights', 'CircuitScoreboard',
]) {
  check(`world node ${name}`, !!track.object.getObjectByName(name));
}

let draws = 0;
let triangles = 0;
let instances = 0;
let finite = true;
const matrix = new THREE.Matrix4();
track.object.traverse((object) => {
  if (!object.isMesh) return;
  draws++;
  const position = object.geometry?.attributes?.position;
  if (!position || Array.from(position.array).some((value) => !Number.isFinite(value))) finite = false;
  const index = object.geometry?.getIndex();
  const baseTriangles = (index ? index.count : position?.count ?? 0) / 3;
  const multiplier = object.isInstancedMesh ? object.count : 1;
  triangles += baseTriangles * multiplier;
  if (object.isInstancedMesh) {
    instances += object.count;
    for (let i = 0; i < object.count; i++) {
      object.getMatrixAt(i, matrix);
      if (matrix.elements.some((value) => !Number.isFinite(value))) finite = false;
    }
  }
});

check('world geometry contains only finite values', finite);
check('world draw calls stay Quest-conscious', draws < 150, `${draws} mesh draws`);
check('world triangle load stays practical', triangles < 450000, `${Math.round(triangles).toLocaleString()} rendered tris`);
check('repeated scenery is instanced', instances > 500, `${instances.toLocaleString()} instances`);
check('world remains compact enough to combine with existing car', draws + 164 < 315, `${draws + 164} estimated total draws`);

console.log(failures ? `\n${failures} world check(s) failed` : '\nall world checks passed');
process.exit(failures ? 1 : 0);
