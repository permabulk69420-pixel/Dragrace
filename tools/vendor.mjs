/**
 * Copies the parts of the three.js package we actually use into vendor/three/
 * so the site is a plain static ES-module project with no bundler and no CDN.
 *
 * Addons are copied by following their import graph, so we only ship what the
 * game imports. Bare "three" / "three/addons/" specifiers are resolved at
 * runtime by the import map in index.html.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = path.join(root, 'node_modules', 'three');
const out = path.join(root, 'vendor', 'three');

// Entry points the browser code imports directly (see src/).
const ENTRIES = [
  'three/addons/webxr/VRButton.js',
  'three/addons/exporters/GLTFExporter.js',
  'three/addons/utils/BufferGeometryUtils.js',
];

const IMPORT_RE = /(?:^|[\s;])(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function addonSource(spec) {
  // "three/addons/foo/Bar.js" -> node_modules/three/examples/jsm/foo/Bar.js
  return path.join(pkg, 'examples', 'jsm', spec.replace(/^three\/addons\//, ''));
}

const seen = new Set();

function vendorAddon(spec) {
  if (seen.has(spec)) return;
  seen.add(spec);

  const src = addonSource(spec);
  const dest = path.join(out, 'addons', spec.replace(/^three\/addons\//, ''));
  copy(src, dest);

  const code = fs.readFileSync(src, 'utf8');
  for (const m of code.matchAll(IMPORT_RE)) {
    const dep = m[1] || m[2];
    if (!dep || dep === 'three') continue;
    if (dep.startsWith('three/addons/')) {
      vendorAddon(dep);
    } else if (dep.startsWith('.')) {
      // Relative import between addons -> convert back to an addons specifier.
      const abs = path.resolve(path.dirname(src), dep);
      const rel = path.relative(path.join(pkg, 'examples', 'jsm'), abs).split(path.sep).join('/');
      vendorAddon(`three/addons/${rel}`);
    } else {
      console.warn(`[vendor] skipping unexpected dependency "${dep}" in ${spec}`);
    }
  }
}

fs.rmSync(out, { recursive: true, force: true });
for (const file of ['three.module.min.js', 'three.core.min.js']) {
  copy(path.join(pkg, 'build', file), path.join(out, file));
}
for (const entry of ENTRIES) vendorAddon(entry);

const version = JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8')).version;
fs.writeFileSync(
  path.join(out, 'VERSION'),
  `three r${version.split('.')[1]} (${version}) - vendored by tools/vendor.mjs, MIT licensed.\n`
);

console.log(`[vendor] three ${version} -> vendor/three (${seen.size} addons)`);
