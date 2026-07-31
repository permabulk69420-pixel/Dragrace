/**
 * Assemble the deployable site into dist/.
 *
 * There is no bundler: the site is plain ES modules plus a vendored copy of
 * three.js, so "building" means refreshing the vendor folder, exporting the car
 * as a GLB, and copying the static files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

const run = (script, args = []) =>
  execFileSync(process.execPath, [path.join(root, 'tools', script), ...args], {
    stdio: 'inherit',
    cwd: root,
  });

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

run('vendor.mjs');
run('smoke-test.mjs');

for (const entry of ['index.html', 'src', 'vendor']) {
  fs.cpSync(path.join(root, entry), path.join(dist, entry), { recursive: true });
}

// Reusable asset export, served alongside the game.
run('export-glb.mjs', [path.join('dist', 'assets', 'car.glb')]);

// Pages would otherwise run the output through Jekyll and drop _-prefixed paths.
fs.writeFileSync(path.join(dist, '.nojekyll'), '');

const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else files.push(p);
  }
};
walk(dist);
const bytes = files.reduce((n, f) => n + fs.statSync(f).size, 0);
console.log(`[build] ${files.length} files, ${(bytes / 1024 / 1024).toFixed(2)} MB -> dist/`);
