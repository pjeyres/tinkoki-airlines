// Builds Tinker the tabby cat out of simple shapes.
// Axes: +X is forward (nose), +Y is up, ±Z are her sides.
import * as THREE from 'three';
import { makeKit, exportGlb } from './shapes.js';

const COLORS = {
  coat: 0xa3855f,
  stripe: 0x4a3828,
  light: 0xeadfca,
  nose: 0xe2959c,
  innerEar: 0xe8a9ad,
  eye: 0x8cc63f,
  pupil: 0x111111,
  white: 0xffffff,
  collar: 0x1f9e8f,
  bell: 0xe0b84a,
  cape: 0x6b47b8,
};

const { mat, blob, pivot } = makeKit(COLORS);

function buildBody(root) {
  // Torso, chest and haunches
  blob(root, 'coat', [0, 0, 0], [0.3, 0.13, 0.12]);
  blob(root, 'coat', [0.17, -0.01, 0], [0.14, 0.13, 0.12]);
  blob(root, 'coat', [-0.2, 0.01, 0], [0.15, 0.13, 0.125]);
  // Cream belly and bib
  blob(root, 'light', [0.0, -0.075, 0], [0.24, 0.07, 0.1]);
  blob(root, 'light', [0.24, -0.04, 0], [0.08, 0.1, 0.09]);
  // Tabby stripes wrapping over the back, and a dark line down the spine
  for (const x of [-0.27, -0.18, -0.09, 0.0, 0.09, 0.18]) {
    blob(root, 'stripe', [x, 0.045, 0], [0.022, 0.1, 0.127], [0, 0, x * 0.4]);
  }
  blob(root, 'stripe', [-0.02, 0.115, 0], [0.3, 0.03, 0.04]);
  // Neck
  blob(root, 'coat', [0.29, 0.06, 0], [0.1, 0.1, 0.09], [0, 0, -0.5]);
}

function buildHead(root) {
  const head = pivot(root, 'head', [0.36, 0.13, 0]);

  // Round skull and wide cat cheeks
  blob(head, 'coat', [0.03, 0.025, 0], [0.11, 0.095, 0.105]);
  blob(head, 'coat', [0.06, -0.02, 0], [0.08, 0.065, 0.115]);
  // Muzzle, whisker pads and chin
  blob(head, 'light', [0.12, -0.03, 0], [0.045, 0.035, 0.055]);
  for (const side of [1, -1]) blob(head, 'light', [0.135, -0.035, 0.022 * side], [0.032, 0.028, 0.03]);
  blob(head, 'light', [0.11, -0.062, 0], [0.04, 0.02, 0.035]);
  blob(head, 'nose', [0.165, -0.008, 0], [0.012, 0.01, 0.016], [0, 0, 0], { roughness: 0.4 });

  // Green eyes with slit pupils
  for (const side of [1, -1]) {
    blob(head, 'eye', [0.105, 0.025, 0.046 * side], [0.022, 0.026, 0.018], [0, 0, 0], { roughness: 0.15 });
    blob(head, 'pupil', [0.123, 0.025, 0.05 * side], [0.005, 0.02, 0.006], [0, 0, 0], { roughness: 0.1 });
    blob(head, 'white', [0.124, 0.036, 0.055 * side], [0.005, 0.005, 0.004], [0, 0, 0], { roughness: 0.1 });
    // Cheek stripes
    blob(head, 'stripe', [0.06, -0.01, 0.105 * side], [0.03, 0.006, 0.012], [0, 0, -0.3]);
    blob(head, 'stripe', [0.05, -0.035, 0.1 * side], [0.028, 0.006, 0.012], [0, 0, -0.2]);
  }
  // The tabby "M" on her forehead
  for (const z of [-0.028, 0, 0.028]) {
    blob(head, 'stripe', [0.085, 0.072, z], [0.03, 0.012, 0.006], [0, 0, -0.7]);
  }

  // Pointed ears; the pivot sits at the base of each ear
  const earGeo = new THREE.ConeGeometry(0.042, 0.085, 16);
  const innerGeo = new THREE.ConeGeometry(0.028, 0.06, 16);
  for (const [name, side] of [['earL', 1], ['earR', -1]]) {
    const ear = pivot(head, name, [0.0, 0.085, 0.06 * side], [0.3 * side, 0, 0]);
    const outer = new THREE.Mesh(earGeo, mat('coat'));
    outer.position.set(0, 0.04, 0);
    outer.scale.set(0.45, 1, 1);
    ear.add(outer);
    const inner = new THREE.Mesh(innerGeo, mat('innerEar'));
    inner.position.set(0.012, 0.033, 0);
    inner.scale.set(0.3, 1, 1);
    ear.add(inner);
  }

  // Whiskers fanning out from the pads
  const whiskerGeo = new THREE.CylinderGeometry(0.0016, 0.0008, 0.13, 4);
  for (const side of [1, -1]) {
    for (const k of [-1, 0, 1]) {
      const g = pivot(head, null, [0.135, -0.035, 0.035 * side], [k * 0.16 * side, -0.25 * side, 0]);
      const w = new THREE.Mesh(whiskerGeo, mat('white', { roughness: 0.4 }));
      w.rotation.set(Math.PI / 2, 0, 0);
      w.position.set(0, 0, 0.065 * side);
      g.add(w);
    }
  }
  return head;
}

function buildCollarAndCape(root) {
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.014, 10, 36), mat('collar'));
  collar.position.set(0.31, 0.07, 0);
  collar.rotation.set(0, Math.PI / 2, 0);
  collar.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), -0.5);
  root.add(collar);
  blob(root, 'bell', [0.365, -0.005, 0], [0.022, 0.022, 0.022], [0, 0, 0], { roughness: 0.25, metalness: 0.9 });

  // A little purple cape. Its segments use the same scarf node names as
  // Loki's scarf so the flutter animation drives both.
  let parent = pivot(root, 'scarf0', [0.22, 0.12, 0], [0, 0, -0.1]);
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.008, 0.17 + i * 0.025), mat('cape'));
    seg.position.set(-0.05, 0, 0);
    parent.add(seg);
    if (i < 3) parent = pivot(parent, `scarf${i + 1}`, [-0.1, 0, 0]);
  }
}

function buildLegs(root) {
  for (const [name, side] of [['legFL', 1], ['legFR', -1]]) {
    const leg = pivot(root, name, [0.18, -0.07, 0.07 * side]);
    blob(leg, 'coat', [0, -0.08, 0], [0.035, 0.1, 0.035]);
    blob(leg, 'stripe', [0, -0.11, 0], [0.037, 0.01, 0.037]);
    blob(leg, 'light', [0.012, -0.18, 0], [0.04, 0.025, 0.035]);
  }
  for (const [name, side] of [['legBL', 1], ['legBR', -1]]) {
    const leg = pivot(root, name, [-0.2, -0.04, 0.075 * side]);
    blob(leg, 'coat', [0, -0.07, 0], [0.06, 0.1, 0.05]);
    blob(leg, 'coat', [0, -0.17, 0], [0.03, 0.07, 0.03]);
    blob(leg, 'stripe', [0, -0.16, 0], [0.032, 0.01, 0.032]);
    blob(leg, 'light', [0.015, -0.23, 0], [0.042, 0.025, 0.035]);
  }
}

export const TINKER_TAIL_SEGMENTS = 6;

function buildTail(root) {
  let parent = pivot(root, 'tail0', [-0.33, 0.04, 0], [0, 0, 0.3]);
  for (let i = 0; i < TINKER_TAIL_SEGMENTS; i++) {
    const s = 1 - i * 0.07;
    const last = i === TINKER_TAIL_SEGMENTS - 1;
    blob(parent, last ? 'stripe' : 'coat', [-0.035, 0, 0], [0.042, 0.026 * s, 0.026 * s]);
    if (i % 2 === 1 && !last) blob(parent, 'stripe', [-0.035, 0, 0], [0.012, 0.028 * s, 0.028 * s]);
    if (!last) parent = pivot(parent, `tail${i + 1}`, [-0.065, 0, 0]);
  }
}

export const TINKER_NODES = [
  'head', 'earL', 'earR',
  'legFL', 'legFR', 'legBL', 'legBR',
  ...Array.from({ length: TINKER_TAIL_SEGMENTS }, (_, i) => `tail${i}`),
  'scarf0', 'scarf1', 'scarf2', 'scarf3',
];

// Returns a blob: URL of Tinker as a .glb
export async function buildTinkerGlb() {
  const root = new THREE.Group();
  root.name = 'tinker';
  buildBody(root);
  buildHead(root);
  buildCollarAndCape(root);
  buildLegs(root);
  buildTail(root);
  return exportGlb(root);
}
