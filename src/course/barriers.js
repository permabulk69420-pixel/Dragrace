/**
 * What stops you leaving the circuit.
 *
 * Each district gets the barrier a real street race would use there: concrete
 * blocks through the city, armco where there is run-off, a parapet along the
 * viaduct, tyre stacks on the outside of the slow corners and chain-link across
 * the industrial estate.
 *
 * The same offsets that position the barriers define the driving corridor, so
 * `halfWidthAt()` can be handed to the car later for collision without any
 * chance of the numbers disagreeing with what is on screen.
 */
import * as THREE from 'three';
import {
  frames, ribbon, onRoad, mergeAll, meshOf, standing, post, addTo, bakeChunks,
} from './build.js';
import { clamp, lerp, makeRng, wrap } from './util.js';

/**
 * Barrier plan per district. `margin` is metres from the edge of the tarmac to
 * the face of the barrier.
 */
const PLAN = {
  downtown:   { left: 'jersey',  right: 'jersey',  margin: 6.4 },
  grandstand: { left: 'armco',   right: 'armco',   margin: 4.2, catchFence: 'right' },
  ramp:       { left: 'armco',   right: 'armco',   margin: 3.6 },
  flyover:    { left: 'parapet', right: 'parapet', margin: 2.1 },
  descent:    { left: 'armco',   right: 'armco',   margin: 3.6, tyres: 'right' },
  docks:      { left: 'jersey',  right: 'armco',   margin: 3.8 },
  hairpin:    { left: 'tyres',   right: 'armco',   margin: 3.8, catchFence: 'left' },
  industrial: { left: 'armco',   right: 'armco',   margin: 3.8, chainlink: 'both' },
  tunnel:     { left: 'none',    right: 'none',    margin: 3.4 },
  park:       { left: 'armco',   right: 'armco',   margin: 4.2 },
  chicane:    { left: 'jersey',  right: 'jersey',  margin: 4.4 },
};

/** W-beam cross-section: [height above the road, how far it bulges roadwards]. */
const W_BEAM = [
  [0.40, 0.00],
  [0.52, 0.10],
  [0.64, 0.02],
  [0.76, 0.10],
  [0.86, -0.02],
];

/** New Jersey profile, from the ground up. */
const JERSEY = [
  [0.00, 0.00],
  [0.08, 0.06],
  [0.34, 0.20],
  [0.94, 0.30],
  [1.02, 0.28],
];

/* -------------------------------------------------------------------------- */

/**
 * Sweep a cross-section along a run of road.
 *
 * @param {Array} list frames
 * @param {number} side -1 for the left of the road, +1 for the right
 * @param {(frame:object)=>number} base lateral offset of the barrier face
 * @param {Array<[number, number]>} profile [lift, inset toward the road]
 */
function sweepProfile(list, side, base, profile, { tile = 2 } = {}) {
  const geos = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const [liftA, inA] = profile[i];
    const [liftB, inB] = profile[i + 1];
    geos.push(ribbon(list, (frame) => {
      const b = base(frame);
      const a = { lat: side * (b - inA), lift: liftA };
      const c = { lat: side * (b - inB), lift: liftB };
      // Lower point first on the right, upper first on the left: that is what
      // turns the face towards the road (see build.js/ribbon for the winding).
      return side > 0 ? [a, c] : [c, a];
    }, { tile }));
  }
  return geos;
}

/** Posts under a run of guardrail. */
function railPosts(track, from, to, side, base, M, group, spacing = 4) {
  for (let s = from; s < to; s += spacing) {
    const frame = track.frameAt(s);
    const p = onRoad(frame, side * (base(frame) + 0.06), -0.25);
    const stake = standing(0.14, 1.15, 0.12, M.steelDark, 'RailPost');
    stake.position.copy(p);
    stake.rotation.y = frame.heading;
    group.add(stake);
  }
}

/* -------------------------------------------------------------------------- */

/**
 * @param {import('./layout.js').Track} track
 * @param {Record<string, THREE.Material>} M
 */
export function buildBarriers(track, M) {
  const group = new THREE.Group();
  group.name = 'Barriers';
  const rng = makeRng(9091);

  const rails = [];
  const concrete = [];
  const stripesRed = [];
  const stripesWhite = [];
  const fences = [];
  const catchFences = [];
  const posts = new THREE.Group();
  posts.name = 'BarrierPosts';
  const tyres = new THREE.Group();
  tyres.name = 'TyreWalls';

  // Barrier offset per sample, smoothed so the corridor never jumps.
  const n = track.samples.length;
  const marginRaw = track.samples.map((s) => (PLAN[s.district] ?? PLAN.downtown).margin);
  const margin = marginRaw.map((_, i) => {
    let sum = 0;
    for (let k = -10; k <= 10; k++) sum += marginRaw[wrap(i + k, n)];
    return sum / 21;
  });
  const marginAt = (s) => {
    const f = wrap(s, track.length) / track.spacing;
    const i = Math.floor(f) % n;
    return lerp(margin[i], margin[(i + 1) % n], f - Math.floor(f));
  };
  const baseAt = (frame) => frame.halfWidth + marginAt(frame.s);

  /* -- runs of like barrier ------------------------------------------------ */

  const runsOf = (side) => {
    const key = side < 0 ? 'left' : 'right';
    const out = [];
    let open = null;
    for (const sample of track.samples) {
      const type = (PLAN[sample.district] ?? PLAN.downtown)[key];
      if (open && open.type === type) { open.to = sample.s; continue; }
      if (open) out.push(open);
      open = { type, from: sample.s, to: sample.s };
    }
    if (open) out.push(open);
    return out.filter((r) => r.type !== 'none' && r.to - r.from > 8);
  };

  for (const side of [-1, 1]) {
    for (const run of runsOf(side)) {
      const list = frames(track, run.from, run.to, 4);

      if (run.type === 'armco') {
        rails.push(...sweepProfile(list, side, baseAt, W_BEAM, { tile: 3 }));
        railPosts(track, run.from, run.to, side, baseAt, M, posts);
      } else if (run.type === 'jersey') {
        concrete.push(...sweepProfile(list, side, baseAt, JERSEY, { tile: 3 }));
        // Alternating red and white blocks along the top, race-meeting style.
        const blocks = Math.floor((run.to - run.from) / 4);
        for (let b = 0; b < blocks; b++) {
          const s0 = run.from + b * 4;
          const chunk = frames(track, s0 + 0.25, s0 + 3.75, 1.2);
          const geo = ribbon(chunk, (frame) => {
            const base = baseAt(frame);
            const a = { lat: side * (base - 0.285), lift: 1.03 };
            const c = { lat: side * (base - 0.19), lift: 1.03 };
            return side > 0 ? [a, c] : [c, a];
          }, { tile: 2 });
          (b % 2 ? stripesWhite : stripesRed).push(geo);
        }
      } else if (run.type === 'parapet') {
        concrete.push(...sweepProfile(list, side, baseAt, [
          [0.00, 0.00], [0.10, 0.10], [1.05, 0.14], [1.12, 0.06],
        ], { tile: 3 }));
        // Steel handrail on top of the parapet.
        rails.push(...sweepProfile(list, side, baseAt, [
          [1.16, 0.02], [1.30, 0.10], [1.44, 0.02],
        ], { tile: 3 }));
        railPosts(track, run.from, run.to, side, (frame) => baseAt(frame) - 0.02, M, posts, 6);
      } else if (run.type === 'tyres') {
        // Stacks of scrap tyres, banded together and backed by armco.
        rails.push(...sweepProfile(list, side, (frame) => baseAt(frame) + 1.1, W_BEAM, { tile: 3 }));
        railPosts(track, run.from, run.to, side, (frame) => baseAt(frame) + 1.1, M, posts, 5);
        const tyre = new THREE.CylinderGeometry(0.42, 0.42, 0.26, 9);
        for (let s = run.from; s < run.to; s += 0.92) {
          const frame = track.frameAt(s);
          const height = rng.chance(0.25) ? 4 : 3;
          for (let h = 0; h < height; h++) {
            const geo = tyre.clone();
            const p = onRoad(frame, side * (baseAt(frame) + 0.5 + (h % 2) * 0.06), 0.13 + h * 0.26);
            geo.translate(p.x, p.y, p.z);
            tyres.add(new THREE.Mesh(geo, M.tyreWall));
          }
        }
      }

      const plan = PLAN[track.frameAt((run.from + run.to) / 2).district] ?? PLAN.downtown;

      // Catch fencing where the crowd is close to the action.
      if (plan.catchFence && (plan.catchFence === 'both' || (plan.catchFence === 'left') === (side < 0))) {
        const fenceBase = (frame) => baseAt(frame) + 0.9;
        catchFences.push(ribbon(list, (frame) => {
          const lat = side * fenceBase(frame);
          return side > 0
            ? [{ lat, lift: 0.2 }, { lat, lift: 4.4 }]
            : [{ lat, lift: 4.4 }, { lat, lift: 0.2 }];
        }, { tile: 3, vScale: 1 }));
        for (let s = run.from; s < run.to; s += 8) {
          const frame = track.frameAt(s);
          const mast = standing(0.16, 4.6, 0.16, M.steelDark, 'FenceMast');
          mast.position.copy(onRoad(frame, side * fenceBase(frame), 0));
          mast.rotation.y = frame.heading;
          posts.add(mast);
        }
      }

      // Chain-link along the industrial estate, set further back.
      if (plan.chainlink && (plan.chainlink === 'both' || (plan.chainlink === 'left') === (side < 0))) {
        const fenceBase = (frame) => baseAt(frame) + 7;
        fences.push(ribbon(list, (frame) => {
          const lat = side * fenceBase(frame);
          return side > 0
            ? [{ lat, lift: -0.3 }, { lat, lift: 2.5 }]
            : [{ lat, lift: 2.5 }, { lat, lift: -0.3 }];
        }, { tile: 2.5 }));
        for (let s = run.from; s < run.to; s += 6) {
          const frame = track.frameAt(s);
          const pole = post(0.06, 2.7, M.steel, { segments: 6, name: 'FencePole' });
          pole.position.copy(onRoad(frame, side * fenceBase(frame), -0.3));
          posts.add(pole);
        }
      }
    }
  }

  addTo(group, meshOf(mergeAll(rails), M.rail, 'Guardrails', { cast: true, receive: true }));
  addTo(group, meshOf(mergeAll(concrete), M.concrete, 'ConcreteBarriers', { cast: true, receive: true }));
  addTo(group, meshOf(mergeAll(stripesRed), M.barrierRed, 'BarrierStripeRed'));
  addTo(group, meshOf(mergeAll(stripesWhite), M.barrierWhite, 'BarrierStripeWhite'));
  addTo(group, meshOf(mergeAll(fences), M.chainlink, 'ChainLink', { receive: false }));
  addTo(group, meshOf(mergeAll(catchFences), M.catchFence, 'CatchFence', { receive: false }));
  group.add(bakeChunks(posts, track, { chunks: 18, name: 'BarrierPosts' }));
  group.add(bakeChunks(tyres, track, { chunks: 8, name: 'TyreWalls' }));

  return {
    object: group,
    /** Half-width of the driving corridor, measured to the barrier face. */
    halfWidthAt(s) {
      const f = track.frameAt(s);
      return f.halfWidth + marginAt(s) - 0.35;
    },
    marginAt,
  };
}
