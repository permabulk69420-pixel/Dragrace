/**
 * Lap and sector timing for the circuit.
 *
 * Deliberately knows nothing about cars: feed it a world position every frame
 * and it works out how far round the lap that is, when the start line has been
 * crossed and what the sector times were. That means the same timer works for
 * the preview camera now and for the vehicle later.
 */
import { loopDelta } from './util.js';

const format = (t) => {
  if (t === null || t === undefined) return '--:--.---';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(3)}`;
};

export class LapTimer {
  /**
   * @param {import('./layout.js').Track} track
   * @param {object} [opts]
   * @param {number} [opts.sectors=3]
   */
  constructor(track, { sectors = 3 } = {}) {
    this.track = track;
    this.sectorCount = sectors;
    this.sectorEnds = Array.from({ length: sectors }, (_, i) => ((i + 1) / sectors) * track.length);
    this.reset();
  }

  reset() {
    this.armed = false;
    this.s = 0;
    this.lastS = 0;
    this.distance = 0;
    this.lap = 0;
    this.time = 0;
    this.sector = 0;
    this.sectorStart = 0;
    this.sectorTimes = [];
    this.lastLap = null;
    this.lastSectors = null;
    this.bestLap = null;
    this.bestSectors = new Array(this.sectorCount).fill(null);
    this.delta = null;
    this.invalid = false;
    this.reversing = false;
  }

  /**
   * @param {number} x
   * @param {number} z
   * @param {number} dt seconds
   * @param {object} [flags] { offTrack: boolean }
   */
  update(x, z, dt, flags = {}) {
    const query = this.track.query(x, z);
    const s = query.s;

    if (!this.armed) {
      this.armed = true;
      this.lastS = s;
      this.s = s;
      return query;
    }

    const step = loopDelta(this.lastS, s, this.track.length);
    this.reversing = step < -0.5;
    this.distance += step;
    this.s = s;

    if (this.lap > 0 || this.time > 0) this.time += dt;
    if (flags.offTrack) this.invalid = true;

    // Crossing the line: the shortest way round says we went from the end of
    // the lap to the start of it, moving forwards.
    if (step > 0 && this.lastS > s && this.lastS - s > this.track.length * 0.5) {
      this.completeLap();
    } else if (this.lap === 0 && this.time === 0 && step > 0) {
      // First crossing arms the clock rather than scoring a lap.
      this.time = dt;
      this.sectorStart = 0;
      this.sector = 0;
    } else {
      // Sector boundaries.
      const end = this.sectorEnds[this.sector];
      if (this.sector < this.sectorCount - 1 && this.lastS < end && s >= end) {
        this.closeSector();
      }
    }

    this.lastS = s;
    return query;
  }

  closeSector() {
    const split = this.time - this.sectorStart;
    this.sectorTimes[this.sector] = split;
    if (this.bestSectors[this.sector] === null || split < this.bestSectors[this.sector]) {
      this.bestSectors[this.sector] = split;
    }
    this.sectorStart = this.time;
    this.sector = Math.min(this.sector + 1, this.sectorCount - 1);
  }

  completeLap() {
    this.closeSector();
    const total = this.time;
    this.lastLap = total;
    this.lastSectors = [...this.sectorTimes];
    if (!this.invalid && (this.bestLap === null || total < this.bestLap)) {
      this.delta = this.bestLap === null ? null : total - this.bestLap;
      this.bestLap = total;
    } else if (this.bestLap !== null) {
      this.delta = total - this.bestLap;
    }
    this.lap++;
    this.time = 0;
    this.sector = 0;
    this.sectorStart = 0;
    this.sectorTimes = [];
    this.invalid = false;
  }

  /** Fraction of the lap completed, 0..1. */
  get progress() {
    return this.s / this.track.length;
  }

  /** Ready-to-print strings for a HUD. */
  readout() {
    return {
      lap: this.lap,
      current: format(this.time),
      last: format(this.lastLap),
      best: format(this.bestLap),
      sector: this.sector + 1,
      splits: this.sectorTimes.map((t) => t.toFixed(3)),
      invalid: this.invalid,
    };
  }
}

export { format as formatTime };
