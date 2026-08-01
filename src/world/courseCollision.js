/**
 * Vehicle-agnostic roadside collision for Midnight Circuit.
 *
 * The world only expects a mutable pose with `x`, `z`, `heading` and `speed`.
 * It deliberately does not import the car model or the vehicle simulation.
 * This makes the same barrier solver usable by the current car, an AI car or
 * any later replacement vehicle that honours that four-number contract.
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

const clamp = THREE.MathUtils.clamp;
const inWrappedRange = (u, [start, end]) => start <= end
  ? u >= start && u <= end
  : u >= start || u <= end;

export const COURSE_COLLISION_ZONES = Object.freeze([
  ...BARRIER_RANGES.map((range, index) => Object.freeze({
    id: `road-barrier-${index + 1}`,
    kind: 'barrier',
    range,
    // Collision happens at the visible inner concrete face, not at an
    // arbitrary road-width threshold.
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
    // Where tunnel portals overlap a barrier run, use the tighter visible
    // boundary so the car cannot clip through either object.
    if (!chosen || zone.innerFace < chosen.innerFace) chosen = zone;
  }
  return chosen;
}

function headingFromForward(direction) {
  return Math.atan2(-direction.x, -direction.z);
}

export class CourseCollision {
  constructor(route, { vehicleHalfWidth = DEFAULT_VEHICLE_HALF_WIDTH } = {}) {
    this.route = route;
    this.vehicleHalfWidth = vehicleHalfWidth;
    this.elapsed = 0;
    this.lastImpactAt = -Infinity;
    this.previousPosition = null;
  }

  reset() {
    this.elapsed = 0;
    this.lastImpactAt = -Infinity;
    this.previousPosition = null;
  }

  /**
   * Resolve a plain vehicle pose against visible course-side structures.
   * Returns the corrected road query so callers do not need a second search.
   */
  resolve(vehicle, hintDistance = null, dt = 0) {
    this.elapsed += Math.max(0, Number.isFinite(dt) ? dt : 0);
    const incomingPosition = new THREE.Vector2(vehicle.x, vehicle.z);
    const road = this.route.nearest(vehicle.x, vehicle.z, hintDistance);
    const zone = activeZone(road.u);
    if (!zone) {
      this.previousPosition = incomingPosition;
      return { collided: false, road, zone: null, impact: 0, emit: false };
    }

    const centreLimit = Math.max(0.5, zone.innerFace - this.vehicleHalfWidth);
    const penetration = Math.abs(road.lateral) - centreLimit;
    if (penetration <= 0) {
      this.previousPosition = incomingPosition;
      return { collided: false, road, zone, impact: 0, emit: false };
    }

    const side = Math.sign(road.lateral) || 1;
    const horizontalRight = new THREE.Vector3(road.right.x, 0, road.right.z).normalize();
    const outward = horizontalRight.clone().multiplyScalar(side);
    const clampedLateral = side * (centreLimit - CONTACT_INSET);

    vehicle.x = road.center.x + horizontalRight.x * clampedLateral;
    vehicle.z = road.center.z + horizontalRight.z * clampedLateral;

    const speedSign = Math.sign(vehicle.speed) || 1;
    const forward = new THREE.Vector3(-Math.sin(vehicle.heading), 0, -Math.cos(vehicle.heading));
    const travelled = this.previousPosition
      ? new THREE.Vector3(
        incomingPosition.x - this.previousPosition.x,
        0,
        incomingPosition.y - this.previousPosition.y
      )
      : null;
    // Use actual frame-to-frame travel at contact. This catches fast impacts
    // even if the heading has already started rotating away from the rail.
    const travelDirection = travelled && travelled.lengthSq() > 0.0001
      ? travelled.normalize()
      : forward.clone().multiplyScalar(speedSign).normalize();
    const approach = Math.max(0, travelDirection.dot(outward));
    const impactSpeed = Math.abs(vehicle.speed) * approach;
    let retainedSpeed = 1;
    let emit = false;

    if (approach > 0.008 && impactSpeed > 0.35) {
      // Reflect the travel direction, then bias slightly along the road. This
      // gives a readable arcade glancing hit without pinballing across a 13 m
      // carriageway after a shallow scrape.
      const reflected = travelDirection.clone().addScaledVector(outward, -2 * approach).normalize();
      const tangent = new THREE.Vector3(road.tangent.x, 0, road.tangent.z).normalize();
      if (tangent.dot(travelDirection) < 0) tangent.multiplyScalar(-1);
      reflected.lerp(tangent, 0.24 + approach * 0.12).normalize();

      const correctedForward = reflected.multiplyScalar(speedSign);
      vehicle.heading = headingFromForward(correctedForward);
      retainedSpeed = clamp(0.93 - approach * 0.52, 0.38, 0.90);
      vehicle.speed *= retainedSpeed;
      if (Number.isFinite(vehicle.accel)) vehicle.accel = Math.min(vehicle.accel, 0);
      if (Number.isFinite(vehicle.lateralAccel)) vehicle.lateralAccel *= 0.35;

      emit = impactSpeed > 1.6 && this.elapsed - this.lastImpactAt > 0.085;
      if (emit) this.lastImpactAt = this.elapsed;
    }

    const correctedRoad = this.route.nearest(vehicle.x, vehicle.z, road.distance);
    this.previousPosition = new THREE.Vector2(vehicle.x, vehicle.z);
    const contactPoint = road.center.clone()
      .addScaledVector(road.right, side * zone.innerFace)
      .addScaledVector(road.normal, 0.54);

    return {
      collided: true,
      road: correctedRoad,
      zone,
      side,
      normal: outward,
      point: contactPoint,
      penetration,
      impact: impactSpeed,
      retainedSpeed,
      emit,
    };
  }
}
