/** Geometry builders for road layers, barriers and the harbour tunnel. */
import * as THREE from 'three';

function buffers() {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

function addQuad(out, a, b, c, d, normalA = null, normalB = normalA, uv = null) {
  const base = out.positions.length / 3;
  for (const p of [a, b, c, d]) out.positions.push(p.x, p.y, p.z);
  if (normalA) {
    for (const n of [normalA, normalA, normalB, normalB]) out.normals.push(n.x, n.y, n.z);
  }
  if (uv) out.uvs.push(...uv);
  out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function finish(out, name, computeNormals = false) {
  const geometry = new THREE.BufferGeometry();
  geometry.name = name;
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(out.positions, 3));
  if (out.uvs.length) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(out.uvs, 2));
  if (out.normals.length) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(out.normals, 3));
  geometry.setIndex(out.indices);
  if (computeNormals || !out.normals.length) geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

const always = () => true;

/** A horizontal strip following the route, suitable for asphalt and markings. */
export function ribbonGeometry(route, {
  width,
  offset = 0,
  lift = 0,
  uvMetres = 10,
  name = 'RoadRibbon',
  include = always,
  underside = false,
} = {}) {
  const out = buffers();
  for (let i = 0; i < route.sampleCount; i++) {
    const a = route.frames[i];
    const b = route.frames[i + 1];
    const midU = (i + 0.5) / route.sampleCount;
    const midD = route.length * midU;
    if (!include(midU, midD, i)) continue;

    const aLeft = a.center.clone().addScaledVector(a.right, offset - width / 2).addScaledVector(a.normal, lift);
    const aRight = a.center.clone().addScaledVector(a.right, offset + width / 2).addScaledVector(a.normal, lift);
    const bLeft = b.center.clone().addScaledVector(b.right, offset - width / 2).addScaledVector(b.normal, lift);
    const bRight = b.center.clone().addScaledVector(b.right, offset + width / 2).addScaledVector(b.normal, lift);
    const v0 = a.distance / uvMetres;
    const v1 = b.distance / uvMetres;
    if (underside) {
      const aDown = a.normal.clone().negate();
      const bDown = b.normal.clone().negate();
      addQuad(out, aRight, aLeft, bLeft, bRight, aDown, bDown, [1, v0, 0, v0, 0, v1, 1, v1]);
    } else {
      addQuad(out, aLeft, aRight, bRight, bLeft, a.normal, b.normal, [0, v0, 1, v0, 1, v1, 0, v1]);
    }
  }
  return finish(out, name);
}

/** Dashed or broken road paint generated as one geometry/draw call. */
export function dashedRibbonGeometry(route, options = {}) {
  const { dash = 5.5, gap = 5.5, include = always } = options;
  return ribbonGeometry(route, {
    ...options,
    include: (u, d, i) => include(u, d, i) && (d % (dash + gap)) < dash,
  });
}

/** Solid Jersey barrier with inner, outer and top faces. */
export function barrierGeometry(route, {
  offset,
  height = 1.05,
  thickness = 0.34,
  baseLift = 0.02,
  name = 'CourseBarrier',
  include = always,
} = {}) {
  const out = buffers();
  for (let i = 0; i < route.sampleCount; i++) {
    const a = route.frames[i];
    const b = route.frames[i + 1];
    const midU = (i + 0.5) / route.sampleCount;
    const midD = route.length * midU;
    if (!include(midU, midD, i)) continue;

    const ai = a.center.clone().addScaledVector(a.right, offset - thickness / 2).addScaledVector(a.normal, baseLift);
    const ao = a.center.clone().addScaledVector(a.right, offset + thickness / 2).addScaledVector(a.normal, baseLift);
    const bi = b.center.clone().addScaledVector(b.right, offset - thickness / 2).addScaledVector(b.normal, baseLift);
    const bo = b.center.clone().addScaledVector(b.right, offset + thickness / 2).addScaledVector(b.normal, baseLift);
    const ati = ai.clone().addScaledVector(a.normal, height);
    const ato = ao.clone().addScaledVector(a.normal, height);
    const bti = bi.clone().addScaledVector(b.normal, height);
    const bto = bo.clone().addScaledVector(b.normal, height);

    addQuad(out, ai, bi, bti, ati);
    addQuad(out, bo, ao, ato, bto);
    addQuad(out, ati, bti, bto, ato);
  }
  return finish(out, name, true);
}

/** Vertical fascia beneath an elevated road deck. */
export function fasciaGeometry(route, {
  offset,
  depth = 1.15,
  name = 'ViaductFascia',
  include = always,
} = {}) {
  const out = buffers();
  for (let i = 0; i < route.sampleCount; i++) {
    const a = route.frames[i];
    const b = route.frames[i + 1];
    const midU = (i + 0.5) / route.sampleCount;
    if (!include(midU, route.length * midU, i)) continue;
    const at = a.center.clone().addScaledVector(a.right, offset).addScaledVector(a.normal, -0.08);
    const bt = b.center.clone().addScaledVector(b.right, offset).addScaledVector(b.normal, -0.08);
    const ab = at.clone().addScaledVector(a.normal, -depth);
    const bb = bt.clone().addScaledVector(b.normal, -depth);
    if (offset < 0) addQuad(out, at, bt, bb, ab);
    else addQuad(out, ab, bb, bt, at);
  }
  return finish(out, name, true);
}

/**
 * Concrete tunnel shell.  Cross-section coordinates are lateral metres and
 * height above the route; the open bottom is supplied by the road itself.
 */
export function tunnelGeometry(route, {
  start = 0.70,
  end = 0.80,
  name = 'HarbourTunnelShell',
} = {}) {
  const out = buffers();
  const section = [
    [-8.8, 0.0], [-8.8, 4.2], [-7.6, 6.6], [-5.0, 8.15],
    [0, 8.75], [5.0, 8.15], [7.6, 6.6], [8.8, 4.2], [8.8, 0.0],
  ];

  const point = (frame, [lateral, height]) => frame.center.clone()
    .addScaledVector(frame.right, lateral)
    .addScaledVector(frame.normal, height);

  for (let i = 0; i < route.sampleCount; i++) {
    const u = (i + 0.5) / route.sampleCount;
    if (u < start || u > end) continue;
    const a = route.frames[i];
    const b = route.frames[i + 1];
    for (let k = 0; k < section.length - 1; k++) {
      addQuad(out, point(a, section[k]), point(b, section[k]), point(b, section[k + 1]), point(a, section[k + 1]));
    }
  }
  return finish(out, name, true);
}

/** Low wall panels used for sponsor boards and light streaks. */
export function verticalRibbonGeometry(route, {
  offset,
  bottom = 0,
  height = 1,
  name = 'VerticalRibbon',
  include = always,
} = {}) {
  const out = buffers();
  for (let i = 0; i < route.sampleCount; i++) {
    const a = route.frames[i];
    const b = route.frames[i + 1];
    const u = (i + 0.5) / route.sampleCount;
    const d = route.length * u;
    if (!include(u, d, i)) continue;
    const ab = a.center.clone().addScaledVector(a.right, offset).addScaledVector(a.normal, bottom);
    const bb = b.center.clone().addScaledVector(b.right, offset).addScaledVector(b.normal, bottom);
    const at = ab.clone().addScaledVector(a.normal, height);
    const bt = bb.clone().addScaledVector(b.normal, height);
    if (offset < 0) addQuad(out, ab, bb, bt, at);
    else addQuad(out, at, bt, bb, ab);
  }
  return finish(out, name, true);
}
