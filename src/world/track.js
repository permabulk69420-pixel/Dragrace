/**
 * Midnight Circuit: a full, metre-scale street course independent of vehicles.
 *
 * Integration surface:
 *   track.spawn                     start pose for any vehicle
 *   track.route.nearest(x, z)       road height, frame and lateral offset
 *   track.update(time, playerPos)   nearby-light and neon updates
 */
import * as THREE from 'three';
import {
  DRIVEABLE_HALF_WIDTH,
  ROAD_HALF_WIDTH,
  SHOULDER_WIDTH,
} from './course.js';
import { CourseCollision, createCourseCollisionZones } from './courseCollision.js';
import { getLevelDefinition } from './levels.js';
import { createWorldMaterials } from './materials.js';
import {
  barrierGeometry,
  dashedRibbonGeometry,
  fasciaGeometry,
  ribbonGeometry,
  tunnelGeometry,
  verticalRibbonGeometry,
} from './roadGeometry.js';

const inRanges = (ranges = []) => (u) => ranges.some(([a, b]) => u >= a && u <= b);

function roadMesh(geometry, material, name, renderOrder = 0) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.receiveShadow = true;
  object.castShadow = false;
  object.renderOrder = renderOrder;
  return object;
}

function addStartGrid(root, route, materials) {
  const group = new THREE.Group();
  group.name = 'StartGridMarkings';
  const addStripe = (distance, width, depth, material, name) => {
    const frame = route.atDistance(distance);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(width, 0.018, depth), material);
    stripe.name = name;
    stripe.position.copy(frame.center).addScaledVector(frame.normal, 0.055);
    stripe.rotation.set(frame.pitch, frame.heading, frame.bank, 'YXZ');
    stripe.receiveShadow = false;
    group.add(stripe);
  };

  addStripe(0, ROAD_HALF_WIDTH * 2, 0.45, materials.laneWhite, 'StartFinishLine');
  const tileGeometry = new THREE.BoxGeometry(1.3, 0.019, 1.35);
  const tiles = new THREE.InstancedMesh(tileGeometry, materials.laneWhite, 30);
  tiles.name = 'GridTiles';
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  let tileCount = 0;
  for (let row = -3; row <= 2; row++) {
    const d = -3.2 + row * 1.45;
    for (let lane = -2; lane <= 2; lane++) {
      if ((lane + row) % 2 === 0) {
        const frame = route.atDistance(d);
        const position = frame.center.clone()
          .addScaledVector(frame.right, lane * 1.3)
          .addScaledVector(frame.normal, 0.057);
        quaternion.setFromEuler(new THREE.Euler(frame.pitch, frame.heading, frame.bank, 'YXZ'));
        matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));
        tiles.setMatrixAt(tileCount++, matrix);
      }
    }
  }
  tiles.count = tileCount;
  tiles.instanceMatrix.needsUpdate = true;
  group.add(tiles);
  root.add(group);
}

function buildDirectionArrows(route, material, distances = [
  95, 285, 540, 810, 1100, 1390, 1680, 1970, 2260, 2530, 2790,
]) {
  const shape = new THREE.Shape();
  shape.moveTo(-0.42, -1.8);
  shape.lineTo(0.42, -1.8);
  shape.lineTo(0.42, 0.55);
  shape.lineTo(1.08, 0.55);
  shape.lineTo(0, 1.9);
  shape.lineTo(-1.08, 0.55);
  shape.lineTo(-0.42, 0.55);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  const arrows = new THREE.InstancedMesh(geometry, material, distances.length);
  arrows.name = 'DirectionArrows';
  arrows.renderOrder = 4;
  const matrix = new THREE.Matrix4();
  const scale = new THREE.Matrix4().makeScale(1.25, 1.25, 1.25);
  distances.forEach((distance, i) => {
    const frame = route.atDistance(distance);
    matrix.makeBasis(frame.right, frame.tangent, frame.normal);
    matrix.setPosition(frame.center.clone().addScaledVector(frame.normal, 0.058));
    matrix.multiply(scale);
    arrows.setMatrixAt(i, matrix);
  });
  arrows.instanceMatrix.needsUpdate = true;
  return arrows;
}

function buildRoadSurface(root, route, materials, profile = {}) {
  const elevatedRanges = profile.elevatedRanges ?? [[0.235, 0.515], [0.525, 0.610]];
  const sidewalkRanges = profile.sidewalkRanges ?? [[0.485, 0.705], [0.875, 1.0], [0.0, 0.035]];
  const cornerRanges = profile.cornerRanges ?? [
    [0.070, 0.115], [0.130, 0.166], [0.198, 0.230], [0.274, 0.315],
    [0.372, 0.410], [0.455, 0.492], [0.548, 0.583], [0.622, 0.655],
    [0.804, 0.835], [0.855, 0.882], [0.912, 0.945],
  ];
  const directionArrowDistances = profile.directionArrowDistances ?? [
    95, 285, 540, 810, 1100, 1390, 1680, 1970, 2260, 2530, 2790,
  ];

  // Structural deck below the elevated highway portion. The explicit
  // downward-facing soffit closes the slab when seen from the lower boulevard;
  // a top-only road ribbon disappears because normal road materials are
  // intentionally front-sided.
  const skyway = inRanges(elevatedRanges);
  const deckWidth = (DRIVEABLE_HALF_WIDTH + 1.6) * 2;
  if (elevatedRanges.length) {
    root.add(roadMesh(ribbonGeometry(route, {
      width: deckWidth,
      lift: -0.08,
      uvMetres: 8,
      name: 'ViaductDeck',
      include: skyway,
    }), materials.concreteDark, 'ViaductDeck'));
    root.add(roadMesh(ribbonGeometry(route, {
      width: deckWidth,
      lift: -1.43,
      uvMetres: 7,
      underside: true,
      name: 'ViaductUnderside',
      include: skyway,
    }), materials.underDeck, 'ViaductUnderside'));
    root.add(roadMesh(fasciaGeometry(route, {
      offset: -deckWidth / 2,
      depth: 1.35,
      include: skyway,
      name: 'ViaductFasciaLeft',
    }), materials.concreteDark, 'ViaductFasciaLeft'));
    root.add(roadMesh(fasciaGeometry(route, {
      offset: deckWidth / 2,
      depth: 1.35,
      include: skyway,
      name: 'ViaductFasciaRight',
    }), materials.concreteDark, 'ViaductFasciaRight'));

    // Three continuous steel webs and lower flanges make the bridge silhouette
    // read as a supported structure rather than a floating textured plane.
    for (const [index, offset] of [-5.15, 0, 5.15].entries()) {
      root.add(roadMesh(verticalRibbonGeometry(route, {
        offset,
        bottom: -2.06,
        height: 0.62,
        include: skyway,
        name: `ViaductGirderWeb_${index}`,
      }), materials.girder, `ViaductGirderWeb_${index}`));
      root.add(roadMesh(ribbonGeometry(route, {
        width: 0.62,
        offset,
        lift: -2.08,
        underside: true,
        uvMetres: 4,
        include: skyway,
        name: `ViaductGirderFlange_${index}`,
      }), materials.girder, `ViaductGirderFlange_${index}`));
    }
  }

  // Shoulders are laid first, then the main carriageway slightly above them.
  root.add(roadMesh(ribbonGeometry(route, {
    width: (ROAD_HALF_WIDTH + SHOULDER_WIDTH) * 2,
    lift: 0.018,
    uvMetres: 9,
    name: 'CourseShoulders',
  }), materials.shoulder, 'CourseShoulders', 1));
  root.add(roadMesh(ribbonGeometry(route, {
    width: ROAD_HALF_WIDTH * 2,
    lift: 0.035,
    uvMetres: 8,
    name: 'CourseAsphalt',
  }), materials.road, 'CourseAsphalt', 2));

  // Reflective centre and edge paint.  Two broken centre lines give the road
  // the slightly overbuilt, arcade-street-race read of early-2000s NFS.
  for (const offset of [-0.16, 0.16]) {
    root.add(roadMesh(dashedRibbonGeometry(route, {
      width: 0.095,
      offset,
      lift: 0.067,
      dash: 5.2,
      gap: 5.1,
      uvMetres: 1,
      name: 'CentreDash',
    }), materials.laneYellow, 'CentreDash', 4));
  }
  for (const offset of [-(ROAD_HALF_WIDTH - 0.28), ROAD_HALF_WIDTH - 0.28]) {
    root.add(roadMesh(ribbonGeometry(route, {
      width: 0.12,
      offset,
      lift: 0.066,
      uvMetres: 2,
      name: 'EdgeLine',
    }), materials.laneWhite, 'EdgeLine', 4));
  }

  // Concrete sidewalks in the denser city sections.
  const city = inRanges(sidewalkRanges);
  for (const side of [-1, 1]) {
    root.add(roadMesh(ribbonGeometry(route, {
      width: 2.7,
      offset: side * (ROAD_HALF_WIDTH + SHOULDER_WIDTH + 1.15),
      lift: 0.16,
      uvMetres: 4,
      name: `Sidewalk_${side}`,
      include: city,
    }), materials.concrete, `Sidewalk_${side}`, 2));
    root.add(roadMesh(verticalRibbonGeometry(route, {
      offset: side * (DRIVEABLE_HALF_WIDTH - 0.20),
      bottom: 0.025,
      height: 0.15,
      include: city,
      name: `SidewalkCurbFace_${side}`,
    }), materials.curbFace, `SidewalkCurbFace_${side}`, 3));
  }

  // Red/white apex kerbs mark the important corner complexes without turning
  // every metre of public road into a purpose-built circuit.
  const corners = inRanges(cornerRanges);
  for (const side of [-1, 1]) {
    for (const [parity, material] of [[0, materials.curbRed], [1, materials.curbWhite]]) {
      root.add(roadMesh(ribbonGeometry(route, {
        width: 0.72,
        offset: side * (ROAD_HALF_WIDTH + 0.32),
        lift: 0.092,
        uvMetres: 1,
        name: `Kerb_${side}_${parity}`,
        include: (u, d, i) => corners(u, d, i) && Math.floor(d / 5.5) % 2 === parity,
      }), material, `Kerb_${side}_${parity}`, 5));
    }
  }

  root.add(buildDirectionArrows(route, materials.laneWhite, directionArrowDistances));
  addStartGrid(root, route, materials);
}

function buildSafetyAndTunnel(root, route, materials, boundaryConfig = {}) {
  const barrierRanges = boundaryConfig.barrierRanges ?? [];
  const guardrailRanges = boundaryConfig.guardrailRanges ?? [];
  const tunnelRanges = boundaryConfig.tunnelRanges ?? [];
  const protectedRoad = inRanges(barrierRanges);
  for (const side of [-1, 1]) {
    root.add(roadMesh(barrierGeometry(route, {
      offset: side * (DRIVEABLE_HALF_WIDTH + 0.52),
      height: 1.0,
      thickness: 0.38,
      name: `Barrier_${side}`,
      include: protectedRoad,
    }), materials.concrete, `Barrier_${side}`, 3));
    root.add(roadMesh(verticalRibbonGeometry(route, {
      offset: side * (DRIVEABLE_HALF_WIDTH + 0.73),
      bottom: 0.64,
      height: 0.19,
      name: `BarrierStripe_${side}`,
      include: protectedRoad,
    }), side < 0 ? materials.barrierStripe : materials.laneYellow, `BarrierStripe_${side}`, 5));
  }

  // The remaining open-road spans use proper steel W-beam-style containment.
  // These visible ranges are also consumed by CourseCollision, so there are no
  // invisible walls and no unprotected holes in the lap boundary.
  const guardrailRoad = inRanges(guardrailRanges);
  for (const side of [-1, 1]) {
    for (const [index, band] of [[0, 0.38], [1, 0.70]]) {
      root.add(roadMesh(verticalRibbonGeometry(route, {
        offset: side * (DRIVEABLE_HALF_WIDTH + 0.63),
        bottom: band,
        height: index ? 0.17 : 0.22,
        include: guardrailRoad,
        name: `GuardrailBeam_${side}_${index}`,
      }), materials.guardrail, `GuardrailBeam_${side}_${index}`, 4));
    }
  }

  const postGeometry = new THREE.BoxGeometry(0.16, 1.02, 0.20);
  postGeometry.translate(0, 0.51, 0);
  const postCapacity = Math.ceil(route.length / 3.8) * 2;
  const posts = new THREE.InstancedMesh(postGeometry, materials.guardrailPost, postCapacity);
  posts.name = 'GuardrailPosts';
  posts.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  let postCount = 0;
  for (let distance = 0; distance < route.length; distance += 3.8) {
    const u = distance / route.length;
    if (!guardrailRoad(u)) continue;
    const frame = route.atDistance(distance);
    quaternion.setFromEuler(new THREE.Euler(frame.pitch, frame.heading, frame.bank, 'YXZ'));
    for (const side of [-1, 1]) {
      const position = route.pointAt(distance, side * (DRIVEABLE_HALF_WIDTH + 0.68), 0.04);
      matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));
      posts.setMatrixAt(postCount++, matrix);
    }
  }
  posts.count = postCount;
  posts.instanceMatrix.needsUpdate = true;
  root.add(posts);

  for (const [index, range] of tunnelRanges.entries()) {
    const name = index === 0 ? 'HarbourTunnelShell' : `CourseTunnelShell_${index + 1}`;
    const tunnel = roadMesh(tunnelGeometry(route, {
      start: range[0],
      end: range[1],
    }), materials.tunnel, name, 1);
    tunnel.castShadow = false;
    tunnel.receiveShadow = true;
    root.add(tunnel);

    // Dark lower wall band makes speed legible inside the tunnel.
    const tunnelRange = inRanges([range]);
    for (const side of [-1, 1]) {
      root.add(roadMesh(verticalRibbonGeometry(route, {
        offset: side * 8.74,
        bottom: 0.08,
        height: 1.3,
        include: tunnelRange,
        name: `TunnelLowerBand_${index}_${side}`,
      }), materials.darkMetal, `TunnelLowerBand_${index}_${side}`, 3));
    }
  }
}

export function buildTrack({
  collisionVehicleHalfWidth = 1.06,
  levelId,
  level: requestedLevel,
} = {}) {
  const level = requestedLevel ?? getLevelDefinition(levelId);
  const root = new THREE.Group();
  root.name = level.worldName;
  const route = level.route;
  const materials = createWorldMaterials();

  buildRoadSurface(root, route, materials, level.road);
  buildSafetyAndTunnel(root, route, materials, level.boundaries);
  const scenery = level.buildScenery(route, materials);
  root.add(scenery.object);
  const collisionZones = createCourseCollisionZones(level.boundaries);
  const collisions = new CourseCollision(route, {
    vehicleHalfWidth: collisionVehicleHalfWidth,
    zones: collisionZones,
  });

  return {
    id: level.id,
    name: level.name,
    shortName: level.shortName,
    description: level.description,
    environmentTheme: level.environmentTheme,
    object: root,
    route,
    materials,
    spawn: route.spawn,
    startLights: scenery.startLights,
    scoreboard: scenery.scoreboard,
    roadHalfWidth: ROAD_HALF_WIDTH,
    driveableHalfWidth: DRIVEABLE_HALF_WIDTH,
    boundaryConfig: level.boundaries,
    collisionZones,
    update(time, playerPosition) {
      scenery.update(time, playerPosition);
    },
    surfaceAt(x, z, hintDistance = null) {
      return route.nearest(x, z, hintDistance);
    },
    resolveVehicle(vehicle, hintDistance = null, dt = 0) {
      const result = collisions.resolve(vehicle, hintDistance, dt);
      if (result.emit) scenery.emitImpact?.(result);
      return result;
    },
    resetCollisions() {
      collisions.reset();
    },
    stats: {
      lengthMetres: route.length,
      elevationGainMetres: Math.max(...route.frames.map((f) => f.center.y)),
      streetLights: scenery.lampCount,
      auditedFootprints: scenery.object.userData.roadClearanceFootprints?.length ?? 0,
    },
  };
}
