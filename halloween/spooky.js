/* ============================================================
   ПУГАЛКИ И ЗВУК
   • Звук целиком синтезируется Web Audio (никаких файлов): гул, ветер,
     музыкальная шкатулка, гром, «бу!», писк летучих мышей, мяу и т. д.
   • Пугалки — отдельный слой поверх сцены, только transform/opacity.
   Всё доступно как window.Spooky.
   ============================================================ */
(() => {
  "use strict";
  const C = window.CONFIG || {};
  const $ = (s, r = document) => r.querySelector(s);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pickOne = a => a[Math.floor(Math.random() * a.length)];
  const params = new URLSearchParams(location.search);
  const STILL = params.has("still");
  const DEBUG = params.has("debug");
  const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const OUT_BACK = "cubic-bezier(.34,1.56,.64,1)", IN = "cubic-bezier(.55,0,.8,.3)";

  // картинки грузим заранее, чтобы пугалка не появилась «пустой»
  ["ghost.png", "ghost.svg", "bat.png", "spider.png", "cat.png", "devil.png", "scream.png", "candy.png", "lollipop.png", "chocolate.png", "pumpkin.png", "vampire.png", "witch.png"]
    .forEach(n => { const i = new Image(); i.decoding = "async"; i.src = "assets/" + n; });

  /* ============================================================
     ЗВУК
     ============================================================ */
  const Snd = (() => {
    let ctx = null, master = null, wet = null, noise = null, started = false, musicTimer = 0;
    let on = C.sound !== false;
    try { const v = localStorage.getItem("hw-sound"); if (v === "0") on = false; else if (v === "1") on = true; } catch (e) {}
    const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
    const LEVEL = 0.9;

    function init() {
      if (ctx) return true;
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
      try { ctx = new AC(); } catch (e) { return false; }
      master = ctx.createGain(); master.gain.value = on ? LEVEL : 0;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
      master.connect(comp); comp.connect(ctx.destination);
      const conv = ctx.createConvolver(); conv.buffer = impulse(3.2, 2.6);
      wet = ctx.createGain(); const wetOut = ctx.createGain(); wetOut.gain.value = 0.5;
      wet.connect(conv); conv.connect(wetOut); wetOut.connect(master);
      noise = makeNoise(3);
      return true;
    }
    function impulse(sec, decay) {
      const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
      return b;
    }
    function makeNoise(sec) {
      const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return b;
    }
    const now = () => ctx.currentTime;
    // выход с отправкой в реверб
    function out(send = 0) {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(master);
      if (send) { const s = ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(wet); }
      return g;
    }
    function osc(type, f) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; }
    function noiseSrc(loop = false) { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = loop; return s; }
    function filt(type, f, q = 1) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
    function env(p, t, a, peak, d) { p.setValueAtTime(0.0001, t); p.exponentialRampToValueAtTime(peak, t + a); p.exponentialRampToValueAtTime(0.0001, t + a + d); }
    function amp(v) { const g = ctx.createGain(); g.gain.value = v; return g; }

    /* ---------- фон: гул, ветер, шкатулка ---------- */
    const MEL_SPOOKY = [81, 0, 76, 0, 81, 84, 83, 0, 80, 0, 76, 0, 77, 76, 75, 76, 0, 0, 0, 0,
      69, 0, 72, 0, 76, 74, 72, 0, 71, 0, 68, 0, 69, 71, 72, 0, 0, 0, 0, 0,
      88, 0, 84, 0, 81, 0, 83, 84, 83, 0, 80, 0, 76, 0, 0, 0, 77, 76, 75, 76, 0, 0, 0, 0, 0, 0, 0, 0];
    const MEL_SWEET = [76, 0, 81, 0, 85, 83, 81, 0, 78, 0, 81, 0, 83, 0, 0, 0,
      74, 0, 78, 0, 83, 81, 78, 0, 76, 0, 80, 0, 81, 0, 0, 0,
      85, 0, 88, 0, 86, 85, 83, 0, 81, 0, 83, 0, 85, 0, 0, 0, 0, 0, 0, 0];
    let mel = MEL_SPOOKY, step = 0, nextNote = 0;
    const BEAT = 0.36;
    function bell(f, t, v = 0.05, dur = 1.8, send = 0.9) {
      const g = out(send);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      [[1, 1], [2.76, 0.22], [5.4, 0.07]].forEach(([k, a]) => { const o = osc("sine", f * k), og = amp(a); o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.05); });
    }
    function tickMusic() {
      if (!ctx || ctx.state !== "running" || !on) return;
      if (nextNote < now() - 0.3) nextNote = now() + 0.1; // вкладка спала — не наверстываем пропущенные ноты
      while (nextNote < now() + 0.3) {
        const m = mel[step % mel.length];
        if (m) bell(mtof(m), nextNote, 0.032);
        step++; nextNote += BEAT;
      }
    }
    function ambient() {
      const t = now();
      // гул
      const dr = out(0.3), lp = filt("lowpass", 320, 0.7); lp.connect(dr);
      dr.gain.setValueAtTime(0, t); dr.gain.linearRampToValueAtTime(0.05, t + 4);
      [[55, "sine", 0.9], [82.41, "sine", 0.5], [110.6, "triangle", 0.22], [164.2, "sine", 0.1]].forEach(([f, ty, v]) => { const o = osc(ty, f), g = amp(v); o.connect(g); g.connect(lp); o.start(); });
      const lfo = osc("sine", 0.06), lg = amp(140); lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
      // ветер
      const wn = noiseSrc(true), bp = filt("bandpass", 520, 0.9), wg = out(0.25);
      wn.connect(bp); bp.connect(wg);
      wg.gain.setValueAtTime(0, t); wg.gain.linearRampToValueAtTime(0.028, t + 6);
      const l2 = osc("sine", 0.045), l2g = amp(330); l2.connect(l2g); l2g.connect(bp.frequency); l2.start();
      const l3 = osc("sine", 0.11), l3g = amp(0.016); l3.connect(l3g); l3g.connect(wg.gain); l3.start();
      wn.start();
      nextNote = now() + 1.2;
      musicTimer = setInterval(tickMusic, 90);
    }

    /* ---------- эффекты ---------- */
    const FX = {
      // нажатие на ответ
      pop() {
        const t = now(), o = osc("sine", 520), g = out(0.25);
        o.frequency.exponentialRampToValueAtTime(980, t + 0.07); env(g.gain, t, 0.005, 0.13, 0.16);
        o.connect(g); o.start(t); o.stop(t + 0.25);
      },
      // свист воздуха
      whoosh(dur = 0.8) {
        const t = now(), s = noiseSrc(), bp = filt("bandpass", 300, 1.4), g = out(0.3);
        s.connect(bp); bp.connect(g);
        bp.frequency.setValueAtTime(260, t); bp.frequency.exponentialRampToValueAtTime(2400, t + dur * 0.45); bp.frequency.exponentialRampToValueAtTime(320, t + dur);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.26, t + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        s.start(t, Math.random()); s.stop(t + dur + 0.05);
      },
      // привидение: «у-у-у»
      ooo() {
        const t = now(), o = osc("sine", 300), o2 = osc("triangle", 450), lp = filt("lowpass", 1200, 0.8), g = out(0.8);
        const vib = osc("sine", 5.5), vg = amp(14); vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
        o.frequency.setValueAtTime(300, t); o.frequency.linearRampToValueAtTime(390, t + 0.35); o.frequency.exponentialRampToValueAtTime(240, t + 1.2);
        o2.frequency.setValueAtTime(450, t); o2.frequency.linearRampToValueAtTime(585, t + 0.35); o2.frequency.exponentialRampToValueAtTime(360, t + 1.2);
        const g2 = amp(0.18); o2.connect(g2); g2.connect(lp); o.connect(lp); lp.connect(g);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.13, t + 0.25); g.gain.setValueAtTime(0.13, t + 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.35);
        [o, o2, vib].forEach(x => { x.start(t); x.stop(t + 1.4); });
      },
      // писк летучих мышей
      squeaks(n = 6, span = 1) {
        for (let i = 0; i < n; i++) {
          const t = now() + Math.random() * span, f = rnd(3200, 5600), o = osc("sine", f), g = out(0.25);
          o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.06);
          env(g.gain, t, 0.004, 0.032, 0.07); o.connect(g); o.start(t); o.stop(t + 0.1);
        }
      },
      // шелест крыльев
      flutter(dur = 1.4) {
        const t = now(), s = noiseSrc(), lp = filt("lowpass", 1400, 0.7), am = amp(0.5), g = out(0.1);
        const lfo = osc("square", 17), lg = amp(0.5); lfo.connect(lg); lg.connect(am.gain);
        s.connect(lp); lp.connect(am); am.connect(g);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        s.start(t, Math.random()); s.stop(t + dur); lfo.start(t); lfo.stop(t + dur);
      },
      // гром: треск и раскат
      thunder(delay = 0.2) {
        const t = now() + delay;
        const c = noiseSrc(), hp = filt("highpass", 1200, 0.7), cg = out(0.4);
        c.connect(hp); hp.connect(cg); env(cg.gain, t, 0.003, 0.3, 0.25); c.start(t, Math.random()); c.stop(t + 0.35);
        const r = noiseSrc(), lp = filt("lowpass", 260, 0.8), rg = out(0.35);
        r.connect(lp); lp.connect(rg);
        const N = 64, curve = new Float32Array(N);
        for (let i = 0; i < N; i++) { const x = i / (N - 1); curve[i] = Math.pow(1 - x, 1.6) * (0.55 + 0.45 * Math.random()) * 0.65 * Math.min(1, x * 12); }
        rg.gain.setValueCurveAtTime(curve, t + 0.05, 3.2);
        lp.frequency.setValueAtTime(260, t); lp.frequency.exponentialRampToValueAtTime(90, t + 3.2);
        r.start(t, Math.random()); r.stop(t + 3.4);
      },
      // главный скример: удар, диссонанс и «БУ!»
      boo() {
        const t = now();
        const k = osc("sine", 160), kg = out(0.2);
        k.frequency.exponentialRampToValueAtTime(38, t + 0.35); env(kg.gain, t, 0.004, 0.7, 0.45); k.connect(kg); k.start(t); k.stop(t + 0.5);
        const lp = filt("lowpass", 600, 1.2), cg = out(0.5); lp.connect(cg);
        lp.frequency.setValueAtTime(600, t); lp.frequency.exponentialRampToValueAtTime(4200, t + 0.04); lp.frequency.exponentialRampToValueAtTime(700, t + 1.4);
        [220, 233.1, 329.6, 349.2, 466.2].forEach(f => { const o = osc("sawtooth", f); o.detune.value = rnd(-12, 12); o.connect(lp); o.start(t); o.stop(t + 1.8); });
        cg.gain.setValueAtTime(0.0001, t); cg.gain.exponentialRampToValueAtTime(0.15, t + 0.015); cg.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
        const v = osc("sawtooth", 210), f1 = filt("bandpass", 320, 6), f2 = filt("bandpass", 800, 8), vg = out(0.4);
        v.frequency.exponentialRampToValueAtTime(140, t + 0.6);
        v.connect(f1); v.connect(f2); f1.connect(vg); f2.connect(vg);
        vg.gain.setValueAtTime(0.0001, t); vg.gain.exponentialRampToValueAtTime(0.9, t + 0.03); vg.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
        v.start(t); v.stop(t + 0.75);
        const n = noiseSrc(), nb = filt("bandpass", 1500, 0.6), ng = out(0.3); n.connect(nb); nb.connect(ng);
        env(ng.gain, t, 0.005, 0.2, 0.5); n.start(t, Math.random()); n.stop(t + 0.6);
      },
      // мигающая лампа
      buzz(dur = 0.9) {
        const t = now(), o = osc("sawtooth", 100), o2 = osc("square", 50), bp = filt("bandpass", 900, 0.8), g = out(0.1);
        o.connect(bp); o2.connect(bp); bp.connect(g);
        let x = t; g.gain.setValueAtTime(0, t);
        while (x < t + dur) { g.gain.setValueAtTime(Math.random() < 0.6 ? rnd(0.02, 0.055) : 0, x); x += rnd(0.03, 0.09); }
        g.gain.setValueAtTime(0, t + dur);
        o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
      },
      // щелчок выключателя
      click() {
        const t = now(), n = noiseSrc(), hp = filt("highpass", 2500), g = out(0.1);
        n.connect(hp); hp.connect(g); env(g.gain, t, 0.001, 0.22, 0.035); n.start(t, Math.random()); n.stop(t + 0.07);
      },
      // паук на паутинке: вниз — «вжжжух», вверх — коротко
      zip(down = true) {
        const t = now(), d = down ? 0.7 : 0.3, o = osc("triangle", down ? 1700 : 320), g = out(0.2);
        const trem = osc("square", 38), tg = amp(0.5), am = amp(0.5); trem.connect(tg); tg.connect(am.gain);
        o.frequency.exponentialRampToValueAtTime(down ? 260 : 2200, t + d); o.connect(am); am.connect(g); env(g.gain, t, 0.01, 0.045, d);
        [o, trem].forEach(x => { x.start(t); x.stop(t + d + 0.05); });
      },
      // «сломанный» одометр
      glitch(dur = 0.7) {
        const t = now(), g = out(0.1); g.gain.setValueAtTime(1, t);
        let x = t;
        while (x < t + dur) {
          const o = osc(Math.random() < 0.5 ? "square" : "sawtooth", rnd(70, 1400)), d = rnd(0.025, 0.07), og = amp(rnd(0.025, 0.07));
          o.connect(og); og.connect(g); o.start(x); o.stop(x + d * 0.8); x += d;
        }
      },
      meow() {
        const t = now(), o = osc("sawtooth", 520), f = filt("bandpass", 700, 3), f2 = filt("bandpass", 2400, 5), g = out(0.35);
        o.frequency.linearRampToValueAtTime(820, t + 0.18); o.frequency.exponentialRampToValueAtTime(470, t + 0.62);
        f.frequency.linearRampToValueAtTime(1500, t + 0.2); f.frequency.exponentialRampToValueAtTime(800, t + 0.6);
        o.connect(f); o.connect(f2); f.connect(g); f2.connect(g);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + 0.06); g.gain.setValueAtTime(0.28, t + 0.36); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.66);
        o.start(t); o.stop(t + 0.7);
      },
      // печать трескается
      crack() {
        const t = now(), n = noiseSrc(), hp = filt("highpass", 900), g = out(0.3);
        n.connect(hp); hp.connect(g); env(g.gain, t, 0.002, 0.3, 0.14); n.start(t, Math.random()); n.stop(t + 0.2);
        const o = osc("sine", 300), og = out(0.2); o.frequency.exponentialRampToValueAtTime(70, t + 0.25); env(og.gain, t, 0.003, 0.45, 0.25); o.connect(og); o.start(t); o.stop(t + 0.32);
      },
      chime() { const t = now(); [76, 81, 85, 88, 93, 97].forEach((m, i) => bell(mtof(m), t + i * 0.085, 0.06, 2.4)); },
      sparkle() { const t = now(); [88, 93, 96, 100].forEach((m, i) => bell(mtof(m), t + i * 0.05, 0.035, 1.2)); },
    };

    return {
      start() {
        if (!init()) return;
        if (ctx.state === "suspended") ctx.resume();
        if (!started) { started = true; ambient(); }
      },
      play(name, ...a) {
        if (!ctx || !started || !on) return;
        if (ctx.state === "suspended") ctx.resume();
        try { FX[name] && FX[name](...a); } catch (e) { if (DEBUG) console.error("sfx " + name, e); } // звук — не повод ломать страницу
      },
      setOn(v) {
        on = !!v;
        try { localStorage.setItem("hw-sound", on ? "1" : "0"); } catch (e) {}
        if (on) this.start();
        if (master) master.gain.setTargetAtTime(on ? LEVEL : 0, ctx.currentTime, 0.08);
      },
      isOn: () => on,
      mood(m) { const next = m === "sweet" ? MEL_SWEET : MEL_SPOOKY; if (next !== mel) { mel = next; step = 0; } },
      _suspend(h) { if (!ctx || !started) return; if (h) ctx.suspend(); else ctx.resume(); },
    };
  })();
  document.addEventListener("visibilitychange", () => Snd._suspend(document.hidden));

  // кнопка звука
  const sndBtn = $("#snd");
  const syncSnd = () => { sndBtn.classList.toggle("is-off", !Snd.isOn()); sndBtn.setAttribute("aria-pressed", String(Snd.isOn())); sndBtn.setAttribute("aria-label", Snd.isOn() ? "Выключить звук" : "Включить звук"); };
  sndBtn.addEventListener("click", () => { Snd.setOn(!Snd.isOn()); syncSnd(); if (Snd.isOn()) Snd.play("sparkle"); });
  syncSnd();

  /* ============================================================
     ПУГАЛКИ
     ============================================================ */
  const layer = $("#scare");
  function A(el, frames, o = {}) {
    return el.animate(frames, { duration: o.d ?? 600, delay: o.at ?? 0, easing: o.e || "linear", fill: o.fill || "both", iterations: o.it || 1 });
  }
  const done = a => a ? a.finished.catch(() => {}) : Promise.resolve();
  function make(cls, html) {
    const e = document.createElement("div"); e.className = cls; e.innerHTML = html; e.style.visibility = "hidden";
    layer.appendChild(e); return e;
  }
  function clear(e) { e.style.visibility = "hidden"; e.getAnimations({ subtree: true }).forEach(a => a.cancel()); }
  const bg = () => window.__bg || null;
  const buzzPhone = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };

  /* ---------- стая летучих мышей ---------- */
  const batPool = [];
  function bats(o = {}) {
    if (RM || STILL) return;
    const W = innerWidth, H = innerHeight, n = o.n || (W < 600 ? 7 : 11), ltrAll = Math.random() < 0.5;
    Snd.play("squeaks", 7, 1.4); Snd.play("flutter", 1.6);
    for (let i = 0; i < n; i++) {
      let b = batPool[i];
      if (!b) { b = make("bat", `<img src="assets/bat.png" alt="" draggable="false">`); batPool[i] = b; }
      b.getAnimations().forEach(a => a.cancel());
      const s = rnd(34, W < 600 ? 64 : 84); b.style.width = s + "px";
      b.firstChild.style.animationDuration = rnd(0.12, 0.2).toFixed(2) + "s";
      let x0, y0, x1, y1, grow = false;
      if (o.from) { // вылет из точки во все стороны
        const ang = rnd(0, Math.PI * 2), R = Math.hypot(W, H) * 0.75;
        [x0, y0] = o.from; x1 = x0 + Math.cos(ang) * R; y1 = y0 + Math.sin(ang) * R * 0.7 - H * 0.2; grow = true;
      } else {
        const ltr = ltrAll;
        x0 = ltr ? -s - rnd(20, 160) : W + rnd(20, 160); x1 = ltr ? W + s + 40 : -s * 2 - 40;
        y0 = H * rnd(0.45, 1.0); y1 = H * rnd(-0.25, 0.35);
      }
      const dir = x1 > x0 ? 1 : -1, amp = rnd(18, 64), ph = rnd(0, 6.28), fr = rnd(1, 2.2), K = 10, f = [];
      for (let k = 0; k <= K; k++) {
        const t = k / K, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI * 2 * fr + ph) * amp * (grow ? t : 1);
        const rz = Math.cos(t * Math.PI * 2 * fr + ph) * 14 * dir, sc = grow ? 0.25 + 0.75 * Math.min(1, t * 2.5) : 1;
        // картинка смотрит влево: летим вправо — отражаем
        f.push({ transform: `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${rz.toFixed(1)}deg) scale(${(sc * -dir).toFixed(3)},${sc.toFixed(3)})` });
      }
      b.style.visibility = "visible";
      const a = A(b, f, { d: rnd(1700, 2700), at: (o.from ? i * 30 : i * rnd(40, 110)) + rnd(0, 180) });
      a.finished.then(() => { b.style.visibility = "hidden"; a.cancel(); }, () => {});
    }
  }

  /* ---------- привидение выглядывает из-за края экрана ---------- */
  let peekEl = null;
  async function peek(o = {}) {
    if (!peekEl) peekEl = make("peek", `<img src="assets/ghost.png" alt="" draggable="false"><span class="say"></span>`);
    const e = peekEl, say = e.lastChild, right = o.side ? o.side === "right" : Math.random() < 0.5;
    if (e._busy) return; e._busy = true;
    say.textContent = o.say || pickOne(["бу!", "бу-бу!", "ку-ку!", "а вот и я!"]);
    e.classList.toggle("r", right);
    const W = innerWidth, H = innerHeight, w = e.offsetWidth || 150, y = H * rnd(0.16, 0.42);
    const xOut = right ? W + 10 : -w - 10, xIn = right ? W - w * 0.7 : -w * 0.3;
    const rOut = right ? -38 : 38, rIn = right ? -15 : 15, s = right ? -1 : 1;
    const tr = (x, r) => `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${r}deg)`;
    e.style.visibility = "visible";
    Snd.play("whoosh", 0.6); setTimeout(() => Snd.play("ooo"), 260);
    const d = RM ? 2200 : 2700;
    const a = A(e, RM
      ? [{ transform: tr(xIn, rIn), opacity: 0 }, { transform: tr(xIn, rIn), opacity: 1, offset: 0.15 }, { transform: tr(xIn, rIn), opacity: 1, offset: 0.85 }, { transform: tr(xIn, rIn), opacity: 0 }]
      : [
        { transform: tr(xOut, rOut), easing: OUT_BACK },
        { transform: tr(xIn, rIn), offset: 0.2, easing: "ease-in-out" },
        { transform: tr(xIn - 6 * s, rIn + 7 * s), offset: 0.38, easing: "ease-in-out" },
        { transform: tr(xIn + 3 * s, rIn - 4 * s), offset: 0.56, easing: "ease-in-out" },
        { transform: tr(xIn, rIn), offset: 0.76, easing: IN },
        { transform: tr(xOut, rOut) },
      ], { d });
    A(say, [{ opacity: 0, transform: "translate(0px,10px) scale(.5)", easing: OUT_BACK }, { opacity: 1, transform: "translate(0px,0px) scale(1)", offset: 0.16 }, { opacity: 1, transform: "translate(0px,0px) scale(1)", offset: 0.84 }, { opacity: 0, transform: "translate(0px,-6px) scale(.9)" }], { at: 520, d: 1450 });
    await done(a); clear(e); e._busy = false;
  }

  /* ---------- паук спускается на паутинке (можно спугнуть нажатием) ---------- */
  let spiderEl = null;
  function spider() {
    return new Promise(resolve => {
      if (!spiderEl) {
        spiderEl = make("spider", `<i></i><img src="assets/spider.png" alt="Паук" draggable="false">`);
        spiderEl.addEventListener("pointerdown", e => { e.stopPropagation(); e.preventDefault(); if (spiderEl._flee) spiderEl._flee(true); });
      }
      const e = spiderEl, img = e.lastChild, W = innerWidth, H = innerHeight;
      if (e._busy) return resolve(); e._busy = true;
      const x = W * pickOne([rnd(0.1, 0.26), rnd(0.74, 0.9)]) - 31, y = H * rnd(0.14, 0.26);
      const tr = yy => `translate(${x.toFixed(1)}px,${yy.toFixed(1)}px)`;
      e.style.visibility = "visible"; Snd.play("zip", true);
      const down = A(e, RM
        ? [{ transform: tr(y), opacity: 0 }, { transform: tr(y), opacity: 1 }]
        : [{ transform: tr(-150), easing: "cubic-bezier(.3,.6,.4,1)" }, { transform: tr(y + 20), offset: 0.6, easing: "ease-in-out" }, { transform: tr(y - 10), offset: 0.8, easing: "ease-in-out" }, { transform: tr(y + 4), offset: 0.92, easing: "ease-in-out" }, { transform: tr(y) }],
        { d: RM ? 400 : 1300, fill: "forwards" });
      if (!RM) A(img, [{ transform: "rotate(-9deg)" }, { transform: "rotate(9deg)" }, { transform: "rotate(-9deg)" }], { d: 560, it: Infinity, e: "ease-in-out", fill: "none" });
      let gone = false, timer = 0;
      const flee = fast => {
        if (gone) return; gone = true; clearTimeout(timer);
        if (fast) { Snd.play("squeaks", 3, 0.2); }
        Snd.play("zip", false);
        const cy = new DOMMatrixReadOnly(getComputedStyle(e).transform).m42;
        down.cancel();
        const up = A(e, [{ transform: tr(cy), opacity: 1 }, { transform: tr(cy + 14), opacity: 1, offset: 0.2, easing: "cubic-bezier(.5,0,.9,.4)" }, { transform: tr(-170), opacity: 1 }], { d: fast ? 420 : 650 });
        up.finished.then(() => { clear(e); e._flee = null; e._busy = false; resolve(); }, () => { e._busy = false; resolve(); });
      };
      e._flee = flee;
      timer = setTimeout(() => flee(false), 4300);
    });
  }

  /* ---------- чёрный кот выглядывает снизу ---------- */
  let catEl = null;
  async function cat() {
    if (!catEl) catEl = make("cat", `<img src="assets/cat.png" alt="" draggable="false"><span class="say">мяу</span>`);
    const e = catEl, say = e.lastChild;
    if (e._busy) return; e._busy = true;
    const W = innerWidth, w = e.offsetWidth || 150, h = e.offsetHeight || 150;
    const x = W * pickOne([rnd(0.03, 0.18), rnd(0.62, 0.8)]);
    const tr = (yy, r) => `translate(${Math.min(x, W - w).toFixed(1)}px,${yy.toFixed(1)}px) rotate(${r}deg)`;
    e.style.visibility = "visible";
    setTimeout(() => Snd.play("meow"), 700);
    const a = A(e, [
      { transform: tr(h, 0), easing: OUT_BACK },
      { transform: tr(h * 0.36, -4), offset: 0.2, easing: "ease-in-out" },
      { transform: tr(h * 0.36, 4), offset: 0.48, easing: "ease-in-out" },
      { transform: tr(h * 0.36, -2), offset: 0.76, easing: IN },
      { transform: tr(h, 0) },
    ], { d: 3200 });
    A(say, [{ opacity: 0, transform: "translate(0px,10px) scale(.5)", easing: OUT_BACK }, { opacity: 1, transform: "translate(0px,0px) scale(1)", offset: 0.18 }, { opacity: 1, transform: "translate(0px,0px) scale(1)", offset: 0.85 }, { opacity: 0, transform: "translate(0px,-6px) scale(.9)" }], { at: 680, d: 1500 });
    await done(a); clear(e); e._busy = false;
  }

  /* ---------- молния ---------- */
  function lightning() {
    if (STILL) return;
    A($("#bolt"), RM
      ? [{ opacity: 0 }, { opacity: 0.35, offset: 0.2 }, { opacity: 0 }]
      : [{ opacity: 0 }, { opacity: 0.72, offset: 0.06 }, { opacity: 0.05, offset: 0.14 }, { opacity: 0.5, offset: 0.22 }, { opacity: 0, offset: 0.4 }, { opacity: 0.22, offset: 0.48 }, { opacity: 0 }],
      { d: RM ? 600 : 950, fill: "none" });
    const b = bg(); if (b && b.lightning) b.lightning();
    Snd.play("thunder", 0.3);
  }

  /* ---------- тряска сцены ---------- */
  function shake(el = $("main"), power = 1, d = 520) {
    if (RM || STILL) return;
    const f = [{ transform: "translate(0px,0px) rotate(0deg)" }];
    for (let k = 1; k < 9; k++) { const p = power * (1 - k / 9); f.push({ transform: `translate(${rnd(-14, 14) * p}px,${rnd(-10, 10) * p}px) rotate(${rnd(-1.4, 1.4) * p}deg)` }); }
    f.push({ transform: "translate(0px,0px) rotate(0deg)" });
    A(el, f, { d, fill: "none" });
  }

  /* ---------- темнота с фонариком ---------- */
  const Dark = (() => {
    const d = $("#dark");
    let active = false, raf = 0, touched = false, t0 = 0, x = 0, y = 0, tx = 0, ty = 0, aIn = null;
    const move = e => { touched = true; tx = e.clientX; ty = e.clientY; };
    function loop(t) {
      if (!active) return;
      if (!touched) { const s = (t - t0) / 1000; tx = innerWidth * (0.5 + 0.3 * Math.sin(s * 0.85)); ty = innerHeight * (0.52 + 0.17 * Math.sin(s * 1.37 + 1)); }
      x += (tx - x) * 0.16; y += (ty - y) * 0.16;
      d.style.setProperty("--lx", x.toFixed(1) + "px"); d.style.setProperty("--ly", y.toFixed(1) + "px");
      raf = requestAnimationFrame(loop);
    }
    return {
      get active() { return active; },
      on() {
        if (active) return Promise.resolve();
        active = true; touched = false; t0 = performance.now();
        x = tx = innerWidth / 2; y = ty = innerHeight / 2;
        addEventListener("pointermove", move, { passive: true }); addEventListener("pointerdown", move, { passive: true });
        d.classList.add("on"); raf = requestAnimationFrame(loop);
        Snd.play("buzz", 0.85); setTimeout(() => Snd.play("click"), 860);
        aIn = A(d, RM ? [{ opacity: 0 }, { opacity: 1 }]
          : [{ opacity: 0 }, { opacity: 0.8, offset: 0.12 }, { opacity: 0.1, offset: 0.2 }, { opacity: 0.9, offset: 0.34 }, { opacity: 0.3, offset: 0.46 }, { opacity: 0.95, offset: 0.6 }, { opacity: 0.55, offset: 0.75 }, { opacity: 1 }],
          { d: RM ? 400 : 950, fill: "forwards" });
        const b = bg(); if (b && b.dim) b.dim(1);
        return Promise.resolve();
      },
      async off() {
        if (!active) return;
        Snd.play("click");
        const a = A(d, RM ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1 }, { opacity: 0.25, offset: 0.2 }, { opacity: 0.85, offset: 0.36 }, { opacity: 0 }], { d: RM ? 300 : 650, fill: "forwards" });
        if (aIn) { aIn.cancel(); aIn = null; }
        const b = bg(); if (b && b.dim) b.dim(0);
        await done(a);
        active = false; cancelAnimationFrame(raf);
        removeEventListener("pointermove", move); removeEventListener("pointerdown", move);
        d.classList.remove("on"); a.cancel();
      },
    };
  })();

  /* ---------- всплывающая плашка ---------- */
  function toast(text, img, ms = 2700) {
    const t = $("#toast");
    t.getAnimations().forEach(a => a.cancel());
    $("span", t).textContent = text; if (img) $("img", t).src = img;
    A(t, [
      { opacity: 0, transform: "translate(-50%,-140%)", easing: OUT_BACK },
      { opacity: 1, transform: "translate(-50%,0%)", offset: 0.13 },
      { opacity: 1, transform: "translate(-50%,0%)", offset: 0.88, easing: IN },
      { opacity: 0, transform: "translate(-50%,-140%)" }], { d: ms, fill: "none" });
  }

  /* ---------- главный скример: свет мигает, гаснет — и БУ! ---------- */
  async function boo() {
    const root = $("#boo"), bgE = $(".boo-bg", root), gh = $(".boo-ghost", root), tx = $(".boo-text", root);
    try { await gh.decode(); } catch (e) {}
    root.classList.add("on");
    if (RM || STILL) {
      A(bgE, [{ opacity: 0 }, { opacity: 0.92 }], { d: 400, fill: "forwards" });
      A(gh, [{ opacity: 0 }, { opacity: 1 }], { at: 300, d: 400, fill: "forwards" });
      A(tx, [{ opacity: 0 }, { opacity: 1 }], { at: 400, d: 400, fill: "forwards" });
      Snd.play("ooo");
      await sleep(1900);
      A(root, [{ opacity: 1 }, { opacity: 0 }], { d: 400, fill: "forwards" });
      await sleep(420);
    } else {
      Snd.play("buzz", 0.95);
      A(bgE, [{ opacity: 0 }, { opacity: 0.85, offset: 0.12 }, { opacity: 0.15, offset: 0.22 }, { opacity: 0.92, offset: 0.4 }, { opacity: 0.35, offset: 0.52 }, { opacity: 1, offset: 0.7 }, { opacity: 1 }], { d: 950, fill: "forwards" });
      await sleep(1300); // темнота и тишина…
      Snd.play("boo"); buzzPhone([60, 40, 120]);
      A(gh, [{ opacity: 0, transform: "translate(0px,24%) scale(.12) rotate(-12deg)", easing: "cubic-bezier(.2,.9,.3,1.2)" }, { opacity: 1, transform: "translate(0px,0%) scale(1) rotate(0deg)" }], { d: 240, fill: "forwards" });
      const sh = [{ transform: "translate(0px,0%) scale(1) rotate(0deg)" }];
      for (let k = 1; k < 12; k++) { const p = 1 - k / 12; sh.push({ transform: `translate(${(rnd(-16, 16) * p).toFixed(1)}px,${(rnd(-3, 3) * p).toFixed(2)}%) scale(${(1 + 0.03 * p).toFixed(3)}) rotate(${(rnd(-4, 4) * p).toFixed(2)}deg)` }); }
      sh.push({ transform: "translate(0px,0%) scale(1) rotate(0deg)" });
      A(gh, sh, { at: 240, d: 700, fill: "forwards" });
      A(tx, [{ opacity: 0, transform: "scale(.3) rotate(-10deg)", easing: OUT_BACK }, { opacity: 1, transform: "scale(1) rotate(-4deg)" }], { at: 110, d: 380, fill: "forwards" });
      shake($("main"), 1.2, 600);
      await sleep(1350);
      A(gh, [{ opacity: 1, transform: "translate(0px,0%) scale(1) rotate(0deg)" }, { opacity: 0, transform: "translate(0px,-10%) scale(.82) rotate(5deg)" }], { d: 420, e: IN, fill: "forwards" });
      A(tx, [{ opacity: 1 }, { opacity: 0 }], { d: 300, fill: "forwards" });
      A(bgE, [{ opacity: 1 }, { opacity: 0 }], { at: 160, d: 540, fill: "forwards" });
      await sleep(720);
    }
    root.classList.remove("on");
    root.getAnimations({ subtree: true }).forEach(a => a.cancel());
    toast("Испугалась? Это любя 💜", "assets/scream.png");
  }

  /* ---------- глаза в темноте ---------- */
  const Eyes = (() => {
    const host = $("#eyes"), pool = [];
    const COLORS = [
      ["#ffd21f", "#ff8a00", "rgba(255,190,40,.55)"], ["#b6ff5c", "#2fbf3a", "rgba(150,255,90,.5)"],
      ["#ff7a6a", "#c4142c", "rgba(255,80,70,.5)"], ["#dcbcff", "#8a4dff", "rgba(190,140,255,.55)"]];
    let timer = 0, running = false;
    function spawn() {
      let p = pool.find(x => !x._busy);
      if (!p) { if (pool.length >= 4) return; p = document.createElement("div"); p.className = "pair"; p.innerHTML = "<i></i><i></i>"; host.appendChild(p); pool.push(p); }
      p._busy = true;
      const W = innerWidth, H = innerHeight, c = pickOne(COLORS), w = rnd(8, 14);
      p.style.setProperty("--w", w.toFixed(1) + "px"); p.style.setProperty("--g", (w * rnd(0.7, 1.1)).toFixed(1) + "px");
      p.style.setProperty("--c1", c[0]); p.style.setProperty("--c2", c[1]); p.style.setProperty("--gl", c[2]);
      let x, y;
      if (Math.random() < 0.65) { x = rnd(0.04, 0.94) * W; y = H - rnd(0.03, 0.16) * Math.max(220, Math.min(H, W * 0.5)); }
      else { x = Math.random() < 0.5 ? rnd(0.01, 0.06) * W : rnd(0.9, 0.96) * W; y = rnd(0.2, 0.75) * H; }
      const look = rnd(-5, 5), tr = (dx, sy) => `translate(${(x + dx).toFixed(1)}px,${y.toFixed(1)}px) scale(1,${sy})`;
      const a = A(p, [
        { opacity: 0, transform: tr(0, 0.1) }, { opacity: 1, transform: tr(0, 1), offset: 0.08 },
        { opacity: 1, transform: tr(0, 1), offset: 0.3 }, { opacity: 1, transform: tr(0, 0.08), offset: 0.33 }, { opacity: 1, transform: tr(0, 1), offset: 0.36 },
        { opacity: 1, transform: tr(look, 1), offset: 0.5 }, { opacity: 1, transform: tr(look, 1), offset: 0.62 },
        { opacity: 1, transform: tr(look, 0.08), offset: 0.65 }, { opacity: 1, transform: tr(look, 1), offset: 0.68 },
        { opacity: 1, transform: tr(-look * 0.5, 1), offset: 0.84 }, { opacity: 0, transform: tr(-look * 0.5, 0.1) }],
        { d: rnd(3200, 5200), fill: "none" });
      a.finished.then(() => { p._busy = false; }, () => { p._busy = false; });
    }
    function loop() { if (!running) return; if (!document.hidden) spawn(); timer = setTimeout(loop, rnd(1600, 3800)); }
    return {
      start() { if (running || RM || STILL) return; running = true; timer = setTimeout(loop, 1200); },
      stop() { running = false; clearTimeout(timer); },
    };
  })();

  /* ---------- дождь из конфет (финал) ---------- */
  const Candy = (() => {
    const IMGS = ["candy", "lollipop", "chocolate", "candy", "pumpkin", "lollipop", "ghost", "candy", "chocolate", "bat"];
    const pool = []; let running = false;
    function launch(e, delay) {
      const W = innerWidth, H = innerHeight, s = rnd(30, W < 600 ? 56 : 74);
      e.style.width = s.toFixed(0) + "px";
      const x = rnd(-0.02, 0.98) * W, dx = rnd(-90, 90), r0 = rnd(-180, 180), r1 = r0 + rnd(-540, 540);
      e.style.visibility = "visible";
      const a = A(e, [
        { transform: `translate(${x.toFixed(1)}px,${(-s - 30).toFixed(1)}px) rotate(${r0.toFixed(0)}deg)`, easing: "cubic-bezier(.4,.05,.75,.75)" },
        { transform: `translate(${(x + dx).toFixed(1)}px,${(H + 30).toFixed(1)}px) rotate(${r1.toFixed(0)}deg)` }],
        { d: rnd(3600, 6400), at: delay });
      a.finished.then(() => { a.cancel(); if (running) launch(e, rnd(0, 1800)); else e.style.visibility = "hidden"; }, () => {});
    }
    return {
      start() {
        if (running || RM || STILL) return; running = true;
        const n = innerWidth < 600 ? 14 : 24;
        for (let i = 0; i < n; i++) {
          let e = pool[i];
          if (!e) { e = make("candy", `<img src="assets/${IMGS[i % IMGS.length]}.png" alt="" draggable="false">`); pool[i] = e; }
          launch(e, i * 130 + rnd(0, 300));
        }
      },
      stop() { running = false; pool.forEach(clear); },
    };
  })();

  /* ---------- единая точка входа для сценария ---------- */
  function run(name, o) {
    if (!name) return Promise.resolve();
    if (C.scares === false && name !== "lightning" && name !== "dark") return Promise.resolve();
    switch (name) {
      case "bats": bats(o); break;
      case "peek": peek(o); break;
      case "spider": spider(); break;
      case "cat": cat(); break;
      case "lightning": lightning(); break;
      case "dark": return Dark.on();
      case "boo": return boo();
    }
    return Promise.resolve();
  }

  window.Spooky = { Snd, run, bats, peek, spider, cat, lightning, boo, shake, toast, Dark, Eyes, Candy };
})();
