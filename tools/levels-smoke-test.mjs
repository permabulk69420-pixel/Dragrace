/** Headless contract checks for circuit selection and the Vice Coast level. */
import fs from 'node:fs';
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
      getImageData: (_x, _y, width, height) => ({
        data: new Uint8ClampedArray(width * height * 4), width, height,
      }),
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

const { LEVELS, getLevelChoices } = await import(path.join(root, 'src/world/levels.js'));
const { buildTrack } = await import(path.join(root, 'src/world/track.js'));

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` - ${detail}` : ''}`);
  if (!ok) failures++;
};

const choices = getLevelChoices();
const midnight = LEVELS.find((level) => level.id === 'midnight-circuit');
const viceDefinition = LEVELS.find((level) => level.id === 'vice-coast');
check('two selectable circuits are registered', choices.length === 2 && midnight && viceDefinition);
check('circuit ids and labels are unique',
  new Set(choices.map((choice) => choice.id)).size === choices.length &&
  new Set(choices.map((choice) => choice.name)).size === choices.length);
check('Vice Coast is materially longer than Midnight Circuit',
  viceDefinition.route.length > midnight.route.length * 1.25,
  `${(viceDefinition.route.length / 1000).toFixed(2)} km vs ${(midnight.route.length / 1000).toFixed(2)} km`);

const straight = viceDefinition.features.beachfrontStraight;
const straightLength = viceDefinition.route.length * (straight.end - straight.start);
const straightSamples = Array.from({ length: 29 }, (_, index) => (
  viceDefinition.route.atDistance(viceDefinition.route.length * straight.end * index / 28).center
));
const straightXSpan = Math.max(...straightSamples.map((point) => point.x)) - Math.min(...straightSamples.map((point) => point.x));
const straightZSpan = Math.max(...straightSamples.map((point) => point.z)) - Math.min(...straightSamples.map((point) => point.z));
check('beachfront section is a genuine long straight',
  straightLength >= straight.minimumLengthMetres && straightZSpan > 1400 && straightXSpan < 15,
  `${straightLength.toFixed(0)} m long, ${straightXSpan.toFixed(1)} m lateral drift`);

const track = buildTrack({ levelId: 'vice-coast' });
track.object.updateMatrixWorld(true);
track.startLights.apply({ red: false, amber: false, green: true });
track.scoreboard.draw({
  title: 'VICE COAST TEST',
  cells: [['LAP', '--'], ['SECTOR', '--'], ['PROGRESS', '0%'], ['SPEED', '0 MPH']],
});
track.update(3.2, track.spawn.position);

check('Vice Coast builds through the shared track contract',
  track.id === 'vice-coast' && track.object.name === 'ViceCoastWorld' &&
  Math.abs(track.surfaceAt(track.spawn.position.x, track.spawn.position.z).lateral) < 0.1);

for (const name of [
  'CourseAsphalt', 'CourseShoulders', 'StartFinishGantry', 'CircuitScoreboard',
  'BeachfrontOcean', 'OceanDriveBeach', 'OceanBoardwalk', 'BeachSeawall',
  'CoastalArchitecture', 'NeonDowntown', 'RoyalPalmTrunks', 'RoyalPalmFronds',
  'ViceCoastMarina', 'MarinaYacht_1', 'CausewayBridgeSupportColumns',
  'ViceStreetLightPoles', 'TropicalHorizon', 'ViceCoastGantryBanner',
]) {
  check(`Vice Coast node ${name}`, !!track.object.getObjectByName(name));
}
check('Vice Coast does not inherit the harbour tunnel', !track.object.getObjectByName('HarbourTunnelShell'));

const scenery = track.object.getObjectByName('ViceCoastScenery');
const assetCounts = scenery.userData.authoredAssetCounts;
check('coastal skyline is a compact authored set rather than random filler',
  assetCounts.hotels === 8 && assetCounts.towers === 12,
  `${assetCounts.hotels} hotels, ${assetCounts.towers} towers`);
check('beach and marina hero assets are present',
  assetCounts.palms >= 40 && assetCounts.yachts === 4,
  `${assetCounts.palms} palms, ${assetCounts.yachts} yachts`);

const footprints = scenery.userData.roadClearanceFootprints ?? [];
const criticalFootprints = footprints.filter((footprint) => (
  footprint.kind === 'palm-tree' || footprint.kind === 'art-deco-hotel' || footprint.kind === 'downtown-tower'
));
const violations = criticalFootprints.filter((footprint) => {
  const nearest = track.route.nearest(footprint.x, footprint.z);
  return nearest.distanceToCentre - footprint.radius < footprint.requiredGap - 0.001;
});
check('every building and palm has a conservative road-clearance audit',
  criticalFootprints.length === assetCounts.palms + assetCounts.hotels + assetCounts.towers,
  `${criticalFootprints.length} critical footprints`);
check('no building or palm footprint intrudes on the track',
  violations.length === 0,
  `${violations.length} violations`);

let uncovered = 0;
for (let index = 0; index < 500; index++) {
  const u = (index + 0.5) / 500;
  if (!track.collisionZones.some((zone) => {
    const [start, end] = zone.range;
    return start <= end ? u >= start && u <= end : u >= start || u <= end;
  })) uncovered++;
}
check('visible barriers or guardrails contain the complete Vice Coast lap', uncovered === 0, `${uncovered} uncovered samples`);

let draws = 0;
let triangles = 0;
let instances = 0;
let finite = true;
const matrix = new (await import(path.join(root, 'node_modules/three/build/three.module.js'))).Matrix4();
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
check('Vice Coast geometry contains only finite values', finite);
check('Vice Coast world draw calls remain Quest-conscious', draws < 290, `${draws} mesh draws`);
check('Vice Coast triangle load remains practical', triangles < 220000, `${Math.round(triangles).toLocaleString()} rendered tris`);
check('repeated palms and lights are instanced', instances > 1200, `${instances.toLocaleString()} instances`);
check('Vice Coast plus the car stays inside the established draw budget', draws + 154 < 460, `${draws + 154} estimated total draws`);

const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
check('start overlay exposes circuit selection',
  indexHtml.includes('id="level-picker"') && indexHtml.includes('Choose a circuit'));
check('selected circuit rebuilds the world, collision map and race state',
  mainSource.includes('switchLevel(levelId)') &&
  mainSource.includes('boundaryConfig: nextTrack.boundaryConfig') &&
  mainSource.includes('race = new CircuitRace(track.route'));

console.log(failures ? `\n${failures} level check(s) failed` : '\nall level checks passed');
process.exit(failures ? 1 : 0);
