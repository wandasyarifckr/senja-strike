// HUD DOM: health, armor, amunisi, timer ronde, skor, uang, killfeed, banner, buy menu, overlay.
import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './state.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    hp: $('hp'), armor: $('armor'), hpBar: $('hp-bar'),
    mag: $('ammo-mag'), reserve: $('ammo-reserve'), ammoBox: $('ammo'),
    weaponName: $('weapon-name'),
    timer: $('timer'), roundLabel: $('round-label'),
    scoreAtk: $('score-atk'), scoreDef: $('score-def'),
    money: $('money'), killfeed: $('killfeed'),
    crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    overlay: $('overlay'), overlayTitle: $('overlay-title'), overlayCopy: $('overlay-copy'),
    play: $('play'), buy: $('buy'), buyMoney: $('buy-money'), buyItems: $('buy-items'),
    bombBar: $('bomb-bar'), bombFill: $('bomb-fill'), bombLabel: $('bomb-label'),
    damage: $('damage'), reloadHint: $('reload-hint'),
  };
  let hitT = null;
  let bannerT = null;

  function setHp(hp, armor) {
    els.hp.textContent = Math.ceil(hp);
    els.armor.textContent = armor > 0 ? `🛡 ${Math.ceil(armor)}` : '';
    els.hpBar.style.width = `${Math.max(0, hp)}%`;
    els.hpBar.style.background = hp > 50 ? '#35b5ac' : hp > 25 ? '#f0a830' : '#e5484d';
  }
  function setAmmo(mag, reserve, reloading) {
    els.mag.textContent = mag;
    els.reserve.textContent = `/ ${reserve}`;
    els.ammoBox.classList.toggle('empty', mag === 0);
    els.reloadHint.hidden = !reloading;
  }
  function setWeapon(name) { els.weaponName.textContent = name; }
  function setTimer(sec, phase) {
    const s = Math.max(0, Math.ceil(sec));
    els.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    els.timer.style.color = s <= 10 && phase === 'play' ? '#e5484d' : '#e9e6df';
    els.roundLabel.textContent = phase === 'buy' ? 'FASE BELI — tekan B' : phase === 'play' ? 'RONDE BERJALAN' : '';
  }
  function setScore(a, d, round) {
    els.scoreAtk.textContent = a;
    els.scoreDef.textContent = d;
    $('round-num').textContent = `Ronde ${round}`;
  }
  function setMoney(m) { els.money.textContent = `$${m.toLocaleString('en-US')}`; }
  function setSpread(px) {
    els.crosshair.style.setProperty('--gap', `${px}px`);
  }
  function hitMarker(kill) {
    els.hitmarker.classList.add('on');
    els.hitmarker.style.borderColor = kill ? '#e5484d' : '#f0a830';
    clearTimeout(hitT);
    hitT = setTimeout(() => els.hitmarker.classList.remove('on'), 120);
  }
  function feed(text, good) {
    const div = document.createElement('div');
    div.textContent = text;
    if (good === false) div.style.color = '#e5484d';
    if (good === true) div.style.color = '#35b5ac';
    els.killfeed.prepend(div);
    while (els.killfeed.children.length > 5) els.killfeed.lastChild.remove();
    setTimeout(() => div.remove(), 6000);
  }
  function banner(title, sub, ms = 2600) {
    els.bannerTitle.textContent = title;
    els.bannerSub.textContent = sub;
    els.banner.hidden = false;
    clearTimeout(bannerT);
    bannerT = setTimeout(() => { els.banner.hidden = true; }, ms);
  }
  function hideBanner() { els.banner.hidden = true; clearTimeout(bannerT); }
  function damageFlash() {
    els.damage.style.opacity = '0.55';
    setTimeout(() => { els.damage.style.opacity = '0'; }, 140);
  }
  function showOverlay(kind, data = {}) {
    els.overlay.hidden = false;
    els.buy.hidden = true;
    if (kind === 'start') {
      els.overlayTitle.textContent = 'SENJA STRIKE';
      els.overlayCopy.textContent = 'Taktis 5v5 di Pelabuhan Senja. Tanam Paket Senja di Site A (Gudang) atau Site B (Dermaga), atau habisi semua Serigala. Menang 7 ronde.';
      els.play.textContent = 'Klik untuk main';
    } else if (kind === 'paused') {
      els.overlayTitle.textContent = 'Jeda';
      els.overlayCopy.textContent = 'Klik untuk lanjut. B = toko antar ronde, E = tanam/jinakkan, G = granat.';
      els.play.textContent = 'Lanjutkan';
    } else if (kind === 'dead') {
      els.overlayTitle.textContent = 'Kamu gugur';
      els.overlayCopy.textContent = 'Tim Elang masih bertarung. Tonton sampai ronde selesai.';
      els.play.textContent = 'Tonton ronde';
    } else if (kind === 'end') {
      els.overlayTitle.textContent = data.title || 'Ronde selesai';
      els.overlayCopy.textContent = data.sub || '';
      els.play.textContent = 'Ronde berikutnya';
    } else if (kind === 'match') {
      els.overlayTitle.textContent = data.title || 'Pertandingan selesai';
      els.overlayCopy.textContent = data.sub || '';
      els.play.textContent = 'Main lagi';
    }
  }
  function hideOverlay() { els.overlay.hidden = true; els.buy.hidden = true; }
  function showBuy(money, owned, grenades, onBuy) {
    els.overlay.hidden = true;
    els.buy.hidden = false;
    els.buyMoney.textContent = `$${money.toLocaleString('en-US')}`;
    els.buyItems.innerHTML = '';
    const items = [
      ...Object.values(WEAPONS).map((w) => ({ id: w.id, name: w.name, price: w.price, desc: owned[w.id] ? 'Dimiliki' : `${w.mag} peluru/mag`, owned: owned[w.id] })),
      { id: 'armor', name: 'Rompi Anti Peluru', price: ARMOR_PRICE, desc: 'Serap 50% damage', owned: false },
      { id: 'frag', name: 'Granat Ledak (G)', price: GRENADE_PRICE.frag, desc: `Punya: ${grenades.frag}`, owned: false },
      { id: 'smoke', name: 'Granat Asap (5)', price: GRENADE_PRICE.smoke, desc: `Punya: ${grenades.smoke}`, owned: false },
    ];
    for (const it of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'buy-item';
      b.disabled = it.owned || money < it.price;
      b.innerHTML = `<b>${it.name}</b><span>${it.desc}</span><i>$${it.price}</i>`;
      b.addEventListener('click', () => onBuy(it.id));
      els.buyItems.appendChild(b);
    }
  }
  function hideBuy() { els.buy.hidden = true; }
  function setBomb(state, t, total) {
    if (state === 'planted') {
      els.bombBar.hidden = false;
      els.bombLabel.textContent = `💣 BOM MELEDAK ${Math.ceil(t)} dtk`;
      els.bombFill.style.width = `${(t / total) * 100}%`;
    } else if (state === 'planting' || state === 'defusing') {
      els.bombBar.hidden = false;
      els.bombLabel.textContent = state === 'planting' ? 'Menanam bom…' : 'Menjinakkan bom…';
      els.bombFill.style.width = `${t * 100}%`;
    } else {
      els.bombBar.hidden = true;
    }
  }
  function onPlay(fn) { els.play.addEventListener('click', fn); }
  function isBuyOpen() { return !els.buy.hidden; }
  return {
    setHp, setAmmo, setWeapon, setTimer, setScore, setMoney, setSpread, hitMarker, feed,
    banner, hideBanner, damageFlash, showOverlay, hideOverlay, showBuy, hideBuy, setBomb, onPlay, isBuyOpen,
  };
}
