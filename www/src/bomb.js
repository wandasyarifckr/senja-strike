// Bom "Paket Senja": dibawa penyerang, ditanam di Site A/B (tahan E 3 detik),
// sumbu 35 detik, dijinakkan lawan 5 detik. Model: kotak oranye + lampu berkedip.
import * as THREE from 'three';
import { SITES } from './world.js';
import { PLANT_TIME, DEFUSE_TIME, BOMB_TIME } from './state.js';

export function createBomb(scene) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.32, 0.34),
    new THREE.MeshStandardMaterial({ color: 0xd86a1e, roughness: 0.6, metalness: 0.3 }),
  );
  body.castShadow = true;
  group.add(body);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), lampMat);
  lamp.position.set(0.18, 0.18, 0);
  group.add(lamp);
  group.visible = false;
  scene.add(group);
  let blink = 0;

  function inSite(x, z) {
    for (const key of ['A', 'B']) {
      const s = SITES[key];
      if (Math.abs(x - s.cx) <= s.hx && Math.abs(z - s.cz) <= s.hz) return key;
    }
    return null;
  }
  function place(x, z) {
    group.position.set(x, 0.17, z);
    group.visible = true;
  }
  function hide() { group.visible = false; }
  function step(dt, bomb) {
    if (bomb.state === 'planted') {
      blink += dt;
      lampMat.color.setHex(Math.floor(blink * 4) % 2 === 0 ? 0xff2a2a : 0x550000);
    }
  }
  return { inSite, place, hide, step };
}
export { PLANT_TIME, DEFUSE_TIME, BOMB_TIME };
