# Apex R-9 WebXR Drag Race

A Quest-first, first-person quarter-mile prototype built with JavaScript, Three.js and standard WebXR. The complete Apex R-9 coupe — exterior, cockpit, movable wheel/steering pivots and interior controls — is constructed directly from code in `src/car.js`.

## Controls

- Quest: right trigger throttle, left trigger brake, left stick steering, A shift up, X shift down, B reset.
- Keyboard: W/S throttle and brake, A/D steer, Space or E shift up, Q shift down, C changes view, R resets.
- Touch controls are shown automatically on phones and tablets.

The on-screen `EXPORT CAR GLB` action exports the live car hierarchy as a reusable binary glTF asset while preserving named parts and pivots.
The repository also ships a generated copy at `public/assets/apex-r9-drag-coupe.glb`; regenerate it after car-source changes with `npm run export:car`.

## Local development

```bash
npm install
npm run dev
```

Build the static GitHub Pages version with:

```bash
npm run build:pages
```

WebXR immersive mode requires HTTPS and a compatible headset/browser. GitHub Pages deployment is handled by `.github/workflows/deploy-pages.yml`.
