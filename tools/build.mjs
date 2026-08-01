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

function resolveBuildId() {
  const githubSha = process.env.GITHUB_SHA?.trim();
  if (githubSha) return githubSha.slice(0, 12);

  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return String(Date.now());
  }
}

const buildId = resolveBuildId().replace(/[^a-zA-Z0-9_-]/g, '');
const versionedSrcName = `src-${buildId}`;

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

run('vendor.mjs');
run('smoke-test.mjs');
run('world-smoke-test.mjs');
run('static-collision-test.mjs');

// Keep the ordinary source path for old tabs that are still holding a cached
// index.html, but make the newly generated page load from a commit-specific
// directory. Every deployment therefore gets brand-new module URLs, so Quest
// and mobile browsers cannot quietly reuse scenery/material files from an older
// GitHub Pages release.
fs.cpSync(path.join(root, 'src'), path.join(dist, 'src'), { recursive: true });
fs.cpSync(path.join(root, 'src'), path.join(dist, versionedSrcName), { recursive: true });
fs.cpSync(path.join(root, 'vendor'), path.join(dist, 'vendor'), { recursive: true });

const sourceIndex = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sourceEntry = "import('./src/main.js')";
if (!sourceIndex.includes(sourceEntry)) {
  throw new Error(`index.html no longer contains expected entry point: ${sourceEntry}`);
}

const deployedIndex = sourceIndex
  .replace(sourceEntry, `import('./${versionedSrcName}/main.js')`)
  .replace('</head>', `<meta name="build-id" content="${buildId}">\n</head>`);
fs.writeFileSync(path.join(dist, 'index.html'), deployedIndex);
fs.writeFileSync(
  path.join(dist, 'build.json'),
  `${JSON.stringify({ buildId, sourceDirectory: versionedSrcName }, null, 2)}\n`,
);

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
console.log(`[build] ${files.length} files, ${(bytes / 1024 / 1024).toFixed(2)} MB -> dist/ (${buildId})`);