/**
 * Longitudinal drag-racing vehicle model.
 *
 * Kept completely separate from the visual car: it owns plain numbers, runs on
 * a fixed 5 ms substep (so behaviour is identical at 60, 72, 90 or 120 Hz) and
 * the renderer just reads the resulting state.
 *
 * What is actually simulated:
 *   - engine inertia and a torque curve, with a rev limiter and a two-step
 *   - a friction clutch that slips, which is what makes a launch feel like one
 *   - driven-wheel angular dynamics, so the rears can spin up independently
 *   - a slip-ratio tyre model with load sensitivity and weight transfer
 *   - tyre temperature: cold slicks bog, a burnout wakes them up
 *   - aero drag, downforce, rolling resistance and the parachute
 */
import { SPEC, engineTorque } from '../car/spec.js';

const G = 9.80665;
const FIXED_DT = 1 / 200;
const MAX_STEPS = 12;

/** Simplified Pacejka-style normalised force against slip ratio. */
function slipCurve(k) {
  const B = 10.7, C = 1.65, E = 0.97;
  const bk = B * k;
  return Math.sin(C * Math.atan(bk - E * (bk - Math.atan(bk))));
}

export class Vehicle {
  constructor({ enforceStripBounds = true } = {}) {
    // The original drag strip clamps world X to one lane.  Curved courses opt
    // out; the default stays unchanged so the existing drag model and checks
    // remain byte-for-byte equivalent in behaviour.
    this.enforceStripBounds = enforceStripBounds;
    this.reset();
  }

  reset(z = 12, x = 0) {
    // Pose ------------------------------------------------------------------
    this.x = x;
    this.z = z;                 // world Z; the strip runs toward -Z
    this.heading = 0;           // rad, + is to the left
    this.speed = 0;             // m/s along the car's forward axis

    // Driveline -------------------------------------------------------------
    this.gear = 1;
    this.rpm = SPEC.idleRpm;
    this.omegaEngine = (SPEC.idleRpm * Math.PI * 2) / 60;
    this.omegaRear = 0;
    this.locked = false;
    this.shiftTimer = 0;
    this.pendingGear = null;

    // Inputs ----------------------------------------------------------------
    this.throttle = 0;
    this.brake = 0;
    this.clutchInput = 0;       // what the player asks for
    this.clutch = 1;            // 1 = pedal to the floor, fully disengaged
    this.autoClutch = true;
    this.steer = 0;             // +1 = right
    this.steerAngle = 0;
    this.lineLock = false;
    this.chuteOut = false;

    // Derived ---------------------------------------------------------------
    this.accel = 0;
    this.lateralAccel = 0;
    this.wheelSlip = 0;
    this.tyreTemp = 0.15;
    this.boost = 0;
    this.engineHeat = 0.3;
    this.rearOmega = 0;
    this.offCourse = false;
    this.autoShift = true;
    this._accumulator = 0;
  }

  get gearRatio() {
    if (this.gear === 0) return 0;
    if (this.gear < 0) return -2.95 * SPEC.finalDrive;
    return SPEC.gearRatios[this.gear - 1] * SPEC.finalDrive;
  }

  get speedMph() { return this.speed * 2.2369362920544; }

  /** Distance travelled down the strip from the start line at z = 0. */
  get distance() { return -this.z; }

  shiftUp() {
    if (this.shiftTimer > 0) return;
    if (this.gear < SPEC.gearRatios.length) {
      this.pendingGear = this.gear + 1;
      this.shiftTimer = SPEC.shiftTime;
    }
  }

  shiftDown() {
    if (this.shiftTimer > 0) return;
    if (this.gear > -1) {
      this.pendingGear = this.gear - 1;
      this.shiftTimer = SPEC.shiftTime;
    }
  }

  /**
   * Advance the simulation.
   * @param {number} dt frame time in seconds
   */
  update(dt) {
    // Auto-clutch: a driver holds the clutch in at a standstill and on the
    // brakes, then feeds it in with the throttle. Dumping it at two-step revs
    // is exactly how you launch this thing.
    if (this.autoClutch) {
      const stopped = Math.abs(this.speed) < 1.4;
      let want = 0;
      if (stopped) {
        want = this.throttle < 0.15 || this.brake > 0.2
          ? 1
          : Math.max(0, 1 - (this.throttle - 0.15) * 4);
      }
      want = Math.max(want, this.clutchInput);
      this.clutch += (want - this.clutch) * Math.min(1, dt * 14);
    } else {
      this.clutch = this.clutchInput;
    }

    // True fixed timestep with a carried remainder: every substep is exactly
    // FIXED_DT long, so a run at 30 Hz and the same run at 144 Hz agree.
    this._accumulator = Math.min((this._accumulator ?? 0) + dt, MAX_STEPS * FIXED_DT);
    while (this._accumulator >= FIXED_DT) {
      this.step(FIXED_DT);
      this._accumulator -= FIXED_DT;
    }

    this.rpm = (this.omegaEngine * 60) / (Math.PI * 2);
    this.rearOmega = this.omegaRear;
  }

  step(h) {
    const spec = SPEC;
    const rWheel = spec.rear.radius;

    // ---- gear change -----------------------------------------------------
    if (this.shiftTimer > 0) {
      this.shiftTimer -= h;
      if (this.shiftTimer <= 0 && this.pendingGear !== null) {
        this.gear = this.pendingGear;
        this.pendingGear = null;
        this.locked = false;
      }
    }
    const shifting = this.shiftTimer > 0;

    // ---- automatic gearbox ----------------------------------------------
    if (this.autoShift && !shifting && this.gear > 0) {
      if (this.rpm > spec.redlineRpm - 150 && this.gear < spec.gearRatios.length) this.shiftUp();
      else if (this.rpm < 2600 && this.gear > 1 && this.throttle < 0.4) this.shiftDown();
    }

    // ---- engine ----------------------------------------------------------
    const rpm = Math.max(0, (this.omegaEngine * 60) / (Math.PI * 2));
    const stationary = Math.abs(this.speed) < 0.6;
    // Two-step on the footbrake for a launch; a burnout gets the full rev range.
    const twoStep = stationary && this.brake > 0.35 && !this.lineLock;
    const limit = twoStep ? spec.launchLimiterRpm : spec.limiterRpm;

    let throttle = this.throttle;
    if (shifting) throttle = 0;                       // torque cut on the shift
    if (rpm > limit) throttle = 0;                    // rev limiter

    let engineT = engineTorque(rpm) * throttle;
    engineT -= spec.engineBrakeTorque * (1 - throttle) * Math.min(1, rpm / 1500);
    if (rpm < 400) engineT += 220;                    // idle-up / starter torque

    // Boost builds with load and revs, and bleeds off the throttle.
    const boostTarget = throttle * Math.min(1, rpm / 3200) * 24;
    this.boost += (boostTarget - this.boost) * Math.min(1, h * 6);

    // ---- clutch ----------------------------------------------------------
    const ratio = shifting ? 0 : this.gearRatio;
    const engaged = Math.max(0, 1 - this.clutch * 1.25);
    const capacity = spec.clutchTorqueCapacity * engaged;
    const omegaIn = this.omegaRear * ratio;
    const dOmega = this.omegaEngine - omegaIn;

    let clutchT = 0;
    if (ratio === 0 || capacity <= 0) {
      this.locked = false;
    } else if (this.locked) {
      // Rigid driveline: solve the lumped system, then check the clutch holds.
      const inertia = spec.engineInertia * ratio * ratio + 2 * spec.wheelInertia;
      const { force, slip } = this.tyreForce(rWheel);
      this.wheelSlip = slip;
      const brakeT = this.rearBrakeTorque() * Math.sign(this.omegaRear || 1);
      const wheelT = engineT * ratio * spec.driveEfficiency - force * rWheel - brakeT;
      const domegaW = wheelT / inertia;
      clutchT = engineT - spec.engineInertia * ratio * domegaW;
      if (Math.abs(clutchT) > capacity) {
        this.locked = false;
      } else {
        this.omegaRear += domegaW * h;
        this.omegaEngine = this.omegaRear * ratio;
        this.integrateBody(h, force);
        this.postStep(h);
        return;
      }
    }

    if (ratio !== 0 && capacity > 0 && !this.locked) {
      clutchT = Math.sign(dOmega) * capacity;
      // Do not transmit more than it takes to synchronise within this step.
      const sync = Math.abs(dOmega) / h / (1 / spec.engineInertia + ratio * ratio / (2 * spec.wheelInertia));
      if (Math.abs(clutchT) > sync) {
        clutchT = Math.sign(dOmega) * sync;
        if (Math.abs(dOmega) < 6 && engaged > 0.9) this.locked = true;
      }
    }

    // Engine side.
    this.omegaEngine += ((engineT - clutchT) / spec.engineInertia) * h;
    const idle = (spec.idleRpm * Math.PI * 2) / 60;
    if (this.omegaEngine < idle * 0.35) this.omegaEngine = idle * 0.35; // no stalling
    const maxOmega = ((spec.limiterRpm + 400) * Math.PI * 2) / 60;
    if (this.omegaEngine > maxOmega) this.omegaEngine = maxOmega;

    // Driven wheels.
    const { force, slip } = this.tyreForce(rWheel);
    this.wheelSlip = slip;
    const driveT = clutchT * ratio * spec.driveEfficiency;
    const brakeT = this.rearBrakeTorque() * Math.sign(this.omegaRear);
    const wheelT = driveT - force * rWheel - brakeT;
    this.omegaRear += (wheelT / (2 * spec.wheelInertia)) * h;
    if (this.rearBrakeTorque() > 0 && Math.abs(this.omegaRear) < 0.5 && Math.abs(this.speed) < 0.5) {
      this.omegaRear = 0;
    }

    this.integrateBody(h, force);
    this.postStep(h);
  }

  rearBrakeTorque() {
    // The line lock holds the FRONT brakes only, which is the whole point of it:
    // it lets the rears spin for a burnout.
    if (this.lineLock) return 0;
    return this.brake * SPEC.brakeTorqueRear;
  }

  /** Longitudinal force from the driven tyres, plus the current slip ratio. */
  tyreForce(rWheel) {
    const spec = SPEC;
    const v = this.speed;
    const contact = this.omegaRear * rWheel;
    const slip = (contact - v) / Math.max(Math.abs(v), 2.2);

    // Weight transfer: static split plus mass * accel * cg height / wheelbase.
    const staticRear = spec.mass * G * (1 - spec.frontWeightBias);
    const transfer = (spec.mass * this.accel * spec.cgHeight) / spec.wheelbase;
    const aero = 0.5 * spec.airDensity * spec.dragArea * v * v * -spec.liftRear;
    const load = Math.max(0, staticRear + transfer + aero);

    // With the line lock on you are sitting in the water box, so the rears give
    // up most of their grip - which is what lets them spin while the car stays put.
    const wet = this.lineLock ? 0.5 : 1;
    const grip = (spec.rearGripCold + (spec.rearGrip - spec.rearGripCold) * this.tyreTemp) * wet;
    // Slicks lose a little grip as load piles on.
    const loadFactor = 1 - 0.00002 * Math.max(0, load - staticRear);
    const force = load * grip * loadFactor * slipCurve(slip);
    return { force, slip, load };
  }

  integrateBody(h, driveForce) {
    const spec = SPEC;
    const v = this.speed;
    const sign = Math.sign(v) || 1;

    // Front axle: braking only.
    const frontLoad = Math.max(
      0,
      spec.mass * G * spec.frontWeightBias - (spec.mass * this.accel * spec.cgHeight) / spec.wheelbase
    );
    // The line lock clamps the front brakes on, which is how you hold the car
    // still and roast the rears.
    const brakeInput = Math.max(this.brake, this.lineLock ? 1 : 0);
    const frontBrakeForce = Math.min(
      (brakeInput * spec.brakeTorqueFront) / spec.front.radius,
      frontLoad * spec.frontGrip
    );

    const q = 0.5 * spec.airDensity * v * v * sign;
    const dragForce = q * spec.dragArea + (this.chuteOut ? q * spec.chuteDragArea : 0);
    const rolling = spec.rollingResistance * spec.mass * G * sign;

    let F = driveForce - dragForce - rolling - frontBrakeForce * sign;
    if (Math.abs(v) < 0.15 && brakeInput > 0.1 && Math.abs(driveForce) < frontLoad * 0.5) {
      // Held on the brakes.
      this.speed = 0;
      this.accel = 0;
      return;
    }

    const a = F / spec.mass;
    this.accel += (a - this.accel) * (1 - Math.exp(-h / 0.012)); // stabilises weight transfer
    this.speed += a * h;

    // Steering: bicycle model, heavily damped at speed.
    const speedFactor = 1 / (1 + Math.abs(this.speed) / SPEC.steerSpeedFalloff);
    const target = -this.steer * spec.maxSteerAngle * speedFactor;
    this.steerAngle += (target - this.steerAngle) * Math.min(1, h * 8);
    const yawRate = (this.speed * Math.tan(this.steerAngle)) / spec.wheelbase;
    this.heading += yawRate * h;
    this.lateralAccel = this.speed * yawRate;

    this.x += -Math.sin(this.heading) * this.speed * h;
    this.z += -Math.cos(this.heading) * this.speed * h;
  }

  postStep(h) {
    // Tyre temperature: slip generates heat, rolling sheds it.
    const slipSpeed = Math.abs(this.omegaRear * SPEC.rear.radius - this.speed);
    const heating = Math.min(1, slipSpeed / 22) * (this.throttle * 0.9 + 0.1);
    this.tyreTemp += (heating * 1.25 - this.tyreTemp) * Math.min(1, h * (heating > this.tyreTemp ? 0.55 : 0.08));
    this.tyreTemp = Math.max(0.05, Math.min(1, this.tyreTemp));

    this.engineHeat += ((0.3 + this.throttle * 0.5 + Math.min(0.3, this.rpm / 26000)) - this.engineHeat) * h * 0.05;

    if (this.enforceStripBounds && Math.abs(this.x) > SPEC.laneHalfWidth) {
      this.x = Math.sign(this.x) * SPEC.laneHalfWidth;
      this.offCourse = true;
    }
  }

  /** Snapshot the model layer needs. Plain data, no THREE types. */
  get state() {
    return {
      x: this.x,
      z: this.z,
      heading: this.heading,
      speed: this.speed,
      rpm: this.rpm,
      gear: this.gear,
      throttle: this.throttle,
      brake: this.brake,
      clutch: this.clutch,
      steerAngle: this.steerAngle,
      rearOmega: this.omegaRear,
      accel: this.accel,
      lateralAccel: this.lateralAccel,
      wheelSlip: this.wheelSlip,
      tyreTemp: this.tyreTemp,
      boost: this.boost,
      engineHeat: this.engineHeat,
      lineLock: this.lineLock,
      chuteOut: this.chuteOut,
    };
  }
}
