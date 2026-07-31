import * as THREE from "three";

const GEAR_RATIOS = [0, 3.18, 2.12, 1.56, 1.23, 1.0, 0.84];
const FINAL_DRIVE = 3.73;
const WHEEL_RADIUS = 0.36;
const MASS = 1510;
const IDLE_RPM = 900;
const REDLINE_RPM = 7800;
const WHEELBASE = 2.86;

function torqueAtRpm(rpm) {
  const points = [
    [900, 230],
    [2200, 390],
    [3900, 505],
    [5700, 548],
    [6900, 515],
    [7800, 405],
  ];
  if (rpm <= points[0][0]) return points[0][1];
  for (let index = 1; index < points.length; index += 1) {
    if (rpm <= points[index][0]) {
      const [rpmA, torqueA] = points[index - 1];
      const [rpmB, torqueB] = points[index];
      return THREE.MathUtils.lerp(torqueA, torqueB, (rpm - rpmA) / (rpmB - rpmA));
    }
  }
  return points.at(-1)[1];
}

export class VehicleSimulation {
  constructor() {
    this.position = new THREE.Vector3(0, 0, 0);
    this.velocity = 0;
    this.speed = 0;
    this.distance = 0;
    this.yaw = 0;
    this.steerAngle = 0;
    this.wheelRotation = 0;
    this.rpm = IDLE_RPM;
    this.gear = 1;
    this.throttle = 0;
    this.brake = 0;
    this.shiftTimer = 0;
    this.shiftCooldown = 0;
    this.longitudinalAcceleration = 0;
    this.lateralAcceleration = 0;
    this.tractionSlip = 0;
    this.elapsed = 0;
    this.finished = false;
  }

  reset() {
    this.position.set(0, 0, 0);
    this.velocity = 0;
    this.speed = 0;
    this.distance = 0;
    this.yaw = 0;
    this.steerAngle = 0;
    this.wheelRotation = 0;
    this.rpm = IDLE_RPM;
    this.gear = 1;
    this.throttle = 0;
    this.brake = 0;
    this.shiftTimer = 0;
    this.shiftCooldown = 0;
    this.longitudinalAcceleration = 0;
    this.lateralAcceleration = 0;
    this.tractionSlip = 0;
    this.elapsed = 0;
    this.finished = false;
  }

  shiftUp() {
    if (this.shiftCooldown > 0 || this.gear >= GEAR_RATIOS.length - 1) return false;
    this.gear += 1;
    this.shiftTimer = 0.17;
    this.shiftCooldown = 0.27;
    this.rpm = Math.max(IDLE_RPM, this.rpm * (GEAR_RATIOS[this.gear] / GEAR_RATIOS[this.gear - 1]));
    return true;
  }

  shiftDown() {
    if (this.shiftCooldown > 0 || this.gear <= 1) return false;
    this.gear -= 1;
    this.shiftTimer = 0.14;
    this.shiftCooldown = 0.24;
    this.rpm = Math.min(REDLINE_RPM, this.rpm * (GEAR_RATIOS[this.gear] / GEAR_RATIOS[this.gear + 1]));
    return true;
  }

  step(delta, input, canLaunch = true) {
    this.elapsed += delta;
    this.throttle = THREE.MathUtils.damp(this.throttle, input.throttle ?? 0, 16, delta);
    this.brake = THREE.MathUtils.damp(this.brake, input.brake ?? 0, 19, delta);
    this.shiftTimer = Math.max(0, this.shiftTimer - delta);
    this.shiftCooldown = Math.max(0, this.shiftCooldown - delta);

    const targetSteer = THREE.MathUtils.clamp(input.steer ?? 0, -1, 1) * 0.29;
    const steerRate = Math.abs(targetSteer) > Math.abs(this.steerAngle) ? 9 : 6;
    this.steerAngle = THREE.MathUtils.damp(this.steerAngle, targetSteer, steerRate, delta);

    const ratio = GEAR_RATIOS[this.gear] * FINAL_DRIVE;
    const coupledRpm = Math.abs(this.velocity) / WHEEL_RADIUS * ratio * (60 / (Math.PI * 2));
    const launchRpm = THREE.MathUtils.lerp(IDLE_RPM, 4200, this.throttle);
    const targetRpm = Math.max(IDLE_RPM, this.speed < 2.2 ? launchRpm : coupledRpm);
    this.rpm = THREE.MathUtils.damp(this.rpm, Math.min(targetRpm, REDLINE_RPM + 280), this.shiftTimer > 0 ? 3 : 13, delta);

    let driveForce = 0;
    if (canLaunch && this.shiftTimer <= 0) {
      const limiter = this.rpm > REDLINE_RPM ? 0.18 : 1;
      driveForce = torqueAtRpm(this.rpm) * ratio * 0.87 / WHEEL_RADIUS * this.throttle * limiter;
    }

    const tractionLimit = MASS * 9.81 * (0.82 + Math.min(this.speed / 45, 1) * 0.1);
    const unclampedForce = driveForce;
    driveForce = Math.min(driveForce, tractionLimit);
    this.tractionSlip = THREE.MathUtils.damp(
      this.tractionSlip,
      unclampedForce > tractionLimit ? (unclampedForce - tractionLimit) / tractionLimit : 0,
      12,
      delta,
    );

    const aeroDrag = 0.5 * 1.225 * 0.69 * this.velocity * Math.abs(this.velocity);
    const rollingResistance = this.speed > 0.05 ? MASS * 9.81 * 0.014 * Math.sign(this.velocity) : 0;
    const brakingForce = this.brake * 14500 * Math.sign(this.velocity || 1);
    const netForce = driveForce - aeroDrag - rollingResistance - brakingForce;
    const previousVelocity = this.velocity;
    this.velocity += (netForce / MASS) * delta;
    if (this.brake > 0.05 && previousVelocity > 0 && this.velocity < 0) this.velocity = 0;
    this.velocity = THREE.MathUtils.clamp(this.velocity, -5, 95);
    if (!canLaunch && this.position.z > -0.02) this.velocity = Math.min(this.velocity, 0);
    this.speed = Math.abs(this.velocity);
    this.longitudinalAcceleration = (this.velocity - previousVelocity) / Math.max(delta, 0.0001);

    const speedSteerReduction = THREE.MathUtils.lerp(1, 0.34, THREE.MathUtils.clamp(this.speed / 70, 0, 1));
    const yawRate = (this.velocity / WHEELBASE) * Math.tan(this.steerAngle * speedSteerReduction);
    this.yaw += yawRate * delta;
    this.yaw = THREE.MathUtils.clamp(this.yaw, -0.19, 0.19);
    this.lateralAcceleration = this.velocity * yawRate;

    const previousZ = this.position.z;
    this.position.x -= Math.sin(this.yaw) * this.velocity * delta;
    this.position.z -= Math.cos(this.yaw) * this.velocity * delta;
    this.position.x = THREE.MathUtils.clamp(this.position.x, -5.1, 5.1);
    this.distance = Math.max(this.distance, -this.position.z);
    this.wheelRotation -= (this.position.z - previousZ) / WHEEL_RADIUS;

    if (this.distance >= 402.336) this.finished = true;
  }
}

export const vehicleConstants = {
  gearRatios: GEAR_RATIOS,
  finalDrive: FINAL_DRIVE,
  wheelRadius: WHEEL_RADIUS,
  redlineRpm: REDLINE_RPM,
  mass: MASS,
};

