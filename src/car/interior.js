/**
 * Cockpit. This is what the player actually looks at in VR, so it gets the
 * detail: dash, live instruments, roll cage, buckets with harnesses, pedals,
 * shifter and a timing screen.
 *
 * Moving parts are exposed through `parts` with their pivots already correct:
 *   steeringWheel  rotates about its own Z (the column axis)
 *   shifter        rotates about X at the base of the lever
 *   pedals.*       rotate about X at the top hinge
 *   needles.*      rotate about Z at the centre of the dial
 */
import * as THREE from 'three';
import { roundedBox, panel, tube, loft, mesh, group, mergeStatic, bakeInto } from './geom.js';
import { SPEC } from './spec.js';
import { gaugeTexture, createDashScreen } from './gauges.js';

const DRIVER_X = SPEC.eyePoint.x;      // -0.38, left-hand drive
const PASSENGER_X = -DRIVER_X;
const FLOOR_Y = 0.30;

/* -------------------------------------------------------------------------- */

/** Floor pan, tunnel, firewall and rear bulkhead: the shell of the cockpit. */
function tub(M) {
  const g = group('Tub');

  const floor = mesh(roundedBox(1.56, 0.04, 1.74, 0.02), M.carpet, 'FloorPan', { cast: false, receive: true });
  floor.position.set(0, FLOOR_Y, 0.10);
  g.add(floor);

  // Transmission tunnel down the middle.
  const tunnelGeo = loft(
    [
      { z: -0.72, pts: tunnelSection(0.20, 0.30) },
      { z: -0.20, pts: tunnelSection(0.19, 0.28) },
      { z: 0.40, pts: tunnelSection(0.17, 0.24) },
      { z: 0.92, pts: tunnelSection(0.16, 0.20) },
    ],
    { closed: true, capStart: true, capEnd: true, name: 'tunnel' }
  );
  g.add(mesh(tunnelGeo, M.satin, 'TransmissionTunnel', { cast: false }));

  const firewall = mesh(roundedBox(1.62, 0.72, 0.05, 0.02), M.satin, 'Firewall', { cast: false });
  firewall.position.set(0, 0.66, -0.74);
  g.add(firewall);

  const bulkhead = mesh(roundedBox(1.60, 0.66, 0.05, 0.02), M.satin, 'RearBulkhead', { cast: false });
  bulkhead.position.set(0, 0.68, 0.98);
  g.add(bulkhead);

  // Fuel cell and battery box behind the bulkhead, visible through the cage.
  const cell = mesh(roundedBox(0.62, 0.30, 0.42, 0.03), M.blackAlloy, 'FuelCell');
  cell.position.set(0.22, 0.55, 1.30);
  g.add(cell);
  const battery = mesh(roundedBox(0.28, 0.22, 0.20, 0.02), M.harness, 'Battery');
  battery.position.set(-0.34, 0.50, 1.30);
  g.add(battery);

  // Door cards, angled to follow the body side.
  for (const s of [-1, 1]) {
    const card = mesh(roundedBox(0.05, 0.62, 1.30, 0.03), M.leather, `DoorCard_${s < 0 ? 'L' : 'R'}`, { cast: false });
    card.position.set(s * 0.795, 0.70, 0.0);
    card.rotation.z = s * 0.06;
    g.add(card);

    const armrest = mesh(roundedBox(0.12, 0.09, 0.52, 0.035), M.suede, `Armrest_${s < 0 ? 'L' : 'R'}`);
    armrest.position.set(s * 0.735, 0.86, 0.02);
    g.add(armrest);

    const grille = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 16), M.matte, `Speaker_${s < 0 ? 'L' : 'R'}`);
    grille.rotation.z = Math.PI / 2;
    grille.position.set(s * 0.775, 0.56, -0.28);
    g.add(grille);

    // Pull strap instead of a door handle, like a stripped race car.
    const strap = mesh(roundedBox(0.02, 0.16, 0.05, 0.008), M.harness, `PullStrap_${s < 0 ? 'L' : 'R'}`);
    strap.position.set(s * 0.755, 0.90, -0.30);
    g.add(strap);
  }
  return bakeInto(g);
}

function tunnelSection(halfWidth, height) {
  const pts = [];
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = -halfWidth + t * halfWidth * 2;
    const y = FLOOR_Y + Math.cos((x / halfWidth) * Math.PI * 0.5) * height;
    pts.push([x, y]);
  }
  pts.push([halfWidth, FLOOR_Y - 0.02], [-halfWidth, FLOOR_Y - 0.02]);
  return pts.reverse();
}

/* -------------------------------------------------------------------------- */

/** Dash, binnacle, instruments and the timing screen. */
function dashboard(M, parts) {
  const g = group('Dashboard');

  // Main dash: a lofted surface so it wraps around the cockpit.
  const dashGeo = loft(
    [
      { z: -0.86, pts: dashSection(0.86, 0.60, 0.99) },
      { z: -0.70, pts: dashSection(0.86, 0.62, 1.01) },
      { z: -0.56, pts: dashSection(0.84, 0.68, 0.99) },
      { z: -0.48, pts: dashSection(0.80, 0.74, 0.93) },
    ],
    { closed: true, capStart: true, capEnd: true, name: 'dash' }
  );
  g.add(mesh(dashGeo, M.suede, 'DashTop', { cast: false }));

  // The dash is a solid wedge: everything the driver reads or reaches has to sit
  // on its rear face (about z = -0.47, y 0.66..0.94) or on a pod above its top
  // edge, otherwise it ends up buried inside the dash and invisible.
  const FACE_Z = -0.465;

  // Compact backing pod for the three main dials. It deliberately has no visor
  // or horizontal shelf projecting above the instruments.
  const podShell = mesh(roundedBox(0.46, 0.17, 0.13, 0.045), M.matte, 'ClusterPod', { cast: false });
  podShell.position.set(DRIVER_X, 0.995, -0.585);
  podShell.rotation.x = -0.35;
  g.add(podShell);

  /**
   * Mount a dial. The can and the cover glass are parented to the dash so they
   * merge with the rest of it; only the face and the needle - which has to
   * rotate about the centre of the dial - keep their own nodes.
   */
  const dial = (name, x, y, z, radius, texture, tilt) => {
    const holder = group(`Gauge_${name}`);
    holder.position.set(x, y, z);
    holder.rotation.x = tilt;

    const place = (m, dz, extraTilt = 0) => {
      m.position.set(x, y, z).add(new THREE.Vector3(0, 0, dz).applyEuler(holder.rotation));
      m.rotation.set(holder.rotation.x + extraTilt, holder.rotation.y, holder.rotation.z);
      return m;
    };

    const can = mesh(new THREE.CylinderGeometry(radius, radius, 0.05, 24), M.matte, `${name}Can`);
    g.add(place(can, -0.03, Math.PI / 2));

    const faceMat = texture
      ? new THREE.MeshStandardMaterial({ name: `${name}Face`, map: texture, roughness: 0.7, metalness: 0 })
      : M.gauge;
    const face = mesh(new THREE.CircleGeometry(radius * 0.96, 28), faceMat, `${name}Face`, { cast: false });
    holder.add(face);

    const needle = group(`Needle_${name}`);
    needle.position.z = 0.006;
    const blade = mesh(roundedBox(0.011, radius * 1.42, 0.006, 0.004), M.needle, `${name}Blade`, { cast: false });
    blade.position.y = radius * 0.46;
    needle.add(blade);
    const hub = mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 12), M.blackAlloy, `${name}Hub`, { cast: false });
    hub.rotation.x = Math.PI / 2;
    hub.position.z = 0.006;
    needle.add(hub);
    holder.add(needle);

    g.add(place(mesh(new THREE.CircleGeometry(radius, 28), M.glass, `${name}Glass`, { cast: false }), 0.012, 0));

    parts.needles[name] = needle;
    return holder;
  };

  const tilt = -0.35;
  g.add(dial('tacho', DRIVER_X, 1.005, -0.500, 0.068,
    gaugeTexture({ max: 8000, step: 1000, redline: 7000, label: 'RPM', unit: 'x1000', divisor: 1000 }), tilt));
  g.add(dial('speedo', DRIVER_X + 0.155, 0.987, -0.508, 0.048,
    gaugeTexture({ max: 240, step: 40, label: 'MPH' }), tilt));
  g.add(dial('boost', DRIVER_X - 0.148, 0.987, -0.508, 0.042,
    gaugeTexture({ max: 30, step: 5, redline: 26, label: 'BOOST', unit: 'psi' }), tilt));

  // Auxiliary gauges hang under the dash on the console, angled up at the driver.
  const podBody = mesh(roundedBox(0.24, 0.09, 0.06, 0.02), M.matte, 'AuxPodBody');
  podBody.position.set(0.085, 0.672, -0.435);
  podBody.rotation.x = -0.9;
  g.add(podBody);
  g.add(dial('oil', 0.020, 0.700, -0.425, 0.034,
    gaugeTexture({ max: 100, step: 25, label: 'OIL' }), -0.9));
  g.add(dial('water', 0.150, 0.700, -0.425, 0.034,
    gaugeTexture({ max: 260, step: 60, label: 'TEMP' }), -0.9));

  // Timing screen.
  const screen = createDashScreen();
  parts.dashScreen = screen;
  const screenMat = screen.texture
    ? new THREE.MeshBasicMaterial({ map: screen.texture, toneMapped: false })
    : M.screen;
  const panelMesh = mesh(new THREE.PlaneGeometry(0.26, 0.13), screenMat, 'TimingScreen', { cast: false });
  panelMesh.position.set(0.330, 0.868, FACE_Z + 0.028);
  panelMesh.rotation.x = -0.30;
  panelMesh.rotation.y = -0.34;
  g.add(panelMesh);
  const bezel = mesh(roundedBox(0.30, 0.17, 0.03, 0.015), M.blackAlloy, 'ScreenBezel');
  bezel.position.set(0.334, 0.866, FACE_Z + 0.010);
  bezel.rotation.x = -0.30;
  bezel.rotation.y = -0.34;
  g.add(bezel);

  // Switch panel: toggles, ignition and the launch button.
  const switchPanel = mesh(roundedBox(0.30, 0.11, 0.03, 0.01), M.blackAlloy, 'SwitchPanel');
  switchPanel.position.set(-0.02, 0.760, FACE_Z + 0.012);
  switchPanel.rotation.x = -0.22;
  g.add(switchPanel);
  for (let i = 0; i < 4; i++) {
    const t = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.045, 8), M.chrome, `Toggle${i}`);
    t.position.set(-0.10 + i * 0.052, 0.772, FACE_Z + 0.030);
    t.rotation.x = -0.5;
    g.add(t);
    const guard = mesh(roundedBox(0.03, 0.02, 0.02, 0.006), M.harness, `ToggleGuard${i}`);
    guard.position.set(-0.10 + i * 0.052, 0.744, FACE_Z + 0.028);
    g.add(guard);
  }
  const start = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 16), M.harness, 'StartButton');
  start.rotation.x = Math.PI / 2 - 0.22;
  start.position.set(0.085, 0.762, FACE_Z + 0.030);
  g.add(start);

  // Vents.
  for (const x of [-0.70, 0.62]) {
    const vent = mesh(roundedBox(0.17, 0.075, 0.03, 0.012), M.matte, `Vent${x}`);
    vent.position.set(x, 0.855, FACE_Z + 0.008);
    vent.rotation.x = -0.15;
    g.add(vent);
    for (let i = 0; i < 3; i++) {
      const fin = mesh(roundedBox(0.155, 0.008, 0.02, 0.003), M.satin, `VentFin${x}_${i}`);
      fin.position.set(x, 0.833 + i * 0.022, FACE_Z + 0.024);
      fin.rotation.x = -0.4;
      g.add(fin);
    }
  }

  // Rear-view mirror hanging off the header rail.
  const mirror = group('RearViewMirror');
  mirror.position.set(0, 1.33, -0.36);
  const stalk = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 8), M.matte, 'MirrorStalk');
  stalk.rotation.x = 0.4;
  mirror.add(stalk);
  const body = mesh(roundedBox(0.25, 0.065, 0.028, 0.016), M.matte, 'MirrorBody');
  body.position.set(0, -0.06, 0.01);
  mirror.add(body);
  const glass = mesh(panel(0.235, 0.05, 0.008, 0.004), M.chrome, 'MirrorFace', { cast: false });
  glass.position.set(0, -0.06, 0.03);
  mirror.add(glass);
  g.add(mirror);

  return bakeInto(g, (o) => o.name.startsWith('Gauge_') || o.name === 'TimingScreen');
}

function dashSection(halfWidth, front, top) {
  // Cross-section of the dash: a rounded wedge, wider at the top. Listed from
  // the top down and reversed so the ring comes out counter-clockwise.
  return [
    [-halfWidth, front],
    [-halfWidth * 0.98, top - 0.05],
    [-halfWidth * 0.82, top],
    [0, top + 0.012],
    [halfWidth * 0.82, top],
    [halfWidth * 0.98, top - 0.05],
    [halfWidth, front],
    [halfWidth * 0.9, front - 0.06],
    [0, front - 0.08],
    [-halfWidth * 0.9, front - 0.06],
  ].reverse();
}

/* -------------------------------------------------------------------------- */

/** Steering wheel on its column. The wheel node itself is the steering pivot. */
function steering(M, parts) {
  const g = group('SteeringAssembly');
  const columnAngle = -0.36;

  const column = mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.34, 12), M.matte, 'SteeringColumn');
  column.position.set(DRIVER_X, 0.812, -0.565);
  column.rotation.x = Math.PI / 2 + columnAngle;
  g.add(column);

  const wheel = group('SteeringWheel');
  wheel.position.set(DRIVER_X, 0.868, -0.420);
  wheel.rotation.x = columnAngle;
  parts.steeringWheel = wheel;
  parts.steeringWheelWorldRadius = 0.175;

  const rim = mesh(new THREE.TorusGeometry(0.175, 0.021, 12, 40), M.suede, 'WheelRim');
  wheel.add(rim);

  // Flat bottom, formed by a chord of thicker grip.
  const flat = mesh(roundedBox(0.20, 0.028, 0.042, 0.014), M.suede, 'WheelFlatBottom');
  flat.position.y = -0.166;
  wheel.add(flat);

  for (let i = 0; i < 3; i++) {
    const a = i === 0 ? Math.PI / 2 : i === 1 ? Math.PI * 1.18 : Math.PI * 1.82;
    const spoke = mesh(roundedBox(0.035, 0.15, 0.02, 0.008), M.blackAlloy, `WheelSpoke${i}`);
    spoke.position.set(Math.cos(a) * 0.085, Math.sin(a) * 0.085, -0.004);
    spoke.rotation.z = a - Math.PI / 2;
    wheel.add(spoke);
  }
  const hub = mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.05, 18), M.blackAlloy, 'WheelHub');
  hub.rotation.x = Math.PI / 2;
  hub.position.z = -0.02;
  wheel.add(hub);

  // Grip markers at 9 and 3, and a centre stripe at 12.
  for (const s of [-1, 1]) {
    const grip = mesh(new THREE.TorusGeometry(0.175, 0.026, 8, 12, 0.9), M.leather, `Grip_${s < 0 ? 'L' : 'R'}`);
    grip.rotation.z = s > 0 ? -0.45 : Math.PI - 0.45;
    wheel.add(grip);
  }
  const marker = mesh(roundedBox(0.02, 0.05, 0.03, 0.006), M.harness, 'CentreMarker');
  marker.position.set(0, 0.176, 0.006);
  wheel.add(marker);

  // Shift lights across the top of the hub.
  parts.shiftLights = [];
  for (let i = 0; i < 5; i++) {
    const colour = i < 3 ? 0x33ff66 : i < 4 ? 0xffcc33 : 0xff3322;
    const mat = new THREE.MeshStandardMaterial({
      name: `ShiftLight${i}`,
      color: 0x101010,
      emissive: colour,
      emissiveIntensity: 0,
      roughness: 0.4,
    });
    const led = mesh(new THREE.SphereGeometry(0.009, 10, 8), mat, `ShiftLight${i}`, { cast: false });
    led.position.set(-0.05 + i * 0.025, 0.055, 0.012);
    wheel.add(led);
    parts.shiftLights.push(mat);
  }

  bakeInto(wheel, (o) => o.name.startsWith('ShiftLight'));
  g.add(wheel);
  return bakeInto(g, (o) => o.name === 'SteeringWheel');
}

/** Pedal box: throttle, brake, clutch. Each hinges from the top. */
function pedals(M, parts) {
  const g = group('PedalBox');
  const make = (name, x, width) => {
    const hinge = group(`Pedal_${name}`);
    hinge.position.set(x, 0.60, -0.66);
    const arm = mesh(roundedBox(0.03, 0.22, 0.03, 0.01), M.blackAlloy, `${name}Arm`);
    arm.position.set(0, -0.11, 0.04);
    arm.rotation.x = -0.28;
    hinge.add(arm);
    const pad = mesh(roundedBox(width, 0.11, 0.02, 0.008), M.alloy, `${name}Pad`);
    pad.position.set(0, -0.215, 0.10);
    pad.rotation.x = -0.28;
    hinge.add(pad);
    // Drilled pedal pads.
    for (let i = 0; i < 4; i++) {
      const hole = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 8), M.matte, `${name}Hole${i}`, { cast: false });
      hole.rotation.x = Math.PI / 2 - 0.28;
      hole.position.set(-0.02 + (i % 2) * 0.04, 0.198 - 0.24 + (i > 1 ? -0.03 : 0.03), 0.104);
      hinge.add(hole);
    }
    bakeInto(hinge);
    parts.pedals[name] = hinge;
    g.add(hinge);
  };
  make('clutch', DRIVER_X - 0.20, 0.075);
  make('brake', DRIVER_X - 0.03, 0.085);
  make('throttle', DRIVER_X + 0.14, 0.065);

  const deadPedal = mesh(roundedBox(0.09, 0.02, 0.20, 0.01), M.alloy, 'DeadPedal');
  deadPedal.position.set(DRIVER_X - 0.34, 0.345, -0.52);
  deadPedal.rotation.x = 0.3;
  g.add(deadPedal);
  return bakeInto(g, (o) => o.name.startsWith('Pedal_'));
}

/** Pistol-grip shifter plus the line-lock lever. */
function shifter(M, parts) {
  const g = group('ShifterAssembly');

  const base = mesh(roundedBox(0.16, 0.06, 0.24, 0.02), M.blackAlloy, 'ShifterBase');
  base.position.set(-0.09, 0.545, 0.02);
  g.add(base);

  const pivot = group('Shifter');
  pivot.position.set(-0.09, 0.565, 0.02);
  parts.shifter = pivot;

  const lever = mesh(new THREE.CylinderGeometry(0.017, 0.021, 0.34, 10), M.chrome, 'ShifterLever');
  lever.position.y = 0.17;
  pivot.add(lever);
  const grip = mesh(roundedBox(0.05, 0.13, 0.075, 0.025), M.leather, 'ShifterGrip');
  grip.position.set(0, 0.35, 0.015);
  pivot.add(grip);
  const trigger = mesh(roundedBox(0.02, 0.06, 0.02, 0.008), M.chrome, 'ShifterTrigger');
  trigger.position.set(0, 0.33, 0.055);
  pivot.add(trigger);
  g.add(pivot);

  // Gate plate with gear markings.
  const gate = mesh(roundedBox(0.10, 0.005, 0.22, 0.006), M.alloy, 'ShiftGate');
  gate.position.set(-0.09, 0.578, 0.02);
  g.add(gate);

  // Line-lock / handbrake lever next to it.
  const lock = group('LineLock');
  lock.position.set(0.16, 0.55, 0.05);
  const lockLever = mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.26, 8), M.blackAlloy, 'LineLockLever');
  lockLever.position.y = 0.13;
  lockLever.rotation.x = -0.35;
  lock.add(lockLever);
  const lockKnob = mesh(new THREE.SphereGeometry(0.026, 12, 10), M.harness, 'LineLockKnob');
  lockKnob.position.set(0, 0.26, 0.09);
  lock.add(lockKnob);
  parts.lineLockLever = lock;
  bakeInto(lock);
  bakeInto(pivot);
  g.add(lock);
  return bakeInto(g, (o) => o.name === 'Shifter' || o.name === 'LineLock');
}

/** Bucket seat with a six-point harness. */
function seat(M, x, name) {
  const g = group(name);
  g.position.set(x, FLOOR_Y, 0.30);

  const shellMat = M.carbon;
  const base = mesh(roundedBox(0.50, 0.10, 0.52, 0.05), shellMat, `${name}Base`);
  base.position.set(0, 0.13, 0.02);
  g.add(base);

  const cushion = mesh(roundedBox(0.42, 0.07, 0.46, 0.04), M.suede, `${name}Cushion`);
  cushion.position.set(0, 0.195, 0.02);
  g.add(cushion);

  const backShell = mesh(roundedBox(0.50, 0.72, 0.10, 0.05), shellMat, `${name}BackShell`);
  backShell.position.set(0, 0.55, 0.26);
  backShell.rotation.x = 0.16;
  g.add(backShell);

  const backPad = mesh(roundedBox(0.38, 0.62, 0.09, 0.04), M.suede, `${name}BackPad`);
  backPad.position.set(0, 0.53, 0.205);
  backPad.rotation.x = 0.16;
  g.add(backPad);

  // Side bolsters.
  for (const s of [-1, 1]) {
    const bolster = mesh(roundedBox(0.07, 0.60, 0.20, 0.035), shellMat, `${name}Bolster_${s < 0 ? 'L' : 'R'}`);
    bolster.position.set(s * 0.215, 0.52, 0.19);
    bolster.rotation.x = 0.16;
    bolster.rotation.z = -s * 0.06;
    g.add(bolster);
    const legBolster = mesh(roundedBox(0.06, 0.09, 0.44, 0.03), shellMat, `${name}LegBolster_${s < 0 ? 'L' : 'R'}`);
    legBolster.position.set(s * 0.215, 0.20, 0.0);
    g.add(legBolster);
    // Harness shoulder straps.
    const strap = mesh(roundedBox(0.075, 0.52, 0.012, 0.004), M.harness, `${name}Shoulder_${s < 0 ? 'L' : 'R'}`);
    strap.position.set(s * 0.11, 0.60, 0.155);
    strap.rotation.x = 0.2;
    strap.rotation.z = -s * 0.10;
    g.add(strap);
    const lap = mesh(roundedBox(0.075, 0.24, 0.012, 0.004), M.harness, `${name}Lap_${s < 0 ? 'L' : 'R'}`);
    lap.position.set(s * 0.19, 0.30, -0.02);
    lap.rotation.z = -s * 0.9;
    g.add(lap);
  }
  const camlock = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 14), M.chrome, `${name}Camlock`);
  camlock.rotation.x = Math.PI / 2;
  camlock.position.set(0, 0.30, -0.03);
  g.add(camlock);

  const headrest = mesh(roundedBox(0.30, 0.20, 0.10, 0.05), M.suede, `${name}Headrest`);
  headrest.position.set(0, 0.95, 0.30);
  headrest.rotation.x = 0.16;
  g.add(headrest);

  // Seat rails.
  for (const s of [-1, 1]) {
    const rail = mesh(roundedBox(0.04, 0.07, 0.50, 0.01), M.blackAlloy, `${name}Rail_${s < 0 ? 'L' : 'R'}`);
    rail.position.set(s * 0.18, 0.05, 0.02);
    g.add(rail);
  }
  const merged = mergeStatic(g, name);
  merged.position.copy(g.position);
  return merged;
}

/** Chrome-moly roll cage. */
function rollCage(M) {
  const g = group('RollCage');
  const R = 0.034;
  const add = (pts, name, r = R) => g.add(mesh(tube(pts, r, 8), M.cage, name));

  // Main hoop behind the seats.
  for (const s of [-1, 1]) {
    add([
      [s * 0.76, 0.32, 0.86],
      [s * 0.775, 0.80, 0.88],
      [s * 0.740, 1.18, 0.86],
      [s * 0.640, 1.262, 0.80],
    ], `MainHoopLeg_${s < 0 ? 'L' : 'R'}`);
    // Front down tubes following the A-pillars.
    add([
      [s * 0.650, 1.258, -0.10],
      [s * 0.716, 1.14, -0.35],
      [s * 0.775, 0.98, -0.62],
      [s * 0.78, 0.60, -0.70],
      [s * 0.78, 0.34, -0.66],
    ], `WindscreenPillar_${s < 0 ? 'L' : 'R'}`);
    // Roof rail joining them.
    add([
      [s * 0.650, 1.258, -0.10],
      [s * 0.640, 1.272, 0.35],
      [s * 0.640, 1.262, 0.80],
    ], `RoofRail_${s < 0 ? 'L' : 'R'}`);
    // Rear stays into the boot.
    add([
      [s * 0.640, 1.262, 0.80],
      [s * 0.70, 0.95, 1.35],
      [s * 0.72, 0.42, 1.80],
    ], `RearStay_${s < 0 ? 'L' : 'R'}`, R * 0.9);
    // Door bars: an X plus a horizontal.
    add([[s * 0.80, 0.40, -0.55], [s * 0.815, 0.62, 0.0], [s * 0.80, 0.86, 0.60]], `DoorBarA_${s < 0 ? 'L' : 'R'}`, R * 0.85);
    add([[s * 0.80, 0.86, -0.55], [s * 0.815, 0.62, 0.0], [s * 0.80, 0.40, 0.60]], `DoorBarB_${s < 0 ? 'L' : 'R'}`, R * 0.85);
    add([[s * 0.80, 0.70, -0.55], [s * 0.815, 0.72, 0.0], [s * 0.80, 0.70, 0.60]], `DoorBarC_${s < 0 ? 'L' : 'R'}`, R * 0.8);
  }
  // Halo across the top of the main hoop and the windscreen header.
  add([[-0.640, 1.262, 0.80], [0, 1.280, 0.82], [0.640, 1.262, 0.80]], 'MainHoopTop');
  add([[-0.650, 1.258, -0.10], [0, 1.276, -0.12], [0.650, 1.258, -0.10]], 'WindscreenHeader');
  add([[-0.755, 1.10, 0.87], [0, 1.14, 0.89], [0.755, 1.10, 0.87]], 'HarnessBar');
  add([[-0.76, 0.34, 0.86], [0, 0.34, 0.88], [0.76, 0.34, 0.86]], 'FloorCross', R * 0.8);
  // Diagonal in the main hoop.
  add([[-0.740, 0.42, 0.87], [0.695, 1.20, 0.85]], 'HoopDiagonal', R * 0.85);

  // Padding where a helmet could hit.
  for (const s of [-1, 1]) {
    const pad = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.44, 10), M.matte, `CagePad_${s < 0 ? 'L' : 'R'}`);
    pad.position.set(s * 0.765, 1.05, 0.87);
    pad.rotation.x = 0.05;
    g.add(pad);
    const padA = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.40, 10), M.matte, `CagePadA_${s < 0 ? 'L' : 'R'}`);
    padA.position.set(s * 0.762, 1.06, -0.44);
    padA.rotation.x = 0.92;
    g.add(padA);
  }
  return mergeStatic(g, 'RollCage');
}

/* -------------------------------------------------------------------------- */

export function buildInterior(M, parts) {
  const g = group('Interior');
  g.add(tub(M));
  g.add(dashboard(M, parts));
  g.add(steering(M, parts));
  g.add(pedals(M, parts));
  g.add(shifter(M, parts));
  g.add(seat(M, DRIVER_X, 'DriverSeat'));
  g.add(seat(M, PASSENGER_X, 'PassengerSeat'));
  g.add(rollCage(M));

  // Fire bottle strapped to the passenger floor.
  const bottle = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.34, 14), M.harness, 'FireBottle');
  bottle.rotation.z = Math.PI / 2;
  bottle.position.set(PASSENGER_X, 0.40, -0.40);
  g.add(bottle);

  return g;
}
