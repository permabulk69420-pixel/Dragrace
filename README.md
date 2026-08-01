# Midnight Circuit

A complete first-person WebXR street-racing environment for Meta Quest, built
with Three.js ES modules at real-world scale (**1 unit = 1 metre**).

Midnight Circuit is a **3.68 km closed road course** with a 35 m elevation
change and a maximum 6.6% grade. It is designed to feel like an early-2000s
street racer rather than a test loop: docklands, an industrial climb, a high
viaduct, neon commercial streets, a downtown descent, a harbour tunnel and a
fast final boulevard all form one continuous lap.

The existing code-generated car remains in the project as a playable preview.
No file under `src/car/` was changed for the course build. The world exposes a
vehicle-independent spawn and road-surface API so another vehicle can replace
the preview car without rebuilding the course.

## Course features

- 3.68 km spline-authored loop with broad fast corners, linked switchbacks,
  meaningful elevation, road crown and corner banking.
- Layered asphalt, shoulders, reflective double centre lines, edge paint,
  direction arrows, city sidewalks, selective red/white apex kerbs and a full
  start grid.
- World-owned collision at the visible inner faces of Jersey barriers and
  harbour-tunnel walls, with angle-sensitive deflection, speed loss and pooled
  impact sparks. Open street edges remain intentionally open.
- Bump- and roughness-mapped asphalt with repair patches, braking rubber,
  puddles, manholes, storm drains, expansion joints and hundreds of reflective
  lane and edge studs.
- Dockyards with stacked containers, warehouses, storage tanks, rail lines and
  three container cranes.
- Elevated skyway with a closed concrete slab, true downward-facing soffit,
  steel webs and flanges, crossbeams, piers, underdeck lights, graffiti,
  protected edges and a 35 m high point.
- Enclosed harbour tunnel with concrete shell, lower wall bands, cool ceiling
  fixtures, structural arch ribs, cable trays, emergency markers, detailed
  portals and local light pools.
- Instanced skyline, rooftop machinery, mountain silhouettes, street lamps,
  chevrons, barrier panels, chain-link fencing, utility lines, traffic signals,
  boulevard trees, street furniture and industrial props.
- Route-hugging street-front buildings with lit ground-floor glazing and
  awnings add depth to the downtown and final boulevard districts.
- Fictional period-style billboards, neon storefronts, start/finish gantry,
  grid lights and a live course scoreboard.
- Procedural night sky, city glow, stars, fog, reflection environment and a
  compact shadow-casting moon light.
- A moving pool of four real PointLights follows the player to the nearest
  street or tunnel fixtures; hundreds of visible lamps do not become hundreds
  of dynamic lights.

## Running it

The site is plain browser ES modules with a vendored copy of Three.js. There is
no client bundler.

```bash
npm install
npm run dev
```

Open `http://localhost:8080`. For Quest development, USB forwarding preserves a
trusted localhost context:

```bash
adb reverse tcp:8080 tcp:8080
```

Then open `http://localhost:8080` in the Quest browser and press **Enter VR**.
The deployed GitHub Pages version is HTTPS, as required by WebXR.

## Controls

| Action | Quest | Desktop |
|---|---|---|
| Throttle | right trigger | <kbd>W</kbd> / <kbd>↑</kbd> |
| Brake | left trigger | <kbd>S</kbd> / <kbd>↓</kbd> |
| Steer | right thumbstick, or grab the wheel | <kbd>A</kbd> / <kbd>D</kbd> |
| Clutch | automatic | <kbd>Space</kbd> |
| Shift up / down | **A** / **B** | <kbd>Q</kbd> / <kbd>E</kbd> |
| Reset to grid | **X** | <kbd>R</kbd> |
| Recentre seat | **Y** | <kbd>H</kbd> |
| Change camera | right stick click | <kbd>V</kbd> |

The three-light grid countdown starts automatically. The one-lap timer follows
route progress rather than assuming a particular vehicle or world axis.

## World integration contract

`src/world/course.js` is the single source of truth for route geometry. It has
no dependency on the car, vehicle physics, DOM or renderer.

```js
import { buildTrack } from './world/track.js';

// The optional half-width controls clearance from the vehicle centre to a
// visible wall. The 1.06 m default matches the included preview car.
const track = buildTrack({ collisionVehicleHalfWidth: 1.06 });
scene.add(track.object);

// Place any vehicle on the grid.
vehicle.x = track.spawn.position.x;
vehicle.z = track.spawn.position.z;
vehicle.heading = track.spawn.heading;

// Resolve a plain mutable vehicle pose against barriers and tunnel walls.
// Contract: x, z, heading and speed; no dependency on this project's car.
const hit = track.resolveVehicle(vehicle, previousRouteDistance, deltaTime);
const road = hit.road;
renderedVehicle.position.set(vehicle.x, road.height, vehicle.z);
// road.tangent, road.normal, road.bank, road.pitch, road.lateral,
// road.onRoad and road.onDriveableSurface are available. The route-distance
// hint keeps stacked flyover and lower-road queries distinct. hit.impact and
// hit.zone describe a contact; the world emits rendering feedback itself.

// Updates nearest local lights and subtle neon/water animation.
track.update(elapsedTime, vehicle.position);
```

Important exported measurements:

| Value | Measurement |
|---|---:|
| Lap length | 3,676 m |
| Road width | 13.2 m |
| Driveable width including shoulders | 15.9 m |
| Peak elevation | 35.0 m |
| Maximum grade | 6.6% |
| Route samples | 840 |
| Checkpoints | start + 25% + 50% + 75% |

The preview integration makes one minimal physics compatibility change:
`Vehicle({ enforceStripBounds: false })` disables the old drag strip's global-X
lane clamp. Its default remains `true`, so the original drag physics tests and
behaviour are preserved.

## Architecture

```text
src/
  world/
    course.js          pure route, frames, spawn and nearest-surface queries
    courseCollision.js visible barrier/tunnel collision for any plain vehicle pose
    roadGeometry.js    ribbons, barriers, fascia and tunnel sweep geometry
    materials.js       procedural textures and shared materials
    scenery.js         instanced city, dock, lighting, signs and hero props
    roadsideDetails.js road wear, street props, tunnel detail and impact effects
    track.js           assembles the complete world and integration API
    environment.js     night sky, fog, IBL and broad lighting
    circuitRace.js     vehicle-agnostic lap progress and timing
    race.js            preserved original drag-race director
  car/                 preserved existing visual car
  physics/vehicle.js   preserved drag model plus optional bounds switch
  input/controls.js    keyboard, gamepad and WebXR controllers
  audio/engine.js      synthesised V8 preview audio
```

## Quest budget

The world audit constructs every browser-generated mesh and checks all geometry
and instance matrices for non-finite values.

| Component | Mesh draws | Rendered triangles |
|---|---:|---:|
| Course and environment | 130 | 110,719 |
| Existing car | 164 | 59,850 |
| Estimated combined scene | 294 | 170,569 |

Repeated scenery accounts for **4,509 instances**. The visual pass favours
instancing over flattening detail away, so road studs, tunnel ribs, trees,
street furniture and structural parts remain legible while the draw-call total
stays inside the project's Quest guard.

## Checks and deployment

```bash
npm run smoke
npm run build
```

The checks cover:

- all original car hierarchy, scale, draw-call and triangle budgets;
- original drag physics, timing and frame-rate independence;
- course length, elevation, grade, checkpoints and road-surface queries;
- barrier deflection, collision speed loss, open roadside sections and tunnel
  wall collision;
- a finite, explicitly downward-facing overpass soffit;
- complete world construction, required landmarks, finite geometry and
  instance matrices, plus world draw-call/triangle budgets.

Pushes to `main`, `claude/**` and `agent/**` build through GitHub Actions.
Only `main` publishes the live GitHub Pages site; feature branches and pull
requests build and run the checks without replacing the live deployment.

## Licence

The vendored Three.js code is MIT, © Three.js authors.
