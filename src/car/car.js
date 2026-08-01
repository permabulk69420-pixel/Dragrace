/**
 * Assembles the complete car and exposes the moving parts.
 *
 * Hierarchy (the sim only ever touches the named nodes):
 *
 *   CarRoot                 world position + heading
 *     PitchPivot            rotates about the rear axle contact line (wheelies)
 *       Chassis
 *         Sprung            body + interior: heave, squat and roll
 *           Exterior / Interior / SuspensionLinks / DriverAnchor
 *         Suspension_FL     one per corner
 *           Steer_FL        kingpin yaw (front only)
 *             Spin_FL       axle rotation
 *
 * The visual model is deliberately decoupled from the physics: `applyState()`
 * is the only bridge, and it takes plain numbers.
 */
import * as THREE from 'three';
import { createMaterials } from './materials.js';
import { buildExterior } from './body.js';
import { buildInterior } from './interior.js';
import { refineCockpit } from './cockpitRefinement.js';
import { buildCorner, buildSuspensionLinks } from './wheels.js';
import { needleAngle } from './gauges.js';
import { SPEC } from './spec.js';
import { group } from './geom.js';

/** How many times the rim turns for one turn of the road wheels. */
export const STEERING_RATIO = 4.2;

export function buildCar(options = {}) {
  const M = createMaterials(options);

  const parts = {
    needles: {},
    pedals: {},
    headlights: [],
    tailLights: [],
    shiftLights: [],
    materials: M,
  };

  const root = group('CarRoot');
  const pitchPivot = group('PitchPivot');
  pitchPivot.position.z = SPEC.rear.z;
  root.add(pitchPivot);

  const chassis = group('Chassis');
  chassis.position.z = -SPEC.rear.z;
  pitchPivot.add(chassis);

  const sprung = group('Sprung');
  chassis.add(sprung);

  const exterior = buildExterior(M, parts);
  const interior = buildInterior(M, parts);
  refineCockpit(interior, parts);

  sprung.add(exterior);
  sprung.add(interior);
  sprung.add(buildSuspensionLinks(M));

  // Where the driver's eyes belong. The VR rig is parented here, so the player
  // rides with the car but is still free to move their head inside the cockpit.
  const driverAnchor = group('DriverAnchor');
  driverAnchor.position.set(SPEC.eyePoint.x, SPEC.eyePoint.y, SPEC.eyePoint.z);
  sprung.add(driverAnchor);
  parts.driverAnchor = driverAnchor;

  const corners = {};
  for (const axle of ['front', 'rear']) {
    for (const side of ['L', 'R']) {
      const corner = buildCorner(M, { axle, side });
      corners[`${axle === 'front' ? 'F' : 'R'}${side}`] = corner;
      chassis.add(corner.root);
    }
  }

  parts.root = root;
  parts.pitchPivot = pitchPivot;
  parts.chassis = chassis;
  parts.sprung = sprung;
  parts.corners = corners;

  return { root, parts, materials: M, applyState: (s, dt) => applyState(parts, s, dt) };
}

const _smooth = { pitch: 0, heave: 0, roll: 0, chute: 0 };

/**
 * Drive the model from the simulation.
 * @param {object} parts
 * @param {object} s  vehicle state (see physics/vehicle.js)
 * @param {number} dt seconds
 */
export function applyState(parts, s, dt) {
  const damp = 1 - Math.exp(-dt * 9);

  // --- wheels ------------------------------------------------------------
  const frontOmega = s.speed / SPEC.front.radius;
  for (const key of ['FL', 'FR']) {
    parts.corners[key].spin.rotation.x -= frontOmega * dt;
    parts.corners[key].steer.rotation.y = s.steerAngle;
  }
  for (const key of ['RL', 'RR']) {
    parts.corners[key].spin.rotation.x -= s.rearOmega * dt;
  }

  // --- body attitude ------------------------------------------------------
  // Longitudinal acceleration pitches the car; a hard launch lifts the nose.
  const targetPitch = THREE.MathUtils.clamp(s.accel * 0.010, -0.055, 0.11);
  const targetHeave = THREE.MathUtils.clamp(-Math.abs(s.accel) * 0.0016, -0.035, 0);
  const targetRoll = THREE.MathUtils.clamp(-s.lateralAccel * 0.006, -0.05, 0.05);
  _smooth.pitch += (targetPitch - _smooth.pitch) * damp;
  _smooth.heave += (targetHeave - _smooth.heave) * damp;
  _smooth.roll += (targetRoll - _smooth.roll) * damp;
  parts.pitchPivot.rotation.x = _smooth.pitch;
  parts.sprung.position.y = _smooth.heave;
  parts.sprung.rotation.z = _smooth.roll;

  // --- controls -----------------------------------------------------------
  parts.steeringWheel.rotation.z = s.steerAngle * STEERING_RATIO;
  parts.pedals.throttle.rotation.x = 0.34 * s.throttle;
  parts.pedals.brake.rotation.x = 0.30 * s.brake;
  parts.pedals.clutch.rotation.x = 0.32 * s.clutch;
  parts.shifter.rotation.x = s.gear <= 0 ? 0 : (s.gear % 2 === 1 ? -0.26 : 0.26);
  parts.lineLockLever.rotation.x = s.lineLock ? -0.5 : 0;

  // --- instruments --------------------------------------------------------
  parts.needles.tacho.rotation.z = needleAngle(s.rpm / 8000);
  parts.needles.speedo.rotation.z = needleAngle((s.speed * 2.2369) / 240);
  parts.needles.boost.rotation.z = needleAngle(s.boost / 30);
  parts.needles.oil.rotation.z = needleAngle(0.45 + s.rpm / 26000);
  parts.needles.water.rotation.z = needleAngle(0.34 + s.engineHeat * 0.2);

  const shiftT = THREE.MathUtils.clamp((s.rpm - 5200) / (SPEC.redlineRpm - 5200), 0, 1);
  parts.shiftLights.forEach((mat, i) => {
    const on = shiftT > (i + 0.5) / parts.shiftLights.length;
    const blink = s.rpm > SPEC.redlineRpm ? (Math.floor(performance.now() / 60) % 2) : 1;
    mat.emissiveIntensity = on ? 2.4 * blink : 0;
  });

  // --- lights -------------------------------------------------------------
  const brake = s.brake > 0.05 || s.lineLock;
  for (const lens of parts.tailLights) {
    lens.material.emissiveIntensity = brake ? 3.4 : 0.85;
  }

  // --- blower and chute ---------------------------------------------------
  if (parts.blowerPulleys) parts.blowerPulleys.rotation.z -= (s.rpm / 60) * Math.PI * 2 * dt * 0.25;
  if (parts.chute) {
    const target = s.chuteOut ? 1 : 0;
    _smooth.chute += (target - _smooth.chute) * (1 - Math.exp(-dt * 4));
    parts.chute.visible = _smooth.chute > 0.02;
    const k = Math.max(0.02, _smooth.chute);
    parts.chute.scale.set(k, k, k);
    parts.chute.rotation.x = Math.sin(performance.now() / 700) * 0.05 * k;
  }
}

export { SPEC };
