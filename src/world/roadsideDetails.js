/** Layered roadside detail for the Midnight Circuit environment. */
import * as THREE from 'three';
import {
  DRIVEABLE_HALF_WIDTH,
  ROAD_HALF_WIDTH,
  TUNNEL_RANGE,
} from './course.js';
import { seededRandom } from './materials.js';
import { verticalRibbonGeometry } from './roadGeometry.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);

function mesh(geometry, material, name, { receive = false } = {}) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.receiveShadow = receive;
  return object;
}

function instance(geometry, material, count, name, { receive = false } = {}) {
  const object = new THREE.InstancedMesh(geometry, material, count);
  object.name = name;
  object.receiveShadow = receive;
  object.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  return object;
}

function finishInstances(object, count) {
  object.count = count;
  object.instanceMatrix.needsUpdate = true;
  if (object.instanceColor) object.instanceColor.needsUpdate = true;
}

function routeQuaternion(frame) {
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(frame.pitch, frame.heading, frame.bank, 'YXZ')
  );
}

/** Matrix for unit XY geometry lying on the banked road surface. */
function roadPlaneMatrix(frame, position, width, length, rotation = 0) {
  const matrix = new THREE.Matrix4().makeBasis(frame.right, frame.tangent, frame.normal);
  matrix.setPosition(position);
  if (rotation) matrix.multiply(new THREE.Matrix4().makeRotationZ(rotation));
  matrix.scale(new THREE.Vector3(width, length, 1));
  return matrix;
}

function rangeContains(u, ranges) {
  return ranges.some(([start, end]) => u >= start && u <= end);
}

function buildRoadWear(root, route, materials) {
  const random = seededRandom(0x51deca1);
  const plane = new THREE.PlaneGeometry(1, 1);

  const patches = instance(plane, materials.roadPatch, 72, 'AsphaltRepairs', { receive: true });
  for (let i = 0; i < 72; i++) {
    const d = ((i + 0.25 + random() * 0.5) / 72) * route.length;
    const frame = route.atDistance(d);
    const lateral = (random() - 0.5) * (ROAD_HALF_WIDTH * 1.45);
    const p = route.pointAt(d, lateral, 0.073);
    patches.setMatrixAt(i, roadPlaneMatrix(
      frame,
      p,
      1.1 + random() * 2.8,
      1.8 + random() * 5.2,
      (random() - 0.5) * 0.2
    ));
  }
  finishInstances(patches, 72);
  root.add(patches);

  // Paired braking marks accumulate before the major corners. Following the
  // spline per segment keeps them convincing through elevation and banking.
  const brakingZones = [0.083, 0.132, 0.205, 0.283, 0.383, 0.473, 0.563, 0.635, 0.810, 0.864, 0.924];
  const skids = instance(plane, materials.skid, 560, 'BrakingSkidMarks');
  let skidCount = 0;
  for (const fraction of brakingZones) {
    const corner = fraction * route.length;
    for (let back = 92; back > 7; back -= 4.7) {
      const d = corner - back;
      const fade = 1 - back / 115;
      for (const pair of [-1, 1]) {
        if (skidCount >= 560) break;
        const frame = route.atDistance(d);
        const lateral = pair * (0.72 + Math.sin(d * 0.055) * 0.08) + frame.bank * 8 * fade;
        const p = route.pointAt(d, lateral, 0.079);
        skids.setMatrixAt(skidCount++, roadPlaneMatrix(frame, p, 0.14, 5.45, (pair * frame.bank) * 0.16));
      }
    }
  }
  finishInstances(skids, skidCount);
  root.add(skids);

  const puddleGeo = new THREE.CircleGeometry(1, 24);
  const puddles = instance(puddleGeo, materials.wetRoad, 38, 'RoadsidePuddles');
  for (let i = 0; i < 38; i++) {
    const d = (i / 38) * route.length + random() * 38;
    const frame = route.atDistance(d);
    const side = i % 2 ? 1 : -1;
    const p = route.pointAt(d, side * (4.8 + random() * 1.35), 0.084);
    puddles.setMatrixAt(i, roadPlaneMatrix(frame, p, 0.75 + random() * 1.8, 0.32 + random() * 0.75, random() * Math.PI));
  }
  finishInstances(puddles, 38);
  root.add(puddles);

  const manholeGeo = new THREE.CircleGeometry(0.48, 28);
  const manholes = instance(manholeGeo, materials.manhole, 22, 'ManholeCovers', { receive: true });
  for (let i = 0; i < 22; i++) {
    const d = route.length * (0.49 + (i / 21) * 0.50);
    const frame = route.atDistance(d);
    const p = route.pointAt(d, (i % 3 - 1) * 2.25, 0.087);
    manholes.setMatrixAt(i, roadPlaneMatrix(frame, p, 1, 1, (i * 0.71) % Math.PI));
  }
  finishInstances(manholes, 22);
  root.add(manholes);

  const drainGeo = new THREE.BoxGeometry(1, 1, 1);
  const drains = instance(drainGeo, materials.drain, 90, 'StormDrains', { receive: true });
  let drainCount = 0;
  for (let d = route.length * 0.485; d < route.length; d += 52) {
    if (d / route.length > 0.705 && d / route.length < 0.875) continue;
    const frame = route.atDistance(d);
    const q = routeQuaternion(frame);
    for (const side of [-1, 1]) {
      const p = route.pointAt(d, side * (ROAD_HALF_WIDTH - 0.34), 0.077);
      drains.setMatrixAt(drainCount++, new THREE.Matrix4().compose(p, q, new THREE.Vector3(0.28, 0.035, 0.82)));
    }
  }
  finishInstances(drains, drainCount);
  root.add(drains);

  const reflectorGeo = new THREE.BoxGeometry(1, 1, 1);
  const amber = instance(reflectorGeo, materials.reflectorAmber, Math.ceil(route.length / 9) * 2, 'AmberLaneReflectors');
  const white = instance(reflectorGeo, materials.reflectorWhite, Math.ceil(route.length / 15) * 2, 'WhiteEdgeReflectors');
  let amberCount = 0;
  let whiteCount = 0;
  for (let d = 4; d < route.length; d += 9.5) {
    const frame = route.atDistance(d);
    const q = routeQuaternion(frame);
    for (const offset of [-0.24, 0.24]) {
      const p = route.pointAt(d, offset, 0.087);
      amber.setMatrixAt(amberCount++, new THREE.Matrix4().compose(p, q, new THREE.Vector3(0.11, 0.028, 0.18)));
    }
  }
  for (let d = 7; d < route.length; d += 15.5) {
    const frame = route.atDistance(d);
    const q = routeQuaternion(frame);
    for (const side of [-1, 1]) {
      const p = route.pointAt(d, side * (ROAD_HALF_WIDTH - 0.38), 0.087);
      white.setMatrixAt(whiteCount++, new THREE.Matrix4().compose(p, q, new THREE.Vector3(0.10, 0.027, 0.16)));
    }
  }
  finishInstances(amber, amberCount);
  finishInstances(white, whiteCount);
  root.add(amber, white);

  const jointMaterial = new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.5, metalness: 0.45 });
  const joints = instance(plane, jointMaterial, 48, 'ViaductExpansionJoints');
  let jointCount = 0;
  for (let d = route.length * 0.242; d < route.length * 0.610; d += 30) {
    const u = d / route.length;
    if (u > 0.515 && u < 0.525) continue;
    const frame = route.atDistance(d);
    joints.setMatrixAt(jointCount++, roadPlaneMatrix(frame, route.pointAt(d, 0, 0.081), ROAD_HALF_WIDTH * 2, 0.105));
  }
  finishInstances(joints, jointCount);
  root.add(joints);
}

function buildTunnelDetails(root, route, materials) {
  const section = [
    [-8.62, 0.35], [-8.62, 4.15], [-7.48, 6.46], [-4.92, 7.96],
    [0, 8.54], [4.92, 7.96], [7.48, 6.46], [8.62, 4.15], [8.62, 0.35],
  ];
  const ringGeo = new THREE.CylinderGeometry(0.095, 0.095, 1, 8, 1);
  const rings = instance(ringGeo, materials.tunnelRib, 160, 'TunnelArchRibs');
  let ringCount = 0;
  const point = (frame, [lateral, height]) => frame.center.clone()
    .addScaledVector(frame.right, lateral)
    .addScaledVector(frame.normal, height);

  for (let d = route.length * TUNNEL_RANGE[0] + 7; d < route.length * TUNNEL_RANGE[1]; d += 25) {
    const frame = route.atDistance(d);
    for (let i = 0; i < section.length - 1; i++) {
      const a = point(frame, section[i]);
      const b = point(frame, section[i + 1]);
      const direction = b.clone().sub(a);
      const length = direction.length();
      const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, direction.normalize());
      rings.setMatrixAt(ringCount++, new THREE.Matrix4().compose(
        a.clone().lerp(b, 0.5),
        q,
        new THREE.Vector3(1, length, 1)
      ));
    }
  }
  finishInstances(rings, ringCount);
  root.add(rings);

  const trayGeo = new THREE.BoxGeometry(1, 1, 1);
  const trays = instance(trayGeo, materials.darkMetal, 30, 'TunnelCableTrays');
  let trayCount = 0;
  for (let d = route.length * TUNNEL_RANGE[0] + 10; d < route.length * TUNNEL_RANGE[1]; d += 18) {
    const frame = route.atDistance(d);
    const p = route.pointAt(d, -6.9, 6.0);
    trays.setMatrixAt(trayCount++, new THREE.Matrix4().compose(p, routeQuaternion(frame), new THREE.Vector3(0.36, 0.18, 7.2)));
  }
  finishInstances(trays, trayCount);
  root.add(trays);

  const exitMaterial = new THREE.MeshStandardMaterial({
    color: 0xbfffd8,
    emissive: 0x2aff77,
    emissiveIntensity: 3.8,
    roughness: 0.25,
  });
  const exitGeo = new THREE.BoxGeometry(1, 1, 1);
  const exits = instance(exitGeo, exitMaterial, 10, 'TunnelEmergencyMarkers');
  let exitCount = 0;
  for (let d = route.length * TUNNEL_RANGE[0] + 44; d < route.length * TUNNEL_RANGE[1]; d += 76) {
    const side = exitCount % 2 ? 1 : -1;
    const frame = route.atDistance(d);
    const p = route.pointAt(d, side * 8.53, 2.0);
    exits.setMatrixAt(exitCount++, new THREE.Matrix4().compose(p, routeQuaternion(frame), new THREE.Vector3(0.08, 1.15, 2.1)));
  }
  finishInstances(exits, exitCount);
  root.add(exits);
}

function buildFencesAndUtilities(root, route, materials) {
  const fenceRanges = [[0.035, 0.232], [0.805, 0.870]];
  const includeFence = (u) => rangeContains(u, fenceRanges);
  for (const side of [-1, 1]) {
    const fence = mesh(verticalRibbonGeometry(route, {
      offset: side * (DRIVEABLE_HALF_WIDTH + 2.05),
      bottom: 0.12,
      height: 2.35,
      include: includeFence,
      name: `ChainLinkFence_${side}`,
    }), materials.fence, `ChainLinkFence_${side}`);
    root.add(fence);
  }

  const postGeo = new THREE.CylinderGeometry(0.055, 0.065, 1, 7, 1);
  postGeo.translate(0, 0.5, 0);
  const posts = instance(postGeo, materials.metal, 280, 'FencePosts');
  let postCount = 0;
  for (let d = 0; d < route.length && postCount < 278; d += 6.1) {
    const u = d / route.length;
    if (!includeFence(u)) continue;
    for (const side of [-1, 1]) {
      const p = route.pointAt(d, side * (DRIVEABLE_HALF_WIDTH + 2.05), 0.12);
      posts.setMatrixAt(postCount++, new THREE.Matrix4().compose(
        p,
        new THREE.Quaternion(),
        new THREE.Vector3(1, 2.45, 1)
      ));
    }
  }
  finishInstances(posts, postCount);
  root.add(posts);

  const utilityGeo = new THREE.CylinderGeometry(0.11, 0.16, 1, 8, 1);
  utilityGeo.translate(0, 0.5, 0);
  const utilityPoles = instance(utilityGeo, materials.darkMetal, 48, 'UtilityPoles');
  const wirePositions = [];
  let utilityCount = 0;
  for (const side of [-1, 1]) {
    let previous = null;
    for (let d = route.length * 0.035; d < route.length * 0.225; d += 34) {
      const base = route.pointAt(d, side * (DRIVEABLE_HALF_WIDTH + 5.4), 0);
      utilityPoles.setMatrixAt(utilityCount++, new THREE.Matrix4().compose(
        base,
        new THREE.Quaternion(),
        new THREE.Vector3(1, 9.4, 1)
      ));
      const top = base.clone().add(new THREE.Vector3(0, 8.75, 0));
      if (previous) wirePositions.push(previous.x, previous.y, previous.z, top.x, top.y, top.z);
      previous = top;
    }
  }
  finishInstances(utilityPoles, utilityCount);
  root.add(utilityPoles);

  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wirePositions, 3));
  const wires = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x111317, transparent: true, opacity: 0.82 }));
  wires.name = 'IndustrialPowerLines';
  root.add(wires);
}

function buildBoulevardFurniture(root, route, materials) {
  const furnitureGeo = new THREE.BoxGeometry(1, 1, 1);
  const bins = instance(furnitureGeo, materials.darkMetal, 42, 'StreetBins');
  const bollardGeo = new THREE.CylinderGeometry(0.09, 0.12, 0.82, 10, 1);
  bollardGeo.translate(0, 0.41, 0);
  const bollards = instance(bollardGeo, materials.warning, 110, 'SidewalkBollards');
  let binCount = 0;
  let bollardCount = 0;
  const furnitureRanges = [[0.65, 0.695], [0.885, 0.995], [0.0, 0.03]];
  for (let d = 0; d < route.length; d += 14.5) {
    if (!rangeContains(d / route.length, furnitureRanges)) continue;
    const frame = route.atDistance(d);
    const q = routeQuaternion(frame);
    const side = Math.floor(d / 14.5) % 2 ? 1 : -1;
    const p = route.pointAt(d, side * 8.55, 0.57);
    bollards.setMatrixAt(bollardCount++, new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1)));
    if (Math.floor(d / 14.5) % 3 === 0) {
      const bin = route.pointAt(d + 2.1, side * 9.35, 0.72);
      bins.setMatrixAt(binCount++, new THREE.Matrix4().compose(bin, q, new THREE.Vector3(0.72, 1.25, 0.72)));
    }
  }
  finishInstances(bins, binCount);
  finishInstances(bollards, bollardCount);
  root.add(bins, bollards);
}

function buildUnderDeckDetails(root, route, materials) {
  const elevated = [[0.245, 0.515], [0.525, 0.610]];
  const fixtureGeo = new THREE.BoxGeometry(1, 1, 1);
  const fixtures = instance(fixtureGeo, materials.coolLamp, 72, 'UnderdeckLights');
  let fixtureCount = 0;
  for (let d = 0; d < route.length; d += 23) {
    if (!rangeContains(d / route.length, elevated)) continue;
    const frame = route.atDistance(d);
    const p = frame.center.clone().addScaledVector(frame.normal, -1.58);
    fixtures.setMatrixAt(fixtureCount++, new THREE.Matrix4().compose(
      p,
      routeQuaternion(frame),
      new THREE.Vector3(1.45, 0.09, 0.24)
    ));
  }
  finishInstances(fixtures, fixtureCount);
  root.add(fixtures);

  const graffitiGeo = new THREE.PlaneGeometry(1, 1);
  const graffiti = instance(graffitiGeo, materials.graffiti, 40, 'ViaductGraffitiPanels');
  let graffitiCount = 0;
  for (let d = route.length * 0.27; d < route.length * 0.605; d += 78) {
    if (!rangeContains(d / route.length, elevated)) continue;
    const frame = route.atDistance(d);
    for (const side of [-1, 1]) {
      const p = frame.center.clone()
        .addScaledVector(frame.right, side * (DRIVEABLE_HALF_WIDTH + 1.58))
        .addScaledVector(frame.normal, -0.79);
      const outward = frame.right.clone().multiplyScalar(side);
      const matrix = new THREE.Matrix4().makeBasis(frame.tangent, frame.normal, outward);
      matrix.setPosition(p);
      matrix.scale(new THREE.Vector3(5.8, 0.82, 1));
      graffiti.setMatrixAt(graffitiCount++, matrix);
    }
  }
  finishInstances(graffiti, graffitiCount);
  root.add(graffiti);
}

function buildImpactEffects(root) {
  const random = seededRandom(0x5fa4c5);
  const maximum = 72;
  const positions = new Float32Array(maximum * 3);
  positions.fill(-10000);
  const geometry = new THREE.BufferGeometry();
  const attribute = new THREE.BufferAttribute(positions, 3);
  attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', attribute);
  const material = new THREE.PointsMaterial({
    color: 0xffb447,
    size: 0.13,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'BarrierImpactSparks';
  points.frustumCulled = false;
  root.add(points);

  const flash = new THREE.PointLight(0xff8b32, 0, 8, 2);
  flash.name = 'BarrierImpactFlash';
  root.add(flash);

  const particles = new Array(maximum).fill(null);
  let cursor = 0;
  let currentTime = 0;
  let flashUntil = -1;

  function emit(event) {
    const count = Math.min(20, 7 + Math.floor(event.impact * 0.45));
    const normal = event.normal ?? new THREE.Vector3(1, 0, 0);
    for (let i = 0; i < count; i++) {
      const tangentSpray = new THREE.Vector3(normal.z, 0, -normal.x).multiplyScalar((random() - 0.5) * 7);
      const velocity = normal.clone().multiplyScalar(-1.2 - random() * 4.6)
        .add(tangentSpray)
        .add(new THREE.Vector3(0, 2.2 + random() * 6.2, 0));
      particles[cursor] = {
        born: currentTime,
        life: 0.28 + random() * 0.38,
        origin: event.point.clone(),
        velocity,
      };
      cursor = (cursor + 1) % maximum;
    }
    flash.position.copy(event.point);
    flashUntil = currentTime + 0.09;
  }

  function update(time) {
    currentTime = time;
    let visible = 0;
    for (let i = 0; i < maximum; i++) {
      const particle = particles[i];
      const offset = i * 3;
      if (!particle) {
        positions[offset] = positions[offset + 1] = positions[offset + 2] = -10000;
        continue;
      }
      const age = time - particle.born;
      if (age < 0 || age > particle.life) {
        particles[i] = null;
        positions[offset] = positions[offset + 1] = positions[offset + 2] = -10000;
        continue;
      }
      visible++;
      positions[offset] = particle.origin.x + particle.velocity.x * age;
      positions[offset + 1] = particle.origin.y + particle.velocity.y * age - 5.5 * age * age;
      positions[offset + 2] = particle.origin.z + particle.velocity.z * age;
    }
    attribute.needsUpdate = true;
    material.opacity = visible ? 0.9 : 0;
    flash.intensity = time < flashUntil ? 32 * Math.max(0, (flashUntil - time) / 0.09) : 0;
  }

  return { emit, update };
}

export function buildRoadsideDetails(route, materials) {
  const root = new THREE.Group();
  root.name = 'RoadsideDetails';
  buildRoadWear(root, route, materials);
  buildTunnelDetails(root, route, materials);
  buildFencesAndUtilities(root, route, materials);
  buildBoulevardFurniture(root, route, materials);
  buildUnderDeckDetails(root, route, materials);
  const impacts = buildImpactEffects(root);

  return {
    object: root,
    emitImpact: impacts.emit,
    update: impacts.update,
  };
}
