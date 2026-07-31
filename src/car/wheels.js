/**
 * Wheels. Each corner is a small hierarchy so the sim can drive it:
 *
 *   Suspension_FL   (vertical travel)
 *     Steer_FL      (yaw pivot on the kingpin axis)
 *       Spin_FL     (rotates about X, the axle)
 *         Rim / Tyre
 *       Caliper     (stays with the upright, does not spin)
 *
 * Tyres are lathed from a cross-section so the sidewall bulges and the shoulder
 * rounds off the way a real drag slick does.
 */
import * as THREE from 'three';
import { latheX, roundedBox, mesh, group, mergeStatic } from './geom.js';
import { SPEC } from './spec.js';

/**
 * Tyre cross-section, revolved around the axle.
 * Points are [radius, axialOffset] and run from the inner bead, out over the
 * tread, and back to the outer bead.
 */
function tyreGeometry(radius, width, { slick = true } = {}) {
  const hw = width / 2;
  const bead = radius * (slick ? 0.60 : 0.66); // where the tyre meets the rim
  const shoulder = radius * (slick ? 0.965 : 0.95);
  const bulge = hw * (slick ? 1.06 : 1.0); // sidewall balloons past the rim
  const pts = [
    [bead, -hw],
    [bead + (radius - bead) * 0.25, -hw * 1.02],
    [radius * 0.82, -bulge],
    [shoulder, -hw * 0.92],
    [radius, -hw * 0.72],
    [radius, hw * 0.72],
    [shoulder, hw * 0.92],
    [radius * 0.82, bulge],
    [bead + (radius - bead) * 0.25, hw * 1.02],
    [bead, hw],
  ];
  return latheX(pts, 34);
}

/** Deep-dish drag wheel: barrel, outer lip, spokes, beadlock bolts. */
function rimGroup(M, { radius, width, spokes = 5, style = 'rear' }) {
  const g = group('Rim');
  const hw = width / 2;
  const barrel = radius * 0.56;

  // Barrel + face, lathed as one shell. A drag slick carries a lot of sidewall,
  // so the rim only reaches about two thirds of the way out.
  const face = radius * (style === 'rear' ? 0.64 : 0.70);
  const pts = [
    [barrel * 0.55, -hw],
    [barrel, -hw],
    [barrel, hw * 0.55],
    [face * 0.92, hw * 0.62],
    [face, hw * 0.72],
    [face, hw * 0.86],
    [face * 0.9, hw * 0.9],
    [barrel * 0.9, hw * 0.86],
    [barrel * 0.55, hw * 0.8],
  ];
  g.add(mesh(latheX(pts, 30), M.alloy, 'RimBarrel'));

  // Spokes on the outer face.
  const spokeR = face * 0.88;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const s = mesh(roundedBox(0.085, spokeR * 0.92, 0.055, 0.02), M.alloy, `Spoke${i}`);
    s.position.set(hw * 0.66, Math.cos(a) * spokeR * 0.46, Math.sin(a) * spokeR * 0.46);
    s.rotation.x = -a;
    s.rotation.z = Math.PI / 2;
    s.rotation.y = Math.PI / 2;
    g.add(s);
    const bolt = mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 6), M.chrome, `Bolt${i}`);
    bolt.rotation.z = Math.PI / 2;
    bolt.position.set(hw * 0.86, Math.cos(a) * 0.075, Math.sin(a) * 0.075);
    g.add(bolt);
  }

  // Beadlock ring on the outer lip.
  const ring = mesh(new THREE.TorusGeometry(face * 0.965, 0.016, 6, 32), M.blackAlloy, 'Beadlock');
  ring.rotation.y = Math.PI / 2;
  ring.position.x = hw * 0.86;
  g.add(ring);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const b = mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.022, 6), M.chrome, `BeadBolt${i}`);
    b.rotation.z = Math.PI / 2;
    b.position.set(hw * 0.9, Math.cos(a) * face * 0.965, Math.sin(a) * face * 0.965);
    g.add(b);
  }

  // Centre cap.
  const cap = mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.05, 16), M.blackAlloy, 'CentreCap');
  cap.rotation.z = Math.PI / 2;
  cap.position.x = hw * 0.85;
  g.add(cap);

  // Nothing inside a rim moves on its own, so bake it down to a few meshes.
  return mergeStatic(g, 'Rim');
}

/** Disc and caliper, mounted to the upright so they do not spin with the wheel. */
function brakeGroup(M, radius, width, side) {
  const g = group('Brake');
  const disc = mesh(
    new THREE.CylinderGeometry(radius * 0.66, radius * 0.66, 0.026, 26),
    M.chrome,
    'BrakeDisc'
  );
  disc.rotation.z = Math.PI / 2;
  g.add(disc);
  const hat = mesh(new THREE.CylinderGeometry(radius * 0.3, radius * 0.3, 0.06, 16), M.blackAlloy, 'BrakeHat');
  hat.rotation.z = Math.PI / 2;
  g.add(hat);
  const caliper = mesh(roundedBox(0.09, 0.16, 0.13, 0.02), M.harness, 'Caliper');
  caliper.position.set(side === 'L' ? 0.055 : -0.055, radius * 0.6, -0.02);
  g.add(caliper);
  return g;
}

/**
 * Build one corner.
 * @returns {{root:THREE.Group, steer:THREE.Group, spin:THREE.Group}}
 */
export function buildCorner(M, { axle, side }) {
  const cfg = axle === 'front' ? SPEC.front : SPEC.rear;
  const sign = side === 'L' ? -1 : 1;
  const tag = `${axle === 'front' ? 'F' : 'R'}${side}`;

  const root = group(`Suspension_${tag}`);
  root.position.set(sign * cfg.x, cfg.radius, cfg.z);

  const steer = group(`Steer_${tag}`);
  root.add(steer);

  const spin = group(`Spin_${tag}`);
  steer.add(spin);

  const tyre = mesh(
    tyreGeometry(cfg.radius, cfg.width, { slick: axle === 'rear' }),
    axle === 'rear' ? M.rubber : M.rubberSoft,
    `Tyre_${tag}`
  );
  spin.add(tyre);

  const rim = rimGroup(M, {
    radius: cfg.radius,
    width: cfg.width,
    spokes: axle === 'rear' ? 5 : 5,
    style: axle,
  });
  rim.scale.x = sign;
  spin.add(rim);

  // Sidewall lettering ring, purely for looks, but it sells the slick.
  if (axle === 'rear') {
    const letters = mesh(
      new THREE.TorusGeometry(cfg.radius * 0.86, 0.006, 4, 40),
      M.rubberSoft,
      `Sidewall_${tag}`,
      { cast: false }
    );
    letters.rotation.y = Math.PI / 2;
    letters.position.x = sign * cfg.width * 0.48;
    spin.add(letters);
  }

  const brake = brakeGroup(M, cfg.radius, cfg.width, side);
  brake.position.x = sign * cfg.width * 0.1;
  steer.add(brake);

  return { root, steer, spin, cfg, sign, axle, side };
}

/** Simple visible suspension links so the arches are not empty. */
export function buildSuspensionLinks(M) {
  const g = group('SuspensionLinks');
  const F = SPEC.front, R = SPEC.rear;
  for (const s of [-1, 1]) {
    for (const [y, len] of [[0.24, 0.42], [0.52, 0.36]]) {
      const arm = mesh(roundedBox(len, 0.05, 0.07, 0.015), M.satin, `FrontArm_${s < 0 ? 'L' : 'R'}_${y}`);
      arm.position.set(s * (SPEC.frontTuck + len / 2 - 0.02), y, F.z);
      g.add(arm);
    }
    const spring = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.34, 10), M.harness, `Coilover_${s < 0 ? 'L' : 'R'}`);
    spring.position.set(s * (SPEC.frontTuck + 0.06), 0.55, F.z + 0.04);
    spring.rotation.z = s * 0.12;
    g.add(spring);
  }
  // Live axle with a four-link, which is what a car like this would run.
  const axle = mesh(new THREE.CylinderGeometry(0.055, 0.055, R.x * 2 - 0.1, 12), M.satin, 'RearAxle');
  axle.rotation.z = Math.PI / 2;
  axle.position.set(0, R.radius, R.z);
  g.add(axle);
  const diff = mesh(new THREE.SphereGeometry(0.17, 14, 10), M.satin, 'Diff');
  diff.scale.set(0.8, 1, 1);
  diff.position.set(0, R.radius, R.z);
  g.add(diff);
  const shaft = mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.5, 10), M.chrome, 'PropShaft');
  shaft.rotation.x = Math.PI / 2;
  shaft.position.set(0, 0.34, R.z - 0.9);
  g.add(shaft);
  for (const s of [-1, 1]) {
    const link = mesh(roundedBox(0.05, 0.05, 0.7, 0.015), M.satin, `FourLink_${s < 0 ? 'L' : 'R'}`);
    link.position.set(s * 0.34, 0.36, R.z - 0.4);
    g.add(link);
    const shock = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.42, 10), M.harness, `RearShock_${s < 0 ? 'L' : 'R'}`);
    shock.position.set(s * 0.5, 0.56, R.z + 0.12);
    shock.rotation.x = -0.2;
    g.add(shock);
  }
  return mergeStatic(g, 'SuspensionLinks');
}
