/**
 * A viewpoint for looking at the course before there is a car in it.
 *
 * This is NOT the vehicle. It is a camera rig with just enough motion to answer
 * "does this circuit read well and is it fun to go round?" - it follows the road
 * surface, leans with the camber, and bounces off the barriers, but it has no
 * model, no drivetrain and no physics worth the name. When the real car is
 * dropped in it takes over: feed the same course queries to the vehicle and
 * delete this rig.
 *
 * Three modes:
 *   drive - ground-hugging, throttle and steering, eye height of a driver
 *   fly   - free 6DOF, for inspecting the scenery
 *   ride  - hands off, runs a lap along the racing line
 */
import * as THREE from 'three';
import { clamp, lerp, angleDelta, wrap } from './util.js';

export const MODES = ['drive', 'fly', 'ride'];

const EYE_HEIGHT = 1.15;
const ACCEL = 11;
const BRAKE = 20;
const DRAG = 0.0016;
const ROLLING = 3.2;
const MAX_STEER = 1.5;

export class PreviewRig {
  /**
   * @param {ReturnType<import('./index.js').buildCourse>} course
   */
  constructor(course) {
    this.course = course;
    this.track = course.track;
    this.group = new THREE.Group();
    this.group.name = 'PreviewRig';

    this.position = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;
    this.mode = 'drive';
    this.height = EYE_HEIGHT;
    this.pitch = 0;
    this.roll = 0;
    this.rideS = 0;
    this.rideLateral = 0;
    this.lastImpact = 0;

    this.reset();
  }

  /** Drop back onto the grid. */
  reset(s = 0) {
    const frame = this.track.frameAt(s);
    this.position.copy(frame.position);
    this.position.y = frame.position.y + EYE_HEIGHT;
    this.heading = frame.heading;
    this.speed = 0;
    this.rideS = s;
    this.pitch = 0;
    this.roll = 0;
  }

  nextMode() {
    this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
    if (this.mode === 'ride') {
      this.rideS = this.track.query(this.position.x, this.position.z).s;
    }
    return this.mode;
  }

  get speedKph() {
    return this.speed * 3.6;
  }

  /**
   * @param {number} dt
   * @param {import('./input.js').PreviewInput} input
   */
  update(dt, input) {
    if (this.mode === 'fly') this.updateFly(dt, input);
    else if (this.mode === 'ride') this.updateRide(dt, input);
    else this.updateDrive(dt, input);

    this.group.position.copy(this.position);
    this.group.rotation.set(0, this.heading + input.lookYaw, 0);
  }

  /* -- ground-hugging ----------------------------------------------------- */

  updateDrive(dt, input) {
    const road = this.course.surface(this.position.x, this.position.z);

    // Longitudinal.
    const boost = input.boost ? 1.9 : 1;
    const power = ACCEL * boost * road.grip;
    this.speed += (input.throttle * power - input.brake * BRAKE * road.grip) * dt;
    this.speed -= (DRAG * this.speed * Math.abs(this.speed) + ROLLING * Math.sign(this.speed) * (1 - road.grip * 0.5)) * dt;
    if (input.throttle < 0.02 && input.brake < 0.02) this.speed *= 1 - 0.25 * dt;
    this.speed = clamp(this.speed, -14, 92);
    if (Math.abs(this.speed) < 0.05) this.speed = 0;

    // Steering falls off with speed, as it must for anything to be drivable.
    const rate = MAX_STEER / (1 + Math.abs(this.speed) / 15);
    this.heading -= input.steer * rate * dt * Math.sign(this.speed || 1) * clamp(Math.abs(this.speed) / 3, 0, 1);

    const forward = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
    this.position.addScaledVector(forward, this.speed * dt);

    // Barriers: shove back onto the circuit and scrub off speed.
    const hit = this.course.clampToBarriers(this.position, 1.1);
    if (hit) {
      this.speed *= clamp(1 - hit.depth * 0.35, 0.35, 0.98);
      // Slide along the wall rather than sticking to it.
      this.heading += angleDelta(this.heading, hit.heading) * clamp(dt * 4, 0, 0.4);
      this.lastImpact = hit.depth;
    } else {
      this.lastImpact *= 0.9;
    }

    // Sit on the surface, leaning with the camber and pitching with the grade.
    const surface = this.course.surface(this.position.x, this.position.z);
    const groundY = surface.onRoad ? surface.height : this.course.heightAt(this.position.x, this.position.z);
    const wanted = groundY + this.height;
    this.position.y = lerp(this.position.y, wanted, clamp(dt * 12, 0, 1));
    this.pitch = lerp(this.pitch, Math.asin(clamp(surface.gradient, -1, 1)) * 0.6, clamp(dt * 4, 0, 1));
    this.roll = lerp(this.roll, -surface.curvature * this.speed * 0.5, clamp(dt * 3, 0, 1));
  }

  /* -- free flight -------------------------------------------------------- */

  updateFly(dt, input) {
    const speed = (input.boost ? 90 : 26) * (0.25 + input.throttle);
    this.heading -= input.steer * 1.3 * dt;
    const forward = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
    const move = (input.throttle - input.brake) * speed * dt;
    this.position.addScaledVector(forward, move);
    this.position.y += input.lift * speed * 0.6 * dt;
    this.position.y = Math.max(this.position.y, this.course.heightAt(this.position.x, this.position.z) + 1.2);
    this.speed = Math.abs(move / Math.max(dt, 1e-4));
    this.pitch = lerp(this.pitch, 0, clamp(dt * 4, 0, 1));
    this.roll = lerp(this.roll, 0, clamp(dt * 4, 0, 1));
  }

  /* -- automatic hot lap --------------------------------------------------- */

  updateRide(dt, input) {
    const frame = this.track.frameAt(this.rideS);
    // Slow for the corners the way you would have to: v = sqrt(a * r).
    const radius = Math.abs(frame.curvature) > 1e-4 ? 1 / Math.abs(frame.curvature) : 4000;
    const target = clamp(Math.sqrt(9.0 * radius), 12, input.boost ? 84 : 58);
    this.speed = lerp(this.speed, target, clamp(dt * (target < this.speed ? 1.4 : 0.7), 0, 1));
    this.rideS = wrap(this.rideS + this.speed * dt, this.track.length);

    // A racing line: hug the inside of the corner, drift out on the straights.
    const wantLateral = clamp(-Math.sign(frame.curvature) * frame.halfWidth * 0.42
      * clamp(Math.abs(frame.curvature) * 260, 0, 1), -frame.halfWidth * 0.6, frame.halfWidth * 0.6);
    this.rideLateral = lerp(this.rideLateral, wantLateral, clamp(dt * 1.4, 0, 1));

    const ahead = this.track.frameAt(this.rideS);
    const target3 = ahead.position.clone()
      .addScaledVector(ahead.right, this.rideLateral)
      .addScaledVector(ahead.up, this.height);
    this.position.lerp(target3, clamp(dt * 9, 0, 1));
    this.heading += angleDelta(this.heading, ahead.heading) * clamp(dt * 5, 0, 1);
    this.pitch = lerp(this.pitch, Math.asin(clamp(ahead.gradient, -1, 1)) * 0.5, clamp(dt * 3, 0, 1));
    this.roll = lerp(this.roll, -ahead.bank * 1.4, clamp(dt * 3, 0, 1));
  }
}

/**
 * A hollow box showing where the car will sit once it is dropped in - the same
 * footprint as the existing vehicle, so the scale of the world can be checked
 * against something real.
 */
export function carPlaceholder({ length = 4.9, width = 1.95, height = 1.4 } = {}) {
  const g = new THREE.Group();
  g.name = 'CarPlaceholder';
  const box = new THREE.BoxGeometry(width, height, length);
  box.translate(0, height / 2, 0);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(box),
    new THREE.LineBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0.85 })
  );
  edges.name = 'PlaceholderEdges';
  g.add(edges);
  // A nose marker so which way it faces is obvious.
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.6, 8),
    new THREE.MeshBasicMaterial({ color: 0x35e0ff })
  );
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, height * 0.5, -length / 2 - 0.35);
  g.add(nose);
  return g;
}
