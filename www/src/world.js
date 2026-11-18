// Peta orisinal "Pelabuhan Senja": lapangan kontainer di tepi dermaga saat senja.
// Tiga jalur: Utara lewat Gudang (Site A), Tengah lewat lapangan kontainer, Selatan lewat Dermaga (Site B).
// Spawn penyerang (Elang) di barat, bertahan (Serigala) di timur.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Zona bom: [cx, cz, halfX, halfZ]
export const SITES = {
  A: { name: 'Gudang', cx: -14, cz: -15, hx: 9, hz: 6 },
  B: { name: 'Dermaga', cx: 16, cz: 15, hx: 9, hz: 6 },
};
export const SPAWNS = {
  atk: [[-30, -8], [-30, 0], [-30, 8], [-27, -14], [-27, 14]],
  def: [[30, -8], [30, 0], [30, 8], [27, -14], [27, 14]],
};
// Graf rute bot: simpul + tetangga. Bot patroli, menahan posisi, dan rotasi lewat simpul ini.
export const WAYPOINTS = [
  { x: -28, z: 0, next: [1, 2, 3] },
  { x: -18, z: 0, next: [0, 4, 5] },
  { x: -26, z: -14, next: [0, 6, 4] },
  { x: -26, z: 14, next: [0, 7, 5] },
  { x: -8, z: -8, next: [1, 2, 8, 9] },
  { x: -8, z: 8, next: [1, 3, 9, 10] },
  { x: -14, z: -15, next: [2, 4, 8] }, // site A
  { x: -14, z: 15, next: [3, 5, 10] },
  { x: 4, z: -10, next: [4, 6, 11] },
  { x: 4, z: 0, next: [4, 5, 11, 12] }, // mid
  { x: 4, z: 10, next: [5, 7, 12] },
  { x: 16, z: -12, next: [8, 9, 13] },
  { x: 16, z: 12, next: [9, 10, 14] },
  { x: 24, z: -8, next: [11, 15] },
  { x: 24, z: 8, next: [12, 15] },
  { x: 28, z: 0, next: [13, 14, 16] },
  { x: 16, z: -15, next: [15] }, // dekat site A timur
  { x: 16, z: 15, next: [15] }, // site B
];

function mat(color, rough = 0.9, metal = 0.05) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

export function createWorld(scene) {
  const colliders = []; // {minX,maxX,minZ,maxZ,top}
  const shootables = [];
  const group = new THREE.Group();
  scene.add(group);
  const mats = {
    ground: mat(PALETTE.ground, 1),
    line: mat(PALETTE.groundLine, 1),
    concrete: mat(PALETTE.concrete, 0.95),
    concreteDark: mat(PALETTE.concreteDark, 0.95),
    rust: mat(PALETTE.rust, 0.85, 0.25),
    rustDark: mat(PALETTE.rustDark, 0.85, 0.25),
    teal: mat(PALETTE.teal, 0.7, 0.2),
    amber: mat(PALETTE.amber, 0.6, 0.3),
    wood: mat(PALETTE.wood, 0.9),
    metal: mat(PALETTE.metal, 0.5, 0.6),
    metalLight: mat(PALETTE.metalLight, 0.45, 0.6),
  };

  function box(x, y, z, w, h, d, m, solid = true, shoot = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (solid) colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top: y + h });
    if (shoot) shootables.push(mesh);
    return mesh;
  }
  function groundMark(x, z, w, d, m) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), m);
    mesh.position.set(x, 0.011, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  // Tanah + garis lapangan
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(76, 52), mats.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  groundMark(0, 0, 70, 0.3, mats.line);
  groundMark(-14, -15, 18, 0.3, mats.amber); // garis site A
  groundMark(-14, -9, 18, 0.3, mats.amber);
  groundMark(16, 15, 18, 0.3, mats.teal); // garis site B
  groundMark(16, 9, 18, 0.3, mats.teal);

  // Dinding perimeter
  box(0, 0, -26, 76, 4.5, 1, mats.concreteDark);
  box(0, 0, 26, 76, 4.5, 1, mats.concreteDark);
  box(-38, 0, 0, 1, 4.5, 52, mats.concreteDark);
  box(38, 0, 0, 1, 4.5, 52, mats.concreteDark);

  // Gudang Site A (barat laut): bangunan berdinding dengan dua pintu
  box(-23, 0, -15, 1, 5, 12, mats.concrete); // dinding barat gudang
  box(-14, 0, -21, 18, 5, 1, mats.concrete); // dinding utara
  box(-5, 0, -15, 1, 5, 12, mats.concrete); // dinding timur gudang
  box(-19, 0, -9, 4, 5, 1, mats.concrete); // sekat pintu 1
  box(-9, 0, -9, 4, 5, 1, mats.concrete); // sekat pintu 2
  box(-14, 5, -15, 19, 0.4, 13, mats.metal, false); // atap gudang (tak bisa ditembus peluru dari atas)
  box(-14, 0, -15, 6, 1.1, 4, mats.wood); // peti besar tengah site A

  // Dermaga Site B (tenggara): tumpukan kontainer
  box(16, 0, 15, 8, 2.6, 2.4, mats.rust);
  box(16, 2.6, 15, 8, 2.6, 2.4, mats.teal);
  box(24, 0, 18, 2.4, 2.6, 8, mats.rustDark);
  box(10, 0, 20, 2.4, 2.6, 4, mats.teal);

  // Kontainer mid + penutup sudut (sightline terpotong, sudut untuk menahan posisi)
  box(-2, 0, -4, 6, 2.6, 2.4, mats.rust);
  box(2, 0, 5, 2.4, 2.6, 6, mats.teal);
  box(10, 0, -6, 6, 2.6, 2.4, mats.rustDark);
  box(-10, 0, 6, 2.4, 2.6, 6, mats.rust);
  box(0, 0, -14, 4, 1.2, 2, mats.wood); // peti rendah (bisa ditembak dari atasnya)
  box(0, 0, 14, 4, 1.2, 2, mats.wood);
  box(-20, 0, -2, 2.4, 2.6, 6, mats.teal);
  box(20, 0, 2, 2.4, 2.6, 6, mats.rust);
  box(28, 0, -14, 6, 2.6, 2.4, mats.rust);
  box(28, 0, 14, 6, 2.6, 2.4, mats.teal);

  // Tiang lampu + lampu sorot (pencahayaan senja: matahari rendah + lampu dermaga)
  const sun = new THREE.DirectionalLight(0xffb36b, 3.2);
  sun.position.set(-30, 22, -18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 35; sun.shadow.camera.bottom = -35;
  sun.shadow.camera.far = 120;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x9a8ab0, 0x4a4038, 1.5));
  const lampA = new THREE.PointLight(0xffc06a, 30, 26, 1.8);
  lampA.position.set(-14, 5.5, -15);
  scene.add(lampA);
  const lampB = new THREE.PointLight(0x66d8cf, 26, 26, 1.8);
  lampB.position.set(16, 5.5, 15);
  scene.add(lampB);
  // Tiang lampu (visual saja, collider tipis)
  box(-14, 0, -21.4, 0.3, 5.5, 0.3, mats.metal);
  box(16, 0, 20.4, 0.3, 5.5, 0.3, mats.metal);

  // Langit senja: gradien kanvas sebagai background equirect (tanpa shader kustom).
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 1024; skyCanvas.height = 512;
  const sg = skyCanvas.getContext('2d');
  const grad = sg.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#2b3a55');
  grad.addColorStop(0.42, '#7a5a72');
  grad.addColorStop(0.52, '#e08a3c');
  grad.addColorStop(0.62, '#3a3f4a');
  grad.addColorStop(1, '#232326');
  sg.fillStyle = grad;
  sg.fillRect(0, 0, 1024, 512);
  // Matahari senja rendah di barat.
  const sunGlow = sg.createRadialGradient(200, 265, 4, 200, 265, 120);
  sunGlow.addColorStop(0, 'rgba(255,214,140,0.95)');
  sunGlow.addColorStop(0.25, 'rgba(255,170,90,0.45)');
  sunGlow.addColorStop(1, 'rgba(255,170,90,0)');
  sg.fillStyle = sunGlow;
  sg.fillRect(0, 0, 1024, 512);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.mapping = THREE.EquirectangularReflectionMapping;
  skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;
  scene.fog = new THREE.Fog(new THREE.Color(0x5a5166), 40, 120);

  // Penanda site: papan huruf A / B mengambang (canvas texture, tanpa aset luar)
  function siteSign(text, x, z, color) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#14161a'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = color; g.lineWidth = 8; g.strokeRect(6, 6, 116, 116);
    g.fillStyle = color; g.font = 'bold 84px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 64, 70);
    const tex = new THREE.CanvasTexture(c);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    mesh.position.set(x, 4.2, z);
    mesh.rotation.y = text === 'A' ? Math.PI / 2 : -Math.PI / 2;
    group.add(mesh);
  }
  siteSign('A', -4.4, -15, '#f0a830');
  siteSign('B', 24.4, 15, '#35b5ac');

  return { colliders, shootables, group };
}

// Tabrakan AABB: geser posisi (px,pz) agar kotak berjari-jari r tidak menembus collider.
export function collide(colliders, pos, r, height) {
  for (let i = 0; i < colliders.length; i += 1) {
    const c = colliders[i];
    if (c.top <= 0.05) continue;
    if (pos.y >= c.top - 0.05) continue; // sudah di atas peti rendah? (peti rendah top 1.2, pemain tak naik)
    if (pos.x + r > c.minX && pos.x - r < c.maxX && pos.z + r > c.minZ && pos.z - r < c.maxZ) {
      const dxl = pos.x + r - c.minX;
      const dxr = c.maxX - (pos.x - r);
      const dzl = pos.z + r - c.minZ;
      const dzr = c.maxZ - (pos.z - r);
      const m = Math.min(dxl, dxr, dzl, dzr);
      if (m === dxl) pos.x = c.minX - r;
      else if (m === dxr) pos.x = c.maxX + r;
      else if (m === dzl) pos.z = c.minZ - r;
      else pos.z = c.maxZ + r;
    }
  }
  // Batas arena
  pos.x = Math.max(-37 + r, Math.min(37 - r, pos.x));
  pos.z = Math.max(-25 + r, Math.min(25 - r, pos.z));
}
