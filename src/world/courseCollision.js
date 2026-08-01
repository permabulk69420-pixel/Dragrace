/**
 * Vehicle-agnostic collision against the visible barriers, guardrails and
 * tunnel walls that follow the course.
 *
 * This is a swept boundary solver rather than a post-frame road clamp: it finds
 * the point where the car first reaches the physical inner face, leaves it at
 * that contact point, and reflects/scrubs the actual travel direction.
 */
import * as THREE from 'three';
import {
  BARRIER_RANGES,
  DRIVEABLE_HALF_WIDTH,
  GUARDRAIL_RANGES,
  TUNNEL_RANGE,
} from './course.js';

const BARRIER_CENTRE_OFFSET = DRIVEABLE_HALF_WIDTH + 0.52;
const BARRIER_THICKNESS = 0.38;
const TUNNEL_INNER_FACE = 8.72;
const GUARDRAIL_INNER_FACE = DRIVEABLE_HALF_WIDTH + 0.52;
const DEFAULT_VEHICLE_HALF_WIDTH = 1.06;
const CONTACT_INSET = 0.045;
const SWEEP_ITERATIONS = 10;

const clamp = THREE.MathUtils.clamp;
const inWrappedRange = (u, [start, end]) => start <= end
  ? u >= start && u <= end
  : u >= start || u <= end;

export const COURSE_COLLISION_ZONES = Object.freeze([
  ...BARRIER_RANGES.map((range, index) => Object.freeze({
    id: `road-barrier-${index + 1}`,
    kind: 'barrier',
    range,
    innerFace: BARRIER_CENTRE_OFFSET - BARRIER_THICKNESS * 0.5,
  })),
  ...GUARDRAIL_RANGES.map((range, index) => Object.freeze({
    id: `steel-guardrail-${index + 1}`,
    kind: 'guardrail',
    range,
    innerFace: GUARDRAIL_INNER_FACE,
  })),
  Object.freeze({
    id: 'harbour-tunnel-wall',
    kind: 'tunnel',
    range: TUNNEL_RANGE,
    innerFace: TUNNEL_INNER_FACE,
  }),
]);

function activeZone(u) {
  let chosen = null;
  for (const zone of COURSE_COLLISION_ZONES) {
    if (!inWrappedRange(u, zone.range)) continue;
    if (!chosen || zone.innerFace < chosen.innerFace) chosen = zone;
  }
  return chosen;
}

function headingFromForward(direction) {
  return Math.atan2(-direction.x, -direction.z);
}

function interpolatePose(a, b, t) {
  const deltaHeading = Math.atan2(Math.sin(b.heading - a.heading), Math.cos(b.heading - a.heading));
  return {
    x: THREE.MathUtils.lerp(a.x, b.x, t),
    z: THREE.MathUtils.lerp(a.z, b.z, t),
    heading: a.heading + deltaHeading * t,
  };
}

export class CourseCollision {
  constructor(route, { vehicleHalfWidth = DEFAULT_VEHICLE_HALF_WIDTH } = {}) {
    this.route = route;
    this.vehicleHalfWidth = vehicleHalfWidth;
    this.elapsed = 0;
    this.lastImpactAt = -Infinity;
    this.previousPose = null;
  }

  reset() {
    this.elapsed = 0;
    this.lastImpactAt = -Infinity;
    this.previousPose = null;
  }

  #stateAt(pose, hintDistance = null) {
    const road = this.route.nearest(pose.x, pose.z, hintDistance);
    const zone = activeZone(road.u);
    if (!zone) return { pose, road, zone: null, penetration: -Infinity, centreLimit: Infinity };
    const centreLimit = Math.max(0.5, zone.innerFace - this.vehicleHalfWidth);
    return {
      pose,
      road,
      zone,
      centreLimit,
      penetration: Math.abs(road.lateral) - centreLimit,
    };
  }

  #findContact(previous, current, hintDistance) {
    const currentState = this.#stateAt(current, hintDistance);
    if (!currentState.zone || currentState.penetration <= 0) return null;

    const previousState = this.#stateAt(previous, hintDistance);
    if (!previousState.zone || previousState.penetration > 0) return currentState;

    // The frame crossed a visible wall. Bisect in world space so high-speed
    // movement stops at the wall instead of being teleported back after passing it.
    let safeT = 0;
    let blockedT = 1;
    let blockedState = currentState;
    for (let i = 0; i < SWEEP_ITERATIONS; i++) {
      const midT = (safeT + blockedT) * 0.5;
      const state = this.#stateAt(interpolatePose(previous, current, midT), hintDistance);
      if (state.zone && state.penetration > 0) {
        blockedT = midT;
        blockedState = state;
      } else {
        safeT = midT;
      }
    }
    return blockedState;
  }

  /** Resolve a plain vehicle pose against the visible course-side structures. */
  resolve(vehicle, hintDistance = null, dt = 0) {
    this.elapsed += Math.max(0, Number.isFinite(dt) ? dt : 0);
    const current = { x: vehicle.x, z: vehicle.z, heading: vehicle.heading };
    const previous = this.previousPose ?? current;
    const contact = this.#findContact(previous, current, hintDistance);

    if (!contact) {
      this.previousPose = current;
      const road = this.route.nearest(vehicle.x, vehicle.z, hintDistance);
      return { collided: false, road, zone: activeZone(road.u), impact: 0, emit: false };
    }

    const side = Math.sign(contact.road.lateral) || 1;
    const horizontalRight = new THREE.Vector3(contact.road.right.x, 0, contact.road.right.z).normalize();
    const outward = horizontalRight.clone().multiplyScalar(side);
    const clampedLateral = side * (contact.centreLimit - CONTACT_INSET);
    vehicle.x = contact.road.center.x + horizontalRight.x * clampedLateral;
    vehicle.z = contact.road.center.z + horizontalRight.z * clampedLateral;

    const speedSign = Math.sign(vehicle.speed) || 1;
    const forward = new THREE.Vector3(-Math.sin(vehicle.heading), 0, -Math.cos(vehicle.heading));
    const travelled = new THREE.Vector3(current.x - previous.x, 0, current.z - previous.z);
    const travelDirection = travelled.lengthSq() > 0.000001
      ? travelled.normalize()
      : forward.clone().multiplyScalar(speedSign).normalize();
    const approach = Math.max(0, travelDirection.dot(outward));
    const impactSpeed = Math.abs(vehicle.speed) * approach;
    let retainedSpeed = 1;
    let emit = false;

    if (approach > 0.006 && impactSpeed > 0.25) {
      const reflected = travelDirection.clone().addScaledVector(outward, -2 * approach).normalize();
      const tangent = new THREE.Vector3(contact.road.tangent.x, 0, contact.road.tangent.z).normalize();
      if (tangent.dot(travelDirection) < 0) tangent.multiplyScalar(-1);
      reflected.lerp(tangent, 0.18 + approach * 0.10).normalize();

      const correctedForward = reflected.multiplyScalar(speedSign);
      vehicle.heading = headingFromForward(correctedForward);
      retainedSpeed = clamp(0.91 - approach * 0.56, 0.30, 0.88);
      vehicle.speed *= retainedSpeed;
      if (Number.isFinite(vehicle.accel)) vehicle.accel = Math.min(vehicle.accel, 0);
      if (Number.isFinite(vehicle.lateralAccel)) vehicle.lateralAccel *= 0.28;

      emit = impactSpeed > 1.5 && this.elapsed - this.lastImpactAt > 0.085;
      if (emit) this.lastImpactAt = this.elapsed;
    } else if (Math.abs(vehicle.speed) < 0.7) {
      vehicle.speed = 0;
    }

    const correctedRoad = this.route.nearest(vehicle.x, vehicle.z, contact.road.distance);
    this.previousPose = { x: vehicle.x, z: vehicle.z, heading: vehicle.heading };
    const contactPoint = contact.road.center.clone()
      .addScaledVector(contact.road.right, side * contact.zone.innerFace)
      .addScaledVector(contact.road.normal, 0.54);

    return {
      collided: true,
      road: correctedRoad,
      zone: contact.zone,
      side,
      normal: outward,
      point: contactPoint,
      penetration: contact.penetration,
      impact: impactSpeed,
      retainedSpeed,
      emit,
    };
  }
}
