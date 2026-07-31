/**
 * Race director: staging beams, the christmas tree sequence, reaction time,
 * incremental splits and the win light.
 *
 * Beam positions follow real practice - pre-stage is about 18 cm ahead of the
 * stage beam, and the clock starts when the front tyre rolls out of the stage
 * beam after the green.
 */
import { SPEC } from '../car/spec.js';

const FT = 0.3048;

export const PHASE = {
  APPROACH: 'approach',
  PRESTAGED: 'prestaged',
  STAGED: 'staged',
  COUNTDOWN: 'countdown',
  RUNNING: 'running',
  FINISHED: 'finished',
  FOUL: 'foul',
};

const SPLITS = [
  { name: '60ft', d: 60 * FT },
  { name: '330ft', d: 330 * FT },
  { name: '1/8', d: SPEC.eighthMile },
  { name: '1000ft', d: 1000 * FT },
  { name: '1/4', d: SPEC.quarterMile },
];

export class Race {
  constructor() {
    this.reset();
  }

  reset() {
    this.phase = PHASE.APPROACH;
    this.timer = 0;
    this.elapsed = 0;
    this.reaction = null;
    this.splits = {};
    this.trapSpeed = null;
    this.stagedFor = 0;
    this.greenAt = null;
    this.lights = { preStage: false, stage: false, amber: [false, false, false], green: false, red: false };
    this.message = 'Roll up to the line';
  }

  /** Front tyre contact patch position along the strip (metres past the line). */
  static nosePosition(vehicle) {
    return -(vehicle.z + SPEC.front.z - SPEC.front.radius * 0.0);
  }

  /**
   * @param {import('../physics/vehicle.js').Vehicle} vehicle
   * @param {number} dt
   */
  update(vehicle, dt) {
    const nose = Race.nosePosition(vehicle);   // >0 once past the start line
    const rolling = Math.abs(vehicle.speed) > 0.35;
    const L = this.lights;

    switch (this.phase) {
      case PHASE.APPROACH:
        L.preStage = nose > -0.85;
        if (L.preStage) {
          this.phase = PHASE.PRESTAGED;
          this.message = 'Pre-staged - creep forward';
        }
        break;

      case PHASE.PRESTAGED:
        L.preStage = nose > -0.85;
        if (!L.preStage) { this.phase = PHASE.APPROACH; this.message = 'Roll up to the line'; break; }
        L.stage = nose > -0.30;
        if (L.stage) {
          this.phase = PHASE.STAGED;
          this.stagedFor = 0;
          this.message = 'Staged - hold it';
        }
        break;

      case PHASE.STAGED:
        if (nose < -0.34) { this.phase = PHASE.PRESTAGED; L.stage = false; this.message = 'Pre-staged - creep forward'; break; }
        this.stagedFor += rolling ? -dt : dt;
        this.stagedFor = Math.max(0, this.stagedFor);
        if (this.stagedFor > 0.9) {
          this.phase = PHASE.COUNTDOWN;
          this.timer = 0;
          this.stageMark = nose;
          this.message = 'Here we go';
        }
        break;

      case PHASE.COUNTDOWN: {
        this.timer += dt;
        // Sportsman tree: three ambers half a second apart, then green.
        const t = this.timer;
        L.amber[0] = t >= 0.6 && t < 1.1;
        L.amber[1] = t >= 1.1 && t < 1.6;
        L.amber[2] = t >= 1.6 && t < 2.1;
        if (t >= 2.1) {
          L.green = true;
          this.greenAt = 0;
          this.phase = PHASE.RUNNING;
          this.elapsed = 0;
          this.message = 'GO';
        }
        // Leaving early is a red light.
        if (nose > this.stageMark + 0.25) {
          this.phase = PHASE.FOUL;
          L.red = true;
          L.amber = [false, false, false];
          this.message = 'Red light - foul start';
        }
        break;
      }

      case PHASE.RUNNING: {
        this.greenAt += dt;
        if (this.reaction === null) {
          if (nose > this.stageMark + 0.25) this.reaction = this.greenAt;
        } else {
          this.elapsed += dt;
          for (const s of SPLITS) {
            if (this.splits[s.name] === undefined && nose >= s.d) {
              this.splits[s.name] = { t: this.elapsed, mph: vehicle.speedMph };
            }
          }
          if (nose >= SPEC.quarterMile) {
            this.trapSpeed = vehicle.speedMph;
            this.phase = PHASE.FINISHED;
            this.message = `${this.elapsed.toFixed(3)} s @ ${this.trapSpeed.toFixed(1)} mph`;
          }
        }
        if (this.greenAt > 12 && this.reaction === null) {
          this.message = 'Go when ready';
        }
        break;
      }

      case PHASE.FINISHED:
      case PHASE.FOUL:
        break;
    }

    if (vehicle.offCourse && this.phase === PHASE.RUNNING) {
      this.phase = PHASE.FOUL;
      this.lights.red = true;
      this.message = 'Off course - run void';
    }
  }

  /** Rows for the dash screen. */
  dashRows() {
    const fmt = (v, d = 3) => (v === null || v === undefined ? '--' : v.toFixed(d));
    if (this.phase === PHASE.FINISHED) {
      return {
        title: 'RUN COMPLETE',
        rows: [
          ['R/T', fmt(this.reaction), '#8affc0'],
          ['ET', fmt(this.elapsed)],
          ['MPH', fmt(this.trapSpeed, 1)],
        ],
      };
    }
    if (this.phase === PHASE.RUNNING && this.reaction !== null) {
      return {
        title: 'RUNNING',
        rows: [
          ['R/T', fmt(this.reaction)],
          ['ET', fmt(this.elapsed)],
          ['60FT', this.splits['60ft'] ? fmt(this.splits['60ft'].t) : '--'],
        ],
      };
    }
    return {
      title: 'STAGING',
      rows: [
        ['STATE', this.phase.toUpperCase().slice(0, 9), '#8fd0ff'],
        ['LAST ET', fmt(this.lastEt ?? null)],
        ['LAST MPH', fmt(this.lastMph ?? null, 1)],
      ],
    };
  }

  /** Cells for the trackside scoreboard. */
  boardCells() {
    const fmt = (v, d = 3) => (v === null || v === undefined ? '--' : v.toFixed(d));
    return {
      title: this.message.toUpperCase(),
      cells: [
        ['REACTION', fmt(this.reaction)],
        ['60 FT', this.splits['60ft'] ? fmt(this.splits['60ft'].t) : '--'],
        ['1/8 MILE', this.splits['1/8'] ? fmt(this.splits['1/8'].t) : '--'],
        ['1/4 MILE', this.phase === PHASE.FINISHED ? `${fmt(this.elapsed)}` : '--', '#ffd166'],
      ],
    };
  }

  /** Remember the last completed run so the dash can show it while staging. */
  remember() {
    if (this.phase === PHASE.FINISHED) {
      this.lastEt = this.elapsed;
      this.lastMph = this.trapSpeed;
    }
  }
}
