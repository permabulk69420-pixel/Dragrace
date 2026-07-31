/**
 * Sky and image-based lighting.
 *
 * A dusk gradient is painted into a canvas, used both as the visible sky and,
 * through PMREM, as the environment map. That gives the paint and chrome
 * something to reflect without shipping an HDR file.
 */
import * as THREE from 'three';

function skyCanvas() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d');

  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0.00, '#0a1024');
  sky.addColorStop(0.34, '#1d3557');
  sky.addColorStop(0.47, '#5a6f92');
  sky.addColorStop(0.50, '#c98a52');
  sky.addColorStop(0.52, '#7a5a44');
  sky.addColorStop(0.62, '#221a1c');
  sky.addColorStop(1.00, '#0b0c10');
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 512);

  // Sun glow just above the horizon, behind the car at the start line.
  const sunX = 1024 * 0.30;
  const sunY = 512 * 0.47;
  const glow = g.createRadialGradient(sunX, sunY, 4, sunX, sunY, 260);
  glow.addColorStop(0, 'rgba(255,236,196,1)');
  glow.addColorStop(0.12, 'rgba(255,186,110,0.85)');
  glow.addColorStop(0.45, 'rgba(255,140,70,0.22)');
  glow.addColorStop(1, 'rgba(255,120,60,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 1024, 512);

  // A few clouds, stretched so they read as bands near the horizon.
  g.globalAlpha = 0.25;
  for (let i = 0; i < 26; i++) {
    const y = 90 + Math.random() * 150;
    const w = 90 + Math.random() * 260;
    const h = 6 + Math.random() * 16;
    g.fillStyle = i % 3 === 0 ? '#ffb27a' : '#5d6f92';
    g.beginPath();
    g.ellipse(Math.random() * 1024, y, w, h, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;

  // Stars in the upper sky.
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 220; i++) {
    const y = Math.random() * 170;
    g.globalAlpha = 0.15 + Math.random() * 0.5 * (1 - y / 200);
    g.fillRect(Math.random() * 1024, y, 1.6, 1.6);
  }
  g.globalAlpha = 1;
  return c;
}

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 */
export function setupEnvironment(renderer, scene) {
  const tex = new THREE.CanvasTexture(skyCanvas());
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envMap = pmrem.fromEquirectangular(tex).texture;
  scene.environment = envMap;
  scene.background = tex;
  scene.environmentIntensity = 1.0;
  scene.fog = new THREE.FogExp2(0x18202e, 0.0011);
  pmrem.dispose();

  // Key light: low sun, warm, casting along the strip.
  const sun = new THREE.DirectionalLight(0xffd0a0, 3.0);
  sun.position.set(30, 30, 24);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 80;
  const s = 14;
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.HemisphereLight(0x9cc0ff, 0x3a2c22, 0.85);
  scene.add(fill);

  // A cool rim light from the far side so the car reads in silhouette.
  const rim = new THREE.DirectionalLight(0x7fa8ff, 0.9);
  rim.position.set(-30, 14, -26);
  scene.add(rim);

  return { sun, fill, rim, envMap };
}
