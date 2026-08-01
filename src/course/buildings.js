/**
 * The city the circuit is cut through.
 *
 * Buildings are grown from the road outwards: the generator walks along the
 * centreline and tries to stand a block on each side, then fills the deeper
 * ground behind them, then rings the whole thing with a low-detail skyline. The
 * result is a street canyon that always faces the road, whatever the layout
 * does, and it costs a handful of draw calls because every block shares the same
 * short list of façade materials.
 */
import * as THREE from 'three';
import { onRoad, standing, meshOf, mergeAll, bakeChunks } from './build.js';
import { clamp, lerp } from './util.js';

/** Metres of clear ground between the tarmac and any wall. */
const CLEARANCE = 16;

/**
 * What gets built where. `heights` is the range in metres, `depth` how far back
 * from the road the frontage sits.
 */
export const BLOCKS = {
  downtown: {
    heights: [34, 132], footprint: [26, 52], setback: [20, 34], spacing: 46,
    styles: ['towerGlass', 'towerDark', 'towerPale'], neon: 0.5, roofDetail: 0.9,
  },
  grandstand: {
    heights: [16, 48], footprint: [24, 44], setback: [26, 46], spacing: 52,
    styles: ['towerPale', 'blockWindows', 'towerDark'], neon: 0.25, roofDetail: 0.6,
  },
  ramp: {
    heights: [10, 26], footprint: [22, 46], setback: [24, 52], spacing: 54,
    styles: ['blockWindows', 'brick'], neon: 0.15, roofDetail: 0.4,
  },
  flyover: {
    heights: [8, 22], footprint: [26, 54], setback: [26, 60], spacing: 60,
    styles: ['corrugated', 'brick', 'blockWindows'], neon: 0.1, roofDetail: 0.35,
  },
  descent: {
    heights: [8, 26], footprint: [22, 48], setback: [24, 56], spacing: 62,
    styles: ['brick', 'blockWindows'], neon: 0.12, roofDetail: 0.3,
  },
  docks: {
    heights: [7, 18], footprint: [30, 70], setback: [26, 54], spacing: 72,
    styles: ['corrugated', 'corrugatedRed'], neon: 0.08, roofDetail: 0.25,
  },
  hairpin: {
    heights: [6, 16], footprint: [26, 56], setback: [28, 52], spacing: 70,
    styles: ['corrugated', 'brickPale'], neon: 0.12, roofDetail: 0.2,
  },
  industrial: {
    heights: [9, 26], footprint: [30, 64], setback: [24, 50], spacing: 60,
    styles: ['corrugated', 'brick', 'corrugatedRed'], neon: 0.1, roofDetail: 0.5,
  },
  tunnel: {
    heights: [18, 46], footprint: [28, 56], setback: [18, 40], spacing: 48,
    styles: ['brick', 'blockWindows', 'towerPale'], neon: 0.3, roofDetail: 0.5,
  },
  park: {
    heights: [12, 30], footprint: [22, 40], setback: [40, 70], spacing: 64,
    styles: ['brick', 'brickPale'], neon: 0.2, roofDetail: 0.3,
  },
  chicane: {
    heights: [14, 40], footprint: [22, 44], setback: [22, 40], spacing: 50,
    styles: ['brick', 'blockWindows', 'towerPale'], neon: 0.45, roofDetail: 0.4,
  },
};

/* -------------------------------------------------------------------------- */
/* One building                                                                */
/* -------------------------------------------------------------------------- */

/** Retile a box's UVs so a window grid keeps the same size on every face. */
function tileBoxUV(geo, w, h, d, floor = 3.6) {
  const uv = geo.attributes.uv;
  // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z, four vertices each.
  const faces = [
    [d, h], [d, h],      // sides
    [w, d], [w, d],      // top, bottom
    [w, h], [w, h],      // front, back
  ];
  for (let f = 0; f < 6; f++) {
    const [fw, fh] = faces[f];
    const su = Math.max(1, Math.round(fw / floor));
    const sv = Math.max(1, Math.round(fh / floor));
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

function boxMesh(w, h, d, material, name, floor = 3.6) {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(0, h / 2, 0);
  tileBoxUV(geo, w, h, d, floor);
  const m = new THREE.Mesh(geo, material);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * A single building, base at the origin, front face towards -Z.
 *
 * @param {object} ctx { M, rng }
 * @param {object} spec { w, d, h, style, neon, roofDetail }
 */
export function makeBuilding({ M, rng }, spec) {
  const { w, d, h, style } = spec;
  const g = new THREE.Group();
  g.name = 'Building';

  const facade = M[style] ?? M.blockWindows;
  const floorHeight = style.startsWith('tower') ? 3.6 : style === 'corrugated' || style === 'corrugatedRed' ? 6 : 4.2;

  // Tall buildings step back once or twice, which is what stops a city of
  // boxes from reading as a city of boxes.
  const setbacks = h > 70 ? 2 : h > 42 ? 1 : 0;
  let level = 0;
  let cw = w;
  let cd = d;
  for (let i = 0; i <= setbacks; i++) {
    const segment = i === setbacks ? h - level : (h - level) * rng.range(0.45, 0.68);
    const body = boxMesh(cw, segment, cd, facade, `Body${i}`, floorHeight);
    body.position.y = level;
    g.add(body);

    // Parapet cap on each step.
    const cap = standing(cw + 0.5, 0.7, cd + 0.5, M.concreteDark, 'Parapet');
    cap.position.y = level + segment - 0.35;
    g.add(cap);

    level += segment;
    cw *= rng.range(0.68, 0.84);
    cd *= rng.range(0.68, 0.84);
  }

  // Ground floor: darker, inset, with lit shopfronts on the street side.
  const base = boxMesh(w + 0.4, Math.min(5, h * 0.3), d + 0.4, M.shopfront, 'GroundFloor', 3.2);
  g.add(base);
  const canopy = standing(w + 1.6, 0.35, d + 1.6, M.concreteDark, 'Canopy');
  canopy.position.y = Math.min(5, h * 0.3);
  g.add(canopy);

  /* -- roof clutter -------------------------------------------------------- */
  if (rng.chance(spec.roofDetail ?? 0.5)) {
    const units = rng.int(1, 3);
    for (let i = 0; i < units; i++) {
      const unit = standing(rng.range(2.4, 5), rng.range(1.2, 2.6), rng.range(2.4, 5), M.steelDark, 'RoofUnit');
      unit.position.set(rng.jitter(cw * 0.3), h, rng.jitter(cd * 0.3));
      g.add(unit);
    }
    if (rng.chance(0.45)) {
      const mast = standing(0.22, rng.range(4, 14), 0.22, M.steelDark, 'Mast');
      mast.position.set(rng.jitter(cw * 0.25), h, rng.jitter(cd * 0.25));
      g.add(mast);
      // Aircraft warning light.
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 5), M.neonAmber);
      bulb.position.set(mast.position.x, h + mast.geometry.parameters.height, mast.position.z);
      bulb.name = 'WarningLight';
      g.add(bulb);
    }
    if (rng.chance(0.25)) {
      // Water tower, on legs.
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 3.4, 10), M.rust);
      tank.position.set(rng.jitter(cw * 0.2), h + 4.4, rng.jitter(cd * 0.2));
      tank.castShadow = true;
      g.add(tank);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const leg = standing(0.18, 3, 0.18, M.steelDark, 'TankLeg');
        leg.position.set(tank.position.x + sx * 1.4, h, tank.position.z + sz * 1.4);
        g.add(leg);
      }
    }
  }

  /* -- signage ------------------------------------------------------------- */
  if (rng.chance(spec.neon ?? 0.3)) {
    const neonMat = rng.pick(M.neonSet);
    const height = rng.range(6, Math.max(9, h * 0.7));
    if (rng.chance(0.5)) {
      // Vertical blade sign on the corner.
      const blade = standing(0.5, rng.range(5, 11), 2.6, neonMat, 'NeonBlade');
      blade.position.set(w / 2 + 0.3, height, -d / 2 + 1.6);
      blade.castShadow = false;
      g.add(blade);
    } else {
      // Horizontal band across the frontage.
      const band = standing(w * 0.8, 1.5, 0.4, neonMat, 'NeonBand');
      band.position.set(0, height, -d / 2 - 0.25);
      band.castShadow = false;
      g.add(band);
    }
  }

  return g;
}

/* -------------------------------------------------------------------------- */
/* Placement                                                                   */
/* -------------------------------------------------------------------------- */

/** Coarse occupancy map so buildings do not grow into each other. */
class Plots {
  constructor(cell = 10) {
    this.cell = cell;
    this.taken = new Set();
  }

  key(x, z) {
    return `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`;
  }

  free(x, z, radius) {
    const r = Math.ceil(radius / this.cell);
    const cx = Math.floor(x / this.cell);
    const cz = Math.floor(z / this.cell);
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (this.taken.has(`${cx + dx},${cz + dz}`)) return false;
      }
    }
    return true;
  }

  claim(x, z, radius) {
    const r = Math.ceil(radius / this.cell);
    const cx = Math.floor(x / this.cell);
    const cz = Math.floor(z / this.cell);
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) this.taken.add(`${cx + dx},${cz + dz}`);
    }
  }
}

/**
 * Fill the city.
 *
 * @param {object} world { track, M, rng, ground, isWater }
 * @returns {{object: THREE.Group, plots: Plots}}
 */
export function buildCity(world) {
  const { track, M, rng, ground, isWater } = world;
  const group = new THREE.Group();
  group.name = 'City';
  const plots = new Plots(10);

  const holder = new THREE.Group();

  const tryPlace = (x, z, heading, spec) => {
    const radius = Math.max(spec.w, spec.d) * 0.62 + 4;
    if (isWater(x, z)) return false;
    if (!plots.free(x, z, radius)) return false;
    // Keep clear of the road, checking the corners rather than the centre.
    const clearance = spec.clearance ?? CLEARANCE;
    for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) {
      const px = x + ox * spec.w * 0.5;
      const pz = z + oz * spec.d * 0.5;
      if (track.distanceToRoad(px, pz) < clearance) return false;
    }
    const node = makeBuilding(world, spec);
    node.position.set(x, ground(x, z) - 0.4, z);
    node.rotation.y = heading;
    holder.add(node);
    plots.claim(x, z, radius);
    return true;
  };

  /* -- street frontage ----------------------------------------------------- */

  let s = 0;
  while (s < track.length) {
    const frame = track.frameAt(s);
    const block = BLOCKS[frame.district] ?? BLOCKS.downtown;
    for (const side of [-1, 1]) {
      const setback = rng.range(block.setback[0], block.setback[1]);
      const w = rng.range(block.footprint[0], block.footprint[1]);
      const d = rng.range(block.footprint[0], block.footprint[1]);
      const p = onRoad(frame, side * (frame.halfWidth + setback + d * 0.5), 0);
      // Under the viaduct there is only room for low sheds.
      const underDeck = frame.elevated;
      const maxHeight = underDeck ? 9 : block.heights[1];
      const h = clamp(rng.range(block.heights[0], block.heights[1]), 5, maxHeight);
      tryPlace(p.x, p.z, frame.heading + (side < 0 ? Math.PI : 0) + rng.jitter(0.05), {
        w, d, h,
        style: underDeck ? 'corrugated' : rng.pick(block.styles),
        neon: block.neon,
        roofDetail: block.roofDetail,
        clearance: underDeck ? 11 : CLEARANCE,
      });
    }
    s += rng.range(block.spacing * 0.7, block.spacing * 1.3);
  }

  /* -- the blocks behind the frontage -------------------------------------- */
  // A jittered grid over the whole map, skipping anything near the road, the
  // water or an existing plot. This is what fills the infield and the far side
  // of the street so the city has depth rather than being a stage set.

  const STEP = 58;
  for (let x = -900; x <= 900; x += STEP) {
    for (let z = -900; z <= 900; z += STEP) {
      const px = x + rng.jitter(16);
      const pz = z + rng.jitter(16);
      if (isWater(px, pz)) continue;
      const distance = track.distanceToRoad(px, pz);
      if (distance < 40) continue;
      const district = track.query(px, pz).district;
      const block = BLOCKS[district] ?? BLOCKS.downtown;
      // Density falls away from the circuit; downtown stays dense.
      const fade = clamp(1 - (distance - 40) / 620, 0.12, 1);
      if (!rng.chance(0.55 * fade + 0.1)) continue;
      const w = rng.range(block.footprint[0], block.footprint[1]) * 1.1;
      const d = rng.range(block.footprint[0], block.footprint[1]) * 1.1;
      const h = lerp(block.heights[0], block.heights[1], rng() ** 1.7) * lerp(1, 0.55, clamp(distance / 700, 0, 1));
      tryPlace(px, pz, rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]) + rng.jitter(0.08), {
        w, d, h: Math.max(6, h),
        style: rng.pick(block.styles),
        neon: block.neon * 0.6,
        roofDetail: block.roofDetail * 0.7,
        clearance: 30,
      });
    }
  }

  // Baking the lot down to a few meshes per chunk is what keeps a city of this
  // size inside the draw-call budget of a standalone headset.
  group.add(bakeChunks(holder, track, { chunks: 20, name: 'CityBlocks' }));

  /* -- distant skyline ----------------------------------------------------- */

  const skyline = [];
  for (let i = 0; i < 260; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = rng.range(900, 1500);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (isWater(x, z)) continue;
    const w = rng.range(24, 70);
    const h = rng.range(20, 150) * (1 - clamp((radius - 900) / 900, 0, 0.5));
    const geo = new THREE.BoxGeometry(w, h, rng.range(24, 70));
    geo.translate(x, h / 2 - 2, z);
    skyline.push(geo);
  }
  const far = meshOf(mergeAll(skyline), M.towerDark, 'Skyline', { cast: false, receive: false });
  if (far) {
    far.frustumCulled = false;
    group.add(far);
  }

  return { object: group, plots };
}
