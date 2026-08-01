/**
 * Fixed-step street-car vehicle model.
 *
 * The drivetrain remains longitudinal, but the chassis now owns a planar
 * velocity and yaw rate independently from its visual heading. That separation
 * is essential for believable wall contacts: an impact changes momentum first;
 * it does not instantly rotate the whole car to face the reflected direction.
 */
import { SPEC, engineTorque } from '../car/spec.js';

const G = 9.80665;
const FIXED_DT = 1 / 200;
const MAX_STEPS = 12;
const BODY_WIDTH = 1.92;

/** Simplified Pacejka-style normalised force against slip ratio. */
function slipCurve(k) {
  const B = 10.7, C = 1.65, E = 0.97;
  const bk = B * k;
  return Math.sin(C * Math.atan(bk - E * (bk - Math.atan(bk))));
}

export class Vehicle {
  constructor({ enforceStripBounds = true } = {}) {
    this.enforceStripBounds = enforceStripBounds;
    this.mass = SPEC.mass;
    // Rectangle approximation around the vertical axis. Collision impulses use
    // this instead of faking a heading reflection.
    this.yawInertia = SPEC.mass * (SPEC.wheelbase ** 2 + BODY_WIDTH ** 2) / 12;
    this.reset();
  }

  reset(z = 12, x = 0) {
    // Pose and chassis momentum ---------------------------------------------
    this.x = x;
    this.z = z;
    this.heading = 0;
    this.speed = 0;             // longitudinal velocity in body space
    this.lateralSpeed = 0;      // lateral velocity in body space
    this.velocityX = 0;         // world-space planar velocity
    this.velocityZ = 0;
    this.yawRate = 0;

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
    this.clutchInput = 0;
    this.clutch = 1;
    this.autoClutch = true;
    this.steer = 0;
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

  /** Replace chassis momentum after a collision impulse. */
  setPlanarVelocity(x, z) {
    this.velocityX = Number.isFinite(x) ? x : 0;
    this.velocityZ = Number.isFinite(z) ? z : 0;
    const sin = Math.sin(this.heading);
    const cos = Math.cos(this.heading);
    const forwardX = -sin;
    const forwardZ = -cos;
    const rightX = cos;
    const rightZ = -sin;
    this.speed = this.velocityX * forwardX + this.velocityZ * forwardZ;
    this.lateralSpeed = this.velocityX * rightX + this.velocityZ * rightZ;
  }

  syncPlanarVelocity() {
    const sin = Math.sin(this.heading);
    const cos = Math.cos(this.heading);
    this.velocityX = -sin * this.speed + cos * this.lateralSpeed;
    this.velocityZ = -cos * this.speed - sin * this.lateralSpeed;
  }

  /**
   * Advance the simulation. The optional callback runs after every 5 ms body
   * step, so collision detection and response use the same fixed timestep as
   * the tyres and drivetrain instead of one coarse pass per rendered frame.
   */
  update(dt, collisionStep = null) {
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

    this._accumulator = Math.min((this._accumulator ?? 0) + dt, MAX_STEPS * FIXED_DT);
    while (this._accumulator >= FIXED_DT) {
      const previousPose = {
        x: this.x,
        z: this.z,
        heading: this.heading,
      };
      this.step(FIXED_DT);
      collisionStep?.(this, previousPose, FIXED_DT);
      this._accumulator -= FIXED_DT;
    }

    this.rpm = (this.omegaEngine * 60) / (Math.PI * 2);
    this.rearOmega = this.omegaRear;
  }

  step(h) {
    const spec = SPEC;
    const rWheel = spec.rear.radius;

    if (this.shiftTimer > 0) {
      this.shiftTimer -= h;
      if (this.shiftTimer <= 0 && this.pendingGear !== null) {
        this.gear = this.pendingGear;
        this.pendingGear = null;
        this.locked = false;
      }
    }
    const shifting = this.shiftTimer > 0;

    if (this.autoShift && !shifting && this.gear > 0) {
      if (this.rpm > spec.redlineRpm - 150 && this.gear < spec.gearRatios.length) this.shiftUp();
      else if (this.rpm < 2600 && this.gear > 1 && this.throttle < 0.4) this.shiftDown();
    }

    const rpm = Math.max(0, (this.omegaEngine * 60) / (Math.PI * 2));
    const stationary = Math.abs(this.speed) < 0.6;
    const twoStep = stationary && this.brake > 0.35 && !this.lineLock;
    const limit = twoStep ? spec.launchLimiterRpm : spec.limiterRpm;

    let throttle = this.throttle;
    if (shifting) throttle = 0;
    if (rpm > limit) throttle = 0;

    let engineT = engineTorque(rpm) * throttle;
    engineT -= spec.engineBrakeTorque * (1 - throttle) * Math.min(1, rpm / 1500);
    if (rpm < 400) engineT += 220;

    const boostTarget = throttle * Math.min(1, rpm / 3200) * 24;
    this.boost += (boostTarget - this.boost) * Math.min(1, h * 6);

    const ratio = shifting ? 0 : this.gearRatio;
    const engaged = Math.max(0, 1 - this.clutch * 1.25);
    const capacity = spec.clutchTorqueCapacity * engaged;
    const omegaIn = this.omegaRear * ratio;
    const dOmega = this.omegaEngine - omegaIn;

    let clutchT = 0;
    if (ratio === 0 || capacity <= 0) {
      this.locked = false;
    } else if (this.locked) {
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
      const sync = Math.abs(dOmega) / h / (1 / spec.engineInertia + ratio * ratio / (2 * spec.wheelInertia));
      if (Math.abs(clutchT) > sync) {
        clutchT = Math.sign(dOmega) * sync;
        if (Math.abs(dOmega) < 6 && engaged > 0.9) this.locked = true;
      }
    }

    this.omegaEngine += ((engineT - clutchT) / spec.engineInertia) * h;
    const idle = (spec.idleRpm * Math.PI * 2) / 60;
    if (this.omegaEngine < idle * 0.35) this.omegaEngine = idle * 0.35;
    const maxOmega = ((spec.limiterRpm + 400) * Math.PI * 2) / 60;
    if (this.omegaEngine > maxOmega) this.omegaEngine = maxOmega;

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
    if (this.lineLock) return 0;
    return this.brake * SPEC.brakeTorqueRear;
  }

  tyreForce(rWheel) {
    const spec = SPEC;
    const v = this.speed;
    const contact = this.omegaRear * rWheel;
    const slip = (contact - v) / Math.max(Math.abs(v), 2.2);

    const staticRear = spec.mass * G * (1 - spec.frontWeightBias);
    const transfer = (spec.mass * this.accel * spec.cgHeight) / spec.wheelbase;
    const aero = 0.5 * spec.airDensity * spec.dragArea * v * v * -spec.liftRear;
    const load = Math.max(0, staticRear + transfer + aero);

    const wet = this.lineLock ? 0.5 : 1;
    const grip = (spec.rearGripCold + (spec.rearGrip - spec.rearGripCold) * this.tyreTemp) * wet;
    const loadFactor = 1 - 0.00002 * Math.max(0, load - staticRear);
    const force = load * grip * loadFactor * slipCurve(slip);
    return { force, slip, load };
  }

  integrateBody(h, driveForce) {
    const spec = SPEC;
    const v = this.speed;
    const sign = Math.sign(v) || 1;

    const frontLoad = Math.max(
      0,
      spec.mass * G * spec.frontWeightBias - (spec.mass * this.accel * spec.cgHeight) / spec.wheelbase
    );
    const brakeInput = Math.max(this.brake, this.lineLock ? 1 : 0);
    const frontBrakeForce = Math.min(
      (brakeInput * spec.brakeTorqueFront) / spec.front.radius,
      frontLoad * spec.frontGrip
    );

    const q = 0.5 * spec.airDensity * v * v * sign;
    const dragForce = q * spec.dragArea + (this.chuteOut ? q * spec.chuteDragArea : 0);
    const rolling = spec.rollingResistance * spec.mass * G * sign;

    const F = driveForce - dragForce - rolling - frontBrakeForce * sign;
    if (Math.abs(v) < 0.15 && brakeInput > 0.1 && Math.abs(driveForce) < frontLoad * 0.5) {
      this.speed = 0;
      this.lateralSpeed *= Math.exp(-h * 18);
      this.yawRate *= Math.exp(-h * 18);
      this.accel = 0;
      this.syncPlanarVelocity();
      return;
    }

    const a = F / spec.mass;
    this.accel += (a - this.accel) * (1 - Math.exp(-h / 0.012));
    this.speed += a * h;

    // A damped bicycle target drives yaw, while body-space lateral velocity is
    // retained separately so impacts and slides do not rotate the car instantly.
    const speedFactor = 1 / (1 + Math.abs(this.speed) / SPEC.steerSpeedFalloff);
    const targetSteer = -this.steer * spec.maxSteerAngle * speedFactor;
    this.steerAngle += (targetSteer - this.steerAngle) * Math.min(1, h * 8);
    const targetYawRate = (this.speed * Math.tan(this.steerAngle)) / spec.wheelbase;
    const yawResponse = 1 - Math.exp(-h * (4.5 + Math.min(5, Math.abs(this.speed) * 0.08)));
    this.yawRate += (targetYawRate - this.yawRate) * yawResponse;

    const lateralGrip = 5.5 + Math.min(13, Math.abs(this.speed) * 0.28);
    const previousLateral = this.lateralSpeed;
    this.lateralSpeed *= Math.exp(-lateralGrip * h);
    this.lateralAccel = (this.lateralSpeed - previousLateral) / h + this.speed * this.yawRate;

    this.heading += this.yawRate * h;
    this.syncPlanarVelocity();
    this.x += this.velocityX * h;
    this.z += this.velocityZ * h;
  }

  postStep(h) {
    const slipSpeed = Math.abs(this.omegaRear * SPEC.rear.radius - this.speed);
    const heating = Math.min(1, slipSpeed / 22) * (this.throttle * 0.9 + 0.1);
    this.tyreTemp += (heating * 1.25 - this.tyreTemp) * Math.min(1, h * (heating > this.tyreTemp ? 0.55 : 0.08));
    this.tyreTemp = Math.max(0.05, Math.min(1, this.tyreTemp));

    this.engineHeat += ((0.3 + this.throttle * 0.5 + Math.min(0.3, this.rpm / 26000)) - this.engineHeat) * h * 0.05;

    if (this.enforceStripBounds && Math.abs(this.x) > SPEC.laneHalfWidth) {
      this.x = Math.sign(this.x) * SPEC.laneHalfWidth;
      this.velocityX = 0;
      this.setPlanarVelocity(this.velocityX, this.velocityZ);
      this.offCourse = true;
    }
  }

  get state() {
    return {
      x: this.x,
      z: this.z,
      heading: this.heading,
      speed: this.speed,
      lateralSpeed: this.lateralSpeed,
      yawRate: this.yawRate,
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
