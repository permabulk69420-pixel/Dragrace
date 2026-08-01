# Midnight Circuit

A complete first-person WebXR street-racing game for Meta Quest, built with
Three.js ES modules at real-world scale (**1 unit = 1 metre**) with two
selectable circuits.

Midnight Circuit is a **3.68 km closed road course** with a 35 m elevation
change and a maximum 6.6% grade. It is designed to feel like an early-2000s
street racer rather than a test loop: docklands, an industrial climb, a high
viaduct, neon commercial streets, a downtown descent, a harbour tunnel and a
fast final boulevard all form one continuous lap.

**Vice Coast** adds a longer **5.22 km** tropical circuit with a genuinely
straight 1.46 km oceanfront run, Art Deco hotel frontage, audited royal palms,
a marina and yacht district, an elevated bay causeway and neon downtown. The
start overlay selects either circuit before desktop or VR entry; only the
selected world remains resident on Quest.

The existing code-generated car remains in the project as a playable preview.
No file under `src/car/` was changed for the course build. The world exposes a
vehicle-independent spawn and road-surface API so another vehicle can replace
the preview car without rebuilding the course.

## Course features

- Start-screen circuit cards switch the route, scenery, collision map, race
  director and lighting theme as one level transaction.
- 3.68 km spline-authored loop with broad fast corners, linked switchbacks,
  meaningful elevation, road crown and corner banking.
- Layered asphalt, shoulders, reflective double centre lines, edge paint,
  direction arrows, city sidewalks, selective red/white apex kerbs and a full
  start grid.
- Continuous world-owned collision at visible Jersey barriers, steel
  guardrails and harbour-tunnel walls, with angle-sensitive deflection, speed
  loss and pooled impact sparks. The full lap is physically contained; contact
  resolves at the roadside structure rather than recentering the vehicle.
- Bump- and roughness-mapped asphalt with repair patches, braking rubber,
  puddles, manholes, storm drains, expansion joints and hundreds of reflective
  lane and edge studs.
- Dockyards with stacked containers, loading warehouses, a five-bay sawtooth
  works, refinery, power station, storage tanks, rail lines and three detailed
  truss container cranes with trolleys, hoist cables and spreaders.
- Elevated skyway with a closed concrete slab, true downward-facing soffit,
  steel webs and flanges, crossbeams, piers, underdeck lights, graffiti,
  protected edges, ground-level service road, pier footings, utility cabinets
  and a 35 m high point.
- Enclosed harbour tunnel with concrete shell, lower wall bands, cool ceiling
  fixtures, structural arch ribs, cable trays, emergency markers, detailed
  portals and local light pools.
- A reduced, footprint-audited background skyline uses five silhouette
  families: chamfered towers, tiered towers, round-corner towers, crowned
  offices and wide slab hotels. Glass, concrete and brick façades have distinct
  colour, window rhythm, floor ledges, podiums, rooftop machinery and beacons.
- Ten authored architectural landmarks create recognisable districts: an Art
  Deco hotel, curved glass tower, open-deck parking structure, brick loft with
  water tank and fire escapes, twin towers with skybridge, tuner garage,
  broadcast tower and scaled variants with their own plazas and signage.
- Industrial buildings use gabled and sawtooth profiles, corrugated
  weathering, physical loading doors, roof vents, pipe racks, domed tanks,
  banded stacks, boiler-house buttresses and lit clerestories.
- Continuous rolling ridge meshes replace the old repeated cone mountains. The
  rejected low-quality roadside tree generator is removed entirely.
- Every large scenery footprint, including landmark plazas and industrial
  yards, is rejected or pushed outward before it can overlap any route segment.
- Fictional period-style billboards, neon storefronts, start/finish gantry,
  grid lights and a live course scoreboard.
- Procedural night sky, city glow, stars, fog, reflection environment and a
  compact shadow-casting moon light.
- A moving pool of four real PointLights follows the player to the nearest
  street or tunnel fixtures; hundreds of visible lamps do not become hundreds
  of dynamic lights.
- Vice Coast uses 8 authored stepped Art Deco hotels, 12 detailed downtown
  towers, 4 marina yachts and 44 instanced palms instead of random building or
  tree scatter. All 64 building/tree footprints are conservatively audited
  against every route segment before being accepted.
- A separate tropical sky, pink/cyan local lighting, ocean, beach, boardwalk,
  lifeguard huts, causeway structure and façade window grids give Vice Coast
  its own visual identity without duplicating the car or physics systems.

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

`src/world/levels.js` is the selectable level registry, while each `CourseRoute`
remains independent of the car, vehicle physics, DOM and renderer.

```js
import { buildTrack } from './world/track.js';

// The optional half-width controls clearance from the vehicle centre to a
// visible wall. The 1.06 m default matches the included preview car.
const track = buildTrack({
  levelId: 'vice-coast', // or 'midnight-circuit'
  collisionVehicleHalfWidth: 1.06,
});
scene.add(track.object);

// Place any vehicle on the grid.
vehicle.x = track.spawn.position.x;
vehicle.z = track.spawn.position.z;
vehicle.heading = track.spawn.heading;

// Resolve a plain mutable vehicle pose against barriers, guardrails and tunnel walls.
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

| Value | Midnight Circuit | Vice Coast |
|---|---:|---:|
| Lap length | 3,676 m | 5,217 m |
| Road width | 13.2 m | 13.2 m |
| Driveable width including shoulders | 15.9 m | 15.9 m |
| Peak elevation | 35.0 m | 9.0 m |
| Route samples | 840 | 1,120 |
| Checkpoints | 4 | 4 |

The preview integration makes one minimal physics compatibility change:
`Vehicle({ enforceStripBounds: false })` disables the old drag strip's global-X
lane clamp. Its default remains `true`, so the original drag physics tests and
behaviour are preserved.

## Architecture

```text
src/
  world/
    course.js          pure route, frames, spawn and nearest-surface queries
    levels.js          selectable circuit definitions and route profiles
    courseCollision.js visible full-lap edge collision for any plain vehicle pose
    roadGeometry.js    ribbons, barriers, fascia and tunnel sweep geometry
    materials.js       procedural textures and shared materials
    scenery.js         district composition, terrain, dock, lighting and hero props
    viceCoastScenery.js curated tropical coast, hotels, palms, marina and towers
    landmarks.js       authored hotel, tower, loft, garage and parking kits
    industrialLandmarks.js authored factory, refinery and power-station kits
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
| Midnight Circuit world | 273 | 118,549 |
| Vice Coast world | 266 | 105,357 |
| Existing car | 154 | 57,807 |
| Vice Coast + car | 420 | 163,164 |

Midnight Circuit repeated scenery accounts for **4,749 instances**; Vice Coast
uses **4,299 instances**. The larger authored landmark
set intentionally spends more draws on silhouette and structural detail, while
factory bays, refinery tanks, stack bands, crane trusses, road studs and tunnel
ribs remain instanced. The environment triangle count is lower than the prior
version despite the substantial geometry upgrade.

## Checks and deployment

```bash
npm run smoke
npm run build
```

The checks cover:

- all original car hierarchy, scale, draw-call and triangle budgets;
- original drag physics, timing and frame-rate independence;
- course length, elevation, grade, checkpoints and road-surface queries;
- two-level registration, selection wiring, the 5.22 km Vice Coast length and
  geometric verification of its 1.46 km beachfront straight;
- barrier/guardrail deflection, collision speed loss, tunnel wall collision and
  200-point full-lap edge-coverage sampling;
- a finite, explicitly downward-facing overpass soffit;
- removal of the rejected street-front/awning filler, pyramid terrain and tree
  generator, plus a geometric clearance audit covering all 146 large scenery
  and landmark footprints;
- zero road-clearance violations across every Vice Coast hotel, tower and palm,
  plus complete barrier/guardrail coverage around the second lap;
- complete world construction, required landmarks, finite geometry and
  instance matrices, plus world draw-call/triangle budgets.

Pushes to `main`, `claude/**` and `agent/**` build through GitHub Actions.
Only `main` publishes the live GitHub Pages site; feature branches and pull
requests build and run the checks without replacing the live deployment.

## Licence

The vendored Three.js code is MIT, © Three.js authors.
