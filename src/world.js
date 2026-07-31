import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

function roundedBox(width, height, depth, radius = 0.04, segments = 2) {
  return new RoundedBoxGeometry(width, height, depth, segments, radius);
}

function createSignTexture(title, subtitle, accent = "#ff315c") {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 320;
  const context = canvas.getContext("2d");
  context.fillStyle = "#080a10";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = accent;
  context.fillRect(0, 0, 20, canvas.height);
  context.fillRect(0, canvas.height - 14, canvas.width, 14);
  context.fillStyle = "#f4f7fb";
  context.font = "800 112px Arial, sans-serif";
  context.letterSpacing = "4px";
  context.fillText(title, 72, 142);
  context.fillStyle = "#8d99aa";
  context.font = "600 42px ui-monospace, monospace";
  context.fillText(subtitle, 76, 225);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function addMesh(parent, geometry, material, name, position, rotation) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  if (position) object.position.fromArray(position);
  if (rotation) object.rotation.set(...rotation);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function makeGantry(parent, z, label, accent, materials) {
  const gantry = new THREE.Group();
  gantry.name = `${label}_Gantry`;
  gantry.position.z = z;
  parent.add(gantry);
  for (const x of [-6.7, 6.7]) {
    addMesh(gantry, roundedBox(0.22, 5.3, 0.22, 0.035, 2), materials.metal, `${label}_Post_${x}`, [x, 2.65, 0]);
  }
  addMesh(gantry, roundedBox(13.6, 0.24, 0.24, 0.035, 2), materials.metal, `${label}_Crossbar`, [0, 5.18, 0]);
  const signMaterial = new THREE.MeshBasicMaterial({
    map: createSignTexture(label, z < -300 ? "402.336 M // QUARTER MILE" : "UNDERGROUND PERFORMANCE DIVISION", accent),
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  addMesh(gantry, new THREE.PlaneGeometry(5.6, 1.75), signMaterial, `${label}_Sign`, [0, 4.23, 0.02]);
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(accent), toneMapped: false });
  addMesh(gantry, roundedBox(6.3, 0.055, 0.08, 0.02, 2), glow, `${label}_Glow`, [0, 3.24, 0.03]);
  return gantry;
}

function createStartTree(parent, materials) {
  const tree = new THREE.Group();
  tree.name = "Christmas_Tree";
  tree.position.set(4.15, 0, -2.4);
  parent.add(tree);

  addMesh(tree, roundedBox(0.17, 2.9, 0.17, 0.025, 2), materials.metal, "Tree_Post", [0, 1.45, 0]);
  addMesh(tree, roundedBox(0.55, 0.13, 0.55, 0.035, 2), materials.metal, "Tree_Base", [0, 0.08, 0]);

  const lamps = { amber: [], green: [], red: [] };
  const lampDefinitions = [
    { type: "amber", y: 2.55 },
    { type: "amber", y: 2.18 },
    { type: "amber", y: 1.81 },
    { type: "green", y: 1.37 },
    { type: "red", y: 0.93 },
  ];
  lampDefinitions.forEach((definition, row) => {
    for (const x of [-0.23, 0.23]) {
      addMesh(tree, roundedBox(0.28, 0.28, 0.18, 0.055, 3), materials.lampHousing, `Lamp_Housing_${row}_${x}`, [x, definition.y, 0]);
      const offMaterial = new THREE.MeshStandardMaterial({
        color: 0x17191e,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.28,
      });
      const lamp = addMesh(tree, new THREE.SphereGeometry(0.095, 16, 10), offMaterial, `Lamp_${definition.type}_${row}_${x}`, [x, definition.y, -0.105]);
      lamp.castShadow = false;
      lamps[definition.type].push(lamp);
    }
  });

  function update(sequence) {
    const colors = { amber: 0xffa000, green: 0x20ff70, red: 0xff183c };
    for (const [type, collection] of Object.entries(lamps)) {
      collection.forEach((lamp, index) => {
        const active = type === "amber"
          ? index >= (sequence.amberRows ?? 0) * 2 - 2 && index < (sequence.amberRows ?? 0) * 2
          : Boolean(sequence[type]);
        lamp.material.color.setHex(active ? colors[type] : 0x17191e);
        lamp.material.emissive.setHex(active ? colors[type] : 0x000000);
        lamp.material.emissiveIntensity = active ? 5 : 0;
      });
    }
  }

  return { tree, lamps, update };
}

export function createWorld(scene) {
  const world = new THREE.Group();
  world.name = "Neon_Quarter_Mile";
  scene.add(world);

  const materials = {
    asphalt: new THREE.MeshStandardMaterial({ color: 0x11141a, roughness: 0.35, metalness: 0.08 }),
    burnout: new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 0.62 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0x303640, roughness: 0.72, metalness: 0.08 }),
    barrier: new THREE.MeshStandardMaterial({ color: 0xaeb6c2, roughness: 0.48, metalness: 0.22 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x252b33, roughness: 0.31, metalness: 0.82 }),
    building: new THREE.MeshStandardMaterial({ color: 0x11151e, roughness: 0.75, metalness: 0.12 }),
    window: new THREE.MeshBasicMaterial({ color: 0x4acbd0, toneMapped: false }),
    magenta: new THREE.MeshBasicMaterial({ color: 0xff245f, toneMapped: false }),
    cyan: new THREE.MeshBasicMaterial({ color: 0x20d8dd, toneMapped: false }),
    white: new THREE.MeshBasicMaterial({ color: 0xf3f7ff, toneMapped: false }),
    lampHousing: new THREE.MeshStandardMaterial({ color: 0x080a0e, roughness: 0.35, metalness: 0.65 }),
  };

  const roadLength = 980;
  addMesh(world, new THREE.PlaneGeometry(14, roadLength), materials.asphalt, "Drag_Strip_Surface", [0, 0, -roadLength / 2 + 24], [-Math.PI / 2, 0, 0]);
  addMesh(world, new THREE.PlaneGeometry(4.2, 70), materials.burnout, "Launch_Rubber", [0, 0.006, -24], [-Math.PI / 2, 0, 0]);
  addMesh(world, new THREE.PlaneGeometry(10, 0.18), materials.white, "Start_Line", [0, 0.012, -3], [-Math.PI / 2, 0, 0]);
  addMesh(world, new THREE.PlaneGeometry(14, 0.34), materials.white, "Finish_Line", [0, 0.014, -402.336], [-Math.PI / 2, 0, 0]);

  for (const x of [-7.75, 7.75]) {
    addMesh(world, new THREE.PlaneGeometry(1.5, roadLength), materials.concrete, `Shoulder_${x}`, [x, -0.005, -roadLength / 2 + 24], [-Math.PI / 2, 0, 0]);
  }

  const dashGeometry = new THREE.BoxGeometry(0.075, 0.012, 5.5);
  const dashes = new THREE.InstancedMesh(dashGeometry, materials.white, 88);
  dashes.name = "Lane_Centre_Dashes";
  dashes.castShadow = false;
  dashes.receiveShadow = true;
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < 88; index += 1) {
    matrix.makeTranslation(0, 0.018, -10 - index * 10.5);
    dashes.setMatrixAt(index, matrix);
  }
  world.add(dashes);

  const barrierGeometry = roundedBox(0.45, 0.72, 5.7, 0.05, 2);
  const barriers = new THREE.InstancedMesh(barrierGeometry, materials.barrier, 336);
  barriers.name = "Track_Safety_Barriers";
  barriers.castShadow = true;
  barriers.receiveShadow = true;
  let barrierIndex = 0;
  for (let segment = 0; segment < 168; segment += 1) {
    const z = 22 - segment * 5.85;
    for (const x of [-8.55, 8.55]) {
      matrix.makeTranslation(x, 0.36, z);
      barriers.setMatrixAt(barrierIndex, matrix);
      barrierIndex += 1;
    }
  }
  world.add(barriers);

  const lightPoleGeometry = roundedBox(0.1, 5.5, 0.1, 0.025, 2);
  const lightPoles = new THREE.InstancedMesh(lightPoleGeometry, materials.metal, 58);
  lightPoles.name = "Light_Poles";
  lightPoles.castShadow = true;
  for (let index = 0; index < 29; index += 1) {
    const z = 10 - index * 31;
    for (const x of [-10.4, 10.4]) {
      matrix.makeTranslation(x, 2.75, z);
      lightPoles.setMatrixAt(index * 2 + (x > 0 ? 1 : 0), matrix);
    }
  }
  world.add(lightPoles);

  const lampGeometry = roundedBox(0.78, 0.08, 0.26, 0.03, 2);
  const lamps = new THREE.InstancedMesh(lampGeometry, materials.white, 58);
  lamps.name = "Track_Lamps";
  lamps.castShadow = false;
  for (let index = 0; index < 29; index += 1) {
    const z = 10 - index * 31;
    for (const x of [-10.1, 10.1]) {
      matrix.makeTranslation(x, 5.38, z);
      lamps.setMatrixAt(index * 2 + (x > 0 ? 1 : 0), matrix);
    }
  }
  world.add(lamps);

  for (const [index, z] of [3, -120, -246, -398].entries()) {
    const light = new THREE.PointLight(index % 2 ? 0x34e7e4 : 0xff315c, 16, 34, 2);
    light.name = `Track_Accent_Light_${index}`;
    light.position.set(index % 2 ? -7 : 7, 3.2, z);
    light.castShadow = false;
    world.add(light);
  }

  const buildings = new THREE.Group();
  buildings.name = "Industrial_Skyline";
  world.add(buildings);
  for (let index = 0; index < 36; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const z = 18 - index * 25.5;
    const width = 7 + ((index * 3) % 8);
    const height = 4 + ((index * 7) % 13);
    const depth = 8 + ((index * 5) % 12);
    const building = addMesh(
      buildings,
      new THREE.BoxGeometry(width, height, depth),
      materials.building,
      `Building_${String(index).padStart(2, "0")}`,
      [side * (16 + (index % 5) * 3.4), height / 2 - 0.1, z],
    );
    building.castShadow = false;
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(building.geometry, 20),
      new THREE.LineBasicMaterial({ color: index % 3 === 0 ? 0x351b31 : 0x142d35, transparent: true, opacity: 0.6 }),
    );
    edge.name = `${building.name}_Edges`;
    building.add(edge);
  }

  const windowGeometry = new THREE.PlaneGeometry(0.6, 0.12);
  const windows = new THREE.InstancedMesh(windowGeometry, materials.window, 180);
  windows.name = "Distant_Building_Lights";
  windows.castShadow = false;
  for (let index = 0; index < 180; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const x = side * (12.8 + ((index * 13) % 21));
    const y = 1.5 + ((index * 17) % 100) / 10;
    const z = 12 - ((index * 23) % 910);
    matrix.makeRotationY(side > 0 ? -Math.PI / 2 : Math.PI / 2);
    matrix.setPosition(x, y, z);
    windows.setMatrixAt(index, matrix);
  }
  world.add(windows);

  const startTree = createStartTree(world, materials);
  makeGantry(world, -8, "APEX", "#ff315c", materials);
  makeGantry(world, -402.336, "FINISH", "#20d8dd", materials);

  const distanceMarkers = [60, 100, 200, 300];
  distanceMarkers.forEach((distance, index) => {
    const signMaterial = new THREE.MeshBasicMaterial({
      map: createSignTexture(`${distance} M`, "QUARTER MILE SPLIT", index % 2 ? "#20d8dd" : "#ff315c"),
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    addMesh(world, new THREE.PlaneGeometry(2.8, 0.88), signMaterial, `Distance_Marker_${distance}`, [index % 2 ? -9.05 : 9.05, 1.7, -distance], [0, index % 2 ? Math.PI / 2 : -Math.PI / 2, 0]);
  });

  const starPositions = [];
  for (let index = 0; index < 900; index += 1) {
    const angle = (index * 2.399963) % (Math.PI * 2);
    const radius = 110 + ((index * 47) % 250);
    starPositions.push(
      Math.cos(angle) * radius,
      35 + ((index * 29) % 150),
      -350 + Math.sin(angle) * radius,
    );
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({ color: 0xaebed3, size: 0.38, sizeAttenuation: true, transparent: true, opacity: 0.74 }),
  );
  stars.name = "Stars";
  world.add(stars);

  function update(race) {
    startTree.update(race?.lights ?? {});
  }

  return { root: world, materials, startTree, update };
}

