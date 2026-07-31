/**
 * DOCK STREET CIRCUIT - Bayview Harbour.
 *
 * The whole location is described here as data: the centreline waypoints, the
 * shape of the land under it, where the water is, and what kind of city sits
 * beside each stretch of road. Geometry modules read this and never invent
 * their own coordinates, so moving a corner moves the buildings, the barriers
 * and the terrain with it.
 *
 * A lap runs anticlockwise (in plan view) from the start line in the downtown
 * canyon:
 *
 *   1  Start / Finish straight   downtown canyon, 400 m flat out
 *   2  Turn 1, Gasworks          hard right off the straight
 *   3  Market Straight + Esses   neon low-rise, quick left-right-left
 *   4  Bridge Approach           climbing right-hander
 *   5  Harbour Bridge            400 m span, 22 m up, long left
 *   6  Dockyard Drop             fast downhill right into the docks
 *   7  Quayside Straight         flat out along the water
 *   8  Container Chicane         late-braking flick between stacks
 *   9  Crane Corner              35 m radius right, slowest on the lap
 *  10  Foundry Straight          industrial back straight
 *  11  Cutter Hill Tunnel        blind entry, dips below grade
 *  12  Rail Yard Flyover         climb, crest, plunge
 *  13  Plaza Sweep + Last Corner long left onto the pit straight
 *
 * All units are metres. Y is up. The city sits around y = 0 and the harbour
 * water surface is at WATER_LEVEL.
 */

export const COURSE = {
  name: 'Dock Street Circuit',
  location: 'Bayview Harbour',
  direction: 'anticlockwise',
};

/** Sea and harbour surface height. Everything else is referenced to it. */
export const WATER_LEVEL = -1.8;

/* -------------------------------------------------------------------------- */
/* Centreline                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Waypoints of the racing surface.
 *
 * width   - full road width in metres (both directions of travel)
 * surface - 'ground' rides on the terrain, 'bridge' and 'elevated' are carried
 *           on piers, 'tunnel' is bored through a hill. Anything that is not
 *           'ground' tells the terrain to ignore the road and the barrier pass
 *           to switch to bridge parapets.
 * district- drives the scenery either side
 * name    - marks the start of a named sector, shown in the HUD
 */
export const WAYPOINTS = [
  // --- Downtown pit straight, running north (-Z) --------------------------
  { x: -64, y: 0.0, z: 384, width: 16, district: 'downtown', name: 'Start / Finish' },
  { x: -62, y: 0.0, z: 260, width: 16, district: 'downtown' },
  { x: -60, y: 0.2, z: 140, width: 16, district: 'downtown' },
  { x: -58, y: 0.4, z: 30, width: 15, district: 'downtown' },

  // --- Turn 1: hard right off the end of the straight ---------------------
  { x: -54, y: 0.8, z: -80, width: 14, district: 'downtown', name: 'Turn 1 - Gasworks' },
  { x: -34, y: 1.3, z: -142, width: 13, district: 'downtown' },
  { x: 22, y: 1.9, z: -166, width: 13.5, district: 'market' },

  // --- Market street: neon low-rise, then the esses -----------------------
  { x: 118, y: 2.4, z: -186, width: 14, district: 'market', name: 'Market Straight' },
  { x: 215, y: 3.2, z: -206, width: 13, district: 'market', name: 'Market Esses' },
  { x: 300, y: 4.4, z: -258, width: 12.5, district: 'market' },
  { x: 392, y: 6.4, z: -252, width: 13, district: 'market' },

  // --- Climb to the bridge ------------------------------------------------
  { x: 478, y: 9.5, z: -288, width: 14, district: 'waterfront', name: 'Bridge Approach' },
  { x: 566, y: 14.5, z: -326, width: 15, surface: 'elevated', district: 'bridge' },
  { x: 660, y: 19.0, z: -350, width: 14.5, surface: 'bridge', district: 'bridge', name: 'Harbour Bridge' },
  { x: 770, y: 21.5, z: -358, width: 14.5, surface: 'bridge', district: 'bridge' },
  { x: 880, y: 19.5, z: -344, width: 14.5, surface: 'bridge', district: 'bridge' },
  { x: 966, y: 14.0, z: -308, width: 15, surface: 'elevated', district: 'bridge' },

  // --- Down the ramp and right onto the quay ------------------------------
  { x: 1040, y: 7.5, z: -238, width: 14, district: 'docks', name: 'Dockyard Drop' },
  { x: 1092, y: 3.6, z: -140, width: 14, district: 'docks' },
  { x: 1112, y: 2.6, z: -20, width: 15, district: 'docks', name: 'Quayside Straight' },
  { x: 1104, y: 2.2, z: 120, width: 15, district: 'docks' },

  // --- Chicane between the container stacks -------------------------------
  { x: 1046, y: 2.2, z: 214, width: 12, district: 'docks', name: 'Container Chicane' },
  { x: 1092, y: 2.2, z: 300, width: 12, district: 'docks' },

  // --- Crane Corner: the slowest point on the lap -------------------------
  { x: 1094, y: 2.2, z: 374, width: 13, district: 'docks', name: 'Crane Corner' },
  { x: 1070, y: 2.2, z: 420, width: 12, district: 'docks' },
  { x: 1016, y: 2.4, z: 438, width: 13, district: 'industry' },

  // --- Industrial back straight, running west -----------------------------
  { x: 906, y: 2.0, z: 440, width: 14, district: 'industry', name: 'Foundry Straight' },
  { x: 786, y: 0.5, z: 428, width: 14, district: 'industry' },
  { x: 668, y: -2.0, z: 448, width: 13.5, district: 'industry' },

  // --- Cutter Hill tunnel -------------------------------------------------
  { x: 578, y: -4.5, z: 466, width: 12, surface: 'tunnel', district: 'tunnel', name: 'Cutter Hill Tunnel' },
  { x: 470, y: -4.8, z: 462, width: 12, surface: 'tunnel', district: 'tunnel' },
  { x: 392, y: -2.5, z: 444, width: 13, district: 'industry' },

  // --- Flyover across the rail cutting ------------------------------------
  { x: 306, y: 3.0, z: 442, width: 13, surface: 'elevated', district: 'railyard', name: 'Rail Yard Flyover' },
  { x: 224, y: 9.5, z: 456, width: 13, surface: 'bridge', district: 'railyard' },
  { x: 146, y: 6.5, z: 470, width: 13.5, surface: 'elevated', district: 'railyard' },

  // --- Plaza sweep back onto the pit straight -----------------------------
  { x: 62, y: 1.6, z: 462, width: 15, district: 'plaza', name: 'Plaza Sweep' },
  { x: -20, y: 0.6, z: 452, width: 15, district: 'plaza' },
  { x: -70, y: 0.2, z: 424, width: 15, district: 'downtown', name: 'Last Corner' },
];

/* -------------------------------------------------------------------------- */
/* Land                                                                        */
/* -------------------------------------------------------------------------- */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t) => { const x = clamp01(t); return x * x * (3 - 2 * x); };

/** Signed distance to a rounded rectangle in plan view. Negative inside. */
export function roundedRect(x, z, cx, cz, hx, hz, r) {
  const dx = Math.abs(x - cx) - (hx - r);
  const dz = Math.abs(z - cz) - (hz - r);
  const ox = Math.max(dx, 0);
  const oz = Math.max(dz, 0);
  return Math.hypot(ox, oz) + Math.min(Math.max(dx, dz), 0) - r;
}

/** Smooth dome, used for the hills and the far ridges. */
function dome(x, z, cx, cz, rx, rz, height) {
  const d = Math.hypot((x - cx) / rx, (z - cz) / rz);
  if (d >= 1) return 0;
  return height * smooth(1 - d) ** 1.15;
}

/**
 * The harbour: a shipping channel running in from the open sea to the north,
 * opening into a basin in the middle of the circuit. The bridge crosses it.
 */
export const HARBOUR = { cx: 760, cz: -480, hx: 122, hz: 640, r: 95 };

/** 0 outside the water, 1 in the deep channel. */
export function waterMask(x, z) {
  const d = roundedRect(x, z, HARBOUR.cx, HARBOUR.cz, HARBOUR.hx, HARBOUR.hz, HARBOUR.r);
  return 1 - smooth((d + 6) / 26);
}

/**
 * The rail cutting the flyover jumps: a trench running north-south through the
 * old goods yard, floor well below street level.
 */
export const RAIL_CUT = { cx: 222, cz: 620, hx: 46, hz: 380, r: 24, floor: -8.5 };

function railCutMask(x, z) {
  const d = roundedRect(x, z, RAIL_CUT.cx, RAIL_CUT.cz, RAIL_CUT.hx, RAIL_CUT.hz, RAIL_CUT.r);
  return 1 - smooth((d + 2) / 22);
}

/** The hill the tunnel is bored through. */
export const CUTTER_HILL = { cx: 524, cz: 500, rx: 122, rz: 172, height: 30 };

/**
 * Terrain height before the road corridor is blended in.
 * @returns {number} metres
 */
export function baseTerrainHeight(x, z) {
  // Broad, lazy roll so the ground is never a dead flat plane.
  let h = 1.4
    + Math.sin(x * 0.00155 + 0.6) * 1.7
    + Math.cos(z * 0.00201 - 0.3) * 1.5
    + Math.sin((x + z) * 0.0009) * 1.1;

  // Cutter Hill, with the tunnel through its northern flank.
  h += dome(x, z, CUTTER_HILL.cx, CUTTER_HILL.cz, CUTTER_HILL.rx, CUTTER_HILL.rz, CUTTER_HILL.height);
  // Ridges closing off the horizon behind the industrial park and the market.
  h += dome(x, z, 200, 900, 620, 260, 34);
  h += dome(x, z, 1500, 250, 420, 520, 40);
  h += dome(x, z, -420, -60, 380, 460, 26);
  h += dome(x, z, 250, -620, 520, 240, 20);

  // The goods-yard trench.
  const rail = railCutMask(x, z);
  if (rail > 0) h = h * (1 - rail) + RAIL_CUT.floor * rail;

  // Harbour bed.
  const water = waterMask(x, z);
  if (water > 0) h = h * (1 - water) + (WATER_LEVEL - 11) * water;

  return h;
}

/* -------------------------------------------------------------------------- */
/* Districts                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * What sits beside each stretch of road.
 *
 * setback  - metres from the kerb to the building line
 * depth    - how far back the block extends
 * height   - [min, max] storeys-worth of metres
 * spacing  - metres of road per block
 * kerb     - 'pavement' raised footway, 'kerb' low concrete edge, 'none'
 * barrier  - 'wall' concrete, 'rail' armco, 'fence' chain-link, 'parapet' bridge
 */
export const DISTRICTS = {
  downtown: {
    label: 'Downtown',
    setback: 15, depth: 46, height: [28, 92], spacing: 44, width: [22, 46],
    kerb: 'pavement', barrier: 'wall', lamps: 34, lampStyle: 'street',
    facades: [0, 2, 4], neon: 0.25, billboards: 0.14, trees: 0.18,
  },
  market: {
    label: 'Market Street',
    setback: 12, depth: 30, height: [9, 22], spacing: 26, width: [14, 30],
    kerb: 'pavement', barrier: 'wall', lamps: 30, lampStyle: 'street',
    facades: [1, 5, 3], neon: 0.85, billboards: 0.3, trees: 0.1,
  },
  waterfront: {
    label: 'Waterfront',
    setback: 20, depth: 34, height: [8, 20], spacing: 40, width: [16, 34],
    kerb: 'kerb', barrier: 'rail', lamps: 38, lampStyle: 'street',
    facades: [3, 1], neon: 0.3, billboards: 0.35, trees: 0.4,
  },
  bridge: {
    label: 'Harbour Bridge',
    setback: 0, depth: 0, height: [0, 0], spacing: 0, width: [0, 0],
    kerb: 'none', barrier: 'parapet', lamps: 30, lampStyle: 'bridge',
    facades: [], neon: 0, billboards: 0, trees: 0,
  },
  docks: {
    label: 'Docks',
    setback: 22, depth: 60, height: [10, 26], spacing: 62, width: [34, 74],
    kerb: 'kerb', barrier: 'fence', lamps: 44, lampStyle: 'flood',
    facades: [], warehouse: true, neon: 0.08, billboards: 0.12, trees: 0,
  },
  industry: {
    label: 'Industrial Park',
    setback: 24, depth: 54, height: [12, 30], spacing: 58, width: [30, 66],
    kerb: 'kerb', barrier: 'rail', lamps: 46, lampStyle: 'flood',
    facades: [], warehouse: true, neon: 0.06, billboards: 0.2, trees: 0.15,
  },
  tunnel: {
    label: 'Cutter Hill',
    setback: 0, depth: 0, height: [0, 0], spacing: 0, width: [0, 0],
    kerb: 'none', barrier: 'wall', lamps: 0, lampStyle: 'tunnel',
    facades: [], neon: 0, billboards: 0, trees: 0,
  },
  railyard: {
    label: 'Rail Yard',
    setback: 26, depth: 40, height: [8, 18], spacing: 70, width: [24, 48],
    kerb: 'none', barrier: 'parapet', lamps: 40, lampStyle: 'street',
    facades: [], warehouse: true, neon: 0.05, billboards: 0.25, trees: 0.2,
  },
  plaza: {
    label: 'Harbour Plaza',
    setback: 18, depth: 32, height: [10, 26], spacing: 34, width: [18, 38],
    kerb: 'pavement', barrier: 'wall', lamps: 28, lampStyle: 'street',
    facades: [5, 1, 3], neon: 0.5, billboards: 0.2, trees: 0.6,
  },
};

/**
 * Landmarks that are placed by hand rather than scattered: the big silhouette
 * pieces that make a lap read as a route rather than a loop.
 */
export const LANDMARKS = {
  /** Gantry cranes along the quay, straddling the container yard. */
  cranes: [
    { x: 995, z: -60, rot: 0.06, height: 46 },
    { x: 990, z: 96, rot: -0.02, height: 42 },
    { x: 985, z: 250, rot: 0.1, height: 50 },
  ],
  /** Cooling towers and stacks in the industrial park. */
  stacks: [
    { x: 830, z: 560, r: 11, height: 62 },
    { x: 884, z: 596, r: 8, height: 48 },
    { x: 706, z: 590, r: 13, height: 40, cooling: true },
  ],
  /** Gasworks holders behind Turn 1 - the braking-point marker. */
  gasholders: [
    { x: -150, z: -150, r: 26, height: 30 },
    { x: -208, z: -74, r: 21, height: 24 },
  ],
  /** Ships moored in the basin. */
  ships: [
    { x: 700, z: 60, rot: 1.62, length: 132, beam: 21 },
    { x: 838, z: -140, rot: 1.48, length: 96, beam: 17 },
  ],
  /** Silos beside the foundry straight. */
  silos: [
    { x: 760, z: 540, r: 7, height: 34, count: 4, spacing: 15.5, rot: 0.1 },
  ],
};

/** Blocks of distant, non-drivable skyline that close the horizon off. */
export const SKYLINE = [
  { cx: -300, cz: 240, rx: 260, rz: 300, count: 42, height: [40, 130] },
  { cx: 260, cz: -560, rx: 420, rz: 160, count: 30, height: [24, 80] },
  { cx: 1420, cz: -140, rx: 260, rz: 400, count: 26, height: [30, 90] },
];
