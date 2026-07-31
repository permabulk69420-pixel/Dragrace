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

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 */
export function setupEnvironment(renderer, scene) {
  const sky = new THREE.CanvasTexture(skyCanvas());
  sky.mapping = THREE.EquirectangularReflectionMapping;
  sky.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envMap = pmrem.fromEquirectangular(sky).texture;
  scene.background = sky;
  scene.environment = envMap;
  scene.environmentIntensity = 0.72;
  scene.fog = new THREE.FogExp2(0x08111b, 0.00105);
  pmrem.dispose();

  // The moon remains the one shadow-casting world light.  Its compact shadow
  // frustum follows the car in main.js, keeping resolution useful on Quest.
  const moon = new THREE.DirectionalLight(0xa8caff, 2.25);
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

  const hemisphere = new THREE.HemisphereLight(0x7098d0, 0x22180f, 0.62);
  hemisphere.name = 'NightHemisphere';
  scene.add(hemisphere);

  const cityBounce = new THREE.DirectionalLight(0xff7f42, 0.42);
  cityBounce.name = 'CityBounce';
  cityBounce.position.set(-70, 18, -90);
  scene.add(cityBounce);

  const skylineFill = new THREE.DirectionalLight(0x675cff, 0.28);
  skylineFill.name = 'SkylineFill';
  skylineFill.position.set(110, 30, 120);
  scene.add(skylineFill);

  return {
    // `sun` is retained as a compatibility alias for the existing renderer loop.
    sun: moon,
    moon,
    fill: hemisphere,
    cityBounce,
    skylineFill,
    envMap,
  };
}
