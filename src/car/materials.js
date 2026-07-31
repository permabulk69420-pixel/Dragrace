/**
 * Physically based materials for the car. One shared set, created once, so the
 * renderer can batch and so the GLB export carries a sensible material list.
 */
import * as THREE from 'three';

/** Procedural carbon-fibre weave, used for the hood, splitter and wing. */
function carbonTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#0d0f12';
  g.fillRect(0, 0, size, size);
  const cell = size / 8;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const horizontal = (x + y) % 2 === 0;
      const grd = g.createLinearGradient(
        x * cell, y * cell,
        horizontal ? (x + 1) * cell : x * cell,
        horizontal ? y * cell : (y + 1) * cell
      );
      grd.addColorStop(0, '#23272e');
      grd.addColorStop(0.5, '#0a0c0f');
      grd.addColorStop(1, '#23272e');
      g.fillStyle = grd;
      g.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Brushed/anodised look for alloy: fine noise in the roughness channel. */
function noiseRoughness(size = 128, low = 118, high = 158) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = low + Math.random() * (high - low);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

/**
 * @param {object} [opts]
 * @param {number|string} [opts.paint] body colour
 * @param {boolean} [opts.procedural=true] generate canvas textures (off in Node/export)
 */
export function createMaterials(opts = {}) {
  const paintColor = opts.paint ?? 0xb01212;
  const procedural = opts.procedural ?? (typeof document !== 'undefined');

  const M = {};

  M.paint = new THREE.MeshPhysicalMaterial({
    name: 'BodyPaint',
    color: paintColor,
    metalness: 0.55,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.35,
  });

  M.paintDark = new THREE.MeshPhysicalMaterial({
    name: 'PaintSecondary',
    color: 0x14161b,
    metalness: 0.5,
    roughness: 0.3,
    clearcoat: 0.8,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.1,
  });

  M.carbon = new THREE.MeshPhysicalMaterial({
    name: 'CarbonFibre',
    color: 0x2a2d33,
    metalness: 0.35,
    roughness: 0.32,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    map: procedural ? carbonTexture() : null,
    envMapIntensity: 1.1,
  });

  M.chrome = new THREE.MeshStandardMaterial({
    name: 'Chrome',
    color: 0xf2f4f8,
    metalness: 1,
    roughness: 0.08,
    envMapIntensity: 1.6,
  });

  M.alloy = new THREE.MeshStandardMaterial({
    name: 'Alloy',
    color: 0xc9ced8,
    metalness: 1,
    roughness: 0.28,
    roughnessMap: procedural ? noiseRoughness() : null,
    envMapIntensity: 1.3,
  });

  M.blackAlloy = new THREE.MeshStandardMaterial({
    name: 'BlackAlloy',
    color: 0x3a3d45,
    metalness: 0.95,
    roughness: 0.38,
    envMapIntensity: 1.1,
  });

  M.matte = new THREE.MeshStandardMaterial({
    name: 'MatteBlack',
    color: 0x1b1d21,
    metalness: 0.15,
    roughness: 0.85,
  });

  M.satin = new THREE.MeshStandardMaterial({
    name: 'SatinBlack',
    color: 0x26292f,
    metalness: 0.3,
    roughness: 0.55,
  });

  M.rubber = new THREE.MeshStandardMaterial({
    name: 'TyreRubber',
    color: 0x14151a,
    metalness: 0.0,
    roughness: 0.92,
  });

  M.rubberSoft = new THREE.MeshStandardMaterial({
    name: 'Sidewall',
    color: 0x1b1c22,
    metalness: 0.0,
    roughness: 0.98,
  });

  M.glass = new THREE.MeshPhysicalMaterial({
    name: 'Glass',
    color: 0xdfe9f2,
    metalness: 0,
    roughness: 0.04,
    transmission: 0.92,
    thickness: 0.01,
    ior: 1.5,
    transparent: true,
    opacity: 0.35,
    envMapIntensity: 1.4,
    side: THREE.DoubleSide,
  });

  M.glassTinted = new THREE.MeshPhysicalMaterial({
    name: 'GlassTinted',
    color: 0x1a222c,
    metalness: 0,
    roughness: 0.08,
    transmission: 0.75,
    thickness: 0.01,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
  });

  M.leather = new THREE.MeshStandardMaterial({
    name: 'Leather',
    color: 0x1c1e23,
    metalness: 0.0,
    roughness: 0.78,
  });

  M.suede = new THREE.MeshStandardMaterial({
    name: 'Alcantara',
    color: 0x2b2f36,
    metalness: 0,
    roughness: 0.95,
  });

  M.harness = new THREE.MeshStandardMaterial({
    name: 'HarnessWebbing',
    color: 0xd23b1f,
    metalness: 0,
    roughness: 0.85,
  });

  M.cage = new THREE.MeshStandardMaterial({
    name: 'RollCage',
    color: 0xd8d9dd,
    metalness: 0.9,
    roughness: 0.3,
  });

  M.carpet = new THREE.MeshStandardMaterial({
    name: 'Carpet',
    color: 0x15171b,
    metalness: 0,
    roughness: 1,
  });

  M.gauge = new THREE.MeshStandardMaterial({
    name: 'GaugeFace',
    color: 0xffffff,
    metalness: 0,
    roughness: 0.6,
  });

  M.needle = new THREE.MeshStandardMaterial({
    name: 'Needle',
    color: 0xff3322,
    emissive: 0x882211,
    emissiveIntensity: 1.2,
    metalness: 0,
    roughness: 0.5,
  });

  M.headlight = new THREE.MeshPhysicalMaterial({
    name: 'HeadlightLens',
    color: 0xf6fbff,
    metalness: 0,
    roughness: 0.05,
    transmission: 0.9,
    thickness: 0.05,
    transparent: true,
    opacity: 0.6,
  });

  M.headlightGlow = new THREE.MeshStandardMaterial({
    name: 'HeadlightEmitter',
    color: 0xffffff,
    emissive: 0xfff0d0,
    emissiveIntensity: 2.5,
    roughness: 0.4,
  });

  M.tailLight = new THREE.MeshStandardMaterial({
    name: 'TailLight',
    color: 0x3a0a0a,
    emissive: 0xff1a08,
    emissiveIntensity: 0.9,
    roughness: 0.35,
    metalness: 0.1,
  });

  M.reverseLight = new THREE.MeshStandardMaterial({
    name: 'ReverseLight',
    color: 0xd8d8d8,
    emissive: 0xffffff,
    emissiveIntensity: 0.05,
    roughness: 0.4,
  });

  M.exhaustHeat = new THREE.MeshStandardMaterial({
    name: 'ExhaustTip',
    color: 0x7a6f68,
    metalness: 1,
    roughness: 0.45,
  });

  M.chute = new THREE.MeshStandardMaterial({
    name: 'ChuteCanopy',
    color: 0xff5a1f,
    metalness: 0,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });

  M.screen = new THREE.MeshBasicMaterial({ name: 'Screen', color: 0xffffff, toneMapped: false });

  return M;
}
