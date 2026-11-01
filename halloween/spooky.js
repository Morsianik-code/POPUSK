/* ============================================================
   ПУГАЛКИ И ЗВУК
   • Звук — готовые записи из открытых библиотек (CC0 / CC BY 4.0, см. README):
     эффекты через Web Audio, фоновая музыка через <audio>.
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
     ЗВУК: готовые записи (assets/sound, источники — в README)
     • эффекты — короткие mp3, декодируются в Web Audio: играют без задержки и внахлёст;
     • музыка — два <audio> (жутковатый эмбиент и милый лоу-фай), плавная смена.
     ============================================================ */
  const Snd = (() => {
    const BASE = "assets/sound/";
    const FILES = ["pop", "whoosh", "whoosh2", "ghost", "ghost2", "squeak", "wings", "thunder", "boo", "boom", "creak", "static",
      "switch", "clock", "spring", "springup", "glitch", "laugh", "meow", "knock", "crack", "magic", "sparkle", "rise", "popper", "confetti"];
    const MUSIC_VOL = 0.55;
    let ctx = null, master = null, started = false, mood = "spooky";
    let on = C.sound !== false;
    try { const v = localStorage.getItem("hw-sound"); if (v === "0") on = false; else if (v === "1") on = true; } catch (e) {}
    const raw = {}, buf = {}, decoding = {};
    // эффекты скачиваем заранее, но после самой страницы (≈600 КБ)
    const prefetch = () => FILES.forEach(n => { if (!raw[n]) raw[n] = fetch(BASE + n + ".mp3").then(r => r.ok ? r.arrayBuffer() : null).catch(() => null); });
    if (document.readyState === "complete") setTimeout(prefetch, 1200); else addEventListener("load", () => setTimeout(prefetch, 1200));

    function decode(n) {
      if (buf[n] || decoding[n] || !ctx) return decoding[n];
      prefetch();
      decoding[n] = raw[n].then(ab => ab && new Promise((res, rej) => {
        // старый Safari умеет только колбэки
        try { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); } catch (e) { rej(e); }
      })).then(b => { if (b) buf[n] = b; return b; }).catch(e => { if (DEBUG) console.error("decode " + n, e); });
      return decoding[n];
    }
    function init() {
      if (ctx) return true;
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
      try { ctx = new AC(); } catch (e) { return false; }
      master = ctx.createGain(); master.gain.value = on ? 1 : 0;
      const comp = ctx.createDynamicsCompressor(); // страхует от перегруза, когда звучит несколько эффектов сразу
      comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.25;
      master.connect(comp); comp.connect(ctx.destination);
      FILES.forEach(decode);
      return true;
    }
    function play(n, o = {}) {
      if (!ctx || !started || !on) return null;
      const b = buf[n]; if (!b) { decode(n); return null; }
      const src = ctx.createBufferSource(), g = ctx.createGain(), t = ctx.currentTime + (o.delay || 0);
      src.buffer = b; src.loop = !!o.loop; src.playbackRate.value = o.rate || 1;
      g.gain.setValueAtTime(o.fadeIn ? 0.0001 : (o.vol ?? 1), t);
      if (o.fadeIn) g.gain.exponentialRampToValueAtTime(o.vol ?? 1, t + o.fadeIn);
      src.connect(g); g.connect(master);
      src.start(t);
      return {
        stop(f = 0.25) { try { const n = ctx.currentTime; g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(g.gain.value || 0.0001, n); g.gain.exponentialRampToValueAtTime(0.0001, n + f); src.stop(n + f + 0.05); } catch (e) {} },
      };
    }
    const vary = (a, b) => a + Math.random() * (b - a);
    // «реплики»: имена, которые зовёт остальной код
    const CUES = {
      pop: () => play("pop", { vol: 0.55, rate: vary(0.92, 1.1) }),
      whoosh: () => play(Math.random() < 0.5 ? "whoosh" : "whoosh2", { vol: 0.45, rate: vary(0.9, 1.1) }),
      ooo: () => play(Math.random() < 0.5 ? "ghost" : "ghost2", { vol: 0.75, rate: vary(0.85, 1) }),
      squeaks: (n = 5, span = 1) => { for (let i = 0; i < Math.min(n, 6); i++) play("squeak", { vol: 0.3, rate: vary(1.9, 2.6), delay: Math.random() * span }); },
      flutter: () => play("wings", { vol: 0.5, rate: vary(1.2, 1.45) }),
      thunder: (delay = 0.2) => play("thunder", { vol: 0.85, delay }),
      boo: () => { play("boo", { vol: 1 }); play("boom", { vol: 0.75 }); },
      buzz: () => { play("static", { vol: 0.3 }); play("static", { vol: 0.22, delay: 0.42, rate: 0.85 }); },
      click: () => play("switch", { vol: 0.7 }),
      zip: (down = true) => play(down ? "spring" : "springup", { vol: 0.5, rate: down ? 0.9 : 1.25 }),
      glitch: () => { play("glitch", { vol: 0.65 }); play("static", { vol: 0.25, delay: 0.1 }); play("glitch", { vol: 0.55, delay: 0.28, rate: 0.8 }); },
      laugh: () => play("laugh", { vol: 0.7 }),
      meow: () => play("meow", { vol: 0.8 }),
      crack: () => play("crack", { vol: 0.9 }),
      chime: () => play("magic", { vol: 0.6 }),
      sparkle: () => play("sparkle", { vol: 0.5, rate: vary(0.95, 1.1) }),
      knock: () => play("knock", { vol: 0.9 }),
      creak: () => play("creak", { vol: 0.75 }),
      rise: () => play("rise", { vol: 0.6 }),
      popper: () => play("popper", { vol: 0.75, rate: vary(0.95, 1.08) }),
      confetti: () => play("confetti", { vol: 0.75 }),
    };

    /* ---------- музыка ---------- */
    const music = {};
    function track(name) {
      if (music[name]) return music[name];
      const a = new Audio(BASE + "music-" + name + ".mp3");
      a.loop = true; a.preload = "auto"; a.setAttribute("playsinline", ""); a.volume = 0;
      return music[name] = a;
    }
    const fades = new Map();
    function fadeTo(a, v, ms, then) {
      clearInterval(fades.get(a));
      const from = a.volume, t0 = performance.now();
      const id = setInterval(() => {
        const k = Math.min(1, (performance.now() - t0) / ms);
        try { a.volume = Math.max(0, Math.min(1, from + (v - from) * k)); } catch (e) {}
        if (k >= 1) { clearInterval(id); fades.delete(a); if (then) then(); }
      }, 50);
      fades.set(a, id);
    }
    function playMusic() {
      if (!started) return;
      const cur = track(mood), other = track(mood === "spooky" ? "sweet" : "spooky");
      if (!on || document.hidden) { cur.pause(); other.pause(); return; }
      fadeTo(other, 0, 900, () => other.pause());
      const p = cur.play(); if (p && p.catch) p.catch(() => {});
      fadeTo(cur, MUSIC_VOL, 1400);
    }
    // iOS разрешает запуск <audio> только из нажатия: «разблокируем» обе дорожки сразу
    function unlockMusic() {
      ["spooky", "sweet"].forEach(n => {
        const a = track(n); if (n === mood) return;
        a.muted = true;
        const p = a.play();
        const done = () => { a.pause(); a.currentTime = 0; a.muted = false; };
        if (p && p.then) p.then(done, done); else done();
      });
    }

    return {
      start() {
        try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}
        if (init() && ctx.state !== "running") ctx.resume();
        if (ctx) { try { const b = ctx.createBufferSource(); b.buffer = ctx.createBuffer(1, 1, 22050); b.connect(ctx.destination); b.start(0); } catch (e) {} }
        if (!started) { started = true; unlockMusic(); }
        playMusic();
      },
      play(name, ...a) {
        if (!ctx || !started || !on) return null;
        if (ctx.state !== "running") ctx.resume();
        try { return CUES[name] ? CUES[name](...a) : play(name, a[0] || {}); } catch (e) { if (DEBUG) console.error("sfx " + name, e); return null; }
      },
      loop(name, vol = 0.5) { return play(name, { vol, loop: true, fadeIn: 0.6 }); },
      setOn(v) {
        on = !!v;
        try { localStorage.setItem("hw-sound", on ? "1" : "0"); } catch (e) {}
        if (on) this.start();
        if (master) master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.06);
        playMusic();
      },
      isOn: () => on,
      mood(m) { const next = m === "sweet" ? "sweet" : "spooky"; if (next !== mood) { mood = next; playMusic(); } },
      _suspend(h) {
        if (!started) return;
        if (ctx) { if (h) ctx.suspend(); else if (ctx.state !== "running") ctx.resume(); }
        if (h) Object.values(music).forEach(a => a.pause()); else if (on) { const a = music[mood]; if (a && a.paused) { const p = a.play(); if (p && p.catch) p.catch(() => {}); } }
      },
      _debug: () => ({ state: ctx && ctx.state, loaded: Object.keys(buf).length, total: FILES.length, music: Object.fromEntries(Object.entries(music).map(([k, a]) => [k, { paused: a.paused, vol: +a.volume.toFixed(2), t: +a.currentTime.toFixed(1), err: a.error && a.error.code }])) }),
    };
  })();
  document.addEventListener("visibilitychange", () => Snd._suspend(document.hidden));
  // iOS может «прервать» звук (звонок, сворачивание) — возобновляем на ближайшее касание
  addEventListener("pointerdown", () => { if (!document.hidden) Snd._suspend(false); }, { passive: true });

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

  // где сейчас карточка вопроса и заголовок (пугалки появляются прямо на них, чтобы их нельзя было пропустить)
  const rectOf = el => el && el.isConnected ? el.getBoundingClientRect() : null;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------- привидение выглядывает из-за края карточки ---------- */
  let peekEl = null;
  async function peek(o = {}) {
    if (!peekEl) peekEl = make("peek", `<img src="assets/ghost.png" alt="" draggable="false"><span class="say"></span>`);
    const e = peekEl, say = e.lastChild, right = o.side ? o.side === "right" : Math.random() < 0.5;
    if (e._busy) return; e._busy = true;
    say.textContent = o.say || pickOne(["бу!", "бу-бу!", "ку-ку!", "а вот и я!"]);
    e.classList.toggle("r", right);
    const W = innerWidth, H = innerHeight, w = e.offsetWidth || 150, h = e.offsetHeight || w;
    const cr = rectOf(o.card), tr0 = rectOf(o.title);
    const y = tr0 ? clamp(tr0.top + tr0.height / 2 - h * 0.5, 8, H - h - 8) : H * rnd(0.16, 0.42);
    // заходит на край карточки: на телефоне — почти на треть экрана
    const xIn = cr ? (right ? Math.min(W - w * 0.78, cr.right - w * 0.4) : Math.max(-w * 0.22, cr.left - w * 0.6)) : (right ? W - w * 0.7 : -w * 0.3);
    const xOut = right ? W + 10 : -w - 10;
    const rOut = right ? -38 : 38, rIn = right ? -14 : 14, s = right ? -1 : 1;
    const tr = (x, r) => `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${r}deg)`;
    e.style.visibility = "visible";
    Snd.play("whoosh"); setTimeout(() => Snd.play("ooo"), 380);
    const d = RM ? 2600 : 3300;
    const a = A(e, RM
      ? [{ transform: tr(xIn, rIn), opacity: 0 }, { transform: tr(xIn, rIn), opacity: 1, offset: 0.15 }, { transform: tr(xIn, rIn), opacity: 1, offset: 0.85 }, { transform: tr(xIn, rIn), opacity: 0 }]
      : [
        { transform: tr(xOut, rOut), easing: OUT_BACK },
        { transform: tr(xIn, rIn), offset: 0.17, easing: "ease-in-out" },
        { transform: tr(xIn - 6 * s, rIn + 7 * s), offset: 0.36, easing: "ease-in-out" },
        { transform: tr(xIn + 3 * s, rIn - 4 * s), offset: 0.56, easing: "ease-in-out" },
        { transform: tr(xIn, rIn), offset: 0.8, easing: IN },
        { transform: tr(xOut, rOut) },
      ], { d });
    A(say, [{ opacity: 0, transform: "translate(0px,10px) scale(.5)", easing: OUT_BACK }, { opacity: 1, transform: "translate(0px,0px) scale(1)", offset: 0.14 }, { opacity: 1, transform: "translate(0px,0px) scale(1)", offset: 0.86 }, { opacity: 0, transform: "translate(0px,-6px) scale(.9)" }], { at: 560, d: 1900 });
    await done(a); clear(e); e._busy = false;
  }

  /* ---------- паук спускается прямо на вопрос (можно спугнуть нажатием) ---------- */
  let spiderEl = null;
  function spider(o = {}) {
    return new Promise(resolve => {
      if (!spiderEl) {
        spiderEl = make("spider", `<i></i><img src="assets/spider.png" alt="Паук" draggable="false">`);
        spiderEl.addEventListener("pointerdown", e => { e.stopPropagation(); e.preventDefault(); if (spiderEl._flee) spiderEl._flee(true); });
      }
      const e = spiderEl, img = e.lastChild, W = innerWidth, H = innerHeight, sw = e.offsetWidth || 72;
      if (e._busy) return resolve(); e._busy = true;
      const t = rectOf(o.title);
      const x = t ? clamp(t.left + t.width * rnd(0.55, 0.9) - sw / 2, 6, W - sw - 6) : W * pickOne([rnd(0.1, 0.26), rnd(0.74, 0.9)]) - sw / 2;
      const y = t ? clamp(t.top + t.height * 0.5 - sw * 0.5, 30, H - sw - 30) : H * rnd(0.14, 0.26);
      const tr = yy => `translate(${x.toFixed(1)}px,${yy.toFixed(1)}px)`;
      e.style.visibility = "visible"; Snd.play("zip", true);
      const down = A(e, RM
        ? [{ transform: tr(y), opacity: 0 }, { transform: tr(y), opacity: 1 }]
        : [{ transform: tr(-150), easing: "cubic-bezier(.3,.6,.4,1)" }, { transform: tr(y + 22), offset: 0.6, easing: "ease-in-out" }, { transform: tr(y - 12), offset: 0.8, easing: "ease-in-out" }, { transform: tr(y + 4), offset: 0.92, easing: "ease-in-out" }, { transform: tr(y) }],
        { d: RM ? 400 : 1400, fill: "forwards" });
      if (!RM) A(img, [{ transform: "rotate(-9deg)" }, { transform: "rotate(9deg)" }, { transform: "rotate(-9deg)" }], { d: 560, it: Infinity, e: "ease-in-out", fill: "none" });
      let gone = false, timer = 0;
      const flee = fast => {
        if (gone) return; gone = true; clearTimeout(timer);
        if (fast) Snd.play("squeaks", 3, 0.2);
        Snd.play("zip", false);
        const cy = new DOMMatrixReadOnly(getComputedStyle(e).transform).m42;
        down.cancel();
        const up = A(e, [{ transform: tr(cy), opacity: 1 }, { transform: tr(cy + 14), opacity: 1, offset: 0.2, easing: "cubic-bezier(.5,0,.9,.4)" }, { transform: tr(-170), opacity: 1 }], { d: fast ? 420 : 650 });
        up.finished.then(() => { clear(e); e._flee = null; e._busy = false; resolve(); }, () => { e._busy = false; resolve(); });
      };
      e._flee = flee;
      timer = setTimeout(() => flee(false), 5200);
    });
  }

  /* ---------- чёрный кот выглядывает из-за нижнего края карточки ---------- */
  let catEl = null;
  async function cat(o = {}) {
    if (!catEl) catEl = make("cat", `<div class="cat-win"><img src="assets/cat.png" alt="" draggable="false"></div><span class="say">мяу</span>`);
    const e = catEl, img = e.querySelector("img"), say = e.lastChild;
    if (e._busy) return; e._busy = true;
    const W = innerWidth, H = innerHeight, w = e.offsetWidth || 150, h = w;
    const cr = rectOf(o.card);
    // окно кота заканчивается ровно по нижнему краю карточки: кот «вылезает» из-за неё на ответы
    const bottom = cr ? Math.min(cr.bottom - 6, H) : H;
    const x = cr ? clamp(cr.left + cr.width * pickOne([0.06, 0.58]), 4, W - w - 4) : W * pickOne([rnd(0.03, 0.18), rnd(0.62, 0.8)]);
    e.style.transform = `translate(${x.toFixed(1)}px,${(bottom - h).toFixed(1)}px)`;
    e.style.visibility = "visible";
    setTimeout(() => Snd.play("meow"), 650);
    const tr = (k, r) => `translate(0px,${(k * 100).toFixed(1)}%) rotate(${r}deg)`;
    const a = A(img, [
      { transform: tr(1, 0), easing: OUT_BACK },
      { transform: tr(0.22, -4), offset: 0.18, easing: "ease-in-out" },
      { transform: tr(0.22, 4), offset: 0.46, easing: "ease-in-out" },
      { transform: tr(0.22, -2), offset: 0.8, easing: IN },
      { transform: tr(1, 0) },
    ], { d: 3800 });
    A(say, [{ opacity: 0, transform: "translate(0px,10px) scale(.5)", easing: OUT_BACK }, { opacity: 1, transform: "translate(0px,0px) scale(1)", offset: 0.15 }, { opacity: 1, transform: "translate(0px,0px) scale(1)", offset: 0.86 }, { opacity: 0, transform: "translate(0px,-6px) scale(.9)" }], { at: 640, d: 2000 });
    await done(a); clear(e); e._busy = false;
  }

  /* ---------- фонтан конфет из точки (кнопка в финале) ---------- */
  const burstPool = [];
  function candyBurst(x, y, n = innerWidth < 600 ? 14 : 20) {
    if (STILL) return;
    const IM = ["candy", "lollipop", "chocolate", "candy", "pumpkin", "lollipop"];
    for (let i = 0; i < n; i++) {
      let e = burstPool[i];
      if (!e) { e = make("candy", `<img src="assets/${IM[i % IM.length]}.png" alt="" draggable="false">`); burstPool[i] = e; }
      e.getAnimations().forEach(a => a.cancel());
      const s = rnd(30, 56); e.style.width = s.toFixed(0) + "px";
      const vx = rnd(-320, 320), vy = rnd(-820, -460), g = 1500, T = rnd(1.1, 1.6), r0 = rnd(-60, 60), r1 = r0 + rnd(-420, 420);
      const f = [];
      for (let k = 0; k <= 10; k++) {
        const t = T * k / 10, px = x - s / 2 + vx * t, py = y - s / 2 + vy * t + g * t * t / 2;
        f.push({ transform: `translate(${px.toFixed(1)}px,${py.toFixed(1)}px) rotate(${(r0 + (r1 - r0) * k / 10).toFixed(0)}deg) scale(${k === 0 ? 0.3 : 1})`, opacity: k > 7 ? 1 - (k - 7) / 3 : 1 });
      }
      e.style.visibility = "visible";
      const a = A(e, RM ? [{ opacity: 0 }] : f, { d: T * 1000, at: i * 18 });
      a.finished.then(() => { e.style.visibility = "hidden"; a.cancel(); }, () => {});
    }
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
    const d = $("#dark"), root = document.documentElement;
    const hint = document.createElement("p"); hint.className = "dark-hint"; d.appendChild(hint);
    let active = false, raf = 0, touched = false, t0 = 0, x = 0, y = 0, tx = 0, ty = 0, aIn = null, aHint = null, clock = null, clockT = 0;
    const hideHint = () => { if (aHint) { aHint.cancel(); aHint = null; A(hint, [{ opacity: 1 }, { opacity: 0 }], { d: 400, fill: "none" }); } };
    const move = e => { if (!touched) hideHint(); touched = true; tx = e.clientX; ty = e.clientY; };
    const tmove = e => { const p = e.touches && e.touches[0]; if (p) move(p); };
    function loop(t) {
      if (!active) return;
      if (!touched) { const s = (t - t0) / 1000; tx = innerWidth * (0.5 + 0.3 * Math.sin(s * 0.85)); ty = innerHeight * (0.52 + 0.17 * Math.sin(s * 1.37 + 1)); }
      x += (tx - x) * 0.16; y += (ty - y) * 0.16;
      d.style.setProperty("--lx", x.toFixed(1) + "px"); d.style.setProperty("--ly", y.toFixed(1) + "px");
      raf = requestAnimationFrame(loop);
    }
    return {
      get active() { return active; },
      on(o = {}) {
        if (active) return Promise.resolve();
        active = true; touched = false; t0 = performance.now();
        x = tx = innerWidth / 2; y = ty = innerHeight / 2;
        addEventListener("pointermove", move, { passive: true }); addEventListener("pointerdown", move, { passive: true });
        addEventListener("touchmove", tmove, { passive: true }); addEventListener("touchstart", tmove, { passive: true });
        root.classList.add("is-dark"); // палец водит фонариком, а не прокручивает и не обновляет страницу
        hint.textContent = o.hint || "🔦 свети, чтобы прочитать";
        aHint = A(hint, [{ opacity: 0, transform: "translate(-50%,10px)" }, { opacity: 1, transform: "translate(-50%,0px)" }], { at: 2500, d: 700, fill: "both" });
        d.classList.add("on"); raf = requestAnimationFrame(loop);
        // лампа долго «борется»: мигает, трещит, щёлкает — и гаснет; в темноте тикают часы
        Snd.play("buzz"); setTimeout(() => Snd.play("buzz"), 1000); setTimeout(() => Snd.play("click"), 2150);
        clockT = setTimeout(() => { clock = Snd.loop("clock", 0.4); }, 2300);
        aIn = A(d, RM ? [{ opacity: 0 }, { opacity: 1 }]
          : [{ opacity: 0 }, { opacity: 0.75, offset: 0.06 }, { opacity: 0.05, offset: 0.1 }, { opacity: 0.85, offset: 0.18 }, { opacity: 0.2, offset: 0.24 },
             { opacity: 0.3, offset: 0.36 }, { opacity: 0.9, offset: 0.42 }, { opacity: 0.4, offset: 0.5 }, { opacity: 0.95, offset: 0.62 },
             { opacity: 0.6, offset: 0.72 }, { opacity: 0.97, offset: 0.84 }, { opacity: 0.85, offset: 0.92 }, { opacity: 1 }],
          { d: RM ? 400 : 2300, fill: "forwards" });
        const b = bg(); if (b && b.dim) b.dim(1);
        return Promise.resolve();
      },
      async off() {
        if (!active) return;
        clearTimeout(clockT); if (clock) { clock.stop(0.8); clock = null; }
        // свет возвращается не сразу: лампа пару раз моргает
        Snd.play("buzz"); setTimeout(() => Snd.play("click"), 1250);
        const a = A(d, RM ? [{ opacity: 1 }, { opacity: 0 }]
          : [{ opacity: 1 }, { opacity: 0.55, offset: 0.12 }, { opacity: 0.95, offset: 0.2 }, { opacity: 0.35, offset: 0.36 }, { opacity: 0.9, offset: 0.44 },
             { opacity: 0.6, offset: 0.62 }, { opacity: 0.85, offset: 0.7 }, { opacity: 0 }],
          { d: RM ? 300 : 1400, fill: "forwards" });
        if (aIn) { aIn.cancel(); aIn = null; }
        const b = bg(); if (b && b.dim) b.dim(0);
        await done(a);
        active = false; cancelAnimationFrame(raf);
        removeEventListener("pointermove", move); removeEventListener("pointerdown", move);
        removeEventListener("touchmove", tmove); removeEventListener("touchstart", tmove);
        root.classList.remove("is-dark");
        if (aHint) { aHint.cancel(); aHint = null; }
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
      Snd.play("boo");
      await sleep(1900);
      A(root, [{ opacity: 1 }, { opacity: 0 }], { d: 400, fill: "forwards" });
      await sleep(420);
    } else {
      Snd.play("buzz"); setTimeout(() => Snd.play("creak"), 1050);
      A(bgE, [{ opacity: 0 }, { opacity: 0.85, offset: 0.12 }, { opacity: 0.15, offset: 0.22 }, { opacity: 0.92, offset: 0.4 }, { opacity: 0.35, offset: 0.52 }, { opacity: 1, offset: 0.7 }, { opacity: 1 }], { d: 950, fill: "forwards" });
      await sleep(2300); // темнота, скрип… и тишина
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
    if (C.scares === false && !["lightning", "dark", "knock"].includes(name)) return Promise.resolve();
    switch (name) {
      case "bats": bats(o); break;
      case "peek": peek(o); break;
      case "spider": spider(o); break;
      case "cat": cat(o); break;
      case "knock": Snd.play("knock"); break;
      case "lightning": lightning(); break;
      case "dark": return Dark.on(o);
      case "boo": return boo();
    }
    return Promise.resolve();
  }

  window.Spooky = { Snd, run, bats, peek, spider, cat, lightning, boo, shake, toast, candyBurst, Dark, Eyes, Candy };
})();
