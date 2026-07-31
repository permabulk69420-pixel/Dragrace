/**
 * Every surface in the course is painted in a canvas at load time.
 *
 * Nothing is fetched: the whole city ships as code, which keeps the deploy a
 * handful of kilobytes and means a headset never stalls on a texture download.
 * Tiles are authored at a known metre size (documented next to each factory) so
 * geometry can scale its UVs and keep a consistent texel density everywhere.
 *
 * Without a DOM - the headless course test, the GLB exporter - every factory
 * returns null and the materials fall back to flat colours.
 */
import * as THREE from 'three';
import { rng, seedFrom } from './rng.js';

export const hasDOM = typeof document !== 'undefined' && typeof document.createElement === 'function';

const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Build (and cache) a canvas texture.
 *
 * @param {string} key   cache key, unique per visual result
 * @param {number} w     canvas width in pixels
 * @param {number} h     canvas height in pixels
 * @param {(g:CanvasRenderingContext2D, w:number, h:number)=>void} draw
 * @param {object} [opts]
 */
export function texture(key, w, h, draw, opts = {}) {
  if (!hasDOM) return null;
  if (cache.has(key)) return cache.get(key);
  const {
    repeat = null,
    srgb = true,
    anisotropy = 8,
    wrap = THREE.RepeatWrapping,
    flipY = true,
  } = opts;

  const c = canvas(w, h);
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = wrap;
  tex.anisotropy = anisotropy;
  tex.flipY = flipY;
  if (repeat) tex.repeat.set(repeat[0], repeat[1]);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

/** Release every cached texture. Only used by tests and hot reloads. */
export function disposeTextures() {
  for (const tex of cache.values()) tex.dispose();
  cache.clear();
}

/* -------------------------------------------------------------------------- */
/* Painting helpers                                                            */
/* -------------------------------------------------------------------------- */

/** Speckle a rectangle with per-pixel grain. */
function grain(g, x, y, w, h, amount, size = 2, seed = 7) {
  const r = rng(seed);
  const count = Math.round((w * h) / (size * size * 6));
  for (let i = 0; i < count; i++) {
    const v = r();
    const shade = v > 0.55 ? 255 : 0;
    g.fillStyle = `rgba(${shade},${shade},${shade},${amount * (0.3 + r() * 0.7)})`;
    g.fillRect(x + r() * w, y + r() * h, size, size);
  }
}

/** Rough hand-drawn line, used for cracks and weld seams. */
function crack(g, x, y, len, angle, r, width = 1.5) {
  g.lineWidth = width;
  g.beginPath();
  g.moveTo(x, y);
  let cx = x;
  let cy = y;
  let a = angle;
  const steps = Math.max(3, Math.round(len / 14));
  for (let i = 0; i < steps; i++) {
    a += (r() - 0.5) * 0.9;
    cx += Math.cos(a) * (len / steps);
    cy += Math.sin(a) * (len / steps);
    g.lineTo(cx, cy);
  }
  g.stroke();
}

/* -------------------------------------------------------------------------- */
/* Road                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The racing surface: one tile spans the full road width across U and
 * ROAD_TILE_LENGTH metres of road along V, with the lane markings painted in.
 * Baking the lines into the surface keeps the whole ribbon at one draw call.
 */
export const ROAD_TILE_LENGTH = 18;

/**
 * @param {object} [o]
 * @param {boolean} [o.centreLine=true] double yellow down the middle
 * @param {boolean} [o.laneDashes=true] dashed white lane dividers
 * @param {boolean} [o.edgeLines=true]
 * @param {string}  [o.base]            base asphalt colour
 */
export function roadTexture(o = {}) {
  const { centreLine = true, laneDashes = true, edgeLines = true, base = '#2f3136', key = 'road' } = o;
  return texture(`road:${key}`, 512, 1024, (g, w, h) => {
    const r = rng(seedFrom(`road${key}`));
    const mPx = h / ROAD_TILE_LENGTH;         // pixels per metre along the road

    g.fillStyle = base;
    g.fillRect(0, 0, w, h);

    // Blotchy patches: old repairs, sealed cracks, bleached centre.
    for (let i = 0; i < 26; i++) {
      const pw = r.range(40, 220);
      const ph = r.range(60, 400);
      g.fillStyle = `rgba(${r.int(24, 62)},${r.int(24, 62)},${r.int(28, 70)},${r.range(0.25, 0.6)})`;
      g.beginPath();
      g.roundRect(r.range(-40, w), r.range(-60, h), pw, ph, 18);
      g.fill();
    }

    // Two darker rubbered-in grooves where the racing line lives.
    for (const cx of [w * 0.3, w * 0.7]) {
      const grd = g.createLinearGradient(cx - 70, 0, cx + 70, 0);
      grd.addColorStop(0, 'rgba(10,10,13,0)');
      grd.addColorStop(0.5, 'rgba(10,10,13,0.34)');
      grd.addColorStop(1, 'rgba(10,10,13,0)');
      g.fillStyle = grd;
      g.fillRect(cx - 70, 0, 140, h);
    }

    grain(g, 0, 0, w, h, 0.16, 2, 91);

    // Tar-sealed cracks.
    g.strokeStyle = 'rgba(12,12,15,0.7)';
    for (let i = 0; i < 14; i++) crack(g, r() * w, r() * h, r.range(60, 260), r() * Math.PI * 2, r, r.range(1, 3.5));

    const paint = (fill, x, y, pw, ph) => {
      g.fillStyle = fill;
      g.fillRect(x, y, pw, ph);
      // Worn edges keep the paint from looking like a decal.
      g.fillStyle = 'rgba(0,0,0,0.18)';
      for (let i = 0; i < 22; i++) {
        if (!r.chance(0.6)) continue;
        g.fillRect(x + r.range(-2, pw), y + r() * ph, r.range(1, 4), r.range(2, 9));
      }
    };

    const WHITE = '#e9ecef';
    const YELLOW = '#e8b23a';

    if (edgeLines) {
      paint(WHITE, w * 0.035, 0, 7, h);
      paint(WHITE, w * 0.965 - 7, 0, 7, h);
    }

    if (laneDashes) {
      // 3 m of paint, 6 m of gap - two cycles per tile.
      const dash = 3 * mPx;
      const cycle = 9 * mPx;
      for (const u of [0.27, 0.73]) {
        for (let y = 0; y < h; y += cycle) paint(WHITE, w * u - 3, y, 6, dash);
      }
    }

    if (centreLine) {
      paint(YELLOW, w * 0.5 - 9, 0, 6, h);
      paint(YELLOW, w * 0.5 + 3, 0, 6, h);
    }
  }, { anisotropy: 16 });
}

/** Plain hot-mix with no markings: pit lane, service roads, car parks. */
export function plainAsphaltTexture(key = 'plain', base = '#303237') {
  return texture(`asphalt:${key}`, 512, 512, (g, w, h) => {
    const r = rng(seedFrom(`asphalt${key}`));
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) {
      g.fillStyle = `rgba(${r.int(20, 64)},${r.int(20, 64)},${r.int(24, 70)},${r.range(0.2, 0.5)})`;
      g.beginPath();
      g.roundRect(r() * w, r() * h, r.range(30, 180), r.range(30, 180), 14);
      g.fill();
    }
    grain(g, 0, 0, w, h, 0.2, 2, 12);
    g.strokeStyle = 'rgba(10,10,12,0.65)';
    for (let i = 0; i < 10; i++) crack(g, r() * w, r() * h, r.range(50, 200), r() * 6.28, r, r.range(1, 3));
  });
}

/** Red/white corner kerb. One tile is 2 m along the road. */
export function kerbTexture() {
  return texture('kerb', 64, 128, (g, w, h) => {
    g.fillStyle = '#d8dade';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#c8332a';
    g.fillRect(0, 0, w, h / 2);
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(0, h / 2 - 2, w, 4);
    grain(g, 0, 0, w, h, 0.1, 2, 5);
  });
}

/** Slab paving for pavements and plazas. One tile is 4 m. */
export function pavingTexture() {
  return texture('paving', 512, 512, (g, w, h) => {
    const r = rng(seedFrom('paving'));
    g.fillStyle = '#6e7076';
    g.fillRect(0, 0, w, h);
    const n = 8;
    const s = w / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = r.int(-14, 14);
        g.fillStyle = `rgb(${106 + v},${108 + v},${116 + v})`;
        g.fillRect(x * s + 1.5, y * s + 1.5, s - 3, s - 3);
      }
    }
    grain(g, 0, 0, w, h, 0.14, 2, 33);
    g.strokeStyle = 'rgba(30,30,34,0.5)';
    for (let i = 0; i < 8; i++) crack(g, r() * w, r() * h, r.range(30, 120), r() * 6.28, r, 1.2);
  });
}

/** Poured concrete: barriers, quay walls, bridge piers. One tile is 4 m. */
export function concreteTexture(key = 'wall', base = '#8b8f96') {
  return texture(`concrete:${key}`, 512, 512, (g, w, h) => {
    const r = rng(seedFrom(`concrete${key}`));
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    // Form-work panel joints.
    g.strokeStyle = 'rgba(0,0,0,0.16)';
    g.lineWidth = 3;
    for (let i = 1; i < 4; i++) {
      g.beginPath();
      g.moveTo(0, (i * h) / 4);
      g.lineTo(w, (i * h) / 4);
      g.stroke();
    }
    // Tie-rod holes.
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        g.fillStyle = 'rgba(0,0,0,0.2)';
        g.beginPath();
        g.arc((x + 0.5) * (w / 4), (y + 0.5) * (h / 4), 3.5, 0, 6.3);
        g.fill();
      }
    }
    // Water staining down the face.
    for (let i = 0; i < 22; i++) {
      const x = r() * w;
      const grd = g.createLinearGradient(x, 0, x, h);
      grd.addColorStop(0, 'rgba(40,42,46,0.28)');
      grd.addColorStop(1, 'rgba(40,42,46,0)');
      g.fillStyle = grd;
      g.fillRect(x, r() * h * 0.4, r.range(6, 40), h);
    }
    grain(g, 0, 0, w, h, 0.13, 2, 77);
    g.strokeStyle = 'rgba(50,50,56,0.55)';
    for (let i = 0; i < 9; i++) crack(g, r() * w, r() * h, r.range(40, 170), r() * 6.28, r, 1.4);
  });
}

/** Corrugated sheet metal for warehouses and hoardings. One tile is 4 m. */
export function corrugatedTexture(colour = '#5a6470', key = 'default') {
  return texture(`corrugated:${key}`, 256, 256, (g, w, h) => {
    const r = rng(seedFrom(`corr${key}`));
    g.fillStyle = colour;
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      const grd = g.createLinearGradient(x, 0, x + 16, 0);
      grd.addColorStop(0, 'rgba(0,0,0,0.30)');
      grd.addColorStop(0.45, 'rgba(255,255,255,0.14)');
      grd.addColorStop(1, 'rgba(0,0,0,0.30)');
      g.fillStyle = grd;
      g.fillRect(x, 0, 16, h);
    }
    // Rust runs along the bottom seam.
    for (let i = 0; i < 30; i++) {
      g.fillStyle = `rgba(${r.int(90, 140)},${r.int(50, 80)},${r.int(28, 48)},${r.range(0.06, 0.3)})`;
      g.fillRect(r() * w, h - r.range(0, 90), r.range(2, 12), r.range(6, 70));
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, h - 6, w, 6);
    grain(g, 0, 0, w, h, 0.08, 2, 41);
  });
}

/** Old brick for the low-rise blocks. One tile is 3 m. */
export function brickTexture(key = 'red', base = '#6a3a30', mortar = '#7d7468') {
  return texture(`brick:${key}`, 256, 256, (g, w, h) => {
    const r = rng(seedFrom(`brick${key}`));
    g.fillStyle = mortar;
    g.fillRect(0, 0, w, h);
    const rows = 16;
    const bh = h / rows;
    for (let y = 0; y < rows; y++) {
      const offset = (y % 2) * 16;
      for (let x = -32; x < w; x += 32) {
        const v = r.int(-22, 22);
        g.fillStyle = `rgb(${106 + v},${58 + v},${48 + v})`;
        g.fillRect(x + offset + 1, y * bh + 1, 30, bh - 2);
      }
    }
    g.fillStyle = base;
    g.globalAlpha = 0.18;
    g.fillRect(0, 0, w, h);
    g.globalAlpha = 1;
    grain(g, 0, 0, w, h, 0.12, 2, 63);
  });
}

/* -------------------------------------------------------------------------- */
/* Buildings                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A facade tile: FACADE_TILE metres wide by FACADE_FLOOR metres tall per
 * repeat, so a wall just scales its UVs by (width / 4, height / 3.6).
 *
 * Returns { map, emissive } - the second canvas has only the lit windows on it,
 * which is what makes the city glow after dark without a single real light.
 */
export const FACADE_TILE = 4;
export const FACADE_FLOOR = 3.6;

export function facadeTextures(variant = 0) {
  const key = `facade:${variant}`;
  const styles = [
    // wall,      frame,     glassDark, glassLit,  litChance, cols, style
    ['#3d4149', '#2a2d33', '#151a24', '#ffd9a0', 0.34, 4, 'grid'],
    ['#4a4239', '#332f2a', '#131820', '#cfe4ff', 0.28, 3, 'grid'],
    ['#2f3640', '#232830', '#0f141c', '#ffc46b', 0.42, 5, 'strip'],
    ['#585349', '#3b382f', '#141922', '#e8f2ff', 0.22, 3, 'grid'],
    ['#33383f', '#252a30', '#101620', '#9fe8ff', 0.38, 6, 'strip'],
    ['#4c3f3a', '#332a26', '#121820', '#ffb46b', 0.30, 4, 'grid'],
  ];
  const [wall, frame, dark, lit, litChance, cols, style] = styles[variant % styles.length];

  const paint = (emissiveOnly) => (g, w, h) => {
    const r = rng(seedFrom(`facade${variant}`));
    if (emissiveOnly) {
      g.fillStyle = '#000000';
      g.fillRect(0, 0, w, h);
    } else {
      g.fillStyle = wall;
      g.fillRect(0, 0, w, h);
      grain(g, 0, 0, w, h, 0.12, 2, 19);
      // Floor slab bands.
      g.fillStyle = 'rgba(0,0,0,0.26)';
      g.fillRect(0, h - 8, w, 8);
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(0, 0, w, 4);
    }

    const margin = w * 0.09;
    const gap = w * 0.035;
    const cw = (w - margin * 2 - gap * (cols - 1)) / cols;
    const top = h * 0.2;
    const ch = style === 'strip' ? h * 0.42 : h * 0.54;

    for (let i = 0; i < cols; i++) {
      const x = margin + i * (cw + gap);
      const on = r.chance(litChance);
      if (emissiveOnly) {
        if (!on) continue;
        // Slight per-window variation so the block does not read as a stencil.
        g.globalAlpha = r.range(0.55, 1);
        g.fillStyle = lit;
        g.fillRect(x, top, cw, ch);
        g.globalAlpha = 1;
        // A blind pulled halfway down kills the flatness.
        if (r.chance(0.3)) {
          g.fillStyle = '#000000';
          g.fillRect(x, top, cw, ch * r.range(0.2, 0.5));
        }
        continue;
      }
      g.fillStyle = frame;
      g.fillRect(x - 3, top - 3, cw + 6, ch + 6);
      g.fillStyle = on ? lit : dark;
      g.fillRect(x, top, cw, ch);
      if (!on) {
        // Sky reflection in the dead glass.
        const grd = g.createLinearGradient(x, top, x, top + ch);
        grd.addColorStop(0, 'rgba(120,150,200,0.30)');
        grd.addColorStop(0.6, 'rgba(40,55,80,0.05)');
        grd.addColorStop(1, 'rgba(10,14,22,0.2)');
        g.fillStyle = grd;
        g.fillRect(x, top, cw, ch);
      }
      // Mullion.
      g.fillStyle = frame;
      g.fillRect(x + cw / 2 - 1, top, 2, ch);
    }
  };

  return {
    map: texture(key, 256, 256, paint(false)),
    emissive: texture(`${key}:e`, 256, 256, paint(true), { srgb: true }),
  };
}

/** Rooftop gravel and tar for the tops of the blocks. One tile is 6 m. */
export function roofTexture() {
  return texture('roof', 256, 256, (g, w, h) => {
    const r = rng(seedFrom('roof'));
    g.fillStyle = '#26282d';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const v = r.int(30, 90);
      g.fillStyle = `rgba(${v},${v},${v + 6},${r.range(0.2, 0.7)})`;
      g.fillRect(r() * w, r() * h, 3, 3);
    }
    g.strokeStyle = 'rgba(60,62,70,0.5)';
    g.lineWidth = 4;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(0, (i * h) / 4 + 12);
      g.lineTo(w, (i * h) / 4 + 12);
      g.stroke();
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Signs, neon and hoardings                                                   */
/* -------------------------------------------------------------------------- */

/** Emissive shop-front sign. Drawn light-on-black so it doubles as its own map. */
export function neonTexture(text, colour = '#ff2f6d', key = text) {
  return texture(`neon:${key}`, 512, 128, (g, w, h) => {
    g.fillStyle = '#050507';
    g.fillRect(0, 0, w, h);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 ${h * 0.5}px ui-sans-serif, system-ui, sans-serif`;
    g.shadowColor = colour;
    g.shadowBlur = 34;
    g.fillStyle = colour;
    g.fillText(text, w / 2, h / 2);
    g.shadowBlur = 18;
    g.fillStyle = '#ffffff';
    g.fillText(text, w / 2, h / 2);
    g.shadowBlur = 0;
    // Tube frame.
    g.strokeStyle = colour;
    g.lineWidth = 4;
    g.globalAlpha = 0.8;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.globalAlpha = 1;
  });
}

/** Big roadside hoarding. Abstract poster art, no real brands. */
export function billboardTexture(index = 0) {
  return texture(`billboard:${index}`, 512, 256, (g, w, h) => {
    const r = rng(seedFrom(`bill${index}`));
    const palettes = [
      ['#12203c', '#ff5a1f', '#ffd166'],
      ['#2a0f2e', '#ff2f6d', '#7bdff2'],
      ['#0d2b26', '#2bff9e', '#eaffd0'],
      ['#231428', '#a06bff', '#ffe3a0'],
      ['#301a12', '#ffb020', '#ffffff'],
    ];
    const [bg, a, b] = palettes[index % palettes.length];
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    // Big swooping shapes: reads as a poster from a moving car.
    for (let i = 0; i < 5; i++) {
      g.globalAlpha = r.range(0.25, 0.75);
      g.fillStyle = i % 2 ? a : b;
      g.beginPath();
      g.ellipse(r() * w, r() * h, r.range(60, 260), r.range(30, 120), r() * 3.14, 0, 6.3);
      g.fill();
    }
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, h * 0.62, w, h * 0.38);
    const words = ['NITRO', 'BOOST', 'REDLINE', 'APEX', 'TURBO', 'NIGHT SHIFT', 'FULL SEND', 'DOCK 9'];
    g.fillStyle = '#ffffff';
    g.font = `900 ${h * 0.26}px ui-sans-serif, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(r.pick(words), w / 2, h * 0.8);
    g.strokeStyle = a;
    g.lineWidth = 8;
    g.strokeRect(4, 4, w - 8, h - 8);
  });
}

/**
 * A flat road sign face on transparent background - direction boards, corner
 * warnings, distance markers.
 */
export function signTexture(text, { bg = '#0f5132', fg = '#ffffff', border = '#ffffff', shape = 'rect', key = text } = {}) {
  return texture(`sign:${key}`, 512, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    if (shape === 'diamond') {
      g.save();
      g.translate(w / 2, h / 2);
      g.rotate(Math.PI / 4);
      const s = h * 0.62;
      g.fillStyle = bg;
      g.fillRect(-s, -s, s * 2, s * 2);
      g.strokeStyle = border;
      g.lineWidth = 10;
      g.strokeRect(-s + 12, -s + 12, s * 2 - 24, s * 2 - 24);
      g.restore();
    } else {
      g.fillStyle = bg;
      g.beginPath();
      g.roundRect(8, 8, w - 16, h - 16, 18);
      g.fill();
      g.strokeStyle = border;
      g.lineWidth = 8;
      g.beginPath();
      g.roundRect(22, 22, w - 44, h - 44, 12);
      g.stroke();
    }
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const size = text.length > 8 ? h * 0.24 : h * 0.42;
    g.font = `800 ${size}px ui-sans-serif, system-ui, sans-serif`;
    const lines = text.split('\n');
    lines.forEach((ln, i) => g.fillText(ln, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.15));
  }, { wrap: THREE.ClampToEdgeWrapping });
}

/** Chequered start/finish band. One tile is 1 m across the road. */
export function checkerTexture() {
  return texture('checker', 128, 128, (g, w, h) => {
    const n = 4;
    const s = w / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        g.fillStyle = (x + y) % 2 ? '#101216' : '#eef1f5';
        g.fillRect(x * s, y * s, s, s);
      }
    }
    grain(g, 0, 0, w, h, 0.1, 2, 3);
  });
}

/* -------------------------------------------------------------------------- */
/* Ground cover, water, fencing                                                */
/* -------------------------------------------------------------------------- */

/** Scrubby ground beside the road. One tile is 8 m. */
export function groundTexture() {
  return texture('ground', 512, 512, (g, w, h) => {
    const r = rng(seedFrom('ground'));
    g.fillStyle = '#3c4034';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const v = r();
      g.fillStyle = v > 0.72
        ? `rgba(${r.int(70, 110)},${r.int(80, 120)},${r.int(52, 80)},0.6)`
        : `rgba(${r.int(40, 70)},${r.int(44, 74)},${r.int(34, 58)},0.6)`;
      g.fillRect(r() * w, r() * h, r.range(2, 7), r.range(2, 7));
    }
    // Bare dirt patches.
    for (let i = 0; i < 16; i++) {
      g.fillStyle = `rgba(${r.int(84, 110)},${r.int(70, 92)},${r.int(52, 70)},${r.range(0.2, 0.5)})`;
      g.beginPath();
      g.ellipse(r() * w, r() * h, r.range(20, 90), r.range(16, 70), r() * 3.14, 0, 6.3);
      g.fill();
    }
  });
}

/** Chain-link fence panel with an alpha channel. One tile is 3 m. */
export function chainlinkTexture() {
  return texture('chainlink', 128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(170,178,188,0.85)';
    g.lineWidth = 2.2;
    const s = 16;
    for (let i = -h; i < w + h; i += s) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + h, h);
      g.stroke();
      g.beginPath();
      g.moveTo(i, h);
      g.lineTo(i + h, 0);
      g.stroke();
    }
  });
}

/** Harbour water: dark, with a slow ripple pattern baked in. One tile is 24 m. */
export function waterTexture() {
  return texture('water', 512, 512, (g, w, h) => {
    const r = rng(seedFrom('water'));
    g.fillStyle = '#0b1622';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 520; i++) {
      const y = r() * h;
      g.strokeStyle = `rgba(${r.int(90, 190)},${r.int(130, 210)},${r.int(160, 240)},${r.range(0.03, 0.16)})`;
      g.lineWidth = r.range(1, 3);
      g.beginPath();
      g.moveTo(r() * w, y);
      g.bezierCurveTo(r() * w, y + r.jitter(9), r() * w, y + r.jitter(9), r() * w, y);
      g.stroke();
    }
  });
}

/** Shipping-container paint with door ribs. One tile covers a whole container end. */
export function containerTexture(colour = '#b4532f', key = 'a') {
  return texture(`container:${key}`, 256, 128, (g, w, h) => {
    const r = rng(seedFrom(`cont${key}`));
    g.fillStyle = colour;
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 12) {
      g.fillStyle = x % 24 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.18)';
      g.fillRect(x, 6, 12, h - 12);
    }
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(0, 0, w, 6);
    g.fillRect(0, h - 6, w, 6);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(${r.int(80, 130)},${r.int(48, 76)},${r.int(30, 50)},${r.range(0.05, 0.35)})`;
      g.fillRect(r() * w, r() * h, r.range(2, 10), r.range(2, 14));
    }
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.font = '700 22px ui-monospace, monospace';
    g.fillText(`${r.int(100, 999)} ${r.int(1000, 9999)}`, 16, h * 0.5);
  });
}

/** Tiled tunnel lining. One tile is 2 m. */
export function tunnelTexture() {
  return texture('tunnel', 256, 256, (g, w, h) => {
    const r = rng(seedFrom('tunnel'));
    g.fillStyle = '#9aa0a6';
    g.fillRect(0, 0, w, h);
    const n = 8;
    const s = w / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = r.int(-16, 10);
        g.fillStyle = `rgb(${160 + v},${166 + v},${172 + v})`;
        g.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
      }
    }
    // Grime creeping up from the road.
    const grd = g.createLinearGradient(0, h, 0, h * 0.3);
    grd.addColorStop(0, 'rgba(20,22,26,0.75)');
    grd.addColorStop(1, 'rgba(20,22,26,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    grain(g, 0, 0, w, h, 0.1, 2, 55);
  });
}

/** Rust-streaked steel for cranes, gantries and railings. One tile is 2 m. */
export function steelTexture(colour = '#7a828c', key = 'steel') {
  return texture(`steel:${key}`, 256, 256, (g, w, h) => {
    const r = rng(seedFrom(`steel${key}`));
    g.fillStyle = colour;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(${r.int(110, 160)},${r.int(60, 96)},${r.int(34, 56)},${r.range(0.05, 0.3)})`;
      g.beginPath();
      g.ellipse(r() * w, r() * h, r.range(4, 26), r.range(4, 20), 0, 0, 6.3);
      g.fill();
    }
    grain(g, 0, 0, w, h, 0.12, 2, 88);
  });
}

/** Soft round blob used as a light glow / lamp halo sprite. */
export function glowTexture(colour = '#ffd9a0') {
  return texture(`glow:${colour}`, 128, 128, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, colour);
    grd.addColorStop(0.25, `${colour}cc`);
    grd.addColorStop(0.6, `${colour}33`);
    grd.addColorStop(1, `${colour}00`);
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }, { wrap: THREE.ClampToEdgeWrapping });
}
