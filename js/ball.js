// A tennis ball (radius 1 m, scaled up in the scene) with its curvy white seam
import * as THREE from 'three';
import { exportGlb } from './shapes.js';

// The classic seam curve; it lies on a sphere of radius a + b
class SeamCurve extends THREE.Curve {
  getPoint(t, target = new THREE.Vector3()) {
    const a = 0.7, b = 0.3, u = t * Math.PI * 2;
    return target.set(
      a * Math.cos(u) + b * Math.cos(3 * u),
      a * Math.sin(u) - b * Math.sin(3 * u),
      2 * Math.sqrt(a * b) * Math.sin(2 * u),
    ).multiplyScalar(1.004);
  }
}

export async function buildBallGlb() {
  const root = new THREE.Group();
  root.name = 'ball';
  const felt = new THREE.MeshStandardMaterial({ color: 0xcfe83a, roughness: 0.95, emissive: 0x2a3300 });
  root.add(new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), felt));
  const seam = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  root.add(new THREE.Mesh(new THREE.TubeGeometry(new SeamCurve(), 160, 0.035, 8, true), seam));
  return exportGlb(root);
}
