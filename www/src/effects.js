// Efek visual tanpa alokasi per frame: tracer, kilat moncong, percik, asap, ledakan.
// Semua pool dipakai ulang; tiap efek punya umur dan dikembalikan ke pool saat habis.
import * as THREE from 'three';

const MAX_TRACERS = 24;
const MAX_SPARKS = 40;

export function createEffects(scene) {
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9 });
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, tracerMat.clone());
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  const sparkGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc46b });
  const sparks = [];
  for (let i = 0; i < MAX_SPARKS; i += 1) {
    const m = new THREE.Mesh(sparkGeo, sparkMat);
    m.visible = false;
    scene.add(m);
    sparks.push({ mesh: m, life: 0, vel: new THREE.Vector3() });
  }
  // Kilat moncong: satu sprite di ujung senjata (milik kamera).
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), flashMat);
  flash.position.set(0.28, -0.22, -0.9);
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0x9aa0a8, transparent: true, opacity: 0.55 });
  const smokes = [];
  for (let i = 0; i < 6; i += 1) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8), smokeMat.clone());
    s.visible = false;
    scene.add(s);
    smokes.push({ mesh: s, life: 0 });
  }
  const boomLight = new THREE.PointLight(0xff8a3c, 0, 30, 1.5);
  scene.add(boomLight);

  let ti = 0;
  let si = 0;
  function tracer(from, to) {
    const t = tracers[ti]; ti = (ti + 1) % MAX_TRACERS;
    const p = t.line.geometry.attributes.position.array;
    p[0] = from.x; p[1] = from.y; p[2] = from.z;
    p[3] = to.x; p[4] = to.y; p[5] = to.z;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.visible = true;
    t.life = 0.07;
  }
  function spark(point, n = 6) {
    for (let k = 0; k < n; k += 1) {
      const s = sparks[si]; si = (si + 1) % MAX_SPARKS;
      s.mesh.position.copy(point);
      s.vel.set((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4);
      s.mesh.visible = true;
      s.life = 0.35;
    }
  }
  function muzzle(camera) {
    if (!flash.parent) camera.add(flash);
    flashMat.opacity = 0.95;
    flash.rotation.z = Math.random() * Math.PI;
    flash.scale.setScalar(0.8 + Math.random() * 0.6);
  }
  function smoke(point) {
    for (const s of smokes) {
      if (s.life <= 0) {
        s.mesh.position.copy(point);
        s.mesh.position.y = Math.max(1.2, point.y);
        s.mesh.visible = true;
        s.life = 9;
        return;
      }
    }
  }
  function explosion(point) {
    spark(point, 20);
    boomLight.position.copy(point);
    boomLight.position.y = point.y + 1;
    boomLight.intensity = 220;
  }
  function step(dt) {
    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
        if (t.life <= 0) t.line.visible = false;
      }
    }
    for (const s of sparks) {
      if (s.life > 0) {
        s.life -= dt;
        s.mesh.position.addScaledVector(s.vel, dt);
        s.vel.y -= 9 * dt;
        if (s.life <= 0) s.mesh.visible = false;
      }
    }
    for (const s of smokes) {
      if (s.life > 0) {
        s.life -= dt;
        const sc = 1 + (9 - s.life) * 0.35;
        s.mesh.scale.setScalar(sc);
        s.mesh.material.opacity = Math.min(0.55, s.life * 0.08);
        if (s.life <= 0) s.mesh.visible = false;
      }
    }
    if (flashMat.opacity > 0) flashMat.opacity = Math.max(0, flashMat.opacity - dt * 14);
    if (boomLight.intensity > 0) boomLight.intensity = Math.max(0, boomLight.intensity - dt * 400);
  }
  return { tracer, spark, muzzle, smoke, explosion, step };
}
