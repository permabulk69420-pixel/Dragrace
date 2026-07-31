/**
 * In-browser GLB export (press G on desktop).
 *
 * Builds a fresh copy of the car so nothing from the running simulation - wheel
 * spin, needle angles, body attitude - is baked into the file, then writes a
 * binary glTF with the hierarchy, pivots and separate moving parts intact.
 */
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildCar } from '../car/car.js';
import { SPEC } from '../car/spec.js';

export async function exportCarGlb(filename = 'car.glb') {
  const { root } = buildCar();
  const buffer = await new Promise((resolve, reject) => {
    new GLTFExporter().parse(
      root,
      resolve,
      reject,
      {
        binary: true,
        onlyVisible: false,      // keep the stowed parachute in the file
        truncateDrawRange: false,
        maxTextureSize: 1024,
      }
    );
  });

  const blob = new Blob([buffer], { type: 'model/gltf-binary' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  console.log(`[export] ${SPEC.name}: ${(blob.size / 1024).toFixed(0)} kB written to ${filename}`);
  return blob;
}
