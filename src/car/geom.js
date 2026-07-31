/**
 * Small geometry toolkit the car is built from.
 *
 * Body panels are lofted: we describe a handful of cross-sections along the
 * length of the car and skin them. That gives genuine curvature (crowned hood,
 * tumblehome in the sides, rounded shoulders) which you cannot get out of
 * boxes, while staying cheap enough for a standalone headset.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Skin a list of cross-sections into a BufferGeometry.
 *
 * @param {Array<{z:number, pts:Array<[number,number]>}>} sections
 *        Cross-sections ordered along +Z. Every section must have the same
 *        number of points, ordered consistently around the ring.
 * @param {object} [opts]
 * @param {boolean} [opts.closed=true]   Join the last point of a ring back to the first.
 * @param {boolean} [opts.capStart=false]
 * @param {boolean} [opts.capEnd=false]
 * @param {(seg:number)=>boolean} [opts.skip] Drop a profile segment along the whole
 *        loft - used to open the top of the cabin.
 * @param {(seg:number)=>number} [opts.group] Material index per profile segment, so
 *        one loft can be part paint / part trim.
 */
export function loft(sections, opts = {}) {
  const { closed = true, capStart = false, capEnd = false, skip = null, group = null, name = 'loft' } = opts;
  const n = sections[0].pts.length;
  const m = sections.length;

  // Sections advance along +Z, so a ring wound counter-clockwise in XY ends up
  // with outward-facing normals. A clockwise ring would render inside-out, and
  // that is easy to do by accident, so shout about it.
  if (closed && signedArea(sections[0].pts) < 0) {
    console.warn(`[loft:${name}] cross-section is wound clockwise - faces will point inwards`);
  }

  const position = [];
  const uv = [];
  for (let s = 0; s < m; s++) {
    const { z, pts } = sections[s];
    for (let i = 0; i < n; i++) {
      position.push(pts[i][0], pts[i][1], z);
      uv.push(i / (closed ? n : n - 1), s / (m - 1));
    }
  }

  const buckets = new Map();
  const push = (g, a, b, c) => {
    let list = buckets.get(g);
    if (!list) buckets.set(g, (list = []));
    list.push(a, b, c);
  };

  const segs = closed ? n : n - 1;
  for (let s = 0; s < m - 1; s++) {
    for (let i = 0; i < segs; i++) {
      if (skip && skip(i, s)) continue;
      const j = (i + 1) % n;
      const a = s * n + i, b = s * n + j, c = (s + 1) * n + j, d = (s + 1) * n + i;
      const g = group ? group(i, s) : 0;
      push(g, a, b, c);
      push(g, a, c, d);
    }
  }

  const cap = (sIndex, flip) => {
    const { z, pts } = sections[sIndex];
    let cx = 0, cy = 0;
    for (const p of pts) { cx += p[0]; cy += p[1]; }
    const centre = position.length / 3;
    position.push(cx / n, cy / n, z);
    uv.push(0.5, 0.5);
    // Use the segment mask of the band this cap sits against.
    const band = sIndex === 0 ? 0 : sIndex - 1;
    for (let i = 0; i < segs; i++) {
      if (skip && skip(i, band)) continue;
      const a = sIndex * n + i, b = sIndex * n + ((i + 1) % n);
      if (flip) push(0, centre, b, a); else push(0, centre, a, b);
    }
  };
  if (capStart) cap(0, true);
  if (capEnd) cap(m - 1, false);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));

  const indices = [];
  for (const [g, tris] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    geometry.addGroup(indices.length, tris.length, g);
    indices.push(...tris);
  }
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Shoelace area of a 2D ring: positive when wound counter-clockwise. */
export function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/**
 * Ring of 18 points describing one body cross-section, mirrored about X.
 *
 * Index map (used by the cabin opening and the trim bands):
 *   0 bottom centre, 2 rocker, 4 widest point, 6 beltline shoulder,
 *   9 top centre, 12 beltline shoulder (left), 16 rocker (left).
 */
export function bodySection({ yBot, yTop, hwBot, hwMax, yMax, hwTop, crown = 0 }) {
  const right = [
    [0, yBot],
    [hwBot * 0.72, yBot - 0.004],
    [hwBot, yBot + 0.055],
    [hwBot + (hwMax - hwBot) * 0.8, (yBot + yMax) * 0.5],
    [hwMax, yMax],
    [hwMax - (hwMax - hwTop) * 0.45, yMax + (yTop - yMax) * 0.6],
    [hwTop, yTop - 0.035],
    [hwTop * 0.8, yTop],
    [hwTop * 0.44, yTop + crown * 0.72],
    [0, yTop + crown],
  ];
  const left = right.slice(1, -1).map(([x, y]) => [-x, y]).reverse();
  return [...right, ...left];
}

/** Profile segments that span the top of the cabin (the roof/window opening). */
export const CABIN_TOP_SEGMENTS = (seg) => seg >= 6 && seg <= 11;

/** Linear blend of two section parameter objects. */
export function lerpParams(a, b, t) {
  const out = {};
  for (const k of Object.keys(a)) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

/** Smooth tube through points - roll cage, pillars, exhaust, wheelie bars. */
export function tube(points, radius, radialSegments = 8, tubularSegments = null) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const segs = tubularSegments ?? Math.max(6, Math.round(curve.getLength() * 10));
  return new THREE.TubeGeometry(curve, segs, radius, radialSegments, false);
}

/** Box with rounded edges, built by extruding a rounded rectangle along Z. */
export function roundedBox(w, h, d, r = 0.02, steps = 2) {
  r = Math.max(0.001, Math.min(r, w / 2 - 0.001, h / 2 - 0.001));
  const shape = new THREE.Shape();
  const x = w / 2 - r, y = h / 2 - r;
  shape.moveTo(-x - r, -y);
  shape.lineTo(-x - r, y);
  shape.quadraticCurveTo(-x - r, y + r, -x, y + r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x + r, y + r, x + r, y);
  shape.lineTo(x + r, -y);
  shape.quadraticCurveTo(x + r, -y - r, x, -y - r);
  shape.lineTo(-x, -y - r);
  shape.quadraticCurveTo(-x - r, -y - r, -x - r, -y);
  const bevel = Math.max(0.0005, Math.min(r * 0.8, d / 2 - 0.0005));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: d - bevel * 2,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: steps,
    curveSegments: steps + 1,
  });
  geo.translate(0, 0, -d / 2 + bevel);
  return geo;
}

/** Thin flat panel with rounded corners - glass, trim, decals. */
export function panel(w, h, r = 0.03, thickness = 0.006) {
  return roundedBox(w, h, thickness, r, 1);
}

/** Mesh helper: named, shadow-casting by default. */
export function mesh(geometry, material, name, { cast = true, receive = false } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.name = name;
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

/**
 * Mirror a geometry across X properly - flipping the winding order rather than
 * using a negative scale, so lighting and back-face culling stay correct (and
 * the glTF export stays valid).
 */
export function mirrorGeometry(geometry) {
  const geo = geometry.clone();
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setX(i, -pos.getX(i));
  pos.needsUpdate = true;
  const idx = geo.getIndex();
  if (idx) {
    const a = idx.array;
    for (let i = 0; i < a.length; i += 3) { const t = a[i]; a[i] = a[i + 2]; a[i + 2] = t; }
    idx.needsUpdate = true;
  }
  geo.computeVertexNormals();
  return geo;
}

/** Clone a mesh (or a whole subtree) mirrored across the car centreline. */
export function mirrorMesh(source, name) {
  const clone = source.clone(true);
  clone.name = name ?? source.name.replace(/_L$/, '_R');
  clone.traverse((o) => {
    if (o.isMesh) o.geometry = mirrorGeometry(o.geometry);
    o.position.x *= -1;
    o.rotation.y *= -1;
    o.rotation.z *= -1;
    if (o.name.endsWith('_L')) o.name = `${o.name.slice(0, -2)}_R`;
  });
  return clone;
}

const KEEP_ATTRIBUTES = ['position', 'normal', 'uv'];

/**
 * Bake a subtree of static decoration down to one mesh per material.
 *
 * Used on parts that never move on their own - rim spokes, cage tubes, trackside
 * furniture - because a headset cares far more about draw calls than triangles.
 * Anything that has to animate keeps its own node and never goes through here.
 */
export function mergeStatic(root, name = root.name, { keep = null } = {}) {
  root.updateWorldMatrix(false, true);
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const byMaterial = new Map();
  const passthrough = [];
  const kept = [];

  const visit = (o) => {
    if (o !== root && keep && keep(o)) { kept.push(o); return; }
    if (o.isMesh) collect(o);
    for (const child of [...o.children]) visit(child);
  };

  const collect = (o) => {
    if (Array.isArray(o.material)) { passthrough.push(o); return; }

    const geo = o.geometry.clone();
    for (const key of Object.keys(geo.attributes)) {
      if (!KEEP_ATTRIBUTES.includes(key)) geo.deleteAttribute(key);
    }
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) {
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    }
    if (!geo.index) {
      geo.setIndex([...Array(geo.attributes.position.count).keys()]);
    }

    const local = new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld);
    geo.applyMatrix4(local);
    if (local.determinant() < 0) {
      // A mirrored transform reverses winding; put it back.
      const idx = geo.getIndex().array;
      for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 2]; idx[i + 2] = t; }
      geo.getIndex().needsUpdate = true;
    }

    if (!byMaterial.has(o.material)) byMaterial.set(o.material, { geos: [], cast: false, receive: false });
    const entry = byMaterial.get(o.material);
    entry.geos.push(geo);
    entry.cast ||= o.castShadow;
    entry.receive ||= o.receiveShadow;
  };

  visit(root);

  const out = new THREE.Group();
  out.name = name;

  // Anything held back keeps its own node - and therefore its own pivot - but
  // is rebased so it still sits where it did.
  for (const node of kept) {
    new THREE.Matrix4()
      .multiplyMatrices(inverse, node.matrixWorld)
      .decompose(node.position, node.quaternion, node.scale);
    out.add(node);
  }
  for (const [material, { geos, cast, receive }] of byMaterial) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!merged) {                       // attribute mismatch: keep them separate
      geos.forEach((g, i) => out.add(mesh(g, material, `${name}_${material.name ?? 'part'}_${i}`, { cast, receive })));
      continue;
    }
    out.add(mesh(merged, material, `${name}_${material.name ?? 'part'}`, { cast, receive }));
  }
  for (const m of passthrough) out.add(m);
  return out;
}

/**
 * Merge a node's children in place, leaving the node itself (and its pivot)
 * exactly where it was. `keep` protects anything that has to stay animatable.
 */
export function bakeInto(node, keep = null) {
  const merged = mergeStatic(node, node.name, { keep });
  node.clear();
  for (const child of [...merged.children]) node.add(child);
  return node;
}

/** Group with children, skipping nulls. */
export function group(name, ...children) {
  const g = new THREE.Group();
  g.name = name;
  for (const c of children) if (c) g.add(c);
  return g;
}

/**
 * Lathe a 2D profile and lay it on its side so the axis of revolution is X.
 * Profile points are [radius, axialOffset]; +axial ends up at +X.
 */
export function latheX(points, segments = 32) {
  const geo = new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments);
  geo.rotateZ(-Math.PI / 2);
  return geo;
}
