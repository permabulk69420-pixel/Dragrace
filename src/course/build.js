/**
 * Geometry helpers for building things that follow the road.
 *
 * Almost every surface in the course - tarmac, markings, kerbs, pavements, the
 * viaduct deck, the tunnel lining, guardrails - is a ribbon: a strip of quads
 * swept along the centreline between two lateral offsets. One generator covers
 * all of them, which keeps the world code short and the vertex layouts
 * consistent enough to merge later.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mergeStatic } from '../car/geom.js';
import { wrap } from './util.js';

/**
 * Frames every `step` metres between two lap distances.
 * @param {import('./layout.js').Track} track
 */
export function frames(track, from = 0, to = track.length, step = 4) {
  const out = [];
  const span = to - from;
  const count = Math.max(1, Math.round(span / step));
  for (let i = 0; i <= count; i++) out.push(track.frameAt(from + (span * i) / count));
  return out;
}

/** Every sample of the lap as a frame list, ready to close into a loop. */
export function lapFrames(track, step = 4) {
  const count = Math.max(8, Math.round(track.length / step));
  const out = [];
  for (let i = 0; i < count; i++) out.push(track.frameAt((track.length * i) / count));
  return out;
}

const _p = new THREE.Vector3();

/** World position for a lateral offset and height above a frame. */
export function onRoad(frame, lateral, lift = 0, out = new THREE.Vector3()) {
  return out.copy(frame.position)
    .addScaledVector(frame.right, lateral)
    .addScaledVector(frame.up, lift);
}

/**
 * Sweep a strip between two edges.
 *
 * @param {Array} list frames, in order
 * @param {(frame:object, i:number)=>[{lat:number,lift:number},{lat:number,lift:number}]} edges
 *        left edge first, then right
 * @param {object} [opts]
 * @param {boolean} [opts.closed=false] join the last frame back to the first
 * @param {number} [opts.tile=8] metres per texture repeat
 * @param {boolean} [opts.flip=false] reverse the winding (for undersides)
 */
export function ribbon(list, edges, opts = {}) {
  const { closed = false, tile = 8, flip = false, vScale = 1 } = opts;
  const n = list.length;
  if (n < 2) return null;

  const position = [];
  const uv = [];
  for (let i = 0; i < n; i++) {
    const frame = list[i];
    const [left, right] = edges(frame, i);
    onRoad(frame, left.lat, left.lift ?? 0, _p);
    position.push(_p.x, _p.y, _p.z);
    uv.push(left.lat / tile, (frame.s / tile) * vScale);
    onRoad(frame, right.lat, right.lift ?? 0, _p);
    position.push(_p.x, _p.y, _p.z);
    uv.push(right.lat / tile, (frame.s / tile) * vScale);
  }

  const index = [];
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = ((i + 1) % n) * 2;
    const d = c + 1;
    if (flip) index.push(a, c, b, b, c, d);
    else index.push(a, b, c, b, d, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

/**
 * A ribbon of the same shape as `ribbon`, but broken into dashes - lane
 * markings, kerb stripes, anything intermittent.
 *
 * @param {import('./layout.js').Track} track
 * @param {object} opts
 */
export function dashes(track, opts) {
  const {
    from = 0,
    to = track.length,
    on = 3,
    off = 6,
    lat = 0,
    width = 0.15,
    lift = 0.02,
    steps = 3,
  } = opts;
  const geos = [];
  const period = on + off;
  const count = Math.max(1, Math.floor((to - from) / period));
  for (let i = 0; i < count; i++) {
    const start = from + i * period;
    const list = frames(track, start, start + on, on / steps);
    const geo = ribbon(list, (frame) => {
      const half = (typeof width === 'function' ? width(frame) : width) / 2;
      const centre = typeof lat === 'function' ? lat(frame) : lat;
      return [{ lat: centre - half, lift }, { lat: centre + half, lift }];
    }, { tile: 1 });
    if (geo) geos.push(geo);
  }
  return geos.length ? mergeGeometries(geos, false) : null;
}

/** Solid line along the road, offset laterally. */
export function stripe(track, opts) {
  const { from = 0, to = track.length, lat = 0, width = 0.15, lift = 0.02, step = 4, closed = false } = opts;
  const list = closed ? lapFrames(track, step) : frames(track, from, to, step);
  return ribbon(list, (frame) => {
    const half = (typeof width === 'function' ? width(frame) : width) / 2;
    const centre = typeof lat === 'function' ? lat(frame) : lat;
    return [{ lat: centre - half, lift }, { lat: centre + half, lift }];
  }, { tile: 1, closed });
}

/* -------------------------------------------------------------------------- */
/* Placement                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Drop a prebuilt object at a world position, facing along a heading.
 * The clone keeps sharing geometry and material, so this stays cheap; the
 * whole lot is merged afterwards anyway.
 */
export function place(prototype, position, { rotationY = 0, scale = 1, tilt = 0 } = {}) {
  const node = prototype.clone(true);
  node.position.copy(position);
  node.rotation.set(tilt, rotationY, 0);
  if (scale !== 1) node.scale.setScalar(scale);
  return node;
}

/**
 * Line up copies of an object along the road.
 *
 * @param {import('./layout.js').Track} track
 * @param {THREE.Object3D} prototype
 * @param {object} opts from/to/spacing/lat/lift/faceRoad/jitter/rng/filter
 * @returns {THREE.Group}
 */
export function repeatAlong(track, prototype, opts = {}) {
  const {
    from = 0,
    to = track.length,
    spacing = 25,
    lat = 0,
    lift = 0,
    turn = 0,
    jitter = 0,
    rng = null,
    filter = null,
    scale = 1,
    name = 'Row',
    followGrade = true,
  } = opts;
  const g = new THREE.Group();
  g.name = name;
  const span = to - from;
  const count = Math.max(0, Math.floor(span / spacing));
  for (let i = 0; i < count; i++) {
    const s = from + i * spacing + (rng && jitter ? rng.jitter(jitter) : 0);
    const frame = track.frameAt(s);
    if (filter && !filter(frame, i)) continue;
    const offset = typeof lat === 'function' ? lat(frame, i) : lat;
    const position = onRoad(frame, offset, typeof lift === 'function' ? lift(frame, i) : lift);
    g.add(place(prototype, position, {
      rotationY: frame.heading + (typeof turn === 'function' ? turn(frame, i) : turn),
      scale: typeof scale === 'function' ? scale(frame, i) : scale,
      tilt: followGrade ? Math.asin(THREE.MathUtils.clamp(frame.gradient, -1, 1)) : 0,
    }));
  }
  return g;
}

/* -------------------------------------------------------------------------- */
/* Primitives                                                                  */
/* -------------------------------------------------------------------------- */

/** Box mesh with its base on y = 0, which is how nearly everything is placed. */
export function standing(w, h, d, material, name = 'Box') {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(0, h / 2, 0);
  const m = new THREE.Mesh(geo, material);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Flat quad lying on the ground, centred on the origin. */
export function slab(w, d, material, name = 'Slab') {
  const geo = new THREE.PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, material);
  m.name = name;
  m.receiveShadow = true;
  m.castShadow = false;
  return m;
}

/** Upright billboard-style panel, centred on its own origin. */
export function panel(w, h, material, name = 'Panel') {
  const geo = new THREE.PlaneGeometry(w, h);
  const m = new THREE.Mesh(geo, material);
  m.name = name;
  m.castShadow = false;
  return m;
}

/** Cylinder standing on y = 0. */
export function post(radius, height, material, { segments = 8, taper = 1, name = 'Post' } = {}) {
  const geo = new THREE.CylinderGeometry(radius * taper, radius, height, segments);
  geo.translate(0, height / 2, 0);
  const m = new THREE.Mesh(geo, material);
  m.name = name;
  m.castShadow = true;
  return m;
}

/**
 * Bake a pile of static scenery into a handful of meshes, chunk by chunk.
 *
 * Merging everything into one mesh would be the fewest draw calls, but it also
 * means the whole city is submitted every frame. Splitting the bake by position
 * around the lap keeps the call count low *and* lets the frustum throw away the
 * two thirds of the world that are behind you - which is the difference between
 * comfortable and unpleasant on a standalone headset.
 *
 * @param {THREE.Object3D} root holder full of scenery
 * @param {import('./layout.js').Track} track
 * @param {object} [opts]
 * @returns {THREE.Group}
 */
export function bakeChunks(root, track, { chunks = 18, name = 'Baked' } = {}) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const at = new THREE.Vector3();
  for (const child of [...root.children]) {
    child.getWorldPosition(at);
    const s = track.query(at.x, at.z).s;
    const key = Math.floor((s / track.length) * chunks) % chunks;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = new THREE.Group();
      bucket.name = `${name}_${key}`;
      buckets.set(key, bucket);
    }
    bucket.add(child);
  }
  const out = new THREE.Group();
  out.name = name;
  for (const bucket of buckets.values()) out.add(mergeStatic(bucket, bucket.name));
  return out;
}

/** Merge a list of geometries, tolerating nulls. */
export function mergeAll(geos) {
  const list = geos.filter(Boolean);
  if (!list.length) return null;
  return list.length === 1 ? list[0] : mergeGeometries(list, false);
}

/** Add children to a parent, skipping anything that came back empty. */
export function addTo(parent, ...objects) {
  for (const o of objects) if (o) parent.add(o);
  return parent;
}

/** Mesh from a geometry, with sensible shadow defaults for scenery. */
export function meshOf(geometry, material, name, { cast = false, receive = true } = {}) {
  if (!geometry) return null;
  const m = new THREE.Mesh(geometry, material);
  m.name = name;
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

/** Distance along the lap, wrapped - re-exported so builders need one import. */
export { wrap };
