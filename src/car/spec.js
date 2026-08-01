/**
 * One source of truth for the car's dimensions and drivetrain.
 *
 * Both the visual model and the physics read from here, so the tyres always
 * match the rolling radius the simulation integrates with. All units are SI:
 * metres, kilograms, seconds, newtons, radians.
 */

export const SPEC = {
  name: 'Nitro Strip - Pro Street Coupe',

  // Geometry ---------------------------------------------------------------
  wheelbase: 2.90,
  front: { z: -1.45, x: 0.810, radius: 0.34, width: 0.22 },
  rear: { z: 1.45, x: 0.780, radius: 0.44, width: 0.44 },
  frontTuck: 0.62,   // half-width the body pulls in to around the front arch
  rearTuck: 0.54,

  // Where the driver's eyes sit in car space (left-hand drive). The anchor is
  // slightly rearward of the prototype so the wheel, gauges and cage read at
  // believable distances in VR rather than crowding the headset near plane.
  eyePoint: { x: -0.38, y: 1.18, z: 0.10 },

  // Mass and balance -------------------------------------------------------
  mass: 1480,               // kg, with driver and fuel
  cgHeight: 0.50,           // m above ground
  frontWeightBias: 0.44,    // static fraction of weight on the front axle
  wheelInertia: 1.5,        // kg m^2 per driven wheel (rim + tyre + axle)
  engineInertia: 0.28,      // kg m^2 at the crank, incl. flywheel and blower

  // Aerodynamics -----------------------------------------------------------
  dragArea: 0.78,           // Cd * A  (m^2)
  airDensity: 1.2041,
  liftFront: -0.10,         // downforce coefficients (negative = pushes down)
  liftRear: -0.34,
  rollingResistance: 0.014,
  chuteDragArea: 3.4,       // Cd * A of the deployed parachute

  // Engine: blown big-block, torque in N.m against crank rpm ---------------
  idleRpm: 950,
  redlineRpm: 7600,
  limiterRpm: 7800,
  launchLimiterRpm: 4200,   // two-step, active on the line
  torqueCurve: [
    [0, 300],
    [1000, 620],
    [2000, 880],
    [3000, 1040],
    [4000, 1150],
    [4800, 1210],
    [5600, 1185],
    [6400, 1090],
    [7200, 930],
    [7800, 760],
    [8600, 0],
  ],
  engineBrakeTorque: 90,    // N.m of drag at closed throttle

  // Drivetrain -------------------------------------------------------------
  gearRatios: [2.94, 1.90, 1.42, 1.00, 0.78],
  finalDrive: 4.10,
  driveEfficiency: 0.90,
  shiftTime: 0.18,          // s of torque cut per shift
  clutchTorqueCapacity: 3200, // N.m the clutch can hold before it slips

  // Tyres ------------------------------------------------------------------
  rearGrip: 2.15,           // peak mu of a warm slick on a prepped surface
  rearGripCold: 1.35,       // before a burnout puts heat in them
  frontGrip: 1.05,
  tyrePeakSlip: 0.13,       // slip ratio at peak grip
  brakeTorqueRear: 2600,    // N.m
  brakeTorqueFront: 3400,

  // Steering ---------------------------------------------------------------
  maxSteerAngle: 0.24,      // rad at the road wheels (~14 deg)
  steerSpeedFalloff: 45,    // m/s at which steering is halved

  // Track ------------------------------------------------------------------
  quarterMile: 402.336,
  eighthMile: 201.168,
  laneHalfWidth: 5.2,
};

/** Crank torque (N.m) at a given rpm, linearly interpolated from the curve. */
export function engineTorque(rpm) {
  const c = SPEC.torqueCurve;
  if (rpm <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) {
    if (rpm <= c[i][0]) {
      const [r0, t0] = c[i - 1];
      const [r1, t1] = c[i];
      return t0 + ((rpm - r0) / (r1 - r0)) * (t1 - t0);
    }
  }
  return 0;
}
