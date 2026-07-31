/**
 * The centreline of the course, and everything that hangs off it.
 *
 * A handful of hand-placed waypoints are lofted into a closed Catmull-Rom
 * curve, resampled at a fixed arc-length step, and each sample gets a full
 * frame: position, forward, right, up (rolled for banking), road width, signed
 * curvature and which kind of section it belongs to. Road surface, kerbs,
 * barriers, street furniture, the terrain blend and the car's own "where am I
 * on the track" query all read from this one table, so nothing can drift out of
 * alignment with anything else.
 *
 * Conventions
 *   - metres, +Y up, right-handed. Forward is the direction of travel.
 *   - right = forward x up, so +lateral is the driver's right.
 *   - s is arc length from the start line, wrapping at `length`.
 */
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

/** Smooth 0..1 ramp. */
const smoothstep = (t) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

export class CoursePath {
  /**
   * @param {Array<object>} waypoints  {x, y, z, width, surface, district, name}
   * @param {object} [opts]
   * @param {number} [opts.step=2]       sample spacing in metres
   * @param {boolean} [opts.closed=true]
   * @param {number} [opts.bankGain=26]  metres of banking per unit curvature
   * @param {number} [opts.maxBank=0.09] radians
   */
  constructor(waypoints, opts = {}) {
    const { step = 2, closed = true, bankGain = 26, maxBank = 0.09, tension = 0.5 } = opts;

    this.waypoints = waypoints;
    this.closed = closed;
    this.step = step;

    const points = waypoints.map((w) => new THREE.Vector3(w.x, w.y ?? 0, w.z));
    this.curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal', tension);

    // Arc length at each waypoint, so per-waypoint attributes can be blended
    // along the curve without guessing where the control points landed.
    const per = 24;
    const n = points.length;
    const spans = closed ? n : n - 1;
    const lengths = this.curve.getLengths(spans * per);
    this.length = lengths[lengths.length - 1];
    this.waypointS = waypoints.map((_, i) => lengths[i * per]);
    if (!closed) this.waypointS[n - 1] = this.length;

    this.count = Math.max(8, Math.round(this.length / step));
    this.spacing = this.length / this.count;
    this.samples = this._buildSamples(bankGain, maxBank);
    this._grid = this._buildGrid();
  }

  /* ---------------------------------------------------------------------- */

  _buildSamples(bankGain, maxBank) {
    const { count, closed } = this;
    const total = closed ? count : count + 1;
    const samples = new Array(total);

    for (let i = 0; i < total; i++) {
      const s = i * this.spacing;
      const u = closed ? i / count : i / count;
      const pos = this.curve.getPointAt(Math.min(1, u));
      const dir = this.curve.getTangentAt(Math.min(1, u)).normalize();
      samples[i] = { i, s, pos, dir, width: 12, bank: 0, curvature: 0, surface: 'ground', district: 'city', name: '' };
    }

    // Attributes blend between the waypoints that bracket each sample.
    for (const sample of samples) this._applyWaypointAttributes(sample);

    // Signed curvature from the change in heading over two steps.
    for (let i = 0; i < total; i++) {
      const a = samples[this._wrap(i - 1, total)].dir;
      const b = samples[this._wrap(i + 1, total)].dir;
      const cross = a.x * b.z - a.z * b.x;      // -y component of a x b
      const dot = Math.min(1, Math.max(-1, a.x * b.x + a.z * b.z));
      const angle = Math.atan2(-cross, dot);    // + turning left
      samples[i].curvature = angle / (2 * this.spacing);
    }

    // Banking follows curvature, smoothed so the roll does not snap on and off
    // at the corner entry. Explicit `bank` on a waypoint wins.
    const raw = samples.map((sm) => THREE.MathUtils.clamp(-sm.curvature * bankGain, -maxBank, maxBank));
    const window = Math.max(1, Math.round(14 / this.spacing));
    for (let i = 0; i < total; i++) {
      let sum = 0;
      let weight = 0;
      for (let k = -window; k <= window; k++) {
        const w = 1 - Math.abs(k) / (window + 1);
        sum += raw[this._wrap(i + k, total)] * w;
        weight += w;
      }
      samples[i].bank = samples[i].bankOverride ?? sum / weight;
    }

    // Frames, rolled by the banking.
    const q = new THREE.Quaternion();
    for (const sm of samples) {
      const right = new THREE.Vector3().crossVectors(sm.dir, UP).normalize();
      const up = new THREE.Vector3().crossVectors(right, sm.dir).normalize();
      if (sm.bank) {
        q.setFromAxisAngle(sm.dir, sm.bank);
        right.applyQuaternion(q).normalize();
        up.applyQuaternion(q).normalize();
      }
      sm.right = right;
      sm.up = up;
    }

    return samples;
  }

  _wrap(i, total) {
    if (this.closed) return ((i % total) + total) % total;
    return Math.min(total - 1, Math.max(0, i));
  }

  /** Blend width / surface / district from the bracketing waypoints. */
  _applyWaypointAttributes(sample) {
    const ws = this.waypointS;
    const n = ws.length;
    let a = 0;
    for (let i = 0; i < n; i++) if (ws[i] <= sample.s) a = i;
    const b = this.closed ? (a + 1) % n : Math.min(n - 1, a + 1);
    const sA = ws[a];
    const sB = b === 0 ? this.length : ws[b];
    const t = sB > sA ? (sample.s - sA) / (sB - sA) : 0;

    const A = this.waypoints[a];
    const B = this.waypoints[b];
    sample.width = THREE.MathUtils.lerp(A.width ?? 12, B.width ?? 12, smoothstep(t));
    // Surface and district are step functions: a section runs from its
    // waypoint up to the next one that changes it.
    sample.surface = A.surface ?? 'ground';
    sample.district = A.district ?? 'city';
    sample.name = A.name ?? '';
    sample.waypoint = a;
    if (A.bank !== undefined || B.bank !== undefined) {
      sample.bankOverride = THREE.MathUtils.lerp(A.bank ?? 0, B.bank ?? 0, smoothstep(t));
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Lookups                                                                 */
  /* ---------------------------------------------------------------------- */

  /** Wrap an arc length into [0, length). */
  wrapS(s) {
    if (!this.closed) return THREE.MathUtils.clamp(s, 0, this.length);
    return ((s % this.length) + this.length) % this.length;
  }

  /** The sample table index for an arc length, plus the fraction past it. */
  indexAt(s) {
    const x = this.wrapS(s) / this.spacing;
    const i = Math.floor(x);
    return { i: this._wrap(i, this.samples.length), t: x - i };
  }

  /**
   * Interpolated frame at an arc length.
   * @returns {{pos:THREE.Vector3, dir:THREE.Vector3, right:THREE.Vector3, up:THREE.Vector3, width:number, curvature:number, bank:number, surface:string, district:string, s:number}}
   */
  frameAt(s) {
    const { i, t } = this.indexAt(s);
    const a = this.samples[i];
    const b = this.samples[this._wrap(i + 1, this.samples.length)];
    return {
      s: this.wrapS(s),
      pos: a.pos.clone().lerp(b.pos, t),
      dir: a.dir.clone().lerp(b.dir, t).normalize(),
      right: a.right.clone().lerp(b.right, t).normalize(),
      up: a.up.clone().lerp(b.up, t).normalize(),
      width: THREE.MathUtils.lerp(a.width, b.width, t),
      bank: THREE.MathUtils.lerp(a.bank, b.bank, t),
      curvature: THREE.MathUtils.lerp(a.curvature, b.curvature, t),
      surface: t < 0.5 ? a.surface : b.surface,
      district: t < 0.5 ? a.district : b.district,
      name: t < 0.5 ? a.name : b.name,
    };
  }

  /**
   * A world position on (or beside) the road.
   * @param {number} s        arc length
   * @param {number} lateral  metres right of the centreline
   * @param {number} [height] metres above the surface, along the banked up axis
   */
  pointAt(s, lateral = 0, height = 0) {
    const f = this.frameAt(s);
    return f.pos.clone().addScaledVector(f.right, lateral).addScaledVector(f.up, height);
  }

  /** Heading in radians about +Y, matching the car's `rotation.y` convention. */
  headingAt(s) {
    const d = this.frameAt(s).dir;
    return Math.atan2(-d.x, -d.z);
  }

  /* ---------------------------------------------------------------------- */

  _buildGrid() {
    const cell = 40;
    const grid = new Map();
    const key = (cx, cz) => `${cx},${cz}`;
    for (const sm of this.samples) {
      const cx = Math.floor(sm.pos.x / cell);
      const cz = Math.floor(sm.pos.z / cell);
      // Register in the cell and its neighbours so a single cell lookup is enough.
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const k = key(cx + dx, cz + dz);
          let list = grid.get(k);
          if (!list) grid.set(k, (list = []));
          list.push(sm.i);
        }
      }
    }
    return { cell, grid, key };
  }

  /**
   * Closest point on the centreline to a world XZ position.
   *
   * This is the query the vehicle uses: it gives the road height under the car,
   * how far off-centre it is and which way the road is pointing there.
   *
   * @returns {{s:number, lateral:number, distance:number, height:number, sample:object, onRoad:boolean, dir:THREE.Vector3, up:THREE.Vector3}|null}
   */
  nearest(x, z) {
    const { cell, grid, key } = this._grid;
    const list = grid.get(key(Math.floor(x / cell), Math.floor(z / cell)));
    const candidates = list ?? this.samples.map((sm) => sm.i);

    let best = -1;
    let bestD = Infinity;
    for (const i of candidates) {
      const p = this.samples[i].pos;
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0) return null;

    // Refine against the two neighbouring segments so s and the lateral offset
    // are continuous rather than quantised to the sample spacing.
    const total = this.samples.length;
    let result = null;
    for (const k of [-1, 0]) {
      const a = this.samples[this._wrap(best + k, total)];
      const b = this.samples[this._wrap(best + k + 1, total)];
      const ax = b.pos.x - a.pos.x;
      const az = b.pos.z - a.pos.z;
      const len2 = ax * ax + az * az;
      if (len2 < 1e-9) continue;
      const t = THREE.MathUtils.clamp(((x - a.pos.x) * ax + (z - a.pos.z) * az) / len2, 0, 1);
      const px = a.pos.x + ax * t;
      const pz = a.pos.z + az * t;
      const d = Math.hypot(x - px, z - pz);
      if (result && d >= result.distance) continue;
      // Right-hand normal of the segment in plan view: |lateral| === d, and the
      // sign says which side of the road the point is on.
      const inv = 1 / Math.sqrt(len2);
      const lateral = (x - px) * (-az * inv) + (z - pz) * (ax * inv);
      const bank = THREE.MathUtils.lerp(a.bank, b.bank, t);
      result = {
        s: a.s + (b.s - a.s + (b.s < a.s ? this.length : 0)) * t,
        distance: d,
        lateral,
        height: THREE.MathUtils.lerp(a.pos.y, b.pos.y, t) - Math.sin(bank) * lateral,
        width: THREE.MathUtils.lerp(a.width, b.width, t),
        sample: t < 0.5 ? a : b,
        dir: a.dir.clone().lerp(b.dir, t).normalize(),
        up: a.up.clone().lerp(b.up, t).normalize(),
      };
    }
    if (!result) return null;
    result.s = this.wrapS(result.s);
    result.onRoad = Math.abs(result.lateral) <= result.width / 2;
    return result;
  }

  /* ---------------------------------------------------------------------- */

  /**
   * Walk the path at a fixed spacing, handing back a frame each time.
   * Used to lay out lamp posts, barrier posts, signs and trees.
   *
   * @param {number} spacing metres
   * @param {(f:object, index:number)=>void} visit
   * @param {object} [opts] {from, to, offset}
   */
  walk(spacing, visit, opts = {}) {
    const from = opts.from ?? 0;
    const to = opts.to ?? this.length;
    let index = 0;
    for (let s = from; s < to; s += spacing) visit(this.frameAt(s), index++);
  }

  /** Sample indices covering [from, to] in arc length, inclusive of both ends. */
  span(from, to) {
    const out = [];
    const total = this.samples.length;
    const start = Math.floor(this.wrapS(from) / this.spacing);
    const stepsAhead = Math.max(1, Math.round((to - from) / this.spacing));
    for (let k = 0; k <= stepsAhead; k++) out.push(this.samples[this._wrap(start + k, total)]);
    return out;
  }

  /** Axis-aligned bounds of the centreline, padded. */
  bounds(pad = 0) {
    const box = new THREE.Box3();
    for (const sm of this.samples) box.expandByPoint(sm.pos);
    box.expandByScalar(pad);
    return box;
  }
}
