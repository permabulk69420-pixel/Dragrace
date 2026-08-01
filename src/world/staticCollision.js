/**
 * Swept 2D collision against actual scenery geometry.
 *
 * The vehicle simulation exposes a planar pose rather than a rigid body, so this
 * module deliberately solves the part the game needs: a three-circle car capsule
 * swept continuously against static circles and oriented boxes. It uses the real
 * transforms of buildings, warehouses, containers, landmark walls and bridge
 * supports instead of treating the road spline as an invisible fence.
 */
import * as THREE from 'three';

const DEFAULT_CELL_SIZE = 40;
const DEFAULT_PROBE_RADIUS = 0.78;
const DEFAULT_PROBE_OFFSETS = Object.freeze([-1.35, 0, 1.35]);
const CONTACT_SKIN = 0.035;
const EPSILON = 1e-7;

const SOLID_INSTANCE_NAMES = new Set([
  'ChamferedTowers',
  'SetbackTowers',
  'RoundCornerTowers',
  'CrownedOfficeTowers',
  'SlabHotels',
  'GabledWarehouses',
  'ShippingContainers',
  'StorageTanks',
  'IndustrialSmokestacks',
  'ViaductPillars',
  'TunnelPortalConcrete',
]);

const SOLID_MESH_NAMES = new Set([
  'ViaductPillars',
  'TunnelPortalConcrete',
]);

const STRUCTURAL_ROOT_NAMES = new Set([
  'ArchitecturalLandmarks',
  'IndustrialLandmarks',
]);

const IGNORE_NAME = /(sign|glow|window|light|lamp|bulb|pool|reflector|mark|stripe|arrow|wire|fence|road|asphalt|shoulder|ground|water|mountain|sky|cloud|star|moon|skid|puddle|manhole|drain|joint|gantry|scoreboard|beacon|mast|antenna|trim|band|fin|mullion|canopy|awning|plaza|forecourt|courtyard|floor|slab|ramp|cable|warning)/i;

const _matrix = new THREE.Matrix4();
const _instanceMatrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _boxCentre = new THREE.Vector3();
const _boxSize = new THREE.Vector3();
const _corner = new THREE.Vector3();
const _euler = new THREE.Euler();

function hasStructuralAncestor(object, root) {
  let cursor = object;
  while (cursor && cursor !== root) {
    if (STRUCTURAL_ROOT_NAMES.has(cursor.name) || /^Landmark_|^Industrial_/.test(cursor.name)) return true;
    cursor = cursor.parent;
  }
  return false;
}

function shouldCollect(object, root) {
  if (!object.visible || !object.isMesh || !object.geometry) return false;
  if (object.isInstancedMesh && SOLID_INSTANCE_NAMES.has(object.name)) return true;
  if (SOLID_MESH_NAMES.has(object.name)) return true;
  if (!hasStructuralAncestor(object, root)) return false;
  return !IGNORE_NAME.test(object.name);
}

function transformedVerticalBounds(box, matrix) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (let xi = 0; xi < 2; xi++) {
    for (let yi = 0; yi < 2; yi++) {
      for (let zi = 0; zi < 2; zi++) {
        _corner.set(
          xi ? box.max.x : box.min.x,
          yi ? box.max.y : box.min.y,
          zi ? box.max.z : box.min.z,
        ).applyMatrix4(matrix);
        minY = Math.min(minY, _corner.y);
        maxY = Math.max(maxY, _corner.y);
      }
    }
  }
  return { minY, maxY };
}

function colliderFromTransform(object, matrix, instanceIndex = null) {
  const geometry = object.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return null;

  box.getCenter(_boxCentre);
  box.getSize(_boxSize);
  matrix.decompose(_position, _quaternion, _scale);
  const centre = _boxCentre.clone().applyMatrix4(matrix);
  const halfX = Math.abs(_boxSize.x * _scale.x) * 0.5;
  const halfZ = Math.abs(_boxSize.z * _scale.z) * 0.5;
  const vertical = transformedVerticalBounds(box, matrix);
  const height = vertical.maxY - vertical.minY;

  // Only geometry that can physically overlap the car is useful. This rejects
  // rooftop trim, overhead bridge decks, road decals and other visual layers.
  if (vertical.maxY < 0.22 || vertical.minY > 2.25 || height < 0.55) return null;
  if (halfX < 0.18 || halfZ < 0.18 || halfX * halfZ < 0.12) return null;

  _euler.setFromQuaternion(_quaternion, 'YXZ');
  const yaw = _euler.y;
  const cylindrical = /tank|smokestack|silo|cylinder/i.test(object.name) ||
    (geometry.type?.includes('Cylinder') && Math.abs(halfX - halfZ) < Math.max(halfX, halfZ) * 0.22);

  const base = {
    id: instanceIndex == null ? object.name : `${object.name}:${instanceIndex}`,
    source: object.name,
    x: centre.x,
    z: centre.z,
    minY: vertical.minY,
    maxY: vertical.maxY,
  };

  if (cylindrical) {
    return { ...base, type: 'circle', radius: Math.max(halfX, halfZ) };
  }
  return { ...base, type: 'box', halfX, halfZ, yaw };
}

function colliderBounds(collider) {
  if (collider.type === 'circle') {
    return {
      minX: collider.x - collider.radius,
      maxX: collider.x + collider.radius,
      minZ: collider.z - collider.radius,
      maxZ: collider.z + collider.radius,
    };
  }
  const c = Math.cos(collider.yaw);
  const s = Math.sin(collider.yaw);
  const extentX = Math.abs(c) * collider.halfX + Math.abs(s) * collider.halfZ;
  const extentZ = Math.abs(s) * collider.halfX + Math.abs(c) * collider.halfZ;
  return {
    minX: collider.x - extentX,
    maxX: collider.x + extentX,
    minZ: collider.z - extentZ,
    maxZ: collider.z + extentZ,
  };
}

/** Build collision shapes from the actual rendered scenery transforms. */
export function collectStaticColliders(root) {
  root.updateMatrixWorld(true);
  const colliders = [];

  root.traverse((object) => {
    if (!shouldCollect(object, root)) return;
    if (object.isInstancedMesh) {
      for (let i = 0; i < object.count; i++) {
        object.getMatrixAt(i, _instanceMatrix);
        _matrix.multiplyMatrices(object.matrixWorld, _instanceMatrix);
        const collider = colliderFromTransform(object, _matrix, i);
        if (collider) colliders.push(collider);
      }
      return;
    }
    const collider = colliderFromTransform(object, object.matrixWorld);
    if (collider) colliders.push(collider);
  });

  return colliders;
}

function rotateToLocal(x, z, collider) {
  const c = Math.cos(collider.yaw);
  const s = Math.sin(collider.yaw);
  const dx = x - collider.x;
  const dz = z - collider.z;
  return { x: c * dx - s * dz, z: s * dx + c * dz };
}

function rotateNormalToWorld(x, z, collider) {
  const c = Math.cos(collider.yaw);
  const s = Math.sin(collider.yaw);
  return new THREE.Vector2(c * x + s * z, -s * x + c * z).normalize();
}

function sweepCircleAgainstCircle(start, end, probeRadius, collider) {
  const radius = probeRadius + collider.radius;
  const sx = start.x - collider.x;
  const sz = start.z - collider.z;
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const startDistanceSq = sx * sx + sz * sz;

  if (startDistanceSq < radius * radius) {
    const length = Math.sqrt(startDistanceSq);
    const normal = length > EPSILON
      ? new THREE.Vector2(sx / length, sz / length)
      : new THREE.Vector2(dx || 1, dz).normalize().multiplyScalar(-1);
    return { t: 0, normal, point: new THREE.Vector2(start.x, start.z), collider };
  }

  const a = dx * dx + dz * dz;
  if (a < EPSILON) return null;
  const b = 2 * (sx * dx + sz * dz);
  const c = startDistanceSq - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  if (t < 0 || t > 1) return null;
  const px = start.x + dx * t;
  const pz = start.z + dz * t;
  const normal = new THREE.Vector2(px - collider.x, pz - collider.z).normalize();
  return { t, normal, point: new THREE.Vector2(px, pz), collider };
}

function sweepCircleAgainstBox(start, end, probeRadius, collider) {
  const a = rotateToLocal(start.x, start.z, collider);
  const b = rotateToLocal(end.x, end.z, collider);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const hx = collider.halfX + probeRadius;
  const hz = collider.halfZ + probeRadius;

  if (Math.abs(a.x) < hx && Math.abs(a.z) < hz) {
    const distances = [
      { d: hx - a.x, nx: 1, nz: 0 },
      { d: hx + a.x, nx: -1, nz: 0 },
      { d: hz - a.z, nx: 0, nz: 1 },
      { d: hz + a.z, nx: 0, nz: -1 },
    ].sort((left, right) => left.d - right.d);
    return {
      t: 0,
      normal: rotateNormalToWorld(distances[0].nx, distances[0].nz, collider),
      point: new THREE.Vector2(start.x, start.z),
      collider,
    };
  }

  let near = 0;
  let far = 1;
  let localNormalX = 0;
  let localNormalZ = 0;

  const axes = [
    { p: a.x, d: dx, min: -hx, max: hx, axis: 'x' },
    { p: a.z, d: dz, min: -hz, max: hz, axis: 'z' },
  ];

  for (const axis of axes) {
    if (Math.abs(axis.d) < EPSILON) {
      if (axis.p < axis.min || axis.p > axis.max) return null;
      continue;
    }
    let t1 = (axis.min - axis.p) / axis.d;
    let t2 = (axis.max - axis.p) / axis.d;
    let normalSign = -1;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      normalSign = 1;
    }
    if (t1 > near) {
      near = t1;
      localNormalX = axis.axis === 'x' ? normalSign : 0;
      localNormalZ = axis.axis === 'z' ? normalSign : 0;
    }
    far = Math.min(far, t2);
    if (near > far) return null;
  }

  if (near < 0 || near > 1) return null;
  return {
    t: near,
    normal: rotateNormalToWorld(localNormalX, localNormalZ, collider),
    point: new THREE.Vector2(start.x + (end.x - start.x) * near, start.z + (end.z - start.z) * near),
    collider,
  };
}

function headingForward(heading) {
  return new THREE.Vector2(-Math.sin(heading), -Math.cos(heading));
}

function lerpAngle(a, b, t) {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}

function headingFromForward(direction) {
  return Math.atan2(-direction.x, -direction.y);
}

export class StaticCollisionWorld {
  constructor(colliders, {
    cellSize = DEFAULT_CELL_SIZE,
    probeRadius = DEFAULT_PROBE_RADIUS,
    probeOffsets = DEFAULT_PROBE_OFFSETS,
  } = {}) {
    this.colliders = colliders;
    this.cellSize = cellSize;
    this.probeRadius = probeRadius;
    this.probeOffsets = [...probeOffsets];
    this.grid = new Map();
    this.previousPose = null;
    this.elapsed = 0;
    this.lastImpactAt = -Infinity;
    this.#buildGrid();
  }

  #cellKey(x, z) {
    return `${x},${z}`;
  }

  #buildGrid() {
    for (let index = 0; index < this.colliders.length; index++) {
      const bounds = colliderBounds(this.colliders[index]);
      const minX = Math.floor(bounds.minX / this.cellSize);
      const maxX = Math.floor(bounds.maxX / this.cellSize);
      const minZ = Math.floor(bounds.minZ / this.cellSize);
      const maxZ = Math.floor(bounds.maxZ / this.cellSize);
      for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
          const key = this.#cellKey(x, z);
          if (!this.grid.has(key)) this.grid.set(key, []);
          this.grid.get(key).push(index);
        }
      }
    }
  }

  #query(start, end) {
    const padding = Math.max(...this.probeOffsets.map(Math.abs)) + this.probeRadius + 0.2;
    const minX = Math.floor((Math.min(start.x, end.x) - padding) / this.cellSize);
    const maxX = Math.floor((Math.max(start.x, end.x) + padding) / this.cellSize);
    const minZ = Math.floor((Math.min(start.z, end.z) - padding) / this.cellSize);
    const maxZ = Math.floor((Math.max(start.z, end.z) + padding) / this.cellSize);
    const indices = new Set();
    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (const index of this.grid.get(this.#cellKey(x, z)) ?? []) indices.add(index);
      }
    }
    return indices;
  }

  reset(pose = null) {
    this.previousPose = pose ? { ...pose } : null;
    this.elapsed = 0;
    this.lastImpactAt = -Infinity;
  }

  #sweep(previous, current, centreY) {
    const candidateIndices = this.#query(previous, current);
    let earliest = null;

    for (const offset of this.probeOffsets) {
      const previousForward = headingForward(previous.heading);
      const currentForward = headingForward(current.heading);
      const start = new THREE.Vector2(
        previous.x + previousForward.x * offset,
        previous.z + previousForward.y * offset,
      );
      const end = new THREE.Vector2(
        current.x + currentForward.x * offset,
        current.z + currentForward.y * offset,
      );

      for (const index of candidateIndices) {
        const collider = this.colliders[index];
        if (centreY + 0.72 < collider.minY || centreY - 0.72 > collider.maxY) continue;
        const hit = collider.type === 'circle'
          ? sweepCircleAgainstCircle(start, end, this.probeRadius, collider)
          : sweepCircleAgainstBox(start, end, this.probeRadius, collider);
        if (!hit || (earliest && hit.t >= earliest.t)) continue;
        earliest = { ...hit, offset };
      }
    }
    return earliest;
  }

  resolve(vehicle, dt = 0, centreY = 0.82) {
    this.elapsed += Math.max(0, Number.isFinite(dt) ? dt : 0);
    const current = {
      x: vehicle.x,
      z: vehicle.z,
      heading: vehicle.heading,
      y: centreY,
    };
    const previous = this.previousPose ?? current;
    const hit = this.#sweep(previous, current, centreY);

    if (!hit) {
      this.previousPose = current;
      return { collided: false, emit: false, impact: 0, collider: null };
    }

    const contactHeading = lerpAngle(previous.heading, current.heading, hit.t);
    const contactForward = headingForward(contactHeading);
    const probeOffsetX = contactForward.x * hit.offset;
    const probeOffsetZ = contactForward.y * hit.offset;
    vehicle.x = hit.point.x - probeOffsetX + hit.normal.x * CONTACT_SKIN;
    vehicle.z = hit.point.y - probeOffsetZ + hit.normal.y * CONTACT_SKIN;

    const speedSign = Math.sign(vehicle.speed) || 1;
    const velocity = headingForward(vehicle.heading).multiplyScalar(vehicle.speed);
    const normalVelocity = velocity.dot(hit.normal);
    const impact = Math.max(0, -normalVelocity);
    let retainedSpeed = 1;

    if (normalVelocity < -0.05) {
      const tangent = velocity.clone().addScaledVector(hit.normal, -normalVelocity);
      const bounced = tangent.multiplyScalar(0.72)
        .addScaledVector(hit.normal, -normalVelocity * 0.16);
      const newMagnitude = bounced.length();
      if (newMagnitude > 0.02) {
        const travelDirection = bounced.divideScalar(newMagnitude);
        const correctedForward = travelDirection.multiplyScalar(speedSign);
        vehicle.heading = headingFromForward(correctedForward);
      }
      retainedSpeed = Math.max(0.18, Math.min(0.86, newMagnitude / Math.max(0.01, Math.abs(vehicle.speed))));
      vehicle.speed = speedSign * newMagnitude;
      if (Number.isFinite(vehicle.accel)) vehicle.accel = Math.min(vehicle.accel, 0);
      if (Number.isFinite(vehicle.lateralAccel)) vehicle.lateralAccel *= 0.25;
    } else if (Math.abs(vehicle.speed) < 0.8) {
      vehicle.speed = 0;
    }

    const emit = impact > 1.4 && this.elapsed - this.lastImpactAt > 0.09;
    if (emit) this.lastImpactAt = this.elapsed;
    this.previousPose = {
      x: vehicle.x,
      z: vehicle.z,
      heading: vehicle.heading,
      y: centreY,
    };

    return {
      collided: true,
      emit,
      impact,
      retainedSpeed,
      collider: hit.collider,
      normal: new THREE.Vector3(hit.normal.x, 0, hit.normal.y),
      point: new THREE.Vector3(hit.point.x, centreY, hit.point.y),
    };
  }
}

export function buildStaticCollisionWorld(root, options = {}) {
  return new StaticCollisionWorld(collectStaticColliders(root), options);
}
