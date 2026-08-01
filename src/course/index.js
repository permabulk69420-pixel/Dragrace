/**
 * Bayfront Circuit - the whole world in one object.
 *
 * ```js
 * import { buildCourse } from './course/index.js';
 * const course = buildCourse();
 * scene.add(course.object);
 *
 * // put a car on the grid
 * const slot = course.track.gridSlots(1)[0];
 * car.position.copy(slot.position);
 * car.rotation.y = slot.heading;
 *
 * // every frame
 * course.update(dt, car.position);
 * const road = course.surface(car.position.x, car.position.z);
 * ```
 *
 * Nothing in here knows anything about the vehicle: the course exposes where
 * the road is, how high it is, which way it points and where the walls are, and
 * leaves the driving to whoever is doing the driving.
 */
import * as THREE from 'three';

import { Track, CONTROL, COURSE_NAME, DISTRICTS } from './layout.js';
import { createCourseMaterials } from './materials.js';
import { buildTerrain, WATER_Y } from './terrain.js';
import { buildRoad } from './road.js';
import { buildBarriers } from './barriers.js';
import { buildCity } from './buildings.js';
import { buildProps } from './props.js';
import { LapTimer } from './lap.js';
import { makeRng, clamp, wrap } from './util.js';

export { Track, CONTROL, COURSE_NAME, DISTRICTS, LapTimer };
export { setupSky, MOODS } from './sky.js';

/**
 * Build the course.
 *
 * @param {object} [opts]
 * @param {number} [opts.seed=20260731] scenery seed; the same seed always
 *        produces the same city
 * @param {boolean} [opts.city=true] build the buildings
 * @param {boolean} [opts.props=true] build the roadside detail
 * @param {(pct:number, label:string)=>void} [opts.onProgress]
 */
export function buildCourse(opts = {}) {
  const {
    seed = 20260731,
    city = true,
    props = true,
    onProgress = null,
  } = opts;

  const step = (pct, label) => onProgress?.(pct, label);
  const started = typeof performance !== 'undefined' ? performance.now() : 0;

  step(2, 'Surveying the circuit…');
  const track = new Track(CONTROL);
  const M = createCourseMaterials(opts);
  const rng = makeRng(seed);

  const object = new THREE.Group();
  object.name = 'BayfrontCircuit';

  step(14, 'Grading the land…');
  const terrain = buildTerrain(track, M);
  object.add(terrain.object);

  /** Shared context every builder gets. */
  const world = {
    track,
    M,
    rng,
    ground: terrain.heightAt,
    isWater: terrain.isWater,
  };

  step(30, 'Laying the road…');
  const road = buildRoad(track, M);
  object.add(road.object);

  step(46, 'Bolting in the barriers…');
  const barriers = buildBarriers(track, M);
  object.add(barriers.object);

  step(58, 'Raising the city…');
  const cityBuild = city ? buildCity(world) : null;
  if (cityBuild) object.add(cityBuild.object);

  step(78, 'Dressing the streets…');
  const propBuild = props ? buildProps(world) : null;
  if (propBuild) object.add(propBuild.object);

  step(94, 'Switching the lights on…');

  /* -- runtime ------------------------------------------------------------ */

  const lamps = [M.lampLens, M.lampLensCool, M.tunnelLight];
  const lampBase = lamps.map((m) => m.emissiveIntensity);
  const beacons = propBuild ? propBuild.lights.beacons : [];
  const flashers = propBuild ? propBuild.lights.flashers : [];
  const startLights = propBuild ? propBuild.lights.startLights : [];
  const neons = M.neonSet;
  const neonBase = neons.map((m) => m.emissiveIntensity);

  let clock = 0;
  let startSequence = -1;

  const stats = () => {
    let meshes = 0;
    let triangles = 0;
    object.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      const index = o.geometry.getIndex();
      triangles += (index ? index.count : o.geometry.attributes.position.count) / 3;
    });
    return { meshes, triangles: Math.round(triangles), ...track.stats() };
  };

  step(100, 'Ready');

  return {
    /** Add this to the scene. */
    object,
    track,
    materials: M,
    terrain,
    barriers,
    lights: propBuild ? propBuild.lights : null,
    buildMs: typeof performance !== 'undefined' ? performance.now() - started : 0,

    name: COURSE_NAME,
    length: track.length,
    waterLevel: WATER_Y,

    /** Where to put a car, and which way to point it. */
    get startPose() { return track.startPose; },
    gridSlots: (n, o) => track.gridSlots(n, o),

    /**
     * Everything the driving code needs to know about a world position.
     *
     * @returns {{onRoad:boolean, height:number, heading:number, lateral:number,
     *            halfWidth:number, corridor:number, s:number, district:string,
     *            gradient:number, curvature:number, grip:number}}
     */
    surface(x, z) {
      const q = track.query(x, z);
      const corridor = barriers.halfWidthAt(q.s);
      const off = Math.abs(q.lateral) - q.halfWidth;
      return {
        ...q,
        corridor,
        // Tarmac, then a gritty shoulder, then whatever the verge is made of.
        grip: off <= 0 ? 1 : off < 2.5 ? 0.82 : 0.55,
        surface: off <= 0 ? 'road' : off < 2.5 ? 'shoulder' : 'off',
      };
    },

    /** Ground level anywhere in the world, road or not. */
    heightAt: (x, z) => terrain.heightAt(x, z),

    /**
     * Push a position back inside the barriers.
     *
     * Returns the corrected position along with how hard the wall was hit and
     * which way it pushed, so a vehicle can scrub speed and bounce off it.
     *
     * @param {THREE.Vector3} position mutated in place
     * @param {number} [radius] how wide the thing being clamped is
     */
    clampToBarriers(position, radius = 0.9) {
      const q = track.query(position.x, position.z);
      const limit = barriers.halfWidthAt(q.s) - radius;
      const over = Math.abs(q.lateral) - limit;
      if (over <= 0) return null;
      const frame = track.frameAt(q.s);
      const side = Math.sign(q.lateral) || 1;
      position.addScaledVector(frame.right, -side * over);
      return {
        depth: over,
        normal: frame.right.clone().multiplyScalar(-side),
        heading: frame.heading,
      };
    },

    /** A fresh lap timer for this circuit. */
    newLapTimer: (o) => new LapTimer(track, o),

    /**
     * Run the living parts of the world.
     *
     * @param {number} dt seconds
     * @param {THREE.Vector3} [focus] where the action is, for the shadow camera
     * @param {object} [sky] the object returned by setupSky
     */
    update(dt, focus = null, sky = null) {
      clock += dt;

      // Street lamps breathe very slightly, as sodium lamps do.
      const flicker = 1 + Math.sin(clock * 2.1) * 0.02 + Math.sin(clock * 7.3) * 0.012;
      lamps.forEach((m, i) => { m.emissiveIntensity = lampBase[i] * flicker; });

      // Neon signs: mostly steady, with the odd bad tube stuttering.
      neons.forEach((m, i) => {
        const stutter = i === 1 && Math.sin(clock * 11.7) > 0.94 ? 0.25 : 1;
        m.emissiveIntensity = neonBase[i] * (0.92 + Math.sin(clock * 1.7 + i) * 0.08) * stutter;
      });

      // Aircraft warning beacons and marshal lights blink out of step.
      beacons.forEach((mesh, i) => {
        const on = (clock * 1.1 + i * 0.37) % 1 < 0.45;
        mesh.material.emissiveIntensity = on ? 4 : 0.15;
      });
      flashers.forEach((mesh, i) => {
        const on = (clock * 2.6 + i * 0.5) % 1 < 0.3;
        mesh.material.emissiveIntensity = on ? 5 : 0.1;
      });

      // Start lights, when a sequence has been asked for.
      if (startSequence >= 0) {
        startSequence += dt;
        const lit = Math.floor(startSequence / 0.9);
        for (const bulb of startLights) {
          bulb.material.emissiveIntensity = bulb.index < lit && startSequence < 5.4 ? 4 : 0;
        }
        if (startSequence > 7) startSequence = -1;
      }

      if (focus && sky) sky.follow(focus);
    },

    /** Kick off the five-light start sequence on the gantry. */
    startSequence() {
      startSequence = 0;
    },

    stats,

    dispose() {
      object.traverse((o) => {
        if (o.isMesh) o.geometry.dispose();
      });
      M.dispose();
    },
  };
}
