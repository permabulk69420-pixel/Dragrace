import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { createCar } from "./car.js";
import { EngineAudio } from "./engine-audio.js";
import { VehicleSimulation } from "./vehicle.js";
import { createWorld } from "./world.js";

const FIXED_STEP = 1 / 120;
const QUARTER_MILE = 402.336;

class RaceController {
  constructor() {
    this.reset();
  }

  reset() {
    this.phase = "ready";
    this.countdown = 0;
    this.raceTime = 0;
    this.finishTime = null;
    this.topSpeed = 0;
    this.canLaunch = false;
    this.lights = { amberRows: 0, green: false, red: false };
    this.label = "HOLD THROTTLE TO STAGE";
    this.timeText = "0.000";
    this.statusColor = "#8a96a8";
  }

  step(delta, vehicle, input) {
    this.topSpeed = Math.max(this.topSpeed, vehicle.speed * 3.6);
    if (this.phase === "ready" && input.throttle > 0.12) {
      this.phase = "countdown";
      this.countdown = 0;
      this.label = "STAGED";
      this.statusColor = "#ffb335";
    }

    if (this.phase === "countdown") {
      this.countdown += delta;
      if (this.countdown < 0.55) {
        this.lights = { amberRows: 0, green: false, red: false };
        this.label = "BUILD REVS";
      } else if (this.countdown < 0.88) {
        this.lights = { amberRows: 1, green: false, red: false };
        this.label = "STAGED";
      } else if (this.countdown < 1.21) {
        this.lights = { amberRows: 2, green: false, red: false };
      } else if (this.countdown < 1.54) {
        this.lights = { amberRows: 3, green: false, red: false };
      } else {
        this.phase = "running";
        this.canLaunch = true;
        this.lights = { amberRows: 0, green: true, red: false };
        this.label = "GO";
        this.statusColor = "#20f27b";
      }
    } else if (this.phase === "running") {
      this.canLaunch = true;
      this.raceTime += delta;
      this.timeText = this.raceTime.toFixed(3);
      if (vehicle.rpm > 7350) {
        this.label = "SHIFT NOW";
        this.statusColor = "#ff315c";
      } else {
        this.label = `${Math.max(0, QUARTER_MILE - vehicle.distance).toFixed(0)} M TO FINISH`;
        this.statusColor = "#20f27b";
      }
    } else if (this.phase === "finished") {
      this.canLaunch = true;
      this.label = `${this.finishTime.toFixed(3)} S  //  ${Math.round(this.topSpeed)} KM/H`;
      this.timeText = this.finishTime.toFixed(3);
      this.statusColor = "#22d6d0";
    }
  }

  observe(vehicle) {
    if (this.phase === "running" && vehicle.distance >= QUARTER_MILE) {
      this.phase = "finished";
      this.finishTime = this.raceTime;
      this.label = "FINISH";
      this.statusColor = "#22d6d0";
    }
  }
}

class InputManager {
  constructor(root) {
    this.root = root;
    this.keys = new Set();
    this.touch = { throttle: 0, brake: 0, left: 0, right: 0 };
    this.actions = { shiftUp: false, shiftDown: false, reset: false, camera: false, doors: false };
    this.xrPreviousButtons = new Map();
    this.cleanups = [];

    const keyDown = (event) => {
      this.keys.add(event.code);
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) event.preventDefault();
      if (!event.repeat) {
        if (["Space", "KeyE"].includes(event.code)) this.actions.shiftUp = true;
        if (event.code === "KeyQ") this.actions.shiftDown = true;
        if (event.code === "KeyR") this.actions.reset = true;
        if (event.code === "KeyC") this.actions.camera = true;
        if (event.code === "KeyO") this.actions.doors = true;
      }
    };
    const keyUp = (event) => this.keys.delete(event.code);
    window.addEventListener("keydown", keyDown, { passive: false });
    window.addEventListener("keyup", keyUp);
    this.cleanups.push(() => window.removeEventListener("keydown", keyDown));
    this.cleanups.push(() => window.removeEventListener("keyup", keyUp));

    root.querySelectorAll("[data-hold]").forEach((button) => {
      const action = button.dataset.hold;
      const down = (event) => {
        event.preventDefault();
        button.setPointerCapture?.(event.pointerId);
        this.touch[action] = 1;
        button.classList.add("is-active");
      };
      const up = (event) => {
        event.preventDefault();
        this.touch[action] = 0;
        button.classList.remove("is-active");
      };
      button.addEventListener("pointerdown", down);
      button.addEventListener("pointerup", up);
      button.addEventListener("pointercancel", up);
      button.addEventListener("lostpointercapture", up);
      this.cleanups.push(() => {
        button.removeEventListener("pointerdown", down);
        button.removeEventListener("pointerup", up);
        button.removeEventListener("pointercancel", up);
        button.removeEventListener("lostpointercapture", up);
      });
    });

    root.querySelectorAll("[data-action]").forEach((button) => {
      const click = () => {
        this.actions[button.dataset.action] = true;
      };
      button.addEventListener("click", click);
      this.cleanups.push(() => button.removeEventListener("click", click));
    });
  }

  readXR(renderer) {
    const session = renderer.xr.getSession();
    const xr = { throttle: 0, brake: 0, steer: 0 };
    if (!session) return xr;
    for (const source of session.inputSources) {
      const gamepad = source.gamepad;
      if (!gamepad) continue;
      const handedness = source.handedness || "unknown";
      const trigger = gamepad.buttons[0]?.value ?? 0;
      if (handedness === "right") xr.throttle = Math.max(xr.throttle, trigger);
      if (handedness === "left") xr.brake = Math.max(xr.brake, trigger);

      const horizontalAxis = gamepad.axes.length >= 4
        ? gamepad.axes[2]
        : gamepad.axes[0] ?? 0;
      if (handedness === "left" && Math.abs(horizontalAxis) > 0.12) xr.steer = horizontalAxis;

      const buttonA = gamepad.buttons[4]?.pressed ?? false;
      const buttonB = gamepad.buttons[5]?.pressed ?? false;
      const previousA = this.xrPreviousButtons.get(`${handedness}-4`) ?? false;
      const previousB = this.xrPreviousButtons.get(`${handedness}-5`) ?? false;
      if (buttonA && !previousA) {
        if (handedness === "right") this.actions.shiftUp = true;
        if (handedness === "left") this.actions.shiftDown = true;
      }
      if (buttonB && !previousB) {
        if (handedness === "right") this.actions.reset = true;
        if (handedness === "left") this.actions.camera = true;
      }
      this.xrPreviousButtons.set(`${handedness}-4`, buttonA);
      this.xrPreviousButtons.set(`${handedness}-5`, buttonB);
    }
    return xr;
  }

  read(renderer) {
    const xr = this.readXR(renderer);
    const keyboardThrottle = this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0;
    const keyboardBrake = this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0;
    const keyboardSteer = (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0)
      - (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0);
    return {
      throttle: Math.max(keyboardThrottle, this.touch.throttle, xr.throttle),
      brake: Math.max(keyboardBrake, this.touch.brake, xr.brake),
      steer: THREE.MathUtils.clamp(keyboardSteer + this.touch.right - this.touch.left + xr.steer, -1, 1),
    };
  }

  consume(action) {
    const active = Boolean(this.actions[action]);
    this.actions[action] = false;
    return active;
  }

  dispose() {
    this.cleanups.forEach((cleanup) => cleanup());
  }
}

function createShell(container) {
  container.innerHTML = `
    <div class="drag-race-app">
      <div class="race-renderer" data-renderer></div>
      <div class="race-vignette" aria-hidden="true"></div>
      <header class="race-header">
        <div class="brand-lockup">
          <span class="brand-mark">A9</span>
          <div>
            <strong>APEX R-9</strong>
            <span>QUARTER MILE DEVELOPMENT RUN</span>
          </div>
        </div>
        <div class="race-readout" aria-live="polite">
          <span data-race-label>HOLD THROTTLE TO STAGE</span>
          <strong data-race-time>0.000</strong>
        </div>
      </header>

      <aside class="telemetry-card">
        <div><span>SPEED</span><strong><b data-speed>000</b> km/h</strong></div>
        <div><span>GEAR</span><strong data-gear>1</strong></div>
        <div><span>ENGINE</span><strong><b data-rpm>0900</b> rpm</strong></div>
        <div><span>DISTANCE</span><strong><b data-distance>0.0</b> / 402.3 m</strong></div>
        <div class="rpm-strip"><i data-rpm-strip></i></div>
      </aside>

      <div class="launch-callout" data-callout>
        <span>READY</span>
        <strong>Hold throttle to stage</strong>
        <small>Shift before 7,800 rpm</small>
      </div>

      <nav class="race-actions" aria-label="Game actions">
        <button type="button" data-action="camera" data-camera-label>VIEW: COCKPIT</button>
        <button type="button" data-action="doors">DOORS</button>
        <button type="button" data-export>EXPORT CAR GLB</button>
        <button type="button" data-action="reset">RESET RUN</button>
        <span data-vr-button></span>
      </nav>

      <div class="touch-controls" aria-label="Touch driving controls">
        <div class="touch-steer">
          <button type="button" data-hold="left" aria-label="Steer left">◀</button>
          <button type="button" data-hold="right" aria-label="Steer right">▶</button>
        </div>
        <div class="touch-shift">
          <button type="button" data-action="shiftDown" aria-label="Shift down">−</button>
          <span>SHIFT</span>
          <button type="button" data-action="shiftUp" aria-label="Shift up">+</button>
        </div>
        <div class="touch-pedals">
          <button type="button" data-hold="brake">BRAKE</button>
          <button type="button" data-hold="throttle">THROTTLE</button>
        </div>
      </div>

      <div class="control-hint">
        <span>WASD / ARROWS</span><span>SPACE SHIFT</span><span>C VIEW</span><span>R RESET</span>
      </div>
      <div class="loading-screen" data-loading>
        <div class="loading-logo">A9</div>
        <strong>ASSEMBLING APEX R-9</strong>
        <span>CODE-GENERATED VEHICLE // WEBXR</span>
      </div>
    </div>
  `;
  return container.querySelector(".drag-race-app");
}

function createControllerRay() {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  ]);
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color: 0xff315c, transparent: true, opacity: 0.68 }),
  );
  line.name = "Controller_Ray";
  line.scale.z = 2.2;
  return line;
}

function updateCamera(camera, rig, car, mode, time, isXR) {
  if (isXR) return;
  const target = new THREE.Vector3(0, 0.78, 0);
  if (mode === "cockpit") {
    camera.position.copy(car.driverEye);
    camera.rotation.set(-0.015, 0, 0);
    return;
  }
  if (mode === "chase") {
    camera.position.set(0, 2.05, 5.65);
    target.set(0, 0.75, -1.15);
  } else {
    const angle = time * 0.23;
    camera.position.set(Math.sin(angle) * 5.2, 1.7 + Math.sin(time * 0.31) * 0.25, Math.cos(angle) * 5.2);
    target.set(0, 0.72, 0);
  }
  const lookAtMatrix = new THREE.Matrix4().lookAt(camera.position, target, new THREE.Vector3(0, 1, 0));
  camera.quaternion.setFromRotationMatrix(lookAtMatrix);
  rig.updateMatrixWorld(true);
}

function updateOverlay(shell, vehicle, race, cameraMode, now) {
  shell.querySelector("[data-speed]").textContent = String(Math.round(vehicle.speed * 3.6)).padStart(3, "0");
  shell.querySelector("[data-gear]").textContent = vehicle.gear;
  shell.querySelector("[data-rpm]").textContent = String(Math.round(vehicle.rpm)).padStart(4, "0");
  shell.querySelector("[data-distance]").textContent = vehicle.distance.toFixed(1);
  shell.querySelector("[data-race-label]").textContent = race.label;
  shell.querySelector("[data-race-time]").textContent = race.timeText;
  shell.querySelector("[data-rpm-strip]").style.transform = `scaleX(${THREE.MathUtils.clamp((vehicle.rpm - 800) / 7000, 0, 1)})`;
  shell.querySelector("[data-rpm-strip]").classList.toggle("is-shift", vehicle.rpm > 7350);
  shell.querySelector("[data-camera-label]").textContent = `VIEW: ${cameraMode.toUpperCase()}`;

  const callout = shell.querySelector("[data-callout]");
  callout.classList.toggle("is-hidden", race.phase === "running" && now > 4);
  const calloutTitle = callout.querySelector("span");
  const calloutMain = callout.querySelector("strong");
  const calloutSmall = callout.querySelector("small");
  if (race.phase === "ready") {
    calloutTitle.textContent = "READY";
    calloutMain.textContent = "Hold throttle to stage";
    calloutSmall.textContent = "Shift before 7,800 rpm";
  } else if (race.phase === "countdown") {
    calloutTitle.textContent = "STAGED";
    calloutMain.textContent = "Build revs — wait for green";
    calloutSmall.textContent = "Right trigger throttle // A shift";
  } else if (race.phase === "running" && vehicle.rpm > 7350) {
    callout.classList.remove("is-hidden");
    calloutTitle.textContent = "REDLINE";
    calloutMain.textContent = "SHIFT NOW";
    calloutSmall.textContent = "Keep it in the power band";
  } else if (race.phase === "finished") {
    callout.classList.remove("is-hidden");
    calloutTitle.textContent = "QUARTER MILE";
    calloutMain.textContent = `${race.finishTime.toFixed(3)} seconds`;
    calloutSmall.textContent = `Top speed ${Math.round(race.topSpeed)} km/h`;
  }
}

async function exportCarGlb(car, button) {
  const oldText = button.textContent;
  button.disabled = true;
  button.textContent = "BUILDING GLB…";
  try {
    const exportRoot = car.root.clone(true);
    exportRoot.position.set(0, 0, 0);
    exportRoot.rotation.set(0, 0, 0);
    exportRoot.name = "Apex_R9_Reusable_Vehicle";
    exportRoot.userData.exportedFrom = "Drag Race VR";
    exportRoot.updateMatrixWorld(true);
    const exporter = new GLTFExporter();
    const result = await exporter.parseAsync(exportRoot, {
      binary: true,
      onlyVisible: true,
      trs: true,
      maxTextureSize: 1024,
    });
    const blob = new Blob([result], { type: "model/gltf-binary" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "apex-r9-drag-coupe.glb";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    button.textContent = "GLB DOWNLOADED";
  } catch (error) {
    console.error("GLB export failed", error);
    button.textContent = "EXPORT FAILED";
  } finally {
    setTimeout(() => {
      button.disabled = false;
      button.textContent = oldText;
    }, 1800);
  }
}

export async function mountDragRace(container) {
  const shell = createShell(container);
  const rendererHost = shell.querySelector("[data-renderer]");
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.55));
  renderer.setSize(rendererHost.clientWidth || window.innerWidth, rendererHost.clientHeight || window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local-floor");
  renderer.xr.setFramebufferScaleFactor(1);
  rendererHost.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.name = "Drag_Race_VR_Scene";
  scene.background = new THREE.Color(0x02040a);
  scene.fog = new THREE.Fog(0x02040a, 105, 830);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentTarget = pmrem.fromScene(new RoomEnvironment(), 0.035);
  scene.environment = environmentTarget.texture;
  pmrem.dispose();

  const hemisphere = new THREE.HemisphereLight(0x7589a9, 0x080910, 1.2);
  hemisphere.name = "Night_Ambient";
  scene.add(hemisphere);
  const moon = new THREE.DirectionalLight(0xb9d0f4, 2.7);
  moon.name = "Moon_Key_Light";
  moon.position.set(-12, 22, 16);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.left = -15;
  moon.shadow.camera.right = 15;
  moon.shadow.camera.top = 15;
  moon.shadow.camera.bottom = -15;
  moon.shadow.camera.near = 1;
  moon.shadow.camera.far = 65;
  moon.shadow.bias = -0.0004;
  scene.add(moon);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.035, 1200);
  camera.name = "Driver_Camera";
  const playerRig = new THREE.Group();
  playerRig.name = "Driver_Tracking_Rig";
  playerRig.add(camera);
  scene.add(playerRig);

  const world = createWorld(scene);
  const car = createCar({ renderer });
  scene.add(car.root);
  const vehicle = new VehicleSimulation();
  const race = new RaceController();
  const engineAudio = new EngineAudio();
  const input = new InputManager(shell);

  for (let index = 0; index < 2; index += 1) {
    const controller = renderer.xr.getController(index);
    controller.name = `XR_Controller_${index + 1}`;
    controller.add(createControllerRay());
    playerRig.add(controller);
  }

  const vrButton = VRButton.createButton(renderer, {
    requiredFeatures: ["local-floor"],
    optionalFeatures: ["bounded-floor", "hand-tracking"],
  });
  vrButton.classList.add("enter-vr-button");
  shell.querySelector("[data-vr-button]").appendChild(vrButton);

  let cameraMode = "cockpit";
  const cameraModes = ["cockpit", "chase", "inspect"];
  let doorsOpen = false;
  let xrCalibrationPending = false;
  let xrCalibrated = false;
  const xrOffset = new THREE.Vector3();
  const trackedWorld = new THREE.Vector3();
  let accumulator = 0;
  let previousTime = performance.now() / 1000;
  let overlayTimer = 0;
  let disposed = false;

  function resetRun() {
    vehicle.reset();
    race.reset();
    doorsOpen = false;
    car.setDoorsOpen(0);
    xrCalibrationPending = renderer.xr.isPresenting;
    xrCalibrated = false;
    xrOffset.set(0, 0, 0);
  }

  function cycleCamera() {
    if (renderer.xr.isPresenting) return;
    const next = (cameraModes.indexOf(cameraMode) + 1) % cameraModes.length;
    cameraMode = cameraModes[next];
  }

  const exportButton = shell.querySelector("[data-export]");
  const onExport = () => exportCarGlb(car, exportButton);
  exportButton.addEventListener("click", onExport);

  const wakeAudio = () => engineAudio.start();
  renderer.domElement.addEventListener("pointerdown", wakeAudio, { once: true });
  shell.querySelectorAll("button").forEach((button) => button.addEventListener("pointerdown", wakeAudio, { once: true }));

  renderer.xr.addEventListener("sessionstart", () => {
    cameraMode = "cockpit";
    xrCalibrationPending = true;
    xrCalibrated = false;
    xrOffset.set(0, 0, 0);
    shell.classList.add("is-xr");
    engineAudio.start();
  });
  renderer.xr.addEventListener("sessionend", () => {
    shell.classList.remove("is-xr");
    xrCalibrationPending = false;
    xrCalibrated = false;
    xrOffset.set(0, 0, 0);
  });

  function resize() {
    const width = rendererHost.clientWidth || window.innerWidth;
    const height = rendererHost.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(rendererHost);
  window.addEventListener("resize", resize);
  resize();

  car.update(vehicle, race, 0, 0);
  world.update(race);
  shell.querySelector("[data-loading]").classList.add("is-done");

  renderer.setAnimationLoop((milliseconds) => {
    if (disposed) return;
    const time = milliseconds / 1000;
    const frameDelta = Math.min(0.1, Math.max(0, time - previousTime));
    previousTime = time;
    const currentInput = input.read(renderer);

    if (input.consume("shiftUp")) vehicle.shiftUp();
    if (input.consume("shiftDown")) vehicle.shiftDown();
    if (input.consume("reset")) resetRun();
    if (input.consume("camera")) cycleCamera();
    if (input.consume("doors") && vehicle.speed < 0.3 && !renderer.xr.isPresenting) {
      doorsOpen = !doorsOpen;
      car.setDoorsOpen(doorsOpen ? 1 : 0);
      if (doorsOpen) cameraMode = "inspect";
    }

    accumulator += frameDelta;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 15) {
      race.step(FIXED_STEP, vehicle, currentInput);
      vehicle.step(FIXED_STEP, currentInput, race.canLaunch);
      race.observe(vehicle);
      accumulator -= FIXED_STEP;
      steps += 1;
    }

    car.update(vehicle, race, frameDelta, time);
    world.update(race);
    engineAudio.update(vehicle);

    playerRig.position.copy(vehicle.position);
    playerRig.position.y = 0;
    playerRig.rotation.y = vehicle.yaw;
    if (renderer.xr.isPresenting && xrCalibrated) {
      const rotatedOffset = xrOffset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), vehicle.yaw);
      playerRig.position.add(rotatedOffset);
    }
    updateCamera(camera, playerRig, car, cameraMode, time, renderer.xr.isPresenting);
    playerRig.updateMatrixWorld(true);

    if (renderer.xr.isPresenting && xrCalibrationPending) {
      const xrCamera = renderer.xr.getCamera(camera);
      xrCamera.getWorldPosition(trackedWorld);
      const trackedLocal = playerRig.worldToLocal(trackedWorld.clone());
      if (trackedLocal.y > 0.25) {
        xrOffset.copy(car.driverEye).sub(trackedLocal);
        xrCalibrationPending = false;
        xrCalibrated = true;
      }
    }

    overlayTimer += frameDelta;
    if (overlayTimer >= 0.05) {
      updateOverlay(shell, vehicle, race, cameraMode, time);
      overlayTimer = 0;
    }
    renderer.render(scene, camera);
  });

  return () => {
    disposed = true;
    renderer.setAnimationLoop(null);
    input.dispose();
    engineAudio.dispose();
    exportButton.removeEventListener("click", onExport);
    resizeObserver.disconnect();
    window.removeEventListener("resize", resize);
    environmentTarget.dispose();
    scene.traverse((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
      else object.material?.dispose?.();
    });
    renderer.dispose();
    container.innerHTML = "";
  };
}

