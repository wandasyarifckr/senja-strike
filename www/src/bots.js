// Bot lawan & kawan: figur kapsul tim (Elang amber, Serigala teal) dengan AI state machine:
// patroli rute -> menahan posisi -> menyerang saat melihat musuh -> rotasi saat dengar tembakan /
// bom ditanam -> menanam / menjinakkan bom. Menembak dengan akurasi yang memburuk saat bergerak.
import * as THREE from 'three';
import { WAYPOINTS, SITES, SPAWNS, collide } from './world.js';

const BOT_SPEED = 3.4;
const BOT_HP = 100;
const NAMES_ATK = ['Elang-2', 'Elang-3'];
const NAMES_DEF = ['Serigala-1', 'Serigala-2', 'Serigala-3', 'Serigala-4'];

function makeFigure(team) {
  const g = new THREE.Group();
  const torsoColor = team === 'atk' ? 0xf0a830 : 0x35b5ac;
  const dark = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.85 });
  const torsoMat = new THREE.MeshStandardMaterial({ color: torsoColor, roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.62, 0.32), torsoMat);
  torso.position.y = 1.05;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), dark);
  head.position.y = 1.55;
  head.castShadow = true;
  g.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.05), new THREE.MeshBasicMaterial({ color: team === 'atk' ? 0xffe1a0 : 0xbff5f0 }));
  visor.position.set(0, 1.56, 0.16);
  g.add(visor);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.22), dark);
    leg.position.set(s * 0.14, 0.36, 0);
    g.add(leg);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.14), torsoMat);
    arm.position.set(s * 0.34, 1.05, 0.08);
    g.add(arm);
  }
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.72), new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.4, metalness: 0.7 }));
  gun.position.set(0.22, 1.18, 0.32);
  g.add(gun);
  return g;
}

export function createBots(scene) {
  const bots = [];
  const hitboxes = []; // mesh untuk raycast: userData {bot, part}
  const bodyGeo = new THREE.BoxGeometry(0.6, 1.1, 0.4);
  const headGeo = new THREE.BoxGeometry(0.34, 0.34, 0.34);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });

  function spawn(team, name, x, z) {
    const figure = makeFigure(team);
    figure.position.set(x, 0, z);
    scene.add(figure);
    const body = new THREE.Mesh(bodyGeo, hitMat);
    body.position.y = 1.0;
    body.userData = { bot: null, part: 'body' };
    figure.add(body);
    const head = new THREE.Mesh(headGeo, hitMat);
    head.position.y = 1.55;
    head.userData = { bot: null, part: 'head' };
    figure.add(head);
    const bot = {
      name, team, figure, body, head,
      pos: figure.position,
      yaw: team === 'atk' ? -Math.PI / 2 : Math.PI / 2,
      hp: BOT_HP, alive: true,
      state: 'move', // move | hold | engage | rotate | channel
      wp: 0, holdT: 0, thinkT: 0,
      shootT: 0, burstLeft: 0, burstT: 0,
      target: null, // {x,z} musuh terlihat
      hear: null, // {x,z,until}
      channel: null, // {kind:'plant'|'defuse', t}
      carrier: false,
      strafeDir: 1, strafeT: 0,
      speed: BOT_SPEED,
    };
    body.userData.bot = bot;
    head.userData.bot = bot;
    hitboxes.push(body, head);
    bots.push(bot);
    return bot;
  }

  function reset(round) {
    for (const b of bots) { scene.remove(b.figure); }
    bots.length = 0;
    hitboxes.length = 0;
    // Tim pemain: pemain sendiri + 2 bot kawan (Elang-2, Elang-3).
    SPAWNS.atk.slice(1, 3).forEach(([x, z], i) => {
      const b = spawn('atk', NAMES_ATK[i], x, z);
      b.wp = 1 + i;
    });
    SPAWNS.def.slice(0, 4).forEach(([x, z], i) => {
      const b = spawn('def', NAMES_DEF[i], x, z);
      b.wp = 13 + (i % 3);
      b.state = 'hold';
      b.holdT = 2 + i;
    });
  }

  function nearestWp(x, z) {
    let best = 0; let bd = Infinity;
    for (let i = 0; i < WAYPOINTS.length; i += 1) {
      const d = (WAYPOINTS[i].x - x) ** 2 + (WAYPOINTS[i].z - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  function moveToward(bot, tx, tz, dt, colliders, speedMul = 1) {
    const dx = tx - bot.pos.x;
    const dz = tz - bot.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.4) return true;
    const sp = bot.speed * speedMul;
    bot.pos.x += (dx / d) * sp * dt;
    bot.pos.z += (dz / d) * sp * dt;
    bot.yaw = Math.atan2(dx, dz);
    collide(colliders, bot.pos, 0.35, 1.7);
    return false;
  }

  // Satu langkah AI per bot. ctx: {dt, time, colliders, player, friendlies, los, shoot, noise, bomb, onKill, damage}
  function step(bot, ctx) {
    if (!bot.alive) return;
    const { dt, time } = ctx;
    bot.thinkT -= dt;
    bot.shootT -= dt;
    // Cari musuh: hanya bot Serigala yang memburu pemain; bot Elang memburu Serigala.
    let enemy = null;
    let enemyDist = Infinity;
    if (bot.team === 'def' && ctx.player.alive) {
      const d = Math.hypot(ctx.player.pos.x - bot.pos.x, ctx.player.pos.z - bot.pos.z);
      if (d < 42 && ctx.los(bot.pos, ctx.player.eyePos)) { enemy = { kind: 'player', d, pos: ctx.player.eyePos }; enemyDist = d; }
    }
    if (bot.team === 'def') {
      for (const f of ctx.friendlies) {
        if (!f.alive) continue;
        const d = Math.hypot(f.pos.x - bot.pos.x, f.pos.z - bot.pos.z);
        if (d < enemyDist && d < 38) {
          const eye = { x: f.pos.x, y: 1.5, z: f.pos.z };
          if (ctx.los(bot.pos, eye)) { enemy = { kind: 'bot', bot: f, d, pos: eye }; enemyDist = d; }
        }
      }
    } else {
      for (const e of ctx.enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.pos.x - bot.pos.x, e.pos.z - bot.pos.z);
        if (d < enemyDist && d < 38) {
          const eye = { x: e.pos.x, y: 1.5, z: e.pos.z };
          if (ctx.los(bot.pos, eye)) { enemy = { kind: 'bot', bot: e, d, pos: eye }; enemyDist = d; }
        }
      }
    }
    bot.target = enemy;

    // Reaksi suara: tembakan dekat -> rotasi ke sumber suara.
    if (ctx.noise.length) {
      for (const n of ctx.noise) {
        const d = Math.hypot(n.x - bot.pos.x, n.z - bot.pos.z);
        if (d < n.r && time < n.until && bot.state !== 'engage' && !bot.channel) {
          bot.hear = { x: n.x, z: n.z };
          if (bot.state === 'hold') bot.state = 'rotate';
        }
      }
    }

    if (bot.channel) {
      // Menanam/menjinakkan: diam, progres jalan di main.js.
      bot.figure.rotation.y = bot.yaw;
      return;
    }

    if (enemy) {
      bot.state = 'engage';
      // Hadap musuh, strafe sesekali, tembak burst.
      bot.yaw = Math.atan2(enemy.pos.x - bot.pos.x, enemy.pos.z - bot.pos.z);
      bot.strafeT -= dt;
      if (bot.strafeT <= 0) { bot.strafeDir *= -1; bot.strafeT = 0.7 + Math.random() * 0.9; }
      if (enemy.d > 9) {
        moveToward(bot, enemy.pos.x, enemy.pos.z, dt, ctx.colliders, 0.55);
      } else {
        bot.pos.x += Math.cos(bot.yaw) * bot.strafeDir * 1.4 * dt;
        bot.pos.z -= Math.sin(bot.yaw) * bot.strafeDir * 1.4 * dt;
        collide(ctx.colliders, bot.pos, 0.35, 1.7);
      }
      if (bot.shootT <= 0) {
        if (bot.burstLeft <= 0) { bot.burstLeft = 3 + Math.floor(Math.random() * 3); bot.shootT = 0.45 + Math.random() * 0.5; }
        else { ctx.shoot(bot, enemy, enemyDist); bot.burstLeft -= 1; bot.shootT = 0.13; }
      }
    } else if (bot.state === 'engage') {
      bot.state = bot.team === 'def' ? 'hold' : 'move';
      bot.holdT = 1.5;
    } else if (bot.state === 'rotate' && bot.hear) {
      if (moveToward(bot, bot.hear.x, bot.hear.z, dt, ctx.colliders)) { bot.state = 'hold'; bot.holdT = 2.5; bot.hear = null; }
    } else if (bot.state === 'hold') {
      bot.holdT -= dt;
      // Sapu pandang kiri-kanan sambil menahan posisi.
      bot.yaw += Math.sin(time * 0.7 + bot.wp) * 0.35 * dt;
      if (bot.holdT <= 0) { bot.state = 'move'; bot.wp = nearestWp(bot.pos.x, bot.pos.z); }
    } else {
      // Bergerak lewat graf waypoint menuju objektif.
      let dest = WAYPOINTS[bot.wp];
      if (bot.team === 'atk') {
        const site = bot.carrier ? (ctx.bombSite || 'A') : 'A';
        const s = SITES[site];
        if (Math.hypot(s.cx - bot.pos.x, s.cz - bot.pos.z) < 6) { dest = { x: s.cx, z: s.cz }; }
      }
      if (moveToward(bot, dest.x, dest.z, dt, ctx.colliders)) {
        const nexts = WAYPOINTS[bot.wp].next;
        bot.wp = nexts[Math.floor(Math.random() * nexts.length)];
        if (Math.random() < 0.3) { bot.state = 'hold'; bot.holdT = 1 + Math.random() * 2; }
      }
    }
    // Animasi jalan sederhana: ayun kaki lewat rotasi figure.
    bot.figure.rotation.y = bot.yaw;
    const moving = bot.state === 'move' || bot.state === 'rotate' || (bot.state === 'engage' && bot.target && bot.target.d > 9);
    bot.figure.position.y = moving ? Math.abs(Math.sin(time * 9 + bot.wp)) * 0.04 : 0;
  }

  function damage(bot, amount, isHead) {
    if (!bot.alive) return false;
    bot.hp -= amount;
    if (bot.hp <= 0) {
      bot.alive = false;
      bot.figure.visible = false;
      bot.channel = null;
      return true;
    }
    return false;
  }

  return { bots, hitboxes, spawn, reset, step, damage, nearestWp };
}
