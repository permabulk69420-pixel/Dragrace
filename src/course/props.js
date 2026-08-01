/**
 * Everything at the side of the road.
 *
 * Street lighting, race furniture, grandstands, dock cranes, silos, market
 * stalls, road works, trees - the stuff that tells you which part of the city
 * you are in when the corner ahead all looks like tarmac.
 *
 * Props are built as prototypes and stamped along the centreline, then baked
 * per material. Anything that has to animate (lamps, beacons, the neon on the
 * start gantry) is kept out of the bake and handed back in `lights`.
 */
import * as THREE from 'three';
import { group as makeGroup } from '../car/geom.js';
import { hasDOM } from './materials.js';
import { districtRuns } from './layout.js';
import {
  frames, onRoad, standing, post, slab, panel, meshOf, mergeAll, place, bakeChunks,
} from './build.js';
import { clamp, lerp, wrap } from './util.js';

const _p = new THREE.Vector3();

/* -------------------------------------------------------------------------- */
/* Text atlas                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Pack a handful of short labels into one texture, so every corner board, race
 * banner and street sign in the world costs a single draw call between them.
 */
function makeAtlas(labels, { cols = 4, cell = 512, aspect = 0.5, style = {} } = {}) {
  const rows = Math.ceil(labels.length / cols);
  const height = cell * aspect;
  if (!hasDOM) {
    return { texture: null, uv: () => [0, 0, 1, 1] };
  }
  const c = document.createElement('canvas');
  c.width = cols * cell;
  c.height = rows * height;
  const g = c.getContext('2d');
  g.fillStyle = style.bg ?? '#0d1017';
  g.fillRect(0, 0, c.width, c.height);
  labels.forEach((label, i) => {
    const cx = (i % cols) * cell;
    const cy = Math.floor(i / cols) * height;
    const opts = typeof label === 'string' ? { text: label } : label;
    g.save();
    g.beginPath();
    g.rect(cx, cy, cell, height);
    g.clip();
    g.fillStyle = opts.bg ?? style.bg ?? '#0d1017';
    g.fillRect(cx, cy, cell, height);
    if (opts.border ?? style.border) {
      g.strokeStyle = opts.border ?? style.border;
      g.lineWidth = cell / 44;
      g.strokeRect(cx + cell / 30, cy + cell / 30, cell - cell / 15, height - cell / 15);
    }
    const size = opts.size ?? cell * 0.22;
    g.font = `${opts.weight ?? 900} ${size}px ui-sans-serif, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (opts.glow) {
      g.shadowColor = opts.glow;
      g.shadowBlur = size * 0.6;
    }
    g.fillStyle = opts.colour ?? style.colour ?? '#ffffff';
    const lines = opts.lines ?? [opts.text];
    lines.forEach((line, k) => {
      g.fillText(line, cx + cell / 2, cy + height / 2 + (k - (lines.length - 1) / 2) * size * 1.1);
    });
    g.restore();
  });
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return {
    texture,
    /** [u0, v0, u1, v1] of a cell, with v measured from the bottom. */
    uv(i) {
      const cx = (i % cols) / cols;
      const cy = Math.floor(i / cols) / rows;
      return [cx, 1 - cy - 1 / rows, cx + 1 / cols, 1 - cy];
    },
  };
}

/** Plane whose UVs are remapped into one cell of an atlas. */
function atlasPanel(w, h, material, uv, name = 'Sign') {
  const geo = new THREE.PlaneGeometry(w, h);
  const attr = geo.attributes.uv;
  const [u0, v0, u1, v1] = uv;
  for (let i = 0; i < attr.count; i++) {
    attr.setXY(i, lerp(u0, u1, attr.getX(i)), lerp(v0, v1, attr.getY(i)));
  }
  attr.needsUpdate = true;
  const m = new THREE.Mesh(geo, material);
  m.name = name;
  return m;
}

/* -------------------------------------------------------------------------- */
/* Prototypes                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Street lamp: pole, arm reaching out over the road, lens and halo.
 *
 * Prototypes are built facing local +X, which is the road's right-hand side
 * once they are placed with rotationY = heading. Props on the right of the road
 * get another half turn, so the arm always reaches inwards.
 */
function streetLamp(M, { height = 9, reach = 3.4, cool = false }) {
  const g = makeGroup('StreetLamp');
  const pole = post(0.14, height, M.steelDark, { segments: 7, taper: 0.7, name: 'LampPole' });
  g.add(pole);

  const arm = standing(reach, 0.12, 0.12, M.steelDark, 'LampArm');
  arm.geometry.translate(reach / 2, 0, 0);
  arm.position.set(0, height - 0.1, 0);
  arm.rotation.z = 0.12;
  g.add(arm);

  const head = standing(1.1, 0.22, 0.6, M.steelDark, 'LampHead');
  head.position.set(reach, height - 0.42, 0);
  g.add(head);

  const lens = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.1, 0.5),
    cool ? M.lampLensCool : M.lampLens
  );
  lens.position.set(reach, height - 0.56, 0);
  lens.name = 'LampLens';
  lens.castShadow = false;
  g.add(lens);

  // Two crossed quads of additive glow read as a halo from any angle.
  for (const turn of [0, Math.PI / 2]) {
    const halo = panel(3.4, 3.4, M.lampGlow, 'LampGlow');
    halo.position.set(reach, height - 0.6, 0);
    halo.rotation.y = turn;
    halo.renderOrder = 3;
    g.add(halo);
  }
  return g;
}

/** Traffic signal head on a pole, lenses facing back down the road. */
function trafficLight(M) {
  const g = makeGroup('TrafficLight');
  g.add(post(0.1, 3.6, M.steelDark, { segments: 6, name: 'SignalPole' }));
  const box = standing(0.42, 1.15, 0.34, M.steelDark, 'SignalBox');
  box.position.y = 3.2;
  g.add(box);
  const colours = [M.neonGreen, M.neonAmber, M.barrierRed];
  colours.forEach((mat, i) => {
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.12, 8), mat);
    lens.position.set(0, 4.05 - i * 0.34, 0.19);
    g.add(lens);
  });
  return g;
}

/** Traffic cone. */
function cone(M) {
  const g = makeGroup('Cone');
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.72, 8, 1, true), M.cone);
  body.position.y = 0.36;
  body.castShadow = true;
  g.add(body);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.23, 0.12, 8, 1, true), M.coneBand);
  band.position.y = 0.42;
  g.add(band);
  const foot = slab(0.62, 0.62, M.cone, 'ConeFoot');
  foot.position.y = 0.02;
  g.add(foot);
  return g;
}

/** Deciduous street tree - a trunk and three overlapping blobs. */
function tree(M, rng) {
  const g = makeGroup('Tree');
  const h = rng.range(4.5, 8.5);
  const trunk = post(rng.range(0.16, 0.28), h * 0.55, M.bark, { segments: 6, taper: 0.7, name: 'Trunk' });
  g.add(trunk);
  const blobs = rng.int(2, 3);
  for (let i = 0; i < blobs; i++) {
    const r = rng.range(1.5, 2.8);
    const leaf = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r, 0),
      rng.chance(0.5) ? M.foliage : M.foliageDark
    );
    leaf.position.set(rng.jitter(1.1), h * 0.62 + i * r * 0.72, rng.jitter(1.1));
    leaf.castShadow = true;
    g.add(leaf);
  }
  return g;
}

/** Stack of shipping containers. */
function containerStack(M, rng) {
  const g = makeGroup('Containers');
  const colours = [M.containerRed, M.containerBlue, M.containerGreen, M.containerOchre];
  const high = rng.int(1, 4);
  const long = rng.chance(0.4) ? 12.2 : 6.1;
  for (let i = 0; i < high; i++) {
    const box = standing(long, 2.6, 2.44, rng.pick(colours), 'Container');
    box.position.set(rng.jitter(0.25), i * 2.62, rng.jitter(0.25));
    box.rotation.y = rng.jitter(0.02);
    g.add(box);
  }
  return g;
}

/** Quayside gantry crane - big, and visible from most of the lap. */
function quayCrane(M, rng) {
  const g = makeGroup('QuayCrane');
  const legHeight = 34;
  const span = 26;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = standing(1.5, legHeight, 1.5, M.paintedSteel, 'CraneLeg');
      leg.position.set(sx * span * 0.5, 0, sz * 9);
      g.add(leg);
      const foot = standing(3, 1.4, 3.4, M.steelDark, 'CraneFoot');
      foot.position.set(sx * span * 0.5, 0, sz * 9);
      g.add(foot);
    }
  }
  // Portal beam and the boom reaching out over the water.
  const beam = standing(span + 4, 3, 4, M.paintedSteel, 'CraneBeam');
  beam.position.set(0, legHeight, 0);
  g.add(beam);
  const boom = standing(64, 2.2, 3, M.paintedSteel, 'CraneBoom');
  boom.position.set(16, legHeight + 3, 0);
  g.add(boom);
  const back = standing(20, 1.8, 2.6, M.paintedSteel, 'CraneTail');
  back.position.set(-20, legHeight + 3, 0);
  g.add(back);
  // Machinery house and trolley.
  const house = standing(8, 5, 6, M.corrugated, 'CraneHouse');
  house.position.set(-8, legHeight + 3, 0);
  g.add(house);
  const trolley = standing(3.4, 2, 3.4, M.steelDark, 'CraneTrolley');
  trolley.position.set(rng.range(6, 30), legHeight - 0.4, 0);
  g.add(trolley);
  // The warning beacon at the boom tip blinks, so it is placed separately by
  // the caller and kept out of the static bake.
  g.userData.beacon = new THREE.Vector3(46, legHeight + 5, 0);
  return g;
}

/** A blinking warning lamp, with its own material so it can flash alone. */
function beacon(M, colour = 0xffa02a, radius = 0.5) {
  const material = M.neonAmber.clone();
  material.emissive = new THREE.Color(colour);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(radius, 7, 6), material);
  lamp.name = 'Beacon';
  lamp.castShadow = false;
  return lamp;
}

/** Grandstand: raked seating with a roof and a crowd in it. */
function grandstand(M, rng, { length = 44, rows = 10 } = {}) {
  const g = makeGroup('Grandstand');
  const stepDepth = 1.1;
  const stepRise = 0.55;
  for (let r = 0; r < rows; r++) {
    const tier = standing(length, stepRise + 0.3, stepDepth, r % 2 ? M.concrete : M.concreteDark, 'Tier');
    tier.position.set(0, r * stepRise, r * stepDepth);
    g.add(tier);
    // Spectators: blocks of colour, dense at the front, thinning at the back.
    for (let x = -length / 2 + 1; x < length / 2 - 1; x += 0.72) {
      if (!rng.chance(0.66 - r * 0.02)) continue;
      const body = standing(0.42, rng.range(0.7, 1.0), 0.4,
        rng.chance(0.5) ? M.plastic : rng.pick([M.barrierRed, M.paintedSteel, M.signBlue]), 'Fan');
      body.position.set(x + rng.jitter(0.12), r * stepRise + stepRise + 0.3, r * stepDepth + rng.jitter(0.1));
      body.castShadow = false;
      g.add(body);
    }
  }
  // Back wall and roof.
  const back = standing(length, rows * stepRise + 3.4, 0.6, M.corrugated, 'StandBack');
  back.position.set(0, 0, rows * stepDepth + 0.4);
  g.add(back);
  const roof = standing(length + 2, 0.5, rows * stepDepth + 3, M.corrugated, 'StandRoof');
  roof.position.set(0, rows * stepRise + 3.4, rows * stepDepth * 0.5);
  g.add(roof);
  for (const sx of [-1, 0, 1]) {
    const column = standing(0.4, rows * stepRise + 3.4, 0.4, M.steelDark, 'StandColumn');
    column.position.set(sx * length * 0.42, 0, -0.6);
    g.add(column);
  }
  return g;
}

/** Marshal post: a hut with a flag, facing the track down its +X axis. */
function marshalPost(M) {
  const g = makeGroup('MarshalPost');
  const hut = standing(1.8, 2.3, 2.4, M.paintedSteel, 'MarshalHut');
  g.add(hut);
  const roof = standing(2.2, 0.16, 2.8, M.steelDark, 'MarshalRoof');
  roof.position.y = 2.3;
  g.add(roof);
  const flagPole = post(0.06, 3.2, M.steelDark, { segments: 5, name: 'FlagPole' });
  flagPole.position.set(0, 0, 1.5);
  g.add(flagPole);
  const flag = panel(1.2, 0.8, M.signYellow, 'Flag');
  flag.position.set(0.02, 2.7, 2.1);
  flag.rotation.y = Math.PI / 2;
  g.add(flag);
  return g;
}

/* -------------------------------------------------------------------------- */
/* Builders                                                                    */
/* -------------------------------------------------------------------------- */

/** Lamp posts, and the pools of light they lay on the road. */
function lighting(world, static_) {
  const { track, M } = world;
  const cityLamp = streetLamp(M, { height: 9.5, reach: 3.6 });
  const dockLamp = streetLamp(M, { height: 13, reach: 2.2, cool: true });

  // Alternate sides down the whole lap; the docks and industry get taller,
  // colder masts.
  let i = 0;
  for (let s = 6; s < track.length; s += 38) {
    const frame = track.frameAt(s);
    if (frame.district === 'tunnel') continue;
    const side = i++ % 2 === 0 ? -1 : 1;
    const cold = frame.district === 'docks' || frame.district === 'industrial' || frame.district === 'hairpin';
    const prototype = cold ? dockLamp : cityLamp;
    const margin = frame.elevated ? 2.6 : 4.6;
    // The arm reaches over the road, so the lamp has to face inwards.
    static_.add(place(prototype, onRoad(frame, side * (frame.halfWidth + margin), 0.02), {
      rotationY: frame.heading + (side < 0 ? 0 : Math.PI),
    }));

    const pool = slab(15, 20, M.lightPool, 'LightPool');
    pool.position.copy(onRoad(frame, side * 2.2, 0.06));
    pool.rotation.y = frame.heading;
    pool.renderOrder = 2;
    static_.add(pool);
  }
}

/** Start line gantry, pit garages, banners, corner boards, marshal posts. */
function raceFurniture(world, static_, animated, lights) {
  const { track, M, rng } = world;

  const atlas = makeAtlas([
    { text: 'BAYFRONT CIRCUIT', size: 74, colour: '#ffd166', bg: '#0a0d14', glow: '#ff8a2b' },
    { text: 'START / FINISH', size: 86, colour: '#ffffff', bg: '#12161f', glow: '#ffffff' },
    { text: 'NITRO', size: 120, colour: '#2ff0ff', bg: '#0a0d14', glow: '#2ff0ff' },
    { text: 'PIT LANE', size: 96, colour: '#0b0e14', bg: '#e8b62c' },
    { lines: ['HARBOUR', 'VIADUCT'], size: 74, colour: '#ffffff', bg: '#1c5c3a' },
    { lines: ['DOCKS', 'NEXT LEFT'], size: 68, colour: '#ffffff', bg: '#1b3f74' },
    { text: 'SPEED 50', size: 92, colour: '#0b0e14', bg: '#f2f4f8', border: '#b8352a' },
    { lines: ['MARKET ST', 'CHICANE'], size: 62, colour: '#ffffff', bg: '#1b3f74' },
    { text: 'TURN 1', size: 104, colour: '#0b0e14', bg: '#f2f4f8' },
    { text: 'TURN 2', size: 104, colour: '#0b0e14', bg: '#f2f4f8' },
    { text: 'TURN 3', size: 104, colour: '#0b0e14', bg: '#f2f4f8' },
    { text: 'TURN 4', size: 104, colour: '#0b0e14', bg: '#f2f4f8' },
    { text: 'TURN 5', size: 104, colour: '#0b0e14', bg: '#f2f4f8' },
    { text: 'TURN 6', size: 104, colour: '#0b0e14', bg: '#f2f4f8' },
    { text: 'PADDOCK', size: 88, colour: '#ffffff', bg: '#2a2e35' },
    { text: 'BAYFRONT', size: 96, colour: '#ff2f8e', bg: '#0a0d14', glow: '#ff2f8e' },
  ], { cols: 4, cell: 512, aspect: 0.5 });

  const signMat = atlas.texture
    ? new THREE.MeshBasicMaterial({ map: atlas.texture, toneMapped: false, name: 'SignAtlas' })
    : new THREE.MeshBasicMaterial({ color: 0x8899aa, name: 'SignAtlas' });
  world.signMaterial = signMat;

  /* -- start gantry -------------------------------------------------------- */

  const startFrame = track.frameAt(0);
  const gantry = makeGroup('StartGantry');
  const span = startFrame.width + 14;
  for (const side of [-1, 1]) {
    const leg = standing(1.2, 10.5, 1.2, M.steelDark, 'GantryLeg');
    leg.position.copy(onRoad(startFrame, side * (startFrame.halfWidth + 5.5), 0));
    leg.rotation.y = startFrame.heading;
    gantry.add(leg);
    const brace = standing(0.4, 0.4, 5, M.steelDark, 'GantryBrace');
    brace.position.copy(onRoad(startFrame, side * (startFrame.halfWidth + 5.5), 5));
    brace.rotation.set(0.5, startFrame.heading, 0);
    gantry.add(brace);
  }
  const beam = standing(span, 1.6, 1.4, M.steelDark, 'GantryBeam');
  beam.position.copy(onRoad(startFrame, 0, 10.5));
  beam.rotation.y = startFrame.heading;
  gantry.add(beam);

  // Sign faces sit on their local +Z, which points back down the road once the
  // sign is rotated by the frame heading - so drivers read them head-on.
  const banner = atlasPanel(span * 0.86, 3.4, signMat, atlas.uv(1), 'StartBanner');
  banner.position.copy(onRoad(startFrame, 0, 8.6));
  banner.rotation.y = startFrame.heading;
  gantry.add(banner);
  const nameBoard = atlasPanel(span * 0.5, 2.2, signMat, atlas.uv(0), 'CircuitBoard');
  nameBoard.position.copy(onRoad(startFrame, 0, 12.6));
  nameBoard.rotation.y = startFrame.heading;
  gantry.add(nameBoard);

  // Start lights: five pairs, the sequence a race director would run.
  const rig = makeGroup('StartLights');
  rig.position.copy(onRoad(startFrame, 0, 9.4));
  rig.rotation.y = startFrame.heading;
  const bulbs = [];
  for (let i = 0; i < 5; i++) {
    for (let row = 0; row < 2; row++) {
      const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.3, 12), M.barrierRed.clone());
      bulb.material.emissive = new THREE.Color(0xff2418);
      bulb.material.emissiveIntensity = 0;
      bulb.material.name = `StartBulb${i}`;
      bulb.position.set((i - 2) * 1.5, 0.42 - row * 0.72, 0.1);
      bulb.name = `StartLight${i}`;
      rig.add(bulb);
      bulbs.push({ index: i, material: bulb.material });
    }
    const housing = standing(1.2, 1.6, 0.5, M.steelDark, 'BulbHousing');
    housing.position.set((i - 2) * 1.5, -0.8, -0.2);
    rig.add(housing);
  }
  animated.add(rig);
  static_.add(gantry);
  lights.startLights = bulbs;

  /* -- paddock and pit garages -------------------------------------------- */
  // Temporary garages down the inside of the start straight, as a street race
  // would put up for a weekend.

  for (let i = 0; i < 9; i++) {
    const s = wrap(-40 - i * 15, track.length);
    const frame = track.frameAt(s);
    const g = makeGroup('PitGarage');
    // Fronts face local +X, so a garage on the left of the road opens onto it.
    const shell = standing(8, 4.6, 13, M.corrugated, 'GarageShell');
    g.add(shell);
    const roof = standing(9, 0.4, 14, M.steelDark, 'GarageRoof');
    roof.position.y = 4.6;
    g.add(roof);
    const door = standing(0.3, 3.6, 9, M.steelDark, 'GarageDoor');
    door.position.set(4.1, 0, 0);
    g.add(door);
    const sign = atlasPanel(6, 1.5, signMat, atlas.uv(i % 2 ? 3 : 14), 'GarageSign');
    sign.position.set(4.4, 5.2, 0);
    sign.rotation.y = Math.PI / 2;
    g.add(sign);
    static_.add(place(g, onRoad(frame, -(frame.halfWidth + 15), 0), { rotationY: frame.heading }));
  }

  /* -- overhead direction signs ------------------------------------------- */

  const gantrySign = (s, cell, { lat = 0, lift = 7.2, width = 7, height = 3.2 } = {}) => {
    const frame = track.frameAt(s);
    const g = makeGroup('SignGantry');
    const mast = standing(0.5, lift + 1.2, 0.5, M.steelDark, 'SignMast');
    mast.position.copy(onRoad(frame, lat, 0));
    mast.rotation.y = frame.heading;
    g.add(mast);
    const arm = standing(Math.abs(lat) * 0.9, 0.42, 0.42, M.steelDark, 'SignArm');
    arm.position.copy(onRoad(frame, lat * 0.55, lift + 0.9));
    arm.rotation.y = frame.heading + Math.PI / 2;
    g.add(arm);
    const face = atlasPanel(width, height, signMat, atlas.uv(cell), 'SignFace');
    face.position.copy(onRoad(frame, lat * 0.12, lift - height / 2 + 0.4));
    face.position.addScaledVector(frame.tangent, -0.12);
    face.rotation.y = frame.heading;
    g.add(face);
    const backing = standing(width, height, 0.18, M.signBack, 'SignBacking');
    backing.position.copy(onRoad(frame, lat * 0.12, lift - height + 0.4));
    backing.rotation.y = frame.heading;
    g.add(backing);
    static_.add(g);
  };
  gantrySign(900, 4, { lat: -12 });
  gantrySign(1650, 5, { lat: 12 });
  gantrySign(2980, 7, { lat: -11 });

  /* -- corner boards and marshal posts ------------------------------------ */

  const corners = [];
  let previous = 0;
  for (const sample of track.samples) {
    const turning = Math.abs(sample.curvature) > 1 / 150;
    if (turning && sample.s - previous > 140) {
      corners.push(sample.s);
      previous = sample.s;
    }
  }
  const marshal = marshalPost(M);
  corners.slice(0, 6).forEach((s, i) => {
    const frame = track.frameAt(s - 55);
    const side = frame.curvature > 0 ? 1 : -1;
    const board = makeGroup('CornerBoard');
    const legs = standing(0.14, 2.6, 0.14, M.steelDark, 'BoardLeg');
    legs.position.x = -1.1;
    board.add(legs);
    const legs2 = legs.clone();
    legs2.position.x = 1.1;
    board.add(legs2);
    const face = atlasPanel(3, 1.5, signMat, atlas.uv(8 + i), 'CornerNumber');
    face.position.set(0, 3.1, 0.14);
    board.add(face);
    const backing = standing(3, 1.5, 0.12, M.signBack, 'CornerBacking');
    backing.position.set(0, 2.35, 0);
    board.add(backing);
    static_.add(place(board, onRoad(frame, side * (frame.halfWidth + 8.5), 0), {
      rotationY: frame.heading,
    }));

    // A marshal post just past the apex, with a flashing light on the roof.
    const postFrame = track.frameAt(s + 30);
    const at = onRoad(postFrame, -(postFrame.halfWidth + 9), 0);
    static_.add(place(marshal, at, { rotationY: postFrame.heading }));
    const lamp = beacon(M, 0xffa02a, 0.16);
    lamp.position.copy(at).setY(at.y + 2.7);
    animated.add(lamp);
    lights.flashers.push(lamp);
  });

  /* -- sponsor arches ----------------------------------------------------- */

  for (const [s, cell] of [[520, 2], [1780, 15], [2760, 0]]) {
    const frame = track.frameAt(s);
    const arch = makeGroup('SponsorArch');
    const width = frame.width + 12;
    for (const side of [-1, 1]) {
      const column = post(0.9, 8.5, M.barrierRed, { segments: 10, name: 'ArchLeg' });
      column.position.copy(onRoad(frame, side * (frame.halfWidth + 4.5), 0));
      arch.add(column);
    }
    const top = standing(width, 2.6, 1.6, M.barrierRed, 'ArchTop');
    top.position.copy(onRoad(frame, 0, 8.5));
    top.rotation.y = frame.heading;
    arch.add(top);
    for (const turn of [0, Math.PI]) {
      const face = atlasPanel(width * 0.8, 2.1, signMat, atlas.uv(cell), 'ArchFace');
      face.position.copy(onRoad(frame, 0, 9.8));
      face.rotation.y = frame.heading + turn;
      arch.add(face);
    }
    static_.add(arch);
  }

  /* -- roadside advertising ------------------------------------------------ */

  for (let i = 0; i < 26; i++) {
    const s = (i / 26) * track.length + 14;
    const frame = track.frameAt(s);
    if (frame.district === 'tunnel' || frame.elevated) continue;
    const side = i % 2 ? 1 : -1;
    const hoarding = makeGroup('Hoarding');
    const face = atlasPanel(6.4, 1.5, signMat, atlas.uv([0, 2, 15, 3][i % 4]), 'HoardingFace');
    face.position.set(0, 1.05, 0.12);
    hoarding.add(face);
    const back = standing(6.4, 1.5, 0.16, M.signBack, 'HoardingBack');
    back.position.y = 0.3;
    hoarding.add(back);
    static_.add(place(hoarding, onRoad(frame, side * (frame.halfWidth + 3.2), 0.1), {
      rotationY: frame.heading,
    }));
  }

  return atlas;
}

/** Grandstands, big screens and standing crowds where the spectators gather. */
function spectators(world, static_, animated, atlas) {
  const { track, M, rng } = world;

  // Main stand opposite the pits, on the start straight.
  for (let i = 0; i < 3; i++) {
    const frame = track.frameAt(60 + i * 48);
    const stand = grandstand(M, rng, { length: 44, rows: 11 });
    static_.add(place(stand, onRoad(frame, frame.halfWidth + 11, 0), {
      rotationY: frame.heading + Math.PI / 2,
    }));
  }
  // Two more around the outside of Turn 1.
  for (const s of [560, 620]) {
    const frame = track.frameAt(s);
    const stand = grandstand(M, rng, { length: 38, rows: 8 });
    static_.add(place(stand, onRoad(frame, frame.halfWidth + 13, 0), {
      rotationY: frame.heading + Math.PI / 2,
    }));
  }
  // And a temporary stand on the hairpin, where the overtaking happens.
  const hairpin = track.frameAt(2260);
  static_.add(place(grandstand(M, rng, { length: 34, rows: 7 }),
    onRoad(hairpin, -(hairpin.halfWidth + 12), 0),
    { rotationY: hairpin.heading - Math.PI / 2 }));

  // Big screen by the start line.
  const screenFrame = track.frameAt(150);
  const screen = makeGroup('BigScreen');
  for (const sx of [-4, 4]) {
    const leg = standing(0.9, 9, 0.9, M.steelDark, 'ScreenLeg');
    leg.position.x = sx;
    screen.add(leg);
  }
  const cabinet = standing(12.5, 7.2, 1.2, M.steelDark, 'ScreenCabinet');
  cabinet.position.y = 9;
  screen.add(cabinet);
  const face = atlasPanel(11.6, 6.4, world.signMaterial, atlas.uv(15), 'ScreenFace');
  face.position.set(0, 12.6, -0.65);
  face.rotation.y = Math.PI;
  screen.add(face);
  static_.add(place(screen, onRoad(screenFrame, screenFrame.halfWidth + 26, 0), {
    rotationY: screenFrame.heading,
  }));
}

/** Containers, cranes, bollards and the clutter of a working quay. */
function docks(world, static_, animated, lights) {
  const { track, M, rng, ground, isWater } = world;
  const runs = [...districtRuns(track, 'docks'), ...districtRuns(track, 'hairpin')];

  for (const run of runs) {
    for (let s = run.from; s < run.to; s += rng.range(14, 30)) {
      const frame = track.frameAt(s);
      for (const side of [-1, 1]) {
        if (!rng.chance(0.75)) continue;
        const lat = side * (frame.halfWidth + rng.range(12, 46));
        const p = onRoad(frame, lat, 0);
        if (isWater(p.x, p.z)) continue;
        if (track.distanceToRoad(p.x, p.z) < 10) continue;
        const stack = containerStack(M, rng);
        stack.position.set(p.x, ground(p.x, p.z), p.z);
        stack.rotation.y = frame.heading + (rng.chance(0.5) ? 0 : Math.PI / 2) + rng.jitter(0.04);
        static_.add(stack);
      }
    }
  }

  // Three cranes along the seaward edge of the quay.
  for (const s of [1800, 1960, 2120]) {
    const frame = track.frameAt(s);
    const p = onRoad(frame, frame.halfWidth + 62, 0);
    const crane = quayCrane(M, rng);
    crane.position.set(p.x, ground(p.x, p.z) + 0.2, p.z);
    crane.rotation.y = frame.heading + Math.PI / 2;
    static_.add(crane);
    const lamp = beacon(M);
    lamp.position.copy(crane.userData.beacon).applyEuler(crane.rotation).add(crane.position);
    animated.add(lamp);
    lights.beacons.push(lamp);
  }

  // Bollards and mooring rings along the quay wall.
  for (let z = -180; z < 420; z += 22) {
    const x = 594;
    const bollard = post(0.34, 1.0, M.steelDark, { segments: 8, taper: 1.25, name: 'Bollard' });
    bollard.position.set(x, ground(x, z), z);
    static_.add(bollard);
  }

  // Stacked pallets and oil drums near the road.
  for (let i = 0; i < 40; i++) {
    const s = rng.range(1754, 2400);
    const frame = track.frameAt(s);
    const side = rng.chance(0.5) ? -1 : 1;
    const p = onRoad(frame, side * (frame.halfWidth + rng.range(7, 14)), 0);
    if (isWater(p.x, p.z)) continue;
    const drum = post(0.32, 0.9, rng.pick([M.rust, M.containerBlue, M.containerOchre]), {
      segments: 8, name: 'Drum',
    });
    drum.position.set(p.x, ground(p.x, p.z), p.z);
    static_.add(drum);
  }
}

/** Silos, chimneys, pipework and a level crossing. */
function industry(world, static_, animated, lights) {
  const { track, M, rng, ground } = world;

  const silos = makeGroup('Silos');
  for (let i = 0; i < 5; i++) {
    const frame = track.frameAt(2440 + i * 12);
    const p = onRoad(frame, -(frame.halfWidth + 34), 0);
    const silo = post(4.5, rng.range(18, 26), M.corrugated, { segments: 14, name: 'Silo' });
    silo.position.set(p.x, ground(p.x, p.z), p.z);
    silos.add(silo);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(4.7, 3, 14), M.steelDark);
    cap.position.set(p.x, silo.position.y + silo.geometry.parameters.height + 1.5, p.z);
    silos.add(cap);
  }
  static_.add(silos);

  // Chimney stacks, with warning lights near the top.
  for (const [s, lat] of [[2500, 62], [2620, -74]]) {
    const frame = track.frameAt(s);
    const p = onRoad(frame, lat, 0);
    const height = 52;
    const stack = post(3.4, height, M.brick, { segments: 12, taper: 0.62, name: 'Chimney' });
    stack.position.set(p.x, ground(p.x, p.z), p.z);
    static_.add(stack);
    const band = post(2.3, 2, M.barrierRed, { segments: 12, name: 'ChimneyBand' });
    band.position.set(p.x, stack.position.y + height - 6, p.z);
    static_.add(band);
    const lamp = beacon(M, 0xff3b2a, 0.6);
    lamp.position.set(p.x, stack.position.y + height + 0.6, p.z);
    lamp.name = 'ChimneyLamp';
    animated.add(lamp);
    lights.beacons.push(lamp);
  }

  // Overhead pipe bridge crossing the road.
  const pipeFrame = track.frameAt(2560);
  const bridge = makeGroup('PipeBridge');
  for (const side of [-1, 1]) {
    const leg = standing(1.2, 9.5, 1.2, M.rust, 'PipeLeg');
    leg.position.copy(onRoad(pipeFrame, side * (pipeFrame.halfWidth + 6), 0));
    leg.rotation.y = pipeFrame.heading;
    bridge.add(leg);
  }
  for (let i = 0; i < 3; i++) {
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, pipeFrame.width + 14, 10),
      i % 2 ? M.rust : M.paintedSteel
    );
    pipe.rotation.z = Math.PI / 2;
    pipe.position.copy(onRoad(pipeFrame, 0, 9.6 + i * 0.1));
    pipe.position.y += i * 1.15;
    pipe.rotation.y = pipeFrame.heading;
    pipe.castShadow = true;
    bridge.add(pipe);
  }
  static_.add(bridge);

  // Disused level crossing: rails and gravel across the industrial straight.
  const crossing = track.frameAt(2660);
  const bed = slab(crossing.width + 30, 7, M.verge, 'RailBed');
  bed.position.copy(onRoad(crossing, 0, 0.03));
  bed.rotation.y = crossing.heading + Math.PI / 2;
  static_.add(bed);
  for (const offset of [-0.72, 0.72]) {
    const railGeo = new THREE.BoxGeometry(crossing.width + 30, 0.16, 0.12);
    const rail = new THREE.Mesh(railGeo, M.rail);
    rail.position.copy(onRoad(crossing, 0, 0.1));
    rail.position.addScaledVector(crossing.tangent, offset);
    rail.rotation.y = crossing.heading + Math.PI / 2;
    static_.add(rail);
  }
}

/** Trees, hedges and benches along the riverside park. */
function park(world, static_) {
  const { track, M, rng, ground, isWater } = world;

  for (const district of ['park', 'chicane', 'downtown', 'grandstand']) {
    const density = district === 'park' ? 6 : 26;
    for (const run of districtRuns(track, district)) {
      for (let s = run.from; s < run.to; s += rng.range(density * 0.7, density * 1.4)) {
        const frame = track.frameAt(s);
        if (frame.elevated) continue;
        for (const side of [-1, 1]) {
          if (!rng.chance(district === 'park' ? 0.95 : 0.5)) continue;
          const lat = side * (frame.halfWidth + rng.range(7.5, 16));
          const p = onRoad(frame, lat, 0);
          if (isWater(p.x, p.z)) continue;
          if (track.distanceToRoad(p.x, p.z) < 6.5) continue;
          const node = tree(M, rng);
          node.position.set(p.x, ground(p.x, p.z) - 0.1, p.z);
          node.rotation.y = rng() * Math.PI * 2;
          static_.add(node);
        }
      }
    }
  }

  // A hedge run and some benches through the park proper.
  for (const run of districtRuns(track, 'park')) {
    for (let s = run.from; s < run.to; s += 4) {
      const frame = track.frameAt(s);
      const hedge = standing(3.8, rng.range(1.1, 1.5), 1.6, M.hedge, 'Hedge');
      const p = onRoad(frame, -(frame.halfWidth + 9), 0);
      hedge.position.set(p.x, ground(p.x, p.z), p.z);
      hedge.rotation.y = frame.heading;
      static_.add(hedge);
    }
  }
}

/** Market stalls, scaffolding and road works through the chicane. */
function marketAndWorks(world, static_, animated, lights) {
  const { track, M, rng, ground } = world;
  const coneProto = cone(M);

  // Stalls with striped awnings behind the barriers.
  for (const run of districtRuns(track, 'chicane')) {
    for (let s = run.from + 6; s < run.to - 6; s += rng.range(7, 11)) {
      const frame = track.frameAt(s);
      const side = rng.chance(0.5) ? -1 : 1;
      const stall = makeGroup('MarketStall');
      const table = standing(3.2, 0.9, 1.8, M.bark, 'StallTable');
      stall.add(table);
      const awning = standing(3.6, 0.24, 2.4, rng.chance(0.5) ? M.barrierRed : M.barrierWhite, 'Awning');
      awning.position.y = 2.4;
      stall.add(awning);
      for (const sx of [-1.5, 1.5]) {
        const leg = standing(0.09, 2.4, 0.09, M.steel, 'StallLeg');
        leg.position.x = sx;
        stall.add(leg);
      }
      const p = onRoad(frame, side * (frame.halfWidth + rng.range(7, 11)), 0);
      stall.position.set(p.x, ground(p.x, p.z), p.z);
      stall.rotation.y = frame.heading + rng.jitter(0.2);
      static_.add(stall);
    }
  }

  // Scaffolded building and a tower crane over the chicane.
  const site = track.frameAt(3080);
  const sitePoint = onRoad(site, -(site.halfWidth + 40), 0);
  const scaffold = makeGroup('Scaffold');
  for (let x = -14; x <= 14; x += 3.5) {
    for (let y = 0; y <= 18; y += 2) {
      const bar = standing(0.09, 2, 0.09, M.steel, 'ScaffoldPost');
      bar.position.set(x, y, 0);
      scaffold.add(bar);
    }
  }
  for (let y = 2; y <= 18; y += 2) {
    const deckBar = standing(29, 0.12, 1.1, M.bark, 'ScaffoldDeck');
    deckBar.position.set(0, y, 0);
    scaffold.add(deckBar);
  }
  scaffold.position.set(sitePoint.x, ground(sitePoint.x, sitePoint.z), sitePoint.z);
  scaffold.rotation.y = site.heading;
  static_.add(scaffold);

  const crane = makeGroup('TowerCrane');
  const mast = standing(2, 58, 2, M.signYellow, 'CraneMast');
  crane.add(mast);
  const jib = standing(56, 1.6, 1.6, M.signYellow, 'CraneJib');
  jib.position.set(16, 58, 0);
  crane.add(jib);
  const counter = standing(14, 2.4, 2.4, M.steelDark, 'CraneCounter');
  counter.position.set(-14, 58, 0);
  crane.add(counter);
  const cab = standing(3, 2.6, 3, M.paintedSteel, 'CraneCab');
  cab.position.set(2, 56, 0);
  crane.add(cab);
  const cranePoint = onRoad(site, -(site.halfWidth + 66), 0);
  crane.position.set(cranePoint.x, ground(cranePoint.x, cranePoint.z), cranePoint.z);
  crane.rotation.y = site.heading + 0.7;
  static_.add(crane);
  const craneLamp = beacon(M, 0xff3b2a);
  craneLamp.position.set(42, 60, 0).applyEuler(crane.rotation).add(crane.position);
  craneLamp.name = 'CraneTipLamp';
  animated.add(craneLamp);
  lights.beacons.push(craneLamp);

  // Cones and works barriers pinching the road through the chicane, and at the
  // pit entry - the sort of thing you learn the line around.
  for (const [from, to, side] of [[3030, 3070, -1], [3096, 3130, 1], [2905, 2930, 1]]) {
    for (let s = from; s < to; s += 4) {
      const frame = track.frameAt(s);
      const p = onRoad(frame, side * (frame.halfWidth - 0.6), 0.02);
      const node = place(coneProto, p, { rotationY: frame.heading });
      static_.add(node);
    }
  }
}

/** Street signs, traffic lights and bins through the city districts. */
function cityDressing(world, static_, atlas) {
  const { track, M, rng, ground } = world;
  const signal = trafficLight(M);

  // Traffic lights at the junctions the course passes through.
  for (const s of [214, 366, 2514, 2694, 3084]) {
    const frame = track.frameAt(s);
    for (const side of [-1, 1]) {
      // Both heads face back down the road, at whoever is arriving.
      static_.add(place(signal, onRoad(frame, side * (frame.halfWidth + 2.4), 0.16), {
        rotationY: frame.heading,
      }));
    }
  }

  // Speed-limit plates and street signs on the pavements.
  for (let i = 0; i < 22; i++) {
    const s = rng() * track.length;
    const frame = track.frameAt(s);
    if (frame.settings.verge !== 'pavement' || frame.elevated) continue;
    const side = rng.chance(0.5) ? -1 : 1;
    const g = makeGroup('StreetSign');
    g.add(post(0.06, 2.6, M.steel, { segments: 6, name: 'SignPost' }));
    const face = atlasPanel(1.5, 0.75, world.signMaterial, atlas.uv(rng.chance(0.5) ? 6 : 7), 'StreetSignFace');
    face.position.set(0, 2.4, 0.07);
    g.add(face);
    const backing = standing(1.5, 0.75, 0.08, M.signBack, 'StreetSignBack');
    backing.position.set(0, 2.02, 0);
    g.add(backing);
    static_.add(place(g, onRoad(frame, side * (frame.halfWidth + 2.6), 0.16), {
      rotationY: frame.heading,
    }));
  }

  // Bins, bollards and phone boxes to break up the pavement edge.
  for (let i = 0; i < 90; i++) {
    const s = rng() * track.length;
    const frame = track.frameAt(s);
    if (frame.settings.verge !== 'pavement' || frame.elevated) continue;
    const side = rng.chance(0.5) ? -1 : 1;
    const p = onRoad(frame, side * (frame.halfWidth + rng.range(1.6, 4.6)), 0.16);
    const kind = rng();
    let node;
    if (kind < 0.45) {
      node = post(0.34, 1.05, M.steelDark, { segments: 8, name: 'Bin' });
    } else if (kind < 0.8) {
      node = post(0.12, 0.95, M.steelDark, { segments: 6, taper: 1.3, name: 'StreetBollard' });
    } else {
      node = standing(1.1, 2.5, 1.1, M.barrierRed, 'Kiosk');
    }
    node.position.copy(p);
    node.rotation.y = frame.heading;
    static_.add(node);
  }
}

/** The rail yard the viaduct strides over. */
function railYard(world, static_) {
  const { track, M, rng, ground } = world;
  const yard = makeGroup('RailYard');

  for (const run of districtRuns(track, 'flyover')) {
    for (let lane = -4; lane <= 4; lane++) {
      const geos = [];
      for (let s = run.from - 40; s < run.to + 40; s += 24) {
        const frame = track.frameAt(s);
        const p = onRoad(frame, lane * 7, 0);
        const y = track.terrainHeight(p.x, p.z);
        for (const offset of [-0.72, 0.72]) {
          const rail = new THREE.BoxGeometry(24, 0.16, 0.12);
          rail.rotateY(frame.heading + Math.PI / 2);
          rail.translate(p.x, y + 0.2, p.z);
          geos.push(rail);
        }
        // Ballast under the sleepers.
        const bed = new THREE.BoxGeometry(24, 0.3, 3.2);
        bed.rotateY(frame.heading + Math.PI / 2);
        bed.translate(p.x, y + 0.05, p.z);
        geos.push(bed);
      }
      const merged = meshOf(mergeAll(geos), lane % 2 ? M.rail : M.verge, `RailLane${lane}`, { receive: true });
      if (merged) yard.add(merged);
    }
  }
  static_.add(yard);
}

/* -------------------------------------------------------------------------- */

/**
 * Build every prop on the course.
 *
 * @param {object} world { track, M, rng, ground, isWater }
 * @returns {{object: THREE.Group, lights: object}}
 */
export function buildProps(world) {
  const group = new THREE.Group();
  group.name = 'Props';

  const static_ = new THREE.Group();
  const animated = new THREE.Group();
  animated.name = 'LiveProps';
  const lights = { lamps: [], beacons: [], flashers: [], startLights: [] };

  const atlas = raceFurniture(world, static_, animated, lights);
  lighting(world, static_);
  spectators(world, static_, animated, atlas);
  docks(world, static_, animated, lights);
  industry(world, static_, animated, lights);
  park(world, static_);
  marketAndWorks(world, static_, animated, lights);
  cityDressing(world, static_, atlas);
  railYard(world, static_);

  group.add(bakeChunks(static_, world.track, { chunks: 18, name: 'StaticProps' }));
  group.add(animated);

  return { object: group, lights, atlas };
}
