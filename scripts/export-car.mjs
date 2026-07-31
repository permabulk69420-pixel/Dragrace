import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { createCar } from "../src/car.js";

class NodeFileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.({ target: this });
    });
  }

  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString("base64")}`;
      this.onloadend?.({ target: this });
    });
  }
}

globalThis.FileReader ??= NodeFileReader;

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(scriptDirectory, "../public/assets/apex-r9-drag-coupe.glb");
const car = createCar();
car.root.position.set(0, 0, 0);
car.root.rotation.set(0, 0, 0);
car.root.name = "Apex_R9_Reusable_Vehicle";
car.root.userData.exportedFrom = "Drag Race VR source hierarchy";
car.root.updateMatrixWorld(true);

const exporter = new GLTFExporter();
const binary = await exporter.parseAsync(car.root, {
  binary: true,
  onlyVisible: true,
  trs: true,
  maxTextureSize: 1024,
});

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, Buffer.from(binary));
console.log(`Wrote ${outputPath} (${binary.byteLength.toLocaleString()} bytes)`);

