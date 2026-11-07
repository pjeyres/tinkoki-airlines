// Builds Loki the golden retriever out of simple shapes.
// Axes: +X is forward (nose), +Y is up, ±Z are his sides.
import * as THREE from 'three';
import { makeKit, exportGlb } from './shapes.js';

const COLORS = {
  coat: 0xd39a4e,
  light: 0xedca8c,
  dark: 0xa86f31,
  nose: 0x241812,
  eye: 0x1b120c,
  white: 0xffffff,
  tongue: 0xe0707e,
  scarf: 0xc9302a,
  leather: 0x6b4226,
  brass: 0xd9b34c,
  lens: 0x7cc4e6,
  collar: 0x2a5ea8,
};

const { mat, blob, pivot } = makeKit(COLORS);

function buildBody(root) {
  // Torso, chest and rump
  blob(root, 'coat', [0, 0, 0], [0.42, 0.2, 0.19]);
  blob(root, 'coat', [0.25, -0.02, 0], [0.23, 0.22, 0.2]);
  blob(root, 'coat', [-0.3, 0.02, 0], [0.21, 0.19, 0.18]);
  // Fluffy cream chest and belly feathering
  blob(root, 'light', [0.37, -0.08, 0], [0.13, 0.18, 0.15]);
  blob(root, 'light', [0.3, -0.2, 0], [0.12, 0.09, 0.11]);
  blob(root, 'light', [0.0, -0.13, 0], [0.32, 0.1, 0.15]);
  blob(root, 'light', [-0.15, -0.16, 0], [0.18, 0.07, 0.12]);
  // Slightly darker saddle along the back
  blob(root, 'dark', [-0.05, 0.12, 0], [0.34, 0.09, 0.13]);
  // Neck
  blob(root, 'coat', [0.43, 0.12, 0], [0.17, 0.18, 0.145], [0, 0, -0.6]);
  blob(root, 'light', [0.5, 0.04, 0], [0.11, 0.13, 0.12], [0, 0, -0.4]);
}

function buildHead(root) {
  const head = pivot(root, 'head', [0.53, 0.24, 0]);

  // Skull and cheeks
  blob(head, 'coat', [0.04, 0.08, 0], [0.15, 0.13, 0.13]);
  blob(head, 'coat', [0.08, 0.02, 0], [0.13, 0.11, 0.14]);
  // Muzzle
  blob(head, 'coat', [0.18, 0.04, 0], [0.11, 0.055, 0.065]);
  blob(head, 'light', [0.2, 0.0, 0], [0.12, 0.065, 0.078]);
  blob(head, 'light', [0.17, -0.045, 0], [0.1, 0.035, 0.06]);
  // Nose
  blob(head, 'nose', [0.315, 0.03, 0], [0.036, 0.03, 0.042], [0, 0, 0], { roughness: 0.35 });

  // Eyes with a little sparkle, and soft brows
  for (const side of [1, -1]) {
    blob(head, 'eye', [0.145, 0.075, 0.078 * side], [0.024, 0.024, 0.02], [0, 0, 0], { roughness: 0.15 });
    blob(head, 'white', [0.165, 0.085, 0.086 * side], [0.007, 0.007, 0.006], [0, 0, 0], { roughness: 0.1 });
    blob(head, 'light', [0.135, 0.105, 0.072 * side], [0.032, 0.012, 0.024]);
  }

  // Tongue, flapping out of a happy open mouth
  const tongue = pivot(head, 'tongue', [0.17, -0.06, 0.0], [0, 0, -0.5]);
  blob(tongue, 'tongue', [0.05, -0.02, 0], [0.065, 0.014, 0.04], [0, 0, 0], { roughness: 0.4 });

  // Floppy ears. The pivot sits where the ear joins the skull.
  for (const [name, side] of [['earL', 1], ['earR', -1]]) {
    const ear = pivot(head, name, [0.0, 0.13, 0.115 * side]);
    blob(ear, 'dark', [-0.01, -0.11, 0.02 * side], [0.085, 0.13, 0.026]);
    blob(ear, 'coat', [-0.025, -0.15, 0.03 * side], [0.06, 0.08, 0.02]);
  }

  // Aviator goggles pushed up on his forehead
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.013, 10, 40), mat('leather'));
  strap.position.set(0.04, 0.11, 0);
  strap.rotation.set(Math.PI / 2, 0, 0.35);
  strap.scale.set(1.05, 0.95, 1);
  head.add(strap);
  const rimGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.03, 24);
  const lensGeo = new THREE.CylinderGeometry(0.034, 0.034, 0.034, 24);
  for (const side of [1, -1]) {
    const rim = new THREE.Mesh(rimGeo, mat('brass', { roughness: 0.3, metalness: 0.9 }));
    rim.position.set(0.15, 0.16, 0.052 * side);
    rim.rotation.set(0, 0, -Math.PI / 2 + 0.75);
    head.add(rim);
    const lens = new THREE.Mesh(lensGeo, mat('lens', { roughness: 0.05, metalness: 0.4 }));
    lens.position.copy(rim.position);
    lens.rotation.copy(rim.rotation);
    head.add(lens);
  }
  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.04, 8), mat('brass'));
  bridge.position.set(0.153, 0.162, 0);
  bridge.rotation.set(Math.PI / 2, 0, 0);
  head.add(bridge);

  return head;
}

function buildCollarAndScarf(root) {
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.022, 10, 40), mat('collar'));
  collar.position.set(0.46, 0.13, 0);
  collar.rotation.set(0, Math.PI / 2, 0);
  collar.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), -0.75);
  root.add(collar);
  const tag = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 20), mat('brass', { roughness: 0.3, metalness: 0.9 }));
  tag.position.set(0.53, 0.0, 0);
  tag.rotation.set(0, 0, -0.75);
  root.add(tag);

  // Red flying-ace scarf knotted at the side of the neck, trailing behind
  blob(root, 'scarf', [0.42, 0.17, 0.12], [0.06, 0.05, 0.04]);
  const segGeo = new THREE.BoxGeometry(0.15, 0.012, 0.085);
  let parent = pivot(root, 'scarf0', [0.38, 0.19, 0.13], [0, 0.2, -0.12]);
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Mesh(segGeo, mat('scarf'));
    seg.position.set(-0.075, 0, 0);
    seg.scale.set(1, 1, 1 - i * 0.12);
    parent.add(seg);
    if (i < 3) parent = pivot(parent, `scarf${i + 1}`, [-0.15, 0, 0]);
  }
}

function buildLegs(root) {
  // Front legs
  for (const [name, side] of [['legFL', 1], ['legFR', -1]]) {
    const leg = pivot(root, name, [0.3, -0.1, 0.11 * side]);
    blob(leg, 'coat', [0, -0.13, 0], [0.062, 0.16, 0.06]);
    blob(leg, 'light', [-0.045, -0.13, 0], [0.04, 0.11, 0.042]);
    blob(leg, 'coat', [0.0, -0.3, 0], [0.045, 0.06, 0.045]);
    blob(leg, 'light', [0.025, -0.355, 0], [0.068, 0.04, 0.058]);
  }
  // Hind legs
  for (const [name, side] of [['legBL', 1], ['legBR', -1]]) {
    const leg = pivot(root, name, [-0.33, -0.06, 0.11 * side]);
    blob(leg, 'coat', [0, -0.11, 0], [0.09, 0.16, 0.075]);
    blob(leg, 'light', [-0.06, -0.15, 0], [0.05, 0.11, 0.05]);
    blob(leg, 'coat', [0.0, -0.29, 0], [0.045, 0.09, 0.045]);
    blob(leg, 'light', [0.025, -0.37, 0], [0.068, 0.04, 0.058]);
  }
}

function buildTail(root) {
  let parent = pivot(root, 'tail0', [-0.48, 0.07, 0], [0, 0, 0.25]);
  for (let i = 0; i < 4; i++) {
    const s = 1 - i * 0.14;
    blob(parent, 'coat', [-0.06, 0, 0], [0.075, 0.045 * s, 0.045 * s]);
    // Feathery cream underside, the golden retriever signature
    blob(parent, 'light', [-0.06, -0.045 * s, 0], [0.07, 0.04 * s, 0.03 * s]);
    if (i < 3) parent = pivot(parent, `tail${i + 1}`, [-0.115, 0, 0]);
  }
}

export const LOKI_NODES = [
  'head', 'tongue', 'earL', 'earR',
  'legFL', 'legFR', 'legBL', 'legBR',
  'tail0', 'tail1', 'tail2', 'tail3',
  'scarf0', 'scarf1', 'scarf2', 'scarf3',
];

// Returns a blob: URL of Loki as a .glb
export async function buildLokiGlb() {
  const root = new THREE.Group();
  root.name = 'loki';
  buildBody(root);
  buildHead(root);
  buildCollarAndScarf(root);
  buildLegs(root);
  buildTail(root);

  return exportGlb(root);
}
