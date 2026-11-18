// Pemain: gerak berbasis akselerasi + gesekan, jongkok, recoil, tabrakan AABB.
// Kecepatan penuh hanya saat diam/berjalan pelan — spread senjata menghukum gerak (lihat weapons.js).
import * as THREE from 'three';
import { collide } from './world.js';

export const WALK_SPEED = 4.4;
export const CROUCH_SPEED = 2.1;
export const ACCEL = 42;
export const FRICTION = 10;

export function createPlayer(colliders) {
  const state = {
    position: new THREE.Vector3(-30, 0, 0),
    vel: new THREE.Vector3(),
    yaw: -Math.PI / 2, // menghadap timur (ke tengah peta)
    pitch: 0,
    eye: 1.62,
    crouched: false,
    hp: 100,
    armor: 0,
    onGround: true,
    recoilPitch: 0,
  };
  const wish = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();

  function look(dx, dy) {
    state.yaw -= dx * 0.0021;
    state.pitch -= dy * 0.0021;
    state.pitch = Math.max(-1.5, Math.min(1.5, state.pitch));
  }
  function recoil(kick, yawKick) {
    state.recoilPitch += kick;
    state.yaw += yawKick;
  }
  function groundSpeed() {
    return Math.hypot(state.vel.x, state.vel.z);
  }
  function step(dt, keys) {
    const crouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    state.crouched = crouch;
    const speed = crouch ? CROUCH_SPEED : WALK_SPEED;
    forward.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
    right.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
    wish.set(0, 0, 0);
    if (keys.has('KeyW')) wish.add(forward);
    if (keys.has('KeyS')) wish.sub(forward);
    if (keys.has('KeyD')) wish.add(right);
    if (keys.has('KeyA')) wish.sub(right);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);
    // Akselerasi menuju kecepatan yang diinginkan; gesekan saat tak ada input.
    const rate = wish.lengthSq() > 0 ? ACCEL : FRICTION;
    state.vel.x += (wish.x - state.vel.x) * Math.min(1, rate * dt / speed * 4.4);
    state.vel.z += (wish.z - state.vel.z) * Math.min(1, rate * dt / speed * 4.4);
    state.position.x += state.vel.x * dt;
    state.position.z += state.vel.z * dt;
    collide(colliders, state.position, 0.35, state.eye);
    // Pulihkan recoil perlahan; jongkok merendahkan mata.
    state.recoilPitch *= Math.max(0, 1 - 6 * dt);
    const targetEye = crouch ? 1.05 : 1.62;
    state.eye += (targetEye - state.eye) * Math.min(1, 12 * dt);
  }
  function damage(amount) {
    let rest = amount;
    if (state.armor > 0) {
      const absorbed = Math.min(state.armor, rest * 0.5);
      state.armor -= absorbed;
      rest -= absorbed;
    }
    state.hp = Math.max(0, state.hp - rest);
    return state.hp <= 0;
  }
  function reset(x, z, yaw) {
    state.position.set(x, 0, z);
    state.vel.set(0, 0, 0);
    state.yaw = yaw;
    state.pitch = 0;
    state.hp = 100;
    state.armor = 0;
    state.recoilPitch = 0;
  }
  return { state, look, recoil, groundSpeed, step, damage, reset };
}
