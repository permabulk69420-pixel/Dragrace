/** Generic one-lap circuit timing.  Depends on route metadata, not a car type. */

export const CIRCUIT_PHASE = Object.freeze({
  COUNTDOWN: 'countdown',
  RUNNING: 'running',
  FINISHED: 'finished',
});

const formatTime = (seconds) => {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '--:--.---';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds - minutes * 60).toFixed(3).padStart(6, '0')}`;
};

export class CircuitRace {
  constructor(route) {
    this.route = route;
    this.lastLap = null;
    this.bestLap = null;
    this.reset();
  }

  reset() {
    this.phase = CIRCUIT_PHASE.COUNTDOWN;
    this.countdown = 0;
    this.elapsed = 0;
    this.travelled = 0;
    this.progress = 0;
    this.lastRouteDistance = null;
    this.currentInfo = null;
    this.wrongWay = false;
    this.splits = {};
    this.message = 'GRID READY';
    this.lights = { red: true, amber: false, green: false };
  }

  remember() {
    if (this.phase !== CIRCUIT_PHASE.FINISHED) return;
    this.lastLap = this.elapsed;
    if (this.bestLap === null || this.elapsed < this.bestLap) this.bestLap = this.elapsed;
  }

  /**
   * Vehicle contract: plain `x`, `z`, `heading`, `speed` and `speedMph` values.
   */
  update(vehicle, dt) {
    const hint = this.currentInfo?.distance ?? this.lastRouteDistance;
    const info = this.route.nearest(vehicle.x, vehicle.z, hint);
    this.currentInfo = info;
    const forwardX = -Math.sin(vehicle.heading);
    const forwardZ = -Math.cos(vehicle.heading);
    const alignment = forwardX * info.tangent.x + forwardZ * info.tangent.z;
    this.wrongWay = alignment < -0.28 && Math.abs(vehicle.speed) > 2;

    if (this.phase === CIRCUIT_PHASE.COUNTDOWN) {
      this.countdown += dt;
      this.lights.red = this.countdown < 1.15;
      this.lights.amber = this.countdown >= 1.15 && this.countdown < 2.55;
      this.lights.green = this.countdown >= 2.55;
      if (this.countdown < 1.15) this.message = 'HOLD';
      else if (this.countdown < 2.55) this.message = 'GET READY';
      else if (this.countdown < 3.0) this.message = 'GO';
      if (this.countdown >= 3.0) {
        this.phase = CIRCUIT_PHASE.RUNNING;
        this.lastRouteDistance = info.distance;
        this.message = 'MIDNIGHT RUN';
      }
      return;
    }

    if (this.phase === CIRCUIT_PHASE.RUNNING) {
      this.elapsed += dt;
      let delta = info.distance - this.lastRouteDistance;
      if (delta < -this.route.length / 2) delta += this.route.length;
      if (delta > this.route.length / 2) delta -= this.route.length;
      // Reverse travel subtracts progress, so turning around cannot complete a lap.
      if (Math.abs(delta) < 35) this.travelled = Math.max(0, this.travelled + delta);
      this.lastRouteDistance = info.distance;
      this.progress = Math.min(1, this.travelled / this.route.length);

      for (const fraction of [0.25, 0.5, 0.75]) {
        const key = String(fraction);
        if (this.splits[key] === undefined && this.progress >= fraction) this.splits[key] = this.elapsed;
      }

      if (this.travelled >= this.route.length) {
        this.phase = CIRCUIT_PHASE.FINISHED;
        this.progress = 1;
        this.message = `FINISH  ${formatTime(this.elapsed)}`;
        this.lights.green = true;
      } else if (this.wrongWay) {
        this.message = 'WRONG WAY';
      } else if (!info.onDriveableSurface) {
        this.message = 'OFF COURSE';
      } else {
        const sector = Math.min(4, Math.floor(this.progress * 4) + 1);
        this.message = `SECTOR ${sector}  ·  ${Math.round(this.progress * 100)}%`;
      }
    }
  }

  dashRows() {
    if (this.phase === CIRCUIT_PHASE.FINISHED) {
      return {
        title: 'LAP COMPLETE',
        rows: [
          ['TIME', formatTime(this.elapsed), '#7fffd4'],
          ['BEST', formatTime(this.bestLap ?? this.elapsed)],
          ['COURSE', `${(this.route.length / 1000).toFixed(2)} KM`],
        ],
      };
    }
    return {
      title: this.phase === CIRCUIT_PHASE.COUNTDOWN ? 'START GRID' : 'MIDNIGHT RUN',
      rows: [
        ['LAP', formatTime(this.elapsed), '#8fdcff'],
        ['PROGRESS', `${Math.round(this.progress * 100)}%`],
        ['BEST', formatTime(this.bestLap)],
      ],
    };
  }

  boardCells(speedMph = 0) {
    return {
      title: this.message,
      cells: [
        ['LAP', formatTime(this.elapsed)],
        ['SECTOR 1', formatTime(this.splits['0.25'])],
        ['PROGRESS', `${Math.round(this.progress * 100)}%`, '#ffd15c'],
        ['SPEED', `${Math.round(speedMph)} MPH`, '#65dcff'],
      ],
    };
  }
}

export { formatTime };
