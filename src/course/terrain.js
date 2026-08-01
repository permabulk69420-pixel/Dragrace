/**
 * The land the circuit sits on, and the harbour it runs around.
 *
 * The ground is one heightfield sampled straight off the track: it follows the
 * road where the road is on the deck, passes underneath where the road climbs
 * onto the viaduct, and dips away into the harbour basin on the seaward side.
 * Everything that gets scattered on top - buildings, cranes, trees - asks this
 * module how high the ground is, so nothing ever floats.
 */
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from './util.js';

/** Sea level. The quay road runs about two metres above it. */
export const WATER_Y = -4.2;
const SEABED_Y = -9;

/** How far out the ground mesh reaches from the middle of the circuit. */
const EXTENT = 1500;
const RESOLUTION = 150;          // quads per side: ~20 m cells

/**
 * The harbour: an L of open water wrapping the north-east of the circuit, so
 * the quay straight and the hairpin both run along the waterfront.
 * Returns 0 on dry land and 1 in open water, with a shoreline blend.
 */
export function harbourMask(x, z) {
  const east = (x - 585) / 45;             // seaward of the container quay
  const north = (z - 452) / 45;            // beyond the hairpin
  const m = Math.max(east, north);
  return clamp(m, 0, 1);
}

export function isWater(x, z) {
  return harbourMask(x, z) > 0.55;
}

/**
 * Build the ground plus the water.
 *
 * @param {import('./layout.js').Track} track
 * @param {Record<string, THREE.Material>} M
 */
export function buildTerrain(track, M) {
  const group = new THREE.Group();
  group.name = 'Terrain';

  const height = (x, z) => {
    const land = track.terrainHeight(x, z);
    const water = harbourMask(x, z);
    if (water <= 0) return land;
    return lerp(land, SEABED_Y, smoothstep(water));
  };

  /* -- heightfield -------------------------------------------------------- */

  const geo = new THREE.PlaneGeometry(EXTENT * 2, EXTENT * 2, RESOLUTION, RESOLUTION);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    // Beyond the city the land settles to a flat plain, so the horizon reads
    // level rather than following the road out to the edge of the world.
    const far = clamp((Math.hypot(x, z) - 760) / 420, 0, 1);
    pos.setY(i, lerp(height(x, z), -1.5, smoothstep(far)));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, M.ground);
  ground.name = 'Ground';
  ground.receiveShadow = true;
  group.add(ground);

  /* -- water -------------------------------------------------------------- */

  const water = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400, 1, 1), M.water);
  water.geometry.rotateX(-Math.PI / 2);
  water.position.set(760, WATER_Y, 620);
  water.name = 'Harbour';
  water.receiveShadow = false;
  group.add(water);

  const basin = new THREE.Mesh(new THREE.PlaneGeometry(1600, 900, 1, 1), M.water);
  basin.geometry.rotateX(-Math.PI / 2);
  basin.position.set(0, WATER_Y, 900);
  basin.name = 'HarbourBasin';
  group.add(basin);

  /* -- quay wall ---------------------------------------------------------- */
  // A hard concrete edge where the land meets the water, so the shoreline does
  // not just fade out into the seabed.

  const wall = (from, to, thickness = 3) => {
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const length = Math.hypot(dx, dz);
    const box = new THREE.BoxGeometry(length, 7, thickness);
    box.translate(0, -1.2, 0);
    const m = new THREE.Mesh(box, M.concreteDark);
    m.position.set((from[0] + to[0]) / 2, 0, (from[1] + to[1]) / 2);
    m.rotation.y = -Math.atan2(dz, dx);
    m.name = 'QuayWall';
    m.receiveShadow = true;
    m.castShadow = true;
    return m;
  };
  group.add(wall([600, -220], [600, 420]));
  group.add(wall([600, 420], [40, 468]));

  return {
    object: group,
    /** Ground level for anything being placed on the land. */
    heightAt: height,
    isWater,
    harbourMask,
    waterY: WATER_Y,
  };
}
