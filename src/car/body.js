/**
 * Exterior of the car: a pro-street muscle coupe.
 *
 * The whole outer skin is ONE lofted shell so there are no seams between the
 * nose, doors and tail. Cross-sections are listed below as a table of stations
 * along the length of the car; the loft skips profile segments where the cabin
 * opening and the wheel arches are, and switches material per segment so the
 * hood is carbon and the underside is matte black.
 *
 * Axes: -Z is forward, +X is the passenger (right) side, Y is up, ground = 0.
 */
import * as THREE from 'three';
import { loft, bodySection, tube, roundedBox, panel, mesh, group, bakeInto } from './geom.js';
import { SPEC } from './spec.js';

/* -------------------------------------------------------------------------- */
/* Cross-section stations                                                      */
/* -------------------------------------------------------------------------- */

// z, underside, top, half-widths and the height of the widest point.
// `tuck` narrows the lower half so a wheel can sit in the arch; `cabin` opens
// the top; `arch` marks the sections whose sides are cut away.
const STATIONS = [
  { z: -2.44, yBot: 0.34, yTop: 0.780, hwBot: 0.58, hwMax: 0.74, yMax: 0.60, hwTop: 0.56, crown: 0.005 },
  { z: -2.34, yBot: 0.24, yTop: 0.840, hwBot: 0.74, hwMax: 0.90, yMax: 0.62, hwTop: 0.70, crown: 0.010 },
  { z: -2.10, yBot: 0.19, yTop: 0.900, hwBot: 0.84, hwMax: 0.95, yMax: 0.64, hwTop: 0.78, crown: 0.015 },
  { z: -1.94, yBot: 0.18, yTop: 0.930, hwBot: 0.86, hwMax: 0.96, yMax: 0.66, hwTop: 0.81, crown: 0.018 },
  { z: -1.92, yBot: 0.18, yTop: 0.935, hwBot: 0.86, hwMax: 0.96, yMax: 0.66, hwTop: 0.82, crown: 0.018, arch: 'front', cut: 'partial' },
  { z: -1.80, yBot: 0.18, yTop: 0.945, hwBot: 0.86, hwMax: 0.96, yMax: 0.66, hwTop: 0.83, crown: 0.018, arch: 'front', cut: 'full' },
  { z: -1.45, yBot: 0.18, yTop: 0.965, hwBot: 0.86, hwMax: 0.97, yMax: 0.66, hwTop: 0.84, crown: 0.020, arch: 'front', cut: 'full' },
  { z: -1.12, yBot: 0.18, yTop: 0.980, hwBot: 0.86, hwMax: 0.97, yMax: 0.68, hwTop: 0.84, crown: 0.020, arch: 'front', cut: 'full' },
  { z: -1.00, yBot: 0.18, yTop: 0.985, hwBot: 0.86, hwMax: 0.97, yMax: 0.68, hwTop: 0.84, crown: 0.020, arch: 'front', cut: 'partial' },
  { z: -0.98, yBot: 0.17, yTop: 0.985, hwBot: 0.87, hwMax: 0.97, yMax: 0.68, hwTop: 0.84, crown: 0.020 },
  { z: -0.85, yBot: 0.16, yTop: 1.000, hwBot: 0.88, hwMax: 0.97, yMax: 0.70, hwTop: 0.83, crown: 0.015 },
  { z: -0.62, yBot: 0.16, yTop: 1.020, hwBot: 0.88, hwMax: 0.97, yMax: 0.72, hwTop: 0.80, crown: 0.005, cabin: true },
  { z: -0.10, yBot: 0.16, yTop: 1.030, hwBot: 0.89, hwMax: 0.98, yMax: 0.72, hwTop: 0.79, crown: 0.000, cabin: true },
  { z: 0.45, yBot: 0.165, yTop: 1.030, hwBot: 0.90, hwMax: 0.98, yMax: 0.72, hwTop: 0.79, crown: 0.000, cabin: true },
  { z: 0.90, yBot: 0.180, yTop: 1.020, hwBot: 0.91, hwMax: 0.98, yMax: 0.74, hwTop: 0.78, crown: 0.000, cabin: true },
  { z: 0.93, yBot: 0.180, yTop: 1.018, hwBot: 0.91, hwMax: 0.98, yMax: 0.74, hwTop: 0.79, crown: 0.000, arch: 'rear', cut: 'partial' },
  { z: 1.06, yBot: 0.185, yTop: 1.015, hwBot: 0.91, hwMax: 0.98, yMax: 0.74, hwTop: 0.79, crown: 0.004, arch: 'rear', cut: 'full' },
  { z: 1.45, yBot: 0.200, yTop: 1.005, hwBot: 0.92, hwMax: 0.98, yMax: 0.74, hwTop: 0.80, crown: 0.010, arch: 'rear', cut: 'full' },
  { z: 1.86, yBot: 0.215, yTop: 0.995, hwBot: 0.91, hwMax: 0.97, yMax: 0.74, hwTop: 0.79, crown: 0.010, arch: 'rear', cut: 'full' },
  { z: 1.99, yBot: 0.220, yTop: 0.990, hwBot: 0.91, hwMax: 0.97, yMax: 0.74, hwTop: 0.79, crown: 0.010, arch: 'rear', cut: 'partial' },
  { z: 2.01, yBot: 0.220, yTop: 0.985, hwBot: 0.90, hwMax: 0.96, yMax: 0.74, hwTop: 0.78, crown: 0.010 },
  { z: 2.28, yBot: 0.260, yTop: 0.950, hwBot: 0.84, hwMax: 0.90, yMax: 0.74, hwTop: 0.72, crown: 0.010 },
  { z: 2.44, yBot: 0.340, yTop: 0.900, hwBot: 0.70, hwMax: 0.80, yMax: 0.74, hwTop: 0.60, crown: 0.005 },
];

// Profile segments (see bodySection) that make up each region of the ring.
const TOP_SEGMENTS = new Set([6, 7, 8, 9, 10, 11]);   // shoulder over the roof
const FLOOR_SEGMENTS = new Set([0, 17]);              // underside

// How much of the side is cut away for a wheel arch. `full` opens it from the
// rocker up to the arch lip, `partial` only takes the top of the opening, which
// gives the arch a curved leading and trailing edge instead of a square hole.
const ARCH_CUT = {
  full: new Set([2, 3, 4, 13, 14, 15]),
  partial: new Set([3, 4, 14, 15]),
};
const ARCH_TUCK = {
  full: [1, 2, 3, 4, 13, 14, 15, 16],
  partial: [3, 4, 14, 15],
};

const MAT = { PAINT: 0, CARBON: 1, MATTE: 2, INNER: 3 };

function buildShell(M) {
  const sections = STATIONS.map((s) => {
    const tuck = s.arch === 'front' ? SPEC.frontTuck : s.arch === 'rear' ? SPEC.rearTuck : null;
    const pts = bodySection(s);
    if (tuck !== null) {
      // Pull the lower half inboard so the tyre lives in a proper well.
      for (const i of ARCH_TUCK[s.cut ?? 'full']) {
        pts[i] = [Math.sign(pts[i][0]) * Math.min(Math.abs(pts[i][0]), tuck), pts[i][1]];
      }
    }
    return { z: s.z, pts, station: s };
  });

  const geometry = loft(sections, {
    closed: true,
    capStart: true,
    capEnd: true,
    skip: (seg, s) => {
      const a = STATIONS[s], b = STATIONS[s + 1];
      if (a.cabin && b.cabin && TOP_SEGMENTS.has(seg)) return true;      // cabin opening
      if (a.arch && b.arch && a.arch === b.arch) {                        // wheel arch
        // A band is only removed where both of its sections agree to cut it.
        return ARCH_CUT[a.cut ?? 'full'].has(seg) && ARCH_CUT[b.cut ?? 'full'].has(seg);
      }
      return false;
    },
    name: 'bodyShell',
    group: (seg, s) => {
      if (FLOOR_SEGMENTS.has(seg)) return MAT.MATTE;
      if (TOP_SEGMENTS.has(seg)) {
        const z = STATIONS[s].z;
        return z < -0.6 ? MAT.CARBON : MAT.PAINT; // carbon hood, painted deck
      }
      return MAT.PAINT;
    },
  });

  const inner = M.paint.clone();
  inner.name = 'BodyPaintInner';
  inner.side = THREE.DoubleSide;

  const shell = mesh(geometry, [M.paint, M.carbon, M.matte, inner], 'BodyShell', { receive: true });
  return shell;
}

/** Half-cylinder liner that closes off a wheel arch from the inside. */
function wheelWell(M, { z, y, radius, xInner, xOuter, side, liner }) {
  const len = xOuter - xInner;
  // Half a tube, axis along X, arching over the top of the tyre.
  const geo = new THREE.CylinderGeometry(radius, radius, len, 18, 1, true, 0, Math.PI);
  geo.rotateZ(Math.PI / 2);
  const m = mesh(geo, liner, `WheelWell_${side}`, { cast: false });
  m.position.set(side === 'L' ? -(xInner + len / 2) : xInner + len / 2, y, z);

  const cap = mesh(
    new THREE.CircleGeometry(radius, 18, 0, Math.PI),
    liner,
    `WheelWellCap_${side}`,
    { cast: false }
  );
  cap.rotation.y = Math.PI / 2;
  cap.rotation.z = 0;
  cap.position.set(side === 'L' ? -xInner : xInner, y, z);
  return group(`Well_${side}`, m, cap);
}

/** Flared lip around the arch opening - stretched sideways into a fender flare. */
function archLip(M, { z, y, radius, x, tubeR, side }) {
  const geo = new THREE.TorusGeometry(radius, tubeR, 8, 28, Math.PI);
  geo.rotateY(Math.PI / 2);
  geo.scale(2.1, 1, 1); // flatten the tube outwards so it reads as a flare
  const m = mesh(geo, M.paint, `ArchLip_${side}`);
  m.position.set(side === 'L' ? -x : x, y, z);
  return m;
}

/* -------------------------------------------------------------------------- */
/* Detail parts                                                                */
/* -------------------------------------------------------------------------- */

function frontEnd(M, parts) {
  const g = group('FrontEnd');

  // Grille: recessed dark mesh with horizontal bars.
  const grille = mesh(roundedBox(1.42, 0.30, 0.06, 0.03), M.matte, 'Grille');
  grille.position.set(0, 0.62, -2.36);
  g.add(grille);
  for (let i = 0; i < 4; i++) {
    const bar = mesh(roundedBox(1.36, 0.028, 0.03, 0.012), M.chrome, `GrilleBar${i}`);
    bar.position.set(0, 0.52 + i * 0.07, -2.395);
    g.add(bar);
  }
  const badge = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 20), M.chrome, 'Badge');
  badge.rotation.x = Math.PI / 2;
  badge.position.set(0, 0.62, -2.415);
  g.add(badge);

  // Headlights: housing, lens, and an emissive element we can switch on.
  const makeLight = (side) => {
    const s = side === 'L' ? -1 : 1;
    const holder = group(`Headlight_${side}`);
    const housing = mesh(roundedBox(0.34, 0.17, 0.12, 0.045), M.matte, `HeadlightHousing_${side}`);
    housing.position.set(s * 0.58, 0.80, -2.30);
    holder.add(housing);
    for (let i = 0; i < 2; i++) {
      const proj = mesh(new THREE.CylinderGeometry(0.062, 0.055, 0.05, 16), M.chrome, `Projector${i}_${side}`);
      proj.rotation.x = Math.PI / 2;
      proj.position.set(s * (0.50 + i * 0.15), 0.80, -2.345);
      holder.add(proj);
      const emitter = mesh(new THREE.CircleGeometry(0.05, 16), M.headlightGlow, `Emitter${i}_${side}`, { cast: false });
      emitter.rotation.y = Math.PI;
      emitter.position.set(s * (0.50 + i * 0.15), 0.80, -2.372);
      holder.add(emitter);
      parts.headlights.push(emitter);
    }
    const lens = mesh(roundedBox(0.33, 0.155, 0.03, 0.04), M.headlight, `HeadlightLens_${side}`, { cast: false });
    lens.position.set(s * 0.58, 0.80, -2.375);
    holder.add(lens);
    return holder;
  };
  g.add(makeLight('L'), makeLight('R'));

  // Splitter and canards.
  const splitter = mesh(roundedBox(1.44, 0.026, 0.26, 0.012), M.carbon, 'Splitter');
  splitter.position.set(0, 0.248, -2.38);
  g.add(splitter);
  for (const s of [-1, 1]) {
    const canard = mesh(roundedBox(0.26, 0.02, 0.14, 0.01), M.carbon, `Canard_${s < 0 ? 'L' : 'R'}`);
    canard.position.set(s * 0.80, 0.36, -2.28);
    canard.rotation.z = s * -0.12;
    g.add(canard);
  }

  // Tow hook, because it is a race car.
  const hook = mesh(new THREE.TorusGeometry(0.05, 0.014, 6, 16), M.harness, 'TowHook');
  hook.rotation.y = Math.PI / 2;
  hook.position.set(0.70, 0.46, -2.40);
  g.add(hook);
  return bakeInto(g, (o) => o.name.startsWith('Emitter'));
}

function rearEnd(M, parts) {
  const g = group('RearEnd');

  // Full-width light bar with segmented lenses.
  const bar = mesh(roundedBox(1.66, 0.20, 0.06, 0.03), M.matte, 'TailPanel');
  bar.position.set(0, 0.72, 2.44);
  g.add(bar);
  for (let i = 0; i < 6; i++) {
    const x = -0.66 + i * 0.264;
    const lens = mesh(roundedBox(0.22, 0.135, 0.035, 0.02), M.tailLight, `TailLens${i}`, { cast: false });
    lens.position.set(x, 0.72, 2.465);
    g.add(lens);
    parts.tailLights.push(lens);
  }
  for (const s of [-1, 1]) {
    const rev = mesh(roundedBox(0.14, 0.06, 0.03, 0.015), M.reverseLight, `Reverse_${s < 0 ? 'L' : 'R'}`, { cast: false });
    rev.position.set(s * 0.30, 0.58, 2.455);
    g.add(rev);
  }

  // Diffuser.
  const diffuser = mesh(roundedBox(1.60, 0.22, 0.44, 0.02), M.carbon, 'Diffuser');
  diffuser.position.set(0, 0.28, 2.30);
  diffuser.rotation.x = 0.22;
  g.add(diffuser);
  for (let i = 0; i < 5; i++) {
    const fin = mesh(roundedBox(0.02, 0.14, 0.42, 0.008), M.carbon, `DiffuserFin${i}`);
    fin.position.set(-0.6 + i * 0.3, 0.30, 2.30);
    g.add(fin);
  }

  // Parachute pack on the rear panel, with a canopy we can deploy.
  const packMount = group('ChutePack');
  packMount.position.set(0, 0.94, 2.42);
  const pack = mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.26, 14), M.harness, 'ChuteCanister');
  pack.rotation.z = Math.PI / 2;
  packMount.add(pack);
  const chute = group('Chute');
  chute.visible = false;
  const canopy = mesh(new THREE.SphereGeometry(0.85, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), M.chute, 'ChuteCanopy', { cast: false });
  canopy.rotation.x = -Math.PI / 2;
  canopy.position.z = 2.6;
  chute.add(canopy);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const line = mesh(
      tube([[0, 0, 0], [Math.cos(a) * 0.45, Math.sin(a) * 0.45, 1.4], [Math.cos(a) * 0.8, Math.sin(a) * 0.8, 2.6]], 0.006, 4),
      M.matte,
      `ChuteLine${i}`,
      { cast: false }
    );
    chute.add(line);
  }
  packMount.add(chute);
  parts.chute = chute;
  g.add(packMount);

  // Wing: swan-neck uprights and a carbon element.
  const wing = group('Wing');
  for (const s of [-1, 1]) {
    const stand = mesh(roundedBox(0.05, 0.34, 0.16, 0.015), M.carbon, `WingStand_${s < 0 ? 'L' : 'R'}`);
    stand.position.set(s * 0.60, 1.16, 2.16);
    stand.rotation.x = -0.12;
    wing.add(stand);
    const plate = mesh(roundedBox(0.018, 0.155, 0.34, 0.02), M.carbon, `WingPlate_${s < 0 ? 'L' : 'R'}`);
    plate.position.set(s * 0.80, 1.36, 2.18);
    wing.add(plate);
  }
  const element = mesh(roundedBox(1.62, 0.03, 0.26, 0.014), M.carbon, 'WingElement');
  element.position.set(0, 1.36, 2.18);
  element.rotation.x = 0.16;
  wing.add(element);
  const gurney = mesh(roundedBox(1.62, 0.04, 0.01, 0.004), M.carbon, 'Gurney');
  gurney.position.set(0, 1.38, 2.305);
  wing.add(gurney);
  g.add(wing);
  return bakeInto(g, (o) => o.name.startsWith('TailLens') || o.name === 'Chute');
}

/** Roots-blower and bug-catcher scoop poking through the hood. */
function blower(M, parts) {
  const g = group('Blower');
  const z = -1.42;
  const base = mesh(roundedBox(0.56, 0.10, 0.62, 0.02), M.blackAlloy, 'BlowerBase');
  base.position.set(0, 0.985, z);
  g.add(base);

  const casing = mesh(roundedBox(0.46, 0.13, 0.52, 0.05), M.alloy, 'BlowerCase');
  casing.position.set(0, 1.020, z);
  g.add(casing);

  // Injector hat: tapered snout with butterflies.
  const hat = mesh(new THREE.CylinderGeometry(0.20, 0.15, 0.09, 4, 1), M.alloy, 'InjectorHat');
  hat.rotation.y = Math.PI / 4;
  hat.position.set(0, 1.095, z);
  g.add(hat);
  const scoopGeo = roundedBox(0.40, 0.085, 0.42, 0.03);
  const scoop = mesh(scoopGeo, M.alloy, 'Scoop');
  scoop.position.set(0, 1.150, z);
  g.add(scoop);
  for (const s of [-1, 1]) {
    const flap = mesh(roundedBox(0.19, 0.012, 0.42, 0.006), M.blackAlloy, `Butterfly_${s < 0 ? 'L' : 'R'}`);
    flap.position.set(s * 0.105, 1.198, z);
    g.add(flap);
  }

  // Belt drive on the front face; the pulleys spin with engine speed.
  const pulleys = group('BlowerDrive');
  pulleys.position.set(0, 1.00, z - 0.33);
  const spin = group('BlowerPulleys');
  for (const [y, r] of [[0, 0.10], [-0.30, 0.075]]) {
    const p = mesh(new THREE.CylinderGeometry(r, r, 0.045, 18), M.alloy, `Pulley${r}`);
    p.rotation.x = Math.PI / 2;
    p.position.set(0, y, 0);
    spin.add(p);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const spoke = mesh(roundedBox(r * 0.9, 0.02, 0.02, 0.006), M.blackAlloy, `PulleySpoke${i}`);
      spoke.position.set(Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45, 0.026);
      spoke.rotation.z = a;
      spin.add(spoke);
    }
  }
  pulleys.add(bakeInto(spin));
  parts.blowerPulleys = spin;
  for (const s of [-1, 1]) {
    const belt = mesh(roundedBox(0.02, 0.34, 0.03, 0.006), M.rubber, `Belt_${s < 0 ? 'L' : 'R'}`);
    belt.position.set(s * 0.093, -0.15, 0);
    pulleys.add(belt);
  }
  g.add(pulleys);

  // Bonnet cut-out surround so the blower looks like it comes through the hood.
  const surround = mesh(roundedBox(0.66, 0.03, 0.72, 0.02), M.matte, 'ScoopSurround');
  surround.position.set(0, 0.985, z);
  g.add(surround);
  return bakeInto(g, (o) => o.name === 'BlowerPulleys');
}

/** Side-exit exhaust: header collector, pipe and heat shield along the rocker. */
function exhaust(M) {
  const build = (side) => {
    const s = side === 'L' ? -1 : 1;
    const g = group(`Exhaust_${side}`);
    const pipe = mesh(
      tube([
        [s * 0.62, 0.40, -1.10],
        [s * 0.80, 0.34, -0.70],
        [s * 0.90, 0.30, 0.00],
        [s * 0.92, 0.30, 0.60],
        [s * 0.92, 0.31, 0.95],
      ], 0.055, 10),
      M.exhaustHeat,
      `ExhaustPipe_${side}`
    );
    g.add(pipe);
    const tip = mesh(new THREE.CylinderGeometry(0.072, 0.062, 0.16, 14, 1, true), M.chrome, `ExhaustTip_${side}`);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(s * 0.92, 0.31, 1.02);
    g.add(tip);
    const shield = mesh(roundedBox(0.03, 0.13, 1.5, 0.01), M.chrome, `HeatShield_${side}`);
    shield.position.set(s * 0.965, 0.32, 0.0);
    g.add(shield);
    // Zoomie headers coming out of the fender.
    for (let i = 0; i < 4; i++) {
      const header = mesh(
        tube([[s * 0.45, 0.62 - i * 0.02, -1.55 + i * 0.13], [s * 0.60, 0.50, -1.40 + i * 0.13], [s * 0.66, 0.42, -1.15 + i * 0.11]], 0.032, 8),
        M.exhaustHeat,
        `Header${i}_${side}`
      );
      g.add(header);
    }
    return g;
  };
  return bakeInto(group('ExhaustSystem', build('L'), build('R')));
}

/** Greenhouse: roof shell, pillars and glass. */
function greenhouse(M, parts) {
  const g = group('Greenhouse');

  // Roof: closed ring loft so it has thickness and a headliner underside.
  const roofSection = (z, hw, y, crown) => {
    const top = [];
    const bottom = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      const x = -hw + t * hw * 2;
      const yy = y + Math.cos((x / hw) * Math.PI * 0.5) * crown;
      top.push([x, yy]);
      bottom.push([x, yy - 0.05]);
    }
    // Wound counter-clockwise: along the underside, up the far edge, back along
    // the top. See loft() - the wrong way round renders the roof inside-out.
    return { z, pts: [...bottom, ...top.reverse()] };
  };
  const roofGeo = loft(
    [
      roofSection(-0.32, 0.690, 1.360, 0.018),
      roofSection(0.02, 0.725, 1.392, 0.022),
      roofSection(0.45, 0.722, 1.390, 0.022),
      roofSection(0.80, 0.686, 1.348, 0.018),
    ],
    {
      closed: true,
      capStart: true,
      capEnd: true,
      name: 'roof',
      group: (seg) => (seg >= 5 ? MAT.PAINT : MAT.INNER), // underside is headliner
    }
  );
  const headliner = M.suede;
  g.add(mesh(roofGeo, [M.paint, M.paint, M.paint, headliner], 'Roof', { receive: true }));

  // Curved windscreen and backlight, lofted so they are not flat slabs.
  const glassStrip = (a, b, name, material) => {
    const strip = (s) => {
      const pts = [];
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        const x = (-1 + t * 2) * s.hw;
        const bow = Math.cos((x / s.hw) * Math.PI * 0.5) * s.bow;
        pts.push([x, s.y + bow * 0.35]);
      }
      return { z: s.z + 0, pts };
    };
    const geo = loft([strip(a), strip(b)], { closed: false, capStart: false, capEnd: false });
    return mesh(geo, material, name, { cast: false });
  };

  const windscreen = glassStrip(
    { z: -0.64, y: 1.010, hw: 0.780, bow: 0.03 },
    { z: -0.31, y: 1.360, hw: 0.690, bow: 0.02 },
    'Windscreen',
    M.glass
  );
  g.add(windscreen);
  parts.windscreen = windscreen;

  g.add(glassStrip(
    { z: 0.805, y: 1.348, hw: 0.686, bow: 0.02 },
    { z: 1.05, y: 1.010, hw: 0.760, bow: 0.03 },
    'Backlight',
    M.glassTinted
  ));

  // Pillars follow the glass edges.
  const pillarPaint = M.paint;
  const pillars = (side) => {
    const s = side === 'L' ? -1 : 1;
    const p = group(`Pillars_${side}`);
    p.add(mesh(tube([
      [s * 0.795, 1.005, -0.63],
      [s * 0.756, 1.180, -0.50],
      [s * 0.696, 1.356, -0.33],
    ], 0.046, 8), pillarPaint, `APillar_${side}`));
    p.add(mesh(tube([
      [s * 0.790, 1.020, 0.52],
      [s * 0.748, 1.196, 0.51],
      [s * 0.720, 1.382, 0.49],
    ], 0.040, 8), pillarPaint, `BPillar_${side}`));
    p.add(mesh(tube([
      [s * 0.694, 1.348, 0.79],
      [s * 0.740, 1.185, 0.92],
      [s * 0.788, 1.020, 1.03],
    ], 0.050, 8), pillarPaint, `CPillar_${side}`));
    // Door glass and quarter light.
    const door = mesh(panel(0.76, 0.35, 0.05, 0.008), M.glassTinted, `DoorGlass_${side}`, { cast: false });
    door.position.set(s * 0.762, 1.195, 0.11);
    door.rotation.y = Math.PI / 2;
    door.rotation.x = s * 0.0;
    door.rotation.z = -0.06;
    p.add(door);
    const quarter = mesh(panel(0.20, 0.28, 0.04, 0.008), M.glassTinted, `QuarterGlass_${side}`, { cast: false });
    quarter.position.set(s * 0.755, 1.215, 0.64);
    quarter.rotation.y = Math.PI / 2;
    quarter.rotation.z = -0.10;
    p.add(quarter);
    return p;
  };
  g.add(pillars('L'), pillars('R'));

  // Chrome beltline trim, which also tidies the edge of the cabin opening.
  for (const s of [-1, 1]) {
    const trimGeo = loft(
      STATIONS.filter((st) => st.z >= -0.66 && st.z <= 1.00).map((st) => {
        const pts = [
          [s * st.hwTop, st.yTop - 0.052],
          [s * (st.hwTop + 0.012), st.yTop - 0.030],
          [s * st.hwTop, st.yTop - 0.008],
          [s * (st.hwTop - 0.02), st.yTop - 0.030],
        ];
        return { z: st.z, pts: s < 0 ? pts.reverse() : pts }; // mirroring flips the winding
      }),
      { closed: true, name: 'beltTrim' }
    );
    g.add(mesh(trimGeo, M.chrome, `BeltTrim_${s < 0 ? 'L' : 'R'}`));
  }

  // Mirrors.
  for (const s of [-1, 1]) {
    const arm = mesh(roundedBox(0.05, 0.05, 0.10, 0.02), M.paintDark, `MirrorArm_${s < 0 ? 'L' : 'R'}`);
    arm.position.set(s * 0.84, 1.00, -0.50);
    g.add(arm);
    const shell = mesh(roundedBox(0.19, 0.11, 0.10, 0.04), M.carbon, `Mirror_${s < 0 ? 'L' : 'R'}`);
    shell.position.set(s * 0.93, 1.03, -0.53);
    g.add(shell);
    const glass = mesh(panel(0.16, 0.085, 0.02, 0.006), M.chrome, `MirrorGlass_${s < 0 ? 'L' : 'R'}`, { cast: false });
    glass.position.set(s * 0.955, 1.03, -0.50);
    glass.rotation.y = s * (Math.PI / 2 - 0.18);
    g.add(glass);
  }
  return bakeInto(g);
}

/** Racing number and stripe decals on the doors. */
function decals(M) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 256);
  g.fillStyle = '#f5f7fa';
  g.beginPath();
  g.ellipse(256, 128, 150, 112, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#101318';
  g.font = 'bold 170px ui-sans-serif, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('88', 256, 132);
  g.strokeStyle = '#101318';
  g.lineWidth = 8;
  g.beginPath();
  g.ellipse(256, 128, 150, 112, 0, 0, Math.PI * 2);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({
    name: 'Decal',
    map: tex,
    transparent: true,
    roughness: 0.35,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    side: THREE.DoubleSide,
  });
  const g2 = group('Decals');
  for (const s of [-1, 1]) {
    const d = mesh(new THREE.PlaneGeometry(0.62, 0.31), mat, `DoorNumber_${s < 0 ? 'L' : 'R'}`, { cast: false });
    d.position.set(s * 0.985, 0.80, 0.10);
    d.rotation.y = s * Math.PI / 2;
    d.rotation.z = s * -0.02;
    g2.add(d);
  }
  return g2;
}

/* -------------------------------------------------------------------------- */

export function buildExterior(M, parts) {
  const g = group('Exterior');
  g.add(buildShell(M));

  const F = SPEC.front, R = SPEC.rear;
  const liner = M.matte.clone();      // one shared material for all four wells
  liner.name = 'WheelWell';
  liner.side = THREE.DoubleSide;
  for (const side of ['L', 'R']) {
    g.add(wheelWell(M, { z: F.z, y: F.radius, radius: F.radius + 0.10, xInner: SPEC.frontTuck + 0.01, xOuter: F.x + F.width / 2 + 0.02, side, liner }));
    g.add(wheelWell(M, { z: R.z, y: R.radius, radius: R.radius + 0.10, xInner: SPEC.rearTuck + 0.01, xOuter: R.x + R.width / 2 + 0.02, side, liner }));
    g.add(archLip(M, { z: F.z, y: 0.36, radius: 0.47, x: 0.905, tubeR: 0.042, side }));
    g.add(archLip(M, { z: R.z, y: 0.40, radius: 0.50, x: 0.912, tubeR: 0.046, side }));
  }

  // Rockers / side skirts between the arches.
  for (const s of [-1, 1]) {
    const skirt = mesh(roundedBox(0.06, 0.14, 1.86, 0.02), M.carbon, `SideSkirt_${s < 0 ? 'L' : 'R'}`);
    skirt.position.set(s * 0.905, 0.235, -0.02);
    g.add(skirt);
  }

  g.add(frontEnd(M, parts));
  g.add(rearEnd(M, parts));
  g.add(blower(M, parts));
  g.add(exhaust(M));
  g.add(greenhouse(M, parts));
  const d = decals(M);
  if (d) g.add(d);

  // Wheelie bars.
  const bars = group('WheelieBars');
  for (const s of [-1, 1]) {
    bars.add(mesh(
      tube([[s * 0.34, 0.36, 2.05], [s * 0.34, 0.22, 2.55], [s * 0.34, 0.16, 3.00]], 0.028, 6),
      M.cage,
      `WheelieBar_${s < 0 ? 'L' : 'R'}`
    ));
    const w = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 14), M.rubber, `WheelieWheel_${s < 0 ? 'L' : 'R'}`);
    w.rotation.z = Math.PI / 2;
    w.position.set(s * 0.34, 0.135, 3.02);
    bars.add(w);
  }
  g.add(bars);

  // Door handles.
  for (const s of [-1, 1]) {
    const h = mesh(roundedBox(0.03, 0.045, 0.17, 0.014), M.chrome, `DoorHandle_${s < 0 ? 'L' : 'R'}`);
    h.position.set(s * 0.975, 0.955, 0.34);
    g.add(h);
  }

  return g;
}

export { STATIONS };
