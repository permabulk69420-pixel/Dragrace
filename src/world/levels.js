/** Selectable circuit definitions. Shared vehicle and rendering code consume this contract. */
import {
  BARRIER_RANGES,
  courseRoute,
  GUARDRAIL_RANGES,
  TUNNEL_RANGE,
  CourseRoute,
} from './course.js';
import { buildScenery } from './scenery.js';
import { buildViceCoastScenery } from './viceCoastScenery.js';

export const DEFAULT_LEVEL_ID = 'midnight-circuit';

export const VICE_COAST_CONTROL_POINTS = Object.freeze([
  Object.freeze([-260, 0.22, 760]),
  Object.freeze([-260, 0.18, 420]),
  Object.freeze([-260, 0.16, 20]),
  Object.freeze([-260, 0.18, -420]),
  Object.freeze([-248, 0.24, -735]),
  Object.freeze([-150, 0.35, -890]),
  Object.freeze([110, 0.55, -930]),
  Object.freeze([390, 1.10, -825]),
  Object.freeze([565, 3.50, -610]),
  Object.freeze([650, 7.00, -330]),
  Object.freeze([610, 9.00, -60]),
  Object.freeze([735, 5.00, 190]),
  Object.freeze([700, 2.20, 450]),
  Object.freeze([540, 0.65, 690]),
  Object.freeze([285, 0.30, 820]),
  Object.freeze([40, 0.25, 790]),
  Object.freeze([-105, 0.22, 650]),
  Object.freeze([-178, 0.21, 790]),
  Object.freeze([-250, 0.22, 950]),
]);

export const viceCoastRoute = new CourseRoute({
  points: VICE_COAST_CONTROL_POINTS,
  samples: 1120,
});

const fractionsToDistances = (route, fractions) => Object.freeze(
  fractions.map((fraction) => Math.round(route.length * fraction)),
);

const midnight = Object.freeze({
  id: DEFAULT_LEVEL_ID,
  name: 'Midnight Circuit',
  shortName: 'Docklands',
  tagline: 'Docklands · viaduct · harbour tunnel',
  description: 'The original elevated industrial night circuit.',
  worldName: 'MidnightCircuitWorld',
  route: courseRoute,
  buildScenery,
  boundaries: Object.freeze({
    barrierRanges: BARRIER_RANGES,
    guardrailRanges: GUARDRAIL_RANGES,
    tunnelRanges: Object.freeze([TUNNEL_RANGE]),
  }),
  road: Object.freeze({
    elevatedRanges: Object.freeze([[0.235, 0.515], [0.525, 0.610]]),
    sidewalkRanges: Object.freeze([[0.485, 0.705], [0.875, 1.0], [0.0, 0.035]]),
    cornerRanges: Object.freeze([
      [0.070, 0.115], [0.130, 0.166], [0.198, 0.230], [0.274, 0.315],
      [0.372, 0.410], [0.455, 0.492], [0.548, 0.583], [0.622, 0.655],
      [0.804, 0.835], [0.855, 0.882], [0.912, 0.945],
    ]),
    directionArrowDistances: Object.freeze([
      95, 285, 540, 810, 1100, 1390, 1680, 1970, 2260, 2530, 2790,
    ]),
  }),
  environmentTheme: Object.freeze({
    background: 'industrial',
    fog: 0x09131e,
    fogDensity: 0.00078,
    exposure: 1.20,
    moon: 0xa8caff,
    hemisphereSky: 0x779dd3,
    hemisphereGround: 0x2a1d15,
    bounce: 0xff7f42,
    skyline: 0x675cff,
  }),
  features: Object.freeze({}),
});

const viceCoast = Object.freeze({
  id: 'vice-coast',
  name: 'Vice Coast',
  shortName: 'Beachfront',
  tagline: 'Ocean Drive · marina · neon downtown',
  description: 'A longer tropical coastal circuit built around a 1.5 km beachfront straight.',
  worldName: 'ViceCoastWorld',
  route: viceCoastRoute,
  buildScenery: buildViceCoastScenery,
  boundaries: Object.freeze({
    barrierRanges: Object.freeze([[0.280, 0.470], [0.610, 1.000]]),
    guardrailRanges: Object.freeze([[0.000, 0.280], [0.470, 0.610]]),
    tunnelRanges: Object.freeze([]),
  }),
  road: Object.freeze({
    elevatedRanges: Object.freeze([[0.480, 0.620]]),
    sidewalkRanges: Object.freeze([[0.000, 0.330], [0.590, 0.865], [0.900, 1.000]]),
    cornerRanges: Object.freeze([
      [0.270, 0.350], [0.385, 0.455], [0.485, 0.555], [0.585, 0.640],
      [0.660, 0.730], [0.755, 0.825], [0.855, 0.925], [0.940, 0.995],
    ]),
    directionArrowDistances: fractionsToDistances(viceCoastRoute, [
      0.065, 0.145, 0.225, 0.305, 0.385, 0.455, 0.525,
      0.595, 0.665, 0.735, 0.805, 0.875, 0.940,
    ]),
  }),
  environmentTheme: Object.freeze({
    background: 'tropical',
    fog: 0x160d25,
    fogDensity: 0.00062,
    exposure: 1.28,
    moon: 0xc6b7ff,
    hemisphereSky: 0x9c8fe8,
    hemisphereGround: 0x31162a,
    bounce: 0xff5ca8,
    skyline: 0x35d9e6,
  }),
  features: Object.freeze({
    beachfrontStraight: Object.freeze({ start: 0.0, end: 0.280, minimumLengthMetres: 1400 }),
    causeway: Object.freeze({ start: 0.480, end: 0.620 }),
  }),
});

export const LEVELS = Object.freeze([midnight, viceCoast]);
const levelsById = new Map(LEVELS.map((level) => [level.id, level]));

export function getLevelDefinition(id = DEFAULT_LEVEL_ID) {
  return levelsById.get(id) ?? midnight;
}

export function getLevelChoices() {
  return LEVELS.map(({ id, name, shortName, tagline, description, route }) => ({
    id,
    name,
    shortName,
    tagline,
    description,
    lengthKilometres: route.length / 1000,
  }));
}
