import * as THREE from 'three';
import type { Prop } from '../characterTypes';

/**
 * Hand props. Each is modelled in a "grip frame": +Y is up when the forearm is level and the thumb is on
 * top, +Z points away from the wrist, +X to the character's left. `Character` maps that frame onto the hand bone.
 */
export interface PropParts {
  /** in the right hand */
  right: THREE.Object3D | null;
  /** in the left hand (dumbbells) */
  left: THREE.Object3D | null;
  /** in front of the chest (guitar): chest-bone space, origin at the chest bone */
  chest: THREE.Object3D | null;
}

const M = (color: string, roughness = 0.6, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

function mesh(g: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

/** Build the meshes of a prop. `k` = body scale (1 for a 1.78 m adult); `chestFront` = distance from the chest bone to the front of the shirt. */
export function buildProp(p: Prop, k: number, chestFront: number): PropParts {
  const out: PropParts = { right: null, left: null, chest: null };
  if (p === 'none') return out;
  // objects keep roughly their real size; small hands get slightly smaller things
  const s = 0.8 + 0.2 * k;
  const g = new THREE.Group();
  out.right = g;
  switch (p) {
    case 'book': {
      // an open book, spine towards the reader's other hand (+X), tilted to face the reader
      const hold = new THREE.Group();
      hold.position.set(0.1 * s, 0.02 * s, 0.01 * s);
      hold.rotation.x = -0.75;
      for (const sx of [-1, 1]) {
        const half = new THREE.Group();
        half.rotation.y = sx * 0.16;
        mesh(half, new THREE.BoxGeometry(0.105 * s, 0.006 * s, 0.155 * s), M('#3d5a80', 0.7), sx * 0.054 * s, 0, 0);
        mesh(half, new THREE.BoxGeometry(0.098 * s, 0.012 * s, 0.146 * s), M('#f4efe2', 0.9), sx * 0.052 * s, 0.008 * s, 0);
        hold.add(half);
      }
      g.add(hold);
      break;
    }
    case 'cup': {
      const pts = [new THREE.Vector2(0.001, -0.045), new THREE.Vector2(0.03, -0.045), new THREE.Vector2(0.036, 0.045), new THREE.Vector2(0.032, 0.045), new THREE.Vector2(0.027, -0.035), new THREE.Vector2(0.001, -0.035)].map((v) => v.multiplyScalar(s));
      mesh(g, new THREE.LatheGeometry(pts, 18), M('#f6f4ef', 0.25));
      mesh(g, new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.002, 16), M('#4a2c1a', 0.2), 0, 0.03 * s, 0);
      const handle = mesh(g, new THREE.TorusGeometry(0.022 * s, 0.006 * s, 6, 12, Math.PI), M('#f6f4ef', 0.25), 0, 0, 0.034 * s);
      handle.rotation.set(0, Math.PI / 2, -Math.PI / 2);
      break;
    }
    case 'apple': {
      const a = mesh(g, new THREE.SphereGeometry(0.038 * s, 16, 12), M('#c8312b', 0.35), 0, 0.005 * s, 0.01 * s);
      a.scale.y = 0.92;
      mesh(g, new THREE.CylinderGeometry(0.003 * s, 0.003 * s, 0.022 * s, 5), M('#5a3b1f'), 0, 0.045 * s, 0.01 * s);
      const leaf = mesh(g, new THREE.SphereGeometry(0.012 * s, 8, 6), M('#4f8a3a', 0.6), 0.012 * s, 0.047 * s, 0.01 * s);
      leaf.scale.set(1, 0.25, 0.6);
      break;
    }
    case 'spoon': {
      // a wooden cooking spoon, pointing down out of the fist
      mesh(g, new THREE.CylinderGeometry(0.006 * s, 0.007 * s, 0.26 * s, 8), M('#b7865a', 0.7), 0, -0.1 * s, 0);
      const bowl = mesh(g, new THREE.SphereGeometry(0.024 * s, 12, 8), M('#b7865a', 0.7), 0, -0.245 * s, 0);
      bowl.scale.set(1, 1.4, 0.35);
      break;
    }
    case 'phone': {
      mesh(g, new THREE.BoxGeometry(0.072 * s, 0.148 * s, 0.009 * s), M('#1b1c1f', 0.3), 0, 0.03 * s, 0.012 * s);
      mesh(g, new THREE.BoxGeometry(0.064 * s, 0.136 * s, 0.002 * s), M('#3a6ea8', 0.15), 0, 0.03 * s, 0.006 * s);
      break;
    }
    case 'controller': {
      const c = new THREE.Group();
      c.position.set(0.075 * s, 0, 0.015 * s);
      mesh(c, new THREE.BoxGeometry(0.12 * s, 0.03 * s, 0.06 * s), M('#2a2b30', 0.45));
      for (const sx of [-1, 1]) {
        const grip = mesh(c, new THREE.CapsuleGeometry(0.02 * s, 0.045 * s, 4, 10), M('#2a2b30', 0.45), sx * 0.062 * s, -0.012 * s, -0.022 * s);
        grip.rotation.x = 0.5;
        mesh(c, new THREE.CylinderGeometry(0.009 * s, 0.009 * s, 0.01 * s, 10), M('#8a8d92', 0.4), sx * 0.032 * s, 0.018 * s, 0.006 * s);
      }
      g.add(c);
      break;
    }
    case 'dart': {
      mesh(g, new THREE.CylinderGeometry(0.004 * s, 0.004 * s, 0.11 * s, 6), M('#c9ccce', 0.3, 1), 0, 0.03 * s, 0.03 * s).rotation.x = Math.PI / 2;
      mesh(g, new THREE.ConeGeometry(0.004 * s, 0.03 * s, 6), M('#8a8d90', 0.3, 1), 0, 0.03 * s, 0.1 * s).rotation.x = Math.PI / 2;
      for (const r of [0, Math.PI / 2]) {
        const fl = mesh(g, new THREE.BoxGeometry(0.03 * s, 0.001, 0.035 * s), M('#d9483b', 0.6), 0, 0.03 * s, -0.03 * s);
        fl.rotation.z = r;
      }
      break;
    }
    case 'dumbbells': {
      out.left = new THREE.Group();
      for (const grp of [g, out.left as THREE.Group]) {
        mesh(grp, new THREE.CylinderGeometry(0.012 * s, 0.012 * s, 0.17 * s, 8), M('#8a8d90', 0.4, 1));
        for (const sy of [-1, 1]) mesh(grp, new THREE.CylinderGeometry(0.038 * s, 0.038 * s, 0.04 * s, 14), M('#2a2b2e', 0.6), 0, sy * 0.075 * s, 0);
      }
      break;
    }
    case 'ball': {
      mesh(g, new THREE.SphereGeometry(0.12, 20, 14), M('#d9692b', 0.7), 0.1, 0.02, 0.07);
      break;
    }
    case 'paddle': {
      mesh(g, new THREE.CylinderGeometry(0.013 * s, 0.015 * s, 0.1 * s, 8), M('#b98a5a', 0.6), 0, 0.0, 0);
      const blade = mesh(g, new THREE.CylinderGeometry(0.078 * s, 0.078 * s, 0.012 * s, 20), M('#c0392b', 0.7), 0, 0.12 * s, 0);
      blade.rotation.z = Math.PI / 2;
      break;
    }
    case 'cue': {
      mesh(g, new THREE.CylinderGeometry(0.006, 0.013, 1.4, 8), M('#c9a777', 0.5), 0, 0, 0.45).rotation.x = Math.PI / 2;
      break;
    }
    case 'mic': {
      mesh(g, new THREE.CylinderGeometry(0.014 * s, 0.01 * s, 0.15 * s, 10), M('#222326', 0.4), 0, 0.01 * s, 0);
      mesh(g, new THREE.SphereGeometry(0.026 * s, 12, 10), M('#8a8d90', 0.35, 0.8), 0, 0.105 * s, 0);
      break;
    }
    case 'guitar': {
      out.right = null;
      const c = new THREE.Group();
      c.position.set(-0.05 * k, -0.2 * k, chestFront + 0.055 * k);
      c.rotation.z = 0.32;
      const wood = M('#b5733d', 0.4);
      const body = mesh(c, new THREE.SphereGeometry(0.17 * k, 20, 12), wood, 0, -0.04 * k, 0);
      body.scale.set(1, 1.12, 0.3);
      const upper = mesh(c, new THREE.SphereGeometry(0.125 * k, 18, 12), wood, 0.19 * k, -0.02 * k, 0);
      upper.scale.set(1, 1.1, 0.3);
      mesh(c, new THREE.CylinderGeometry(0.045 * k, 0.045 * k, 0.004, 18), M('#1a1410', 0.8), 0.07 * k, -0.03 * k, 0.05 * k).rotation.x = Math.PI / 2;
      mesh(c, new THREE.BoxGeometry(0.46 * k, 0.045 * k, 0.022 * k), M('#4a2f1d', 0.5), 0.5 * k, -0.02 * k, 0.03 * k);
      mesh(c, new THREE.BoxGeometry(0.12 * k, 0.065 * k, 0.02 * k), M('#3a2416', 0.5), 0.78 * k, -0.02 * k, 0.025 * k);
      mesh(c, new THREE.BoxGeometry(0.06 * k, 0.012 * k, 0.012 * k), M('#2a1b12', 0.6), -0.05 * k, -0.03 * k, 0.052 * k).rotation.z = Math.PI / 2;
      out.chest = c;
      break;
    }
  }
  return out;
}

export function disposeProp(parts: PropParts): void {
  for (const o of [parts.right, parts.left, parts.chest]) {
    o?.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    o?.removeFromParent();
  }
}
