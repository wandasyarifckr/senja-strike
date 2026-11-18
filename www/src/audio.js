// Audio prosedural (WebAudio, tanpa file): tembakan, reload, ledakan, langkah, bunyi bom.
// Dibuat saat interaksi pertama; di mode screenshot (tanpa gesture) diam saja.
export function createAudio() {
  let ctx = null;
  let master = null;
  let enabled = true;
  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
      return true;
    } catch { return false; }
  }
  function noiseBuffer(dur) {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }
  function burst(dur, freq, gain, type = 'lowpass') {
    if (!enabled || !ensure()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur);
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur);
  }
  function tone(freq, dur, gain, slideTo = 0) {
    if (!enabled || !ensure()) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur);
  }
  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    setEnabled(v) { enabled = v; },
    shot(kind) {
      if (kind === 'sr9') { burst(0.28, 900, 0.9); tone(160, 0.12, 0.25, 60); }
      else if (kind === 'sg12') { burst(0.22, 700, 0.9); }
      else if (kind === 'p9') { burst(0.09, 1800, 0.5); }
      else { burst(0.12, 1400, 0.65); tone(220, 0.06, 0.15, 90); }
    },
    enemyShot(dist) {
      const g = Math.max(0.08, 0.5 - dist * 0.008);
      burst(0.1, 1200, g);
    },
    reload() { tone(500, 0.05, 0.2); setTimeout(() => tone(700, 0.05, 0.2), 180); },
    dry() { tone(900, 0.03, 0.15); },
    hit() { tone(1200, 0.05, 0.25, 900); },
    kill() { tone(660, 0.09, 0.3, 990); },
    hurt() { burst(0.15, 300, 0.6); },
    step() { burst(0.05, 400, 0.08); },
    plant() { tone(880, 0.1, 0.3); },
    beep() { tone(1100, 0.07, 0.3); },
    explosion() { burst(0.9, 220, 1.0); tone(55, 0.7, 0.5, 30); },
    round() { tone(523, 0.12, 0.25); setTimeout(() => tone(784, 0.18, 0.25), 130); },
  };
}
