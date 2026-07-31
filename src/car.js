import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const BODY_COLOR = 0xb51f32;
const DARK_METAL = 0x11141b;

function roundedBox(width, height, depth, radius = 0.06, segments = 3) {
  return new RoundedBoxGeometry(width, height, depth, segments, radius);
}

function mesh(geometry, material, name, parent, position, rotation) {
  const part = new THREE.Mesh(geometry, material);
  part.name = name;
  if (position) part.position.fromArray(position);
  if (rotation) part.rotation.set(...rotation);
  part.castShadow = true;
  part.receiveShadow = true;
  parent.add(part);
  return part;
}

function tubeBetween(start, end, radius, material, name, parent, radialSegments = 10) {
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  const direction = b.clone().sub(a);
  const part = mesh(
    new THREE.CylinderGeometry(radius, radius, direction.length(), radialSegments),
    material,
    name,
    parent,
    a.clone().add(b).multiplyScalar(0.5).toArray(),
  );
  part.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  return part;
}

function createQuad(points, material, name, parent) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points.flatMap((point) => point), 3),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  return mesh(geometry, material, name, parent);
}

function createTopShell(material) {
  const sections = [
    { z: -2.38, width: 0.62, center: 0.53, edge: 0.45 },
    { z: -2.15, width: 0.86, center: 0.69, edge: 0.57 },
    { z: -1.62, width: 0.94, center: 0.86, edge: 0.68 },
    { z: -0.92, width: 0.93, center: 0.92, edge: 0.72 },
    { z: -0.64, width: 0.86, center: 1.03, edge: 0.78 },
    { z: -0.2, width: 0.76, center: 1.52, edge: 1.29 },
    { z: 0.5, width: 0.79, center: 1.61, edge: 1.4 },
    { z: 1.02, width: 0.76, center: 1.48, edge: 1.25 },
    { z: 1.43, width: 0.86, center: 0.94, edge: 0.78 },
    { z: 2.0, width: 0.92, center: 0.86, edge: 0.67 },
    { z: 2.32, width: 0.78, center: 0.6, edge: 0.48 },
  ];
  const across = [-1, -0.74, -0.38, 0, 0.38, 0.74, 1];
  const vertices = [];
  const uvs = [];
  const indices = [];

  sections.forEach((section, row) => {
    across.forEach((u, column) => {
      const crown = 1 - Math.pow(Math.abs(u), 1.7);
      const y = THREE.MathUtils.lerp(section.edge, section.center, crown);
      vertices.push(u * section.width, y, section.z);
      uvs.push(column / (across.length - 1), row / (sections.length - 1));
    });
  });

  for (let row = 0; row < sections.length - 1; row += 1) {
    // The glass panels are real openings, not dark decals over a painted shell.
    // Leave out the windshield and rear-window spans so the cockpit has clear sightlines.
    if (row === 4 || row === 7) continue;
    for (let column = 0; column < across.length - 1; column += 1) {
      const a = row * across.length + column;
      const b = a + 1;
      const c = a + across.length + 1;
      const d = a + across.length;
      indices.push(a, d, b, b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const shell = new THREE.Mesh(geometry, material);
  shell.name = "Body_Upper_Shell";
  shell.castShadow = true;
  shell.receiveShadow = true;
  return shell;
}

function createSidePanelGeometry() {
  const side = new THREE.Shape();
  side.moveTo(2.4, 0.24);
  side.lineTo(2.33, 0.48);
  side.lineTo(2.12, 0.66);
  side.lineTo(1.62, 0.82);
  side.lineTo(0.82, 0.93);
  side.lineTo(0.6, 1.04);
  side.lineTo(0.2, 1.46);
  side.lineTo(-0.32, 1.61);
  side.lineTo(-0.85, 1.55);
  side.lineTo(-1.25, 1.32);
  side.lineTo(-1.55, 0.96);
  side.lineTo(-2.15, 0.84);
  side.lineTo(-2.38, 0.56);
  side.lineTo(-2.35, 0.23);
  side.lineTo(-1.95, 0.16);
  side.lineTo(1.96, 0.16);
  side.closePath();

  for (const x of [1.43, -1.43]) {
    const wheelOpening = new THREE.Path();
    wheelOpening.absellipse(x, 0.43, 0.55, 0.55, 0, Math.PI * 2, true);
    side.holes.push(wheelOpening);
  }

  const windowOpening = new THREE.Path();
  windowOpening.moveTo(0.58, 0.97);
  windowOpening.lineTo(-1.08, 0.97);
  windowOpening.lineTo(-0.88, 1.39);
  windowOpening.lineTo(0.16, 1.45);
  windowOpening.closePath();
  side.holes.push(windowOpening);

  const geometry = new THREE.ExtrudeGeometry(side, {
    depth: 0.12,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.025,
    bevelThickness: 0.025,
    curveSegments: 18,
  });
  geometry.rotateY(Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function createWheel(materials, name, sideSign) {
  const steeringPivot = new THREE.Group();
  steeringPivot.name = `${name}_SteeringPivot`;
  const suspensionPivot = new THREE.Group();
  suspensionPivot.name = `${name}_SuspensionPivot`;
  steeringPivot.add(suspensionPivot);

  const axle = new THREE.Group();
  axle.name = `${name}_AxlePivot`;
  suspensionPivot.add(axle);

  mesh(
    new THREE.CylinderGeometry(0.36, 0.36, 0.275, 32, 1),
    materials.tire,
    `${name}_Tire`,
    axle,
    [0, 0, 0],
    [0, 0, Math.PI / 2],
  );
  mesh(
    new THREE.CylinderGeometry(0.245, 0.245, 0.292, 24, 1),
    materials.rim,
    `${name}_RimBarrel`,
    axle,
    [0, 0, 0],
    [0, 0, Math.PI / 2],
  );
  mesh(
    new THREE.CylinderGeometry(0.19, 0.19, 0.3, 28),
    materials.brake,
    `${name}_BrakeDisc`,
    axle,
    [0, 0, 0],
    [0, 0, Math.PI / 2],
  );

  const outward = 0.154 * sideSign;
  const spokes = new THREE.InstancedMesh(
    roundedBox(0.018, 0.038, 0.19, 0.012, 2),
    materials.rim,
    10,
  );
  spokes.name = `${name}_ForgedSpokes`;
  spokes.position.x = outward;
  spokes.castShadow = true;
  const transform = new THREE.Object3D();
  for (let index = 0; index < 10; index += 1) {
    const angle = (index / 10) * Math.PI * 2;
    transform.position.set(0, Math.sin(angle) * 0.095, Math.cos(angle) * 0.095);
    transform.rotation.set(angle, 0, 0);
    transform.updateMatrix();
    spokes.setMatrixAt(index, transform.matrix);
  }
  spokes.instanceMatrix.needsUpdate = true;
  axle.add(spokes);
  mesh(
    new THREE.CylinderGeometry(0.055, 0.055, 0.31, 20),
    materials.accent,
    `${name}_Hub`,
    axle,
    [0, 0, 0],
    [0, 0, Math.PI / 2],
  );

  const caliper = mesh(
    roundedBox(0.08, 0.17, 0.08, 0.025, 2),
    materials.caliper,
    `${name}_Caliper`,
    suspensionPivot,
    [outward * 0.8, 0.03, 0.16],
  );
  caliper.castShadow = false;

  const treads = new THREE.InstancedMesh(
    roundedBox(0.292, 0.018, 0.055, 0.008, 1),
    materials.tread,
    18,
  );
  treads.name = `${name}_Tread_Blocks`;
  treads.castShadow = false;
  for (let index = 0; index < 18; index += 1) {
    const angle = (index / 18) * Math.PI * 2;
    transform.position.set(0, Math.sin(angle) * 0.354, Math.cos(angle) * 0.354);
    transform.rotation.set(angle, 0, 0);
    transform.updateMatrix();
    treads.setMatrixAt(index, transform.matrix);
  }
  treads.instanceMatrix.needsUpdate = true;
  axle.add(treads);

  return { steeringPivot, suspensionPivot, axle };
}

function createSeat(name, parent, x, z, materials) {
  const seat = new THREE.Group();
  seat.name = name;
  seat.position.set(x, 0, z);
  parent.add(seat);

  mesh(
    roundedBox(0.53, 0.15, 0.57, 0.07, 3),
    materials.leather,
    `${name}_Cushion`,
    seat,
    [0, 0.45, 0.04],
    [-0.08, 0, 0],
  );
  mesh(
    roundedBox(0.52, 0.73, 0.16, 0.07, 3),
    materials.leather,
    `${name}_Backrest`,
    seat,
    [0, 0.78, 0.28],
    [-0.16, 0, 0],
  );
  for (const side of [-1, 1]) {
    mesh(
      roundedBox(0.11, 0.2, 0.62, 0.045, 2),
      materials.leather,
      `${name}_LowerBolster_${side < 0 ? "L" : "R"}`,
      seat,
      [side * 0.25, 0.52, 0.03],
      [-0.08, 0, 0],
    );
    mesh(
      roundedBox(0.11, 0.63, 0.2, 0.045, 2),
      materials.leather,
      `${name}_BackBolster_${side < 0 ? "L" : "R"}`,
      seat,
      [side * 0.25, 0.79, 0.27],
      [-0.16, 0, 0],
    );
  }
  mesh(
    roundedBox(0.34, 0.2, 0.15, 0.05, 3),
    materials.leather,
    `${name}_Headrest`,
    seat,
    [0, 1.19, 0.39],
    [-0.12, 0, 0],
  );
  mesh(
    roundedBox(0.22, 0.025, 0.38, 0.01, 2),
    materials.seatInsert,
    `${name}_CenterInsert`,
    seat,
    [0, 0.47, 0.015],
    [-0.08, 0, 0],
  );
  return seat;
}

function createGaugeDisplay(materials, parent) {
  if (typeof document === "undefined") {
    const displayMaterial = new THREE.MeshBasicMaterial({ color: 0x102831, toneMapped: false });
    mesh(
      roundedBox(0.71, 0.29, 0.035, 0.045, 4),
      materials.screenFrame,
      "Instrument_Cluster_Frame",
      parent,
      [-0.38, 1.125, -0.705],
      [-0.06, 0, 0],
    );
    mesh(
      new THREE.PlaneGeometry(0.64, 0.23),
      displayMaterial,
      "Instrument_Cluster_Display",
      parent,
      [-0.38, 1.125, -0.727],
      [-0.06, 0, 0],
    );
    return { canvas: null, texture: null, update() {} };
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 384;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const displayMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    toneMapped: false,
  });
  mesh(
    roundedBox(0.71, 0.29, 0.035, 0.045, 4),
    materials.screenFrame,
    "Instrument_Cluster_Frame",
    parent,
    [-0.38, 1.125, -0.705],
    [-0.06, 0, 0],
  );
  const screen = mesh(
    new THREE.PlaneGeometry(0.64, 0.23),
    displayMaterial,
    "Instrument_Cluster_Display",
    parent,
    [-0.38, 1.125, -0.727],
    [-0.06, 0, 0],
  );
  screen.castShadow = false;

  let lastDraw = 0;
  function update(state, race, time) {
    if (time - lastDraw < 0.035) return;
    lastDraw = time;
    const context = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const rpmRatio = THREE.MathUtils.clamp((state.rpm - 800) / 6900, 0, 1);
    context.clearRect(0, 0, width, height);
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#090d14");
    gradient.addColorStop(1, "#16111a");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    context.fillStyle = "#7f8998";
    context.font = "600 30px ui-monospace, monospace";
    context.fillText("APEX R-9  //  RACE", 46, 54);
    context.textAlign = "center";
    context.fillStyle = "#f4f7fb";
    context.font = "700 146px ui-monospace, monospace";
    context.fillText(String(Math.round(state.speed * 3.6)).padStart(3, "0"), 238, 244);
    context.font = "600 28px ui-monospace, monospace";
    context.fillStyle = "#8c98a8";
    context.fillText("KM/H", 238, 288);

    context.textAlign = "left";
    context.fillStyle = "#8c98a8";
    context.font = "600 28px ui-monospace, monospace";
    context.fillText("GEAR", 485, 90);
    context.fillStyle = "#ffffff";
    context.font = "800 166px ui-monospace, monospace";
    context.fillText(state.gear === 0 ? "N" : String(state.gear), 487, 257);

    context.fillStyle = "#29303b";
    context.fillRect(45, 326, 934, 20);
    const shiftColor = rpmRatio > 0.87 ? "#ff315c" : rpmRatio > 0.68 ? "#ffb335" : "#22d6d0";
    context.fillStyle = shiftColor;
    context.fillRect(45, 326, 934 * rpmRatio, 20);

    context.fillStyle = race?.statusColor ?? "#7d8a9b";
    context.font = "700 32px ui-monospace, monospace";
    context.fillText(race?.label ?? "READY", 690, 92);
    context.fillStyle = "#f4f7fb";
    context.font = "600 54px ui-monospace, monospace";
    context.fillText(race?.timeText ?? "0.000", 690, 157);
    context.fillStyle = "#8c98a8";
    context.font = "600 24px ui-monospace, monospace";
    context.fillText(`${Math.max(0, state.distance).toFixed(1)} M`, 694, 205);
    texture.needsUpdate = true;
  }
  return { canvas, texture, update };
}

function createMaterials(renderer) {
  void renderer;
  return {
    paint: new THREE.MeshPhysicalMaterial({
      color: BODY_COLOR,
      metalness: 0.68,
      roughness: 0.2,
      clearcoat: 1,
      clearcoatRoughness: 0.11,
    }),
    paintDark: new THREE.MeshPhysicalMaterial({
      color: 0x310813,
      metalness: 0.62,
      roughness: 0.25,
      clearcoat: 0.85,
      clearcoatRoughness: 0.15,
    }),
    carbon: new THREE.MeshStandardMaterial({
      color: 0x11151a,
      metalness: 0.28,
      roughness: 0.32,
    }),
    black: new THREE.MeshStandardMaterial({ color: DARK_METAL, metalness: 0.2, roughness: 0.4 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x07090d, metalness: 0.55, roughness: 0.18 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x17232d,
      metalness: 0.05,
      roughness: 0.08,
      transmission: 0.22,
      transparent: true,
      opacity: 0.76,
      side: THREE.DoubleSide,
      depthWrite: true,
    }),
    mirror: new THREE.MeshPhysicalMaterial({
      color: 0x9fb7c8,
      metalness: 1,
      roughness: 0.06,
      clearcoat: 1,
    }),
    tire: new THREE.MeshStandardMaterial({ color: 0x090a0d, roughness: 0.79, metalness: 0.02 }),
    tread: new THREE.MeshStandardMaterial({ color: 0x121317, roughness: 0.88 }),
    rim: new THREE.MeshPhysicalMaterial({
      color: 0x9099a6,
      metalness: 0.94,
      roughness: 0.16,
      clearcoat: 0.4,
    }),
    brake: new THREE.MeshStandardMaterial({ color: 0x58606a, metalness: 0.9, roughness: 0.3 }),
    caliper: new THREE.MeshPhysicalMaterial({ color: 0xffb000, metalness: 0.55, roughness: 0.25 }),
    accent: new THREE.MeshPhysicalMaterial({ color: 0xd7dce3, metalness: 1, roughness: 0.12 }),
    leather: new THREE.MeshStandardMaterial({ color: 0x0c0e12, roughness: 0.67, metalness: 0.02 }),
    seatInsert: new THREE.MeshStandardMaterial({ color: 0x321018, roughness: 0.82 }),
    screenFrame: new THREE.MeshStandardMaterial({ color: 0x05070a, metalness: 0.32, roughness: 0.28 }),
    emissiveWhite: new THREE.MeshStandardMaterial({
      color: 0xdcecff,
      emissive: 0xbad8ff,
      emissiveIntensity: 2.3,
      roughness: 0.16,
      toneMapped: false,
    }),
    emissiveRed: new THREE.MeshStandardMaterial({
      color: 0xff173f,
      emissive: 0xff002a,
      emissiveIntensity: 2.8,
      roughness: 0.2,
      toneMapped: false,
    }),
  };
}

export function createCar({ renderer } = {}) {
  const root = new THREE.Group();
  root.name = "Apex_R9_Drag_Coupe";
  root.userData = {
    assetType: "vehicle",
    units: "metres",
    forwardAxis: "-Z",
    upAxis: "+Y",
    wheelbase: 2.86,
    driverEye: [-0.38, 1.19, 0.26],
  };

  const materials = createMaterials(renderer);
  const bodyMotion = new THREE.Group();
  bodyMotion.name = "Body_SuspensionVisual";
  root.add(bodyMotion);

  bodyMotion.add(createTopShell(materials.paint));

  const rightSide = mesh(
    createSidePanelGeometry(),
    materials.paint,
    "Body_Side_Right",
    bodyMotion,
    [0.825, 0, 0],
  );
  const leftSide = rightSide.clone();
  leftSide.name = "Body_Side_Left";
  leftSide.scale.x = -1;
  bodyMotion.add(leftSide);

  mesh(roundedBox(1.72, 0.32, 0.28, 0.08, 4), materials.paintDark, "Front_Bumper", bodyMotion, [0, 0.46, -2.3]);
  mesh(roundedBox(1.78, 0.34, 0.3, 0.08, 4), materials.paintDark, "Rear_Bumper", bodyMotion, [0, 0.46, 2.27]);
  mesh(roundedBox(1.64, 0.08, 0.47, 0.03, 3), materials.carbon, "Front_Splitter", bodyMotion, [0, 0.16, -2.35]);
  mesh(roundedBox(1.7, 0.07, 0.36, 0.03, 3), materials.carbon, "Rear_Diffuser", bodyMotion, [0, 0.16, 2.31]);
  mesh(roundedBox(0.9, 0.22, 0.07, 0.025, 3), materials.black, "Front_Grille", bodyMotion, [0, 0.49, -2.46]);
  for (const x of [-0.59, -0.31, 0, 0.31, 0.59]) {
    tubeBetween([x, 0.4, -2.5], [x, 0.59, -2.5], 0.009, materials.trim, `Grille_Vane_${x}`, bodyMotion, 6);
  }

  const hoodPivot = new THREE.Group();
  hoodPivot.name = "Hood_Hinge_Pivot";
  hoodPivot.position.set(0, 0.93, -0.7);
  hoodPivot.userData = { axis: "X", openAngle: -1.05 };
  bodyMotion.add(hoodPivot);
  mesh(roundedBox(1.54, 0.028, 1.23, 0.05, 4), materials.paint, "Hood_Panel", hoodPivot, [0, 0.018, -0.61], [-0.012, 0, 0]);
  mesh(roundedBox(0.45, 0.035, 0.5, 0.025, 3), materials.carbon, "Hood_Heat_Extractor", hoodPivot, [0, 0.055, -0.5], [-0.02, 0, 0]);
  for (const x of [-0.14, -0.07, 0, 0.07, 0.14]) {
    mesh(roundedBox(0.025, 0.016, 0.36, 0.006, 1), materials.black, `Hood_Vent_${x}`, hoodPivot, [x, 0.078, -0.51]);
  }

  const trunkPivot = new THREE.Group();
  trunkPivot.name = "Trunk_Hinge_Pivot";
  trunkPivot.position.set(0, 0.92, 1.43);
  trunkPivot.userData = { axis: "X", openAngle: 0.95 };
  bodyMotion.add(trunkPivot);
  mesh(roundedBox(1.55, 0.035, 0.75, 0.05, 4), materials.paint, "Trunk_Lid", trunkPivot, [0, 0, 0.36], [0.02, 0, 0]);

  const spoiler = new THREE.Group();
  spoiler.name = "Rear_Spoiler";
  spoiler.position.set(0, 0.98, 1.94);
  bodyMotion.add(spoiler);
  for (const x of [-0.58, 0.58]) {
    mesh(roundedBox(0.06, 0.25, 0.18, 0.02, 2), materials.carbon, `Spoiler_Stand_${x}`, spoiler, [x, 0.11, 0]);
  }
  mesh(roundedBox(1.5, 0.065, 0.32, 0.03, 3), materials.carbon, "Spoiler_Blade", spoiler, [0, 0.25, 0.02], [-0.07, 0, 0]);

  createQuad(
    [[-0.78, 1.015, -0.66], [0.78, 1.015, -0.66], [0.66, 1.53, -0.18], [-0.66, 1.53, -0.18]],
    materials.glass,
    "Windshield",
    bodyMotion,
  );
  createQuad(
    [[0.76, 0.99, 1.43], [-0.76, 0.99, 1.43], [-0.66, 1.48, 1.0], [0.66, 1.48, 1.0]],
    materials.glass,
    "Rear_Window",
    bodyMotion,
  );
  createQuad(
    [[0.908, 0.93, -0.6], [0.908, 0.93, 1.12], [0.8, 1.42, 0.93], [0.82, 1.46, -0.18]],
    materials.glass,
    "Side_Window_Right",
    bodyMotion,
  );
  const leftWindow = createQuad(
    [[-0.908, 0.93, 1.12], [-0.908, 0.93, -0.6], [-0.82, 1.46, -0.18], [-0.8, 1.42, 0.93]],
    materials.glass,
    "Side_Window_Left",
    bodyMotion,
  );
  leftWindow.renderOrder = 1;

  for (const side of [-1, 1]) {
    tubeBetween(
      [side * 0.81, 1.0, -0.65],
      [side * 0.67, 1.55, -0.18],
      0.035,
      materials.trim,
      `A_Pillar_${side < 0 ? "Left" : "Right"}`,
      bodyMotion,
      8,
    );
    tubeBetween(
      [side * 0.79, 0.98, 1.4],
      [side * 0.68, 1.5, 0.98],
      0.038,
      materials.trim,
      `C_Pillar_${side < 0 ? "Left" : "Right"}`,
      bodyMotion,
      8,
    );
  }
  mesh(roundedBox(1.34, 0.06, 0.78, 0.025, 3), materials.paintDark, "Roof_Panel", bodyMotion, [0, 1.59, 0.48]);

  const doors = [];
  for (const side of [-1, 1]) {
    const doorPivot = new THREE.Group();
    doorPivot.name = `Door_${side < 0 ? "Left" : "Right"}_HingePivot`;
    doorPivot.position.set(side * 0.952, 0.67, -0.7);
    doorPivot.userData = { axis: "Y", openAngle: side * 1.08 };
    bodyMotion.add(doorPivot);
    mesh(
      roundedBox(0.035, 0.61, 1.36, 0.035, 3),
      materials.paint,
      `Door_${side < 0 ? "Left" : "Right"}_Outer`,
      doorPivot,
      [0, 0, 0.71],
      [0.02, 0, 0],
    );
    mesh(
      roundedBox(0.026, 0.36, 1.08, 0.045, 3),
      materials.leather,
      `Door_${side < 0 ? "Left" : "Right"}_InnerCard`,
      doorPivot,
      [-side * 0.05, -0.01, 0.72],
    );
    mesh(
      roundedBox(0.025, 0.035, 0.24, 0.01, 2),
      materials.accent,
      `Door_${side < 0 ? "Left" : "Right"}_Handle`,
      doorPivot,
      [side * 0.025, 0.12, 1.03],
    );
    doors.push(doorPivot);
  }

  for (const side of [-1, 1]) {
    const mirrorPivot = new THREE.Group();
    mirrorPivot.name = `Mirror_${side < 0 ? "Left" : "Right"}_FoldPivot`;
    mirrorPivot.position.set(side * 0.92, 1.13, -0.45);
    mirrorPivot.userData = { axis: "Y", foldAngle: side * 0.75 };
    bodyMotion.add(mirrorPivot);
    mesh(roundedBox(0.25, 0.12, 0.2, 0.045, 3), materials.paintDark, `Mirror_${side}_Housing`, mirrorPivot, [side * 0.11, 0, 0]);
    mesh(roundedBox(0.012, 0.082, 0.15, 0.025, 3), materials.mirror, `Mirror_${side}_Glass`, mirrorPivot, [side * 0.238, 0, 0.018]);
  }

  for (const side of [-1, 1]) {
    mesh(roundedBox(0.51, 0.11, 0.045, 0.035, 4), materials.emissiveWhite, `Headlamp_${side}`, bodyMotion, [side * 0.58, 0.68, -2.445], [0, side * -0.07, 0]);
    mesh(roundedBox(0.56, 0.12, 0.045, 0.035, 4), materials.emissiveRed, `TailLamp_${side}`, bodyMotion, [side * 0.58, 0.69, 2.43], [0, side * 0.05, 0]);
  }
  mesh(roundedBox(0.25, 0.04, 0.04, 0.012, 2), materials.emissiveRed, "Rear_Center_Light", bodyMotion, [0, 0.87, 2.44]);

  const cabin = new THREE.Group();
  cabin.name = "Complete_Cockpit";
  bodyMotion.add(cabin);
  mesh(roundedBox(1.62, 0.14, 2.25, 0.07, 3), materials.black, "Cockpit_FloorTub", cabin, [0, 0.27, 0.34]);
  mesh(roundedBox(1.6, 0.28, 0.65, 0.08, 4), materials.leather, "Dashboard_Main", cabin, [0, 0.98, -0.63], [-0.06, 0, 0]);
  mesh(roundedBox(1.48, 0.06, 0.55, 0.04, 3), materials.black, "Dashboard_Top", cabin, [0, 1.16, -0.59], [-0.06, 0, 0]);
  mesh(roundedBox(0.27, 0.45, 1.54, 0.07, 4), materials.carbon, "Center_Console", cabin, [0.13, 0.47, 0.24], [-0.03, 0, 0]);
  createSeat("Driver_Seat", cabin, -0.43, 0.35, materials);
  createSeat("Passenger_Seat", cabin, 0.43, 0.35, materials);
  mesh(roundedBox(1.35, 0.34, 0.43, 0.08, 4), materials.leather, "Rear_Seat_Cushion", cabin, [0, 0.46, 1.22], [-0.08, 0, 0]);
  mesh(roundedBox(1.36, 0.55, 0.16, 0.07, 4), materials.leather, "Rear_Seat_Back", cabin, [0, 0.73, 1.45], [-0.19, 0, 0]);

  const steeringWheelPivot = new THREE.Group();
  steeringWheelPivot.name = "Steering_Wheel_Pivot";
  steeringWheelPivot.position.set(-0.38, 1.05, -0.46);
  steeringWheelPivot.rotation.x = -0.12;
  steeringWheelPivot.userData = { axis: "Z", ratio: 8.5 };
  cabin.add(steeringWheelPivot);
  mesh(new THREE.TorusGeometry(0.205, 0.027, 10, 28), materials.leather, "Steering_Wheel_Rim", steeringWheelPivot);
  mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.06, 18), materials.accent, "Steering_Wheel_Hub", steeringWheelPivot, [0, 0, -0.02], [Math.PI / 2, 0, 0]);
  for (const angle of [-2.25, -0.89, Math.PI / 2]) {
    const spoke = mesh(roundedBox(0.04, 0.17, 0.025, 0.012, 2), materials.carbon, `Steering_Spoke_${angle}`, steeringWheelPivot, [Math.cos(angle) * 0.07, Math.sin(angle) * 0.07, -0.018], [0, 0, angle - Math.PI / 2]);
    spoke.castShadow = false;
  }

  const paddleLeft = mesh(roundedBox(0.035, 0.14, 0.018, 0.008, 2), materials.accent, "Paddle_Shifter_Down", cabin, [-0.55, 1.05, -0.5], [0, 0, -0.22]);
  const paddleRight = mesh(roundedBox(0.035, 0.14, 0.018, 0.008, 2), materials.accent, "Paddle_Shifter_Up", cabin, [-0.21, 1.05, -0.5], [0, 0, 0.22]);
  paddleLeft.userData.action = "shiftDown";
  paddleRight.userData.action = "shiftUp";

  const gauge = createGaugeDisplay(materials, cabin);
  const centerScreenMaterial = new THREE.MeshBasicMaterial({ color: 0x102831, toneMapped: false });
  mesh(roundedBox(0.43, 0.26, 0.04, 0.04, 3), materials.screenFrame, "Center_Screen_Frame", cabin, [0.28, 1.04, -0.805], [-0.04, 0, 0]);
  mesh(new THREE.PlaneGeometry(0.37, 0.2), centerScreenMaterial, "Center_Screen", cabin, [0.28, 1.04, -0.832], [-0.04, 0, 0]);

  const shifterPivot = new THREE.Group();
  shifterPivot.name = "Gear_Lever_Pivot";
  shifterPivot.position.set(0.14, 0.74, 0.08);
  shifterPivot.userData = { axis: "X", action: "shift" };
  cabin.add(shifterPivot);
  tubeBetween([0, 0, 0], [0, 0.13, -0.035], 0.015, materials.accent, "Gear_Lever", shifterPivot, 10);
  mesh(new THREE.SphereGeometry(0.05, 16, 10), materials.leather, "Gear_Knob", shifterPivot, [0, 0.15, -0.04]);

  for (let index = 0; index < 3; index += 1) {
    const x = -0.61 + index * 0.15;
    mesh(roundedBox(0.1, 0.025, 0.18, 0.012, 2), materials.accent, `Pedal_${index}`, cabin, [x, 0.33, -0.93], [-0.55, 0, 0]);
  }

  const wheels = [];
  const frontSteeringPivots = [];
  const wheelLocations = [
    { name: "Wheel_FL", x: -0.93, z: -1.43, steer: true, side: -1 },
    { name: "Wheel_FR", x: 0.93, z: -1.43, steer: true, side: 1 },
    { name: "Wheel_RL", x: -0.93, z: 1.43, steer: false, side: -1 },
    { name: "Wheel_RR", x: 0.93, z: 1.43, steer: false, side: 1 },
  ];
  for (const location of wheelLocations) {
    const wheel = createWheel(materials, location.name, location.side);
    wheel.steeringPivot.position.set(location.x, 0.43, location.z);
    root.add(wheel.steeringPivot);
    wheels.push(wheel.axle);
    if (location.steer) frontSteeringPivots.push(wheel.steeringPivot);
  }

  const headlightTargets = [];
  const headlights = [];
  for (const x of [-0.55, 0.55]) {
    const light = new THREE.SpotLight(0xd5eaff, 175, 70, 0.26, 0.58, 2);
    light.name = `Headlight_Beam_${x < 0 ? "Left" : "Right"}`;
    light.position.set(x, 0.69, -2.25);
    light.castShadow = false;
    const target = new THREE.Object3D();
    target.name = `${light.name}_Target`;
    target.position.set(0, 0, -1);
    light.target = target;
    light.add(target);
    root.add(light);
    headlights.push(light);
    headlightTargets.push(target);
  }

  const underglow = new THREE.PointLight(0xff174f, 5.5, 4.5, 2);
  underglow.name = "Subtle_Underglow";
  underglow.position.set(0, 0.18, 0.3);
  root.add(underglow);

  const driverEye = new THREE.Vector3(-0.38, 1.19, 0.26);
  const visualState = { pitch: 0, roll: 0, door: 0 };

  function update(state, race, delta, time) {
    root.position.set(state.position.x, 0, state.position.z);
    root.rotation.y = state.yaw;
    for (const axle of wheels) axle.rotation.x = state.wheelRotation;
    for (const pivot of frontSteeringPivots) pivot.rotation.y = state.steerAngle;
    steeringWheelPivot.rotation.z = -state.steerAngle * 7.3;
    shifterPivot.rotation.x = state.shiftTimer > 0 ? -0.16 : THREE.MathUtils.damp(shifterPivot.rotation.x, 0, 16, delta);

    const targetPitch = THREE.MathUtils.clamp(-state.longitudinalAcceleration * 0.0022, -0.018, 0.025);
    const targetRoll = THREE.MathUtils.clamp(-state.lateralAcceleration * 0.003, -0.018, 0.018);
    visualState.pitch = THREE.MathUtils.damp(visualState.pitch, targetPitch, 6, delta);
    visualState.roll = THREE.MathUtils.damp(visualState.roll, targetRoll, 7, delta);
    bodyMotion.rotation.x = visualState.pitch;
    bodyMotion.rotation.z = visualState.roll;
    gauge.update(state, race, time);
  }

  function setDoorsOpen(amount) {
    visualState.door = THREE.MathUtils.clamp(amount, 0, 1);
    doors[0].rotation.y = -1.08 * visualState.door;
    doors[1].rotation.y = 1.08 * visualState.door;
  }

  return {
    root,
    driverEye,
    controls: {
      wheels,
      frontSteeringPivots,
      steeringWheelPivot,
      hoodPivot,
      trunkPivot,
      doors,
      shifterPivot,
    },
    update,
    setDoorsOpen,
    materials,
    gauge,
  };
}
