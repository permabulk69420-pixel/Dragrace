/**
 * Quest-conscious urban, industrial and roadside scenery for Midnight Circuit.
 * Repeated props use InstancedMesh; the handful of hero signs stay individual.
 */
import * as THREE from 'three';
import { DRIVEABLE_HALF_WIDTH, ROAD_HALF_WIDTH } from './course.js';
import { makeChevronTexture, makeSignTexture, seededRandom } from './materials.js';
import { buildRoadsideDetails } from './roadsideDetails.js';
import { buildArchitecturalLandmarks } from './landmarks.js';
import { buildIndustrialLandmarks } from './industrialLandmarks.js';

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

function instancedBeams(group, definitions, material, name) {
  const object = instance(new THREE.BoxGeometry(1, 1, 1), material, definitions.length, name);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  definitions.forEach(({ a, b, thickness }, index) => {
    const direction = b.clone().sub(a);
    const length = direction.length();
    quaternion.setFromUnitVectors(Y_AXIS, direction.normalize());
    matrix.compose(
      a.clone().lerp(b, 0.5),
      quaternion,
      new THREE.Vector3(thickness, length, thickness)
    );
    object.setMatrixAt(index, matrix);
  });
  setCount(object, definitions.length);
  group.add(object);
  return object;
}

function normaliseUnitGeometry(geometry) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  geometry.translate(-centre.x, -box.min.y, -centre.z);
  geometry.scale(1 / size.x, 1 / size.y, 1 / size.z);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function extrudedFootprint(points, { bevel = 0.025 } = {}) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], index) => index ? shape.lineTo(x, y) : shape.moveTo(x, y));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 1,
    steps: 1,
    curveSegments: 1,
    bevelEnabled: bevel > 0,
    bevelSegments: 1,
    bevelSize: bevel,
    bevelThickness: bevel,
  });
  // Shape XY becomes footprint XZ; extrusion depth becomes building height.
  geometry.rotateX(-Math.PI / 2);
  return normaliseUnitGeometry(geometry);
}

function chamferedTowerGeometry() {
  return extrudedFootprint([
    [-0.40, -0.50], [0.40, -0.50], [0.50, -0.40], [0.50, 0.40],
    [0.40, 0.50], [-0.40, 0.50], [-0.50, 0.40], [-0.50, -0.40],
  ], { bevel: 0.035 });
}

function setbackTowerGeometry() {
  const positions = [];
  const normals = [];
  const uvs = [];
  const appendTier = (width, height, depth, centreY, vScale, vOffset) => {
    const source = new THREE.BoxGeometry(width, height, depth).toNonIndexed();
    source.translate(0, centreY, 0);
    positions.push(...source.getAttribute('position').array);
    normals.push(...source.getAttribute('normal').array);
    const sourceUvs = source.getAttribute('uv').array;
    for (let i = 0; i < sourceUvs.length; i += 2) {
      uvs.push(sourceUvs[i], sourceUvs[i + 1] * vScale + vOffset);
    }
    source.dispose();
  };
  appendTier(1, 0.62, 1, 0.31, 0.62, 0);
  appendTier(0.72, 0.38, 0.80, 0.81, 0.38, 0.62);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingSphere();
  return geometry;
}

function tieredBoxGeometry(tiers) {
  const positions = [];
  const normals = [];
  const uvs = [];
  for (const tier of tiers) {
    const source = new THREE.BoxGeometry(tier.width, tier.height, tier.depth).toNonIndexed();
    source.translate(tier.x ?? 0, tier.y, tier.z ?? 0);
    positions.push(...source.getAttribute('position').array);
    normals.push(...source.getAttribute('normal').array);
    uvs.push(...source.getAttribute('uv').array);
    source.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingSphere();
  return geometry;
}

function crownedTowerGeometry() {
  return tieredBoxGeometry([
    { width: 1.00, height: 0.12, depth: 1.00, y: 0.06 },
    { width: 0.68, height: 0.72, depth: 0.72, y: 0.48 },
    { width: 0.90, height: 0.10, depth: 0.90, y: 0.89 },
    { width: 0.42, height: 0.11, depth: 0.42, y: 0.965 },
  ]);
}

function slabHotelGeometry() {
  return tieredBoxGeometry([
    { width: 1.00, height: 0.86, depth: 0.52, y: 0.43 },
    { width: 0.20, height: 1.00, depth: 0.64, x: 0.36, y: 0.50 },
    { width: 1.06, height: 0.04, depth: 0.58, y: 0.88 },
  ]);
}

function gabledWarehouseGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, 0);
  shape.lineTo(0.5, 0);
  shape.lineTo(0.5, 0.72);
  shape.lineTo(0, 1);
  shape.lineTo(-0.5, 0.72);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 1,
    steps: 1,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -0.5);
  return normaliseUnitGeometry(geometry);
}

function footprintClearance(route, x, z, width, depth, margin = 4.25) {
  const radius = Math.hypot(width, depth) * 0.5;
  const distanceToRoad = route.nearest(x, z).distanceToCentre;
  const clearGap = distanceToRoad - radius;
  return {
    ok: clearGap >= DRIVEABLE_HALF_WIDTH + margin,
    radius,
    clearGap,
    requiredGap: DRIVEABLE_HALF_WIDTH + margin,
  };
}

function ridgeTerrainGeometry({
  radiusX,
  radiusZ,
  height,
  seed,
  phase = 0,
  segments = 144,
  centreX = -70,
  centreZ = -40,
}) {
  const random = seededRandom(seed);
  const knots = Array.from({ length: 18 }, () => 0.58 + random() * 0.72);
  const positions = [];
  const uvs = [];
  const indices = [];
  const sampleHeight = (angle, index) => {
    const scaled = (index / segments) * knots.length;
    const a = Math.floor(scaled) % knots.length;
    const b = (a + 1) % knots.length;
    const t = scaled - Math.floor(scaled);
    const eased = t * t * (3 - 2 * t);
    const broad = Math.sin(angle * 3 + phase) * 0.13 + Math.sin(angle * 7 - phase * 0.7) * 0.08;
    return height * (THREE.MathUtils.lerp(knots[a], knots[b], eased) + broad);
  };

  for (let i = 0; i <= segments; i++) {
    const wrapped = i === segments ? 0 : i;
    const angle = (wrapped / segments) * Math.PI * 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const ripple = 1 + Math.sin(angle * 5 + phase) * 0.035;
    const ridgeX = c * radiusX * ripple + centreX;
    const ridgeZ = s * radiusZ * ripple + centreZ;
    positions.push(
      c * radiusX * 0.78 + centreX, -7.5, s * radiusZ * 0.78 + centreZ,
      ridgeX, sampleHeight(angle, wrapped), ridgeZ,
      c * radiusX * 1.19 + centreX, -13, s * radiusZ * 1.19 + centreZ
    );
    const u = i / segments;
    uvs.push(u, 0, u, 0.54, u, 1);
  }

  for (let i = 0; i < segments; i++) {
    const a = i * 3;
    const b = (i + 1) * 3;
    indices.push(
      a, b, b + 1, a, b + 1, a + 1,
      a + 1, b + 1, b + 2, a + 1, b + 2, a + 2
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function projectedGroundRibbon(route, { start, end, width }) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i < route.sampleCount; i++) {
    const u = (i + 0.5) / route.sampleCount;
    if (u < start || u > end) continue;
    const a = route.frames[i];
    const b = route.frames[i + 1];
    const aRight = new THREE.Vector3(a.right.x, 0, a.right.z).normalize();
    const bRight = new THREE.Vector3(b.right.x, 0, b.right.z).normalize();
    const points = [
      new THREE.Vector3(a.center.x, 0.012, a.center.z).addScaledVector(aRight, -width / 2),
      new THREE.Vector3(a.center.x, 0.012, a.center.z).addScaledVector(aRight, width / 2),
      new THREE.Vector3(b.center.x, 0.012, b.center.z).addScaledVector(bRight, width / 2),
      new THREE.Vector3(b.center.x, 0.012, b.center.z).addScaledVector(bRight, -width / 2),
    ];
    const base = positions.length / 3;
    for (const point of points) {
      positions.push(point.x, point.y, point.z);
      normals.push(0, 1, 0);
    }
    const v0 = a.distance / 8;
    const v1 = b.distance / 8;
    uvs.push(0, v0, 1, v0, 1, v1, 0, v1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
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

  // Continuous, softly rolling ridge bands replace the old collection of
  // giant cone primitives. Their peaks are interpolated from broad seeded
  // knots, so the horizon reads as terrain instead of repeated pyramids.
  const farRidge = mesh(ridgeTerrainGeometry({
    radiusX: 920,
    radiusZ: 850,
    height: 58,
    seed: 0xf417e2,
    phase: 1.7,
  }), materials.terrainFar, 'FarMountainRidge', { receive: true });
  const nearRidge = mesh(ridgeTerrainGeometry({
    radiusX: 735,
    radiusZ: 680,
    height: 45,
    seed: 0x4115c4e,
    phase: 0.35,
  }), materials.terrainNear, 'NearMountainRidge', { receive: true });
  root.add(farRidge, nearRidge);
}

function buildCity(root, route, materials, avoidFootprints = []) {
  const random = seededRandom(0x00c17e5);
  const group = new THREE.Group();
  group.name = 'CityBuildings';
  const max = 112;
  const chamfered = instance(chamferedTowerGeometry(), materials.buildingGlass, max, 'ChamferedTowers', { receive: true });
  const setback = instance(setbackTowerGeometry(), materials.buildingConcrete, max, 'SetbackTowers', { receive: true });
  const roundGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 14, 1, false);
  roundGeo.translate(0, 0.5, 0);
  const round = instance(roundGeo, materials.buildingBrick, max, 'RoundCornerTowers', { receive: true });
  const crowned = instance(crownedTowerGeometry(), materials.buildingGlass, max, 'CrownedOfficeTowers', { receive: true });
  const slabs = instance(slabHotelGeometry(), materials.buildingConcrete, max, 'SlabHotels', { receive: true });

  const roofGeo = new THREE.BoxGeometry(1, 1, 1);
  roofGeo.translate(0, 0.5, 0);
  const roofs = instance(roofGeo, materials.roof, max, 'RooftopUnits');
  const podiums = instance(roofGeo, materials.buildingPodium, max, 'BuildingPodiums', { receive: true });
  const ledgeGeo = new THREE.BoxGeometry(1, 1, 1);
  const ledges = instance(ledgeGeo, materials.buildingTrim, max * 2, 'BuildingFloorLedges');
  const antennaGeo = new THREE.CylinderGeometry(0.055, 0.075, 1, 8, 1);
  antennaGeo.translate(0, 0.5, 0);
  const antennas = instance(antennaGeo, materials.metal, max, 'BuildingAntennas');
  const beaconGeo = new THREE.SphereGeometry(0.12, 10, 7);
  const beacons = instance(beaconGeo, materials.buildingBeacon, max, 'BuildingRoofBeacons');

  const districts = [
    { minX: 120, maxX: 520, minZ: -215, maxZ: 410, count: 40, minH: 16, maxH: 76 },
    { minX: -170, maxX: 245, minZ: 245, maxZ: 570, count: 28, minH: 12, maxH: 48 },
    { minX: -610, maxX: -315, minZ: -280, maxZ: 300, count: 20, minH: 10, maxH: 38 },
    { minX: -70, maxX: 390, minZ: -455, maxZ: -250, count: 16, minH: 9, maxH: 28 },
  ];

  const buildingMeshes = [chamfered, setback, round, crowned, slabs];
  const buildingCounts = [0, 0, 0, 0, 0];
  const footprints = [];
  let roofCount = 0;
  let podiumCount = 0;
  let ledgeCount = 0;
  let antennaCount = 0;
  let beaconCount = 0;
  let total = 0;

  for (const district of districts) {
    let accepted = 0;
    for (let tries = 0; tries < district.count * 36 && accepted < district.count && total < max; tries++) {
      const x = THREE.MathUtils.lerp(district.minX, district.maxX, random());
      const z = THREE.MathUtils.lerp(district.minZ, district.maxZ, random());
      const width = 10 + random() * 23;
      const depth = 10 + random() * 24;
      const height = THREE.MathUtils.lerp(district.minH, district.maxH, Math.pow(random(), 1.55));
      // Audit the widest architectural piece (the podium), not just the tower
      // shaft, so ledges and base trim cannot sneak past the road check.
      const clearance = footprintClearance(route, x, z, width * 1.12, depth * 1.12);
      if (!clearance.ok) continue;
      if (avoidFootprints.some((footprint) => (
        Math.hypot(x - footprint.x, z - footprint.z) < clearance.radius + footprint.radius + 8
      ))) continue;
      const yaw = Math.round(random() * 2) * Math.PI / 2;

      const styleRoll = random();
      const style = styleRoll < 0.24
        ? 0
        : styleRoll < 0.43
          ? 1
          : styleRoll < 0.58
            ? 2
            : styleRoll < 0.79
              ? 3
              : 4;
      const styleIndex = buildingCounts[style]++;
      const building = buildingMeshes[style];
      building.setMatrixAt(styleIndex, compose(new THREE.Vector3(x, 0, z), new THREE.Vector3(width, height, depth), yaw));
      const colour = style === 0 || style === 3
        ? new THREE.Color().setHSL(0.57 + random() * 0.035, 0.12 + random() * 0.12, 0.62 + random() * 0.18)
        : style === 1 || style === 4
          ? new THREE.Color().setHSL(0.08 + random() * 0.05, 0.035 + random() * 0.06, 0.62 + random() * 0.17)
          : new THREE.Color().setHSL(0.025 + random() * 0.025, 0.13 + random() * 0.10, 0.57 + random() * 0.16);
      building.setColorAt(styleIndex, colour);

      const base = new THREE.Vector3(x, 0, z);
      if (random() > 0.28) {
        podiums.setMatrixAt(podiumCount++, compose(
          base,
          new THREE.Vector3(width * 1.10, 1.2 + random() * 1.8, depth * 1.10),
          yaw
        ));
      }

      const ledgeLevels = style === 2 || style === 3 ? 0 : height > 31 ? 2 : 1;
      for (let level = 0; level < ledgeLevels; level++) {
        const y = height * (ledgeLevels === 1 ? 0.68 : 0.38 + level * 0.34);
        ledges.setMatrixAt(ledgeCount++, compose(
          new THREE.Vector3(x, y, z),
          new THREE.Vector3(width * 1.035, 0.16, depth * 1.035),
          yaw
        ));
      }

      const unitW = width * (0.18 + random() * 0.22);
      const unitD = depth * (0.18 + random() * 0.22);
      const unitH = 1.1 + random() * 2.4;
      roofs.setMatrixAt(roofCount++, compose(
        new THREE.Vector3(x + (random() - 0.5) * width * 0.4, height, z + (random() - 0.5) * depth * 0.4),
        new THREE.Vector3(unitW, unitH, unitD),
        yaw
      ));

      if (height > 28 && random() > 0.34) {
        const antennaHeight = 2.8 + random() * 6.5;
        const antennaBase = new THREE.Vector3(x, height + unitH, z);
        antennas.setMatrixAt(antennaCount++, compose(
          antennaBase,
          new THREE.Vector3(1, antennaHeight, 1)
        ));
        beacons.setMatrixAt(beaconCount++, compose(
          antennaBase.clone().add(new THREE.Vector3(0, antennaHeight + 0.04, 0)),
          new THREE.Vector3(1, 1, 1)
        ));
      }

      footprints.push({
        kind: 'city-building',
        x,
        z,
        radius: clearance.radius,
        requiredGap: clearance.requiredGap,
      });
      total++;
      accepted++;
    }
  }

  buildingMeshes.forEach((building, index) => setCount(building, buildingCounts[index]));
  setCount(roofs, roofCount);
  setCount(podiums, podiumCount);
  setCount(ledges, ledgeCount);
  setCount(antennas, antennaCount);
  setCount(beacons, beaconCount);
  group.add(...buildingMeshes, podiums, ledges, roofs, antennas, beacons);
  group.userData.roadClearanceFootprints = footprints;
  root.add(group);
  return footprints;
}

function buildIndustrialDistrict(root, route, materials, avoidFootprints = []) {
  const random = seededRandom(0x1ad057a1);
  const warehouses = instance(gabledWarehouseGeometry(), materials.warehouse, 16, 'GabledWarehouses', { receive: true });
  const doorGeo = new THREE.BoxGeometry(1, 1, 1);
  const loadingDoors = instance(doorGeo, materials.warehouseDoor, 16, 'WarehouseLoadingDoors');
  const ventGeo = new THREE.CylinderGeometry(0.24, 0.31, 1, 10, 1);
  ventGeo.translate(0, 0.5, 0);
  const roofVents = instance(ventGeo, materials.metal, 16, 'WarehouseRoofVents');
  const footprints = [];
  let warehouseCount = 0;
  for (let tries = 0; tries < 600 && warehouseCount < 12; tries++) {
    const x = -560 + random() * 660;
    const z = -560 + random() * 265;
    const w = 22 + random() * 38;
    const d = 28 + random() * 55;
    const h = 7 + random() * 8;
    const clearance = footprintClearance(route, x, z, w, d, 5.0);
    if (!clearance.ok) continue;
    if (avoidFootprints.some((footprint) => (
      Math.hypot(x - footprint.x, z - footprint.z) < clearance.radius + footprint.radius + 8
    ))) continue;
    const yaw = Math.round(random()) * Math.PI / 2;
    const q = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, yaw);
    warehouses.setMatrixAt(warehouseCount, compose(new THREE.Vector3(x, 0, z), new THREE.Vector3(w, h, d), yaw));

    const frontOffset = new THREE.Vector3(0, 0, d * 0.505).applyQuaternion(q);
    loadingDoors.setMatrixAt(warehouseCount, new THREE.Matrix4().compose(
      new THREE.Vector3(x, h * 0.34, z).add(frontOffset),
      q,
      new THREE.Vector3(w * 0.48, h * 0.54, 0.16)
    ));
    const ventOffset = new THREE.Vector3((random() - 0.5) * w * 0.35, 0, (random() - 0.5) * d * 0.35).applyQuaternion(q);
    roofVents.setMatrixAt(warehouseCount, compose(
      new THREE.Vector3(x, h + 0.1, z).add(ventOffset),
      new THREE.Vector3(1, 1.2 + random() * 1.3, 1)
    ));
    footprints.push({
      kind: 'warehouse',
      x,
      z,
      radius: clearance.radius,
      requiredGap: clearance.requiredGap,
    });
    warehouseCount++;
  }
  setCount(warehouses, warehouseCount);
  setCount(loadingDoors, warehouseCount);
  setCount(roofVents, warehouseCount);
  root.add(warehouses, loadingDoors, roofVents);

  const containerGeo = new THREE.BoxGeometry(2.44, 2.59, 6.06);
  containerGeo.translate(0, 1.295, 0);
  const containers = instance(containerGeo, materials.container, 128, 'ShippingContainers', { receive: true });
  const colours = [0xb43a2f, 0x235b83, 0x2f7556, 0xd18a27, 0x70757c, 0x7a3e70];
  let containerCount = 0;
  const yards = [
    { x: -390, z: -505, w: 280, d: 95 },
    { x: 35, z: -420, w: 190, d: 105 },
  ];
  for (const yard of yards) {
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 13; col++) {
        if (containerCount >= 120 || random() < 0.25) continue;
        const x = yard.x - yard.w / 2 + 10 + col * (yard.w - 20) / 12 + (random() - 0.5) * 1.2;
        const z = yard.z - yard.d / 2 + 9 + row * (yard.d - 18) / 6;
        if (route.nearest(x, z).distanceToCentre < 24) continue;
        const stack = random() > 0.64 ? 2 : 1;
        for (let level = 0; level < stack && containerCount < 120; level++) {
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
  const tanks = instance(tankGeo, materials.metal, 12, 'StorageTanks', { receive: true });
  let tankCount = 0;
  for (let i = 0; i < 12; i++) {
    const row = Math.floor(i / 6);
    const col = i % 6;
    const r = 5 + random() * 3;
    const h = 10 + random() * 14;
    const x = -590 + col * 23;
    const z = -465 + row * 29;
    const clearance = footprintClearance(route, x, z, r * 2, r * 2, 3.5);
    if (!clearance.ok) continue;
    tanks.setMatrixAt(tankCount++, compose(new THREE.Vector3(x, 0, z), new THREE.Vector3(r, h, r)));
    footprints.push({ kind: 'storage-tank', x, z, radius: clearance.radius, requiredGap: clearance.requiredGap });
  }
  setCount(tanks, tankCount);
  root.add(tanks);

  const stackGeo = new THREE.CylinderGeometry(0.72, 1.05, 1, 14, 1);
  stackGeo.translate(0, 0.5, 0);
  const stacks = instance(stackGeo, materials.concreteDark, 6, 'IndustrialSmokestacks');
  const beaconMaterial = new THREE.MeshStandardMaterial({
    color: 0xff6048,
    emissive: 0xff210d,
    emissiveIntensity: 4.5,
    roughness: 0.22,
  });
  const beaconGeo = new THREE.SphereGeometry(0.16, 12, 8);
  const beacons = instance(beaconGeo, beaconMaterial, 6, 'IndustrialWarningBeacons');
  let stackCount = 0;
  for (let i = 0; i < 6; i++) {
    const row = Math.floor(i / 4);
    const col = i % 4;
    const height = 17 + random() * 23;
    const position = new THREE.Vector3(-625 + col * 44 + row * 8, 0, -385 + row * 38);
    const clearance = footprintClearance(route, position.x, position.z, 2.1, 2.1, 3.5);
    if (!clearance.ok) continue;
    stacks.setMatrixAt(stackCount, compose(position, new THREE.Vector3(1, height, 1)));
    beacons.setMatrixAt(stackCount, compose(
      position.clone().add(new THREE.Vector3(0, height + 0.15, 0)),
      new THREE.Vector3(1, 1, 1)
    ));
    footprints.push({
      kind: 'smokestack',
      x: position.x,
      z: position.z,
      radius: clearance.radius,
      requiredGap: clearance.requiredGap,
    });
    stackCount++;
  }
  setCount(stacks, stackCount);
  setCount(beacons, stackCount);
  root.add(stacks, beacons);

  const railMat = new THREE.MeshStandardMaterial({ color: 0x8a8f94, metalness: 0.9, roughness: 0.38 });
  for (const x of [-70, -66]) {
    const rail = mesh(new THREE.BoxGeometry(0.12, 0.11, 350), railMat, 'DockRail');
    rail.position.set(x, 0.03, -460);
    root.add(rail);
  }

  for (const [x, z, flip] of [[-510, -585, 0], [-285, -605, 0.15], [25, -555, -0.2]]) {
    root.add(makeCrane(x, z, flip, materials));
  }
  return footprints;
}

function makeCrane(x, z, yaw, materials) {
  const g = new THREE.Group();
  g.name = 'ContainerCrane';
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  const legs = instance(new THREE.BoxGeometry(1.2, 34, 1.2), materials.darkMetal, 2, 'CraneLegs');
  const bogies = instance(new THREE.BoxGeometry(5.6, 1.2, 4.8), materials.darkMetal, 2, 'CraneWheelBogies');
  const legMatrix = new THREE.Matrix4();
  const legQuaternion = new THREE.Quaternion();
  [-10, 10].forEach((lx, index) => {
    legQuaternion.setFromEuler(new THREE.Euler(0, 0, lx < 0 ? -0.1 : 0.1));
    legMatrix.compose(new THREE.Vector3(lx, 17, 0), legQuaternion, new THREE.Vector3(1, 1, 1));
    legs.setMatrixAt(index, legMatrix);
    bogies.setMatrixAt(index, new THREE.Matrix4().makeTranslation(lx, 0.65, 0));
  });
  setCount(legs, 2);
  setCount(bogies, 2);
  g.add(legs, bogies);
  const top = mesh(new THREE.BoxGeometry(34, 1.7, 2.0), materials.darkMetal, 'CraneTop');
  top.position.y = 33;
  g.add(top);
  // Open truss bracing gives the crane a readable industrial silhouette from
  // the road instead of one large red rectangular boom.
  const legBraces = [];
  for (let y = 4; y < 31; y += 6.5) {
    const flip = Math.floor(y / 6.5) % 2 ? 1 : -1;
    legBraces.push({
      a: new THREE.Vector3(-9.4 * flip, y, -0.4),
      b: new THREE.Vector3(9.4 * flip, y + 6.2, -0.4),
      thickness: 0.34,
    });
  }
  instancedBeams(g, legBraces, materials.metal, 'CraneLegBraces');
  const boomStart = -15;
  const boomEnd = 48;
  const boomTruss = [];
  for (const y of [34.8, 38.0]) {
    boomTruss.push({
      a: new THREE.Vector3(boomStart, y, 0),
      b: new THREE.Vector3(boomEnd, y - 1.9, 0),
      thickness: 0.52,
    });
  }
  for (let bx = boomStart; bx < boomEnd - 5; bx += 7) {
    const topA = new THREE.Vector3(bx, 37.6 - (bx - boomStart) * 0.03, 0);
    const bottomB = new THREE.Vector3(bx + 7, 34.6 - (bx + 7 - boomStart) * 0.03, 0);
    boomTruss.push({ a: topA, b: bottomB, thickness: 0.25 });
  }
  instancedBeams(g, boomTruss, materials.barrierStripe, 'CraneBoomTruss');
  const cab = mesh(new THREE.BoxGeometry(4.5, 3.5, 4), materials.buildingGlass, 'CraneCab');
  cab.position.set(-4, 30.5, 0);
  g.add(cab);
  const trolley = mesh(new THREE.BoxGeometry(5.4, 1.2, 4.2), materials.darkMetal, 'CraneTrolley');
  trolley.position.set(23, 34.4, 0);
  g.add(trolley);
  instancedBeams(g, [21.6, 24.4].map((cableX) => ({
    a: new THREE.Vector3(cableX, 34, 0),
    b: new THREE.Vector3(cableX, 10.5, 0),
    thickness: 0.07,
  })), materials.darkMetal, 'CraneHoistCables');
  const spreader = mesh(new THREE.BoxGeometry(8.5, 0.45, 2.2), materials.warning, 'CraneSpreader');
  spreader.position.set(23, 10.2, 0);
  g.add(spreader);
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
  const footings = instance(beamGeo, materials.concrete, 64, 'ViaductPierFootings', { receive: true });
  const cabinets = instance(beamGeo, materials.darkMetal, 32, 'ViaductUtilityCabinets');
  let pillarCount = 0;
  let beamCount = 0;
  let footingCount = 0;
  let cabinetCount = 0;

  const serviceRoad = mesh(projectedGroundRibbon(route, {
    start: 0.245,
    end: 0.505,
    width: 11.5,
  }), materials.shoulder, 'ViaductServiceRoad', { receive: true });
  root.add(serviceRoad);
  for (let d = start; d <= end; d += 42) {
    const frame = route.atDistance(d);
    const height = Math.max(2, frame.center.y - 1.15);
    pillars.setMatrixAt(pillarCount++, compose(new THREE.Vector3(frame.center.x, 0, frame.center.z), new THREE.Vector3(1, height, 1)));
    footings.setMatrixAt(footingCount++, compose(
      new THREE.Vector3(frame.center.x, 0.24, frame.center.z),
      new THREE.Vector3(5.2, 0.48, 5.2),
      frame.heading
    ));
    if (Math.floor(d / 42) % 2 === 0) {
      const cabinet = route.pointAt(d, 4.3, 0);
      cabinet.y = 1.1;
      cabinets.setMatrixAt(cabinetCount++, compose(cabinet, new THREE.Vector3(2.2, 2.2, 1.25), frame.heading));
    }
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
      footings.setMatrixAt(footingCount++, compose(
        new THREE.Vector3(p.x, 0.22, p.z),
        new THREE.Vector3(4.2, 0.44, 4.2),
        frame.heading
      ));
    }
    beams.setMatrixAt(beamCount++, compose(
      new THREE.Vector3(frame.center.x, frame.center.y - 1.4, frame.center.z),
      new THREE.Vector3(23, 0.9, 1.5),
      frame.heading
    ));
  }
  setCount(pillars, pillarCount);
  setCount(beams, beamCount);
  setCount(footings, footingCount);
  setCount(cabinets, cabinetCount);
  root.add(pillars, beams, footings, cabinets);
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
  const warmBulbs = instance(headGeo, materials.lamp, count, 'StreetLightBulbsWarm');
  const coolBulbs = instance(headGeo, materials.coolLamp, count, 'StreetLightBulbsCool');
  const warmPools = instance(poolGeo, materials.sodiumGlow, count, 'StreetLightPoolsWarm');
  const coolPools = instance(poolGeo, materials.cyanGlow, count, 'StreetLightPoolsCool');
  const lampPositions = [];
  let used = 0;
  let warmCount = 0;
  let coolCount = 0;

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
      const pool = route.pointAt(d, side * (ROAD_HALF_WIDTH - 1.65), 0.035);
      const urban = (u > 0.485 && u < 0.695) || u > 0.875 || u < 0.035;
      const cool = urban && (Math.floor(d / spacing) + (side > 0 ? 1 : 0)) % 3 === 0;
      const bulbMatrix = compose(bulb, new THREE.Vector3(0.42, 0.13, 0.28), frame.heading);
      const poolMatrix = compose(pool, new THREE.Vector3(7.2, 7.2, 7.2), 0, poolQuaternion);
      if (cool) {
        coolBulbs.setMatrixAt(coolCount, bulbMatrix);
        coolPools.setMatrixAt(coolCount++, poolMatrix);
        lampPositions.push({ position: bulb, colour: 0x72cfff, intensity: 126 });
      } else {
        warmBulbs.setMatrixAt(warmCount, bulbMatrix);
        warmPools.setMatrixAt(warmCount++, poolMatrix);
        lampPositions.push({ position: bulb, colour: 0xff9e45, intensity: 145 });
      }
      used++;
    }
  }

  setCount(poles, used);
  setCount(arms, used);
  setCount(warmBulbs, warmCount);
  setCount(coolBulbs, coolCount);
  setCount(warmPools, warmCount);
  setCount(coolPools, coolCount);
  root.add(poles, arms, warmBulbs, coolBulbs, warmPools, coolPools);

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

  // The visible fixtures live in RoadsideDetails; registering matching light
  // locations here lets the existing four-light pool illuminate the lower
  // boulevard when it passes beneath the flyover.
  for (let d = route.length * 0.245; d < route.length * 0.610; d += 34) {
    const u = d / route.length;
    if (u > 0.515 && u < 0.525) continue;
    const frame = route.atDistance(d);
    lampPositions.push({
      position: frame.center.clone().addScaledVector(frame.normal, -1.62),
      colour: 0x78cfff,
      intensity: 88,
    });
  }

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

function buildTrafficSignals(root, route, materials) {
  const locations = [0.515, 0.585, 0.655, 0.895, 0.947];
  const poleGeo = new THREE.CylinderGeometry(0.10, 0.15, 1, 8, 1);
  poleGeo.translate(0, 0.5, 0);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const lensGeo = new THREE.SphereGeometry(0.18, 12, 8);
  const poles = instance(poleGeo, materials.darkMetal, locations.length * 2, 'TrafficSignalPoles');
  const arms = instance(boxGeo, materials.darkMetal, locations.length, 'TrafficSignalCrossbars');
  const housings = instance(boxGeo, materials.darkMetal, locations.length * 2, 'TrafficSignalHousings');
  const redMaterial = new THREE.MeshStandardMaterial({ color: 0x77120f, emissive: 0xff261a, emissiveIntensity: 4.4, roughness: 0.22 });
  const amberMaterial = new THREE.MeshStandardMaterial({ color: 0x7d4a09, emissive: 0xff9a16, emissiveIntensity: 1.5, roughness: 0.22 });
  const greenMaterial = new THREE.MeshStandardMaterial({ color: 0x123a20, emissive: 0x2cff6b, emissiveIntensity: 0.18, roughness: 0.22 });
  const reds = instance(lensGeo, redMaterial, locations.length * 2, 'TrafficSignalRedLenses');
  const ambers = instance(lensGeo, amberMaterial, locations.length * 2, 'TrafficSignalAmberLenses');
  const greens = instance(lensGeo, greenMaterial, locations.length * 2, 'TrafficSignalGreenLenses');

  let poleCount = 0;
  let signalCount = 0;
  for (const fraction of locations) {
    const d = route.length * fraction;
    const frame = route.atDistance(d);
    for (const side of [-1, 1]) {
      const p = route.pointAt(d, side * 8.35, 0.16);
      poles.setMatrixAt(poleCount++, compose(p, new THREE.Vector3(1, 6.75, 1)));
    }
    const crossbar = frame.center.clone().addScaledVector(frame.normal, 6.55);
    arms.setMatrixAt(signalCount / 2, compose(crossbar, new THREE.Vector3(17.2, 0.20, 0.20), frame.heading));

    for (const lateral of [-2.65, 2.65]) {
      const housing = route.pointAt(d, lateral, 5.72);
      housings.setMatrixAt(signalCount, compose(housing, new THREE.Vector3(0.68, 1.72, 0.42), frame.heading));
      for (const [lights, height] of [[reds, 6.24], [ambers, 5.72], [greens, 5.20]]) {
        const lens = route.pointAt(d, lateral, height).addScaledVector(frame.tangent, -0.25);
        lights.setMatrixAt(signalCount, compose(lens, new THREE.Vector3(1, 1, 0.48), frame.heading));
      }
      signalCount++;
    }
  }
  setCount(poles, poleCount);
  setCount(arms, locations.length);
  setCount(housings, signalCount);
  setCount(reds, signalCount);
  setCount(ambers, signalCount);
  setCount(greens, signalCount);
  root.add(poles, arms, housings, reds, ambers, greens);
}

function buildTunnelPortals(root, route, materials) {
  const distances = [0.696 * route.length, 0.804 * route.length];
  const blockGeo = new THREE.BoxGeometry(1, 1, 1);
  const concrete = instance(blockGeo, materials.concreteDark, 6, 'TunnelPortalConcrete', { receive: true });
  const warnings = instance(blockGeo, materials.warning, 8, 'TunnelPortalWarningStripes');
  const signMaterial = new THREE.MeshBasicMaterial({
    map: makeSignTexture('HARBOR TUNNEL', { sub: 'KEEP LEFT · LIGHTS ON', colour: '#ffb52d' }),
    toneMapped: false,
  });
  const signs = instance(new THREE.PlaneGeometry(1, 1), signMaterial, 2, 'TunnelPortalSigns');
  const dummy = new THREE.Object3D();
  let concreteCount = 0;
  let warningCount = 0;
  distances.forEach((distance, index) => {
    const frame = route.atDistance(distance);
    for (const side of [-1, 1]) {
      const base = route.pointAt(distance, side * 8.35, 0);
      concrete.setMatrixAt(concreteCount++, compose(
        base.clone().addScaledVector(frame.normal, 3.05),
        new THREE.Vector3(1.05, 6.1, 1.5),
        frame.heading
      ));
      for (const height of [1.1, 4.6]) {
        warnings.setMatrixAt(warningCount++, compose(
          base.clone().addScaledVector(frame.normal, height).addScaledVector(frame.tangent, -0.78),
          new THREE.Vector3(1.14, 0.24, 0.12),
          frame.heading
        ));
      }
    }
    concrete.setMatrixAt(concreteCount++, compose(
      frame.center.clone().addScaledVector(frame.normal, 7.2),
      new THREE.Vector3(17.8, 1.45, 1.5),
      frame.heading
    ));

    const signPosition = frame.center.clone()
      .addScaledVector(frame.normal, 7.18)
      .addScaledVector(frame.tangent, -0.78);
    dummy.position.copy(signPosition);
    dummy.up.copy(frame.normal);
    dummy.lookAt(signPosition.clone().addScaledVector(frame.tangent, -10));
    dummy.scale.set(10.8, 1.65, 1);
    dummy.updateMatrix();
    signs.setMatrixAt(index, dummy.matrix);
  });
  setCount(concrete, concreteCount);
  setCount(warnings, warningCount);
  setCount(signs, 2);
  root.add(concrete, warnings, signs);
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
  const landmarks = buildArchitecturalLandmarks(route, materials);
  const industryLandmarks = buildIndustrialLandmarks(route, materials);
  const reservedFootprints = [...landmarks.footprints, ...industryLandmarks.footprints];
  const cityFootprints = buildCity(root, route, materials, reservedFootprints);
  const warehouseFootprints = buildIndustrialDistrict(root, route, materials, reservedFootprints);
  root.add(landmarks.object);
  root.add(industryLandmarks.object);
  root.userData.roadClearanceFootprints = [
    ...cityFootprints,
    ...warehouseFootprints,
    ...landmarks.footprints,
    ...industryLandmarks.footprints,
  ];
  buildViaductSupports(root, route, materials);
  const streetLights = buildStreetLights(root, route, materials);
  buildChevrons(root, route);
  buildTrafficSignals(root, route, materials);
  buildTunnelPortals(root, route, materials);
  buildBillboards(root, route, materials, animatedMaterials);
  buildNeonStorefronts(root, route, animatedMaterials);
  const roadsideDetails = buildRoadsideDetails(route, materials);
  root.add(roadsideDetails.object);
  const startLights = buildStartGantry(root, route, materials, animatedMaterials);
  const scoreboard = createRaceBoard(root, route, materials);

  function update(time, playerPosition) {
    streetLights.update(playerPosition);
    roadsideDetails.update(time);
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
    emitImpact: roadsideDetails.emitImpact,
    lampCount: streetLights.lampCount,
  };
}
