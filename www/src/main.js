// Orkestrasi: boot, loop fixed-step 60 Hz terpisah dari render, ronde + ekonomi,
// tembakan pemain, tembakan bot, granat, bom, dan mode tangkapan layar (?shot=).
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createState, WEAPONS, GRENADE_PRICE, ARMOR_PRICE, ROUND_TIME, BUY_TIME, BOMB_TIME, PLANT_TIME, DEFUSE_TIME, ROUNDS_TO_WIN, MAX_ROUNDS, roundReward } from './state.js';
import { createWorld, SITES, SPAWNS, collide } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons } from './weapons.js';
import { createBots } from './bots.js';
import { createBomb } from './bomb.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;

function mulberry32(a) {
  return function random() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.skyHorizon);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 200);
scene.add(camera);

const world = createWorld(scene);
const hud = createHud();
const audio = createAudio();
const effects = createEffects(scene);
const bombVis = createBomb(scene);
const state = createState();
const player = createPlayer(world.colliders);
const weapons = createWeapons();
const bots = createBots(scene);
const input = createInput(renderer.domElement, onLockChange);

const raycaster = new THREE.Raycaster();
raycaster.far = 130;
const tmpDir = new THREE.Vector3();
const tmpFrom = new THREE.Vector3();
const tmpTo = new THREE.Vector3();
const tmpHit = new THREE.Vector3();

// Hitbox pemain untuk tembakan bot (tak terlihat, mengikuti posisi pemain).
const playerHit = new THREE.Group();
const hitMat = new THREE.MeshBasicMaterial({ visible: false });
const pBody = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.4), hitMat);
pBody.position.y = 1.0;
pBody.userData = { player: true, part: 'body' };
const pHead = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), hitMat);
pHead.position.y = 1.55;
pHead.userData = { player: true, part: 'head' };
playerHit.add(pBody, pHead);
scene.add(playerHit);

const noise = []; // {x,z,r,until} — suara tembakan/ledakan yang didengar bot
const grenades = []; // {pos, vel, t, kind}
const bomb = state.bomb;
let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let elapsed = 0;
let plantKeyT = 0;
let stepCount = 0;
let roundEnding = false;

const body = player.state;

function aliveCount(team) {
  let n = team === 'atk' ? (body.hp > 0 ? 1 : 0) : 0;
  for (const b of bots.bots) if (b.team === team && b.alive) n += 1;
  return n;
}
function los(from, to) {
  tmpDir.set(to.x - from.x, to.y - (from.y + 1.5), to.z - from.z);
  const dist = tmpDir.length();
  if (dist < 0.01) return true;
  tmpDir.normalize();
  tmpFrom.set(from.x, from.y + 1.5, from.z);
  raycaster.set(tmpFrom, tmpDir);
  raycaster.far = dist;
  const hit = raycaster.intersectObjects(world.shootables, false)[0];
  raycaster.far = 130;
  return !hit || hit.distance > dist - 0.4;
}
function addNoise(x, z, r) { noise.push({ x, z, r, until: elapsed + 1.2 }); }

function syncCamera() {
  if (body.hp <= 0 && state.phase === 'play') {
    // Spektator: ikuti bot kawan yang masih hidup.
    const mate = bots.bots.find((b) => b.team === 'atk' && b.alive);
    if (mate) {
      camera.position.set(mate.pos.x, 1.62, mate.pos.z);
      camera.rotation.set(0, mate.yaw, 0, 'YXZ');
      return;
    }
  }
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch + body.recoilPitch, body.yaw, 0, 'YXZ');
}
function syncPlayerHit() {
  playerHit.position.set(body.position.x, body.position.y, body.position.z);
  playerHit.rotation.y = body.yaw;
  playerHit.visible = body.hp > 0;
}

function shootPlayer() {
  const w = weapons.def();
  if (!weapons.takeRound()) { if (weapons.state.mag === 0) audio.dry(); return; }
  audio.shot(w.id);
  audio.unlock();
  const pellets = w.pellets || 1;
  const spread = weapons.spread(player.groundSpeed(), body.crouched);
  const muzzle = tmpFrom.copy(camera.position);
  let hitAny = false;
  for (let p = 0; p < pellets; p += 1) {
    camera.getWorldDirection(tmpDir);
    tmpDir.x += (random() * 2 - 1) * spread;
    tmpDir.y += (random() * 2 - 1) * spread;
    tmpDir.z += (random() * 2 - 1) * spread;
    tmpDir.normalize();
    raycaster.set(camera.position, tmpDir);
    raycaster.far = w.range;
    const targets = world.shootables.concat(bots.hitboxes);
    const hit = raycaster.intersectObjects(targets, false)[0];
    const end = tmpTo.copy(camera.position).addScaledVector(tmpDir, hit ? hit.distance : w.range);
    effects.tracer(muzzle, end);
    if (hit) {
      hitAny = true;
      tmpHit.copy(hit.point);
      if (hit.object.userData.bot) {
        const bot = hit.object.userData.bot;
        const isHead = hit.object.userData.part === 'head';
        const dmg = Math.round(w.damage * (isHead ? w.headMul : 1));
        const killed = bots.damage(bot, dmg, isHead);
        hud.hitMarker(killed);
        if (killed) {
          audio.kill();
          state.kills += 1;
          state.money += 300;
          hud.feed(`Kamu menghabisi ${bot.name} (+$300)`, true);
          if (bot.carrier) { bot.carrier = false; }
          if (bot.team === 'def' && bomb.state === 'planted') { /* defuse tetap jalan */ }
        } else audio.hit();
        effects.spark(tmpHit, 4);
      } else {
        effects.spark(tmpHit, 5);
      }
    }
  }
  effects.muzzle(camera);
  player.recoil(w.recoil, (random() * 2 - 1) * w.recoil * 0.4);
  addNoise(body.position.x, body.position.z, 26);
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.state.reloading);
  hud.setSpread(6 + weapons.spread(player.groundSpeed(), body.crouched) * 900);
}

// Tembakan bot: raycast dengan galat sudut (makin jauh & makin bergerak makin meleset).
function botShoot(bot, enemy, dist) {
  const from = tmpFrom.set(bot.pos.x, bot.pos.y + 1.45, bot.pos.z);
  const moving = bot.state === 'move' || bot.state === 'rotate';
  const err = 0.018 + dist * 0.0011 + (moving ? 0.02 : 0);
  tmpDir.set(enemy.pos.x - from.x, enemy.pos.y - from.y, enemy.pos.z - from.z).normalize();
  tmpDir.x += (random() * 2 - 1) * err;
  tmpDir.y += (random() * 2 - 1) * err;
  tmpDir.z += (random() * 2 - 1) * err;
  tmpDir.normalize();
  raycaster.set(from, tmpDir);
  raycaster.far = 90;
  const targets = world.shootables.concat(bots.hitboxes).concat([pBody, pHead]);
  const hit = raycaster.intersectObjects(targets, false)[0];
  const end = tmpTo.copy(from).addScaledVector(tmpDir, hit ? hit.distance : 60);
  effects.tracer(from, end);
  audio.enemyShot(dist);
  if (hit && hit.object.userData) {
    if (hit.object.userData.player && body.hp > 0 && bot.team === 'def') {
      // Hanya tembakan Serigala yang melukai pemain (tanpa friendly fire dari Elang).
      const isHead = hit.object.userData.part === 'head';
      const dead = player.damage(isHead ? 22 : 11);
      hud.damageFlash();
      audio.hurt();
      hud.setHp(body.hp, body.armor);
      if (dead) onPlayerDeath();
    } else if (hit.object.userData.bot) {
      const target = hit.object.userData.bot;
      if (target.team !== bot.team) {
        const isHead = hit.object.userData.part === 'head';
        const killed = bots.damage(target, isHead ? 22 : 11, isHead);
        if (killed) hud.feed(`${bot.name} menghabisi ${target.name}`, bot.team === 'atk');
        effects.spark(hit.point, 4);
      }
    } else {
      effects.spark(hit.point, 3);
    }
  }
  addNoise(bot.pos.x, bot.pos.z, 24);
}

function throwGrenade(kind) {
  if (weapons.grenades[kind] <= 0) return;
  weapons.grenades[kind] -= 1;
  camera.getWorldDirection(tmpDir);
  const pos = new THREE.Vector3(camera.position.x, camera.position.y - 0.1, camera.position.z);
  const vel = tmpDir.clone().multiplyScalar(16);
  vel.y += 3.5;
  grenades.push({ pos, vel, t: kind === 'frag' ? 1.6 : 0.1, kind });
  audio.shot('p9');
}
function explodeGrenade(g) {
  const p = g.pos;
  if (g.kind === 'frag') {
    effects.explosion(p);
    audio.explosion();
    addNoise(p.x, p.z, 40);
    const victims = [];
    if (body.hp > 0) victims.push({ pos: body.position, player: true });
    for (const b of bots.bots) if (b.alive) victims.push({ pos: b.pos, bot: b });
    for (const v of victims) {
      const d = Math.hypot(v.pos.x - p.x, v.pos.z - p.z) + Math.abs((v.pos.y || 0) - p.y) * 0.5;
      if (d < 7) {
        const dmg = Math.round(95 * (1 - d / 7) + 10);
        if (v.player) {
          const dead = player.damage(dmg);
          hud.damageFlash(); hud.setHp(body.hp, body.armor);
          if (dead) onPlayerDeath();
        } else {
          const killed = bots.damage(v.bot, dmg, false);
          if (killed) { state.kills += 1; state.money += 300; hud.feed(`Granatmu menghabisi ${v.bot.name} (+$300)`, true); }
        }
      }
    }
  } else {
    effects.smoke(p);
    addNoise(p.x, p.z, 10);
  }
}

function onPlayerDeath() {
  state.deaths += 1;
  hud.feed('Kamu gugur!', false);
  hud.showOverlay('dead');
  // Serahkan bom ke bot kawan terdekat bila pemain pembawa bom.
  if (bomb.state === 'carry') {
    const mate = bots.bots.find((b) => b.team === 'atk' && b.alive);
    if (mate) { mate.carrier = true; }
    else bomb.state = 'lost';
  }
  input.unlock();
}

function startRound() {
  roundEnding = false;
  state.phase = 'buy';
  state.timer = BUY_TIME;
  bomb.state = 'carry'; bomb.site = null; bomb.timer = 0; bomb.progress = 0; bomb.defuser = null; bomb.planter = null;
  bombVis.hide();
  grenades.length = 0;
  noise.length = 0;
  player.reset(SPAWNS.atk[0][0], SPAWNS.atk[0][1], -Math.PI / 2);
  weapons.refill();
  weapons.select('p9');
  if (weapons.owned.kr7) weapons.select('kr7');
  bots.reset(state.round);
  hud.setHp(100, 0);
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, false);
  hud.setWeapon(weapons.def().name);
  hud.setScore(state.score.atk, state.score.def, state.round);
  hud.setMoney(state.money);
  hud.setTimer(state.timer, 'buy');
  hud.setBomb('none', 0, 1);
  hud.banner(`Ronde ${state.round}`, 'Fase beli — tekan B untuk toko, lalu bertarung.');
  audio.round();
}

function beginPlay() {
  state.phase = 'play';
  state.timer = ROUND_TIME;
  hud.hideBuy();
  hud.hideOverlay();
  hud.banner('Ronde dimulai!', 'Tanam bom di Site A / B atau habisi semua Serigala.');
  if (!shot) input.requestLock();
}

function endRound(winner, reason) {
  if (roundEnding) return;
  roundEnding = true;
  state.phase = 'roundEnd';
  const won = winner === 'atk';
  state.score[winner] += 1;
  if (won) { state.money += roundReward(true, 0); state.lossStreak = 0; }
  else { state.money += roundReward(false, state.lossStreak); state.lossStreak += 1; }
  hud.setScore(state.score.atk, state.score.def, state.round);
  hud.setMoney(state.money);
  hud.banner(won ? 'RONDE DIMENANGKAN!' : 'RONDE KALAH', reason, 3200);
  hud.feed(`${won ? 'Elang menang' : 'Serigala menang'} — ${reason}`, won);
  audio.round();
  input.unlock();
  setTimeout(() => {
    if (state.phase !== 'roundEnd') return; // pemain sudah klik "Ronde berikutnya" duluan
    if (state.score.atk >= ROUNDS_TO_WIN || state.score.def >= ROUNDS_TO_WIN || state.round >= MAX_ROUNDS) {
      endMatch();
      return;
    }
    state.round += 1;
    startRound();
    if (!shot) hud.showOverlay('end', { title: won ? 'Ronde dimenangkan!' : 'Ronde kalah', sub: `${reason} — hadiah $${roundReward(won, state.lossStreak).toLocaleString('en-US')}. Klik untuk ronde ${state.round}.` });
  }, shot ? 400 : 3200);
}

function endMatch() {
  state.phase = 'matchEnd';
  const won = state.score.atk > state.score.def;
  state.matchWinner = won ? 'atk' : 'def';
  hud.showOverlay('match', {
    title: won ? 'ELANG MENANG!' : 'SERIGALA MENANG',
    sub: `Skor akhir ${state.score.atk}–${state.score.def}. ${state.kills} kill, ${state.deaths} gugur. Klik untuk main lagi.`,
  });
  input.unlock();
}

function buyItem(id) {
  const price = id === 'armor' ? ARMOR_PRICE : id === 'frag' || id === 'smoke' ? GRENADE_PRICE[id] : WEAPONS[id].price;
  if (state.money < price) { hud.feed('Uang tidak cukup!', false); return; }
  if (id === 'armor') {
    body.armor = 100;
  } else if (id === 'frag' || id === 'smoke') {
    weapons.grenades[id] += 1;
  } else {
    weapons.buy(id);
    weapons.select(id);
  }
  state.money -= price;
  hud.setMoney(state.money);
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, false);
  hud.setWeapon(weapons.def().name);
  hud.setHp(body.hp, body.armor);
  hud.showBuy(state.money, weapons.owned, weapons.grenades, buyItem);
  audio.plant();
}

function checkRoundEnd() {
  if (state.phase !== 'play' || roundEnding) return;
  const atkAlive = aliveCount('atk');
  const defAlive = aliveCount('def');
  if (bomb.state === 'planted' && bomb.timer <= 0) { endRound('atk', 'Bom meledak di Site ' + bomb.site + '!'); return; }
  if (defAlive === 0) { endRound('atk', 'Semua Serigala dihabisi.'); return; }
  if (atkAlive === 0 && bomb.state !== 'planted') { endRound('def', 'Semua Elang gugur.'); return; }
  if (atkAlive === 0 && bomb.state === 'planted' && !bomb.defuser) { /* bom jalan terus */ }
  if (state.timer <= 0 && bomb.state !== 'planted') { endRound('def', 'Waktu habis — bom tak tertanam.'); }
}

// --- Plant / defuse ---
function plantStep(dt) {
  const keys = input.state.keys;
  const site = bomb.state === 'carry' ? bombVis.inSite(body.position.x, body.position.z) : null;
  if (state.phase === 'play' && body.hp > 0 && bomb.state === 'carry' && site && keys.has('KeyE')) {
    plantKeyT += dt;
    bomb.progress = plantKeyT / PLANT_TIME;
    hud.setBomb('planting', bomb.progress, 1);
    if (plantKeyT >= PLANT_TIME) {
      bomb.state = 'planted'; bomb.site = site; bomb.timer = BOMB_TIME;
      bombVis.place(body.position.x, body.position.z);
      state.plants += 1; state.money += 300;
      hud.setMoney(state.money);
      hud.banner('BOM DITANAM!', `Site ${site} — 35 detik menuju ledakan. Bertahan!`);
      hud.feed(`Bom ditanam di Site ${site} (+$300)`, true);
      audio.plant();
      plantKeyT = 0;
    }
  } else {
    if (plantKeyT > 0) hud.setBomb('none', 0, 1);
    plantKeyT = 0;
  }
  // Bot kawan pembawa bom menanam bila pemain gugur.
  if (bomb.state === 'carry' && body.hp <= 0) {
    const carrier = bots.bots.find((b) => b.team === 'atk' && b.alive && b.carrier);
    if (carrier) {
      const site = bombVis.inSite(carrier.pos.x, carrier.pos.z);
      if (site) {
        carrier.channel = carrier.channel || { kind: 'plant', t: 0 };
        carrier.channel.t += dt;
        if (carrier.channel.t >= PLANT_TIME) {
          bomb.state = 'planted'; bomb.site = site; bomb.timer = BOMB_TIME;
          bombVis.place(carrier.pos.x, carrier.pos.z);
          carrier.channel = null; carrier.carrier = false;
          hud.banner('BOM DITANAM!', `Site ${site} — kawanmu menanam bom.`);
        }
      } else {
        carrier.channel = null;
      }
    }
  }
  // Bot Serigala menjinakkan bom yang tertanam.
  if (bomb.state === 'planted') {
    const defuser = bots.bots.find((b) => b.team === 'def' && b.alive);
    if (defuser) {
      const bx = bomb.site ? SITES[bomb.site].cx : 0;
      const bz = bomb.site ? SITES[bomb.site].cz : 0;
      const dist = Math.hypot(defuser.pos.x - bx, defuser.pos.z - bz);
      if (dist < 3) {
        defuser.channel = defuser.channel || { kind: 'defuse', t: 0 };
        defuser.channel.t += dt;
        bomb.progress = defuser.channel.t / DEFUSE_TIME;
        bomb.defuser = defuser;
        hud.setBomb('defusing', bomb.progress, 1);
        if (defuser.channel.t >= DEFUSE_TIME) {
          bomb.state = 'defused';
          bombVis.hide();
          hud.feed(`${defuser.name} menjinakkan bom!`, false);
          endRound('def', 'Bom berhasil dijinakkan.');
        }
      } else if (defuser.channel) {
        defuser.channel = null; bomb.defuser = null;
      }
      // Rotasi: bot bertahan bergerak menuju site bom.
      if (dist > 3 && defuser.state !== 'engage') {
        defuser.state = 'rotate';
        defuser.hear = { x: bx, z: bz };
      }
    }
  }
}

function step(dt) {
  elapsed += dt;
  stepCount += 1;
  if (state.phase === 'buy') {
    state.timer -= dt;
    player.step(dt, input.state.keys);
    if (state.timer <= 0) beginPlay();
  } else if (state.phase === 'play') {
    state.timer -= dt;
    player.step(dt, input.state.keys);
    weapons.step(dt);
    // Granat
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.t -= dt;
      g.vel.y -= 14 * dt;
      g.pos.addScaledVector(g.vel, dt);
      if (g.pos.y < 0.1) { g.pos.y = 0.1; g.vel.multiplyScalar(0.4); g.vel.y = Math.abs(g.vel.y) * 0.3; }
      if (g.t <= 0) { explodeGrenade(g); grenades.splice(i, 1); }
    }
    // Bot
    const ctx = {
      dt, time: elapsed, colliders: world.colliders,
      player: { alive: body.hp > 0, pos: body.position, eyePos: { x: body.position.x, y: body.position.y + body.eye, z: body.position.z } },
      friendlies: bots.bots.filter((b) => b.team === 'atk'),
      enemies: bots.bots.filter((b) => b.team === 'def'),
      los, shoot: botShoot, noise, bombSite: bomb.site,
    };
    for (const b of bots.bots) bots.step(b, ctx);
    // Bom
    if (bomb.state === 'planted') {
      bomb.timer -= dt;
      hud.setBomb('planted', Math.max(0, bomb.timer), BOMB_TIME);
      if (Math.ceil(bomb.timer) !== Math.ceil(bomb.timer + dt) && bomb.timer < 6) audio.beep();
    }
    bombVis.step(dt, bomb);
    plantStep(dt);
    // Bersihkan noise lama
    for (let i = noise.length - 1; i >= 0; i -= 1) if (elapsed > noise[i].until) noise.splice(i, 1);
    effects.step(dt);
    checkRoundEnd();
  } else {
    effects.step(dt);
    bombVis.step(dt, bomb);
  }
  syncCamera();
  syncPlayerHit();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (input.state.locked) player.look(look.x, look.y);
    if (state.phase === 'play' && body.hp > 0) {
      if (input.state.firing && weapons.ready()) shootPlayer();
      if (input.consume('KeyR')) { if (weapons.reload()) audio.reload(); }
      if (input.consume('Digit1')) { weapons.select('p9'); hud.setWeapon(weapons.def().name); hud.setAmmo(weapons.state.mag, weapons.state.reserve, false); }
      if (input.consume('Digit2')) { if (weapons.select('kr7')) { hud.setWeapon(weapons.def().name); hud.setAmmo(weapons.state.mag, weapons.state.reserve, false); } }
      if (input.consume('Digit3')) { if (weapons.select('sg12')) { hud.setWeapon(weapons.def().name); hud.setAmmo(weapons.state.mag, weapons.state.reserve, false); } }
      if (input.consume('Digit4')) { if (weapons.select('sr9')) { hud.setWeapon(weapons.def().name); hud.setAmmo(weapons.state.mag, weapons.state.reserve, false); } }
      if (input.consume('KeyG')) throwGrenade('frag');
      if (input.consume('Digit5')) throwGrenade('smoke');
    }
    if (input.consume('KeyB') && (state.phase === 'buy' || state.phase === 'play')) {
      if (hud.isBuyOpen()) hud.hideBuy();
      else hud.showBuy(state.money, weapons.owned, weapons.grenades, buyItem);
    }
    if (input.consume('KeyM')) { state.muted = !state.muted; audio.setEnabled(!state.muted); }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) { step(FIXED_STEP); accumulator -= FIXED_STEP; steps += 1; }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    // HUD per frame (murah: hanya teks berubah)
    if (state.phase === 'play' || state.phase === 'buy') hud.setTimer(state.timer, state.phase);
  }
  renderer.render(scene, camera);
}

function onLockChange(locked) {
  if (shot) return;
  audio.unlock();
  if (locked) {
    started = true;
    hud.hideOverlay();
    if (state.phase === 'menu') { startMatch(); }
    else if (state.phase === 'roundEnd') { startRound(); }
    else if (state.phase === 'matchEnd') { startMatch(); }
  } else if (started && state.phase !== 'menu' && !hud.isBuyOpen()) {
    if (body.hp <= 0) hud.showOverlay('dead');
    else hud.showOverlay('paused');
  }
}

function startMatch() {
  state.round = 1;
  state.score = { atk: 0, def: 0 };
  state.money = 800;
  state.kills = 0; state.deaths = 0; state.lossStreak = 0;
  weapons.owned.kr7 = false; weapons.owned.sg12 = false; weapons.owned.sr9 = false;
  weapons.grenades.frag = 0; weapons.grenades.smoke = 0;
  startRound();
}

hud.onPlay(() => {
  audio.unlock();
  if (shot) return;
  if (state.phase === 'menu') { startMatch(); input.requestLock(); }
  else if (state.phase === 'roundEnd') { startRound(); input.requestLock(); }
  else if (state.phase === 'matchEnd') { startMatch(); input.requestLock(); }
  else input.requestLock();
});

function settle(n) { for (let i = 0; i < n; i += 1) step(FIXED_STEP); }
function aimAt(x, y, z) {
  const dx = x - body.position.x;
  const dy = y - (body.position.y + body.eye);
  const dz = z - body.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}
function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) { window.__shotReady = true; frozen = true; }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  if (name === 'start') {
    body.position.set(-26, 0, 6);
    body.yaw = -Math.PI / 2.6;
    body.pitch = 0.02;
    startMatch();
    state.phase = 'menu';
    settle(30);
    syncCamera();
    hud.showOverlay('start');
    paintTwiceThenReady();
    return;
  }
  startMatch();
  state.phase = 'play';
  state.timer = ROUND_TIME;
  if (name === 'play') {
    // Pertarungan mid: pemain di tengah, musuh terlihat di depan, satu tembakan dilepas.
    body.position.set(-4, 0, 0);
    body.yaw = -Math.PI / 2;
    settle(10);
    const target = bots.bots.find((b) => b.team === 'def' && b.alive);
    if (target) {
      target.pos.set(10, 0, -2);
      target.state = 'hold';
      aimAt(target.pos.x, 1.4, target.pos.z);
      shootPlayer();
      settle(6);
      aimAt(target.pos.x, 1.4, target.pos.z);
    }
    hud.setScore(0, 0, 1);
    hud.setTimer(87, 'play');
    hud.hideBanner();
  } else {
    // end: bom ditanam di Site B, banner menang, asap granat.
    body.position.set(10, 0, 10);
    body.yaw = -Math.PI / 2.2;
    bomb.state = 'planted'; bomb.site = 'B'; bomb.timer = 18;
    bombVis.place(16, 15);
    state.score.atk = 1;
    hud.setScore(1, 0, 1);
    hud.setTimer(18, 'play');
    hud.banner('BOM DITANAM!', 'Site B — 18 detik menuju ledakan.', 60000);
    effects.smoke(new THREE.Vector3(20, 1, 18));
    settle(20);
  }
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, false);
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
if (shot) runShot(shot);
else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
