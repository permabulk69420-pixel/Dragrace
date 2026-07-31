/**
 * The drag strip: prepped surface, markings, walls, the christmas tree and a
 * scoreboard. The strip runs from the start line at z = 0 toward -Z, so the
 * car's forward axis and the player's default gaze both point down the track.
 */
import * as THREE from 'three';
import { roundedBox, mesh, group, mergeStatic } from '../car/geom.js';
import { SPEC } from '../car/spec.js';
import { createScoreboard } from '../car/gauges.js';

const STRIP_LENGTH = 620;   // includes the shutdown area past the finish
const STRIP_WIDTH = 15.2;
const FT = 0.3048;

function asphaltTexture(repeat = 40) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#2b2c30';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const v = Math.random();
    g.fillStyle = `rgba(${v > 0.6 ? 150 : 20},${v > 0.6 ? 150 : 20},${v > 0.6 ? 160 : 24},${0.05 + Math.random() * 0.25})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function line(material, w, l, x, z, y = 0.005) {
  const m = mesh(new THREE.PlaneGeometry(w, l), material, 'Marking', { cast: false, receive: false });
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

function textTexture(text, { width = 512, height = 256, size = 150, colour = '#ffffff', bg = null } = {}) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, width, height); }
  g.fillStyle = colour;
  g.font = `800 ${size}px ui-sans-serif, system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, width / 2, height / 2 + size * 0.04);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* -------------------------------------------------------------------------- */

/** The christmas tree, with lamps the race controller switches on and off. */
function christmasTree() {
  const g = group('ChristmasTree');
  g.position.set(-4.6, 0, 1.2);

  const pole = mesh(new THREE.BoxGeometry(0.26, 4.2, 0.26), new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.7 }), 'TreePole');
  pole.position.y = 2.1;
  g.add(pole);

  const backing = mesh(roundedBox(0.62, 2.7, 0.12, 0.04), new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.85 }), 'TreeBacking');
  backing.position.set(0, 2.6, 0.09);
  g.add(backing);

  const lamps = { preStage: [], stage: [], amber: [[], [], []], green: [], red: [] };

  const makeLamp = (colour, y, x) => {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      emissive: colour,
      emissiveIntensity: 0,
      roughness: 0.35,
    });
    const lens = mesh(new THREE.SphereGeometry(0.115, 14, 12), mat, 'Lamp', { cast: false });
    lens.position.set(x, y, 0.16);
    lens.scale.z = 0.55;
    g.add(lens);
    const ring = mesh(new THREE.TorusGeometry(0.125, 0.02, 6, 18), new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.6 }), 'LampRing', { cast: false });
    ring.position.set(x, y, 0.17);
    g.add(ring);
    return mat;
  };

  // Two columns, one per lane, though only the near lane is used.
  for (const x of [-0.16, 0.16]) {
    lamps.preStage.push(makeLamp(0xffe9a8, 3.62, x));
    lamps.stage.push(makeLamp(0xffe9a8, 3.34, x));
    for (let i = 0; i < 3; i++) lamps.amber[i].push(makeLamp(0xffa714, 2.98 - i * 0.34, x));
    lamps.green.push(makeLamp(0x2bff5e, 1.86, x));
    lamps.red.push(makeLamp(0xff2418, 1.50, x));
  }

  const set = (list, on) => list.forEach((m) => { m.emissiveIntensity = on ? 3.2 : 0; });
  return {
    object: g,
    apply(state) {
      set(lamps.preStage, state.preStage);
      set(lamps.stage, state.stage);
      for (let i = 0; i < 3; i++) set(lamps.amber[i], state.amber[i]);
      set(lamps.green, state.green);
      set(lamps.red, state.red);
    },
  };
}

/** Trackside scoreboard driven by a canvas texture. */
function scoreboard() {
  const board = createScoreboard();
  const g = group('Scoreboard');
  g.position.set(-11.5, 0, -46);
  g.rotation.y = 0.55;

  for (const x of [-2.4, 2.4]) {
    const leg = mesh(new THREE.CylinderGeometry(0.12, 0.14, 3.6, 8), new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.8 }), 'BoardLeg');
    leg.position.set(x, 1.8, 0);
    g.add(leg);
  }
  const frame = mesh(roundedBox(6.4, 3.4, 0.3, 0.06), new THREE.MeshStandardMaterial({ color: 0x101216, roughness: 0.7 }), 'BoardFrame');
  frame.position.y = 5.2;
  g.add(frame);
  const face = mesh(
    new THREE.PlaneGeometry(6.0, 3.0),
    board.texture
      ? new THREE.MeshBasicMaterial({ map: board.texture, toneMapped: false })
      : new THREE.MeshBasicMaterial({ color: 0x111111 }),
    'BoardFace',
    { cast: false }
  );
  face.position.set(0, 5.2, 0.17);
  g.add(face);
  return { object: g, draw: board.draw };
}

/* -------------------------------------------------------------------------- */

export function buildTrack() {
  const g = group('Track');

  const asphalt = new THREE.MeshStandardMaterial({
    color: 0x33353a,
    roughness: 0.95,
    metalness: 0,
    map: asphaltTexture(60),
  });
  const prepped = new THREE.MeshStandardMaterial({
    color: 0x26282d,
    roughness: 0.66,
    metalness: 0.05,
    map: asphaltTexture(24),
  });
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.7, emissive: 0x1a1a1a });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xffc233, roughness: 0.7 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0x9aa0aa, roughness: 0.9 });
  const grass = new THREE.MeshStandardMaterial({ color: 0x1e2a1c, roughness: 1 });

  // Ground beyond the tarmac.
  const ground = mesh(new THREE.PlaneGeometry(1400, 1600), grass, 'Ground', { cast: false, receive: true });
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.02, -STRIP_LENGTH / 2 + 60);
  g.add(ground);

  // The tarmac apron and the prepped racing surface.
  const apron = mesh(new THREE.PlaneGeometry(46, STRIP_LENGTH + 120), asphalt, 'Apron', { cast: false, receive: true });
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(0, -0.005, -STRIP_LENGTH / 2 + 40);
  g.add(apron);

  const strip = mesh(new THREE.PlaneGeometry(STRIP_WIDTH, STRIP_LENGTH), prepped, 'Strip', { cast: false, receive: true });
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(0, 0.001, -STRIP_LENGTH / 2 + 30);
  g.add(strip);

  // Rubber laid down in the groove.
  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x101115, roughness: 0.45, transparent: true, opacity: 0.85 });
  for (const x of [-3.5, 3.5]) {
    const groove = mesh(new THREE.PlaneGeometry(2.6, 420), rubberMat, 'Groove', { cast: false });
    groove.rotation.x = -Math.PI / 2;
    groove.position.set(x, 0.002, -190);
    g.add(groove);
  }

  // Centre and edge lines.
  g.add(line(yellow, 0.14, STRIP_LENGTH, 0, -STRIP_LENGTH / 2 + 30));
  for (const x of [-STRIP_WIDTH / 2 + 0.3, STRIP_WIDTH / 2 - 0.3]) {
    g.add(line(white, 0.16, STRIP_LENGTH, x, -STRIP_LENGTH / 2 + 30));
  }

  // Staging beams and the start line.
  g.add(line(white, STRIP_WIDTH, 0.22, 0, 0));
  g.add(line(white, STRIP_WIDTH, 0.10, 0, 0.55));

  // Distance markings.
  const marks = [
    [60 * FT, '60'],
    [330 * FT, '330'],
    [SPEC.eighthMile, '1/8'],
    [1000 * FT, '1000'],
    [SPEC.quarterMile, 'FINISH'],
  ];
  for (const [d, label] of marks) {
    const isFinish = label === 'FINISH';
    g.add(line(isFinish ? white : yellow, STRIP_WIDTH, isFinish ? 0.4 : 0.16, 0, -d));
    const tex = textTexture(label, { size: label.length > 3 ? 90 : 140 });
    const sign = mesh(
      new THREE.PlaneGeometry(2.4, 1.2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }),
      `Marker_${label}`,
      { cast: false }
    );
    sign.position.set(-9.4, 1.5, -d);
    sign.rotation.y = Math.PI / 2;
    g.add(sign);
  }

  // Concrete walls with a sponsor stripe. Everything from here to the tree is
  // static scenery, so it is collected and baked into a handful of meshes.
  const props = group('TrackProps');
  const wallMat = concrete;
  for (const s of [-1, 1]) {
    const wall = mesh(new THREE.BoxGeometry(0.4, 1.1, STRIP_LENGTH), wallMat, `Wall_${s < 0 ? 'L' : 'R'}`, { receive: true });
    wall.position.set(s * (STRIP_WIDTH / 2 + 2.2), 0.55, -STRIP_LENGTH / 2 + 30);
    props.add(wall);
    const stripe = mesh(new THREE.BoxGeometry(0.42, 0.22, STRIP_LENGTH), new THREE.MeshStandardMaterial({ color: 0xd93b2b, roughness: 0.8 }), 'WallStripe', { cast: false });
    stripe.position.set(s * (STRIP_WIDTH / 2 + 2.2), 0.95, -STRIP_LENGTH / 2 + 30);
    props.add(stripe);
    // Catch fence posts.
    for (let i = 0; i < 26; i++) {
      const post = mesh(new THREE.BoxGeometry(0.09, 2.6, 0.09), new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.8 }), 'FencePost');
      post.position.set(s * (STRIP_WIDTH / 2 + 2.4), 2.4, 20 - i * 20);
      props.add(post);
    }
  }

  // Grandstand on the left, floodlight towers along both sides.
  const stand = group('Grandstand');
  for (let i = 0; i < 9; i++) {
    const tier = mesh(new THREE.BoxGeometry(3.0, 0.55, 60), new THREE.MeshStandardMaterial({ color: i % 2 ? 0x30343c : 0x272a31, roughness: 0.9 }), `Tier${i}`, { receive: true });
    tier.position.set(-30 - i * 1.2, 0.9 + i * 0.55, -60);
    stand.add(tier);
  }
  props.add(stand);

  const towerMat = new THREE.MeshStandardMaterial({ color: 0x22252b, roughness: 0.8 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4dd, emissiveIntensity: 2.2, roughness: 0.4 });
  for (let i = 0; i < 8; i++) {
    for (const s of [-1, 1]) {
      const z = 10 - i * 60;
      const tower = mesh(new THREE.CylinderGeometry(0.16, 0.24, 13, 6), towerMat, 'FloodTower');
      tower.position.set(s * 24, 6.5, z);
      props.add(tower);
      const head = mesh(new THREE.BoxGeometry(2.6, 0.7, 0.4), towerMat, 'FloodHead');
      head.position.set(s * 24, 13.2, z);
      props.add(head);
      for (let k = 0; k < 4; k++) {
        const lamp = mesh(new THREE.BoxGeometry(0.5, 0.45, 0.12), lampMat, 'Flood', { cast: false });
        lamp.position.set(s * 24 - 0.9 + k * 0.6, 13.2, z - s * 0.26);
        props.add(lamp);
      }
    }
  }

  // Timing-light stanchions at the finish.
  for (const s of [-1, 1]) {
    const post = mesh(new THREE.BoxGeometry(0.18, 2.4, 0.18), towerMat, 'FinishPost');
    post.position.set(s * (STRIP_WIDTH / 2 + 1.2), 1.2, -SPEC.quarterMile);
    props.add(post);
    const beam = mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), lampMat, 'FinishBeam', { cast: false });
    beam.position.set(s * (STRIP_WIDTH / 2 + 1.2), 1.6, -SPEC.quarterMile);
    props.add(beam);
  }

  g.add(mergeStatic(props, 'TrackProps'));

  const tree = christmasTree();
  g.add(tree.object);
  const board = scoreboard();
  g.add(board.object);

  // Water box behind the line, for burnouts.
  const waterBox = mesh(
    new THREE.PlaneGeometry(9, 9),
    new THREE.MeshStandardMaterial({ color: 0x0d0e12, roughness: 0.28, metalness: 0.1 }),
    'WaterBox',
    { cast: false }
  );
  waterBox.rotation.x = -Math.PI / 2;
  waterBox.position.set(0, 0.003, 9.5);
  g.add(waterBox);

  return { object: g, tree, scoreboard: board };
}
