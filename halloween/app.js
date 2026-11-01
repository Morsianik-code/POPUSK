/* ============================================================
   ЛОГИКА СТРАНИЦЫ И ДВИЖЕНИЕ (работает и без 3D, если WebGL недоступен)
   Принципы (как в основной версии):
     • анимируются только transform и opacity, через Web Animations API;
     • CSS задаёт состояние покоя, первый и последний кадр анимации с ним совпадают;
     • вся работа с DOM (сборка вопроса, замеры) — до старта движения;
     • высота карточки вопросов фиксирована на всю сцену.
   ============================================================ */
(() => {
  "use strict";
  const C = window.CONFIG;
  const S = window.Spooky;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const tpl = s => (s || "").replace(/\{name\}/g, C.name || "");
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const frames2 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

  const params = new URLSearchParams(location.search);
  const DEBUG = params.has("debug");
  const STILL = params.has("still");
  if (STILL) document.documentElement.classList.add("still");
  const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (RM) document.documentElement.classList.add("rm");
  const fine = matchMedia("(hover:hover) and (pointer:fine)").matches;

  const state = { scene: null, q: 0, answers: [], busy: false, sent: false };
  const bg = () => window.__bg || null;
  function setBg(mode, extra) { window.__bgMode = mode; window.__bgQ = extra || 0; const b = bg(); if (b) b.setMode(mode, extra || 0); }
  const toNDC = (x, y) => [x / innerWidth * 2 - 1, -(y / innerHeight * 2 - 1)];

  /* ============================================================
     ДВИЖОК АНИМАЦИЙ
     ============================================================ */
  const E = {
    out: "cubic-bezier(.22,1,.36,1)",
    outBack: "cubic-bezier(.34,1.56,.64,1)",
    in: "cubic-bezier(.55,0,.8,.3)",
    grav: "cubic-bezier(.5,0,.9,.45)",
    io: "cubic-bezier(.65,0,.35,1)",
    sine: "cubic-bezier(.37,0,.63,1)",
  };
  function T(o = {}) {
    const u = v => typeof v === "number" ? v + "px" : (v || "0px");
    const sx = o.sx ?? o.s ?? 1, sy = o.sy ?? o.s ?? 1;
    return `translate3d(${u(o.x)},${u(o.y)},${o.z || 0}px) rotateX(${o.rx || 0}deg) rotateY(${o.ry || 0}deg) rotateZ(${o.rz || 0}deg) scale(${sx},${sy})`;
  }
  // мелкие элементы с текстом: только сдвиг и поворот, без масштаба (иначе текст «мылится»)
  function T2(o = {}) {
    const u = v => typeof v === "number" ? v + "px" : (v || "0px");
    return `translate(${u(o.x)},${u(o.y)}) rotate(${o.rz || 0}deg)`;
  }
  const REST = T2();
  const live = new Set();
  function anim(el, frames, o = {}) {
    if (!el) return null;
    const a = el.animate(frames, { duration: o.d ?? 600, delay: o.at ?? 0, easing: o.e || "linear", fill: o.fill || "both" });
    live.add(a);
    a.finished.then(() => { live.delete(a); if (!o.keep) a.cancel(); }, () => live.delete(a));
    return a;
  }
  const end = a => a ? a.finished.catch(() => {}) : Promise.resolve();
  function stopIn(root) { for (const a of Array.from(live)) { const t = a.effect && a.effect.target; if (t && root.contains(t)) { live.delete(a); a.cancel(); } } }

  /* ---------- пословное появление ---------- */
  function splitWords(el) {
    const walk = node => {
      Array.from(node.childNodes).forEach(child => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const s = document.createElement("span"); s.className = "w"; s.textContent = part; frag.appendChild(s);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1 && child.tagName !== "BR") walk(child);
      });
    };
    walk(el);
  }
  function words(el) { if (!el._w) { splitWords(el); el._w = $$(".w", el); } return el._w; }
  function setRich(el, html) { if (!el) return; el.innerHTML = tpl(html); el._w = null; }
  function setText(el, text) { if (!el) return; el.textContent = tpl(text); el._w = null; }

  const WORD = {
    rise:   { d: 760, f: [{ opacity: 0, transform: T2({ y: "0.5em", rz: 2.5 }), easing: E.out }, { opacity: 1, transform: REST }] },
    pop:    { d: 720, f: [{ opacity: 0, transform: T2({ y: "0.5em", rz: -14 }), easing: E.out }, { opacity: 1, transform: T2({ y: "-0.14em", rz: 5 }), offset: 0.5, easing: E.sine }, { opacity: 1, transform: T2({ y: "0.03em", rz: -1.6 }), offset: 0.76, easing: E.sine }, { opacity: 1, transform: REST }] },
    lift:   { d: 1100, f: [{ opacity: 0, transform: T2({ y: "0.7em", rz: -5 }), easing: "cubic-bezier(.2,.7,.3,1)" }, { opacity: 1, transform: T2({ y: "-0.1em", rz: 1 }), offset: 0.55, easing: E.sine }, { opacity: 1, transform: T2({ y: "0.02em", rz: -0.3 }), offset: 0.8, easing: E.sine }, { opacity: 1, transform: REST }] },
    bounce: { d: 980, f: [{ opacity: 0, transform: T2({ y: "-1.1em", rz: -7 }), easing: "cubic-bezier(.5,0,.9,.5)" }, { opacity: 1, transform: T2({ y: "0.05em", rz: 2.5 }), offset: 0.4, easing: E.out }, { opacity: 1, transform: T2({ y: "-0.22em", rz: -1 }), offset: 0.6, easing: "cubic-bezier(.45,0,.85,.5)" }, { opacity: 1, transform: T2({ y: "0.01em", rz: 0.4 }), offset: 0.78, easing: E.out }, { opacity: 1, transform: T2({ y: "-0.05em" }), offset: 0.89, easing: E.sine }, { opacity: 1, transform: REST }] },
    // «дрожащее» появление — как будто слово знобит от страха
    shiver: { d: 900, f: [{ opacity: 0, transform: T2({ y: "0.3em", rz: -6 }), easing: E.out }, { opacity: 1, transform: T2({ x: "0.04em", rz: 4 }), offset: 0.3 }, { opacity: 1, transform: T2({ x: "-0.04em", rz: -3 }), offset: 0.45 }, { opacity: 1, transform: T2({ x: "0.03em", rz: 2 }), offset: 0.6 }, { opacity: 1, transform: T2({ x: "-0.015em", rz: -1 }), offset: 0.78 }, { opacity: 1, transform: REST }] },
  };
  function reveal(el, style, at, stagger = 40) {
    if (!el) return at;
    if (RM) { anim(el, [{ opacity: 0 }, { opacity: 1 }], { at, d: 420 }); return at + 420; }
    const ws = words(el), P = WORD[style];
    ws.forEach((w, i) => anim(w, P.f, { at: at + i * stagger, d: P.d }));
    return at + Math.max(0, ws.length - 1) * stagger + P.d;
  }
  function revealEnd(el, style, at, stagger = 40) { return RM ? at + 420 : at + Math.max(0, words(el).length - 1) * stagger + WORD[style].d; }
  function popIn(el, at, d = 760) {
    if (RM) { anim(el, [{ opacity: 0 }, { opacity: 1 }], { at, d: 420 }); return at + 420; }
    anim(el, [{ opacity: 0, transform: T2({ y: 26, rz: -4 }), easing: E.out }, { opacity: 1, transform: T2({ y: -6, rz: 1.2 }), offset: 0.55, easing: E.sine }, { opacity: 1, transform: T2({ y: 1.5, rz: -0.3 }), offset: 0.8, easing: E.sine }, { opacity: 1, transform: REST }], { at, d });
    return at + d;
  }
  function fadeUp(el, at, d = 800) {
    if (RM) { anim(el, [{ opacity: 0 }, { opacity: 1 }], { at, d: 420 }); return at + 420; }
    anim(el, [{ opacity: 0, transform: T2({ y: 14 }), easing: E.out }, { opacity: 1, transform: REST }], { at, d });
    return at + d;
  }
  function jitter(el, at, d = 600, px = 7) {
    if (RM || !el) return;
    const f = [{ transform: REST }];
    for (let k = 1; k < 10; k++) { const p = 1 - k / 10; f.push({ transform: T2({ x: (Math.random() * 2 - 1) * px * p, y: (Math.random() * 2 - 1) * px * 0.5 * p, rz: (Math.random() * 2 - 1) * 2 * p }) }); }
    f.push({ transform: REST });
    anim(el, f, { at, d, fill: "none" });
  }

  /* ---------- рябь на кнопках ---------- */
  function ripple(e, el, host = el) {
    const r = el.getBoundingClientRect();
    let s = host.querySelector(":scope > .ripple");
    if (!s) { s = document.createElement("span"); s.className = "ripple"; host.appendChild(s); }
    s.style.left = ((e && e.clientX ? e.clientX : r.left + r.width / 2) - r.left) + "px";
    s.style.top = ((e && e.clientY ? e.clientY : r.top + r.height / 2) - r.top) + "px";
    s.animate([{ transform: "scale(0)", opacity: 0.9 }, { transform: "scale(16)", opacity: 0 }], { duration: 900, easing: E.out });
  }

  /* ---------- вспышка ---------- */
  function flash(x, y, at = 0) {
    const f = $("#flash"); f.style.setProperty("--fx", x + "px"); f.style.setProperty("--fy", y + "px");
    anim(f, [{ opacity: 0, easing: "cubic-bezier(.2,.8,.3,1)" }, { opacity: 0.85, offset: 0.14, easing: E.out }, { opacity: 0 }], { at, d: 900 });
  }

  /* ---------- паутина в углу карточек ---------- */
  function webHTML() {
    const P = (a, r) => [100 - Math.cos(a) * r, Math.sin(a) * r];
    const N = 6, th = Array.from({ length: N }, (_, i) => (i / (N - 1)) * Math.PI / 2);
    let d = "";
    th.forEach(a => { const [x, y] = P(a, 106); d += `M100,0L${x.toFixed(1)},${y.toFixed(1)}`; });
    [14, 28, 44, 61, 80].forEach((r, k) => {
      for (let i = 0; i < N - 1; i++) {
        const j0 = ((i * 7 + k * 3) % 5 - 2) * 0.035, j1 = (((i + 1) * 7 + k * 3) % 5 - 2) * 0.035;
        const r0 = r * (1 + j0), r1 = r * (1 + j1);
        const [x0, y0] = P(th[i], r0), [x1, y1] = P(th[i + 1], r1), [qx, qy] = P((th[i] + th[i + 1]) / 2, (r0 + r1) / 2 * 0.84);
        d += `${i ? "" : `M${x0.toFixed(1)},${y0.toFixed(1)}`}Q${qx.toFixed(1)},${qy.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
      }
    });
    return `<div class="web" aria-hidden="true"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${d}"/></svg></div>`;
  }
  const addWeb = card => card.insertAdjacentHTML("afterbegin", webHTML());

  /* ============================================================
     СЦЕНЫ
     ============================================================ */
  const SC = {}; $$(".scene").forEach(s => SC[s.dataset.scene] = s);
  function show(s) { s.classList.add("is-active"); s.inert = false; }
  function hide(s) { s.classList.remove("is-active"); s.inert = true; }

  /* ---------- блик и наклон под курсором (только мышь) ---------- */
  if (fine && !RM && !STILL) {
    let tx = 0, ty = 0, px = 0, py = 0, running = false, glassEl = null;
    const loop = () => {
      px += (tx - px) * 0.08; py += (ty - py) * 0.08;
      const s = state.scene && SC[state.scene], el = s && $(".tilt", s);
      if (el) el.style.transform = `rotateY(${(px * 6.5).toFixed(2)}deg) rotateX(${(-py * 5.5).toFixed(2)}deg)`;
      if (glassEl) glassEl.style.setProperty("--rim", (135 + px * 45 - py * 25).toFixed(0) + "deg");
      if (Math.abs(tx - px) + Math.abs(ty - py) > 0.002) requestAnimationFrame(loop); else running = false;
    };
    window.addEventListener("pointermove", e => {
      tx = (e.clientX / innerWidth) * 2 - 1; ty = (e.clientY / innerHeight) * 2 - 1;
      const s = state.scene && SC[state.scene];
      glassEl = s ? $(".glass:not(.is-off)", s) : null;
      if (glassEl && !state.busy) {
        const r = glassEl.getBoundingClientRect();
        glassEl.style.setProperty("--mx", ((e.clientX - r.left) / r.width * 100).toFixed(1) + "%");
        glassEl.style.setProperty("--my", ((e.clientY - r.top) / r.height * 100).toFixed(1) + "%");
      }
      if (!running) { running = true; requestAnimationFrame(loop); }
    }, { passive: true });
  }

  /* ============================================================
     ИНТРО
     ============================================================ */
  const introCard = $("#introCard");
  addWeb(introCard);
  setRich($("#hello"), C.name ? C.intro.title : C.intro.title.replace(/,?\s*<em>\{name\}([^<]*)<\/em>/, "$1"));
  setRich($("#introLead"), C.intro.lead);
  setText($("#startLabel"), C.intro.button);
  // кнопка звука под «Войти»: браузер не даёт сайту играть звук до первого нажатия
  const introSound = $("#introSound");
  const syncIntroSound = () => {
    const p = S.Snd.playing();
    introSound.classList.toggle("is-on", p); introSound.setAttribute("aria-pressed", String(p));
    setText($(".lbl", introSound), p ? (C.intro.soundOn || "Звук включён") : (C.intro.soundOff || "Включить звук"));
  };
  introSound.addEventListener("click", () => {
    S.Snd.toggle();
    if (!RM) anim(introSound, [{ transform: REST, easing: E.out }, { transform: T2({ y: 3 }), offset: 0.2, easing: E.out }, { transform: T2({ y: -5, rz: -1.5 }), offset: 0.55, easing: E.sine }, { transform: REST }], { d: 480 });
  });
  S.Snd.onChange(syncIntroSound); syncIntroSound();
  $("#startBtn").addEventListener("click", e => {
    if (state.busy || state.scene !== "intro") return;
    S.Snd.start(); S.Snd.play("pop");          // звук можно включить только по нажатию
    ripple(e, e.currentTarget);
    switchScene("quiz", FX_SCENE.introQuiz);
    setTimeout(() => S.lightning(), 420);       // гром на входе
  });
  function enterIntro(at) {
    let t = reveal($("#hello"), "bounce", at + 60, 110);
    t = reveal($("#introLead"), "rise", at + 420, 16);
    popIn($("#startBtn"), t - 380);
    popIn(introSound, t - 220, 760);
    setTimeout(peekOver, t + 900);
    return t + 400;
  }
  // привидение выглядывает из-за верхнего края карточки
  const peeker = $("#peeker");
  function peekOver() {
    if (state.scene !== "intro" || RM || STILL || peeker.getAnimations().length) return;
    anim(peeker, [
      { opacity: 0, transform: T2({ y: 64 }), easing: E.out },
      { opacity: 1, transform: T2({ y: -6, rz: -7 }), offset: 0.2, easing: E.sine },
      { opacity: 1, transform: T2({ y: 0, rz: 6 }), offset: 0.38, easing: E.sine },
      { opacity: 1, transform: T2({ y: -4, rz: -5 }), offset: 0.56, easing: E.sine },
      { opacity: 1, transform: T2({ y: 0, rz: 2 }), offset: 0.72, easing: E.in },
      { opacity: 0, transform: T2({ y: 64 }) }], { d: 3400 });
    S.Snd.play("ooo");
  }
  setInterval(() => { if (state.scene === "intro" && !state.busy && !document.hidden) peekOver(); }, 7500);

  /* ============================================================
     ВОПРОСЫ
     ============================================================ */
  const Q = C.quiz.questions;
  const qCards = $$(".qcard");
  const pearl = $("#pearl");
  const LIGHT = fine ? "свети мышкой 🔦" : "води пальцем 🔦";
  qCards.forEach(card => {
    card.innerHTML = `<div class="progress"><span class="qcount"></span><div class="bar"><i></i></div></div>
      <p class="eyebrow qeyebrow"></p><h2 class="q qtitle"></h2><div class="options"></div>`;
    addWeb(card);
  });
  let curCard = qCards[0];
  const other = c => c === qCards[0] ? qCards[1] : qCards[0];
  const barX = p => `translateX(${((p - 1) * 100).toFixed(3)}%)`;

  function buildQuestion(card, i, alt = false) { // только DOM, без анимаций
    const q = Q[i];
    $(".qcount", card).textContent = `${i + 1} / ${Q.length}`;
    $(".bar i", card).style.transform = barX(i / Q.length);
    setText($(".qeyebrow", card), (q.eyebrow || C.quiz.eyebrow).replace("{n}", i + 1).replace("{light}", LIGHT));
    setRich($(".qtitle", card), q.title);
    words($(".qeyebrow", card)); words($(".qtitle", card));
    const list = $(".options", card); list.textContent = "";
    q.options.forEach((o, k) => {
      const opt = typeof o === "string" ? { text: o } : o;
      const trick = q.trick && q.trick.option === k ? q.trick : null;
      const b = document.createElement("button");
      b.type = "button"; b.className = "opt";
      b.innerHTML = `<span class="rip"></span><span class="idx">0${k + 1}</span><span class="txt"></span>`;
      $(".txt", b).textContent = tpl(alt && trick ? trick.text : opt.text);
      b.addEventListener("click", e => pick(e, card, b, k));
      if (trick) {
        // ответ «передумывает»: наведение мышью или нажатие меняет текст
        b._swap = () => {
          if (b._swapped) return; b._swapped = true;
          $(".txt", b).textContent = tpl(trick.text);
          jitter(b, 0, 520, 6); S.Snd.play("squeaks", 2, 0.12);
        };
        b.addEventListener("pointerenter", e => { if (e.pointerType === "mouse" && card === curCard && !state.busy) b._swap(); });
      }
      list.appendChild(b);
    });
    card.dataset.q = i;
  }
  let quizH = 0;
  function measureQuiz() {
    const probe = other(curCard), keep = probe.dataset.q;
    qCards.forEach(c => c.style.height = "");
    let max = 0;
    for (let i = 0; i < Q.length; i++) {
      buildQuestion(probe, i); max = Math.max(max, probe.offsetHeight);
      if (Q[i].trick) { buildQuestion(probe, i, true); max = Math.max(max, probe.offsetHeight); }
    }
    quizH = Math.ceil(max);
    qCards.forEach(c => c.style.height = quizH + "px");
    if (keep != null) buildQuestion(probe, +keep);
  }
  function fitScenes() {
    const avail = innerHeight - 24;
    [["intro", introCard.offsetHeight + 40], ["quiz", quizH], ["result", $("#resultCard").offsetHeight]].forEach(([n, h]) => {
      const f = h > avail ? Math.max(0.72, avail / h) : 1;
      $(".tilt", SC[n]).style.setProperty("--fit", f.toFixed(3));
    });
  }
  function measureAll() { measureQuiz(); fitScenes(); }

  function enterQuestion(card, at) {
    const i = +card.dataset.q, q = Q[i];
    reveal($(".qeyebrow", card), "pop", at, 60);
    const t = reveal($(".qtitle", card), q.onEnter === "dark" || q.trick ? "shiver" : "rise", at + 90, 34);
    let last = at;
    $$(".opt", card).forEach((b, k) => {
      const s = k % 2 ? 1 : -1, d = 760, start = at + 260 + k * 75;
      if (RM) { anim(b, [{ opacity: 0 }, { opacity: 1 }], { at: start, d: 400 }); last = start + 400; return; }
      anim(b, [
        { opacity: 0, transform: T2({ x: 34 * s, y: 18, rz: 4 * s }), easing: E.out },
        { opacity: 1, transform: T2({ x: -4 * s, y: -3, rz: -0.8 * s }), offset: 0.55, easing: E.sine },
        { opacity: 1, transform: T2({ x: 1.2 * s, rz: 0.2 * s }), offset: 0.8, easing: E.sine },
        { opacity: 1, transform: REST },
      ], { at: start, d });
      last = start + d;
    });
    // пугалка этого вопроса
    if (q.onEnter) {
      const delay = q.onEnter === "dark" ? at + 650 : q.onEnter === "lightning" ? at + 200 : at + 900;
      setTimeout(() => { if (state.scene === "quiz" && state.q === i) S.run(q.onEnter, { card, title: $(".qtitle", card), hint: fine ? "🔦 свети мышкой, чтобы прочитать" : "🔦 води пальцем по экрану, чтобы прочитать" }); }, delay);
    }
    return Math.max(t, last);
  }

  function pick(e, card, btn, k) {
    if (state.busy || state.scene !== "quiz" || card !== curCard) return;
    state.busy = true;
    state.answers[state.q] = k;
    const i = state.q, q = Q[i], last = i + 1 >= Q.length;
    if (btn._swap) btn._swap();
    S.Snd.play("pop");
    ripple(e, btn, $(".rip", btn));
    const opts = $$(".opt", card);
    btn.classList.add("is-picked");
    if (!RM) anim(btn, [{ transform: REST, easing: E.out }, { transform: T2({ y: 3 }), offset: 0.14, easing: E.out }, { transform: T2({ y: -8, rz: -1.4 }), offset: 0.45, easing: E.sine }, { transform: T2({ y: 1.5, rz: 0.5 }), offset: 0.72, easing: E.sine }, { transform: REST }], { d: 600 });
    opts.forEach((b, j) => {
      if (b === btn) return;
      b.classList.add("is-dim");
      anim(b, [{ opacity: 1, easing: E.sine }, { opacity: 0.32 }], { d: 420, at: Math.abs(j - k) * 50 });
    });
    const bar = $(".bar i", card), from = barX(i / Q.length), to = barX((i + 1) / Q.length);
    bar.style.transform = to;
    anim(bar, [{ transform: from, easing: E.out }, { transform: to }], { d: 800 });
    const b = bg();
    if (b && e && e.clientX) { const [nx, ny] = toNDC(e.clientX, e.clientY); b.kick(nx, ny, last ? 1.2 : 1); }

    // свет возвращается, как только ответила на «тёмный» вопрос
    const lights = q.onEnter === "dark" ? sleep(1100).then(() => S.Dark.off()) : Promise.resolve();
    const after = async () => { await lights; if (q.onAnswer) await S.run(q.onAnswer); };
    if (!last) {
      const nextCard = other(card);
      frames2().then(() => buildQuestion(nextCard, i + 1));
      sleep(RM ? 380 : 600).then(after).then(() => questionTransition(card, nextCard, i + 1));
    } else {
      frames2().then(() => prepare("result"));
      sleep(RM ? 380 : 560).then(after).then(() => switchScene("result", FX_SCENE.implode, true));
    }
  }

  /* ---------- переходы между вопросами ---------- */
  const QFX = {
    // карточка мигает, как лампочка в подвале, и «включается» новая
    flicker: {
      out: { d: 560, f: [
        { transform: T(), opacity: 1 },
        { transform: T({ x: -6, rz: -0.6 }), opacity: 0.2, offset: 0.12 },
        { transform: T({ x: 5, rz: 0.5 }), opacity: 0.9, offset: 0.22 },
        { transform: T({ x: -3 }), opacity: 0.1, offset: 0.34 },
        { transform: T({ x: 2 }), opacity: 0.7, offset: 0.44 },
        { transform: T({ y: 14, s: 0.97 }), opacity: 0 }] },
      in: { at: 460, d: 950, content: 280, f: [
        { transform: T({ s: 0.985 }), opacity: 0 },
        { transform: T({ s: 0.99 }), opacity: 0.85, offset: 0.08 },
        { transform: T({ s: 0.99 }), opacity: 0.1, offset: 0.16 },
        { transform: T({ s: 0.995 }), opacity: 0.9, offset: 0.28 },
        { transform: T({ s: 0.995 }), opacity: 0.35, offset: 0.36 },
        { transform: T({ s: 1 }), opacity: 1, offset: 0.5 },
        { transform: "none", opacity: 1 }] },
    },
    flip: {
      out: { d: 400, f: [{ transform: "none", opacity: 1, easing: "cubic-bezier(.5,0,.9,.45)" }, { transform: T({ y: -18, ry: -86, s: 0.94 }), opacity: 1, offset: 0.88 }, { transform: T({ y: -18, ry: -90, s: 0.94 }), opacity: 0 }] },
      in: { at: 360, d: 980, content: 220, f: [
        { transform: T({ y: -18, ry: 90, s: 0.94 }), opacity: 0, easing: "cubic-bezier(.2,.7,.35,1)" },
        { transform: T({ y: -16, ry: 76, s: 0.95 }), opacity: 1, offset: 0.06, easing: "cubic-bezier(.2,.7,.35,1)" },
        { transform: T({ y: 4, ry: -14, s: 1.03 }), opacity: 1, offset: 0.5, easing: E.sine },
        { transform: T({ y: -2, ry: 6, s: 0.995 }), opacity: 1, offset: 0.72, easing: E.sine },
        { transform: T({ ry: -2 }), opacity: 1, offset: 0.88, easing: E.sine },
        { transform: "none", opacity: 1 }] },
    },
    cube: {
      originZ: true,
      out: { d: 1000, f: [
        { transform: "none", opacity: 1, easing: "cubic-bezier(.6,-0.2,.4,1)" },
        { transform: T({ rx: 95 }), opacity: 0, offset: 0.62, easing: E.sine },
        { transform: T({ rx: 90 }), opacity: 0 }] },
      in: { at: 0, d: 1000, content: 380, f: [
        { transform: T({ rx: -90 }), opacity: 0, easing: "cubic-bezier(.6,-0.2,.4,1)" },
        { transform: T({ rx: 5 }), opacity: 1, offset: 0.62, easing: E.sine },
        { transform: T({ rx: -2 }), opacity: 1, offset: 0.82, easing: E.sine },
        { transform: "none", opacity: 1 }] },
    },
    jelly: {
      out: { d: 480, f: [{ transform: "none", opacity: 1, easing: E.sine }, { transform: T({ sx: 1.07, sy: 0.92 }), opacity: 1, offset: 0.3, easing: "cubic-bezier(.6,0,.9,.4)" }, { transform: T({ sx: 0.2, sy: 0.26 }), opacity: 0 }] },
      in: { at: 380, d: 1100, content: 200, f: [
        { transform: T({ s: 0.3 }), opacity: 0, easing: E.out },
        { transform: T({ sx: 1.12, sy: 0.88 }), opacity: 1, offset: 0.3, easing: E.sine },
        { transform: T({ sx: 0.93, sy: 1.07 }), opacity: 1, offset: 0.48, easing: E.sine },
        { transform: T({ sx: 1.04, sy: 0.97 }), opacity: 1, offset: 0.64, easing: E.sine },
        { transform: T({ sx: 0.985, sy: 1.012 }), opacity: 1, offset: 0.8, easing: E.sine },
        { transform: "none", opacity: 1 }] },
    },
    toss: {
      under: true,
      out: { d: 720, f: [
        { transform: "none", opacity: 1, easing: E.sine },
        { transform: T({ x: 16, rz: 4, s: 1.01 }), opacity: 1, offset: 0.24, easing: "cubic-bezier(.5,0,.85,.4)" },
        { transform: T({ x: "-70%", y: "-4%", rz: -16, s: 0.98 }), opacity: 1, offset: 0.66, easing: "linear" },
        { transform: T({ x: "-135%", y: "-9%", rz: -28, s: 0.96 }), opacity: 0 }] },
      in: { at: 0, d: 1150, content: 420, f: [
        { transform: T({ y: 34, s: 0.86 }), opacity: 0, easing: E.sine },
        { transform: T({ y: 34, s: 0.86 }), opacity: 0.55, offset: 0.24, easing: E.sine },
        { transform: T({ y: 30, s: 0.87 }), opacity: 0.6, offset: 0.36, easing: "cubic-bezier(.3,.7,.4,1)" },
        { transform: T({ y: -8, s: 1.025 }), opacity: 1, offset: 0.66, easing: E.sine },
        { transform: T({ y: 2, s: 0.995 }), opacity: 1, offset: 0.84, easing: E.sine },
        { transform: "none", opacity: 1 }] },
    },
    zoom: {
      under: true,
      out: { d: 520, f: [{ transform: "none", opacity: 1, easing: "cubic-bezier(.5,0,.85,.5)" }, { transform: T({ s: 1.5, rz: 4 }), opacity: 0 }] },
      in: { at: 180, d: 1000, content: 260, f: [
        { transform: T({ s: 0.42, rz: -8 }), opacity: 0, easing: E.out },
        { transform: T({ s: 0.8, rz: -3 }), opacity: 1, offset: 0.24, easing: E.out },
        { transform: T({ s: 1.05, rz: 1 }), opacity: 1, offset: 0.56, easing: E.sine },
        { transform: T({ s: 0.985, rz: -0.3 }), opacity: 1, offset: 0.78, easing: E.sine },
        { transform: "none", opacity: 1 }] },
    },
    orbit: {
      out: { d: 660, f: [{ transform: "none", opacity: 1, easing: E.io }, { transform: T({ x: "-62%", z: -280, ry: -55, rz: -5, s: 0.9 }), opacity: 0 }] },
      in: { at: 150, d: 1050, content: 300, f: [
        { transform: T({ x: "62%", z: -280, ry: 55, rz: 5, s: 0.9 }), opacity: 0, easing: "cubic-bezier(.25,.75,.35,1)" },
        { transform: T({ x: "-4%", ry: -8, rz: -1 }), opacity: 1, offset: 0.58, easing: E.sine },
        { transform: T({ x: "1.2%", ry: 2.5, rz: 0.3 }), opacity: 1, offset: 0.8, easing: E.sine },
        { transform: "none", opacity: 1 }] },
    },
    drop: {
      origin: "50% 100%",
      out: { d: 640, f: [
        { transform: "none", opacity: 1, easing: E.out },
        { transform: T({ y: -20, sx: 0.98, sy: 1.03 }), opacity: 1, offset: 0.2, easing: E.grav },
        { transform: T({ y: "105%", rz: 8, sx: 0.96, sy: 1.04 }), opacity: 0.8, offset: 0.86, easing: "linear" },
        { transform: T({ y: "135%", rz: 9.5, sx: 0.96, sy: 1.04 }), opacity: 0 }] },
      in: { at: 400, d: 1200, content: 380, f: [
        { transform: T({ y: "-120%", rz: -4, sx: 0.92, sy: 1.1 }), opacity: 0, easing: E.grav },
        { transform: T({ y: "-70%", rz: -2, sx: 0.93, sy: 1.08 }), opacity: 1, offset: 0.2, easing: E.grav },
        { transform: T({ y: 0, sx: 0.94, sy: 1.06 }), opacity: 1, offset: 0.4, easing: "linear" },
        { transform: T({ y: 0, sx: 1.1, sy: 0.88 }), opacity: 1, offset: 0.5, easing: E.out },
        { transform: T({ y: -30, sx: 0.97, sy: 1.04 }), opacity: 1, offset: 0.66, easing: "cubic-bezier(.45,0,.85,.5)" },
        { transform: T({ y: 0, sx: 1.035, sy: 0.965 }), opacity: 1, offset: 0.8, easing: E.out },
        { transform: T({ y: -4, sx: 0.995, sy: 1.005 }), opacity: 1, offset: 0.9, easing: E.sine },
        { transform: "none", opacity: 1 }] },
    },
    // огонёк: карточка сжимается в светящуюся искру, та подпрыгивает и раскрывается новой карточкой
    pearl: {
      pearl: true,
      out: { d: 520, f: [{ transform: "none", opacity: 1, easing: E.sine }, { transform: T({ sx: 1.05, sy: 0.95 }), opacity: 1, offset: 0.26, easing: "cubic-bezier(.6,0,.9,.4)" }, { transform: T({ s: 0.06, rz: -24 }), opacity: 0.2, offset: 0.96 }, { transform: T({ s: 0.05, rz: -25 }), opacity: 0 }] },
      in: { at: 1080, d: 950, content: 200, f: [
        { transform: T({ s: 0.06 }), opacity: 0, easing: E.out },
        { transform: T({ s: 0.3 }), opacity: 1, offset: 0.1, easing: E.out },
        { transform: T({ s: 1.07 }), opacity: 1, offset: 0.48, easing: E.sine },
        { transform: T({ s: 0.975 }), opacity: 1, offset: 0.7, easing: E.sine },
        { transform: T({ s: 1.008 }), opacity: 1, offset: 0.86, easing: E.sine },
        { transform: "none", opacity: 1 }] },
    },
    // крышка гроба: старая откидывается назад, новая падает на верхней «петле» и раскачивается
    hinge: {
      origin: "50% 0%", outOrigin: "50% 100%",
      out: { d: 520, f: [{ transform: "none", opacity: 1, easing: "cubic-bezier(.5,0,.85,.45)" }, { transform: T({ rx: 68, s: 0.94 }), opacity: 0 }] },
      in: { at: 260, d: 1450, content: 360, f: [
        { transform: T({ rx: -78 }), opacity: 0, easing: "cubic-bezier(.45,0,.75,.6)" },
        { transform: T({ rx: -50 }), opacity: 1, offset: 0.12, easing: "cubic-bezier(.3,.3,.7,1)" },
        { transform: T({ rx: 20 }), opacity: 1, offset: 0.38, easing: E.sine },
        { transform: T({ rx: -10 }), opacity: 1, offset: 0.58, easing: E.sine },
        { transform: T({ rx: 4.5 }), opacity: 1, offset: 0.75, easing: E.sine },
        { transform: T({ rx: -1.5 }), opacity: 1, offset: 0.89, easing: E.sine },
        { transform: "none", opacity: 1 }] },
    },
  };
  const RM_QFX = {
    out: { d: 300, f: [{ opacity: 1 }, { opacity: 0 }] },
    in: { at: 160, d: 420, content: 120, f: [{ opacity: 0 }, { opacity: 1 }] },
  };
  function questionFx(i) {
    if (RM) return RM_QFX;
    const order = (C.quiz.transitions && C.quiz.transitions.length ? C.quiz.transitions : Object.keys(QFX)).filter(n => QFX[n]);
    const list = order.length ? order : Object.keys(QFX);
    return QFX[list[(i - 1) % list.length]];
  }

  async function questionTransition(oldC, newC, i) {
    if (+newC.dataset.q !== i) buildQuestion(newC, i);
    const fx = questionFx(i);
    const oldRect = fx.pearl ? oldC.getBoundingClientRect() : null;
    state.q = i;
    setBg("quiz", i);
    const zOld = 2, zNew = fx.under ? 1 : 3;
    oldC.style.zIndex = zOld; newC.style.zIndex = zNew;
    const oz = fx.originZ ? ` ${-Math.round(quizH / 2)}px` : "";
    oldC.style.transformOrigin = (fx.outOrigin || fx.origin || "50% 50%") + oz;
    newC.style.transformOrigin = (fx.origin || "50% 50%") + oz;
    if (fx === QFX.flicker) S.Snd.play("buzz", 0.5);
    else if (fx !== RM_QFX) S.Snd.play("whoosh", 0.55);

    const aOut = anim(oldC, fx.out.f, { d: fx.out.d, keep: true });
    newC.classList.remove("is-off"); newC.inert = false;
    const aIn = anim(newC, fx.in.f, { at: fx.in.at, d: fx.in.d });
    const contentEnd = enterQuestion(newC, fx.in.at + fx.in.content);
    if (fx.pearl) pearlHop(fx, oldRect);
    curCard = newC;

    end(aOut).then(() => {
      oldC.classList.add("is-off"); oldC.inert = true;
      stopIn(oldC); if (aOut) aOut.cancel();
      oldC.style.zIndex = ""; oldC.style.transformOrigin = "";
    });
    await Promise.all([end(aOut), end(aIn), sleep(contentEnd)]);
    newC.style.zIndex = ""; newC.style.transformOrigin = "";
    state.busy = false;
  }
  function pearlHop(fx, r) {
    const at = fx.out.d - 140, popAt = fx.in.at + 30, d = popAt - at + 260, p = x => +(x / d).toFixed(3);
    anim(pearl, [
      { transform: T({ s: 0 }), opacity: 0, easing: E.out },
      { transform: T({ s: 1.15 }), opacity: 1, offset: p(140), easing: E.out },
      { transform: T({ y: -86, sx: 0.9, sy: 1.12 }), opacity: 1, offset: p(140 + 260), easing: "cubic-bezier(.45,0,.85,.5)" },
      { transform: T({ y: 0, sx: 1.28, sy: 0.76 }), opacity: 1, offset: p(140 + 260 + 230), easing: E.out },
      { transform: T({ s: 1 }), opacity: 1, offset: p(popAt - at), easing: E.out },
      { transform: T({ s: 2.8 }), opacity: 0 },
    ], { at, d });
    setTimeout(() => {
      S.Snd.play("sparkle");
      const b = bg(); if (!b) return;
      const [nx, ny] = toNDC(r.left + r.width / 2, r.top + r.height / 2);
      b.burstAt(nx, ny, 0.55, 70);
    }, popAt);
  }

  /* ============================================================
     РЕЗУЛЬТАТ: какая ты нечисть + «сломанный» одометр 666 → 100
     ============================================================ */
  setText($("#resEyebrow"), C.result.eyebrow);
  setText($("#resBtnLabel"), C.result.button);
  addWeb($("#resultCard"));
  $("#resBtn").addEventListener("click", e => {
    if (state.busy || state.scene !== "result") return;
    S.Snd.play("pop");
    ripple(e, e.currentTarget);
    switchScene("letter", FX_SCENE.resultLetter);
  });
  let creatureKey = "pumpkin";
  function scoreCreature() {
    const cnt = {}; let best = null, bestN = 0;
    state.answers.forEach((k, i) => {
      const o = Q[i] && Q[i].options[k], is = o && o.is;
      if (!is || !C.creatures[is]) return;
      cnt[is] = (cnt[is] || 0) + 1;
      if (cnt[is] >= bestN) { bestN = cnt[is]; best = is; } // при равенстве — та, что набрала последней
    });
    return best || Object.keys(C.creatures)[0];
  }
  // одометр: каждая колонка — лента цифр; анимация везёт её снизу вверх от нуля
  let odo = null, numRect = null;
  function buildOdometer(value) {
    const host = $("#num"); value = Math.max(0, Math.round(Number(value) || 0));
    host.textContent = ""; host.setAttribute("aria-label", value + "%");
    const ds = String(value).split("").map(Number), cols = [];
    ds.forEach((dg, ci) => {
      const right = ds.length - 1 - ci, cycles = ds.length === 1 ? 1 : ci, n = cycles * 10 + dg;
      const col = document.createElement("span"); col.className = "col";
      const strip = document.createElement("span"); strip.className = "strip";
      const seq = [(dg + 1) % 10]; for (let s = n; s >= 0; s--) seq.push(s % 10);
      strip.innerHTML = seq.map(v => `<i>${v}</i>`).join("");
      col.appendChild(strip); host.appendChild(col);
      cols.push({ col, strip, n, right });
    });
    const pct = document.createElement("small"); pct.textContent = "%"; host.appendChild(pct);
    cols.forEach(c => { c.col.style.width = c.strip.children[1].getBoundingClientRect().width + "px"; });
    odo = { cols, pct };
  }
  const landOf = (value, start, dBase) => RM ? start + 500 : start + (dBase + (String(Math.max(0, Math.round(value))).length - 1) * 260) * 0.86;
  function spinOdometer(start, dBase, burst = true) {
    let land = start;
    odo.cols.forEach(c => {
      const d = dBase + (odo.cols.length - 1 - c.right) * 260;
      if (RM) { anim(c.strip, [{ opacity: 0 }, { opacity: 1 }], { at: start, d: 500 }); land = Math.max(land, start + 500); return; }
      anim(c.strip, [
        { transform: T2({ y: -c.n * 1.1 + "em" }), easing: "cubic-bezier(.3,.05,.15,1)" },
        { transform: T2({ y: "0.16em" }), offset: 0.86, easing: E.sine },
        { transform: T2({ y: "-0.03em" }), offset: 0.95, easing: E.sine },
        { transform: REST }], { at: start, d });
      land = Math.max(land, start + d * 0.86);
    });
    if (!RM) {
      anim($("#num"), [{ transform: REST, easing: E.out }, { transform: T2({ y: -12 }), offset: 0.22, easing: E.sine }, { transform: T2({ y: 3 }), offset: 0.55, easing: E.sine }, { transform: REST }], { at: land - 40, d: 640 });
      anim(odo.pct, [{ opacity: 0, transform: T2({ x: -14, y: 12, rz: -50 }), easing: E.out }, { opacity: 1, transform: T2({ rz: 9 }), offset: 0.55, easing: E.sine }, { opacity: 1, transform: REST }], { at: land - 60, d: 700 });
      if (burst) {
        const r = numRect;
        setTimeout(() => { const b = bg(); if (b && state.scene === "result") { const [nx, ny] = toNDC(r.left + r.width / 2, r.top + r.height / 2); b.burstAt(nx, ny, 0.7, 90); } }, land);
      }
    } else anim(odo.pct, [{ opacity: 0 }, { opacity: 1 }], { at: land, d: 400 });
    return land;
  }
  function popImg(el, at, keep) {
    if (RM) return anim(el, [{ opacity: 0 }, { opacity: 1 }], { at, d: 420, keep });
    return anim(el, [
      { opacity: 0, transform: T({ y: 40, s: 0.2, rz: -24 }), easing: E.out },
      { opacity: 1, transform: T({ y: -10, s: 1.1, rz: 5 }), offset: 0.45, easing: E.sine },
      { opacity: 1, transform: T({ s: 0.96, rz: -2 }), offset: 0.7, easing: E.sine },
      { opacity: 1, transform: T() }], { at, d: 900, keep });
  }
  function enterResult(at) {
    reveal($("#resEyebrow"), "pop", at, 60);
    const R = C.result, cr = C.creatures[creatureKey], num = $("#num"), label = $("#resLabel");
    const hasFake = R.fake != null && R.fake !== R.value;
    let start = at + 250, land;
    if (hasFake) {
      land = spinOdometer(start, 1500, false);
      fadeUp(label, land + 80, 700);
      // «сбой»: число дёргается, черт выскакивает и признаётся
      const tA = land + 750, tB = tA + 1650, tC = tB + 330;
      jitter(num, tA, 720, 12);
      setTimeout(() => {
        if (state.scene !== "result") return;
        num.classList.add("glitch"); S.Snd.play("glitch"); setTimeout(() => { if (state.scene === "result") S.Snd.play("laugh"); }, 260);
        const b = bg(); if (b) b.kick(0, 0.2, 0.8);
        setTimeout(() => num.classList.remove("glitch"), 720);
      }, tA);
      if (!RM) jitter($("#resultCard"), tA + 60, 500, 5);
      const dv = $("#devil"), say = $("#devilSay"), dd = tB + 260 - (tA + 120);
      anim(dv, RM ? [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }] : [
        { opacity: 0, transform: T({ y: 40, s: 0.2, rz: -30 }), easing: E.out },
        { opacity: 1, transform: T({ y: -8, s: 1.1, rz: 8 }), offset: 0.18, easing: E.sine },
        { opacity: 1, transform: T({ s: 1, rz: -6 }), offset: 0.32, easing: E.sine },
        { opacity: 1, transform: T({ s: 1, rz: 4 }), offset: 0.55, easing: E.sine },
        { opacity: 1, transform: T({ s: 1, rz: 0 }), offset: 0.8, easing: E.in },
        { opacity: 0, transform: T({ y: 30, s: 0.3, rz: 30 }) }], { at: tA + 120, d: dd, fill: "none" });
      anim(say, [{ opacity: 0, transform: T({ y: 8, s: 0.5 }), easing: E.outBack }, { opacity: 1, transform: T(), offset: 0.2 }, { opacity: 1, transform: T(), offset: 0.85 }, { opacity: 0, transform: T({ y: -4, s: 0.9 }) }], { at: tA + 380, d: dd - 300, fill: "none" });
      // старое число и подпись гаснут
      const outNum = anim(num, [{ opacity: 1 }, { opacity: 0 }], { at: tB, d: 260, fill: "forwards", keep: true });
      const outLbl = anim(label, [{ opacity: 1 }, { opacity: 0 }], { at: tB, d: 260, fill: "forwards", keep: true });
      // настоящий результат
      start = tC + 60;
      land = landOf(R.value, start, 1150);
      setTimeout(() => {
        if (state.scene !== "result") return;
        buildOdometer(R.value); num.classList.remove("is-evil");
        setText(label, (R.label || "{creature}").replace("{creature}", cr.name));
        if (outNum) outNum.cancel(); if (outLbl) outLbl.cancel();
        anim(num, [{ opacity: 0 }, { opacity: 1 }], { d: 200 });
        spinOdometer(60, 1150, true);
        fadeUp(label, land - start + 140, 700);
        S.Snd.play("whoosh", 0.5);
      }, tC);
    } else {
      land = spinOdometer(start, 1700, true);
      fadeUp(label, land + 80, 700);
    }
    popImg($("#creatureImg"), land - 120, true);
    setTimeout(() => { if (state.scene === "result") S.Snd.play("chime"); }, land);
    const t = reveal($("#resText"), "rise", land + 320, 18);
    return popIn($("#resBtn"), t - 250);
  }

  /* ============================================================
     ПРОКЛЯТИЕ
     ============================================================ */
  setText($("#letterEyebrow"), C.letter.eyebrow);
  const body = $("#letterBody");
  const paras = C.letter.paragraphs.map(p => { const el = document.createElement("p"); el.className = "text"; setRich(el, p); body.appendChild(el); return el; });
  $("#sigInk").textContent = tpl(C.letter.signature);
  $("#ps").textContent = tpl(C.letter.ps);
  $("#heartHint").textContent = C.letter.heartHint;
  const heartBtn = $("#heartBtn");
  let sigW = 0;
  heartBtn.addEventListener("click", () => {
    if (state.busy || state.scene !== "letter") return;
    state.busy = true;
    const r = heartBtn.getBoundingClientRect();
    S.Snd.play("crack"); setTimeout(() => S.Snd.play("chime"), 160);
    if (!RM) anim(heartBtn, [
      { transform: T(), easing: E.out },
      { transform: T({ s: 0.84, rz: -8 }), offset: 0.2, easing: E.out },
      { transform: T({ s: 0.9, rz: 8 }), offset: 0.34, easing: E.out },
      { transform: T({ s: 1.3 }), opacity: 1, offset: 0.7, easing: E.sine },
      { transform: T({ s: 1.45 }), opacity: 0 }], { d: 620, keep: true });
    const b = bg(); if (b) { const [nx, ny] = toNDC(r.left + r.width / 2, r.top + r.height / 2); b.burstAt(nx, ny, 1.1, 260); }
    flash(r.left + r.width / 2, r.top + r.height / 2, 160);
    switchScene("finale", FX_SCENE.letterFinale, true);
  });
  function enterLetter(at) {
    S.Snd.mood("sweet");
    let t = reveal($("#letterEyebrow"), "pop", at, 60);
    t = at + 300;
    paras.forEach(p => { const e = reveal(p, "rise", t, 24); t = e - 260; });
    if (RM) anim($("#sig"), [{ opacity: 0 }, { opacity: 1 }], { at: t, d: 500 });
    else {
      const d = 1500, e = "cubic-bezier(.45,.05,.3,1)";
      anim($(".sig-win"), [{ transform: T2({ x: -sigW }), easing: e }, { transform: REST }], { at: t, d });
      anim($("#sigInk"), [{ transform: T2({ x: sigW }), easing: e }, { transform: REST }], { at: t, d });
    }
    t += RM ? 500 : 1100;
    fadeUp($("#ps"), t, 800);
    return popIn($("#heartwrap"), t + 500, 820);
  }

  /* ============================================================
     ФИНАЛ
     ============================================================ */
  setText($("#finEyebrow"), C.finale.eyebrow);
  setRich($("#finTitle"), C.finale.title);
  setText($("#finSub"), C.finale.sub || "");
  // главная кнопка — «забрать сладость»: каждый тап — фонтан конфет; маленькая ссылка ниже — пройти заново (или написать)
  const finBtn = $("#finBtn"), finLink = $("#finLink"), F = C.finale;
  let gifts = 0, giftAt = 0;
  setText($("#finBtnLabel"), F.button);
  finBtn.addEventListener("click", e => {
    if (state.scene !== "finale" || performance.now() - giftAt < 300) return;
    giftAt = performance.now();
    const r = finBtn.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    ripple(e, finBtn);
    S.Snd.play("popper"); S.Snd.play("pop"); if (gifts === 0) S.Snd.play("rise");
    S.candyBurst(cx, cy);
    const b = bg(); if (b) { const [nx, ny] = toNDC(cx, cy); b.burstAt(nx, ny, 0.9, 140); }
    if (!RM) anim(finBtn, [{ transform: REST, easing: E.out }, { transform: T2({ y: 4 }), offset: 0.15, easing: E.out }, { transform: T2({ y: -10, rz: -2 }), offset: 0.45, easing: E.sine }, { transform: T2({ y: 2, rz: 1 }), offset: 0.72, easing: E.sine }, { transform: REST }], { d: 620 });
    const list = F.gifts || [];
    if (list.length) S.toast(tpl(list[Math.min(gifts, list.length - 1)]), "assets/candy.png", 2400);
    gifts++;
    if (F.buttonAgain && gifts === 1) setText($("#finBtnLabel"), F.buttonAgain);
  });
  if (C.replyUrl) { finLink.href = C.replyUrl; finLink.target = "_blank"; finLink.rel = "noopener"; setText(finLink, F.buttonReply); }
  else {
    setText(finLink, F.restart || F.buttonRestart);
    finLink.addEventListener("click", e => {
      e.preventDefault();
      if (state.busy || state.scene !== "finale") return;
      S.Snd.play("pop");
      state.answers = []; state.sent = false;
      S.Candy.stop(); S.Snd.mood("spooky");
      switchScene("intro", FX_SCENE.finaleIntro);
    });
  }
  function enterFinale(at) {
    gifts = 0; setText($("#finBtnLabel"), F.button);
    reveal($("#finEyebrow"), "rise", at, 90);
    let t = reveal($("#finTitle"), "lift", at + 420, 170);
    if ($("#finSub").textContent) fadeUp($("#finSub"), t - 200, 900);
    setTimeout(() => { if (state.scene !== "finale") return; S.Snd.play("confetti"); S.bats({ from: [innerWidth / 2, innerHeight * 0.4], n: innerWidth < 600 ? 8 : 12 }); }, at + 200);
    setTimeout(() => { if (state.scene === "finale") S.Candy.start(); }, at + 700);
    setTimeout(() => { if (state.scene === "finale") S.peek({ say: "с праздником!" }); }, at + 7000);
    fadeUp(finLink, t + 900, 800);
    if (RM) return fadeUp(finBtn, t + 400);
    anim(finBtn, [{ opacity: 0, transform: T2({ y: 22 }), easing: "cubic-bezier(.2,.7,.3,1)" }, { opacity: 1, transform: T2({ y: -4 }), offset: 0.6, easing: E.sine }, { opacity: 1, transform: REST }], { at: t + 400, d: 900 });
    return t + 1700;
  }

  /* ---------- Telegram (необязательно) ---------- */
  function sendAnswers() {
    const t = C.tg; if (!t || !t.enabled || !t.token || !t.chatId || state.sent) return;
    state.sent = true;
    const lines = Q.map((q, i) => { const o = q.options[state.answers[i]]; return `${i + 1}. ${q.title}\n   → ${o ? (o.text || o) : "—"}`; });
    const cr = C.creatures[creatureKey];
    fetch(`https://api.telegram.org/bot${t.token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: t.chatId, text: `🎃 ${C.name || "Она"} прошла хэллоуинский тест — ${cr ? cr.name : "?"}\n\n${lines.join("\n")}` }),
    }).catch(() => {});
  }

  /* ============================================================
     СМЕНА СЦЕН
     ============================================================ */
  const mainEl = {
    intro: () => introCard, quiz: () => curCard, result: () => $("#resultCard"),
    letter: () => $("#letterCard"), finale: () => $("#finaleStage"),
  };
  const inTarget = name => name === "finale" ? $("#finaleShade") : mainEl[name]();
  const PREP = {
    quiz() {
      stopIn(SC.quiz);
      curCard = qCards[0];
      qCards.forEach(c => { c.classList.toggle("is-off", c !== curCard); c.inert = c !== curCard; c.style.zIndex = ""; c.style.transformOrigin = ""; });
      state.q = 0; state.answers = [];
      buildQuestion(curCard, 0);
    },
    result() {
      stopIn(SC.result);
      ["#creatureImg", "#devil", "#devilSay", "#num", "#resLabel"].forEach(s => $(s).getAnimations().forEach(a => a.cancel()));
      creatureKey = scoreCreature();
      const cr = C.creatures[creatureKey], R = C.result, hasFake = R.fake != null && R.fake !== R.value;
      $("#creatureImg").src = cr.img;
      $("#devilSay").textContent = (R.oops || "") + " 😈";
      setRich($("#resText"), cr.text); words($("#resText"));
      setText($("#resLabel"), hasFake ? R.fakeLabel : (R.label || "{creature}").replace("{creature}", cr.name));
      buildOdometer(hasFake ? R.fake : R.value);
      $("#num").classList.toggle("is-evil", hasFake);
      numRect = $("#num").getBoundingClientRect();
      fitScenes();
      sendAnswers();
    },
    letter() { $("#letterCard").scrollTop = 0; const sc = $("#letterScroll"); if (sc) sc.scrollTop = 0; sigW = Math.ceil($(".sig-win").getBoundingClientRect().width); heartBtn.getAnimations().forEach(a => a.cancel()); },
  };
  const prepped = new Set();
  function prepare(name) { if (PREP[name] && !prepped.has(name)) { PREP[name](); prepped.add(name); } }
  const ENTER = {
    intro: enterIntro, quiz: at => enterQuestion(curCard, at), result: enterResult, letter: enterLetter, finale: enterFinale,
  };
  const RISE_IN = { at: 0, d: 1050, content: 240, f: [
    { transform: T({ y: 120, rx: -20, s: 0.88 }), opacity: 0, easing: "cubic-bezier(.2,.75,.3,1)" },
    { transform: T({ y: 30, rx: -6, s: 0.95 }), opacity: 1, offset: 0.3, easing: "cubic-bezier(.2,.6,.4,1)" },
    { transform: T({ y: -10, rx: 2.5, s: 1.012 }), opacity: 1, offset: 0.6, easing: E.sine },
    { transform: T({ y: 3, rx: -0.6 }), opacity: 1, offset: 0.8, easing: E.sine },
    { transform: "none", opacity: 1 }] };
  const FX_SCENE = {
    first: { in: Object.assign({}, RISE_IN, { at: 0 }) },
    introQuiz: {
      out: { d: 560, o: "50% 100%", f: [{ transform: "none", opacity: 1, easing: E.sine }, { transform: T({ y: 10, sx: 1.015, sy: 0.975 }), opacity: 1, offset: 0.2, easing: E.in }, { transform: T({ y: -70, rx: 18, s: 0.9 }), opacity: 0 }] },
      in: Object.assign({}, RISE_IN, { at: 300 }),
    },
    implode: {
      pearl: true,
      out: { d: 800, f: [
        { transform: "none", opacity: 1, easing: E.sine },
        { transform: T({ sx: 1.06, sy: 0.94 }), opacity: 1, offset: 0.24, easing: "cubic-bezier(.6,0,.9,.35)" },
        { transform: T({ s: 0.05, rz: -40 }), opacity: 0.25, offset: 0.97 },
        { transform: T({ s: 0.045, rz: -41 }), opacity: 0 }] },
      in: { at: 1200, d: 1200, content: 260, f: [
        { transform: T({ s: 0.08, rz: 10 }), opacity: 0, easing: E.out },
        { transform: T({ s: 0.4, rz: 4 }), opacity: 1, offset: 0.08, easing: E.out },
        { transform: T({ s: 1.1, rz: -1.5 }), opacity: 1, offset: 0.42, easing: E.sine },
        { transform: T({ s: 0.96, rz: 0.6 }), opacity: 1, offset: 0.6, easing: E.sine },
        { transform: T({ s: 1.02 }), opacity: 1, offset: 0.76, easing: E.sine },
        { transform: T({ s: 0.995 }), opacity: 1, offset: 0.89, easing: E.sine },
        { transform: "none", opacity: 1 }] },
    },
    // результат «ложится» назад, свиток раскрывается сверху, как крышка
    resultLetter: {
      out: { d: 580, o: "50% 100%", f: [{ transform: "none", opacity: 1, easing: E.sine }, { transform: T({ y: -10, s: 1.02 }), opacity: 1, offset: 0.2, easing: E.in }, { transform: T({ y: 30, rx: 72, s: 0.9 }), opacity: 0 }] },
      in: { at: 380, d: 1300, o: "50% 0%", content: 300, f: [
        { transform: T({ rx: 70, s: 0.96 }), opacity: 0, easing: "cubic-bezier(.35,.4,.55,1)" },
        { transform: T({ rx: 40, s: 0.975 }), opacity: 1, offset: 0.18, easing: "cubic-bezier(.3,.4,.6,1)" },
        { transform: T({ rx: -9 }), opacity: 1, offset: 0.48, easing: E.sine },
        { transform: T({ rx: 3.5 }), opacity: 1, offset: 0.68, easing: E.sine },
        { transform: T({ rx: -1 }), opacity: 1, offset: 0.85, easing: E.sine },
        { transform: "none", opacity: 1 }] },
    },
    letterFinale: {
      out: { d: 760, f: [{ transform: "none", opacity: 1, easing: E.out }, { transform: T({ y: -46, s: 1.05 }), opacity: 0 }] },
      in: { at: 380, d: 1000, content: 500, f: [{ opacity: 0, easing: E.sine }, { opacity: 1 }] },
    },
    finaleIntro: {
      out: { d: 560, f: [{ transform: "none", opacity: 1, easing: E.in }, { transform: T({ y: -30 }), opacity: 0 }] },
      in: Object.assign({}, RISE_IN, { at: 280 }),
    },
  };
  const RM_SCENE = {
    out: { d: 320, f: [{ opacity: 1 }, { opacity: 0 }] },
    in: { at: 200, d: 480, content: 160, f: [{ opacity: 0 }, { opacity: 1 }] },
  };

  async function switchScene(to, fx, alreadyBusy) {
    if (!alreadyBusy && state.busy && state.scene) return;
    state.busy = true;
    if (RM) fx = Object.assign({}, fx, RM_SCENE, { pearl: false, out: fx.out ? RM_SCENE.out : null });
    const fromName = state.scene, from = fromName ? SC[fromName] : null, dest = SC[to];
    prepare(to);
    await frames2();

    const outEl = from ? mainEl[fromName]() : null, inEl = inTarget(to);
    let outRect = null;
    if (fx.pearl && outEl) outRect = outEl.getBoundingClientRect();
    state.scene = to; prepped.delete(to);
    setBg(to);

    let aOut = null;
    if (outEl && fx.out) {
      outEl.style.transformOrigin = fx.out.o || "";
      aOut = anim(outEl, fx.out.f, { d: fx.out.d, keep: true });
      if (fromName === "finale") anim($("#finaleShade"), [{ opacity: 1 }, { opacity: 0 }], { d: fx.out.d, e: E.sine, keep: true });
    }
    inEl.style.transformOrigin = fx.in.o || "";
    const aIn = anim(inEl, fx.in.f, { at: fx.in.at, d: fx.in.d });
    show(dest);
    const contentEnd = ENTER[to](fx.in.at + (fx.in.content || 0));
    const aPearl = fx.pearl && outRect ? implodeExtras(fx, outRect) : null;

    const outDone = Promise.all([end(aOut), end(aPearl)]).then(() => {
      if (!from) return;
      hide(from);
      stopIn(from); if (aOut) aOut.cancel();
      if (outEl) outEl.style.transformOrigin = "";
    });
    await Promise.all([outDone, end(aIn), sleep(contentEnd)]);
    inEl.style.transformOrigin = "";
    state.busy = false;
  }
  function implodeExtras(fx, r) {
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const at = fx.out.d - 160, popAt = fx.in.at - 40, d = popAt - at + 300, p = x => +(x / d).toFixed(3);
    const a = anim(pearl, [
      { transform: T({ s: 0 }), opacity: 0, easing: E.out },
      { transform: T({ s: 1.2 }), opacity: 1, offset: p(160), easing: E.sine },
      { transform: T({ s: 0.85 }), opacity: 1, offset: p(160 + (popAt - at - 160) * 0.45), easing: E.sine },
      { transform: T({ s: 1.35 }), opacity: 1, offset: p(160 + (popAt - at - 160) * 0.8), easing: "cubic-bezier(.6,0,.9,.4)" },
      { transform: T({ s: 0.7 }), opacity: 1, offset: p(popAt - at), easing: E.out },
      { transform: T({ s: 3.4 }), opacity: 0 },
    ], { at, d });
    flash(cx, cy, popAt - 40);
    setTimeout(() => { S.Snd.play("sparkle"); const b = bg(); if (b) { const [nx, ny] = toNDC(cx, cy); b.burstAt(nx, ny, 1.3, 300); } }, popAt);
    return a;
  }

  /* ============================================================
     ЖИВОЙ ФОН: изредка молния (кроме проклятия и финала)
     ============================================================ */
  let nextBolt = performance.now() + 24000;
  setInterval(() => {
    const t = performance.now();
    if (document.hidden || t < nextBolt || STILL) return;
    nextBolt = t + 24000 + Math.random() * 26000;
    if (["intro", "quiz", "result"].includes(state.scene) && !S.Dark.active && !$("#boo").classList.contains("on")) S.lightning();
  }, 1000);

  /* ============================================================
     ЗАМЕРЫ: после загрузки шрифтов и при изменении ширины
     ============================================================ */
  let remeasureT = 0, pendingMeasure = false;
  function remeasureWhenIdle() {
    if (state.busy) { pendingMeasure = true; return; }
    pendingMeasure = false;
    measureAll();
  }
  setInterval(() => { if (pendingMeasure && !state.busy) remeasureWhenIdle(); }, 400);
  window.addEventListener("resize", () => {
    clearTimeout(remeasureT);
    remeasureT = setTimeout(remeasureWhenIdle, 250);
  });
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", () => { if (booted) remeasureWhenIdle(); });

  /* ---------- FPS-оверлей: ?debug ---------- */
  if (DEBUG) {
    const el = document.createElement("div"); el.id = "dbg"; document.body.appendChild(el);
    let last = performance.now(), t0 = last, n = 0, worst = 0, long = 0, longTotal = 0;
    (function f(now) {
      const d = now - last; last = now; n++; if (d > worst) worst = d; if (d > 25) { long++; longTotal++; }
      if (now - t0 > 500) {
        el.textContent = `${(n * 1000 / (now - t0)).toFixed(0)} fps · худший кадр ${worst.toFixed(0)} мс · рывков ${long} (всего ${longTotal})\n${window.__bgInfo || "3D: нет"} · ${innerWidth}×${innerHeight}${RM ? " · reduced-motion" : ""}`;
        t0 = now; n = 0; worst = 0; long = 0;
      }
      requestAnimationFrame(f);
    })(last);
  }

  /* ---------- старт ---------- */
  let booted = false;
  (async () => {
    if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, sleep(1800)]);
    PREP.quiz();
    measureAll();
    booted = true;
    S.Eyes.start();
    switchScene("intro", FX_SCENE.first);
  })();

  // хуки для автотестов
  window.__app = { state, live, measureAll, jump: (name, fx) => switchScene(name, FX_SCENE[fx] || FX_SCENE.first) };
})();
