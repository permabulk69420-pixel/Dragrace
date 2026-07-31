/**
 * Input: keyboard, gamepad and WebXR controllers.
 *
 * The interesting bit is `grab steering`: squeeze a grip while your hand is
 * near the rim and the wheel follows your hand around the column axis, which
 * feels far better in VR than nudging a thumbstick. Let go and the thumbstick
 * takes over again.
 */
import * as THREE from 'three';
import { SPEC } from '../car/spec.js';
import { STEERING_RATIO } from '../car/car.js';

const KEY_MAP = {
  KeyW: 'throttle', ArrowUp: 'throttle',
  KeyS: 'brake', ArrowDown: 'brake',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'clutch',
  ShiftLeft: 'lineLock',
};

const _v = new THREE.Vector3();

export class Controls {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Group} rig  the player rig the controllers live in
   */
  constructor(renderer, rig) {
    this.renderer = renderer;
    this.rig = rig;

    this.throttle = 0;
    this.brake = 0;
    this.clutch = 0;
    this.steer = 0;
    this.lineLock = false;

    // Edge-triggered actions, consumed by the game loop each frame.
    this.events = { shiftUp: false, shiftDown: false, reset: false, chute: false, recenter: false, camera: false, exportGlb: false };

    this.keys = new Set();
    // Chrome hands back fresh Gamepad objects on every getGamepads() call, so
    // edge detection has to key off a stable string, not the object identity.
    this._prevButtons = new Map();
    this.grab = { left: null, right: null };
    this.grabbing = false;

    this.controllers = [];
    for (let i = 0; i < 2; i++) {
      const controller = renderer.xr.getController(i);
      controller.name = `Controller${i}`;
      controller.userData.index = i;
      rig.add(controller);
      const grip = renderer.xr.getControllerGrip(i);
      rig.add(grip);
      this.controllers.push({ controller, grip });
      controller.addEventListener('connected', (e) => {
        controller.userData.handedness = e.data?.handedness ?? (i === 0 ? 'left' : 'right');
        controller.userData.inputSource = e.data;
        controller.add(buildControllerModel(controller.userData.handedness));
      });
      controller.addEventListener('disconnected', () => {
        controller.userData.inputSource = null;
        controller.clear();
      });
    }

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      switch (e.code) {
        case 'KeyQ': this.events.shiftUp = true; break;
        case 'KeyE': this.events.shiftDown = true; break;
        case 'KeyR': this.events.reset = true; break;
        case 'KeyC': this.events.chute = true; break;
        case 'KeyV': this.events.camera = true; break;
        case 'KeyG': this.events.exportGlb = true; break;
        case 'KeyH': this.events.recenter = true; break;
        default: break;
      }
      if (KEY_MAP[e.code]) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  /** True while any of the codes mapped to `action` are held. */
  held(action) {
    for (const [code, name] of Object.entries(KEY_MAP)) {
      if (name === action && this.keys.has(code)) return true;
    }
    return false;
  }

  /**
   * @param {number} dt
   * @param {object} carParts  needs `steeringWheel` for grab steering
   * @param {number} currentSteerAngle  road-wheel angle in radians
   */
  update(dt, carParts, currentSteerAngle) {
    const rate = dt * 4.5;

    // --- keyboard ---------------------------------------------------------
    let throttle = this.held('throttle') ? 1 : 0;
    let brake = this.held('brake') ? 1 : 0;
    let clutch = this.held('clutch') ? 1 : 0;
    let lineLock = this.held('lineLock');
    let steerKey = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    let steerTarget = steerKey;
    let steerFromStick = steerKey !== 0;

    // --- gamepad (desktop) ------------------------------------------------
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad || !pad.connected || pad.mapping !== 'standard') continue;
      throttle = Math.max(throttle, pad.buttons[7]?.value ?? 0);
      brake = Math.max(brake, pad.buttons[6]?.value ?? 0);
      const ax = pad.axes[0] ?? 0;
      if (Math.abs(ax) > 0.12) { steerTarget = ax; steerFromStick = true; }
      const id = `pad${pad.index}`;
      this._edge(pad, 0, `${id}A`, () => (this.events.shiftUp = true));
      this._edge(pad, 1, `${id}B`, () => (this.events.shiftDown = true));
      this._edge(pad, 3, `${id}Y`, () => (this.events.reset = true));
      this._edge(pad, 2, `${id}X`, () => (this.events.chute = true));
      lineLock = lineLock || (pad.buttons[4]?.pressed ?? false);
    }

    // --- XR controllers ---------------------------------------------------
    let grabSteer = null;
    for (const { controller } of this.controllers) {
      const src = controller.userData.inputSource;
      const gp = src?.gamepad;
      const hand = controller.userData.handedness;
      if (!gp) continue;

      const trigger = gp.buttons[0]?.value ?? 0;
      const squeeze = gp.buttons[1]?.pressed ?? false;

      // Grab steering: if a squeezing hand is on the rim, the wheel follows it.
      const wheel = carParts?.steeringWheel;
      let onRim = false;
      if (wheel) {
        const state = this.grab[hand];
        if (squeeze) {
          controller.getWorldPosition(_v);
          wheel.worldToLocal(_v);
          const radius = Math.hypot(_v.x, _v.y);
          const near = radius > 0.08 && radius < 0.34 && Math.abs(_v.z) < 0.22;
          const angle = Math.atan2(_v.y, _v.x);
          if (!state && near) {
            this.grab[hand] = { refAngle: angle, refWheel: currentSteerAngle * STEERING_RATIO };
            onRim = true;
          } else if (state) {
            onRim = true;
            let delta = angle - state.refAngle;
            while (delta > Math.PI) delta -= Math.PI * 2;
            while (delta < -Math.PI) delta += Math.PI * 2;
            const wanted = state.refWheel + delta;
            grabSteer = THREE.MathUtils.clamp(-wanted / (SPEC.maxSteerAngle * STEERING_RATIO), -1, 1);
          }
        } else if (state) {
          this.grab[hand] = null;
        }
      }

      if (hand === 'right') {
        throttle = Math.max(throttle, trigger);
        const ax = gp.axes[2] ?? 0;
        if (Math.abs(ax) > 0.12) { steerTarget = ax; steerFromStick = true; }
        this._edge(gp, 4, `${hand}A`, () => (this.events.shiftUp = true));
        this._edge(gp, 5, `${hand}B`, () => (this.events.shiftDown = true));
        this._edge(gp, 3, `${hand}Stick`, () => (this.events.camera = true));
      } else {
        brake = Math.max(brake, trigger);
        lineLock = lineLock || (squeeze && !onRim);
        this._edge(gp, 4, `${hand}X`, () => (this.events.reset = true));
        this._edge(gp, 5, `${hand}Y`, () => (this.events.recenter = true));
        this._edge(gp, 3, `${hand}Stick`, () => (this.events.chute = true));
      }
    }

    this.grabbing = grabSteer !== null;
    if (grabSteer !== null) {
      this.steer = grabSteer;
    } else if (steerFromStick) {
      this.steer += (steerTarget - this.steer) * Math.min(1, rate * 2);
    } else {
      this.steer += (0 - this.steer) * Math.min(1, rate * 2.5);
    }

    // Smooth the pedals a touch so keyboard input is not a square wave.
    this.throttle += (throttle - this.throttle) * Math.min(1, dt * 12);
    this.brake += (brake - this.brake) * Math.min(1, dt * 14);
    this.clutch += (clutch - this.clutch) * Math.min(1, dt * 18);
    this.lineLock = lineLock;
  }

  /** Fire `fn` on the frame a button goes down. */
  _edge(source, index, key, fn) {
    const pressed = source.buttons?.[index]?.pressed ?? false;
    if (pressed && !this._prevButtons.get(key)) fn();
    this._prevButtons.set(key, pressed);
  }

  /** Read and clear the one-shot events. */
  takeEvents() {
    const e = { ...this.events };
    for (const k of Object.keys(this.events)) this.events[k] = false;
    return e;
  }
}

/** A simple glove-ish controller stand-in so the player sees their hands. */
function buildControllerModel(handedness) {
  const g = new THREE.Group();
  g.name = `ControllerModel_${handedness ?? 'unknown'}`;
  const mat = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.7, metalness: 0.1 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xff7a2b, roughness: 0.6, emissive: 0x3a1200 });

  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.12), mat);
  palm.position.set(0, -0.01, 0.02);
  g.add(palm);
  const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.07, 0.05), accent);
  fingers.position.set(0, -0.045, -0.02);
  fingers.rotation.x = -0.4;
  g.add(fingers);
  const pointer = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 6), accent);
  pointer.rotation.x = Math.PI / 2;
  pointer.position.set(0, 0.01, -0.05);
  g.add(pointer);
  return g;
}
