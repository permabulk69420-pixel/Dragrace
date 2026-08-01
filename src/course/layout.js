/**
 * Bayfront Circuit - the shape of the course.
 *
 * The whole world is generated from one closed spline. Control points carry the
 * position (metres, 1 unit = 1 m), the road width and the name of the district
 * they run through; everything else - camber, kerbs, barriers, street lights,
 * buildings, the ground itself - is derived from the resampled centreline, so
 * moving a corner moves the city with it.
 *
 * Conventions, chosen to match src/physics/vehicle.js so the existing car can
 * be dropped in without translating anything:
 *   - +Y is up, distances are metres.
 *   - A heading of h points along (-sin h, 0, -cos h). h increases to the left.
 *   - Signed lateral offsets are positive to the driver's right.
 *   - `s` is distance travelled along the centreline from the start line, and
 *     wraps at `track.length`.
 */
import * as THREE from 'three';
import { clamp, lerp, smoothstep, angleDelta, wrap, loopDelta } from './util.js';

export const COURSE_NAME = 'Bayfront Circuit';

/** Distance between resampled centreline points, in metres. */
const SPACING = 2;

/** How much camber the road picks up in a corner, in radians per 1/m. */
const BANK_GAIN = 26;
const MAX_BANK = THREE.MathUtils.degToRad(4.5);

/**
 * District settings. `groundY` only matters where the road is elevated: the
 * viaduct climbs but the city underneath stays where it is.
 */
export const DISTRICTS = {
  downtown:   { label: 'Downtown Canyon',   groundY: 0,    elevated: false, verge: 'pavement' },
  grandstand: { label: 'Civic Plaza',       groundY: 0,    elevated: false, verge: 'pavement' },
  ramp:       { label: 'Viaduct Approach',  groundY: 0,    elevated: false, verge: 'ground' },
  flyover:    { label: 'Harbour Viaduct',   groundY: 0.5,  elevated: true,  verge: 'none' },
  descent:    { label: 'Cliff Descent',     groundY: null, elevated: false, verge: 'ground' },
  docks:      { label: 'Container Docks',   groundY: -1.5, elevated: false, verge: 'ground' },
  hairpin:    { label: 'Quayside Hairpin',  groundY: -2,   elevated: false, verge: 'ground' },
  industrial: { label: 'Foundry Row',       groundY: null, elevated: false, verge: 'ground' },
  tunnel:     { label: 'Metro Tunnel',      groundY: null, elevated: false, verge: 'pavement' },
  park:       { label: 'Riverside Park',    groundY: null, elevated: false, verge: 'ground' },
  chicane:    { label: 'Market Chicane',    groundY: null, elevated: false, verge: 'pavement' },
};

/**
 * The lap, in order of travel. Roughly 3.4 km with 18 m of elevation change:
 * a long downtown straight, a climbing right onto the harbour viaduct, a fast
 * descent to the docks, a second-gear hairpin on the quay, a run through the
 * foundries and the metro tunnel, then the park esses and a tight left-right
 * back onto the straight.
 */
export const CONTROL = [
  { x: -500, z:  292, y:  0.0, w: 18, district: 'downtown'   },  // start / finish
  { x: -502, z:  150, y:  0.0, w: 18, district: 'downtown'   },
  { x: -494, z:   10, y:  0.0, w: 17, district: 'downtown'   },
  { x: -478, z: -125, y:  0.8, w: 16, district: 'downtown'   },
  { x: -422, z: -238, y:  2.6, w: 16, district: 'grandstand' },  // T1, long climbing right
  { x: -368, z: -336, y:  5.6, w: 16, district: 'grandstand' },
  { x: -280, z: -402, y:  9.2, w: 15, district: 'ramp'       },  // up onto the deck
  { x: -156, z: -434, y: 13.6, w: 15, district: 'ramp'       },
  { x:  -16, z: -426, y: 17.4, w: 15, district: 'flyover'    },
  { x:  120, z: -410, y: 19.0, w: 15, district: 'flyover'    },  // crest of the viaduct
  { x:  256, z: -384, y: 17.4, w: 15, district: 'flyover'    },
  { x:  374, z: -326, y: 13.6, w: 15, district: 'descent'    },  // fast right, downhill
  { x:  456, z: -236, y:  9.0, w: 15, district: 'descent'    },
  { x:  500, z: -120, y:  4.4, w: 16, district: 'descent'    },
  { x:  512, z:    0, y:  1.2, w: 16, district: 'docks'      },  // quay straight
  { x:  502, z:  124, y: -0.6, w: 16, district: 'docks'      },
  { x:  474, z:  238, y: -1.8, w: 15, district: 'docks'      },  // braking zone
  { x:  424, z:  318, y: -2.2, w: 15, district: 'hairpin'    },
  { x:  344, z:  360, y: -2.2, w: 14, district: 'hairpin'    },  // quayside apex
  { x:  246, z:  350, y: -1.8, w: 14, district: 'hairpin'    },
  { x:  118, z:  340, y: -0.4, w: 15, district: 'industrial' },
  { x:  -12, z:  346, y:  0.8, w: 15, district: 'industrial' },
  { x: -132, z:  354, y:  1.8, w: 13, district: 'tunnel'     },  // under the metro depot
  { x: -250, z:  356, y:  2.2, w: 13, district: 'tunnel'     },
  { x: -318, z:  346, y:  1.8, w: 14, district: 'park'       },  // riverside esses
  { x: -376, z:  376, y:  1.2, w: 14, district: 'park'       },
  { x: -440, z:  392, y:  0.6, w: 15, district: 'chicane'    },  // market chicane
  { x: -502, z:  368, y:  0.3, w: 16, district: 'chicane'    },  // last corner onto the straight
];

/** Sector splits, as a fraction of the lap. Three sectors, as is traditional. */
const SECTOR_FRACTIONS = [0, 0.34, 0.68];

/* -------------------------------------------------------------------------- */
/* Centreline                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Resample the control spline into evenly spaced frames.
 * @returns {Array<object>} samples, one every SPACING metres, looping.
 */
function buildSamples(controls) {
  const curve = new THREE.CatmullRomCurve3(
    controls.map((c) => new THREE.Vector3(c.x, c.y, c.z)),
    true,
    'centripetal',
    0.5
  );

  // Walk the curve finely, then resample by arc length so every frame is the
  // same distance apart no matter how the control points are bunched up.
  const FINE = controls.length * 240;
  const fine = [];
  let total = 0;
  let previous = curve.getPoint(0);
  fine.push({ u: 0, s: 0, p: previous });
  for (let i = 1; i <= FINE; i++) {
    const u = i / FINE;
    const p = curve.getPoint(u);
    total += p.distanceTo(previous);
    fine.push({ u, s: total, p });
    previous = p;
  }

  const count = Math.max(16, Math.round(total / SPACING));
  const step = total / count;                      // exact, so the loop closes
  const samples = [];
  let cursor = 1;
  for (let i = 0; i < count; i++) {
    const s = i * step;
    while (cursor < fine.length - 1 && fine[cursor].s < s) cursor++;
    const a = fine[cursor - 1];
    const b = fine[cursor];
    const t = b.s === a.s ? 0 : (s - a.s) / (b.s - a.s);
    const u = lerp(a.u, b.u, t);
    samples.push({
      index: i,
      s,
      u,
      position: a.p.clone().lerp(b.p, t),
    });
  }

  return { samples, length: count * step, curve };
}

/** Interpolate a per-control-point attribute at spline parameter u. */
function controlValue(controls, u, key) {
  const n = controls.length;
  const f = wrap(u * n, n);
  const i = Math.floor(f);
  const t = f - i;
  const a = controls[i % n][key];
  const b = controls[(i + 1) % n][key];
  return typeof a === 'number' ? lerp(a, b, t) : t < 0.5 ? a : b;
}

/** Box blur over a looping array of numbers. */
function smoothLoop(values, radius) {
  const n = values.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += values[wrap(i + k, n)];
    out[i] = sum / (radius * 2 + 1);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Track                                                                       */
/* -------------------------------------------------------------------------- */

const _v = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/**
 * The queryable course. Built once, then read by the scenery builders and, at
 * runtime, by whatever is driving on it.
 */
export class Track {
  constructor(controls = CONTROL) {
    const { samples, length, curve } = buildSamples(controls);
    this.controls = controls;
    this.curve = curve;
    this.samples = samples;
    this.length = length;
    this.spacing = length / samples.length;

    const n = samples.length;

    // --- tangents, headings, curvature -------------------------------------
    for (let i = 0; i < n; i++) {
      const a = samples[wrap(i - 1, n)].position;
      const b = samples[wrap(i + 1, n)].position;
      const t = new THREE.Vector3().subVectors(b, a).normalize();
      samples[i].tangent = t;
      samples[i].heading = Math.atan2(-t.x, -t.z);
      samples[i].gradient = t.y;                    // rise per metre travelled
    }
    const curvature = samples.map((sample, i) =>
      angleDelta(samples[wrap(i - 1, n)].heading, samples[wrap(i + 1, n)].heading) / (2 * this.spacing));
    const smoothCurvature = smoothLoop(curvature, 3);

    // --- width, district, camber -------------------------------------------
    const rawBank = smoothCurvature.map((k) => clamp(-k * BANK_GAIN, -MAX_BANK, MAX_BANK));
    const bank = smoothLoop(rawBank, 8);
    const widths = smoothLoop(samples.map((sample) => controlValue(controls, sample.u, 'w')), 6);

    for (let i = 0; i < n; i++) {
      const sample = samples[i];
      sample.curvature = smoothCurvature[i];
      sample.radius = Math.abs(sample.curvature) > 1e-5 ? 1 / Math.abs(sample.curvature) : Infinity;
      sample.bank = bank[i];
      sample.width = widths[i];
      sample.halfWidth = widths[i] / 2;
      sample.district = controlValue(controls, sample.u, 'district');
      sample.settings = DISTRICTS[sample.district] ?? DISTRICTS.downtown;

      // Banked frame: rotating `up` about the tangent lifts the outside edge of
      // the corner, because a negative bank angle raises the right-hand side.
      const up = _up.clone().applyAxisAngle(sample.tangent, sample.bank);
      sample.up = up;
      sample.right = new THREE.Vector3().crossVectors(sample.tangent, up).normalize();
    }

    // --- ground level under and around the road ----------------------------
    // Everywhere but the viaduct the terrain follows the road; on the viaduct
    // it stays down in the city. Smoothing the transition gives an embankment
    // that ramps up to the deck instead of a cliff.
    const groundRaw = samples.map((sample) => {
      const g = sample.settings.groundY;
      return sample.settings.elevated ? g : (g ?? sample.position.y) - 0.22;
    });
    const groundY = smoothLoop(groundRaw, 12);
    for (let i = 0; i < n; i++) {
      samples[i].groundY = Math.min(groundY[i], samples[i].position.y - 0.12);
      samples[i].elevated = samples[i].settings.elevated || samples[i].position.y - samples[i].groundY > 3.2;
    }

    // --- lookup grid --------------------------------------------------------
    this._cell = 20;
    this._grid = new Map();
    for (const sample of samples) {
      const key = this._key(sample.position.x, sample.position.z);
      let list = this._grid.get(key);
      if (!list) this._grid.set(key, (list = []));
      list.push(sample.index);
    }

    // --- landmarks ----------------------------------------------------------
    this.sectors = SECTOR_FRACTIONS.map((f) => f * this.length);
    this.startS = 0;
    const start = this.frameAt(0);
    this.startPose = {
      position: start.position.clone(),
      heading: start.heading,
      district: start.district,
    };
  }

  _key(x, z) {
    return `${Math.floor(x / this._cell)},${Math.floor(z / this._cell)}`;
  }

  /* -- sampling ----------------------------------------------------------- */

  /** Sample index nearest a world position, robust at any distance. */
  nearestIndex(x, z) {
    const n = this.samples.length;
    const cx = Math.floor(x / this._cell);
    const cz = Math.floor(z / this._cell);

    let best = -1;
    let bestD = Infinity;
    const consider = (i) => {
      const p = this.samples[i].position;
      const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
      if (d < bestD) { bestD = d; best = i; }
    };

    // Near the road the grid answers in a handful of cells.
    for (let ring = 0; ring <= 2 && best < 0; ring++) {
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dz = -ring; dz <= ring; dz++) {
          if (ring > 0 && Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const list = this._grid.get(`${cx + dx},${cz + dz}`);
          if (list) for (const i of list) consider(i);
        }
      }
    }
    if (best >= 0) {
      // One more ring out, in case the true nearest sits just past the border.
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          const list = this._grid.get(`${cx + dx},${cz + dz}`);
          if (list) for (const i of list) consider(i);
        }
      }
      return best;
    }

    // Far away - a coarse sweep followed by a local refine is plenty fast and
    // never misses, which matters when scattering buildings across the map.
    const stride = 8;
    for (let i = 0; i < n; i += stride) consider(i);
    const around = best;
    for (let k = -stride; k <= stride; k++) consider(wrap(around + k, n));
    return best;
  }

  /**
   * Where a world position sits relative to the road.
   * @returns {{s:number, lateral:number, height:number, heading:number,
   *            halfWidth:number, onRoad:boolean, district:string,
   *            curvature:number, gradient:number, index:number}}
   */
  query(x, z) {
    const n = this.samples.length;
    const i = this.nearestIndex(x, z);
    const here = this.samples[i];

    // Project onto the two segments touching the nearest sample and keep the
    // better fit, so `s` and the lateral offset stay smooth across samples.
    let best = null;
    for (const j of [wrap(i - 1, n), i]) {
      const a = this.samples[j];
      const b = this.samples[wrap(j + 1, n)];
      const ax = a.position.x, az = a.position.z;
      const dx = b.position.x - ax, dz = b.position.z - az;
      const len2 = dx * dx + dz * dz || 1;
      let t = ((x - ax) * dx + (z - az) * dz) / len2;
      t = clamp(t, 0, 1);
      const px = ax + dx * t, pz = az + dz * t;
      const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (!best || d2 < best.d2) best = { a, b, t, d2 };
    }

    const { a, b, t } = best;
    const s = wrap(a.s + t * this.spacing, this.length);
    const heading = a.heading + angleDelta(a.heading, b.heading) * t;
    const halfWidth = lerp(a.halfWidth, b.halfWidth, t);
    const height = lerp(a.position.y, b.position.y, t);
    const rx = lerp(a.right.x, b.right.x, t);
    const rz = lerp(a.right.z, b.right.z, t);
    const px = lerp(a.position.x, b.position.x, t);
    const pz = lerp(a.position.z, b.position.z, t);
    const lateral = (x - px) * rx + (z - pz) * rz;

    return {
      s,
      lateral,
      height: height + lateral * -Math.sin(lerp(a.bank, b.bank, t)),
      heading,
      halfWidth,
      onRoad: Math.abs(lateral) <= halfWidth,
      district: a.district,
      curvature: lerp(a.curvature, b.curvature, t),
      gradient: lerp(a.gradient, b.gradient, t),
      groundY: lerp(a.groundY, b.groundY, t),
      elevated: a.elevated,
      index: a.index,
    };
  }

  /** Interpolated frame at a distance along the lap. */
  frameAt(s) {
    const n = this.samples.length;
    const f = wrap(s, this.length) / this.spacing;
    const i = Math.floor(f) % n;
    const t = f - Math.floor(f);
    const a = this.samples[i];
    const b = this.samples[(i + 1) % n];
    return {
      s: wrap(s, this.length),
      position: a.position.clone().lerp(b.position, t),
      tangent: a.tangent.clone().lerp(b.tangent, t).normalize(),
      right: a.right.clone().lerp(b.right, t).normalize(),
      up: a.up.clone().lerp(b.up, t).normalize(),
      heading: a.heading + angleDelta(a.heading, b.heading) * t,
      width: lerp(a.width, b.width, t),
      halfWidth: lerp(a.halfWidth, b.halfWidth, t),
      curvature: lerp(a.curvature, b.curvature, t),
      gradient: lerp(a.gradient, b.gradient, t),
      bank: lerp(a.bank, b.bank, t),
      groundY: lerp(a.groundY, b.groundY, t),
      elevated: a.elevated,
      district: a.district,
      settings: a.settings,
      index: a.index,
    };
  }

  /**
   * A point on the road surface.
   * @param {number} s distance along the lap
   * @param {number} [lateral] metres right of the centreline
   * @param {number} [lift] metres above the surface
   */
  pointAt(s, lateral = 0, lift = 0) {
    const f = this.frameAt(s);
    return f.position.clone()
      .addScaledVector(f.right, lateral)
      .addScaledVector(f.up, lift);
  }

  /** Ground level at a world position: the road where there is road, terrain elsewhere. */
  groundHeight(x, z) {
    const q = this.query(x, z);
    const outside = Math.abs(q.lateral) - q.halfWidth;
    if (outside <= 0) return q.height;
    // On the viaduct the deck edge is a drop, everywhere else a graded verge.
    const blend = q.elevated ? 2.5 : 42;
    const t = smoothstep(clamp(outside / blend, 0, 1));
    const edge = Math.min(q.height - 0.16, q.groundY + (q.elevated ? 0 : 0.16));
    return lerp(edge, q.groundY, t);
  }

  /**
   * Level of the terrain itself, ignoring any road deck above it. The ground
   * mesh follows this, so it passes cleanly underneath the viaduct instead of
   * being dragged 19 m into the air with it.
   */
  terrainHeight(x, z) {
    const q = this.query(x, z);
    if (q.elevated) return q.groundY;
    const outside = Math.abs(q.lateral) - q.halfWidth;
    const base = Math.min(q.height - 0.35, q.groundY + 0.1);
    if (outside <= 0) return base;
    return lerp(base, q.groundY, smoothstep(clamp(outside / 45, 0, 1)));
  }

  /** Metres from the edge of the tarmac; negative while still on it. */
  distanceToRoad(x, z) {
    const q = this.query(x, z);
    return Math.abs(q.lateral) - q.halfWidth;
  }

  /** Forward unit vector for a heading, matching the vehicle's convention. */
  static forward(heading, out = new THREE.Vector3()) {
    return out.set(-Math.sin(heading), 0, -Math.cos(heading));
  }

  /**
   * Starting grid slots, staggered either side of the centreline like a street
   * race rolling grid. Slot 0 is on the line.
   */
  gridSlots(count = 8, { gap = 8, offset = 3.2 } = {}) {
    const slots = [];
    for (let i = 0; i < count; i++) {
      const s = wrap(this.startS - 6 - i * gap, this.length);
      const f = this.frameAt(s);
      const lateral = i % 2 === 0 ? -offset : offset;
      slots.push({
        position: f.position.clone().addScaledVector(f.right, lateral),
        heading: f.heading,
        s,
        lateral,
      });
    }
    return slots;
  }

  /** Signed progress from one lap position to another, shortest way round. */
  delta(fromS, toS) {
    return loopDelta(fromS, toS, this.length);
  }

  /** Quick facts, used by the layout report and the preview HUD. */
  stats() {
    let minRadius = Infinity;
    let maxGradient = 0;
    let minY = Infinity;
    let maxY = -Infinity;
    let corners = 0;
    let previousSign = 0;
    for (const sample of this.samples) {
      if (sample.radius < minRadius) minRadius = sample.radius;
      maxGradient = Math.max(maxGradient, Math.abs(sample.gradient));
      minY = Math.min(minY, sample.position.y);
      maxY = Math.max(maxY, sample.position.y);
      const sign = Math.abs(sample.curvature) > 1 / 260 ? Math.sign(sample.curvature) : 0;
      if (sign !== 0 && sign !== previousSign) corners++;
      if (sign !== 0) previousSign = sign;
    }
    return {
      name: COURSE_NAME,
      length: this.length,
      samples: this.samples.length,
      minRadius,
      maxGradientPercent: maxGradient * 100,
      elevationRange: maxY - minY,
      corners,
      districts: [...new Set(this.samples.map((s) => s.district))],
    };
  }
}

/**
 * March along the lap handing out placement frames - the workhorse behind every
 * line of lamp posts, barrier runs and roadside props.
 *
 * @param {Track} track
 * @param {object} opts
 * @param {number} [opts.from] start distance (default 0)
 * @param {number} [opts.to] end distance (default one full lap)
 * @param {number} opts.spacing metres between frames
 * @param {(frame:object)=>boolean} [opts.filter] skip frames that return false
 * @param {(frame:object, i:number)=>void} place
 */
export function along(track, opts, place) {
  const { from = 0, to = track.length, spacing = 20, jitter = 0, rng = null, filter = null } = opts;
  const span = to - from;
  const count = Math.max(1, Math.floor(span / spacing));
  let i = 0;
  for (let k = 0; k < count; k++) {
    const offset = rng && jitter ? rng.jitter(jitter) : 0;
    const frame = track.frameAt(from + k * spacing + offset);
    if (filter && !filter(frame)) continue;
    place(frame, i++);
  }
}

/** Every sample whose district matches, as [startS, endS] runs. */
export function districtRuns(track, district) {
  const runs = [];
  let open = null;
  for (const sample of track.samples) {
    const match = sample.district === district;
    if (match && !open) open = { from: sample.s, to: sample.s };
    else if (match && open) open.to = sample.s;
    else if (!match && open) { runs.push(open); open = null; }
  }
  if (open) {
    // A district that wraps past the start line joins up with the first run.
    if (runs.length && runs[0].from === 0) {
      runs[0].from = open.from - track.length;
    } else {
      runs.push(open);
    }
  }
  return runs;
}

export { _v as _scratch };
