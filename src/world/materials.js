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

function facadeTextures(style = 'glass', seed = 0xb017d1a9) {
  const colour = document.createElement('canvas');
  colour.width = 512;
  colour.height = 512;
  const emissive = document.createElement('canvas');
  emissive.width = 512;
  emissive.height = 512;
  const cg = colour.getContext('2d');
  const eg = emissive.getContext('2d');
  const random = seededRandom(seed);
  const styles = {
    glass: {
      wall: '#101923', frame: '#293847', floor: '#182430', unlit: '#071019',
      warm: '#b88245', cool: '#47748d', floorStep: 25, bayStep: 34, windowW: 25, windowH: 15,
    },
    concrete: {
      wall: '#45464a', frame: '#77787a', floor: '#35363a', unlit: '#12161a',
      warm: '#aa7a43', cool: '#526f7b', floorStep: 33, bayStep: 43, windowW: 22, windowH: 17,
    },
    brick: {
      wall: '#4a2926', frame: '#6e4036', floor: '#321d1c', unlit: '#111417',
      warm: '#ad7440', cool: '#4d6570', floorStep: 30, bayStep: 38, windowW: 24, windowH: 16,
    },
  };
  const palette = styles[style] ?? styles.glass;

  cg.fillStyle = palette.wall;
  cg.fillRect(0, 0, 512, 512);
  eg.fillStyle = '#000';
  eg.fillRect(0, 0, 512, 512);

  if (style === 'brick') {
    cg.strokeStyle = 'rgba(210,155,125,.10)';
    cg.lineWidth = 1;
    for (let y = 0; y < 512; y += 11) {
      cg.beginPath();
      cg.moveTo(0, y);
      cg.lineTo(512, y);
      cg.stroke();
      const shift = (Math.floor(y / 11) % 2) * 17;
      for (let x = shift; x < 512; x += 34) {
        cg.beginPath();
        cg.moveTo(x, y);
        cg.lineTo(x, y + 11);
        cg.stroke();
      }
    }
  }

  for (let y = 10; y < 472; y += palette.floorStep) {
    cg.fillStyle = palette.floor;
    cg.fillRect(0, y + palette.windowH + 5, 512, style === 'glass' ? 4 : 3);
    for (let x = 10; x < 512; x += palette.bayStep) {
      const lit = random() > (style === 'concrete' ? 0.60 : 0.48);
      const warm = random() > 0.28;
      cg.fillStyle = lit ? (warm ? palette.warm : palette.cool) : palette.unlit;
      cg.fillRect(x, y, palette.windowW, palette.windowH);
      cg.strokeStyle = palette.frame;
      cg.lineWidth = style === 'glass' ? 2 : 3;
      cg.strokeRect(x - 1, y - 1, palette.windowW + 2, palette.windowH + 2);
      if (style === 'glass') {
        cg.fillStyle = 'rgba(185,220,235,.16)';
        cg.fillRect(x + 3, y + 2, 2, palette.windowH - 4);
      }
      if (lit) {
        eg.fillStyle = warm ? '#ffb85e' : '#72c9ef';
        eg.fillRect(x + 1, y + 1, palette.windowW - 2, palette.windowH - 2);
      }
    }
  }

  // A darker, larger-scale ground-floor rhythm stops façades reading as one
  // repeated wallpaper tile when seen from cockpit height.
  cg.fillStyle = '#090c10';
  cg.fillRect(0, 466, 512, 46);
  for (let x = 8; x < 512; x += 64) {
    cg.fillStyle = x % 128 ? '#23343d' : '#30272b';
    cg.fillRect(x, 474, 52, 31);
    cg.strokeStyle = '#55616a';
    cg.strokeRect(x, 474, 52, 31);
    eg.fillStyle = x % 128 ? '#275f70' : '#6a3c2d';
    eg.globalAlpha = 0.34;
    eg.fillRect(x + 2, 476, 48, 27);
    eg.globalAlpha = 1;
  }

  const grime = cg.createLinearGradient(0, 380, 0, 512);
  grime.addColorStop(0, 'rgba(5,7,9,0)');
  grime.addColorStop(1, 'rgba(5,7,9,.28)');
  cg.fillStyle = grime;
  cg.fillRect(0, 380, 512, 132);
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
  g.strokeStyle = 'rgba(180,190,195,.22)';
  g.lineWidth = 2;
  for (let y = 20; y < 256; y += 46) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(256, y);
    g.stroke();
  }
  const random = seededRandom(0x4a2e110);
  for (let i = 0; i < 24; i++) {
    const x = random() * 256;
    const stain = g.createLinearGradient(x, 0, x + 4, 90);
    stain.addColorStop(0, 'rgba(80,38,20,.26)');
    stain.addColorStop(1, 'rgba(80,38,20,0)');
    g.fillStyle = stain;
    g.fillRect(x, random() * 170, 3 + random() * 4, 28 + random() * 70);
  }
  return textureFromCanvas(c);
}

function loadingDoorTexture() {
  const c = canvas(256);
  const g = c.getContext('2d');
  g.fillStyle = '#171c21';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#4e5962';
  g.lineWidth = 4;
  for (let y = 12; y < 256; y += 25) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(256, y);
    g.stroke();
  }
  g.strokeStyle = '#747f87';
  g.lineWidth = 7;
  g.strokeRect(5, 5, 246, 246);
  g.fillStyle = '#090c0f';
  g.fillRect(108, 190, 40, 66);
  return textureFromCanvas(c, { repeat: false });
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

function noiseTexture(seed, {
  size = 256,
  base = 128,
  spread = 42,
} = {}) {
  const c = canvas(size);
  const g = c.getContext('2d');
  const random = seededRandom(seed);
  const image = g.getImageData(0, 0, size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const value = Math.max(0, Math.min(255, base + (random() - 0.5) * spread));
    image.data[i] = value;
    image.data[i + 1] = value;
    image.data[i + 2] = value;
    image.data[i + 3] = 255;
  }
  g.putImageData(image, 0, 0);
  return textureFromCanvas(c, { srgb: false });
}

function fenceTexture() {
  const c = canvas(128);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(185,204,213,.9)';
  g.lineWidth = 3;
  for (let i = -128; i < 256; i += 18) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 128, 128);
    g.stroke();
    g.beginPath();
    g.moveTo(i, 128);
    g.lineTo(i + 128, 0);
    g.stroke();
  }
  return textureFromCanvas(c, { srgb: false });
}

function graffitiTexture() {
  const c = document.createElement('canvas');
  c.width = 768;
  c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 768, 256);
  g.lineJoin = 'round';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '900 italic 142px ui-sans-serif, system-ui, sans-serif';
  g.lineWidth = 24;
  g.strokeStyle = '#11121a';
  g.strokeText('NIGHT RUN', 384, 132);
  const fill = g.createLinearGradient(100, 30, 660, 220);
  fill.addColorStop(0, '#35d9ff');
  fill.addColorStop(0.5, '#9b5cff');
  fill.addColorStop(1, '#ff4d79');
  g.fillStyle = fill;
  g.fillText('NIGHT RUN', 384, 132);
  g.strokeStyle = '#e5fbff';
  g.lineWidth = 4;
  g.strokeText('NIGHT RUN', 384, 132);
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
  const glassFacades = facadeTextures('glass', 0xb017d1a9);
  const concreteFacades = facadeTextures('concrete', 0x6c0ac3e7);
  const brickFacades = facadeTextures('brick', 0xb21c4a11);
  const asphaltBump = noiseTexture(0xa512b00, { base: 124, spread: 78 });
  const asphaltRoughness = noiseTexture(0xa512f00, { base: 208, spread: 68 });
  const concreteBump = noiseTexture(0xc0acb00, { base: 128, spread: 34 });
  const buildingBump = noiseTexture(0xb011d00, { base: 128, spread: 22 });
  const makeBuildingMaterial = (facade, { roughness, metalness, color, emissiveIntensity }) => new THREE.MeshStandardMaterial({
    color,
    map: facade.map,
    bumpMap: buildingBump,
    bumpScale: 0.025,
    emissive: 0xffffff,
    emissiveMap: facade.emissiveMap,
    emissiveIntensity,
    roughness,
    metalness,
  });
  const buildingGlass = makeBuildingMaterial(glassFacades, {
    roughness: 0.38,
    metalness: 0.28,
    color: 0xa6bfd0,
    emissiveIntensity: 0.44,
  });
  const buildingConcrete = makeBuildingMaterial(concreteFacades, {
    roughness: 0.86,
    metalness: 0.04,
    color: 0xc4b8a8,
    emissiveIntensity: 0.34,
  });
  const buildingBrick = makeBuildingMaterial(brickFacades, {
    roughness: 0.90,
    metalness: 0.02,
    color: 0xa66b56,
    emissiveIntensity: 0.36,
  });

  return {
    road: new THREE.MeshStandardMaterial({
      color: 0xb9c0c9,
      map: asphalt,
      bumpMap: asphaltBump,
      bumpScale: 0.075,
      roughnessMap: asphaltRoughness,
      roughness: 0.94,
      metalness: 0.07,
    }),
    shoulder: new THREE.MeshStandardMaterial({
      color: 0x30343b,
      map: asphalt,
      bumpMap: asphaltBump,
      bumpScale: 0.11,
      roughnessMap: asphaltRoughness,
      roughness: 1,
      metalness: 0.02,
    }),
    laneWhite: new THREE.MeshStandardMaterial({ color: 0xf4f6ee, roughness: 0.55, emissive: 0x32342f, emissiveIntensity: 0.45 }),
    laneYellow: new THREE.MeshStandardMaterial({ color: 0xffc332, roughness: 0.55, emissive: 0x4d3200, emissiveIntensity: 0.7 }),
    curbRed: new THREE.MeshStandardMaterial({ color: 0xc92c2b, roughness: 0.75 }),
    curbWhite: new THREE.MeshStandardMaterial({ color: 0xe5e5df, roughness: 0.75 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0xb0b2b4, map: concrete, bumpMap: concreteBump, bumpScale: 0.055, roughness: 0.91, metalness: 0.02 }),
    concreteDark: new THREE.MeshStandardMaterial({ color: 0x555a61, map: concrete, bumpMap: concreteBump, bumpScale: 0.065, roughness: 0.94 }),
    underDeck: new THREE.MeshStandardMaterial({ color: 0x6a6c70, map: concrete, bumpMap: concreteBump, bumpScale: 0.085, roughness: 0.92, metalness: 0.03 }),
    girder: new THREE.MeshStandardMaterial({ color: 0x252a30, roughness: 0.52, metalness: 0.78 }),
    guardrail: new THREE.MeshStandardMaterial({ color: 0xaeb8c0, roughness: 0.34, metalness: 0.88 }),
    guardrailPost: new THREE.MeshStandardMaterial({ color: 0x727d86, roughness: 0.48, metalness: 0.76 }),
    curbFace: new THREE.MeshStandardMaterial({ color: 0x8e9297, map: concrete, bumpMap: concreteBump, bumpScale: 0.04, roughness: 0.9 }),
    barrierStripe: new THREE.MeshStandardMaterial({ color: 0xc62828, roughness: 0.65, emissive: 0x220000 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x303741, roughness: 0.55, metalness: 0.72 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x11161c, roughness: 0.65, metalness: 0.55 }),
    tunnelRib: new THREE.MeshStandardMaterial({ color: 0x343a42, roughness: 0.48, metalness: 0.76 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xffe1a0, emissive: 0xffa342, emissiveIntensity: 5.5, roughness: 0.25 }),
    coolLamp: new THREE.MeshStandardMaterial({ color: 0xd8f1ff, emissive: 0x80cfff, emissiveIntensity: 5.0, roughness: 0.25 }),
    ground: new THREE.MeshStandardMaterial({ color: 0x424a43, map: ground, roughness: 1 }),
    dirt: new THREE.MeshStandardMaterial({ color: 0x34302a, roughness: 1 }),
    terrainNear: new THREE.MeshStandardMaterial({ color: 0x222c31, roughness: 1, metalness: 0 }),
    terrainFar: new THREE.MeshStandardMaterial({ color: 0x18212a, roughness: 1, metalness: 0 }),
    // `building` remains a compatibility alias; the city builder uses the
    // three distinct façade/silhouette families below.
    building: buildingGlass,
    buildingGlass,
    buildingConcrete,
    buildingBrick,
    buildingPodium: new THREE.MeshStandardMaterial({ color: 0x363b42, map: concrete, bumpMap: concreteBump, bumpScale: 0.04, roughness: 0.82, metalness: 0.12 }),
    buildingTrim: new THREE.MeshStandardMaterial({ color: 0x69737c, roughness: 0.44, metalness: 0.58 }),
    buildingBeacon: new THREE.MeshStandardMaterial({ color: 0xff6250, emissive: 0xff2512, emissiveIntensity: 4.2, roughness: 0.2 }),
    warehouse: new THREE.MeshStandardMaterial({ color: 0x727a84, map: warehouseTexture(), roughness: 0.86, metalness: 0.22 }),
    warehouseDoor: new THREE.MeshStandardMaterial({ color: 0x8a949d, map: loadingDoorTexture(), roughness: 0.58, metalness: 0.55 }),
    container: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0.15 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x11161d, roughness: 0.88, metalness: 0.2 }),
    tunnel: new THREE.MeshStandardMaterial({ color: 0x6b7078, map: concrete, roughness: 0.86, side: THREE.DoubleSide }),
    water: new THREE.MeshStandardMaterial({ color: 0x071e2b, roughness: 0.26, metalness: 0.32, transparent: true, opacity: 0.94 }),
    roadPatch: new THREE.MeshStandardMaterial({
      color: 0x555b62,
      map: asphalt,
      bumpMap: asphaltBump,
      bumpScale: 0.1,
      roughness: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    }),
    skid: new THREE.MeshStandardMaterial({
      color: 0x060608,
      transparent: true,
      opacity: 0.58,
      roughness: 0.58,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    }),
    wetRoad: new THREE.MeshStandardMaterial({
      color: 0x0f1a22,
      transparent: true,
      opacity: 0.46,
      roughness: 0.16,
      metalness: 0.42,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -5,
    }),
    drain: new THREE.MeshStandardMaterial({ color: 0x1d2227, roughness: 0.42, metalness: 0.86 }),
    manhole: new THREE.MeshStandardMaterial({ color: 0x25292d, roughness: 0.52, metalness: 0.74 }),
    reflectorWhite: new THREE.MeshStandardMaterial({ color: 0xdff8ff, emissive: 0xb8efff, emissiveIntensity: 2.8, roughness: 0.28 }),
    reflectorAmber: new THREE.MeshStandardMaterial({ color: 0xffb329, emissive: 0xff7a0d, emissiveIntensity: 3.1, roughness: 0.28 }),
    fence: new THREE.MeshStandardMaterial({
      color: 0x9aabb2,
      map: fenceTexture(),
      alphaTest: 0.25,
      transparent: true,
      side: THREE.DoubleSide,
      roughness: 0.55,
      metalness: 0.72,
    }),
    treeTrunk: new THREE.MeshStandardMaterial({ color: 0x3b2b24, roughness: 1 }),
    foliage: new THREE.MeshStandardMaterial({ color: 0x18372b, roughness: 0.92 }),
    graffiti: new THREE.MeshBasicMaterial({ map: graffitiTexture(), transparent: true, toneMapped: false, side: THREE.DoubleSide }),
    warning: new THREE.MeshStandardMaterial({ color: 0xf0b51e, emissive: 0x5c3000, emissiveIntensity: 0.8, roughness: 0.54 }),
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
