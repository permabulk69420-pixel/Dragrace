/**
 * Headless GLB export: `npm run export:glb [outfile]`.
 *
 * Runs the same car source the game uses, in Node, and writes a reusable asset.
 * No DOM here, so the canvas-generated textures are skipped (see materials.js);
 * the geometry, hierarchy, pivots and PBR material values all export.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// GLTFExporter reaches for FileReader, which Node does not have.
if (!globalThis.FileReader) {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((result) => {
        this.result = result;
        this.onloadend?.();
      });
    }
    readAsDataURL(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = `data:application/octet-stream;base64,${Buffer.from(buf).toString('base64')}`;
        this.onloadend?.();
      });
    }
  };
}

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The browser resolves "three" through the import map; here we point the same
// module specifiers at node_modules by importing the real paths.
const { GLTFExporter } = await import(
  path.join(root, 'node_modules/three/examples/jsm/exporters/GLTFExporter.js')
);
const { buildCar } = await import(path.join(root, 'src/car/car.js'));
const { SPEC } = await import(path.join(root, 'src/car/spec.js'));

const out = path.resolve(root, process.argv[2] ?? 'dist/assets/car.glb');
fs.mkdirSync(path.dirname(out), { recursive: true });

const { root: car, parts } = buildCar();

let meshes = 0;
let triangles = 0;
car.traverse((o) => {
  if (o.isMesh) {
    meshes++;
    const index = o.geometry.getIndex();
    triangles += (index ? index.count : o.geometry.attributes.position.count) / 3;
  }
});

const buffer = await new Promise((resolve, reject) => {
  new GLTFExporter().parse(car, resolve, reject, {
    binary: true,
    onlyVisible: false,
    truncateDrawRange: false,
  });
});

fs.writeFileSync(out, Buffer.from(buffer));

const named = ['CarRoot', 'PitchPivot', 'Sprung', 'SteeringWheel', 'Shifter', 'Spin_RL', 'Steer_FL', 'DriverAnchor'];
const found = named.filter((n) => car.getObjectByName(n));

console.log(`[glb] ${SPEC.name}`);
console.log(`[glb] ${meshes} meshes, ${Math.round(triangles).toLocaleString()} triangles`);
console.log(`[glb] pivots preserved: ${found.join(', ')}`);
console.log(`[glb] wrote ${path.relative(root, out)} (${(buffer.byteLength / 1024).toFixed(0)} kB)`);

if (found.length !== named.length) {
  console.error('[glb] MISSING nodes:', named.filter((n) => !found.includes(n)));
  process.exit(1);
}
if (!parts.corners.RL || !parts.steeringWheel) {
  console.error('[glb] car parts missing');
  process.exit(1);
}
