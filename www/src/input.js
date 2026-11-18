// Input: keyboard + mouse + pointer lock (desktop), plus kontrol sentuh (HP).
// State dibaca simulasi tiap fixed step.
// Mode sentuh: tanpa pointer lock — requestLock() memakai "kunci virtual" agar
// look/tembak tetap jalan; unlock() jadi no-op supaya overlay ronde tidak tertimpa
// overlay jeda saat endRound()/endMatch() memanggil unlock().
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = new Set(); // antrean edge keydown: tetap terbaca walau keyup datang sebelum frame berikut
  const look = { x: 0, y: 0 };
  const state = { keys, firing: false, locked: false };
  let locked = false;
  let touchMode = false;
  let touchUI = null;
  let joyBase = null;
  let joyKnob = null;
  let joyId = null;
  let joyOrigin = { x: 0, y: 0 };
  let lookId = null;
  let lookLast = { x: 0, y: 0 };

  function handleLockChange(l) {
    if (touchUI) touchUI.style.display = l && touchMode ? 'block' : 'none';
    onLockChange(l);
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') e.preventDefault();
    keys.add(e.code);
    pressed.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); state.firing = false; });
  document.addEventListener('mousemove', (e) => {
    if (!locked) return;
    look.x += e.movementX;
    look.y += e.movementY;
  });
  canvas.addEventListener('mousedown', (e) => { if (locked && e.button === 0) state.firing = true; });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) state.firing = false; });
  document.addEventListener('pointerlockchange', () => {
    if (touchMode) return; // kunci virtual yang mengatur, bukan pointer lock
    locked = document.pointerLockElement === canvas;
    state.locked = locked;
    if (!locked) state.firing = false;
    handleLockChange(locked);
  });
  document.addEventListener('pointerlockerror', () => { if (!touchMode) handleLockChange(false); });

  // ---- Kontrol sentuh (dibangun sekali, tampil hanya saat main di HP) ----
  function buildTouchUI() {
    touchUI = document.createElement('div');
    touchUI.id = 'touch-ui';
    touchUI.style.display = 'none';
    touchUI.innerHTML =
      '<div id="joy-base"><div id="joy-knob"></div></div>' +
      '<button type="button" id="btn-fire" aria-label="Tembak">TEMBAK</button>' +
      '<button type="button" id="btn-e" aria-label="Tanam atau jinakkan bom">E</button>' +
      '<button type="button" id="btn-r" aria-label="Isi ulang">R</button>' +
      '<button type="button" id="btn-b" aria-label="Toko">B</button>' +
      '<button type="button" id="btn-pause" aria-label="Jeda">II</button>';
    document.body.appendChild(touchUI);
    joyBase = touchUI.querySelector('#joy-base');
    joyKnob = touchUI.querySelector('#joy-knob');

    const bindHold = (el, down, up) => {
      el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); down(); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); up(); }, { passive: false });
      el.addEventListener('touchcancel', (e) => { e.preventDefault(); up(); }, { passive: false });
    };
    const bindTap = (el, code) => {
      el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); pressed.add(code); }, { passive: false });
    };
    bindHold(touchUI.querySelector('#btn-fire'), () => { state.firing = true; }, () => { state.firing = false; });
    bindHold(touchUI.querySelector('#btn-e'), () => { keys.add('KeyE'); }, () => { keys.delete('KeyE'); });
    bindTap(touchUI.querySelector('#btn-r'), 'KeyR');
    bindTap(touchUI.querySelector('#btn-b'), 'KeyB');
    touchUI.querySelector('#btn-pause').addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation(); releaseLock();
    }, { passive: false });
  }

  function enableTouchMode() {
    if (touchMode) return;
    touchMode = true;
    if (!touchUI) buildTouchUI();
    if (locked) touchUI.style.display = 'block';
  }

  function applyJoystick(dx, dy) {
    const nx = Math.max(-1, Math.min(1, dx / 48));
    const ny = Math.max(-1, Math.min(1, dy / 48));
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) keys.delete(code);
    if (ny < -0.3) keys.add('KeyW');
    if (ny > 0.3) keys.add('KeyS');
    if (nx < -0.3) keys.add('KeyA');
    if (nx > 0.3) keys.add('KeyD');
    if (joyKnob) joyKnob.style.transform = `translate(${nx * 34}px, ${ny * 34}px)`;
  }

  function clearJoystick() {
    joyId = null;
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) keys.delete(code);
    if (joyBase) joyBase.style.display = 'none';
    if (joyKnob) joyKnob.style.transform = 'translate(0px, 0px)';
  }

  document.addEventListener('touchstart', (e) => {
    if (e.target.closest('#touch-ui, button, .panel, a, input, select, textarea')) return;
    enableTouchMode();
    for (const t of e.changedTouches) {
      if (t.clientX < window.innerWidth * 0.45 && joyId === null) {
        joyId = t.identifier;
        joyOrigin = { x: t.clientX, y: t.clientY };
        if (joyBase) {
          joyBase.style.display = 'block';
          joyBase.style.left = `${t.clientX - 55}px`;
          joyBase.style.top = `${t.clientY - 55}px`;
        }
        applyJoystick(0, 0);
      } else if (lookId === null) {
        lookId = t.identifier;
        lookLast = { x: t.clientX, y: t.clientY };
      }
    }
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  document.addEventListener('touchmove', (e) => {
    if (!touchMode) return;
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) {
        applyJoystick(t.clientX - joyOrigin.x, t.clientY - joyOrigin.y);
      } else if (t.identifier === lookId) {
        look.x += (t.clientX - lookLast.x) * 2.2;
        look.y += (t.clientY - lookLast.y) * 2.2;
        lookLast = { x: t.clientX, y: t.clientY };
      }
    }
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  const endTouch = (e) => {
    if (!touchMode) return;
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) clearJoystick();
      if (t.identifier === lookId) lookId = null;
    }
  };
  document.addEventListener('touchend', endTouch);
  document.addEventListener('touchcancel', endTouch);

  function releaseLock() {
    if (touchMode) {
      if (!locked) return;
      locked = false;
      state.locked = false;
      state.firing = false;
      keys.clear();
      clearJoystick();
      handleLockChange(false);
      return;
    }
    if (document.pointerLockElement) document.exitPointerLock();
  }

  return {
    state,
    takeLook() {
      const out = { x: look.x, y: look.y };
      look.x = 0; look.y = 0;
      return out;
    },
    requestLock() {
      if (touchMode) {
        if (locked) return;
        locked = true;
        state.locked = true;
        handleLockChange(true);
        return;
      }
      try { canvas.requestPointerLock(); } catch { /* abaikan: headless */ }
    },
    unlock() {
      if (touchMode) return; // di HP, kunci virtual tetap nyala sampai jeda/mati/ronde selesai
      releaseLock();
    },
    consume(code) {
      if (pressed.has(code)) { pressed.delete(code); return true; }
      return false;
    },
  };
}
