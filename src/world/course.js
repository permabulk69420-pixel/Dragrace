/**
 * Midnight Circuit route definition and road-surface queries.
 *
 * This module deliberately knows nothing about the car or its physics.  It is
 * the integration contract for any vehicle: metres in, metres out, +Y up.
 * The route runs forward from the grid toward -Z and closes into a full lap.
 */
import * as THREE from 'three';

export const ROAD_HALF_WIDTH = 6.6;
export const SHOULDER_WIDTH = 1.35;
export const DRIVEABLE_HALF_WIDTH = ROAD_HALF_WIDTH + SHOULDER_WIDTH;

// Hand-authored in metres.  The broad radii suit a fast street car while the
// elevation profile creates a dockside climb, high viaduct and tunnel descent.
export const COURSE_CONTROL_POINTS = Object.freeze([
  [0, 0.18, 140],
  [0, 0.22, -75],
  [-34, 0.55, -220],
  [-150, 3.0, -355],
  [-325, 9.5, -392],
  [-475, 20.0, -305],
  [-545, 31.5, -125],
  [-520, 35.0, 92],
  [-410, 31.0, 255],
  [-250, 21.0, 342],
  [-62, 12.0, 334],
  [100, 5.5, 262],
  [220, 4.5, 142],
  [268, 0.35, -18],
  [228, 0.18, -178],
  [112, 0.16, -278],
  [28, 0.18, -214],
  [72, 0.20, -102],
  [164, 0.35, 24],
  [172, 0.45, 172],
  [82, 0.30, 286],
  [0, 0.20, 302],
]);

export const COURSE_SECTIONS = Object.freeze({
  docklands: [0.00, 0.18],
  industrialClimb: [0.18, 0.28],
  skyway: [0.28, 0.49],
  neonHeights: [0.49, 0.60],
  downtownDescent: [0.60, 0.70],
  harbourTunnel: [0.70, 0.80],
  warehouseCut: [0.80, 0.88],
  eastBoulevard: [0.88, 1.00],
});

const clamp = THREE.MathUtils.clamp;
const wrap01 = (u) => ((u % 1) + 1) % 1;

function headingFromTangent(tangent) {
  // The vehicle's local forward axis is -Z.
  return Math.atan2(-tangent.x, -tangent.z);
}

function signedTurn(a, b) {
  const ax = a.x, az = a.z;
  const bx = b.x, bz = b.z;
  const al = Math.hypot(ax, az) || 1;
  const bl = Math.hypot(bx, bz) || 1;
  const dot = clamp((ax * bx + az * bz) / (al * bl), -1, 1);
  // Positive means a left turn along the route.
  const crossY = (az * bx - ax * bz) / (al * bl);
  return Math.atan2(crossY, dot);
}

export class CourseRoute {
  constructor({ points = COURSE_CONTROL_POINTS, samples = 840 } = {}) {
    this.roadHalfWidth = ROAD_HALF_WIDTH;
    this.shoulderWidth = SHOULDER_WIDTH;
    this.driveableHalfWidth = DRIVEABLE_HALF_WIDTH;
    this.sampleCount = samples;

    const controls = points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    this.curve = new THREE.CatmullRomCurve3(controls, true, 'centripetal', 0.5);
    this.curve.arcLengthDivisions = samples * 5;
    this.curve.updateArcLengths();
    this.length = this.curve.getLength();
    this.frames = [];

    const look = 17 / this.length;
    for (let i = 0; i <= samples; i++) {
      const u = i / samples;
      const curveU = i === samples ? 1 : u;
      const center = this.curve.getPointAt(curveU);
      const tangent = this.curve.getTangentAt(curveU).normalize();
      const before = this.curve.getTangentAt(wrap01(u - look)).normalize();
      const after = this.curve.getTangentAt(wrap01(u + look)).normalize();
      const bank = clamp(signedTurn(before, after) * 0.72, -0.105, 0.105);

      const flatRight = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      const flatNormal = flatRight.clone().cross(tangent).normalize();
      const right = flatRight.clone()
        .multiplyScalar(Math.cos(bank))
        .addScaledVector(flatNormal, Math.sin(bank))
        .normalize();
      const normal = right.clone().cross(tangent).normalize();

      this.frames.push({
        u,
        distance: this.length * u,
        center,
        tangent,
        right,
        normal,
        bank,
        heading: headingFromTangent(tangent),
        pitch: Math.asin(clamp(tangent.y, -1, 1)),
      });
    }

    const grid = this.atDistance(-14);
    this.spawn = Object.freeze({
      position: grid.center.clone(),
      heading: grid.heading,
      pitch: grid.pitch,
      roll: grid.bank,
    });

    this.checkpoints = [0, 0.25, 0.5, 0.75].map((fraction, index) => {
      const frame = this.atDistance(this.length * fraction);
      return Object.freeze({ index, fraction, distance: frame.distance, position: frame.center.clone() });
    });
  }

  /** Interpolated route frame at a wrapped distance in metres. */
  atDistance(distance) {
    const d = ((distance % this.length) + this.length) % this.length;
    const f = (d / this.length) * this.sampleCount;
    const i = Math.floor(f);
    const t = f - i;
    const a = this.frames[i];
    const b = this.frames[i + 1];
    const center = a.center.clone().lerp(b.center, t);
    const tangent = a.tangent.clone().lerp(b.tangent, t).normalize();
    const right = a.right.clone().lerp(b.right, t).normalize();
    const normal = right.clone().cross(tangent).normalize();
    const bank = THREE.MathUtils.lerp(a.bank, b.bank, t);
    return {
      u: d / this.length,
      distance: d,
      center,
      tangent,
      right,
      normal,
      bank,
      heading: headingFromTangent(tangent),
      pitch: Math.asin(clamp(tangent.y, -1, 1)),
    };
  }

  /**
   * Find the nearest point on the route centre line to a world X/Z position.
   * The returned lateral value is positive on the route's right side.
   */
  nearest(x, z, hintDistance = null) {
    let bestD2 = Infinity;
    let bestIndex = 0;
    let bestT = 0;

    for (let i = 0; i < this.sampleCount; i++) {
      const a = this.frames[i].center;
      const b = this.frames[i + 1].center;
      if (hintDistance !== null && Number.isFinite(hintDistance)) {
        const segmentDistance = (this.frames[i].distance + this.frames[i + 1].distance) * 0.5;
        const rawGap = Math.abs(segmentDistance - hintDistance);
        const routeGap = Math.min(rawGap, this.length - rawGap);
        // Continuity hint disambiguates the downtown flyover from the lower
        // boulevard while still allowing more than a second of high-speed travel.
        if (routeGap > 240) continue;
      }
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const len2 = abx * abx + abz * abz || 1;
      const t = clamp(((x - a.x) * abx + (z - a.z) * abz) / len2, 0, 1);
      const px = a.x + abx * t;
      const pz = a.z + abz * t;
      const dx = x - px;
      const dz = z - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestIndex = i;
        bestT = t;
      }
    }

    const a = this.frames[bestIndex];
    const b = this.frames[bestIndex + 1];
    const center = a.center.clone().lerp(b.center, bestT);
    const tangent = a.tangent.clone().lerp(b.tangent, bestT).normalize();
    const right = a.right.clone().lerp(b.right, bestT).normalize();
    const normal = right.clone().cross(tangent).normalize();
    const bank = THREE.MathUtils.lerp(a.bank, b.bank, bestT);
    const horizontalRight = new THREE.Vector3(right.x, 0, right.z).normalize();
    const lateral = (x - center.x) * horizontalRight.x + (z - center.z) * horizontalRight.z;
    const distance = a.distance + (b.distance - a.distance) * bestT;
    const height = center.y + lateral * Math.tan(bank);

    return {
      u: distance / this.length,
      distance,
      center,
      tangent,
      right,
      normal,
      bank,
      heading: headingFromTangent(tangent),
      pitch: Math.asin(clamp(tangent.y, -1, 1)),
      lateral,
      height,
      distanceToCentre: Math.sqrt(bestD2),
      onRoad: Math.abs(lateral) <= this.roadHalfWidth,
      onDriveableSurface: Math.abs(lateral) <= this.driveableHalfWidth,
    };
  }

  /** Cheap placement helper for props positioned relative to the carriageway. */
  pointAt(distance, lateral = 0, height = 0) {
    const frame = this.atDistance(distance);
    return frame.center.clone()
      .addScaledVector(frame.right, lateral)
      .addScaledVector(frame.normal, height);
  }
}

export const courseRoute = new CourseRoute();
