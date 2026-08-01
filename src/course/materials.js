/**
 * Texture and material library for the street course.
 *
 * Every texture is painted into a canvas at load time - no image files - so the
 * course ships as pure JavaScript and still reads as a lived-in city: patched
 * tarmac, grubby concrete, lit office windows, rusted containers, neon.
 *
 * The set is deliberately small. Static scenery is merged per material (see
 * geom.js/mergeStatic), so the number of materials here is very close to the
 * number of draw calls the headset ends up issuing for the world.
 *
 * All of it degrades gracefully without a DOM: in Node the canvas helpers
 * return null, the maps are skipped and the plain colours remain, which is what
 * lets the layout be validated headlessly in CI.
 */
import * as THREE from 'three';
import { makeRng } from './util.js';

export const hasDOM = typeof document !== 'undefined';

/* -------------------------------------------------------------------------- */
/* Canvas plumbing                                                             */
/* -------------------------------------------------------------------------- */

function canvas(w, h = w) {
  if (!hasDOM) return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Wrap a painted canvas as a texture.
 * @param {HTMLCanvasElement|null} c
 */
function toTexture(c, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  if (!c) return null;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  return tex;
}

/** Sprinkle grain over the whole canvas - the base of every grubby surface. */
function grain(g, w, h, count, palette, alpha = [0.04, 0.22], size = [1, 3]) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = palette[(Math.random() * palette.length) | 0];
    g.globalAlpha = alpha[0] + Math.random() * (alpha[1] - alpha[0]);
    const s = size[0] + Math.random() * (size[1] - size[0]);
    g.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
  g.globalAlpha = 1;
}

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * City tarmac: coarse aggregate, tar-snake repairs, oil stains and a couple of
 * lighter patches where the council has been digging.
 */
function tarmacCanvas(size = 512, { base = '#2a2c31', patches = true } = {}) {
  const c = canvas(size);
  if (!c) return null;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);

  grain(g, size, size, size * 46, ['#0e0f12', '#43464d', '#5b5f68', '#1a1c20'], [0.05, 0.3], [1, 3.2]);

  if (patches) {
    // Resurfaced squares, slightly different tone and smoother.
    for (let i = 0; i < 4; i++) {
      const w = size * (0.12 + Math.random() * 0.3);
      const h = size * (0.1 + Math.random() * 0.25);
      const x = Math.random() * size;
      const y = Math.random() * size;
      g.globalAlpha = 0.28;
      g.fillStyle = Math.random() > 0.5 ? '#33363c' : '#212328';
      g.fillRect(x, y, w, h);
      g.globalAlpha = 1;
    }
    // Tar snakes: wandering black seams.
    g.strokeStyle = '#141519';
    g.lineWidth = size / 128;
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      let x = Math.random() * size;
      let y = Math.random() * size;
      g.moveTo(x, y);
      for (let k = 0; k < 8; k++) {
        x += (Math.random() - 0.5) * size * 0.3;
        y += (Math.random() - 0.5) * size * 0.3;
        g.lineTo(x, y);
      }
      g.globalAlpha = 0.5 + Math.random() * 0.4;
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  // Oil and rubber blotches.
  for (let i = 0; i < 10; i++) {
    const r = size * (0.02 + Math.random() * 0.08);
    const x = Math.random() * size;
    const y = Math.random() * size;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(10,10,12,0.55)');
    grd.addColorStop(1, 'rgba(10,10,12,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return c;
}

/** Poured concrete: pale, blotchy, with form lines and stains. */
function concreteCanvas(size = 512, tone = '#8d919a') {
  const c = canvas(size);
  if (!c) return null;
  const g = c.getContext('2d');
  g.fillStyle = tone;
  g.fillRect(0, 0, size, size);
  grain(g, size, size, size * 22, ['#6d717a', '#a4a8b1', '#5b5f67'], [0.05, 0.25], [2, 7]);

  // Big soft blotches so it does not read as flat paint.
  for (let i = 0; i < 24; i++) {
    const r = size * (0.05 + Math.random() * 0.2);
    const x = Math.random() * size;
    const y = Math.random() * size;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = Math.random() > 0.5;
    grd.addColorStop(0, dark ? 'rgba(60,63,70,0.3)' : 'rgba(190,194,200,0.22)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Panel joints.
  g.strokeStyle = 'rgba(50,53,60,0.5)';
  g.lineWidth = Math.max(1, size / 256);
  g.beginPath();
  g.moveTo(0, size / 2); g.lineTo(size, size / 2);
  g.moveTo(size / 2, 0); g.lineTo(size / 2, size);
  g.stroke();
  // Water streaks down from the top edge.
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * size;
    g.globalAlpha = 0.05 + Math.random() * 0.12;
    g.fillStyle = '#4a4d55';
    g.fillRect(x, 0, 1 + Math.random() * 4, size * (0.2 + Math.random() * 0.6));
  }
  g.globalAlpha = 1;
  return c;
}

/** Pavement slabs with a kerb-side gutter line. */
function pavementCanvas(size = 512) {
  const c = canvas(size);
  if (!c) return null;
  const g = c.getContext('2d');
  g.fillStyle = '#6f727a';
  g.fillRect(0, 0, size, size);
  grain(g, size, size, size * 16, ['#5b5e66', '#828692', '#4c4f57'], [0.06, 0.24], [2, 6]);
  const cell = size / 4;
  g.strokeStyle = 'rgba(40,42,48,0.55)';
  g.lineWidth = Math.max(1.5, size / 200);
  for (let i = 0; i <= 4; i++) {
    g.beginPath();
    g.moveTo(i * cell, 0); g.lineTo(i * cell, size);
    g.moveTo(0, i * cell); g.lineTo(size, i * cell);
    g.stroke();
  }
  return c;
}

/** Red brick, for the older parts of town. */
function brickCanvas(size = 512, tone = ['#7a3a2e', '#8c483a', '#63302a']) {
  const c = canvas(size);
  if (!c) return null;
  const g = c.getContext('2d');
  g.fillStyle = '#4a4441';
  g.fillRect(0, 0, size, size);
  const rows = 16;
  const bh = size / rows;
  const bw = size / 8;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * bw * 0.5;
    for (let i = -1; i < 9; i++) {
      g.fillStyle = tone[(Math.random() * tone.length) | 0];
      g.globalAlpha = 0.75 + Math.random() * 0.25;
      g.fillRect(i * bw + offset + 1.5, r * bh + 1.5, bw - 3, bh - 3);
    }
  }
  g.globalAlpha = 1;
  grain(g, size, size, size * 10, ['#2e2724', '#a4685a'], [0.03, 0.14], [2, 5]);
  return c;
}

/**
 * Office tower façade: a grid of windows, most of them lit at dusk, with the
 * mullions between them. Repeats vertically once per floor.
 */
function facadeCanvas(size = 512, opts = {}) {
  const {
    frame = '#23262d',
    glass = '#0b1622',
    lit = ['#ffd9a0', '#ffe9c4', '#cfe4ff', '#ffca7a'],
    litChance = 0.42,
    cols = 8,
    rows = 8,
    seed = 7,
  } = opts;
  const c = canvas(size);
  if (!c) return null;
  const g = c.getContext('2d');
  const rng = makeRng(seed);
  g.fillStyle = frame;
  g.fillRect(0, 0, size, size);
  grain(g, size, size, size * 8, ['#15181d', '#333741'], [0.05, 0.2], [2, 6]);

  const cw = size / cols;
  const ch = size / rows;
  const pad = Math.max(2, size / 90);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const on = rng.chance(litChance);
      const px = x * cw + pad;
      const py = y * ch + pad;
      const pw = cw - pad * 2;
      const ph = ch - pad * 2;
      if (on) {
        const colour = rng.pick(lit);
        const grd = g.createLinearGradient(px, py, px, py + ph);
        grd.addColorStop(0, colour);
        grd.addColorStop(1, '#8a6a44');
        g.fillStyle = grd;
        g.globalAlpha = 0.55 + rng() * 0.45;
      } else {
        g.fillStyle = glass;
        g.globalAlpha = 0.85;
      }
      g.fillRect(px, py, pw, ph);
      g.globalAlpha = 1;
      // Reflection sliver on the dark panes so glass still reads as glass.
      if (!on) {
        g.fillStyle = 'rgba(120,150,190,0.10)';
        g.fillRect(px, py, pw, ph * 0.35);
      }
    }
  }
  return c;
}

/** Emissive twin of a façade: only the lit windows, so they glow at night. */
function facadeEmissiveCanvas(size = 512, opts = {}) {
  const { cols = 8, rows = 8, litChance = 0.42, seed = 7, lit = ['#ffd9a0', '#ffe9c4', '#cfe4ff'] } = opts;
  const c = canvas(size);
  if (!c) return null;
  const g = c.getContext('2d');
  const rng = makeRng(seed);
  g.fillStyle = '#000000';
  g.fillRect(0, 0, size, size);
  const cw = size / cols;
  const ch = size / rows;
  const pad = Math.max(2, size / 90);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!rng.chance(litChance)) continue;
      g.fillStyle = rng.pick(lit);
      g.globalAlpha = 0.4 + rng() * 0.6;
      g.fillRect(x * cw + pad, y * ch + pad, cw - pad * 2, ch - pad * 2);
    }
  }
  g.globalAlpha = 1;
  return c;
}

/** Corrugated steel: warehouse and container sides. */
function corrugatedCanvas(size = 256, tone = '#7b8288', rust = 0.25) {
  const c = canvas(size);
  if (!c) return null;
  const g = c.getContext('2d');
  g.fillStyle = tone;
  g.fillRect(0, 0, size, size);
  const period = size / 16;
  for (let x = 0; x < size; x += period) {
    const grd = g.createLinearGradient(x, 0, x + period, 0);
    grd.addColorStop(0, 'rgba(0,0,0,0.32)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.14)');
    grd.addColorStop(1, 'rgba(0,0,0,0.32)');
    g.fillStyle = grd;
    g.fillRect(x, 0, period, size);
  }
  // Rust creeping up from the bottom.
  for (let i = 0; i < size * rust; i++) {
    const x = Math.random() * size;
    const y = size - Math.abs(Math.random() - Math.random()) * size * 0.7;
    g.fillStyle = Math.random() > 0.5 ? '#7a4526' : '#5a3220';
    g.globalAlpha = 0.05 + Math.random() * 0.35;
    g.fillRect(x, y, 2 + Math.random() * 8, 2 + Math.random() * 14);
  }
  g.globalAlpha = 1;
  return c;
}

/** Chain-link: transparent, used as an alpha map on a plane. */
function chainlinkCanvas(size = 128) {
  const c = canvas(size);
  if (!c) return null;
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  g.strokeStyle = '#ffffff';
  g.lineWidth = size / 42;
  const step = size / 6;
  for (let i = -6; i < 12; i++) {
    g.beginPath();
    g.moveTo(i * step, 0);
    g.lineTo(i * step + size, size);
    g.stroke();
    g.beginPath();
    g.moveTo(i * step, size);
    g.lineTo(i * step + size, 0);
    g.stroke();
  }
  return c;
}

/** Soft radial blob - light pools on the road, lamp haloes, sun flare. */
function glowCanvas(size = 256, colour = '255,210,150') {
  const c = canvas(size);
  if (!c) return null;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, `rgba(${colour},0.95)`);
  grd.addColorStop(0.35, `rgba(${colour},0.35)`);
  grd.addColorStop(0.7, `rgba(${colour},0.08)`);
  grd.addColorStop(1, `rgba(${colour},0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
}

/** Water: dark, with a hint of ripple banding. */
function waterCanvas(size = 256) {
  const c = canvas(size);
  if (!c) return null;
  const g = c.getContext('2d');
  g.fillStyle = '#0b1420';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i++) {
    g.strokeStyle = `rgba(120,160,200,${0.02 + Math.random() * 0.06})`;
    g.lineWidth = 1 + Math.random() * 2;
    const y = Math.random() * size;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= size; x += 16) g.lineTo(x, y + Math.sin(x * 0.08 + i) * 2);
    g.stroke();
  }
  return c;
}

/** Ground cover: scrubby dirt and grass for the verges. */
function groundCanvas(size = 512, a = '#232c1f', b = '#2f3a26', c3 = '#3a3327') {
  const c = canvas(size);
  if (!c) return null;
  const g = c.getContext('2d');
  g.fillStyle = a;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 200; i++) {
    const r = size * (0.02 + Math.random() * 0.14);
    const x = Math.random() * size;
    const y = Math.random() * size;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, Math.random() > 0.5 ? b : c3);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.5;
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.globalAlpha = 1;
  grain(g, size, size, size * 20, ['#1a2016', '#46503a', '#4a4232'], [0.05, 0.3], [1, 4]);
  return c;
}

/** Kerb stripes, red and white, running along the strip. */
function kerbCanvas(size = 128) {
  const c = canvas(size, size);
  if (!c) return null;
  const g = c.getContext('2d');
  g.fillStyle = '#e8ecf2';
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#c8352a';
  g.fillRect(0, 0, size, size / 2);
  grain(g, size, size, size * 6, ['#000000', '#ffffff'], [0.03, 0.12], [2, 6]);
  return c;
}

/**
 * Text painted onto a transparent canvas - road signs, shop fronts, banners.
 * @param {string} text
 */
export function textCanvas(text, opts = {}) {
  const {
    width = 512,
    height = 256,
    size = 120,
    colour = '#ffffff',
    bg = null,
    font = '800',
    family = 'ui-sans-serif, system-ui, sans-serif',
    letterSpacing = '0px',
    lines = null,
    border = null,
    glow = null,
  } = opts;
  const c = canvas(width, height);
  if (!c) return null;
  const g = c.getContext('2d');
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, width, height);
  }
  if (border) {
    g.strokeStyle = border;
    g.lineWidth = Math.max(3, height / 28);
    g.strokeRect(g.lineWidth, g.lineWidth, width - g.lineWidth * 2, height - g.lineWidth * 2);
  }
  g.font = `${font} ${size}px ${family}`;
  if ('letterSpacing' in g) g.letterSpacing = letterSpacing;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (glow) {
    g.shadowColor = glow;
    g.shadowBlur = size * 0.5;
  }
  g.fillStyle = colour;
  const rows = lines ?? [text];
  const step = size * 1.12;
  const top = height / 2 - ((rows.length - 1) * step) / 2;
  rows.forEach((row, i) => g.fillText(row, width / 2, top + i * step));
  return c;
}

/** A texture from painted text, ready for a sign face. */
export function textTexture(text, opts = {}) {
  const c = textCanvas(text, opts);
  if (!c) return null;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/* -------------------------------------------------------------------------- */
/* The library                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Build every material the course uses.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.procedural] paint canvas textures (off in Node)
 * @returns {Record<string, THREE.Material> & {dispose():void}}
 */
export function createCourseMaterials(opts = {}) {
  const procedural = opts.procedural ?? hasDOM;
  const tex = (make, params) => (procedural ? toTexture(make(), params) : null);
  const M = {};
  const owned = [];

  const std = (name, params, maps = {}) => {
    const m = new THREE.MeshStandardMaterial({ name, ...params });
    for (const [slot, texture] of Object.entries(maps)) if (texture) m[slot] = texture;
    owned.push(m);
    M[name] = m;
    return m;
  };

  /* -- driving surfaces --------------------------------------------------- */

  const road = tex(() => tarmacCanvas(512), { repeat: [1, 1] });
  std('road', { color: 0x3b3e44, roughness: 0.93, metalness: 0.02 }, { map: road });

  // The racing groove: same tarmac, darker and glossier from laid rubber.
  const groove = tex(() => tarmacCanvas(512, { base: '#1e2024', patches: false }), { repeat: [1, 1] });
  std('groove', {
    color: 0x2a2c31,
    roughness: 0.55,
    metalness: 0.08,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }, { map: groove });

  std('pavement', { color: 0x8a8e97, roughness: 0.95 },
    { map: tex(() => pavementCanvas(512), { repeat: [1, 1] }) });

  std('verge', { color: 0x3d4046, roughness: 1 },
    { map: tex(() => groundCanvas(512), { repeat: [1, 1] }) });

  std('ground', { color: 0x272c26, roughness: 1 },
    { map: tex(() => groundCanvas(512, '#1d241a', '#2a3222', '#332e24'), { repeat: [140, 140] }) });

  std('kerb', { color: 0xffffff, roughness: 0.72 },
    { map: tex(() => kerbCanvas(128), { repeat: [1, 1] }) });

  /* -- paint -------------------------------------------------------------- */

  std('lineWhite', {
    color: 0xf0f3f8,
    roughness: 0.62,
    emissive: 0x2a2e36,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  std('lineYellow', {
    color: 0xf2b32c,
    roughness: 0.62,
    emissive: 0x241a05,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  std('lineRed', {
    color: 0xb8352a,
    roughness: 0.7,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });

  /* -- structure ---------------------------------------------------------- */

  const concrete = tex(() => concreteCanvas(512), { repeat: [1, 1] });
  std('concrete', { color: 0x9aa0a8, roughness: 0.94 }, { map: concrete });
  std('concreteDark', { color: 0x585d66, roughness: 0.95 },
    { map: tex(() => concreteCanvas(512, '#5f636c'), { repeat: [1, 1] }) });
  std('asphaltWall', { color: 0x33373d, roughness: 0.9 });

  std('steel', { color: 0x9aa1ab, roughness: 0.42, metalness: 0.85 });
  std('steelDark', { color: 0x2a2e35, roughness: 0.55, metalness: 0.7 });
  std('paintedSteel', { color: 0xc9ccd2, roughness: 0.5, metalness: 0.35 });
  std('rail', { color: 0xb6bcc4, roughness: 0.38, metalness: 0.8 });
  std('rust', { color: 0x8a5230, roughness: 0.85, metalness: 0.25 });
  std('plastic', { color: 0x2c3038, roughness: 0.75 });

  std('brick', { color: 0x8a4a3a, roughness: 0.95 },
    { map: tex(() => brickCanvas(512), { repeat: [1, 1] }) });
  std('brickPale', { color: 0x9a9086, roughness: 0.95 },
    { map: tex(() => brickCanvas(512, ['#8a8378', '#98918a', '#736c64']), { repeat: [1, 1] }) });

  std('corrugated', { color: 0x8f959c, roughness: 0.6, metalness: 0.45 },
    { map: tex(() => corrugatedCanvas(256), { repeat: [1, 1] }) });
  std('corrugatedRed', { color: 0xa8564a, roughness: 0.62, metalness: 0.4 },
    { map: tex(() => corrugatedCanvas(256, '#9c5348', 0.4), { repeat: [1, 1] }) });

  // Shipping containers: one material per colour, merged per stack.
  for (const [name, colour] of [
    ['containerRed', 0x8f3a2c],
    ['containerBlue', 0x2a4a6e],
    ['containerGreen', 0x2f5a45],
    ['containerOchre', 0x9a7433],
  ]) {
    std(name, { color: colour, roughness: 0.72, metalness: 0.3 },
      { map: tex(() => corrugatedCanvas(256, '#ffffff', 0.45), { repeat: [1, 1] }) });
  }

  std('glass', {
    color: 0x0e1a26,
    roughness: 0.12,
    metalness: 0.55,
    transparent: true,
    opacity: 0.72,
  });

  /* -- façades ------------------------------------------------------------ */
  // Three tower styles plus two low-rise ones. The emissive map is what makes a
  // window look switched on rather than merely pale.

  const facade = (name, colour, opts2) => {
    const m = std(name, { color: colour, roughness: 0.72, metalness: 0.14, emissive: 0xffffff, emissiveIntensity: 0.9 }, {
      map: tex(() => facadeCanvas(512, opts2), { repeat: [1, 1] }),
      emissiveMap: tex(() => facadeEmissiveCanvas(512, opts2), { repeat: [1, 1], srgb: true }),
    });
    if (!m.emissiveMap) m.emissive.set(0x000000);
    return m;
  };
  facade('towerGlass', 0x39424f, { seed: 11, cols: 10, rows: 10, litChance: 0.4, frame: '#2b323c', glass: '#101e2c' });
  facade('towerDark', 0x2b3038, { seed: 23, cols: 8, rows: 12, litChance: 0.3, frame: '#20242b', glass: '#0a1119' });
  facade('towerPale', 0x6c7180, { seed: 37, cols: 9, rows: 9, litChance: 0.5, frame: '#5a6070', glass: '#182432' });
  facade('blockWindows', 0x585d63, { seed: 53, cols: 6, rows: 4, litChance: 0.45, frame: '#4a4f57', glass: '#141c26' });
  facade('shopfront', 0x3d4149, {
    seed: 71, cols: 4, rows: 2, litChance: 0.8, frame: '#33373f', glass: '#1a2230',
    lit: ['#ffe6b0', '#ffd28a', '#b9ecff'],
  });

  /* -- light and glow ----------------------------------------------------- */

  const glowTex = procedural ? toTexture(glowCanvas(256), { repeat: [1, 1] }) : null;
  M.glowTexture = glowTex;
  std('lampGlow', {
    color: 0xffffff,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
  }, { map: glowTex });
  // Same glow, laid flat on the road under a lamp.
  M.lightPool = M.lampGlow.clone();
  M.lightPool.name = 'lightPool';
  M.lightPool.opacity = 0.33;
  owned.push(M.lightPool);

  std('lampLens', { color: 0xfff0d0, emissive: 0xffdca8, emissiveIntensity: 3.4, roughness: 0.3 });
  std('lampLensCool', { color: 0xdfe9ff, emissive: 0xbcd4ff, emissiveIntensity: 3.0, roughness: 0.3 });
  std('tunnelLight', { color: 0xfff3dd, emissive: 0xffd9a0, emissiveIntensity: 2.6, roughness: 0.4 });

  const neon = (name, colour) =>
    std(name, { color: 0x0a0a0c, emissive: colour, emissiveIntensity: 2.6, roughness: 0.45, toneMapped: true });
  neon('neonPink', 0xff2f8e);
  neon('neonCyan', 0x2ff0ff);
  neon('neonAmber', 0xffa02a);
  neon('neonGreen', 0x39ff88);
  neon('neonViolet', 0x9b5cff);
  M.neonSet = [M.neonPink, M.neonCyan, M.neonAmber, M.neonGreen, M.neonViolet];

  /* -- nature and water --------------------------------------------------- */

  std('bark', { color: 0x3b2f26, roughness: 0.95 });
  std('foliage', { color: 0x24401f, roughness: 0.92 });
  std('foliageDark', { color: 0x1a3018, roughness: 0.95 });
  std('hedge', { color: 0x1f3320, roughness: 1 });

  std('water', {
    color: 0x16283a,
    roughness: 0.08,
    metalness: 0.65,
    transparent: true,
    opacity: 0.94,
  }, { map: tex(() => waterCanvas(256), { repeat: [40, 40] }) });

  /* -- fencing ------------------------------------------------------------ */

  std('chainlink', {
    color: 0xb9bfc7,
    roughness: 0.6,
    metalness: 0.6,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  }, { alphaMap: tex(() => chainlinkCanvas(128), { repeat: [1, 1], srgb: false }) });
  if (!M.chainlink.alphaMap) M.chainlink.opacity = 0.35;

  std('catchFence', {
    color: 0x8f959d,
    roughness: 0.65,
    metalness: 0.5,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  }, { alphaMap: tex(() => chainlinkCanvas(128), { repeat: [1, 1], srgb: false }) });
  if (!M.catchFence.alphaMap) M.catchFence.opacity = 0.3;

  /* -- signage ------------------------------------------------------------ */

  std('signBack', { color: 0x30343b, roughness: 0.8, metalness: 0.3 });
  std('signGreen', { color: 0x1c5c3a, roughness: 0.7 });
  std('signBlue', { color: 0x1b3f74, roughness: 0.7 });
  std('signYellow', { color: 0xe0a81c, roughness: 0.7 });
  std('signRed', { color: 0xa8241c, roughness: 0.7 });
  std('cone', { color: 0xff5a1e, roughness: 0.85 });
  std('coneBand', { color: 0xf2f4f8, roughness: 0.8 });
  std('barrierRed', { color: 0xc2352a, roughness: 0.85 });
  std('barrierWhite', { color: 0xe6e9ee, roughness: 0.85 });
  std('tyreWall', { color: 0x141519, roughness: 0.98 });

  M.dispose = () => {
    for (const m of owned) {
      for (const slot of ['map', 'emissiveMap', 'alphaMap', 'roughnessMap']) m[slot]?.dispose?.();
      m.dispose();
    }
    glowTex?.dispose?.();
  };

  return M;
}
