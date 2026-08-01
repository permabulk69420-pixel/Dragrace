/**
 * The road itself: tarmac, paint, kerbs, pavements, the harbour viaduct and the
 * metro tunnel.
 *
 * Everything here is swept from the centreline, so the surface always agrees
 * with what Track.query() reports - what you see is exactly what the car will
 * be told it is driving on.
 */
import * as THREE from 'three';
import { districtRuns } from './layout.js';
import {
  frames, lapFrames, ribbon, stripe, dashes, onRoad, mergeAll, meshOf, standing, post,
  addTo, bakeChunks,
} from './build.js';
import { clamp, smoothstep, makeRng } from './util.js';

/** Corners tighter than this get kerbs, skid marks and corner boards. */
const CORNER_CURVATURE = 1 / 190;

const _a = new THREE.Vector3();

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Contiguous runs of lap distance where a test holds, in metres. */
function runsWhere(track, test, { minLength = 20, pad = 0 } = {}) {
  const runs = [];
  let open = null;
  for (const sample of track.samples) {
    if (test(sample)) {
      if (!open) open = { from: sample.s, to: sample.s, sample };
      else open.to = sample.s;
    } else if (open) {
      if (open.to - open.from >= minLength) runs.push(open);
      open = null;
    }
  }
  if (open && open.to - open.from >= minLength) runs.push(open);
  return runs.map((r) => ({ ...r, from: r.from - pad, to: r.to + pad }));
}

/** Ease a ribbon's width in and out so kerbs do not start with a step. */
function taper(i, count, ramp = 4) {
  return smoothstep(clamp(Math.min(i, count - i) / ramp, 0, 1));
}

/* -------------------------------------------------------------------------- */
/* Surface                                                                     */
/* -------------------------------------------------------------------------- */

function buildSurface(track, M, group) {
  const list = lapFrames(track, 4);

  // Tarmac. A little wider than the racing surface so the painted edge line has
  // something to sit on and the kerbs have a lip to bite into.
  const road = ribbon(list, (frame) => [
    { lat: -frame.halfWidth - 0.5 },
    { lat: frame.halfWidth + 0.5 },
  ], { closed: true, tile: 9 });
  const surface = meshOf(road, M.road, 'RoadSurface', { receive: true });
  group.add(surface);

  // Ragged asphalt shoulder outside the paint, on ground-verge districts only.
  const shoulderRuns = runsWhere(track, (s) => s.settings.verge === 'ground' && !s.elevated);
  const shoulders = [];
  for (const run of shoulderRuns) {
    const runFrames = frames(track, run.from, run.to, 6);
    for (const side of [-1, 1]) {
      shoulders.push(ribbon(runFrames, (frame) => {
        const hw = frame.halfWidth + 0.5;
        return side < 0
          ? [{ lat: -hw - 2.6, lift: -0.09 }, { lat: -hw }]
          : [{ lat: hw }, { lat: hw + 2.6, lift: -0.09 }];
      }, { tile: 7 }));
    }
  }
  addTo(group, meshOf(mergeAll(shoulders), M.verge, 'Shoulder', { receive: true }));

  return surface;
}

/* -------------------------------------------------------------------------- */
/* Paint                                                                       */
/* -------------------------------------------------------------------------- */

function buildMarkings(track, M, group) {
  const white = [];
  const yellow = [];

  // Edge lines, all the way round.
  for (const side of [-1, 1]) {
    white.push(stripe(track, {
      closed: true,
      step: 4,
      lat: (frame) => side * (frame.halfWidth - 0.35),
      width: 0.18,
      lift: 0.014,
    }));
  }

  // Double yellow down the middle, as on any city street.
  for (const offset of [-0.18, 0.18]) {
    yellow.push(stripe(track, { closed: true, step: 4, lat: offset, width: 0.14, lift: 0.014 }));
  }

  // Dashed lane dividers, one each side of the yellows.
  for (const side of [-1, 1]) {
    white.push(dashes(track, {
      from: 0,
      to: track.length,
      on: 3,
      off: 7,
      lat: (frame) => side * frame.halfWidth * 0.5,
      width: 0.15,
      lift: 0.014,
    }));
  }

  /* -- start / finish ----------------------------------------------------- */

  const line = frames(track, -1.2, 1.2, 0.6);
  white.push(ribbon(line, (frame) => [
    { lat: -frame.halfWidth - 0.4, lift: 0.016 },
    { lat: frame.halfWidth + 0.4, lift: 0.016 },
  ], { tile: 1 }));

  // Chequered band painted just behind the line: alternating squares built from
  // quads, so it needs no texture and stays crisp at any distance.
  const dark = [];
  const startFrame = track.frameAt(0);
  const squares = 24;
  const bandWidth = (startFrame.halfWidth + 0.4) * 2;
  const square = bandWidth / squares;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < squares; col++) {
      const s0 = 1.6 + row * square;
      const patch = frames(track, s0, s0 + square, square);
      const lat0 = -bandWidth / 2 + col * square;
      const geo = ribbon(patch, () => [
        { lat: lat0, lift: 0.017 },
        { lat: lat0 + square, lift: 0.017 },
      ], { tile: 1 });
      ((row + col) % 2 === 0 ? white : dark).push(geo);
    }
  }
  addTo(group, meshOf(mergeAll(dark), M.asphaltWall, 'StartChequerDark', { receive: true }));

  // Grid boxes: eight staggered slots stretching back down the straight.
  for (const slot of track.gridSlots(8)) {
    const box = frames(track, slot.s - 2.6, slot.s + 2.6, 1.3);
    const outline = [
      [slot.lateral - 1.6, slot.lateral - 1.45],
      [slot.lateral + 1.45, slot.lateral + 1.6],
    ];
    for (const [a, b] of outline) {
      white.push(ribbon(box, () => [{ lat: a, lift: 0.015 }, { lat: b, lift: 0.015 }], { tile: 1 }));
    }
    const front = frames(track, slot.s - 2.6, slot.s - 2.45, 0.15);
    white.push(ribbon(front, () => [
      { lat: slot.lateral - 1.6, lift: 0.015 },
      { lat: slot.lateral + 1.6, lift: 0.015 },
    ], { tile: 1 }));
  }

  /* -- crossings ---------------------------------------------------------- */
  // Zebra crossings where the course runs through streets that would have them.

  for (const s of [220, 372, 2520, 2700, 3090]) {
    for (let i = 0; i < 9; i++) {
      const frame = track.frameAt(s);
      const lat = -frame.halfWidth + 0.8 + i * ((frame.width - 1.6) / 9);
      const patch = frames(track, s - 1.6, s + 1.6, 1.6);
      white.push(ribbon(patch, () => [
        { lat, lift: 0.015 },
        { lat: lat + 0.55, lift: 0.015 },
      ], { tile: 1 }));
    }
  }

  addTo(group, meshOf(mergeAll(white), M.lineWhite, 'PaintWhite', { receive: true }));
  addTo(group, meshOf(mergeAll(yellow), M.lineYellow, 'PaintYellow', { receive: true }));
}

/* -------------------------------------------------------------------------- */
/* Kerbs and rubber                                                            */
/* -------------------------------------------------------------------------- */

function buildKerbs(track, M, group) {
  const geos = [];
  const runs = runsWhere(track, (s) => Math.abs(s.curvature) > CORNER_CURVATURE, { minLength: 26 });

  for (const run of runs) {
    const inside = Math.sign(run.sample.curvature) > 0 ? -1 : 1;   // left turn: kerb on the left
    const list = frames(track, run.from - 6, run.to + 8, 2);
    for (const side of [inside, -inside]) {
      // Inside kerb through the corner, plus a shorter exit kerb opposite.
      const isInside = side === inside;
      const sub = isInside ? list : frames(track, run.to - 12, run.to + 22, 2);
      const count = sub.length - 1;
      geos.push(ribbon(sub, (frame, i) => {
        const t = taper(i, count, 5);
        const hw = frame.halfWidth + 0.5;
        const width = (isInside ? 1.0 : 0.8) * t;
        const lip = 0.02 + 0.09 * t;
        return side < 0
          ? [{ lat: -hw - width, lift: lip }, { lat: -hw + 0.05, lift: 0.02 }]
          : [{ lat: hw - 0.05, lift: 0.02 }, { lat: hw + width, lift: lip }];
      }, { tile: 1.6, vScale: 1 }));
    }
  }
  addTo(group, meshOf(mergeAll(geos), M.kerb, 'Kerbs', { receive: true }));

  /* -- braking-zone rubber ------------------------------------------------ */
  // Two dark streaks into every slow corner, which is what a street course
  // looks like after a weekend of racing on it.
  const marks = [];
  for (const run of runs) {
    // Use the tightest point of the corner, not the way the entry starts out.
    let tightest = Infinity;
    for (let s = run.from; s < run.to; s += 4) {
      tightest = Math.min(tightest, track.frameAt(s).curvature ? 1 / Math.abs(track.frameAt(s).curvature) : Infinity);
    }
    if (tightest > 160) continue;
    const list = frames(track, run.from - 60, run.from + 12, 4);
    for (const lane of [-2.4, -0.9, 1.1, 2.6]) {
      marks.push(ribbon(list, (frame, i) => {
        const t = taper(i, list.length - 1, 3) * 0.5;
        return [{ lat: lane - t, lift: 0.012 }, { lat: lane + t, lift: 0.012 }];
      }, { tile: 6 }));
    }
  }
  const rubber = meshOf(mergeAll(marks), M.groove, 'BrakingRubber', { receive: false });
  if (rubber) rubber.renderOrder = 1;
  addTo(group, rubber);
}

/* -------------------------------------------------------------------------- */
/* Pavements and verges                                                        */
/* -------------------------------------------------------------------------- */

function buildEdges(track, M, group) {
  const kerbstones = [];
  const slabs = [];
  const verges = [];

  const pavementRuns = runsWhere(track, (s) => s.settings.verge === 'pavement' && !s.elevated);
  for (const run of pavementRuns) {
    const list = frames(track, run.from, run.to, 5);
    for (const side of [-1, 1]) {
      const hw = (frame) => side * (frame.halfWidth + 0.5);
      // Kerbstone: vertical face then a narrow top.
      kerbstones.push(ribbon(list, (frame) => {
        const edge = hw(frame);
        return side < 0
          ? [{ lat: edge - 0.3, lift: 0.16 }, { lat: edge, lift: 0 }]
          : [{ lat: edge, lift: 0 }, { lat: edge + 0.3, lift: 0.16 }];
      }, { tile: 3 }));
      // Footway.
      slabs.push(ribbon(list, (frame) => {
        const edge = hw(frame);
        return side < 0
          ? [{ lat: edge - 5.4, lift: 0.19 }, { lat: edge - 0.28, lift: 0.16 }]
          : [{ lat: edge + 0.28, lift: 0.16 }, { lat: edge + 5.4, lift: 0.19 }];
      }, { tile: 6 }));
    }
  }

  const groundRuns = runsWhere(track, (s) => s.settings.verge === 'ground' && !s.elevated);
  for (const run of groundRuns) {
    const list = frames(track, run.from, run.to, 6);
    for (const side of [-1, 1]) {
      verges.push(ribbon(list, (frame) => {
        const inner = side * (frame.halfWidth + 3.1);
        const outer = side * (frame.halfWidth + 22);
        // Tie the outer edge to the terrain so the two surfaces meet flush.
        onRoad(frame, outer, 0, _a);
        const drop = track.terrainHeight(_a.x, _a.z) - _a.y;
        return side < 0
          ? [{ lat: outer, lift: drop }, { lat: inner, lift: -0.09 }]
          : [{ lat: inner, lift: -0.09 }, { lat: outer, lift: drop }];
      }, { tile: 12 }));
    }
  }

  addTo(group, meshOf(mergeAll(kerbstones), M.concrete, 'Kerbstones', { receive: true }));
  addTo(group, meshOf(mergeAll(slabs), M.pavement, 'Pavements', { receive: true }));
  addTo(group, meshOf(mergeAll(verges), M.verge, 'Verges', { receive: true }));
}

/* -------------------------------------------------------------------------- */
/* Viaduct                                                                     */
/* -------------------------------------------------------------------------- */

function buildViaduct(track, M, group) {
  const runs = runsWhere(track, (s) => s.elevated, { minLength: 40 });
  const deck = [];
  const sides = [];
  const piers = new THREE.Group();
  piers.name = 'ViaductPiers';

  for (const run of runs) {
    const list = frames(track, run.from - 6, run.to + 6, 5);
    const overhang = 1.6;
    const thickness = 1.5;

    // Underside, seen from the city below.
    deck.push(ribbon(list, (frame) => [
      { lat: -frame.halfWidth - overhang, lift: -thickness },
      { lat: frame.halfWidth + overhang, lift: -thickness },
    ], { tile: 8, flip: true }));

    for (const side of [-1, 1]) {
      const outer = (frame) => side * (frame.halfWidth + overhang);
      // Fascia beam.
      sides.push(ribbon(list, (frame) => {
        const lat = outer(frame);
        return side < 0
          ? [{ lat, lift: -thickness }, { lat, lift: 0.05 }]
          : [{ lat, lift: 0.05 }, { lat, lift: -thickness }];
      }, { tile: 6 }));
      // Lip out to the fascia from the road edge.
      sides.push(ribbon(list, (frame) => {
        const lat = outer(frame);
        const edge = side * (frame.halfWidth + 0.5);
        return side < 0
          ? [{ lat, lift: 0.05 }, { lat: edge, lift: 0 }]
          : [{ lat: edge, lift: 0 }, { lat, lift: 0.05 }];
      }, { tile: 4 }));
    }

    // Piers, in pairs, down to whatever the ground is doing beneath them.
    for (let s = run.from + 8; s < run.to - 8; s += 34) {
      const frame = track.frameAt(s);
      for (const side of [-1, 1]) {
        const top = onRoad(frame, side * (frame.halfWidth * 0.55), -thickness);
        const ground = track.terrainHeight(top.x, top.z);
        const height = Math.max(2, top.y - ground);
        const column = post(1.5, height, M.concreteDark, { segments: 10, taper: 0.78, name: 'Pier' });
        column.position.set(top.x, ground, top.z);
        piers.add(column);
      }
      // Cross head under the deck.
      const head = standing(frame.width * 0.9, 1.1, 2.4, M.concreteDark, 'PierHead');
      const centre = onRoad(frame, 0, -thickness - 1.1);
      head.position.copy(centre);
      head.rotation.y = frame.heading;
      piers.add(head);
    }
  }

  addTo(group, meshOf(mergeAll(deck), M.concreteDark, 'ViaductDeck', { receive: true }));
  addTo(group, meshOf(mergeAll(sides), M.concrete, 'ViaductFascia', { receive: true }));
  group.add(bakeChunks(piers, track, { chunks: 6, name: 'ViaductPiers' }));
  return runs;
}

/* -------------------------------------------------------------------------- */
/* Tunnel                                                                      */
/* -------------------------------------------------------------------------- */

function buildTunnel(track, M, group, lights) {
  const runs = districtRuns(track, 'tunnel');
  const walls = [];
  const roof = [];
  const trim = [];
  const HEIGHT = 6.4;

  for (const run of runs) {
    // Pull the bore in a little from the district edges so the portals land on
    // straight road rather than mid-corner.
    const from = run.from + 16;
    const to = run.to - 16;
    const list = frames(track, from, to, 4);

    for (const side of [-1, 1]) {
      const lat = (frame) => side * (frame.halfWidth + 3.2);
      // Side wall.
      walls.push(ribbon(list, (frame) => {
        const l = lat(frame);
        return side < 0
          ? [{ lat: l, lift: HEIGHT }, { lat: l, lift: -0.2 }]
          : [{ lat: l, lift: -0.2 }, { lat: l, lift: HEIGHT }];
      }, { tile: 5 }));
      // Raised service walkway along the wall.
      trim.push(ribbon(list, (frame) => {
        const l = lat(frame);
        const inner = side * (frame.halfWidth + 0.9);
        return side < 0
          ? [{ lat: l, lift: 0.42 }, { lat: inner, lift: 0.42 }]
          : [{ lat: inner, lift: 0.42 }, { lat: l, lift: 0.42 }];
      }, { tile: 4 }));
      trim.push(ribbon(list, (frame) => {
        const inner = side * (frame.halfWidth + 0.9);
        return side < 0
          ? [{ lat: inner, lift: 0.42 }, { lat: inner, lift: 0 }]
          : [{ lat: inner, lift: 0 }, { lat: inner, lift: 0.42 }];
      }, { tile: 4 }));
    }

    // Ceiling.
    roof.push(ribbon(list, (frame) => [
      { lat: -frame.halfWidth - 3.2, lift: HEIGHT },
      { lat: frame.halfWidth + 3.2, lift: HEIGHT },
    ], { tile: 6, flip: true }));

    // Portals: a heavy concrete frame at each end so the mouth reads properly.
    for (const [s, facing] of [[from, -1], [to, 1]]) {
      const frame = track.frameAt(s);
      const portal = new THREE.Group();
      portal.name = 'TunnelPortal';
      const w = frame.width + 12;
      const header = standing(w, 3.2, 2.4, M.concrete, 'PortalHeader');
      header.position.copy(onRoad(frame, 0, HEIGHT));
      header.rotation.y = frame.heading;
      portal.add(header);
      for (const side of [-1, 1]) {
        const leg = standing(3.4, HEIGHT + 3.2, 2.4, M.concrete, 'PortalLeg');
        leg.position.copy(onRoad(frame, side * (frame.halfWidth + 4.6), -0.3));
        leg.rotation.y = frame.heading;
        portal.add(leg);
      }
      portal.userData.facing = facing;
      group.add(portal);
    }

    // Strip lights down the crown of the tunnel, and the glow they throw.
    for (let s = from + 6; s < to; s += 12) {
      const frame = track.frameAt(s);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 2.6), M.tunnelLight);
      lamp.position.copy(onRoad(frame, 0, HEIGHT - 0.2));
      lamp.rotation.y = frame.heading;
      lamp.name = 'TunnelLamp';
      group.add(lamp);
      lights.push({ mesh: lamp, base: 2.6, phase: s * 0.7 });

      const pool = new THREE.Mesh(new THREE.PlaneGeometry(14, 13), M.lightPool);
      pool.geometry.rotateX(-Math.PI / 2);
      pool.position.copy(onRoad(frame, 0, 0.03));
      pool.rotation.y = frame.heading;
      pool.name = 'TunnelPool';
      group.add(pool);
    }
  }

  addTo(group, meshOf(mergeAll(walls), M.concrete, 'TunnelWalls', { receive: true }));
  addTo(group, meshOf(mergeAll(roof), M.concreteDark, 'TunnelRoof', { receive: true }));
  addTo(group, meshOf(mergeAll(trim), M.concreteDark, 'TunnelWalkway', { receive: true }));
  return runs;
}

/* -------------------------------------------------------------------------- */

/**
 * Build the whole driving surface and its immediate structures.
 *
 * @param {import('./layout.js').Track} track
 * @param {Record<string, THREE.Material>} M
 * @returns {{object: THREE.Group, lights: Array}}
 */
export function buildRoad(track, M) {
  const group = new THREE.Group();
  group.name = 'Road';
  const lights = [];

  buildSurface(track, M, group);
  buildEdges(track, M, group);
  buildViaduct(track, M, group);
  buildKerbs(track, M, group);
  buildMarkings(track, M, group);
  buildTunnel(track, M, group, lights);

  // Utility covers and patched trenches, scattered along the city streets.
  const rng = makeRng(4242);
  const covers = [];
  for (let i = 0; i < 90; i++) {
    const s = rng() * track.length;
    const frame = track.frameAt(s);
    if (frame.elevated || frame.district === 'tunnel') continue;
    const circle = new THREE.CircleGeometry(0.42, 10);
    circle.rotateX(-Math.PI / 2);
    const p = onRoad(frame, rng.jitter(frame.halfWidth * 0.8), 0.018);
    circle.translate(p.x, p.y, p.z);
    covers.push(circle);
  }
  const covered = meshOf(mergeAll(covers), M.steelDark, 'ManholeCovers', { receive: true });
  if (covered) covered.renderOrder = 1;
  group.add(covered);

  return { object: group, lights };
}
