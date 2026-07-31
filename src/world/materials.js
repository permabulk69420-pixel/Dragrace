/** Procedural textures and the shared, draw-call-friendly world material set. */
import * as THREE from 'three';

export function seededRandom(seed = 0x5f3759df) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
function textureFromCanvas(canvas, { repeat = true, srgb = true } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function canvas(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function asphaltTexture() {
  const c = canvas(512);
  const g = c.getContext('2d');
  const random = seededRandom(0xa512a17);
  g.fillStyle = '#26292f';
  g.fillRect(0, 0, c.width, c.height);

  const image = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < image.data.length; i += 4) {
    const grain = Math.floor((random() - 0.5) * 26);
    image.data[i] = 39 + grain;
    image.data[i + 1] = 42 + grain;
    image.data[i + 2] = 47 + grain;
    image.data[i + 3] = 255;
  }
  g.putImageData(image, 0, 0);

  g.globalAlpha = 0.22;
  for (let i = 0; i < 1500; i++) {
    const v = 65 + Math.floor(random() * 80);
    g.fillStyle = `rgb(${v},${v},${v + 3})`;
    const r = 0.4 + random() * 1.6;
    g.fillRect(random() * 512, random() * 512, r, r);
  }
  g.globalAlpha = 0.32;
  g.strokeStyle = '#08090b';
  g.lineWidth = 1.1;
  for (let i = 0; i < 24; i++) {
    let x = random() * 512;
    let y = random() * 512;
    g.beginPath();
    g.moveTo(x, y);
    for (let j = 0; j < 4; j++) {
      x += (random() - 0.5) * 34;
      y += 8 + random() * 25;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  return textureFromCanvas(c);
}

function concreteTexture() {
  const c = canvas(256);
  const g = c.getContext('2d');
  const random = seededRandom(0xc0ac3e7);
  g.fillStyle = '#868991';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) {
    const shade = random() > 0.5 ? 255 : 20;
    g.fillStyle = `rgba(${shade},${shade},${shade},${0.015 + random() * 0.06})`;
    g.fillRect(random() * 256, random() * 256, 1 + random() * 2, 1 + random() * 2);
  }
  g.strokeStyle = '#555860';
  g.globalAlpha = 0.32;
  g.strokeRect(2, 2, 252, 252);
  g.globalAlpha = 1;
  return textureFromCanvas(c);
}

function groundTexture() {
  const c = canvas(256);
  const g = c.getContext('2d');
  const random = seededRandom(0x91e10da5);
  g.fillStyle = '#15191a';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1500; i++) {
    const hue = 85 + random() * 35;
    g.fillStyle = `hsla(${hue},18%,${7 + random() * 8}%,${0.08 + random() * 0.18})`;
    g.fillRect(random() * 256, random() * 256, 2 + random() * 5, 2 + random() * 5);
  }
  return textureFromCanvas(c);
}

function facadeTextures() {
  const colour = document.createElement('canvas');
  colour.width = 256;
  colour.height = 512;
  const emissive = document.createElement('canvas');
  emissive.width = 256;
  emissive.height = 512;
  const cg = colour.getContext('2d');
  const eg = emissive.getContext('2d');
  const random = seededRandom(0xb017d1a9);
  cg.fillStyle = '#161b24';
  cg.fillRect(0, 0, 256, 512);
  eg.fillStyle = '#000';
  eg.fillRect(0, 0, 256, 512);

  for (let y = 12; y < 512; y += 30) {
    for (let x = 10; x < 256; x += 28) {
      const lit = random() > 0.47;
      const warm = random() > 0.24;
      cg.fillStyle = lit ? (warm ? '#9b7843' : '#526f82') : '#111722';
      cg.fillRect(x, y, 17, 15);
      cg.strokeStyle = '#2c333e';
      cg.strokeRect(x - 1, y - 1, 19, 17);
      if (lit) {
        eg.fillStyle = warm ? '#ffbd62' : '#78caff';
        eg.fillRect(x, y, 17, 15);
      }
    }
  }
  return {
    map: textureFromCanvas(colour),
    emissiveMap: textureFromCanvas(emissive, { srgb: false }),
  };
}

function warehouseTexture() {
  const c = canvas(256);
  const g = c.getContext('2d');
  g.fillStyle = '#3f454b';
  g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) {
    g.fillStyle = x % 32 ? '#4a5057' : '#30363c';
    g.fillRect(x, 0, 9, 256);
  }
  g.fillStyle = '#1b2025';
  g.fillRect(28, 82, 200, 152);
  g.strokeStyle = '#68717b';
  g.lineWidth = 5;
  for (let y = 94; y < 230; y += 28) {
    g.beginPath();
    g.moveTo(30, y);
    g.lineTo(226, y);
    g.stroke();
  }
  return textureFromCanvas(c);
}

function glowTexture(colour = '#ffae57') {
  const c = canvas(128);
  const g = c.getContext('2d');
  const glow = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  glow.addColorStop(0, colour);
  glow.addColorStop(0.12, `${colour}cc`);
  glow.addColorStop(0.46, `${colour}40`);
  glow.addColorStop(1, `${colour}00`);
  g.fillStyle = glow;
  g.fillRect(0, 0, 128, 128);
  return textureFromCanvas(c, { repeat: false });
}

export function makeSignTexture(text, {
  sub = '',
  colour = '#ff5b2e',
  background = '#080b12',
  width = 1024,
  height = 384,
} = {}) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const g = c.getContext('2d');
  const gradient = g.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, background);
  gradient.addColorStop(1, '#151b2a');
  g.fillStyle = gradient;
  g.fillRect(0, 0, width, height);
  g.strokeStyle = colour;
  g.lineWidth = 18;
  g.strokeRect(12, 12, width - 24, height - 24);
  g.shadowColor = colour;
  g.shadowBlur = 32;
  g.fillStyle = '#f7f8ff';
  g.font = `900 ${Math.min(150, width / Math.max(6.5, text.length * 0.66))}px ui-sans-serif, system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, width / 2, height * (sub ? 0.43 : 0.51));
  g.shadowBlur = 0;
  if (sub) {
    g.fillStyle = colour;
    g.font = '700 48px ui-sans-serif, system-ui, sans-serif';
    g.letterSpacing = '8px';
    g.fillText(sub, width / 2, height * 0.73);
  }
  return textureFromCanvas(c, { repeat: false });
}

export function makeChevronTexture(direction = 1) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = '#101319';
  g.fillRect(0, 0, 512, 192);
  g.fillStyle = '#ffcc35';
  const points = direction > 0
    ? [[90, 35], [180, 96], [90, 157], [145, 157], [238, 96], [145, 35]]
    : [[422, 35], [332, 96], [422, 157], [367, 157], [274, 96], [367, 35]];
  for (const shift of [-112, 112]) {
    g.beginPath();
    points.forEach(([x, y], i) => (i ? g.lineTo(x + shift, y) : g.moveTo(x + shift, y)));
    g.closePath();
    g.fill();
  }
  g.strokeStyle = '#fff2b3';
  g.lineWidth = 8;
  g.strokeRect(4, 4, 504, 184);
  return textureFromCanvas(c, { repeat: false });
}

export function createWorldMaterials() {
  const asphalt = asphaltTexture();
  const concrete = concreteTexture();
  const ground = groundTexture();
  const facades = facadeTextures();

  return {
    road: new THREE.MeshStandardMaterial({ color: 0xb9c0c9, map: asphalt, roughness: 0.79, metalness: 0.07 }),
    shoulder: new THREE.MeshStandardMaterial({ color: 0x30343b, map: asphalt, roughness: 0.93, metalness: 0.02 }),
    laneWhite: new THREE.MeshStandardMaterial({ color: 0xf4f6ee, roughness: 0.55, emissive: 0x32342f, emissiveIntensity: 0.45 }),
    laneYellow: new THREE.MeshStandardMaterial({ color: 0xffc332, roughness: 0.55, emissive: 0x4d3200, emissiveIntensity: 0.7 }),
    curbRed: new THREE.MeshStandardMaterial({ color: 0xc92c2b, roughness: 0.75 }),
    curbWhite: new THREE.MeshStandardMaterial({ color: 0xe5e5df, roughness: 0.75 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0xb0b2b4, map: concrete, roughness: 0.91, metalness: 0.02 }),
    concreteDark: new THREE.MeshStandardMaterial({ color: 0x555a61, map: concrete, roughness: 0.94 }),
    barrierStripe: new THREE.MeshStandardMaterial({ color: 0xc62828, roughness: 0.65, emissive: 0x220000 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x303741, roughness: 0.55, metalness: 0.72 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x11161c, roughness: 0.65, metalness: 0.55 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xffe1a0, emissive: 0xffa342, emissiveIntensity: 5.5, roughness: 0.25 }),
    coolLamp: new THREE.MeshStandardMaterial({ color: 0xd8f1ff, emissive: 0x80cfff, emissiveIntensity: 5.0, roughness: 0.25 }),
    ground: new THREE.MeshStandardMaterial({ color: 0x364038, map: ground, roughness: 1 }),
    dirt: new THREE.MeshStandardMaterial({ color: 0x34302a, roughness: 1 }),
    building: new THREE.MeshStandardMaterial({
      color: 0xb5bbc5,
      map: facades.map,
      emissive: 0xffbd72,
      emissiveMap: facades.emissiveMap,
      emissiveIntensity: 0.72,
      roughness: 0.82,
      metalness: 0.08,
    }),
    warehouse: new THREE.MeshStandardMaterial({ color: 0x727a84, map: warehouseTexture(), roughness: 0.86, metalness: 0.22 }),
    container: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0.15 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x11161d, roughness: 0.88, metalness: 0.2 }),
    tunnel: new THREE.MeshStandardMaterial({ color: 0x6b7078, map: concrete, roughness: 0.86, side: THREE.DoubleSide }),
    water: new THREE.MeshStandardMaterial({ color: 0x071e2b, roughness: 0.26, metalness: 0.32, transparent: true, opacity: 0.94 }),
    sodiumGlow: new THREE.MeshBasicMaterial({
      map: glowTexture('#ff9b42'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      opacity: 0.55,
      side: THREE.DoubleSide,
    }),
    cyanGlow: new THREE.MeshBasicMaterial({
      map: glowTexture('#47ccff'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      opacity: 0.42,
      side: THREE.DoubleSide,
    }),
  };
}
