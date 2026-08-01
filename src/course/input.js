/**
 * Input for the course preview: keyboard and mouse on the desktop, Quest
 * controllers in VR.
 *
 * This is deliberately separate from src/input/controls.js, which belongs to
 * the car. Nothing here touches the vehicle.
 */
import * as THREE from 'three';
import { clamp } from './util.js';

const PRESSED = new Set();

export class PreviewInput {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {HTMLElement} element usually the canvas
   */
  constructor(renderer, element) {
    this.renderer = renderer;
    this.element = element;

    this.throttle = 0;
    this.brake = 0;
    this.steer = 0;
    this.lift = 0;
    this.boost = false;
    this.lookYaw = 0;
    this.lookPitch = 0;

    this.events = { mode: false, reset: false, marker: false, ride: false, recentre: false };
    this._edge = new Map();

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      PRESSED.add(e.code);
      if (e.code === 'KeyM') this.events.mode = true;
      if (e.code === 'KeyR') this.events.reset = true;
      if (e.code === 'KeyP') this.events.marker = true;
      if (e.code === 'KeyT') this.events.ride = true;
      if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => PRESSED.delete(e.code));
    addEventListener('blur', () => PRESSED.clear());

    // Pointer-lock mouse look, desktop only.
    element.addEventListener('click', () => {
      if (!renderer.xr.isPresenting && document.pointerLockElement !== element) {
        element.requestPointerLock?.();
      }
    });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== element) return;
      this.lookYaw -= e.movementX * 0.0022;
      this.lookPitch = clamp(this.lookPitch - e.movementY * 0.0022, -1.2, 1.2);
    });

    this.controllers = [0, 1].map((i) => renderer.xr.getController(i));
    this.grips = [0, 1].map((i) => renderer.xr.getControllerGrip(i));
  }

  /** True on the frame a controller button goes down. */
  _once(key, down) {
    const was = this._edge.get(key) ?? false;
    this._edge.set(key, down);
    return down && !was;
  }

  update() {
    const key = (code) => PRESSED.has(code);

    /* -- keyboard --------------------------------------------------------- */
    let throttle = key('KeyW') || key('ArrowUp') ? 1 : 0;
    let brake = key('KeyS') || key('ArrowDown') ? 1 : 0;
    let steer = (key('KeyD') || key('ArrowRight') ? 1 : 0) - (key('KeyA') || key('ArrowLeft') ? 1 : 0);
    let lift = (key('KeyE') || key('Space') ? 1 : 0) - (key('KeyQ') || key('ShiftLeft') ? 1 : 0);
    this.boost = key('ShiftRight') || key('KeyB');

    /* -- XR controllers --------------------------------------------------- */
    if (this.renderer.xr.isPresenting) {
      const session = this.renderer.xr.getSession();
      for (const source of session?.inputSources ?? []) {
        const pad = source.gamepad;
        if (!pad) continue;
        const right = source.handedness === 'right';
        const trigger = pad.buttons[0]?.value ?? 0;
        const grip = pad.buttons[1]?.value ?? 0;
        const stickX = pad.axes[2] ?? pad.axes[0] ?? 0;
        const stickY = pad.axes[3] ?? pad.axes[1] ?? 0;

        if (right) {
          throttle = Math.max(throttle, trigger);
          steer = Math.abs(stickX) > 0.12 ? stickX : steer;
          lift = Math.abs(stickY) > 0.2 ? -stickY : lift;
          if (this._once('a', pad.buttons[4]?.pressed)) this.events.mode = true;
          if (this._once('b', pad.buttons[5]?.pressed)) this.events.reset = true;
          this.boost = this.boost || grip > 0.6;
        } else {
          brake = Math.max(brake, trigger);
          if (Math.abs(stickY) > 0.2 && !right) lift = -stickY;
          if (this._once('x', pad.buttons[4]?.pressed)) this.events.marker = true;
          if (this._once('y', pad.buttons[5]?.pressed)) this.events.recentre = true;
          if (this._once('lstick', pad.buttons[3]?.pressed)) this.events.ride = true;
        }
      }
    }

    this.throttle = clamp(throttle, 0, 1);
    this.brake = clamp(brake, 0, 1);
    this.steer = clamp(steer, -1, 1);
    this.lift = clamp(lift, -1, 1);
  }

  /** Consume the one-shot events. */
  takeEvents() {
    const out = { ...this.events };
    for (const k of Object.keys(this.events)) this.events[k] = false;
    return out;
  }
}
