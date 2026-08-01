/**
 * Vice Coast: a curated tropical city rather than a random field of boxes.
 * Major buildings and every palm carry a conservative road-clearance footprint.
 */
import * as THREE from 'three';
import { DRIVEABLE_HALF_WIDTH, ROAD_HALF_WIDTH } from './course.js';
import { seededRandom } from './materials.js';
import { ribbonGeometry, verticalRibbonGeometry } from './roadGeometry.js';
import { createRaceBoard } from './scenery.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);

function mesh(geometry, material, name, { cast = false, receive = false } = {}) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.castShadow = cast;
  object.receiveShadow = receive;
  return object;
}

function instance(geometry, material, count, name, { cast = false, receive = false } = {}) {
  const object = new THREE.InstancedMesh(geometry, material, count);
  object.name = name;
  object.castShadow = cast;
  object.receiveShadow = receive;
  object.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  return object;
}

function compose(position, scale, yaw = 0, quaternion = null) {
  const q = quaternion ?? new THREE.Quaternion().setFromAxisAngle(Y_AXIS, yaw);
  return new THREE.Matrix4().compose(position, q, scale);
}

function setCount(object, count) {
  object.count = count;
  object.instanceMatrix.needsUpdate = true;
  if (object.instanceColor) object.instanceColor.needsUpdate = true;
}

function standard({ color, roughness = 0.65, metalness = 0, emissive = 0x000000, emissiveIntensity = 0 }) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity });
}

function makeSignTexture(title, subtitle, accent = '#ff4fa3', background = '#111328') {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 384;
  const g = canvas.getContext('2d');
  const gradient = g.createLinearGradient(0, 0, 1024, 384);
  gradient.addColorStop(0, background);
  gradient.addColorStop(1, '#071c29');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 1024, 384);
  g.strokeStyle = accent;
  g.lineWidth = 18;
  g.strokeRect(18, 18, 988, 348);
  g.fillStyle = '#f8f2e8';
  g.font = '900 112px ui-sans-serif, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(title, 512, 164);
  g.fillStyle = accent;
  g.font = '700 38px ui-sans-serif, system-ui, sans-serif';
  g.fillText(subtitle, 512, 275);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
}

function createPalette() {
  const neonPink = standard({
    color: 0xff75bd,
    emissive: 0xff188c,
    emissiveIntensity: 4.8,
    roughness: 0.22,
  });
  const neonCyan = standard({
    color: 0x65f1eb,
    emissive: 0x00b9c8,
    emissiveIntensity: 4.2,
    roughness: 0.20,
  });
  const windowGlow = standard({
    color: 0x193f55,
    emissive: 0x3fd9ee,
    emissiveIntensity: 0.72,
    roughness: 0.25,
    metalness: 0.16,
  });
  const warmWindows = standard({
    color: 0x5a3725,
    emissive: 0xff9c50,
    emissiveIntensity: 0.78,
    roughness: 0.32,
  });
  const water = new THREE.MeshPhysicalMaterial({
    color: 0x075f77,
    roughness: 0.20,
    metalness: 0.10,
    clearcoat: 0.82,
    clearcoatRoughness: 0.16,
  });
  return {
    ground: standard({ color: 0x171a20, roughness: 0.96 }),
    sand: standard({ color: 0xc6a36e, roughness: 0.95 }),
    water,
    boardwalk: standard({ color: 0x9b7555, roughness: 0.80 }),
    seaWall: standard({ color: 0xa5a0a5, roughness: 0.82 }),
    darkMetal: standard({ color: 0x151d29, metalness: 0.82, roughness: 0.34 }),
    chrome: standard({ color: 0xa7b3bd, metalness: 0.92, roughness: 0.22 }),
    glass: standard({ color: 0x173b4e, metalness: 0.32, roughness: 0.18 }),
    white: standard({ color: 0xe7e2d6, roughness: 0.60 }),
    cream: standard({ color: 0xe3cba7, roughness: 0.72 }),
    coral: standard({ color: 0xd87f78, roughness: 0.67 }),
    pink: standard({ color: 0xd38aae, roughness: 0.65 }),
    seafoam: standard({ color: 0x78bcb2, roughness: 0.62 }),
    peach: standard({ color: 0xd9a078, roughness: 0.68 }),
    lavender: standard({ color: 0x9389b7, roughness: 0.61 }),
    windowGlow,
    warmWindows,
    neonPink,
    neonCyan,
    palmTrunk: standard({ color: 0x765137, roughness: 0.92 }),
    palmLeaf: standard({ color: 0x176342, roughness: 0.78 }),
    hutRoof: standard({ color: 0x42a9ae, roughness: 0.70 }),
    yachtHull: standard({ color: 0xe9edf0, roughness: 0.36 }),
    yachtAccent: standard({ color: 0xe75088, roughness: 0.45 }),
    neonMaterials: [neonPink, neonCyan],
  };
}

function registerFootprint(route, footprints, {
  kind,
  x,
  z,
  radius,
  margin = 3.0,
  name = kind,
}) {
  const nearest = route.nearest(x, z);
  const requiredGap = DRIVEABLE_HALF_WIDTH + margin;
  const clearGap = nearest.distanceToCentre - radius;
  if (clearGap < requiredGap) return false;
  footprints.push({ kind, name, x, z, radius, requiredGap, clearGap });
  return true;
}

function routePlacement(route, fraction, lateral, height = 0) {
  const distance = route.length * fraction;
  const frame = route.atDistance(distance);
  const position = route.pointAt(distance, lateral, height);
  return { distance, frame, position };
}

function localMatrix(origin, yaw, localPosition, scale, localYaw = 0) {
  const position = localPosition.clone().applyAxisAngle(Y_AXIS, yaw).add(origin);
  const quaternion = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, yaw + localYaw);
  return compose(position, scale, 0, quaternion);
}

function buildGround(root, route, palette) {
  const ground = mesh(new THREE.PlaneGeometry(2700, 2700), palette.ground, 'ViceCoastGround', { receive: true });
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.16;
  root.add(ground);

  const ocean = mesh(new THREE.PlaneGeometry(1100, 2500, 1, 1), palette.water, 'BeachfrontOcean');
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(-910, -1.06, -40);
  root.add(ocean);

  const bay = mesh(new THREE.PlaneGeometry(1050, 430, 1, 1), palette.water, 'MarinaBayWater');
  bay.rotation.x = -Math.PI / 2;
  bay.position.set(160, -0.92, -1135);
  root.add(bay);

  const beach = mesh(new THREE.PlaneGeometry(84, 1900, 1, 1), palette.sand, 'OceanDriveBeach', { receive: true });
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(-319, -0.08, -30);
  root.add(beach);

  const beachfront = (u) => u >= 0 && u <= 0.282;
  const boardwalk = mesh(ribbonGeometry(route, {
    width: 5.4,
    offset: -13.55,
    lift: 0.145,
    uvMetres: 2.4,
    include: beachfront,
    name: 'OceanBoardwalk',
  }), palette.boardwalk, 'OceanBoardwalk', { receive: true });
  const seawall = mesh(verticalRibbonGeometry(route, {
    offset: -10.62,
    bottom: -1.05,
    height: 1.25,
    include: beachfront,
    name: 'BeachSeawall',
  }), palette.seaWall, 'BeachSeawall');
  root.add(boardwalk, seawall);

  const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xff779f, toneMapped: false, side: THREE.DoubleSide });
  const haloMaterial = new THREE.MeshBasicMaterial({
    color: 0xff3d91,
    toneMapped: false,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const horizon = new THREE.Group();
  horizon.name = 'TropicalHorizon';
  horizon.position.set(-570, 88, -1190);
  const halo = mesh(new THREE.CircleGeometry(82, 48), haloMaterial, 'SunsetHalo');
  const sun = mesh(new THREE.CircleGeometry(34, 48), sunMaterial, 'SunsetDisc');
  horizon.add(halo, sun);
  root.add(horizon);
  return { waterMaterials: [palette.water], haloMaterial };
}

function buildLifeguardHuts(root, route, palette, footprints) {
  const group = new THREE.Group();
  group.name = 'BeachLifeguardHuts';
  const bodyGeometry = new THREE.BoxGeometry(4.8, 2.7, 3.8);
  const roofGeometry = new THREE.BoxGeometry(5.5, 0.22, 4.5);
  const postGeometry = new THREE.CylinderGeometry(0.10, 0.14, 2.2, 8);
  const stepsGeometry = new THREE.BoxGeometry(1.5, 0.32, 2.4);
  const colours = [palette.coral, palette.seafoam, palette.pink, palette.peach, palette.lavender];
  const fractions = [0.043, 0.091, 0.143, 0.198, 0.248];
  fractions.forEach((fraction, index) => {
    const { frame, position } = routePlacement(route, fraction, -47.5);
    const radius = 3.8;
    if (!registerFootprint(route, footprints, {
      kind: 'beach-structure', name: `LifeguardHut_${index + 1}`,
      x: position.x, z: position.z, radius, margin: 2.5,
    })) return;
    const hut = new THREE.Group();
    hut.name = `LifeguardHut_${index + 1}`;
    hut.position.copy(position);
    hut.position.y = 0;
    hut.rotation.y = frame.heading;
    for (const [x, z] of [[-1.7, -1.25], [1.7, -1.25], [-1.7, 1.25], [1.7, 1.25]]) {
      const post = mesh(postGeometry, palette.white, 'LifeguardHutPost');
      post.position.set(x, 1.1, z);
      hut.add(post);
    }
    const body = mesh(bodyGeometry, colours[index % colours.length], 'LifeguardHutBuilding', { cast: true });
    body.position.y = 3.3;
    const roof = mesh(roofGeometry, palette.hutRoof, 'LifeguardHutRoof');
    roof.position.y = 4.75;
    roof.rotation.z = index % 2 ? -0.035 : 0.035;
    const steps = mesh(stepsGeometry, palette.white, 'LifeguardHutSteps');
    steps.position.set(0, 1.5, -2.35);
    steps.rotation.x = -0.35;
    hut.add(body, roof, steps);
    group.add(hut);
  });
  root.add(group);
}

function buildHotels(root, route, palette, footprints) {
  const architecture = new THREE.Group();
  architecture.name = 'CoastalArchitecture';
  const bodyMaterials = [palette.coral, palette.seafoam, palette.cream, palette.pink, palette.peach, palette.lavender];
  const specs = [
    [0.018, 59, 28, 43, 31, 'CASA MIRAGE'],
    [0.050, 55, 32, 48, 38, 'AZURE'],
    [0.084, 62, 29, 46, 28, 'STARFISH'],
    [0.120, 57, 35, 51, 42, 'MAR AZUL'],
    [0.158, 64, 31, 44, 34, 'FLAMINGO'],
    [0.195, 58, 38, 54, 46, 'PALM COURT'],
    [0.233, 65, 30, 47, 36, 'THE COVE'],
    [0.266, 60, 34, 50, 40, 'SOLARIS'],
  ];
  const detailGeometry = new THREE.BoxGeometry(1, 1, 1);
  const coolWindows = instance(detailGeometry, palette.windowGlow, 480, 'OceanDriveHotelWindowsCool');
  const warmWindows = instance(detailGeometry, palette.warmWindows, 480, 'OceanDriveHotelWindowsWarm');
  const pinkAwnings = instance(detailGeometry, palette.neonPink, 32, 'OceanDriveHotelAwningsPink');
  const cyanAwnings = instance(detailGeometry, palette.neonCyan, 32, 'OceanDriveHotelAwningsCyan');
  let coolWindowCount = 0;
  let warmWindowCount = 0;
  let pinkAwningCount = 0;
  let cyanAwningCount = 0;

  for (let index = 0; index < specs.length; index++) {
    const [fraction, lateral, width, depth, height, label] = specs[index];
    const { frame, position } = routePlacement(route, fraction, lateral);
    const overallWidth = width * 1.16;
    const overallDepth = depth;
    const radius = Math.hypot(overallWidth, overallDepth) * 0.5;
    if (!registerFootprint(route, footprints, {
      kind: 'art-deco-hotel', name: `ViceDecoHotel_${index + 1}`,
      x: position.x, z: position.z, radius, margin: 4.5,
    })) continue;

    const hotel = new THREE.Group();
    hotel.name = `ViceDecoHotel_${index + 1}`;
    hotel.position.copy(position);
    hotel.position.y = frame.center.y;
    hotel.rotation.y = frame.heading;
    const material = bodyMaterials[index % bodyMaterials.length];

    const base = mesh(new THREE.BoxGeometry(overallWidth, height * 0.38, overallDepth), material, 'ArtDecoHotelBuildingBase', { cast: true, receive: true });
    base.position.y = height * 0.19;
    const middle = mesh(new THREE.BoxGeometry(width * 0.84, height * 0.34, depth * 0.79), material, 'ArtDecoHotelBuildingMiddle', { cast: true });
    middle.position.y = height * 0.55;
    const crown = mesh(new THREE.BoxGeometry(width * 0.49, height * 0.28, depth * 0.57), material, 'ArtDecoHotelBuildingCrown', { cast: true });
    crown.position.y = height * 0.86;
    const glassSpine = mesh(new THREE.BoxGeometry(0.24, height * 0.72, depth * 0.33), palette.windowGlow, 'ArtDecoHotelWindowSpine');
    glassSpine.position.set(-overallWidth * 0.505, height * 0.52, 0);

    const balconyGeometry = new THREE.BoxGeometry(overallWidth * 1.02, 0.16, overallDepth * 1.018);
    for (let band = 0; band < 3; band++) {
      const balcony = mesh(balconyGeometry, palette.white, 'ArtDecoHotelBalconyBand');
      balcony.position.y = height * (0.22 + band * 0.16);
      hotel.add(balcony);
    }

    const signMaterial = new THREE.MeshBasicMaterial({
      map: makeSignTexture(label, 'OCEAN DRIVE', index % 2 ? '#62eee8' : '#ff5aae'),
      toneMapped: false,
    });
    const sign = mesh(new THREE.PlaneGeometry(Math.min(13, depth * 0.28), 3.5), signMaterial, `HotelNeonSign_${index + 1}`);
    sign.position.set(-overallWidth * 0.515, height * 0.72, 0);
    sign.rotation.y = -Math.PI / 2;

    const canopy = mesh(new THREE.BoxGeometry(5.8, 0.22, 4.6), index % 2 ? palette.neonCyan : palette.neonPink, 'HotelEntranceCanopy');
    canopy.position.set(-overallWidth * 0.56, 3.6, 0);
    hotel.add(base, middle, crown, glassSpine, sign, canopy);
    architecture.add(hotel);

    const addTierWindows = (tierWidth, tierDepth, baseY, tierHeight, floorSpacing = 3.25) => {
      let floorIndex = 0;
      for (let y = baseY + 2.65; y < baseY + tierHeight - 1.15; y += floorSpacing) {
        let bayIndex = 0;
        for (let z = -tierDepth * 0.38; z <= tierDepth * 0.38; z += 3.7) {
          const matrix = localMatrix(
            hotel.position,
            frame.heading,
            new THREE.Vector3(-tierWidth * 0.5 - 0.13, y, z),
            new THREE.Vector3(0.18, 1.25, 2.05),
          );
          if ((floorIndex + bayIndex + index) % 3 === 0) warmWindows.setMatrixAt(warmWindowCount++, matrix);
          else coolWindows.setMatrixAt(coolWindowCount++, matrix);
          bayIndex++;
        }
        floorIndex++;
      }
    };
    addTierWindows(overallWidth, overallDepth, 0, height * 0.38);
    addTierWindows(width * 0.84, depth * 0.79, height * 0.38, height * 0.34);
    addTierWindows(width * 0.49, depth * 0.57, height * 0.72, height * 0.28, 3.0);

    for (let awning = -1; awning <= 1; awning++) {
      const matrix = localMatrix(
        hotel.position,
        frame.heading,
        new THREE.Vector3(-overallWidth * 0.5 - 0.72, 2.7, awning * depth * 0.22),
        new THREE.Vector3(1.35, 0.18, Math.min(4.8, depth * 0.16)),
      );
      if ((awning + index) % 2 === 0) pinkAwnings.setMatrixAt(pinkAwningCount++, matrix);
      else cyanAwnings.setMatrixAt(cyanAwningCount++, matrix);
    }
  }
  setCount(coolWindows, coolWindowCount);
  setCount(warmWindows, warmWindowCount);
  setCount(pinkAwnings, pinkAwningCount);
  setCount(cyanAwnings, cyanAwningCount);
  architecture.add(coolWindows, warmWindows, pinkAwnings, cyanAwnings);
  root.add(architecture);
}

function buildDowntown(root, route, palette, footprints) {
  const district = new THREE.Group();
  district.name = 'NeonDowntown';
  const materials = [palette.cream, palette.lavender, palette.seafoam, palette.coral, palette.peach];
  const specs = [
    [0.600, -78, 34, 42, 66], [0.620, 92, 42, 36, 84],
    [0.651, -84, 38, 44, 58], [0.674, 78, 31, 35, 73],
    [0.704, -96, 45, 39, 96], [0.728, 88, 36, 45, 64],
    [0.758, -76, 32, 33, 76], [0.785, 96, 48, 42, 104],
    [0.815, -87, 37, 47, 71], [0.842, 84, 34, 38, 88],
    [0.870, -94, 43, 40, 62], [0.898, 82, 36, 34, 80],
  ];
  const windowGeometry = new THREE.BoxGeometry(1, 1, 1);
  const coolWindows = instance(windowGeometry, palette.windowGlow, 1200, 'DowntownTowerWindowsCool');
  const warmWindows = instance(windowGeometry, palette.warmWindows, 900, 'DowntownTowerWindowsWarm');
  let coolWindowCount = 0;
  let warmWindowCount = 0;

  specs.forEach(([fraction, lateral, width, depth, height], index) => {
    const { frame, position } = routePlacement(route, fraction, lateral);
    const radius = Math.hypot(width, depth) * 0.55;
    if (!registerFootprint(route, footprints, {
      kind: 'downtown-tower', name: `CoastalTower_${index + 1}`,
      x: position.x, z: position.z, radius, margin: 5.5,
    })) return;
    const tower = new THREE.Group();
    tower.name = `CoastalTower_${index + 1}`;
    tower.position.copy(position);
    tower.position.y = frame.center.y;
    tower.rotation.y = frame.heading + (index % 3 - 1) * 0.08;
    const material = materials[index % materials.length];

    const podium = mesh(new THREE.BoxGeometry(width * 1.08, height * 0.16, depth * 1.08), material, 'CoastalTowerBuildingPodium', { receive: true });
    podium.position.y = height * 0.08;
    const shaft = mesh(new THREE.BoxGeometry(width, height * 0.66, depth), material, 'CoastalTowerBuildingShaft', { cast: true });
    shaft.position.y = height * 0.49;
    const crown = index % 3 === 0
      ? mesh(new THREE.CylinderGeometry(width * 0.27, width * 0.38, height * 0.25, 12), material, 'CoastalTowerCrown')
      : mesh(new THREE.BoxGeometry(width * 0.68, height * 0.25, depth * 0.70), material, 'CoastalTowerCrown');
    crown.position.y = height * 0.875;
    const streetSide = -Math.sign(lateral);
    const glassSpine = mesh(new THREE.BoxGeometry(0.22, height * 0.50, depth * 0.24), palette.glass, 'CoastalTowerGlassSpine');
    glassSpine.position.set(streetSide * (width * 0.5 + 0.12), height * 0.50, 0);

    const roofTrim = mesh(new THREE.BoxGeometry(width * 0.76, 0.30, depth * 0.78), index % 2 ? palette.neonPink : palette.neonCyan, 'CoastalTowerNeonRoofTrim');
    roofTrim.position.y = height + 0.28;
    tower.add(podium, shaft, crown, glassSpine, roofTrim);

    let floorIndex = 0;
    for (let y = height * 0.22; y < height * 0.79; y += 3.9) {
      let bayIndex = 0;
      for (let z = -depth * 0.38; z <= depth * 0.38; z += 3.8) {
        const matrix = localMatrix(
          tower.position,
          tower.rotation.y,
          new THREE.Vector3(streetSide * (width * 0.5 + 0.14), y, z),
          new THREE.Vector3(0.20, 1.28, 2.08),
        );
        if ((floorIndex + bayIndex + index) % 4 === 0) warmWindows.setMatrixAt(warmWindowCount++, matrix);
        else coolWindows.setMatrixAt(coolWindowCount++, matrix);
        bayIndex++;
      }
      floorIndex++;
    }

    if (index === 4 || index === 7) {
      const signMaterial = new THREE.MeshBasicMaterial({
        map: makeSignTexture(index === 4 ? 'VICE COAST' : 'PARADISE', 'CITY OF NEON', index === 4 ? '#ff5aae' : '#5df4ef'),
        toneMapped: false,
      });
      const sign = mesh(new THREE.PlaneGeometry(15, 5.2), signMaterial, `DowntownNeonSign_${index}`);
      sign.position.set(0, height * 0.70, -depth * 0.515);
      tower.add(sign);
    }
    district.add(tower);
  });
  setCount(coolWindows, coolWindowCount);
  setCount(warmWindows, warmWindowCount);
  district.add(coolWindows, warmWindows);
  root.add(district);
}

function palmFrondGeometry() {
  const segments = 6;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const halfWidth = 0.11 * (1 - t * 0.82);
    const y = Math.sin(t * Math.PI) * 0.10 - t * t * 0.18;
    positions.push(-halfWidth, y, t, halfWidth, y, t);
    uvs.push(0, t, 1, t);
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildPalms(root, route, palette, footprints) {
  const random = seededRandom(0x51deca57);
  const candidates = [];
  for (let distance = 70; distance < route.length * 0.275; distance += 62) {
    candidates.push([distance / route.length, -18.6 - random() * 1.7]);
    if (Math.floor(distance / 62) % 2 === 0) candidates.push([distance / route.length, 20.0 + random() * 2.0]);
  }
  for (const fraction of [0.315, 0.350, 0.390, 0.655, 0.695, 0.735, 0.805, 0.855, 0.915, 0.955]) {
    candidates.push([fraction, fraction % 0.1 > 0.05 ? -20.5 : 20.5]);
  }

  const trunkGeometry = new THREE.CylinderGeometry(0.13, 0.29, 1, 8, 3);
  trunkGeometry.translate(0, 0.5, 0);
  const crownGeometry = new THREE.SphereGeometry(0.40, 9, 6);
  const trunks = instance(trunkGeometry, palette.palmTrunk, candidates.length, 'RoyalPalmTrunks', { cast: true });
  const crowns = instance(crownGeometry, palette.palmLeaf, candidates.length, 'RoyalPalmCrowns');
  const leafMaterial = palette.palmLeaf.clone();
  leafMaterial.side = THREE.DoubleSide;
  const fronds = instance(palmFrondGeometry(), leafMaterial, candidates.length * 7, 'RoyalPalmFronds');
  let treeCount = 0;
  let frondCount = 0;

  candidates.forEach(([fraction, lateral]) => {
    const { frame, position } = routePlacement(route, fraction, lateral);
    const height = 8.4 + random() * 3.8;
    if (!registerFootprint(route, footprints, {
      kind: 'palm-tree', name: `RoyalPalm_${treeCount + 1}`,
      x: position.x, z: position.z, radius: 4.4, margin: 1.6,
    })) return;
    const base = position.clone();
    base.y = frame.center.y;
    trunks.setMatrixAt(treeCount, compose(base, new THREE.Vector3(1, height, 1), frame.heading + (random() - 0.5) * 0.18));
    const top = base.clone().add(new THREE.Vector3(0, height + 0.04, 0));
    crowns.setMatrixAt(treeCount, compose(top, new THREE.Vector3(1, 1, 1)));
    for (let leaf = 0; leaf < 7; leaf++) {
      const yaw = frame.heading + leaf / 7 * Math.PI * 2 + random() * 0.18;
      const tilt = -0.22 + random() * 0.22;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, yaw, (random() - 0.5) * 0.12, 'YXZ'));
      const length = 3.6 + random() * 1.4;
      fronds.setMatrixAt(frondCount++, compose(top, new THREE.Vector3(length, length, length), 0, q));
    }
    treeCount++;
  });
  setCount(trunks, treeCount);
  setCount(crowns, treeCount);
  setCount(fronds, frondCount);
  root.add(trunks, crowns, fronds);
  return treeCount;
}

function yachtHullGeometry() {
  const positions = [
    -0.50, 0.20, 0.42, 0.50, 0.20, 0.42,
    -0.34, 0.18, -0.25, 0.34, 0.18, -0.25,
    0, 0.10, -0.62,
    -0.27, -0.38, 0.38, 0.27, -0.38, 0.38,
    -0.18, -0.34, -0.28, 0.18, -0.34, -0.28,
    0, -0.22, -0.55,
  ];
  const indices = [
    0, 1, 3, 0, 3, 2, 2, 3, 4,
    5, 8, 6, 6, 8, 9, 6, 9, 7,
    0, 5, 6, 0, 6, 1,
    1, 6, 7, 1, 7, 3, 3, 7, 9, 3, 9, 4,
    4, 9, 8, 4, 8, 2, 2, 8, 5, 2, 5, 0,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildMarina(root, route, palette, footprints) {
  const marina = new THREE.Group();
  marina.name = 'ViceCoastMarina';
  const hullGeometry = yachtHullGeometry();
  const fractions = [0.365, 0.395, 0.425, 0.448];
  fractions.forEach((fraction, index) => {
    const { frame, position } = routePlacement(route, fraction, 78 + index % 2 * 15);
    if (!registerFootprint(route, footprints, {
      kind: 'marina-yacht', name: `MarinaYacht_${index + 1}`,
      x: position.x, z: position.z, radius: 8.0, margin: 4.0,
    })) return;
    const yacht = new THREE.Group();
    yacht.name = `MarinaYacht_${index + 1}`;
    yacht.position.copy(position);
    yacht.position.y = -0.22;
    yacht.rotation.y = frame.heading + (index % 2 ? 0.11 : -0.08);
    const hull = mesh(hullGeometry, index % 2 ? palette.yachtAccent : palette.yachtHull, 'YachtHull');
    hull.scale.set(4.6, 1.8, 12.5);
    const deck = mesh(new THREE.BoxGeometry(3.6, 0.25, 6.4), palette.yachtHull, 'YachtDeck');
    deck.position.set(0, 0.55, 1.0);
    const cabin = mesh(new THREE.BoxGeometry(2.8, 1.35, 3.5), palette.white, 'YachtCabin');
    cabin.position.set(0, 1.3, 1.1);
    const glass = mesh(new THREE.BoxGeometry(2.86, 0.62, 3.56), palette.glass, 'YachtCabinGlass');
    glass.position.set(0, 1.55, 1.1);
    const mast = mesh(new THREE.CylinderGeometry(0.06, 0.08, 6.0, 8), palette.chrome, 'YachtMast');
    mast.position.set(0, 3.9, 0.6);
    yacht.add(hull, deck, cabin, glass, mast);
    marina.add(yacht);
  });

  const dockMaterial = palette.boardwalk;
  for (let index = 0; index < 4; index++) {
    const { frame, position } = routePlacement(route, 0.365 + index * 0.028, 58);
    const dock = mesh(new THREE.BoxGeometry(3.0, 0.28, 26), dockMaterial, `MarinaDock_${index + 1}`);
    dock.position.copy(position);
    dock.position.y = -0.42;
    dock.rotation.y = frame.heading;
    marina.add(dock);
  }
  root.add(marina);
}

function buildCausewaySupports(root, route, palette) {
  const start = route.length * 0.485;
  const end = route.length * 0.618;
  const capacity = Math.ceil((end - start) / 38) * 2;
  const columnGeometry = new THREE.CylinderGeometry(0.72, 0.92, 1, 10, 1);
  columnGeometry.translate(0, 0.5, 0);
  const columns = instance(columnGeometry, palette.seaWall, capacity, 'CausewayBridgeSupportColumns', { receive: true });
  const beams = instance(new THREE.BoxGeometry(1, 1, 1), palette.darkMetal, Math.ceil(capacity / 2), 'CausewayCrossBeams');
  let columnCount = 0;
  let beamCount = 0;
  for (let distance = start + 18; distance < end; distance += 38) {
    const frame = route.atDistance(distance);
    const height = Math.max(0.7, frame.center.y - 1.28);
    for (const side of [-1, 1]) {
      const position = route.pointAt(distance, side * 5.6, 0);
      position.y = -0.82;
      columns.setMatrixAt(columnCount++, compose(position, new THREE.Vector3(1, height + 0.82, 1)));
    }
    const beamPosition = frame.center.clone();
    beamPosition.y = frame.center.y - 1.32;
    beams.setMatrixAt(beamCount++, compose(beamPosition, new THREE.Vector3(16.8, 0.72, 1.1), frame.heading));
  }
  setCount(columns, columnCount);
  setCount(beams, beamCount);
  root.add(columns, beams);
}

function buildCoastalLights(root, route, palette) {
  const spacing = 54;
  const capacity = Math.ceil(route.length / spacing) * 2;
  const poleGeometry = new THREE.CylinderGeometry(0.075, 0.13, 1, 8, 1);
  poleGeometry.translate(0, 0.5, 0);
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const poolGeometry = new THREE.CircleGeometry(1, 18);
  const poles = instance(poleGeometry, palette.darkMetal, capacity, 'ViceStreetLightPoles');
  const arms = instance(boxGeometry, palette.chrome, capacity, 'ViceStreetLightArms');
  const pinkBulbs = instance(boxGeometry, palette.neonPink, capacity, 'ViceStreetLightsPink');
  const cyanBulbs = instance(boxGeometry, palette.neonCyan, capacity, 'ViceStreetLightsCyan');
  const pools = instance(poolGeometry, new THREE.MeshBasicMaterial({
    color: 0x4fe1ea, transparent: true, opacity: 0.10, depthWrite: false,
  }), capacity, 'ViceStreetLightPools');
  const poolQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  const lampPositions = [];
  let used = 0;
  let pinkCount = 0;
  let cyanCount = 0;
  let poolCount = 0;

  for (let distance = 22; distance < route.length; distance += spacing) {
    const frame = route.atDistance(distance);
    const flatRight = new THREE.Vector3(frame.right.x, 0, frame.right.z).normalize();
    for (const side of [-1, 1]) {
      const base = route.pointAt(distance, side * (DRIVEABLE_HALF_WIDTH + 3.0), 0);
      const height = distance / route.length < 0.285 ? 7.1 : 8.4;
      poles.setMatrixAt(used, compose(base, new THREE.Vector3(1, height, 1)));
      const armPosition = base.clone().add(new THREE.Vector3(0, height - 0.20, 0)).addScaledVector(flatRight, -side * 0.75);
      arms.setMatrixAt(used, compose(armPosition, new THREE.Vector3(1.55, 0.09, 0.11), frame.heading));
      const bulb = base.clone().add(new THREE.Vector3(0, height - 0.35, 0)).addScaledVector(flatRight, -side * 1.42);
      const bulbMatrix = compose(bulb, new THREE.Vector3(0.42, 0.14, 0.28), frame.heading);
      const pink = (Math.floor(distance / spacing) + (side > 0 ? 1 : 0)) % 3 === 0;
      if (pink) pinkBulbs.setMatrixAt(pinkCount++, bulbMatrix);
      else cyanBulbs.setMatrixAt(cyanCount++, bulbMatrix);
      const pool = route.pointAt(distance, side * (ROAD_HALF_WIDTH - 1.4), 0.055);
      pools.setMatrixAt(poolCount++, compose(pool, new THREE.Vector3(7.2, 7.2, 7.2), 0, poolQuaternion));
      lampPositions.push({ position: bulb, colour: pink ? 0xff4ba7 : 0x55dce9, intensity: pink ? 118 : 105 });
      used++;
    }
  }
  setCount(poles, used);
  setCount(arms, used);
  setCount(pinkBulbs, pinkCount);
  setCount(cyanBulbs, cyanCount);
  setCount(pools, poolCount);
  root.add(poles, arms, pinkBulbs, cyanBulbs, pools);

  const dynamicLights = [];
  for (let index = 0; index < 4; index++) {
    const light = new THREE.PointLight(0x55dce9, 0, 31, 2);
    light.name = `NearestViceStreetLight_${index}`;
    root.add(light);
    dynamicLights.push(light);
  }

  return {
    lampCount: used,
    update(position) {
      const nearest = lampPositions
        .map((lamp) => ({ ...lamp, d2: position.distanceToSquared(lamp.position) }))
        .sort((a, b) => a.d2 - b.d2)
        .slice(0, dynamicLights.length);
      dynamicLights.forEach((light, index) => {
        const lamp = nearest[index];
        if (!lamp || lamp.d2 > 55 * 55) {
          light.intensity = 0;
          return;
        }
        light.position.copy(lamp.position);
        light.color.setHex(lamp.colour);
        light.intensity = lamp.intensity * THREE.MathUtils.smoothstep(55 - Math.sqrt(lamp.d2), 0, 40);
      });
    },
  };
}

function buildStartGantry(root, route, palette) {
  const frame = route.atDistance(0);
  const group = new THREE.Group();
  group.name = 'StartFinishGantry';
  group.position.copy(frame.center);
  group.rotation.y = frame.heading;
  for (const x of [-8.25, 8.25]) {
    const column = mesh(new THREE.BoxGeometry(0.52, 8.8, 0.52), palette.darkMetal, 'ViceGantryColumn', { cast: true });
    column.position.set(x, 4.4, 0);
    const neon = mesh(new THREE.BoxGeometry(0.16, 8.1, 0.18), x < 0 ? palette.neonPink : palette.neonCyan, 'ViceGantryNeon');
    neon.position.set(x - Math.sign(x) * 0.34, 4.4, 0.28);
    group.add(column, neon);
  }
  const beam = mesh(new THREE.BoxGeometry(17.1, 1.20, 0.66), palette.darkMetal, 'ViceGantryBeam');
  beam.position.y = 8.25;
  const bannerMaterial = new THREE.MeshBasicMaterial({
    map: makeSignTexture('VICE COAST', 'OCEAN DRIVE · START / FINISH', '#ff57ad'),
    toneMapped: false,
  });
  const banner = mesh(new THREE.PlaneGeometry(11.8, 3.2), bannerMaterial, 'ViceCoastGantryBanner');
  banner.position.set(0, 8.25, 0.36);
  group.add(beam, banner);

  const lampStates = {};
  for (const [name, x, colour] of [['red', -1.05, 0xff2e55], ['amber', 0, 0xffbc42], ['green', 1.05, 0x36ffbb]]) {
    const material = standard({ color: 0x08090c, emissive: colour, emissiveIntensity: 0, roughness: 0.22 });
    const lamp = mesh(new THREE.SphereGeometry(0.26, 12, 8), material, `StartLight_${name}`);
    lamp.position.set(x, 6.32, 0.48);
    lamp.scale.z = 0.5;
    group.add(lamp);
    lampStates[name] = material;
  }
  root.add(group);
  return {
    object: group,
    apply(state = {}) {
      for (const name of ['red', 'amber', 'green']) lampStates[name].emissiveIntensity = state[name] ? 5.5 : 0.04;
    },
  };
}

export function buildViceCoastScenery(route, materials) {
  const root = new THREE.Group();
  root.name = 'ViceCoastScenery';
  const footprints = [];
  const palette = createPalette();
  const ground = buildGround(root, route, palette);
  buildLifeguardHuts(root, route, palette, footprints);
  buildHotels(root, route, palette, footprints);
  buildDowntown(root, route, palette, footprints);
  const palmCount = buildPalms(root, route, palette, footprints);
  buildMarina(root, route, palette, footprints);
  buildCausewaySupports(root, route, palette);
  const lights = buildCoastalLights(root, route, palette);
  const startLights = buildStartGantry(root, route, palette);
  const scoreboard = createRaceBoard(root, route, materials);
  root.userData.roadClearanceFootprints = footprints;
  root.userData.authoredAssetCounts = {
    palms: palmCount,
    hotels: footprints.filter((footprint) => footprint.kind === 'art-deco-hotel').length,
    towers: footprints.filter((footprint) => footprint.kind === 'downtown-tower').length,
    yachts: footprints.filter((footprint) => footprint.kind === 'marina-yacht').length,
  };

  return {
    object: root,
    startLights,
    scoreboard,
    lampCount: lights.lampCount,
    emitImpact() {},
    update(time, playerPosition) {
      lights.update(playerPosition);
      palette.water.color.setHSL(0.535 + Math.sin(time * 0.10) * 0.008, 0.84, 0.22);
      palette.neonMaterials.forEach((material, index) => {
        material.emissiveIntensity = (index < 2 ? 4.15 : 1.48) + Math.sin(time * 1.4 + index * 1.7) * 0.12;
      });
      ground.haloMaterial.opacity = 0.13 + Math.sin(time * 0.38) * 0.018;
    },
  };
}
