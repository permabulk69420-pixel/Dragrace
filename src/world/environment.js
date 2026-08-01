/** Night sky, reflections and broad lighting for the street-racing world. */
import * as THREE from 'three';
import { seededRandom } from './materials.js';

function skyCanvas() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d');
  const random = seededRandom(0x5a17c0de);

  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0.00, '#02040c');
  sky.addColorStop(0.24, '#071126');
  sky.addColorStop(0.47, '#162747');
  sky.addColorStop(0.56, '#3f2940');
  sky.addColorStop(0.63, '#16141e');
  sky.addColorStop(1.00, '#05070a');
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 512);

  // Sodium-orange city glow sits low on the horizon and reads in reflections.
  for (const [x, colour, radius] of [[215, '#ff7d36', 250], [730, '#5b7dff', 210]]) {
    const glow = g.createRadialGradient(x, 286, 3, x, 286, radius);
    glow.addColorStop(0, `${colour}b8`);
    glow.addColorStop(0.24, `${colour}45`);
    glow.addColorStop(1, `${colour}00`);
    g.fillStyle = glow;
    g.fillRect(0, 80, 1024, 360);
  }

  // A far-off skyline is baked into the environment map. It fills gaps
  // between the real building clusters and gives every horizon direction the
  // same dense metropolitan read without adding draw calls.
  g.fillStyle = '#050812';
  let skylineX = 0;
  while (skylineX < 1024) {
    const width = 7 + random() * 22;
    const height = 7 + Math.pow(random(), 2.1) * 58;
    g.fillRect(skylineX, 286 - height, width, height + 22);
    if (height > 26 && random() > 0.58) {
      g.fillStyle = random() > 0.5 ? '#b87539' : '#456b91';
      g.globalAlpha = 0.32;
      for (let wy = 274 - height; wy < 276; wy += 7) {
        for (let wx = skylineX + 3; wx < skylineX + width - 2; wx += 6) {
          if (random() > 0.62) g.fillRect(wx, wy, 2, 2);
        }
      }
      g.globalAlpha = 1;
      g.fillStyle = '#050812';
    }
    skylineX += width + 1 + random() * 4;
  }
  for (const [y, colour, alpha] of [[287, '#ff8b45', 0.22], [292, '#4e8fff', 0.12]]) {
    g.fillStyle = colour;
    g.globalAlpha = alpha;
    g.fillRect(0, y, 1024, 2);
  }
  g.globalAlpha = 1;

  // Long cloud bands catch a little city light without making a bright sky.
  g.globalAlpha = 0.2;
  for (let i = 0; i < 30; i++) {
    const y = 120 + random() * 170;
    const w = 80 + random() * 250;
    const h = 4 + random() * 13;
    g.fillStyle = i % 3 ? '#576884' : '#9a5c53';
    g.beginPath();
    g.ellipse(random() * 1024, y, w, h, (random() - 0.5) * 0.05, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;

  // Stars fade out toward the light-polluted horizon.
  for (let i = 0; i < 320; i++) {
    const y = random() * 205;
    const alpha = (0.18 + random() * 0.7) * (1 - y / 260);
    g.fillStyle = `rgba(220,235,255,${alpha})`;
    const size = random() > 0.96 ? 2 : 1;
    g.fillRect(random() * 1024, y, size, size);
  }

  const moon = g.createRadialGradient(842, 76, 2, 842, 76, 38);
  moon.addColorStop(0, '#f4f4e6');
  moon.addColorStop(0.24, '#dce5ef');
  moon.addColorStop(0.31, '#8fb4df55');
  moon.addColorStop(1, '#8fb4df00');
  g.fillStyle = moon;
  g.fillRect(790, 24, 104, 104);
  return c;
}

function tropicalSkyCanvas() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d');
  const random = seededRandom(0x71cebeac);
  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0.00, '#030716');
  sky.addColorStop(0.28, '#101a42');
  sky.addColorStop(0.48, '#4b315f');
  sky.addColorStop(0.565, '#bd667a');
  sky.addColorStop(0.64, '#30203a');
  sky.addColorStop(1.00, '#070a13');
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 512);

  for (const [x, colour, radius] of [[155, '#ff759d', 245], [785, '#2fd5df', 205]]) {
    const glow = g.createRadialGradient(x, 282, 2, x, 282, radius);
    glow.addColorStop(0, `${colour}a8`);
    glow.addColorStop(0.28, `${colour}38`);
    glow.addColorStop(1, `${colour}00`);
    g.fillStyle = glow;
    g.fillRect(0, 80, 1024, 360);
  }

  // A low, varied coastal skyline keeps the horizon populated without the
  // oversized black rectangles of the industrial environment map.
  let x = 0;
  while (x < 1024) {
    const width = 5 + random() * 14;
    const height = 3 + Math.pow(random(), 2.5) * 30;
    g.fillStyle = random() > 0.68 ? '#17162d' : '#101427';
    g.fillRect(x, 288 - height, width, height + 13);
    if (height > 13 && random() > 0.52) {
      g.fillStyle = random() > 0.5 ? '#d27b7c' : '#4ab3bd';
      g.globalAlpha = 0.34;
      for (let wy = 291 - height; wy < 284; wy += 6) {
        for (let wx = x + 2; wx < x + width - 1; wx += 5) {
          if (random() > 0.58) g.fillRect(wx, wy, 1.5, 1.5);
        }
      }
      g.globalAlpha = 1;
    }
    x += width + 2 + random() * 5;
  }

  g.globalAlpha = 0.16;
  for (let i = 0; i < 24; i++) {
    const y = 115 + random() * 165;
    g.fillStyle = i % 2 ? '#b7a3c5' : '#6196b3';
    g.beginPath();
    g.ellipse(random() * 1024, y, 70 + random() * 210, 3 + random() * 10, (random() - 0.5) * 0.04, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 260; i++) {
    const y = random() * 205;
    const alpha = (0.16 + random() * 0.68) * (1 - y / 275);
    g.fillStyle = `rgba(225,235,255,${alpha})`;
    g.fillRect(random() * 1024, y, random() > 0.965 ? 2 : 1, 1);
  }
  return c;
}

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 */
export function setupEnvironment(renderer, scene) {
  const sky = new THREE.CanvasTexture(skyCanvas());
  sky.mapping = THREE.EquirectangularReflectionMapping;
  sky.colorSpace = THREE.SRGBColorSpace;
  const tropicalSky = new THREE.CanvasTexture(tropicalSkyCanvas());
  tropicalSky.mapping = THREE.EquirectangularReflectionMapping;
  tropicalSky.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envMap = pmrem.fromEquirectangular(sky).texture;
  scene.background = sky;
  scene.environment = envMap;
  scene.environmentIntensity = 0.88;
  scene.fog = new THREE.FogExp2(0x09131e, 0.00078);
  pmrem.dispose();

  // The moon remains the one shadow-casting world light.  Its compact shadow
  // frustum follows the car in main.js, keeping resolution useful on Quest.
  const moon = new THREE.DirectionalLight(0xa8caff, 2.65);
  moon.name = 'MoonKey';
  moon.position.set(34, 42, 26);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.near = 1;
  moon.shadow.camera.far = 105;
  moon.shadow.camera.left = -28;
  moon.shadow.camera.right = 28;
  moon.shadow.camera.top = 28;
  moon.shadow.camera.bottom = -28;
  moon.shadow.bias = -0.0008;
  moon.shadow.normalBias = 0.035;
  scene.add(moon, moon.target);

  const hemisphere = new THREE.HemisphereLight(0x779dd3, 0x2a1d15, 0.86);
  hemisphere.name = 'NightHemisphere';
  scene.add(hemisphere);

  const cityBounce = new THREE.DirectionalLight(0xff7f42, 0.54);
  cityBounce.name = 'CityBounce';
  cityBounce.position.set(-70, 18, -90);
  scene.add(cityBounce);

  const skylineFill = new THREE.DirectionalLight(0x675cff, 0.36);
  skylineFill.name = 'SkylineFill';
  skylineFill.position.set(110, 30, 120);
  scene.add(skylineFill);

  function applyTheme(theme = {}) {
    scene.background = theme.background === 'tropical' ? tropicalSky : sky;
    scene.fog.color.setHex(theme.fog ?? 0x09131e);
    scene.fog.density = theme.fogDensity ?? 0.00078;
    renderer.toneMappingExposure = theme.exposure ?? 1.20;
    moon.color.setHex(theme.moon ?? 0xa8caff);
    hemisphere.color.setHex(theme.hemisphereSky ?? 0x779dd3);
    hemisphere.groundColor.setHex(theme.hemisphereGround ?? 0x2a1d15);
    cityBounce.color.setHex(theme.bounce ?? 0xff7f42);
    skylineFill.color.setHex(theme.skyline ?? 0x675cff);
  }

  return {
    // `sun` is retained as a compatibility alias for the existing renderer loop.
    sun: moon,
    moon,
    fill: hemisphere,
    cityBounce,
    skylineFill,
    envMap,
    tropicalSky,
    applyTheme,
  };
}
