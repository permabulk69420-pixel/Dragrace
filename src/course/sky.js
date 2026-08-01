/**
 * Sky, fog and lighting for the street course.
 *
 * The mood is late blue hour: the sun has just gone into the sea behind the
 * harbour, the sky still has colour in it, and the city has its lights on. That
 * is the moment early-2000s street racers were always set in, and it is also
 * the cheapest good-looking option - a single painted gradient does the sky,
 * the reflections and the ambient, with two directional lights on top.
 */
import * as THREE from 'three';
import { hasDOM } from './materials.js';

/** Paint the sky dome into an equirectangular canvas. */
function skyCanvas(mood) {
  if (!hasDOM) return null;
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 1024;
  const g = c.getContext('2d');
  const H = c.height;
  const W = c.width;

  const grd = g.createLinearGradient(0, 0, 0, H);
  for (const [stop, colour] of mood.sky) grd.addColorStop(stop, colour);
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);

  // Sun, low over the water.
  const sunX = W * mood.sunU;
  const sunY = H * 0.505;
  const glow = g.createRadialGradient(sunX, sunY, 4, sunX, sunY, H * 0.62);
  glow.addColorStop(0.00, mood.sunCore);
  glow.addColorStop(0.06, mood.sunInner);
  glow.addColorStop(0.30, mood.sunOuter);
  glow.addColorStop(1.00, 'rgba(255,140,60,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  // Cloud bands, squashed towards the horizon like real ones are.
  for (let i = 0; i < 90; i++) {
    const t = Math.random();
    const y = H * 0.16 + t * H * 0.3;
    const w = 120 + Math.random() * 520;
    const h = 5 + Math.random() * (18 + t * 26);
    g.globalAlpha = 0.06 + Math.random() * 0.22;
    g.fillStyle = Math.random() < 0.35 ? mood.cloudWarm : mood.cloudCool;
    g.beginPath();
    g.ellipse(Math.random() * W, y, w, h, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;

  // Stars, fading out towards the horizon.
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 900; i++) {
    const y = Math.random() ** 1.6 * H * 0.42;
    g.globalAlpha = (0.12 + Math.random() * 0.6) * (1 - y / (H * 0.5));
    g.fillRect(Math.random() * W, y, 1.7, 1.7);
  }
  g.globalAlpha = 1;

  // The city's own light, bleeding up off the horizon all the way round.
  const haze = g.createLinearGradient(0, H * 0.42, 0, H * 0.52);
  haze.addColorStop(0, 'rgba(255,150,70,0)');
  haze.addColorStop(1, mood.cityGlow);
  g.fillStyle = haze;
  g.fillRect(0, H * 0.42, W, H * 0.1);

  // Below the horizon: dark ground haze, so reflections do not pick up sky.
  const below = g.createLinearGradient(0, H * 0.52, 0, H);
  below.addColorStop(0, mood.groundNear);
  below.addColorStop(1, mood.groundFar);
  g.fillStyle = below;
  g.fillRect(0, H * 0.52, W, H * 0.48);

  return c;
}

export const MOODS = {
  dusk: {
    sky: [
      [0.00, '#060a18'],
      [0.22, '#101b3a'],
      [0.38, '#26375f'],
      [0.46, '#5b6a8c'],
      [0.495, '#c98a52'],
      [0.51, '#e0954f'],
      [0.53, '#5c4436'],
      [0.62, '#1b1a20'],
      [1.00, '#0a0b0f'],
    ],
    sunU: 0.72,
    sunCore: 'rgba(255,244,214,1)',
    sunInner: 'rgba(255,190,110,0.9)',
    sunOuter: 'rgba(255,132,60,0.18)',
    cloudWarm: '#ffb27a',
    cloudCool: '#4a5b80',
    cityGlow: 'rgba(255,146,66,0.30)',
    groundNear: '#151519',
    groundFar: '#08080b',
    sunColour: 0xffc79a,
    sunIntensity: 2.1,
    skyColour: 0x7f9dd4,
    groundColour: 0x2a231d,
    hemiIntensity: 0.85,
    rimColour: 0x6f93ff,
    rimIntensity: 0.55,
    fog: 0x1a2436,
    fogDensity: 0.0011,
    exposure: 1.06,
    lampLevel: 1,
  },
};

/**
 * Light the scene.
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {object} [opts]
 */
export function setupSky(renderer, scene, opts = {}) {
  const mood = MOODS[opts.mood ?? 'dusk'] ?? MOODS.dusk;

  const canvas = skyCanvas(mood);
  let envMap = null;
  if (canvas) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    envMap = pmrem.fromEquirectangular(tex).texture;
    scene.environment = envMap;
    scene.environmentIntensity = 0.9;
    pmrem.dispose();
  }

  scene.fog = new THREE.FogExp2(mood.fog, mood.fogDensity);
  renderer.toneMappingExposure = mood.exposure;

  // Key light. The shadow camera is small and rides with the player, because a
  // shadow map that covers a 1 km circuit is a shadow map that shows nothing.
  const sun = new THREE.DirectionalLight(mood.sunColour, mood.sunIntensity);
  sun.position.set(-120, 90, -60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 420;
  const extent = 70;
  sun.shadow.camera.left = -extent;
  sun.shadow.camera.right = extent;
  sun.shadow.camera.top = extent;
  sun.shadow.camera.bottom = -extent;
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = 0.05;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(mood.skyColour, mood.groundColour, mood.hemiIntensity);
  scene.add(hemi);

  // Cool bounce from the far side of the street, so silhouettes stay readable.
  const rim = new THREE.DirectionalLight(mood.rimColour, mood.rimIntensity);
  rim.position.set(140, 60, 120);
  scene.add(rim);

  const offset = new THREE.Vector3(-150, 120, -80);

  return {
    sun,
    hemi,
    rim,
    envMap,
    mood,
    /** Keep the shadow frustum around wherever the action is. */
    follow(position) {
      sun.position.copy(position).add(offset);
      sun.target.position.copy(position);
      sun.target.updateMatrixWorld();
    },
    dispose() {
      envMap?.dispose();
      scene.background?.dispose?.();
    },
  };
}
