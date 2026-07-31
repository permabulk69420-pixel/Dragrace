/**
 * Quest-conscious urban, industrial and roadside scenery for Midnight Circuit.
 * Repeated props use InstancedMesh; the handful of hero signs stay individual.
 */
import * as THREE from 'three';
import { DRIVEABLE_HALF_WIDTH, ROAD_HALF_WIDTH } from './course.js';
import { makeChevronTexture, makeSignTexture, seededRandom } from './materials.js';

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

function buildGround(root, materials) {
  const ground = mesh(new THREE.PlaneGeometry(1900, 1900, 1, 1), materials.ground, 'WorldGround', { receive: true });
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.12;
  root.add(ground);

  const dock = mesh(new THREE.PlaneGeometry(1000, 250), materials.concreteDark, 'DockApron', { receive: true });
  dock.rotation.x = -Math.PI / 2;
  dock.position.set(-120, -0.06, -475);
  root.add(dock);

  const water = mesh(new THREE.PlaneGeometry(900, 260, 1, 1), materials.water, 'HarbourWater');
  water.rotation.x = -Math.PI / 2;
  water.position.set(-110, -1.25, -665);
  root.add(water);

  // Layered mountain silhouettes close the skyline without a high-poly terrain.
  const hillGeo = new THREE.ConeGeometry(1, 1, 9, 1);
  hillGeo.translate(0, 0.5, 0);
  const hills = instance(hillGeo, materials.dirt, 28, 'Hills');
  const random = seededRandom(0x4115c4e);
  for (let i = 0; i < 28; i++) {
    const angle = (i / 28) * Math.PI * 2;
    const radius = 650 + random() * 180;
    const p = new THREE.Vector3(Math.cos(angle) * radius - 80, -0.1, Math.sin(angle) * radius - 30);
    const h = 65 + random() * 150;
    hills.setMatrixAt(i, compose(p, new THREE.Vector3(80 + random() * 120, h, 80 + random() * 120), random() * Math.PI));
  }
  setCount(hills, 28);
  root.add(hills);
}

function buildCity(root, route, materials) {
  const random = seededRandom(0x00c17e5);
  const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
  buildingGeo.translate(0, 0.5, 0);
  const roofGeo = new THREE.BoxGeometry(1, 1, 1);
  roofGeo.translate(0, 0.5, 0);
  const max = 260;
  const buildings = instance(buildingGeo, materials.building, max, 'CityBuildings', { receive: true });
  const roofs = instance(roofGeo, materials.roof, max, 'RooftopUnits');
  const districts = [
    { minX: 120, maxX: 520, minZ: -215, maxZ: 410, count: 105, minH: 13, maxH: 72 },
    { minX: -170, maxX: 245, minZ: 245, maxZ: 570, count: 76, minH: 10, maxH: 46 },
    { minX: -610, maxX: -315, minZ: -280, maxZ: 300, count: 42, minH: 9, maxH: 34 },
    { minX: -70, maxX: 390, minZ: -455, maxZ: -250, count: 28, minH: 8, maxH: 24 },
  ];

  let used = 0;
  for (const district of districts) {
    let accepted = 0;
    for (let tries = 0; tries < district.count * 12 && accepted < district.count && used < max; tries++) {
      const x = THREE.MathUtils.lerp(district.minX, district.maxX, random());
      const z = THREE.MathUtils.lerp(district.minZ, district.maxZ, random());
      const nearest = route.nearest(x, z);
      if (nearest.distanceToCentre < 27 + random() * 10) continue;
      const width = 10 + random() * 23;
      const depth = 10 + random() * 24;
      const height = THREE.MathUtils.lerp(district.minH, district.maxH, Math.pow(random(), 1.55));
      const yaw = Math.round(random() * 2) * Math.PI / 2;
      buildings.setMatrixAt(used, compose(new THREE.Vector3(x, 0, z), new THREE.Vector3(width, height, depth), yaw));
      const colour = new THREE.Color().setHSL(0.56 + random() * 0.08, 0.08 + random() * 0.15, 0.45 + random() * 0.28);
      buildings.setColorAt(used, colour);

      const unitW = width * (0.18 + random() * 0.22);
      const unitD = depth * (0.18 + random() * 0.22);
      roofs.setMatrixAt(used, compose(
        new THREE.Vector3(x + (random() - 0.5) * width * 0.4, height, z + (random() - 0.5) * depth * 0.4),
        new THREE.Vector3(unitW, 1.1 + random() * 2.4, unitD),
        yaw
      ));
      used++;
      accepted++;
    }
  }
  setCount(buildings, used);
  setCount(roofs, used);
  root.add(buildings, roofs);
}

function buildIndustrialDistrict(root, route, materials) {
  const random = seededRandom(0x1ad057a1);
  const warehouseGeo = new THREE.BoxGeometry(1, 1, 1);
  warehouseGeo.translate(0, 0.5, 0);
  const warehouses = instance(warehouseGeo, materials.warehouse, 40, 'Warehouses', { receive: true });
  let warehouseCount = 0;
  for (let tries = 0; tries < 300 && warehouseCount < 34; tries++) {
    const x = -560 + random() * 660;
    const z = -560 + random() * 265;
    if (route.nearest(x, z).distanceToCentre < 31) continue;
    const w = 22 + random() * 38;
    const d = 28 + random() * 55;
    const h = 7 + random() * 8;
    const yaw = Math.round(random()) * Math.PI / 2;
    warehouses.setMatrixAt(warehouseCount++, compose(new THREE.Vector3(x, 0, z), new THREE.Vector3(w, h, d), yaw));
  }
  setCount(warehouses, warehouseCount);
  root.add(warehouses);

  const containerGeo = new THREE.BoxGeometry(2.44, 2.59, 6.06);
  containerGeo.translate(0, 1.295, 0);
  const containers = instance(containerGeo, materials.container, 190, 'ShippingContainers', { receive: true });
  const colours = [0xb43a2f, 0x235b83, 0x2f7556, 0xd18a27, 0x70757c, 0x7a3e70];
  let containerCount = 0;
  const yards = [
    { x: -390, z: -505, w: 280, d: 95 },
    { x: 35, z: -420, w: 190, d: 105 },
  ];
  for (const yard of yards) {
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 13; col++) {
        if (containerCount >= 190 || random() < 0.19) continue;
        const x = yard.x - yard.w / 2 + 10 + col * (yard.w - 20) / 12 + (random() - 0.5) * 1.2;
        const z = yard.z - yard.d / 2 + 9 + row * (yard.d - 18) / 6;
        if (route.nearest(x, z).distanceToCentre < 24) continue;
        const stack = random() > 0.64 ? 2 : 1;
        for (let level = 0; level < stack && containerCount < 190; level++) {
          const p = new THREE.Vector3(x, level * 2.62, z);
          containers.setMatrixAt(containerCount, compose(p, new THREE.Vector3(1, 1, 1), Math.PI / 2));
          containers.setColorAt(containerCount, new THREE.Color(colours[Math.floor(random() * colours.length)]));
          containerCount++;
        }
      }
    }
  }
  setCount(containers, containerCount);
  root.add(containers);

  const tankGeo = new THREE.CylinderGeometry(1, 1, 1, 14, 1);
  tankGeo.translate(0, 0.5, 0);
  const tanks = instance(tankGeo, materials.metal, 18, 'StorageTanks', { receive: true });
  for (let i = 0; i < 18; i++) {
    const row = Math.floor(i / 6);
    const col = i % 6;
    const r = 5 + random() * 3;
    const h = 10 + random() * 14;
    tanks.setMatrixAt(i, compose(new THREE.Vector3(-590 + col * 23, 0, -465 + row * 29), new THREE.Vector3(r, h, r)));
  }
  setCount(tanks, 18);
  root.add(tanks);

  const railMat = new THREE.MeshStandardMaterial({ color: 0x8a8f94, metalness: 0.9, roughness: 0.38 });
  for (const x of [-70, -66]) {
    const rail = mesh(new THREE.BoxGeometry(0.12, 0.11, 350), railMat, 'DockRail');
    rail.position.set(x, 0.03, -460);
    root.add(rail);
  }

  for (const [x, z, flip] of [[-510, -585, 0], [-285, -605, 0.15], [25, -555, -0.2]]) {
    root.add(makeCrane(x, z, flip, materials));
  }
}

function makeCrane(x, z, yaw, materials) {
  const g = new THREE.Group();
  g.name = 'ContainerCrane';
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  const legs = [-10, 10];
  for (const lx of legs) {
    const leg = mesh(new THREE.BoxGeometry(1.2, 34, 1.2), materials.darkMetal, 'CraneLeg');
    leg.position.set(lx, 17, 0);
    leg.rotation.z = lx < 0 ? -0.1 : 0.1;
    g.add(leg);
  }
  const top = mesh(new THREE.BoxGeometry(34, 1.7, 2.0), materials.darkMetal, 'CraneTop');
  top.position.y = 33;
  g.add(top);
  const boom = mesh(new THREE.BoxGeometry(58, 1.3, 1.5), materials.barrierStripe, 'CraneBoom');
  boom.position.set(14, 36, 0);
  boom.rotation.z = -0.08;
  g.add(boom);
  const cab = mesh(new THREE.BoxGeometry(4.5, 3.5, 4), materials.coolLamp, 'CraneCab');
  cab.position.set(-4, 30.5, 0);
  g.add(cab);
  return g;
}

function buildViaductSupports(root, route, materials) {
  const start = 0.245 * route.length;
  const end = 0.505 * route.length;
  const pillarGeo = new THREE.CylinderGeometry(1.45, 1.9, 1, 10, 1);
  pillarGeo.translate(0, 0.5, 0);
  const beamGeo = new THREE.BoxGeometry(1, 1, 1);
  const pillars = instance(pillarGeo, materials.concreteDark, 64, 'ViaductPillars', { receive: true });
  const beams = instance(beamGeo, materials.concreteDark, 48, 'ViaductCrossbeams');
  let pillarCount = 0;
  let beamCount = 0;
  for (let d = start; d <= end; d += 42) {
    const frame = route.atDistance(d);
    const height = Math.max(2, frame.center.y - 1.15);
    pillars.setMatrixAt(pillarCount++, compose(new THREE.Vector3(frame.center.x, 0, frame.center.z), new THREE.Vector3(1, height, 1)));
    beams.setMatrixAt(beamCount++, compose(
      new THREE.Vector3(frame.center.x, frame.center.y - 1.45, frame.center.z),
      new THREE.Vector3(18, 1.05, 1.8),
      frame.heading
    ));
  }

  // The downtown descent crosses over the final boulevard. Twin offset piers
  // preserve the lower carriageway while making the upper deck feel supported.
  const flyoverStart = 0.53 * route.length;
  const flyoverEnd = 0.605 * route.length;
  for (let d = flyoverStart; d <= flyoverEnd; d += 48) {
    const frame = route.atDistance(d);
    const height = Math.max(2.2, frame.center.y - 1.15);
    for (const side of [-1, 1]) {
      const p = route.pointAt(d, side * 10.4, 0);
      p.y = 0;
      pillars.setMatrixAt(pillarCount++, compose(p, new THREE.Vector3(0.66, height, 0.66)));
    }
    beams.setMatrixAt(beamCount++, compose(
      new THREE.Vector3(frame.center.x, frame.center.y - 1.4, frame.center.z),
      new THREE.Vector3(23, 0.9, 1.5),
      frame.heading
    ));
  }
  setCount(pillars, pillarCount);
  setCount(beams, beamCount);
  root.add(pillars, beams);
}

function buildStreetLights(root, route, materials) {
  const spacing = 43;
  const count = Math.ceil(route.length / spacing) * 2;
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.13, 1, 7, 1);
  poleGeo.translate(0, 0.5, 0);
  const headGeo = new THREE.BoxGeometry(1, 1, 1);
  const poolGeo = new THREE.CircleGeometry(1, 18);
  const poles = instance(poleGeo, materials.darkMetal, count, 'StreetLightPoles');
  const arms = instance(headGeo, materials.darkMetal, count, 'StreetLightArms');
  const bulbs = instance(headGeo, materials.lamp, count, 'StreetLightBulbs');
  const pools = instance(poolGeo, materials.sodiumGlow, count, 'StreetLightPools');
  const lampPositions = [];
  let used = 0;

  const poolQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  for (let d = 20; d < route.length; d += spacing) {
    const u = d / route.length;
    // The tunnel has its own ceiling fixtures.
    if (u > 0.695 && u < 0.805) continue;
    const frame = route.atDistance(d);
    const flatRight = new THREE.Vector3(frame.right.x, 0, frame.right.z).normalize();
    for (const side of [-1, 1]) {
      const base = route.pointAt(d, side * (DRIVEABLE_HALF_WIDTH + 2.35), 0);
      const height = u > 0.24 && u < 0.51 ? 9.8 : 8.3;
      poles.setMatrixAt(used, compose(base, new THREE.Vector3(1, height, 1)));
      const armCentre = base.clone().add(new THREE.Vector3(0, height - 0.28, 0)).addScaledVector(flatRight, -side * 0.72);
      arms.setMatrixAt(used, compose(armCentre, new THREE.Vector3(1.55, 0.09, 0.10), frame.heading));
      const bulb = base.clone().add(new THREE.Vector3(0, height - 0.42, 0)).addScaledVector(flatRight, -side * 1.38);
      bulbs.setMatrixAt(used, compose(bulb, new THREE.Vector3(0.42, 0.13, 0.28), frame.heading));
      const pool = route.pointAt(d, side * (ROAD_HALF_WIDTH - 1.65), 0.035);
      pools.setMatrixAt(used, compose(pool, new THREE.Vector3(7.2, 7.2, 7.2), 0, poolQuaternion));
      lampPositions.push({ position: bulb, colour: 0xff9e45, intensity: 145 });
      used++;
    }
  }

  setCount(poles, used);
  setCount(arms, used);
  setCount(bulbs, used);
  setCount(pools, used);
  root.add(poles, arms, bulbs, pools);

  // Cool fluorescent strips and light points inside the tunnel.
  const tunnelStart = route.length * 0.70;
  const tunnelEnd = route.length * 0.80;
  const tunnelCount = Math.ceil((tunnelEnd - tunnelStart) / 15);
  const tunnelFixtures = instance(headGeo, materials.coolLamp, tunnelCount, 'TunnelLights');
  let tunnelUsed = 0;
  for (let d = tunnelStart + 8; d < tunnelEnd; d += 15) {
    const frame = route.atDistance(d);
    const p = frame.center.clone().addScaledVector(frame.normal, 7.55);
    tunnelFixtures.setMatrixAt(tunnelUsed++, compose(p, new THREE.Vector3(4.2, 0.12, 0.32), frame.heading));
    lampPositions.push({ position: p, colour: 0x72ccff, intensity: 115 });
  }
  setCount(tunnelFixtures, tunnelUsed);
  root.add(tunnelFixtures);

  // A small moving pool of real lights gives local depth without asking Quest
  // to shade the entire course against hundreds of PointLights.
  const dynamicLights = [];
  for (let i = 0; i < 4; i++) {
    const light = new THREE.PointLight(0xffa252, 0, 28, 2);
    light.name = `NearestStreetLight_${i}`;
    root.add(light);
    dynamicLights.push(light);
  }

  function update(position) {
    const nearest = [];
    for (const lamp of lampPositions) {
      const d2 = position.distanceToSquared(lamp.position);
      let insert = nearest.length;
      while (insert > 0 && nearest[insert - 1].d2 > d2) insert--;
      if (insert < 4) {
        nearest.splice(insert, 0, { ...lamp, d2 });
        if (nearest.length > 4) nearest.pop();
      }
    }
    dynamicLights.forEach((light, i) => {
      const lamp = nearest[i];
      if (!lamp || lamp.d2 > 52 * 52) {
        light.intensity = 0;
        return;
      }
      light.position.copy(lamp.position);
      light.color.setHex(lamp.colour);
      light.intensity = lamp.intensity * THREE.MathUtils.smoothstep(52 - Math.sqrt(lamp.d2), 0, 38);
    });
  }

  return { update, lampCount: used + tunnelUsed };
}

function buildChevrons(root, route) {
  const leftMaterial = new THREE.MeshBasicMaterial({ map: makeChevronTexture(-1), toneMapped: false });
  const rightMaterial = new THREE.MeshBasicMaterial({ map: makeChevronTexture(1), toneMapped: false });
  const geometry = new THREE.PlaneGeometry(2.15, 0.8);
  const turns = [0.085, 0.135, 0.205, 0.285, 0.385, 0.475, 0.565, 0.635, 0.69, 0.81, 0.865, 0.925];
  const left = instance(geometry, leftMaterial, turns.length * 5, 'LeftChevronSigns');
  const right = instance(geometry, rightMaterial, turns.length * 5, 'RightChevronSigns');
  let leftCount = 0;
  let rightCount = 0;
  const dummy = new THREE.Object3D();

  for (const fraction of turns) {
    const base = fraction * route.length;
    const probe = route.atDistance(base);
    const turnLeft = probe.bank >= 0;
    const outerSide = turnLeft ? 1 : -1;
    for (let i = -2; i <= 2; i++) {
      const frame = route.atDistance(base + i * 7.5);
      const p = route.pointAt(base + i * 7.5, outerSide * (DRIVEABLE_HALF_WIDTH + 0.72), 1.28);
      dummy.position.copy(p);
      dummy.up.copy(frame.normal);
      dummy.lookAt(frame.center.clone().addScaledVector(frame.normal, 1.2));
      dummy.updateMatrix();
      if (turnLeft) left.setMatrixAt(leftCount++, dummy.matrix);
      else right.setMatrixAt(rightCount++, dummy.matrix);
    }
  }
  setCount(left, leftCount);
  setCount(right, rightCount);
  root.add(left, right);
}

function buildBillboards(root, route, materials, animatedMaterials) {
  const definitions = [
    [0.055, -1, 'REDLINE', 'PERFORMANCE', '#ff4b35'],
    [0.165, 1, 'NITRO CITY', 'MIDNIGHT RUN', '#44d7ff'],
    [0.305, -1, 'APEX', 'MOTORSPORT', '#ffd13d'],
    [0.455, 1, 'VELOCITY', 'TUNING HOUSE', '#b45cff'],
    [0.555, -1, 'UNDERGROUND', 'NO RULES AFTER DARK', '#ff3f8d'],
    [0.675, 1, 'BLACKTOP', 'STREET SERIES', '#ff682d'],
    [0.825, -1, 'BOOST', 'GARAGE 24/7', '#55ffaf'],
    [0.935, 1, 'MIDNIGHT', 'CIRCUIT', '#52c9ff'],
  ];

  const supportGeometry = new THREE.BoxGeometry(1, 1, 1);
  const supports = instance(supportGeometry, materials.darkMetal, definitions.length * 6, 'BillboardStructures');
  let supportCount = 0;

  for (const [fraction, side, title, sub, colour] of definitions) {
    const frame = route.atDistance(route.length * fraction);
    const group = new THREE.Group();
    group.name = `Billboard_${title}`;
    const p = route.pointAt(route.length * fraction, side * (DRIVEABLE_HALF_WIDTH + 7.8), 0);
    group.position.copy(p);
    const signYaw = Math.atan2(frame.center.x - p.x, frame.center.z - p.z);
    group.rotation.y = signYaw;
    const boardMaterial = new THREE.MeshStandardMaterial({
      map: makeSignTexture(title, { sub, colour }),
      emissiveMap: null,
      emissive: new THREE.Color(colour),
      emissiveIntensity: 0.45,
      roughness: 0.48,
      metalness: 0.12,
      toneMapped: false,
    });
    animatedMaterials.push(boardMaterial);
    const board = mesh(new THREE.PlaneGeometry(11.5, 4.25), boardMaterial, 'BillboardFace');
    board.position.set(0, 6.1, 0.13);
    group.add(board);
    const addSupport = (localPosition, scale) => {
      const worldPosition = localPosition.clone().applyAxisAngle(Y_AXIS, signYaw).add(p);
      supports.setMatrixAt(supportCount++, compose(worldPosition, scale, signYaw));
    };
    for (const x of [-4.1, 4.1]) {
      addSupport(new THREE.Vector3(x, 2.05, 0), new THREE.Vector3(0.22, 4.1, 0.22));
    }
    for (const y of [3.85, 8.35]) {
      addSupport(new THREE.Vector3(0, y, 0.08), new THREE.Vector3(12.0, 0.22, 0.22));
    }
    for (const x of [-5.9, 5.9]) {
      addSupport(new THREE.Vector3(x, 6.1, 0.08), new THREE.Vector3(0.22, 4.7, 0.22));
    }
    root.add(group);
  }
  setCount(supports, supportCount);
  root.add(supports);
}

function buildNeonStorefronts(root, route, animatedMaterials) {
  const signs = [
    [0.505, -1, 'ELECTRIC AVE', '#21d8ff'],
    [0.535, 1, 'CLUB 99', '#ff3ec9'],
    [0.590, -1, 'IMPORT TUNER', '#7dff5c'],
    [0.895, 1, 'NIGHT MARKET', '#ffb52e'],
    [0.915, -1, 'DYNO LAB', '#ff4638'],
    [0.955, 1, 'OPEN 24H', '#4ad7ff'],
  ];
  for (const [fraction, side, label, colour] of signs) {
    const d = route.length * fraction;
    const frame = route.atDistance(d);
    const material = new THREE.MeshBasicMaterial({
      map: makeSignTexture(label, { colour, background: '#020306', width: 768, height: 256 }),
      transparent: true,
      toneMapped: false,
    });
    material.userData.baseOpacity = 0.82 + Math.random() * 0.16;
    animatedMaterials.push(material);
    const sign = mesh(new THREE.PlaneGeometry(7.2, 2.4), material, `Neon_${label}`);
    const p = route.pointAt(d, side * (DRIVEABLE_HALF_WIDTH + 4.6), 4.4);
    sign.position.copy(p);
    sign.rotation.y = Math.atan2(frame.center.x - p.x, frame.center.z - p.z);
    root.add(sign);
  }
}

function createRaceBoard(root, route, materials) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d');
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  const faceMaterial = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  const group = new THREE.Group();
  group.name = 'CircuitScoreboard';
  const frame = route.atDistance(38);
  group.position.copy(route.pointAt(38, -13.5, 0));
  group.rotation.y = Math.atan2(frame.center.x - group.position.x, frame.center.z - group.position.z);
  const surround = mesh(new THREE.BoxGeometry(7.2, 4.2, 0.34), materials.darkMetal, 'ScoreboardFrame');
  surround.position.y = 5.7;
  group.add(surround);
  const face = mesh(new THREE.PlaneGeometry(6.75, 3.75), faceMaterial, 'ScoreboardFace');
  face.position.set(0, 5.7, 0.19);
  group.add(face);
  for (const x of [-2.7, 2.7]) {
    const leg = mesh(new THREE.BoxGeometry(0.24, 3.8, 0.24), materials.darkMetal, 'ScoreboardLeg');
    leg.position.set(x, 1.9, 0);
    group.add(leg);
  }
  root.add(group);

  function draw(data = {}) {
    g.fillStyle = '#03070b';
    g.fillRect(0, 0, 1024, 512);
    g.fillStyle = '#ff542f';
    g.fillRect(0, 0, 1024, 14);
    g.fillStyle = '#eaf5ff';
    g.font = '900 64px ui-sans-serif, system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(data.title ?? 'MIDNIGHT CIRCUIT', 512, 85);
    const cells = data.cells ?? [['LAP', '--'], ['TIME', '--'], ['SPLIT', '--'], ['SPEED', '--']];
    cells.slice(0, 4).forEach(([label, value, colour], i) => {
      const x = 42 + i * 244;
      g.fillStyle = '#101a24';
      g.fillRect(x, 125, 216, 325);
      g.fillStyle = '#778da5';
      g.font = '700 30px ui-sans-serif, system-ui, sans-serif';
      g.fillText(String(label), x + 108, 185);
      g.fillStyle = colour ?? '#7fe4ff';
      g.font = '900 52px ui-monospace, monospace';
      g.fillText(String(value), x + 108, 320);
    });
    texture.needsUpdate = true;
  }
  draw();
  return { object: group, draw, texture };
}

function buildStartGantry(root, route, materials, animatedMaterials) {
  const frame = route.atDistance(0);
  const group = new THREE.Group();
  group.name = 'StartFinishGantry';
  group.position.copy(frame.center);
  group.rotation.y = frame.heading;

  for (const x of [-8.25, 8.25]) {
    const column = mesh(new THREE.BoxGeometry(0.55, 8.8, 0.55), materials.darkMetal, 'GantryColumn', { cast: true });
    column.position.set(x, 4.4, 0);
    group.add(column);
  }
  const beam = mesh(new THREE.BoxGeometry(17.1, 1.25, 0.65), materials.darkMetal, 'GantryBeam');
  beam.position.y = 8.25;
  group.add(beam);

  const bannerMaterial = new THREE.MeshBasicMaterial({
    map: makeSignTexture('MIDNIGHT CIRCUIT', { sub: 'START / FINISH', colour: '#ff5a30' }),
    toneMapped: false,
  });
  animatedMaterials.push(bannerMaterial);
  const banner = mesh(new THREE.PlaneGeometry(11.8, 3.2), bannerMaterial, 'GantryBanner');
  banner.position.set(0, 8.25, 0.36);
  group.add(banner);

  const lampStates = {};
  const lights = [
    ['red', -1.05, 0xff2e24],
    ['amber', 0, 0xffa51f],
    ['green', 1.05, 0x35ff72],
  ];
  for (const [name, x, colour] of lights) {
    const material = new THREE.MeshStandardMaterial({ color: 0x090909, emissive: colour, emissiveIntensity: 0, roughness: 0.25 });
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
      for (const name of ['red', 'amber', 'green']) {
        lampStates[name].emissiveIntensity = state[name] ? 5.5 : 0.05;
      }
    },
  };
}

export function buildScenery(route, materials) {
  const root = new THREE.Group();
  root.name = 'CourseScenery';
  const animatedMaterials = [];

  buildGround(root, materials);
  buildCity(root, route, materials);
  buildIndustrialDistrict(root, route, materials);
  buildViaductSupports(root, route, materials);
  const streetLights = buildStreetLights(root, route, materials);
  buildChevrons(root, route);
  buildBillboards(root, route, materials, animatedMaterials);
  buildNeonStorefronts(root, route, animatedMaterials);
  const startLights = buildStartGantry(root, route, materials, animatedMaterials);
  const scoreboard = createRaceBoard(root, route, materials);

  function update(time, playerPosition) {
    streetLights.update(playerPosition);
    for (let i = 0; i < animatedMaterials.length; i++) {
      const material = animatedMaterials[i];
      if ('emissiveIntensity' in material) material.emissiveIntensity = 0.42 + Math.sin(time * 1.7 + i * 1.91) * 0.09;
      if ('opacity' in material && material.transparent) {
        const flicker = (i % 3 === 0 && Math.sin(time * 18 + i) > 0.965) ? 0.45 : 1;
        material.opacity = (material.userData.baseOpacity ?? 1) * flicker;
      }
    }
    materials.water.color.setHSL(0.55 + Math.sin(time * 0.08) * 0.008, 0.68, 0.09);
  }

  return {
    object: root,
    startLights,
    scoreboard,
    update,
    lampCount: streetLights.lampCount,
  };
}
