/**
 * Canvas-drawn instrument faces and the little dash timing screen.
 *
 * Everything here degrades to plain colours when there is no DOM (the headless
 * GLB export runs in Node), so the same car code builds in both places.
 */
import * as THREE from 'three';

export const hasDOM = typeof document !== 'undefined';

const SWEEP_START = 135;   // degrees, measured clockwise from +X in canvas space
const SWEEP = 270;

/** Needle rotation (radians about Z) for a normalised 0..1 reading. */
export function needleAngle(t) {
  return THREE.MathUtils.degToRad(135 - THREE.MathUtils.clamp(t, 0, 1) * SWEEP);
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

/**
 * Draw a round instrument face.
 * @param {object} o
 * @param {number} o.max         top of the scale
 * @param {number} [o.step]      spacing of the numbered major ticks
 * @param {number} [o.redline]   value where the red arc starts
 * @param {string} o.label       text under the centre
 * @param {string} [o.unit]
 * @param {number} [o.divisor=1] value shown = value / divisor
 */
export function gaugeTexture(o) {
  if (!hasDOM) return null;
  const size = 512;
  const c = canvas(size);
  const g = c.getContext('2d');
  const R = size / 2;
  const cx = R, cy = R;

  // Face.
  const grd = g.createRadialGradient(cx, cy * 0.75, 20, cx, cy, R);
  grd.addColorStop(0, '#23262d');
  grd.addColorStop(1, '#0b0c10');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(cx, cy, R - 2, 0, Math.PI * 2);
  g.fill();

  // Bezel.
  g.strokeStyle = '#5c626e';
  g.lineWidth = 12;
  g.beginPath();
  g.arc(cx, cy, R - 8, 0, Math.PI * 2);
  g.stroke();

  const at = (deg, r) => [cx + Math.cos((deg * Math.PI) / 180) * r, cy + Math.sin((deg * Math.PI) / 180) * r];

  // Red zone.
  if (o.redline != null) {
    const a0 = SWEEP_START + (o.redline / o.max) * SWEEP;
    g.strokeStyle = '#e02717';
    g.lineWidth = 22;
    g.beginPath();
    g.arc(cx, cy, R - 44, (a0 * Math.PI) / 180, ((SWEEP_START + SWEEP) * Math.PI) / 180);
    g.stroke();
  }

  const step = o.step ?? o.max / 8;
  const minors = 5;
  const majors = Math.round(o.max / step);
  for (let i = 0; i <= majors; i++) {
    const v = i * step;
    const deg = SWEEP_START + (v / o.max) * SWEEP;
    const hot = o.redline != null && v >= o.redline;
    g.strokeStyle = hot ? '#ff5a45' : '#e8edf5';
    g.lineWidth = 9;
    let [x1, y1] = at(deg, R - 34);
    let [x2, y2] = at(deg, R - 74);
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();

    g.fillStyle = hot ? '#ff6a55' : '#dfe6f0';
    g.font = `600 ${size * 0.085}px ui-sans-serif, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const [tx, ty] = at(deg, R - 108);
    g.fillText(String(Math.round(v / (o.divisor ?? 1))), tx, ty);

    if (i < majors) {
      for (let k = 1; k < minors; k++) {
        const d2 = SWEEP_START + ((v + (step * k) / minors) / o.max) * SWEEP;
        g.strokeStyle = '#7d8492';
        g.lineWidth = 4;
        let [a, b] = at(d2, R - 36);
        let [d, e] = at(d2, R - 58);
        g.beginPath(); g.moveTo(a, b); g.lineTo(d, e); g.stroke();
      }
    }
  }

  g.fillStyle = '#9aa4b4';
  g.font = `600 ${size * 0.058}px ui-sans-serif, system-ui, sans-serif`;
  g.fillText(o.label, cx, cy + R * 0.36);
  if (o.unit) {
    g.font = `500 ${size * 0.048}px ui-sans-serif, system-ui, sans-serif`;
    g.fillStyle = '#6e7686';
    g.fillText(o.unit, cx, cy + R * 0.52);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * The small dash screen: reaction time, splits, ET and trap speed.
 * Returns a texture plus a draw() to refresh it.
 */
export function createDashScreen() {
  if (!hasDOM) {
    return { texture: null, draw: () => {} };
  }
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  let last = '';
  const draw = (lines) => {
    const key = JSON.stringify(lines);
    if (key === last) return;
    last = key;

    g.fillStyle = '#05080c';
    g.fillRect(0, 0, 512, 256);
    g.strokeStyle = '#1d2735';
    g.lineWidth = 4;
    g.strokeRect(6, 6, 500, 244);

    g.textBaseline = 'middle';
    g.fillStyle = '#4b5b72';
    g.font = '600 22px ui-monospace, SFMono-Regular, Menlo, monospace';
    g.textAlign = 'left';
    g.fillText(lines.title ?? 'TIMING', 24, 32);

    const rows = lines.rows ?? [];
    rows.forEach((row, i) => {
      const y = 76 + i * 44;
      g.fillStyle = '#7d8ea6';
      g.font = '500 26px ui-monospace, SFMono-Regular, Menlo, monospace';
      g.textAlign = 'left';
      g.fillText(row[0], 28, y);
      g.fillStyle = row[2] ?? '#ffd166';
      g.font = '700 34px ui-monospace, SFMono-Regular, Menlo, monospace';
      g.textAlign = 'right';
      g.fillText(row[1], 486, y);
    });
    tex.needsUpdate = true;
  };

  draw({ title: 'TIMING', rows: [['STAGE', '--'], ['ET', '--'], ['MPH', '--']] });
  return { texture: tex, draw };
}

/** Big trackside scoreboard texture. */
export function createScoreboard() {
  if (!hasDOM) return { texture: null, draw: () => {} };
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;

  let last = '';
  const draw = (data) => {
    const key = JSON.stringify(data);
    if (key === last) return;
    last = key;
    g.fillStyle = '#04060a';
    g.fillRect(0, 0, 1024, 512);
    g.fillStyle = '#0b1220';
    g.fillRect(16, 16, 992, 480);

    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.fillStyle = '#ffb703';
    g.font = '800 62px ui-sans-serif, system-ui, sans-serif';
    g.fillText(data.title ?? 'NITRO STRIP', 512, 70);

    const cells = data.cells ?? [];
    cells.forEach((cell, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 268 + col * 488;
      const y = 190 + row * 130;
      g.fillStyle = '#8ea3c0';
      g.font = '600 34px ui-sans-serif, system-ui, sans-serif';
      g.fillText(cell[0], x, y - 40);
      g.fillStyle = cell[2] ?? '#f4f8ff';
      g.font = '800 78px ui-monospace, SFMono-Regular, Menlo, monospace';
      g.fillText(cell[1], x, y + 22);
    });
    tex.needsUpdate = true;
  };
  draw({ cells: [['REACTION', '--'], ['60 FT', '--'], ['1/8 MILE', '--'], ['1/4 MILE', '--']] });
  return { texture: tex, draw };
}
