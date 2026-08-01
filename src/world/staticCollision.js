/**
 * Swept 2D collision against actual scenery geometry.
 *
 * The car simulation exposes a planar pose rather than a rigid body, so this
 * builds a purpose-made three-circle car capsule and sweeps it continuously
 * against static circles and oriented boxes extracted from rendered scenery.
 */
import * as THREE from 'three';

const CELL_SIZE = 40;
const PROBE_RADIUS = 0.78;
const PROBE_OFFSETS = Object.freeze([-1.35, 0, 1.35]);
const CONTACT_SKIN = 0.035;
const EPSILON = 1e-7;

const SOLID_INSTANCES = new Set([
  'ChamferedTowers', 'SetbackTowers', 'RoundCornerTowers',
  'CrownedOfficeTowers', 'SlabHotels', 'GabledWarehouses',
  'ShippingContainers', 'StorageTanks', 'IndustrialSmokestacks',
  'ViaductPillars', 'TunnelPortalConcrete',
]);
const SOLID_MESHES = new Set(['ViaductPillars', 'TunnelPortalConcrete']);
const STRUCTURAL_ROOTS = new Set(['ArchitecturalLandmarks', 'IndustrialLandmarks']);
const IGNORE_NAME = /(sign|glow|window|light|lamp|bulb|pool|reflector|mark|stripe|arrow|wire|fence|road|asphalt|shoulder|ground|water|mountain|sky|cloud|star|moon|skid|puddle|manhole|drain|joint|gantry|scoreboard|beacon|mast|antenna|trim|band|fin|mullion|canopy|awning|plaza|forecourt|courtyard|floor|slab|ramp|cable|warning)/i;

const _matrix = new THREE.Matrix4();
const _instance = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _centre = new THREE.Vector3();
const _size = new THREE.Vector3();
const _corner = new THREE.Vector3();
const _euler = new THREE.Euler();

function hasStructuralAncestor(object, root) {
  for (let cursor = object; cursor && cursor !== root; cursor = cursor.parent) {
    if (STRUCTURAL_ROOTS.has(cursor.name) || /^Landmark_|^Industrial_/.test(cursor.name)) return true;
  }
  return false;
}

function shouldCollect(object, root) {
  if (!object.visible || !object.isMesh || !object.geometry) return false;
  if (object.isInstancedMesh && SOLID_INSTANCES.has(object.name)) return true;
  if (SOLID_MESHES.has(object.name)) return true;
  return hasStructuralAncestor(object, root) && !IGNORE_NAME.test(object.name);
}

function verticalBounds(box, matrix) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) {
    _corner.set(
      x ? box.max.x : box.min.x,
      y ? box.max.y : box.min.y,
      z ? box.max.z : box.min.z,
    ).applyMatrix4(matrix);
    minY = Math.min(minY, _corner.y);
    maxY = Math.max(maxY, _corner.y);
  }
  return { minY, maxY };
}

function makeCollider(object, matrix, instanceIndex = null) {
  if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
  const box = object.geometry.boundingBox;
  if (!box) return null;

  box.getCenter(_centre);
  box.getSize(_size);
  matrix.decompose(_position, _quaternion, _scale);
  const centre = _centre.clone().applyMatrix4(matrix);
  const halfX = Math.abs(_size.x * _scale.x) * 0.5;
  const halfZ = Math.abs(_size.z * _scale.z) * 0.5;
  const vertical = verticalBounds(box, matrix);
  const height = vertical.maxY - vertical.minY;

  // Ignore road decals, rooftops and overhead structures that cannot touch a car.
  if (vertical.maxY < 0.22 || vertical.minY > 2.25 || height < 0.55) return null;
  if (halfX < 0.18 || halfZ < 0.18 || halfX * halfZ < 0.12) return null;

  _euler.setFromQuaternion(_quaternion, 'YXZ');
  const base = {
    id: instanceIndex == null ? object.name : `${object.name}:${instanceIndex}`,
    source: object.name,
    x: centre.x,
    z: centre.z,
    minY: vertical.minY,
    maxY: vertical.maxY,
  };
  const cylindrical = /tank|smokestack|silo|cylinder/i.test(object.name) ||
    (object.geometry.type?.includes('Cylinder') && Math.abs(halfX - halfZ) < Math.max(halfX, halfZ) * 0.22);
  return cylindrical
    ? { ...base, type: 'circle', radius: Math.max(halfX, halfZ) }
    : { ...base, type: 'box', halfX, halfZ, yaw: _euler.y };
}

/** Extract colliders from the real transforms of visible structural scenery. */
export function collectStaticColliders(root) {
  root.updateMatrixWorld(true);
  const colliders = [];
  root.traverse((object) => {
    if (!shouldCollect(object, root)) return;
    if (object.isInstancedMesh) {
      for (let i = 0; i < object.count; i++) {
        object.getMatrixAt(i, _instance);
        _matrix.multiplyMatrices(object.matrixWorld, _instance);
        const collider = makeCollider(object, _matrix, i);
        if (collider) colliders.push(collider);
      }
    } else {
      const collider = makeCollider(object, object.matrixWorld);
      if (collider) colliders.push(collider);
    }
  });
  return colliders;
}

function boundsOf(collider) {
  if (collider.type === 'circle') {
    return {
      minX: collider.x - collider.radius, maxX: collider.x + collider.radius,
      minZ: collider.z - collider.radius, maxZ: collider.z + collider.radius,
    };
  }
  const c = Math.cos(collider.yaw);
  const s = Math.sin(collider.yaw);
  const ex = Math.abs(c) * collider.halfX + Math.abs(s) * collider.halfZ;
  const ez = Math.abs(s) * collider.halfX + Math.abs(c) * collider.halfZ;
  return { minX: collider.x - ex, maxX: collider.x + ex, minZ: collider.z - ez, maxZ: collider.z + ez };
}

function toLocal(point, collider) {
  const c = Math.cos(collider.yaw);
  const s = Math.sin(collider.yaw);
  const dx = point.x - collider.x;
  const dz = point.z - collider.z;
  return { x: c * dx - s * dz, z: s * dx + c * dz };
}

function normalToWorld(x, z, collider) {
  const c = Math.cos(collider.yaw);
  const s = Math.sin(collider.yaw);
  return new THREE.Vector2(c * x + s * z, -s * x + c * z).normalize();
}

function sweepCircleCircle(start, end, radius, collider) {
  const expanded = radius + collider.radius;
  const sx = start.x - collider.x;
  const sz = start.z - collider.z;
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const distanceSq = sx * sx + sz * sz;

  if (distanceSq < expanded * expanded) {
    const length = Math.sqrt(distanceSq);
    const normal = length > EPSILON
      ? new THREE.Vector2(sx / length, sz / length)
      : new THREE.Vector2(-(dx || 1), -dz).normalize();
    return { t: 0, normal, point: { x: start.x, z: start.z }, collider };
  }

  const a = dx * dx + dz * dz;
  if (a < EPSILON) return null;
  const b = 2 * (sx * dx + sz * dz);
  const c = distanceSq - expanded * expanded;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  if (t < 0 || t > 1) return null;
  const point = { x: start.x + dx * t, z: start.z + dz * t };
  return {
    t,
    point,
    normal: new THREE.Vector2(point.x - collider.x, point.z - collider.z).normalize(),
    collider,
  };
}

function sweepCircleBox(start, end, radius, collider) {
  const a = toLocal(start, collider);
  const b = toLocal(end, collider);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const hx = collider.halfX + radius;
  const hz = collider.halfZ + radius;

  if (Math.abs(a.x) < hx && Math.abs(a.z) < hz) {
    const face = [
      { d: hx - a.x, x: 1, z: 0 }, { d: hx + a.x, x: -1, z: 0 },
      { d: hz - a.z, x: 0, z: 1 }, { d: hz + a.z, x: 0, z: -1 },
    ].sort((left, right) => left.d - right.d)[0];
    return { t: 0, normal: normalToWorld(face.x, face.z, collider), point: { ...start }, collider };
  }

  let near = 0;
  let far = 1;
  let normalX = 0;
  let normalZ = 0;
  for (const axis of [
    { p: a.x, d: dx, min: -hx, max: hx, x: 1, z: 0 },
    { p: a.z, d: dz, min: -hz, max: hz, x: 0, z: 1 },
  ]) {
    if (Math.abs(axis.d) < EPSILON) {
      if (axis.p < axis.min || axis.p > axis.max) return null;
      continue;
    }
    let t1 = (axis.min - axis.p) / axis.d;
    let t2 = (axis.max - axis.p) / axis.d;
    let sign = -1;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      sign = 1;
    }
    if (t1 > near) {
      near = t1;
      normalX = axis.x * sign;
      normalZ = axis.z * sign;
    }
    far = Math.min(far, t2);
    if (near > far) return null;
  }
  if (near < 0 || near > 1) return null;
  return {
    t: near,
    normal: normalToWorld(normalX, normalZ, collider),
    point: { x: start.x + (end.x - start.x) * near, z: start.z + (end.z - start.z) * near },
    collider,
  };
}

function forward(heading) {
  return new THREE.Vector2(-Math.sin(heading), -Math.cos(heading));
}

function lerpHeading(a, b, t) {
  return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
}

function headingFromForward(direction) {
  return Math.atan2(-direction.x, -direction.y);
}

export class StaticCollisionWorld {
  constructor(colliders, {
    cellSize = CELL_SIZE,
    probeRadius = PROBE_RADIUS,
    probeOffsets = PROBE_OFFSETS,
  } = {}) {
    this.colliders = colliders;
    this.cellSize = cellSize;
    this.probeRadius = probeRadius;
    this.probeOffsets = [...probeOffsets];
    this.grid = new Map();
    this.previousPose = null;
    this.elapsed = 0;
    this.lastImpactAt = -Infinity;
    this.#index();
  }

  #key(x, z) {
    return `${x},${z}`;
  }

  #index() {
    this.colliders.forEach((collider, index) => {
      const bounds = boundsOf(collider);
      for (let x = Math.floor(bounds.minX / this.cellSize); x <= Math.floor(bounds.maxX / this.cellSize); x++) {
        for (let z = Math.floor(bounds.minZ / this.cellSize); z <= Math.floor(bounds.maxZ / this.cellSize); z++) {
          const key = this.#key(x, z);
          if (!this.grid.has(key)) this.grid.set(key, []);
          this.grid.get(key).push(index);
        }
      }
    });
  }

  #query(start, end) {
    const padding = Math.max(...this.probeOffsets.map(Math.abs)) + this.probeRadius + 0.2;
    const found = new Set();
    for (let x = Math.floor((Math.min(start.x, end.x) - padding) / this.cellSize);
      x <= Math.floor((Math.max(start.x, end.x) + padding) / this.cellSize); x++) {
      for (let z = Math.floor((Math.min(start.z, end.z) - padding) / this.cellSize);
        z <= Math.floor((Math.max(start.z, end.z) + padding) / this.cellSize); z++) {
        for (const index of this.grid.get(this.#key(x, z)) ?? []) found.add(index);
      }
    }
    return found;
  }

  reset(pose = null) {
    this.previousPose = pose ? { ...pose } : null;
    this.elapsed = 0;
    this.lastImpactAt = -Infinity;
  }

  #sweep(previous, current, centreY) {
    const candidates = this.#query(previous, current);
    let earliest = null;
    for (const offset of this.probeOffsets) {
      const from = forward(previous.heading);
      const to = forward(current.heading);
      const start = { x: previous.x + from.x * offset, z: previous.z + from.y * offset };
      const end = { x: current.x + to.x * offset, z: current.z + to.y * offset };
      for (const index of candidates) {
        const collider = this.colliders[index];
        if (centreY + 0.72 < collider.minY || centreY - 0.72 > collider.maxY) continue;
        const hit = collider.type === 'circle'
          ? sweepCircleCircle(start, end, this.probeRadius, collider)
          : sweepCircleBox(start, end, this.probeRadius, collider);
        if (hit && (!earliest || hit.t < earliest.t)) earliest = { ...hit, offset };
      }
    }
    return earliest;
  }

  resolve(vehicle, dt = 0, centreY = 0.82) {
    this.elapsed += Math.max(0, Number.isFinite(dt) ? dt : 0);
    const current = { x: vehicle.x, z: vehicle.z, heading: vehicle.heading, y: centreY };
    const previous = this.previousPose ?? current;
    const hit = this.#sweep(previous, current, centreY);
    if (!hit) {
      this.previousPose = current;
      return { collided: false, emit: false, impact: 0, collider: null };
    }

    const contactHeading = lerpHeading(previous.heading, current.heading, hit.t);
    const contactForward = forward(contactHeading);
    vehicle.x = hit.point.x - contactForward.x * hit.offset + hit.normal.x * CONTACT_SKIN;
    vehicle.z = hit.point.z - contactForward.y * hit.offset + hit.normal.y * CONTACT_SKIN;

    const speedSign = Math.sign(vehicle.speed) || 1;
    const velocity = forward(vehicle.heading).multiplyScalar(vehicle.speed);
    const normalVelocity = velocity.dot(hit.normal);
    const impact = Math.max(0, -normalVelocity);
    let retainedSpeed = 1;

    if (normalVelocity < -0.05) {
      const tangent = velocity.clone().addScaledVector(hit.normal, -normalVelocity);
      const bounced = tangent.multiplyScalar(0.72).addScaledVector(hit.normal, -normalVelocity * 0.16);
      const magnitude = bounced.length();
      if (magnitude > 0.02) {
        const correctedForward = bounced.divideScalar(magnitude).multiplyScalar(speedSign);
        vehicle.heading = headingFromForward(correctedForward);
      }
      retainedSpeed = Math.max(0.18, Math.min(0.86, magnitude / Math.max(0.01, Math.abs(vehicle.speed))));
      vehicle.speed = speedSign * magnitude;
      if (Number.isFinite(vehicle.accel)) vehicle.accel = Math.min(vehicle.accel, 0);
      if (Number.isFinite(vehicle.lateralAccel)) vehicle.lateralAccel *= 0.25;
    } else if (Math.abs(vehicle.speed) < 0.8) {
      vehicle.speed = 0;
    }

    const emit = impact > 1.4 && this.elapsed - this.lastImpactAt > 0.09;
    if (emit) this.lastImpactAt = this.elapsed;
    this.previousPose = { x: vehicle.x, z: vehicle.z, heading: vehicle.heading, y: centreY };
    return {
      collided: true,
      emit,
      impact,
      retainedSpeed,
      collider: hit.collider,
      normal: new THREE.Vector3(hit.normal.x, 0, hit.normal.y),
      point: new THREE.Vector3(hit.point.x, centreY, hit.point.z),
    };
  }
}

export function buildStaticCollisionWorld(root, options = {}) {
  return new StaticCollisionWorld(collectStaticColliders(root), options);
}
