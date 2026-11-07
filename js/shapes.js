// Shared helpers for building the pilots out of simple shapes with three.js
// and exporting them as binary glTF that Cesium can load.
// Units are metres. Axes: +X is forward (nose), +Y is up, ±Z are the sides.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const sphereGeo = new THREE.SphereGeometry(1, 32, 20);

// colours: { name: 0xrrggbb }. Returns helpers that look colours up by name.
export function makeKit(colours) {
  const materials = {};
  function mat(name, opts = {}) {
    if (!materials[name]) {
      materials[name] = new THREE.MeshStandardMaterial({
        color: colours[name],
        roughness: opts.roughness ?? 0.85,
        metalness: opts.metalness ?? 0,
      });
      materials[name].name = name;
    }
    return materials[name];
  }

  // Ellipsoid blob: radii (rx, ry, rz) at position (x, y, z).
  function blob(parent, colour, [x, y, z], [rx, ry, rz], rot = [0, 0, 0], matOpts) {
    const m = new THREE.Mesh(sphereGeo, mat(colour, matOpts));
    m.position.set(x, y, z);
    m.scale.set(rx, ry, rz);
    m.rotation.set(rot[0], rot[1], rot[2]);
    parent.add(m);
    return m;
  }

  function pivot(parent, name, [x, y, z], rot = [0, 0, 0]) {
    const g = new THREE.Group();
    if (name) g.name = name;
    g.position.set(x, y, z);
    g.rotation.set(rot[0], rot[1], rot[2]);
    parent.add(g);
    return g;
  }

  return { mat, blob, pivot };
}

// Returns a blob: URL of the object as a .glb
export async function exportGlb(root) {
  const exporter = new GLTFExporter();
  const glb = await exporter.parseAsync(root, { binary: true });
  return URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
}
