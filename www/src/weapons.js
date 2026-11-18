// Senjata: 4 senjata + 2 granat. Spread membesar saat bergerak/menembak, recoil menendang
// bidikan ke atas — berhenti dan membidik selalu lebih akurat daripada berlari sambil menembak.
import { WEAPONS } from './state.js';

export function createWeapons() {
  const owned = { p9: true, kr7: false, sg12: false, sr9: false };
  const ammo = {};
  for (const id of Object.keys(WEAPONS)) ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
  const grenades = { frag: 0, smoke: 0 };
  const state = {
    current: 'p9',
    mag: WEAPONS.p9.mag,
    reserve: WEAPONS.p9.reserve,
    reloading: false,
    reloadT: 0,
    cooldown: 0,
    spreadBloom: 0,
    lastShot: -10,
  };

  function def() { return WEAPONS[state.current]; }
  function sync() {
    const a = ammo[state.current];
    state.mag = a.mag;
    state.reserve = a.reserve;
  }
  function buy(id) {
    if (owned[id]) return true;
    owned[id] = true;
    sync();
    return true;
  }
  function select(id) {
    if (!owned[id]) return false;
    if (state.current === id) return true;
    state.current = id;
    state.reloading = false;
    state.reloadT = 0;
    sync();
    return true;
  }
  function refill() {
    for (const id of Object.keys(WEAPONS)) ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
    sync();
  }
  // Spread efektif: dasar + bloom tembakan + penalti gerak + penalti udara/jongkok-negatif.
  function spread(speed, crouched) {
    const d = def();
    let s = d.spread + state.spreadBloom;
    s += (speed / 4.4) * d.moveSpread;
    if (crouched) s *= 0.55;
    return s;
  }
  function ready() { return state.cooldown <= 0 && !state.reloading && state.mag > 0; }
  function takeRound() {
    if (!ready()) return false;
    const d = def();
    ammo[d.id].mag -= 1;
    state.mag = ammo[d.id].mag;
    state.cooldown = d.rate;
    state.spreadBloom = Math.min(0.05, state.spreadBloom + d.recoil * 0.9);
    state.lastShot = performance.now() / 1000;
    return true;
  }
  function reload() {
    const d = def();
    if (state.reloading || state.mag >= d.mag || ammo[d.id].reserve <= 0) return false;
    state.reloading = true;
    state.reloadT = d.reload;
    return true;
  }
  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.spreadBloom = Math.max(0, state.spreadBloom - dt * 0.045);
    if (state.reloading) {
      state.reloadT -= dt;
      if (state.reloadT <= 0) {
        const d = def();
        const need = d.mag - ammo[d.id].mag;
        const take = Math.min(need, ammo[d.id].reserve);
        ammo[d.id].mag += take;
        ammo[d.id].reserve -= take;
        state.reloading = false;
        sync();
      }
    }
  }
  return { state, owned, ammo, grenades, def, sync, buy, select, refill, spread, ready, takeRound, reload, step };
}
