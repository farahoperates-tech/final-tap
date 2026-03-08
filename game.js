/* =========================================================
   FINAL TAP — game.js (FULL FILE, STABLE)
   Core loop + levels + traps + audit scavenger mode (improved)
   Includes:
   - stable level resolution snapshot
   - levelEpoch stale timer/click guard
   - interaction lock during resolution/intermission
   - no score decay on missed target timeout
   - audit level progression (Level 4 reachable)
   - larger audit items + higher placement (HUD-safe)
   ========================================================= */

(() => {
  "use strict";
  /* ==============================
     SFX (Web Audio, no files needed)
     ============================== */
  const SFX = (() => {
    let ctx = null;
    let master = null;
    let enabled = true;
    let lastAt = 0;

    function ensure() {
      if (ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return; // very old browser
      ctx = new AC();

      master = ctx.createGain();
      master.gain.value = 0.55; // master volume (0..1)
      master.connect(ctx.destination);
    }

    // Call on user gesture (click/tap) to unlock audio on iOS/macOS
    function unlock() {
      try {
        ensure();
        if (ctx && ctx.state === "suspended") ctx.resume();
      } catch (_) {}
    }

    function setEnabled(v) {
      enabled = !!v;
    }

    function throttle(ms = 18) {
      const t = performance.now();
      if (t - lastAt < ms) return false;
      lastAt = t;
      return true;
    }

    function envGain(time, g, a = 0.002, d = 0.09) {
      g.gain.cancelScheduledValues(time);
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(1.0, time + a);
      g.gain.exponentialRampToValueAtTime(0.0001, time + a + d);
    }

    function tone(type, freqA, freqB, dur = 0.09) {
      if (!enabled) return;
      ensure();
      if (!ctx || !master) return;
      if (!throttle()) return;

      const t0 = ctx.currentTime;

      const o = ctx.createOscillator();
      const g = ctx.createGain();

      o.type = type;
      o.frequency.setValueAtTime(freqA, t0);
      if (freqB != null) o.frequency.exponentialRampToValueAtTime(freqB, t0 + dur);

      envGain(t0, g, 0.002, dur);

      o.connect(g);
      g.connect(master);

      o.start(t0);
      o.stop(t0 + dur + 0.02);
    }

    function noiseZap(dur = 0.11) {
      if (!enabled) return;
      ensure();
      if (!ctx || !master) return;
      if (!throttle()) return;

      const t0 = ctx.currentTime;

      // White noise buffer
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.75;

      const src = ctx.createBufferSource();
      src.buffer = buf;

      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(1200, t0);
      bp.frequency.exponentialRampToValueAtTime(420, t0 + dur);

      const g = ctx.createGain();
      envGain(t0, g, 0.002, dur);

      src.connect(bp);
      bp.connect(g);
      g.connect(master);

      src.start(t0);
      src.stop(t0 + dur + 0.02);
    }

    return {
      unlock,
      setEnabled,
      // SFX “events”
      goodTap: () => tone("square", 520, 740, 0.06),
      trapTap: () => noiseZap(0.10),
      emptyTap: () => tone("triangle", 140, 110, 0.08),
      breach: () => tone("sawtooth", 220, 90, 0.18),
      levelUp: () => tone("square", 660, 990, 0.10),
      pause: () => tone("triangle", 280, 220, 0.06),
      resume: () => tone("triangle", 220, 280, 0.06)
    };
  })();
/* ==============================
   Music / Ambience (MP3 loop)
   ============================== */
const MUSIC = (() => {
  let enabled = true;
  let vol = 0.45;
  let el = null;
  let intro1 = null;
  let intro2 = null;
  function ensure() {
    if (el) return;

el = new Audio("factory-ambience.mp3");
el.loop = true;
el.preload = "auto";
el.volume = vol;

intro1 = new Audio("intro-1.mp3");
intro1.preload = "auto";
intro1.volume = vol;

intro2 = new Audio("intro-2.mp3");
intro2.preload = "auto";
intro2.volume = vol;
  }

  function unlock() {
  // Prime the Audio element without stopping playback later
  ensure();
  wireIntroEndHandlersOnce();
}

  function play() {
  playAmbience();
}
  function stop() {
    if (!el) return;
    el.pause();
    el.currentTime = 0;
  }

  function pause() {
    if (!el) return;
    el.pause();
  }

  function resume() {
    if (!enabled) return;
    if (!el) return;
    el.play().catch(() => {});
  }

  function setEnabled(v) {
    enabled = !!v;
    if (!enabled) stop();
  }

  function setVolume(v) {
    vol = Math.max(0, Math.min(1, v));
    if (el) el.volume = vol;
  }
  function playAmbience() {
  if (!enabled) return;
  ensure();
  if (!el) return;
  // stop intro tracks if they were playing
  try { intro1?.pause(); intro1.currentTime = 0; } catch (_) {}
  try { intro2?.pause(); intro2.currentTime = 0; } catch (_) {}

  el.loop = true;
  el.currentTime = 0;
  el.volume = vol;
  el.play().catch(() => {});
}

function playIntro(n) {
  if (!enabled) return;
  ensure();

  // pause ambience while intro plays
  try { el?.pause(); } catch (_) {}

  const a = (n === 1) ? intro1 : intro2;
  if (!a) return;

  a.loop = false;
  a.currentTime = 0;
  a.volume = vol;
  a.play().catch(() => {});
}
  function playIntro1() {
    if (!enabled) return;
    ensure();
    try {
      // stop factory loop while intro sting plays
      if (el) el.pause();

      intro1.currentTime = 0;
      intro1.volume = vol;

      const p = intro1.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (_) {}
  }

  function playIntro2() {
    if (!enabled) return;
    ensure();
    try {
      if (el) el.pause();

      intro2.currentTime = 0;
      intro2.volume = vol;

      const p = intro2.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (_) {}
  }

  // When the sting ends, start the factory ambience loop again
  function wireIntroEndHandlersOnce() {
    ensure();
    if (!intro1 || !intro2) return;
    if (intro1.__ftWired || intro2.__ftWired) return;

    intro1.__ftWired = true;
    intro2.__ftWired = true;

    intro1.addEventListener("ended", () => { if (!paused && enabled) play(); });
    intro2.addEventListener("ended", () => { if (!paused && enabled) play(); });
  }
  function stopAll() {
  ensure();
  try { el?.pause(); if (el) el.currentTime = 0; } catch (_) {}
  try { intro1?.pause(); if (intro1) intro1.currentTime = 0; } catch (_) {}
  try { intro2?.pause(); if (intro2) intro2.currentTime = 0; } catch (_) {}
}
  return { unlock, start: play, play, playIntro1, playIntro2, stop, stopAll, pause, resume, setEnabled, setVolume };
})();
window.MUSIC = MUSIC;
  /* ==============================
     DOM refs
     ============================== */
  const arena = document.getElementById("arena");
  const scoreEl = document.getElementById("score");
  const timeEl = document.getElementById("time");
  const levelEl = document.getElementById("level");
  const bestEl = document.getElementById("best");
  const buildEl = document.getElementById("build");
  const hintEl = document.getElementById("hint");

  const startBtn = document.getElementById("startBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const restartBtn = document.getElementById("restartBtn");
  const resetBtn = document.getElementById("resetBtn");

  const chaosFill = document.getElementById("chaosFill");

  const overlay = document.getElementById("overlay");
  const overlayStart = document.getElementById("overlayStart");

  if (!arena || !scoreEl || !timeEl || !levelEl || !bestEl || !hintEl || !startBtn || !chaosFill) {
    console.error("FINAL TAP: Missing required DOM nodes.");
    return;
  }

  /* ==============================
     Config
     ============================== */
  const BEST_KEY = "finalTapBest_v3";
  const BUILD_TAG = "PH1-P3-SCAV2-STABLE-B";

  // Core loop (tap mode)
  const BASE_LEVEL_TIME = 12.0;
  const CHAOS_MAX = 10;
  const CHAOS_BREACH_RESET = 5;
  const SPAWN_INTERVAL_MS = 540;
  const TICK_MS = 100;
  const PASSIVE_CHAOS_PER_SEC = 0.42;
  const EMPTY_TAP_PENALTY = 0.80;
  const TRAP_TAP_PENALTY = 1.6;
  const MISS_TIMEOUT_PENALTY = 0.9;
  const GOOD_TAP_RELIEF = 1.15;
  const STREAK_RELIEF_EVERY = 4;
  const STREAK_BONUS_RELIEF = 0.55;

  // Level progression
  const MAX_LEVEL = 100;
  // Level mutation system
 const LEVEL_MUTATIONS = {
  6: "flicker",
  9: "drift",
  12: "mirror",
  15: "emergency_audit",
  19: "meltdown"
};
  const LEVEL_TARGET_SCORE = [0, 6, 8, 10, 12, 14, 16, 18];

  // Tap object lifetimes (ms) by level
  const GOOD_LIFETIME_BY_LEVEL = [0, 1800, 1650, 1500, 1400, 1300, 1220, 1150];
  const TRAP_LIFETIME_BY_LEVEL = [0, 1900, 1750, 1620, 1500, 1400, 1320, 1250];

  // Spawn mix by level (chance of trap when spawning)
  const TRAP_CHANCE_BY_LEVEL = [0, 0.16, 0.20, 0.24, 0.28, 0.31, 0.34, 0.37];
  // --- Scaling helpers for Level 8–40 (smooth difficulty) ---
function trapChanceForLevel(lvl) {
  // Starts around 0.16 and ramps up, capped so it doesn't become pure pain.
  return clamp(0.16 + (lvl - 1) * 0.006, 0.16, 0.52);
}

function goodLifetimeForLevel(lvl) {
  // Good controls live shorter as levels rise (harder), but with a floor.
  return clamp(1800 - (lvl - 1) * 22, 900, 1800);
}

function trapLifetimeForLevel(lvl) {
  // Traps also speed up, slightly differently.
  return clamp(1900 - (lvl - 1) * 18, 980, 1900);
}

  // Scavenger / Audit Sweep mode
  const AUDIT_LEVELS = new Set([4, 7, 12, 18, 25, 33, 40]);
  // Per-level audit timers (index = level number)
  // 0-3 unused, level 4 is the scavenger hunt.
  const AUDIT_TIME_BY_LEVEL = {
  4: 60,
  7: 60,

  12: 75,
  18: 85,
  25: 95,
  33: 110,
  40: 120
};

  function getAuditTimeForLevel(level) {
    return AUDIT_TIME_BY_LEVEL[level] ?? 45;
  }
  const AUDIT_TARGETS_BY_LEVEL = {
  4: 6,   // 6*2 = 12 (passes Level 4)
  7: 9,   // 9*2 = 18 (passes Level 7)

  12: 12, // 12*2 = 24
  18: 16, // 16*2 = 32
  25: 20, // 20*2 = 40
  33: 24, // 24*2 = 48
  40: 28  // 28*2 = 56
};
  const AUDIT_CLUTTER_COUNT = 22;
  const AUDIT_ITEM_POINTS = 2;

  /* ==============================
     State
     ============================== */
  let running = false;
  let paused = false;
  let mode = "tap"; // "tap" | "audit"

  let score = 0;        // total run score (HUD)
  let best = 0;

  let level = 1;
  let levelTimeLeft = BASE_LEVEL_TIME;
  let levelScore = 0;   // score earned in current level (gate value)
  let chaos = 0;
  let streak = 0;

  let breachLock = false;
  let gameEnded = false;

  // Critical stability guards
  let levelEpoch = 0;            // increments each new level
  let levelResolving = false;    // locks interactions/spawns during resolution
  let levelEndSnapshot = null;   // frozen state at timeout for pass/fail

  // timers
  let tickTimer = null;
  let spawnTimer = null;
  let levelCardTimer = null;

  // level-up intermission
  let intermission = false;

  // audit mode state
  let audit = {
    active: false,
    timeLeft: 0,
    targets: [],
    found: new Set(),
    root: null,
    hud: null,
    itemNodes: [],
    clutterNodes: []
  };

  // FX cooldowns
  let lastCrackFxAt = 0;
  let lastAshFxAt = 0;
  let missStreak = 0;
  let emptyTapMissStreak = 0;

  /* ==============================
     Utility
     ============================== */
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function choice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function nowMs() {
    return performance.now();
  }

  function clearTimer(refName) {
    if (refName === "tickTimer" && tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    if (refName === "spawnTimer" && spawnTimer) { clearInterval(spawnTimer); spawnTimer = null; }
    if (refName === "levelCardTimer" && levelCardTimer) { clearTimeout(levelCardTimer); levelCardTimer = null; }
  }

  function clearGameTimers() {
    clearTimer("tickTimer");
    clearTimer("spawnTimer");
    clearTimer("levelCardTimer");
  }

  function setBuildTag() {
    if (buildEl) buildEl.textContent = BUILD_TAG;
  }

  function loadBest() {
    const v = Number(localStorage.getItem(BEST_KEY) || "0");
    best = Number.isFinite(v) ? v : 0;
    bestEl.textContent = String(best);
  }

  function saveBest() {
    if (score > best) {
      best = score;
      localStorage.setItem(BEST_KEY, String(best));
      bestEl.textContent = String(best);
    }
  }

  function updateHUD() {
    scoreEl.textContent = String(score);
    timeEl.textContent = Math.max(0, levelTimeLeft).toFixed(1);
    levelEl.textContent = String(level);
    updateChaosBar();
  }

  function updateChaosBar() {
    const pct = clamp((chaos / CHAOS_MAX) * 100, 0, 100);
    chaosFill.style.width = `${pct}%`;
  }

  function setHint(msg) {
    if (hintEl) hintEl.textContent = msg;
  }

  function setButtonsForRunState(isRunning) {
    startBtn.disabled = isRunning;
    if (pauseBtn) pauseBtn.disabled = !isRunning;
    if (restartBtn) restartBtn.disabled = !isRunning;
  }

  function showOverlay(title, tag, buttonText = "INITIATE CONTAINMENT") {
    if (!overlay) return;
    const t = overlay.querySelector(".overlayTitle");
    const tg = overlay.querySelector(".overlayTag");
    if (t) t.textContent = title;
    if (tg) tg.textContent = tag;
    if (overlayStart) overlayStart.textContent = buttonText;

    overlay.classList.remove("hidden", "fadeOut");
    overlay.setAttribute("aria-hidden", "false");
  }

  function hideOverlay() {
    if (!overlay) return;
    overlay.classList.add("fadeOut");
    setTimeout(() => {
      overlay.classList.add("hidden");
      overlay.classList.remove("fadeOut");
      overlay.setAttribute("aria-hidden", "true");
    }, 260);
  }

  function resetArenaTransform() {
    arena.style.transform = "translate(0,0)";
  }

  function shakeArenaBrief() {
    const seq = [
      "translate(0,0)",
      "translate(-4px,1px)",
      "translate(4px,-1px)",
      "translate(-3px,2px)",
      "translate(3px,-2px)",
      "translate(0,0)"
    ];
    let i = 0;
    const iv = setInterval(() => {
      arena.style.transform = seq[i] || "translate(0,0)";
      i += 1;
      if (i >= seq.length) {
        clearInterval(iv);
        resetArenaTransform();
      }
    }, 28);
  }

  /* ==============================
     Arena cleanup / layers
     ============================== */
  function removeDynamicNodes() {
    arena.querySelectorAll(
      ".target,.trap,.ft-fx-layer,.ft-level-card,.ft-pause-banner,.ft-audit-root,.ft-audit-hud,.ft-ash-puff,.ash-blast,.glass-crack"
    ).forEach((n) => n.remove());
  }

  function ensureFxLayer() {
    let fx = arena.querySelector(".ft-fx-layer");
    if (!fx) {
      fx = document.createElement("div");
      fx.className = "ft-fx-layer";
      fx.setAttribute("aria-hidden", "true");
      arena.appendChild(fx);
    }
    return fx;
  }

  function clearTapObjects() {
    arena.querySelectorAll(".target,.trap").forEach((n) => n.remove());
  }

  /* ==============================
     Interaction validity guards
     ============================== */
  function canMutateTapObject(spawnEpoch) {
    if (!running || paused || gameEnded || intermission) return false;
    if (mode !== "tap") return false;
    if (levelResolving) return false;
    if (spawnEpoch !== levelEpoch) return false;
    return true;
  }

  /* ==============================
     Factory accident FX (chaos full only)
     ============================== */
  function addBodyFlash() {
    document.body.classList.remove("alarmFlash");
    void document.body.offsetWidth;
    document.body.classList.add("alarmFlash");
    setTimeout(() => document.body.classList.remove("alarmFlash"), 260);
  }

  function spawnAshBlast() {
    const t = nowMs();
    if (t - lastAshFxAt < 700) return;
    lastAshFxAt = t;

    const n = document.createElement("div");
    n.className = "ash-blast";
    n.setAttribute("aria-hidden", "true");
    arena.appendChild(n);
    setTimeout(() => {
      n.style.opacity = "0";
      setTimeout(() => n.remove(), 900);
    }, 180);
  }

  function spawnGlassCrack() {
    const t = nowMs();
    if (t - lastCrackFxAt < 1300) return;
    lastCrackFxAt = t;

    const n = document.createElement("div");
    n.className = "glass-crack";
    n.setAttribute("aria-hidden", "true");
    arena.appendChild(n);
    setTimeout(() => {
      n.style.opacity = "0";
      setTimeout(() => n.remove(), 900);
    }, 220);
  }

  function spawnExplosionBloom() {
    const fx = ensureFxLayer();
    const bloom = document.createElement("div");
    bloom.className = "ft-breach-bloom";
    bloom.setAttribute("aria-hidden", "true");
    fx.appendChild(bloom);

    requestAnimationFrame(() => bloom.classList.add("on"));
    setTimeout(() => bloom.remove(), 700);
  }

  function breachPulse() {
    SFX.breach();
    addBodyFlash();
    shakeArenaBrief();
    spawnAshBlast();
    spawnGlassCrack();
    spawnExplosionBloom();

    const severityText = level <= 2
      ? "MINOR INCIDENT. PAPERWORK MULTIPLIED."
      : level <= 4
        ? "CONTAINMENT BREACH. MANAGEMENT BLAMING INTERNS."
        : level <= 6
          ? "FACILITY INCIDENT ESCALATION. PLEASE LOOK BUSY."
          : "CATASTROPHIC PROCESS EVENT. SHAREHOLDERS CALM.";

    setHint(`⚠️ ${severityText}`);

    chaos = CHAOS_BREACH_RESET;
    updateChaosBar();
    breachLock = true;
    setTimeout(() => { breachLock = false; }, 300);
  }

  /* ==============================
     Small FX for taps / misses
     ============================== */
  function doAshPuff(x, y) {
    const puff = document.createElement("div");
    puff.className = "ft-ash-puff";
    puff.textContent = "💨";
    Object.assign(puff.style, {
      position: "absolute",
      left: `${x}px`,
      top: `${y}px`,
      transform: "translate(-50%, -50%) scale(0.7)",
      opacity: "0.95",
      pointerEvents: "none",
      zIndex: "120",
      fontSize: "34px",
      transition: "transform 220ms ease, opacity 220ms ease"
    });
    arena.appendChild(puff);

    requestAnimationFrame(() => {
      puff.style.transform = "translate(-50%, -82%) scale(1.15)";
      puff.style.opacity = "0";
    });

    setTimeout(() => puff.remove(), 240);
  }

  function doSparkPuff(x, y) {
    const fx = document.createElement("div");
    fx.textContent = "✹";
    Object.assign(fx.style, {
      position: "absolute",
      left: `${x}px`,
      top: `${y}px`,
      transform: "translate(-50%, -50%) scale(0.9)",
      opacity: "1",
      pointerEvents: "none",
      zIndex: "121",
      fontSize: "26px",
      color: "#ffd84d",
      textShadow: "0 0 8px rgba(255,220,80,0.8)",
      transition: "transform 180ms ease, opacity 180ms ease"
    });
    arena.appendChild(fx);
    requestAnimationFrame(() => {
      fx.style.transform = "translate(-50%, -62%) scale(1.25)";
      fx.style.opacity = "0";
    });
    setTimeout(() => fx.remove(), 200);
  }

  function flashObject(node, className) {
    node.classList.add(className);
    setTimeout(() => node.classList.remove(className), 140);
  }

  /* ==============================
     Chaos helpers
     ============================== */
  function addChaos(amount, source = "unknown") {
    chaos = clamp(chaos + amount, 0, CHAOS_MAX);
    updateChaosBar();

    if (source === "trapClick") {
      spawnAshBlast();
      spawnGlassCrack();
    }

    if (!breachLock && chaos >= CHAOS_MAX) {
      breachPulse();
    }
  }

  function reduceChaos(amount) {
    chaos = clamp(chaos - amount, 0, CHAOS_MAX);
    updateChaosBar();
  }

  /* ==============================
     Pause banner / level card
     ============================== */
  function showPauseBanner() {
    let n = arena.querySelector(".ft-pause-banner");
    if (!n) {
      n = document.createElement("div");
      n.className = "ft-pause-banner";
      n.innerHTML = `
        <div class="ft-pause-title">PAUSED</div>
        <div class="ft-pause-sub">Catastrophe waiting politely.</div>
      `;
      arena.appendChild(n);
    }
    n.classList.add("on");
  }

  
function hidePauseBanner() {
  const n = arena.querySelector(".ft-pause-banner");
  if (n) n.classList.remove("on");
}

/* ==============================
   Lore intro slides (2 images)
   ============================== */
const INTRO_SLIDES = [
  {
    subtitle: "SHIFT 0: ORIENTATION",
    title: "DOOM FACTORY — ENTRANCE",
    text: "Uh-huh. So you *have* free will… and this is what you did with it?",
    img: "intro-1.png"
  },
  {
    subtitle: "CONTAINMENT DEPARTMENT",
    title: "WELCOME INSIDE",
    text: "Rule #1: press the right buttons. Rule #2: there are no right buttons.",
    img: "intro-2.png"
  }
];

function showIntroThenBriefingThenStart() {
  // Remove any existing intro (safety)
  document.querySelectorAll(".ft-intro").forEach((n) => n.remove());

  let i = 0;

  const wrap = document.createElement("div");
  wrap.className = "ft-intro";

  wrap.innerHTML = `
    <div class="ft-intro-card">
      <div class="ft-intro-img">
        <div class="ft-intro-scan"></div>
        <div class="ft-intro-jitter"></div>
      </div>
      <div class="ft-intro-bottom">
        <div class="ft-intro-subtitle"></div>
        <div class="ft-intro-title"></div>
        <div class="ft-intro-text"></div>
        <div class="ft-intro-actions">
          <button class="ft-intro-skip" type="button">Skip</button>
          <button class="ft-intro-next" type="button">Continue</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(wrap);

  const imgEl = wrap.querySelector(".ft-intro-img");
  const subEl = wrap.querySelector(".ft-intro-subtitle");
  const titleEl = wrap.querySelector(".ft-intro-title");
  const textEl = wrap.querySelector(".ft-intro-text");
  const nextBtn = wrap.querySelector(".ft-intro-next");
  const skipBtn = wrap.querySelector(".ft-intro-skip");

  function render() {
    const s = INTRO_SLIDES[i];
    if (!s) return;
    imgEl.style.backgroundImage = `url("${s.img}")`;
    if (i === 0) MUSIC.playIntro1?.();
    if (i === 1) MUSIC.playIntro2?.();
    subEl.textContent = s.subtitle;
    titleEl.textContent = s.title;
    textEl.textContent = s.text;
    nextBtn.textContent = (i >= INTRO_SLIDES.length - 1) ? "Clock In" : "Continue";
  }

  function closeIntro() {
  wrap.remove();
  MUSIC.play?.(); // start factory ambience AFTER slides
  showBriefingThenStart();
}

  nextBtn.addEventListener("click", () => {
    i += 1;
    if (i >= INTRO_SLIDES.length) closeIntro();
    else render();
  });

  skipBtn.addEventListener("click", closeIntro);

  // Clicking the image advances too
  imgEl.addEventListener("click", () => {
    i += 1;
    if (i >= INTRO_SLIDES.length) closeIntro();
    else render();
  });

  render();
}
  /* ==============================
   Briefing screen (Phase 2)
   ============================== */
function showBriefingThenStart() {
  // remove any existing briefing (safety)
  arena.querySelectorAll(".ft-briefing").forEach((n) => n.remove());

  const wrap = document.createElement("div");
  wrap.className = "ft-briefing";
  wrap.setAttribute("aria-hidden", "true");

  wrap.innerHTML = `
    <div class="ft-briefing-card">
      <div class="ft-briefing-title">SHIFT BRIEFING</div>
      <div class="ft-briefing-sub">Tap good controls. Avoid traps. Keep chaos down. Pass levels.</div>

      <div class="ft-briefing-rows">
        <div class="ft-briefing-row">
          <div class="ft-briefing-label">GOOD</div>
          <div class="ft-briefing-icons">
            <div class="ft-briefing-ico" style="background-image:url('icon-vent.png')"></div>
            <div class="ft-briefing-ico" style="background-image:url('icon-coolant.png')"></div>
            <div class="ft-briefing-ico" style="background-image:url('icon-breaker.png')"></div>
            <div class="ft-briefing-ico" style="background-image:url('icon-purge.png')"></div>
          </div>
        </div>

        <div class="ft-briefing-row">
          <div class="ft-briefing-label">TRAPS</div>
          <div class="ft-briefing-icons">
            <div class="ft-briefing-ico" style="background-image:url('icon-hotwire.png')"></div>
            <div class="ft-briefing-ico" style="background-image:url('icon-leak.png')"></div>
            <div class="ft-briefing-ico" style="background-image:url('icon-override.png')"></div>
            <div class="ft-briefing-ico" style="background-image:url('icon-worker.png')"></div>
          </div>
        </div>
      </div>

      <div class="ft-briefing-goal">
        Goal: tap good controls, avoid traps, keep chaos down, pass levels.
      </div>
    </div>
  `;

  arena.appendChild(wrap);

  // short briefing (under 5 seconds)
  setTimeout(() => {
    wrap.remove();
    startRunNow();
  }, 3200);
}

function startRunNow() {
  clearGameTimers();
  removeDynamicNodes();
  teardownAuditMode();

  running = true;
  paused = false;
  intermission = false;
  gameEnded = false;
  mode = "tap";

  score = 0;
  level = 1;
  levelScore = 0;
  chaos = 0;
  streak = 0;
  missStreak = 0;
  emptyTapMissStreak = 0;
  breachLock = false;

  levelEpoch = 0;
  levelResolving = false;
  levelEndSnapshot = null;

  if (pauseBtn) pauseBtn.textContent = "Pause";
  setButtonsForRunState(true);

  beginLevel(1, false);
  startTickLoop();
}
  function showLevelCard(nextLevelNumber) {
   SFX.levelUp();
    intermission = true;

    const existing = arena.querySelector(".ft-level-card");
    if (existing) existing.remove();

    const n = document.createElement("div");
    n.className = "ft-level-card";
    n.innerHTML = `
      <div class="ft-level-card-inner">
        <div class="ft-level-card-kicker">LEVEL UP</div>
        <div class="ft-level-card-num">LEVEL ${nextLevelNumber}</div>
        <div class="ft-level-card-sub">Factory conditions worsening. Please proceed.</div>
      </div>
    `;
    arena.appendChild(n);

    clearTimer("levelCardTimer");
    levelCardTimer = setTimeout(() => {
      n.classList.add("out");
      setTimeout(() => {
        n.remove();
        intermission = false;
        if (running && !paused && !gameEnded) {
          startCurrentLevelMode();
        }
      }, 240);
    }, 700);
  }

  /* ==============================
     Tap mode objects
     ============================== */
  const GOOD_TYPES = ["vent", "coolant", "breaker", "purge"];
  const TRAP_TYPES = ["hotwire", "leak", "override", "worker"];

  function arenaRectSize() {
    const r = arena.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }

  function randomObjectPosition(size = 70, pad = 8) {
    const { w, h } = arenaRectSize();
    const x = rand(pad, Math.max(pad, w - size - pad));
    const y = rand(pad, Math.max(pad, h - size - pad));
    return { x, y };
  }

  function makeGoodTap(type) {
    const el = document.createElement("div");
    el.className = `target gtap-${type}`;
    el.dataset.kind = "good";
    el.dataset.gtap = type;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", `${type} control`);
    el.style.width = "70px";
    el.style.height = "70px";

    const ok = document.createElement("div");
    ok.className = "ok";
    ok.style.pointerEvents = "none";
    el.appendChild(ok);

    if (type === "vent") {
      const icon = document.createElement("div");
      icon.className = "icon";
      icon.style.pointerEvents = "none";
      const hub = document.createElement("div");
      hub.className = "hub";
      hub.style.pointerEvents = "none";
      el.append(icon, hub);
    } else if (type === "coolant") {
      const pipe = document.createElement("div");
      pipe.className = "pipe";
      pipe.style.pointerEvents = "none";
      const valve = document.createElement("div");
      valve.className = "valve";
      valve.style.pointerEvents = "none";
      el.append(pipe, valve);
    } else if (type === "breaker") {
      const panel = document.createElement("div");
      panel.className = "panel";
      panel.style.pointerEvents = "none";
      const sw = document.createElement("div");
      sw.className = "switch";
      sw.style.pointerEvents = "none";
      el.append(panel, sw);
    } else if (type === "purge") {
      const base = document.createElement("div");
      base.className = "base";
      base.style.pointerEvents = "none";
      const lever = document.createElement("div");
      lever.className = "lever";
      lever.style.pointerEvents = "none";
      el.append(base, lever);
    }

    const tag = document.createElement("div");
    tag.className = "tag";
    tag.textContent = ({
      vent: "VENT WHEEL",
      coolant: "COOLANT",
      breaker: "BREAKER",
      purge: "PURGE"
    })[type] || "CONTROL";
    tag.style.pointerEvents = "none";
    el.appendChild(tag);

    return el;
  }

  function makeTrapTap(type) {
    const el = document.createElement("div");
    el.className = `trap tt-${type}`;
    el.dataset.kind = "trap";
    el.dataset.trap = type;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", `${type} hazard`);
    el.style.width = "70px";
    el.style.height = "70px";

    const bad = document.createElement("div");
    bad.className = "bad";
    bad.style.pointerEvents = "none";
    el.appendChild(bad);

    if (type === "hotwire") {
      ["plate", "wireA", "wireB", "spark"].forEach((c) => {
        const n = document.createElement("div");
        n.className = c;
        n.style.pointerEvents = "none";
        el.appendChild(n);
      });
    } else if (type === "leak") {
      ["pipe", "crack", "drop"].forEach((c) => {
        const n = document.createElement("div");
        n.className = c;
        n.style.pointerEvents = "none";
        el.appendChild(n);
      });
    } else if (type === "override") {
      ["panel", "screen", "btn"].forEach((c) => {
        const n = document.createElement("div");
        n.className = c;
        n.style.pointerEvents = "none";
        el.appendChild(n);
      });
    } else if (type === "worker") {
      ["badge", "helmet", "head", "idline"].forEach((c) => {
        const n = document.createElement("div");
        n.className = c;
        n.style.pointerEvents = "none";
        el.appendChild(n);
      });
    }

    const tag = document.createElement("div");
    tag.className = "tag";
    tag.textContent = ({
      hotwire: "HOTWIRE",
      leak: "LEAK PIPE",
      override: "OVERRIDE",
      worker: "WORKER"
    })[type] || "HAZARD";
    tag.style.pointerEvents = "none";
    el.appendChild(tag);

    return el;
  }

  function bindTapObject(node, lifetimeMs, spawnEpoch) {
    const expireTimer = setTimeout(() => {
      if (!node.isConnected) return;

      if (!canMutateTapObject(spawnEpoch)) {
        // stale/invalid object should vanish quietly
        node.remove();
        return;
      }

      node.remove();

      missStreak += 1;
      emptyTapMissStreak += 1;
      streak = 0;

      // IMPORTANT FIX: do NOT reduce levelScore or total score on timeout miss.
      // Misses still punish via chaos + streak loss.
      addChaos(MISS_TIMEOUT_PENALTY, "timeoutMiss");
      setHint("Missed it. The facility noticed.");

      if (missStreak >= 3) {
        spawnAshBlast();
        spawnGlassCrack();
        missStreak = 0;
      }

      updateHUD();
    }, lifetimeMs);

    const handler = (e) => {
      if (!canMutateTapObject(spawnEpoch)) return;
      if (!node.isConnected) return;

      e.preventDefault?.();
      e.stopPropagation();

      clearTimeout(expireTimer);

      const rect = arena.getBoundingClientRect();
      const clientX = (e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? rect.left);
      const clientY = (e.clientY ?? (e.touches && e.touches[0]?.clientY) ?? rect.top);
      const cx = clientX - rect.left;
      const cy = clientY - rect.top;

      const kind = node.dataset.kind;
      const localType = node.dataset.gtap || node.dataset.trap || "";
      void localType;

      if (kind === "good") {
        SFX.goodTap();
        score += 1;
        levelScore += 1;
        streak += 1;
        missStreak = 0;
        emptyTapMissStreak = 0;

        reduceChaos(GOOD_TAP_RELIEF);
        if (streak > 0 && streak % STREAK_RELIEF_EVERY === 0) {
          reduceChaos(STREAK_BONUS_RELIEF);
          setHint("Competence detected. System briefly confused.");
        } else {
          setHint("Containment stabilized. Barely.");
        }

        flashObject(node, "hitPulse");
        node.classList.add("tapAnim");
        setTimeout(() => node.classList.remove("tapAnim"), 140);

      } else if (kind === "trap") {
        SFX.trapTap();
        streak = 0;
        missStreak = 0;
        emptyTapMissStreak = 0;

        addChaos(TRAP_TAP_PENALTY, "trapClick");
        setHint("Excellent. You touched the wrong thing.");

        doSparkPuff(cx, cy);
        node.classList.add("tapAnim");
        setTimeout(() => node.classList.remove("tapAnim"), 140);
      }

      node.remove();
      updateHUD();
    };

    // Better on mobile than click
    node.addEventListener("pointerdown", handler, { passive: false });
  }

  function spawnTapObject() {
    if (!running || paused || intermission || gameEnded) return;
    if (mode !== "tap" || levelResolving) return;

    const trapChance = trapChanceForLevel(level);
    const isTrap = Math.random() < trapChance;
    const spawnEpoch = levelEpoch;

    const node = isTrap ? makeTrapTap(choice(TRAP_TYPES)) : makeGoodTap(choice(GOOD_TYPES));
    const pos = randomObjectPosition(70, 8);

    node.style.left = `${pos.x}px`;
    node.style.top = `${pos.y}px`;
    node.style.position = "absolute";
    node.style.zIndex = "60";

    arena.appendChild(node);

    const lifetime = isTrap
  ? trapLifetimeForLevel(level)
  : goodLifetimeForLevel(level);

    bindTapObject(node, lifetime, spawnEpoch);
  }

  function startTapSpawnLoop() {
    clearTimer("spawnTimer");

    const scaled = clamp(SPAWN_INTERVAL_MS - (level - 1) * 25, 340, 650);

    spawnTimer = setInterval(() => {
      if (!running || paused || intermission || gameEnded) return;
      if (mode !== "tap" || levelResolving) return;

      spawnTapObject();
      if (level >= 5 && Math.random() < 0.20) spawnTapObject();
      if (level >= 7 && Math.random() < 0.12) spawnTapObject();
    }, scaled);

    // immediate feel
    spawnTapObject();
    spawnTapObject();
  }

  /* ==============================
     Scavenger / Audit Sweep mode
     ============================== */
  const AUDIT_ITEM_DEFS = {
    wrench: { label: "Wrench", sprite: "wrench", zones: ["bench", "floor"] },
    mug: { label: "Mug", sprite: "mug", zones: ["benchTop", "panelTop"] },
    bolts: { label: "Bolts", sprite: "bolts", zones: ["bench", "crate", "floor"] },
    fuse: { label: "Fuse", sprite: "fuse", zones: ["breakerWall", "partsTray"] },
    badge: { label: "Badge", sprite: "badge", zones: ["clipboard", "locker", "floor"] },
    tape: { label: "Tape", sprite: "tape", zones: ["bench", "crate"] },
    stamp: { label: "Stamp", sprite: "stamp", zones: ["clipboard", "desk"] },
    valvecap: { label: "Valve Cap", sprite: "valvecap", zones: ["pipeRun", "partsTray"] },
    rag: { label: "Oily Rag", sprite: "rag", zones: ["bench", "floor"] },
    key: { label: "Maintenance Key", sprite: "key", zones: ["desk", "panelTop"] }
  };

  // Lifted upward so items don't hide under the audit HUD
  const SCAV_ZONES = {
    pipeRun:     { x: [8, 85],  y: [6, 20] },
    breakerWall: { x: [58, 94], y: [18, 46] },
    panelTop:    { x: [60, 92], y: [16, 28] },
    benchTop:    { x: [12, 52], y: [46, 60] },
    bench:       { x: [10, 54], y: [50, 68] },
    desk:        { x: [34, 62], y: [46, 64] },
    clipboard:   { x: [70, 92], y: [48, 66] },
    crate:       { x: [60, 90], y: [62, 76] },
    partsTray:   { x: [48, 70], y: [52, 68] },
    locker:      { x: [6, 24],  y: [18, 48] },
    floor:       { x: [8, 92],  y: [58, 76] }
  };
  // Preferred “authored” hotspots inside zones (percent of arena)
// Items will try these first, then fall back to random within zone.
const SCAV_HOTSPOTS = {
  benchTop: [
    { x: 28, y: 52 }, // mug area
    { x: 40, y: 54 }, // tape/stamp
    { x: 20, y: 56 }  // rag
  ],
  breakerWall: [
    { x: 78, y: 30 }, // fuse near panel
    { x: 86, y: 34 }  // badge-ish near clipboard
  ],
  partsTray: [
    { x: 58, y: 60 }, // bolts/fuse/valvecap
    { x: 64, y: 62 }
  ],
  clipboard: [
    { x: 86, y: 56 }, // stamp/badge
    { x: 82, y: 58 }
  ],
  desk: [
    { x: 46, y: 54 }, // key/mug
    { x: 52, y: 56 }
  ],
  locker: [
    { x: 16, y: 34 }, // badge/key
    { x: 12, y: 40 }
  ],
  pipeRun: [
    { x: 22, y: 14 }, // valvecap
    { x: 58, y: 16 }
  ],
  crate: [
    { x: 78, y: 70 }, // tape/bolts
    { x: 70, y: 72 }
  ]
};
  function createAuditRoot() {
    const root = document.createElement("div");
    root.className = "ft-audit-root";
    root.setAttribute("aria-label", "Audit sweep scene");

    const bg = document.createElement("div");
    bg.className = "ft-audit-scene";

    const clutter = document.createElement("div");
    clutter.className = "ft-audit-clutter";
    clutter.setAttribute("aria-hidden", "true");

    const items = document.createElement("div");
    items.className = "ft-audit-items";

    root.append(bg, clutter, items);
    arena.appendChild(root);

    return { root, bg, clutter, items };
  }

  function createAuditHud() {
    const hud = document.createElement("div");
    hud.className = "ft-audit-hud";
    hud.innerHTML = `
      <div class="ft-audit-hud-left">
        <div class="ft-audit-title">AUDIT SWEEP</div>
        <div class="ft-audit-sub">Find the evidence before management arrives.</div>
      </div>
      <div class="ft-audit-hud-right">
        <div class="ft-audit-timer">Time: <span class="js-audit-time">0</span>s</div>
        <div class="ft-audit-progress"><span class="js-audit-found">0</span>/<span class="js-audit-total">0</span> found</div>
      </div>
      <div class="ft-audit-list js-audit-list"></div>
    `;
    arena.appendChild(hud);
    return hud;
  }

  function zonePoint(zoneName) {
  const { w, h } = arenaRectSize();

  // 1) Try authored hotspot first (70% of the time)
  const hs = SCAV_HOTSPOTS[zoneName];
  if (hs && hs.length && Math.random() < 0.7) {
    const pick = choice(hs);
    return {
      x: (pick.x / 100) * w,
      y: (pick.y / 100) * h
    };
  }

  // 2) Otherwise fall back to random point inside the zone rectangle
  const z = SCAV_ZONES[zoneName] || SCAV_ZONES.floor;
  const x = (rand(z.x[0], z.x[1]) / 100) * w;
  const y = (rand(z.y[0], z.y[1]) / 100) * h;
  return { x, y };
}

  function overlapsAny(box, others, pad = 10) {
    for (const o of others) {
      if (
        box.x < o.x + o.w + pad &&
        box.x + box.w + pad > o.x &&
        box.y < o.y + o.h + pad &&
        box.y + box.h + pad > o.y
      ) {
        return true;
      }
    }
    return false;
  }

  function makeAuditItemSprite(key) {
    const def = AUDIT_ITEM_DEFS[key];
    const node = document.createElement("button");
    node.type = "button";
    node.className = `ft-audit-item spr-${def.sprite}`;
    node.dataset.itemKey = key;
    node.setAttribute("aria-label", def.label);

    const deco = document.createElement("div");
    deco.className = "deco";
    deco.setAttribute("aria-hidden", "true");
    node.appendChild(deco);

    const addPart = (cls) => {
      const p = document.createElement("div");
      p.className = cls;
      p.style.pointerEvents = "none";
      node.appendChild(p);
      return p;
    };

    switch (def.sprite) {
      case "wrench": addPart("shaft"); addPart("head"); break;
      case "mug": addPart("cup"); addPart("handle"); break;
      case "bolts": addPart("b1"); addPart("b2"); addPart("b3"); break;
      case "fuse": addPart("body"); addPart("capL"); addPart("capR"); break;
      case "badge": addPart("plate"); addPart("clip"); break;
      case "tape": addPart("ring"); addPart("inner"); break;
      case "stamp": addPart("base"); addPart("handle"); break;
      case "valvecap": addPart("cap"); addPart("cross1"); addPart("cross2"); break;
      case "rag": addPart("cloth"); break;
      case "key": addPart("ring"); addPart("stem"); addPart("tooth"); break;
      default: addPart("blob");
    }

    node.style.pointerEvents = "auto";
    node.querySelectorAll("*").forEach((c) => (c.style.pointerEvents = "none"));

    return node;
  }

  function makeClutterProp(type) {
    const n = document.createElement("div");
    n.className = `ft-clutter ${type}`;
    n.setAttribute("aria-hidden", "true");
    n.style.pointerEvents = "none";
    return n;
  }

  function populateAuditClutter(layer) {
    const props = [
      "crate", "crate", "toolbox", "clipboard", "cablecoil",
      "rag", "tray", "tray", "cone", "coneSmall",
      "washerPile", "pipeJoint", "pipeJoint", "gauge",
      "bootprints", "smudge", "smudge", "partsbin",
      "weldmask", "canister", "ragSmall", "looseScrews"
    ];

    props.slice(0, AUDIT_CLUTTER_COUNT).forEach((type) => {
      const n = makeClutterProp(type);
      const p = zonePoint(choice(["floor", "bench", "crate", "breakerWall", "locker"]));
      n.style.left = `${p.x}px`;
      n.style.top = `${p.y}px`;
      n.style.zIndex = "20";
      layer.appendChild(n);
      audit.clutterNodes.push(n);
    });
  }

  function chooseAuditTargetsForLevel() {
    const allKeys = Object.keys(AUDIT_ITEM_DEFS);
    const total = Math.min(AUDIT_TARGETS_BY_LEVEL[level] ?? 5, allKeys.length);
    const shuffled = allKeys.slice().sort(() => Math.random() - 0.5);
    return shuffled.slice(0, total);
  }

  function renderAuditHudList() {
    if (!audit.hud) return;
    const list = audit.hud.querySelector(".js-audit-list");
    const foundEl = audit.hud.querySelector(".js-audit-found");
    const totalEl = audit.hud.querySelector(".js-audit-total");
    const timerEl = audit.hud.querySelector(".js-audit-time");
    if (!list || !foundEl || !totalEl || !timerEl) return;

    list.innerHTML = "";
    audit.targets.forEach((key) => {
      const chip = document.createElement("div");
      chip.className = "ft-audit-chip";
      if (audit.found.has(key)) chip.classList.add("found");
      chip.dataset.itemKey = key;
      chip.textContent = AUDIT_ITEM_DEFS[key].label;
      list.appendChild(chip);
    });

    foundEl.textContent = String(audit.found.size);
    totalEl.textContent = String(audit.targets.length);
    timerEl.textContent = String(Math.ceil(audit.timeLeft));
  }

  function placeAuditItems(itemsLayer) {
    const placedBoxes = [];

// --- MOBILE SAFE AREA: prevent audit items from spawning under the bottom HUD bar ---
const hudRect = audit.hud ? audit.hud.getBoundingClientRect() : null;
const bottomPad = hudRect ? (hudRect.height + 12) : 0;

 function safeY(y, itemH) {
  const rootRect = (audit.root || itemsLayer).getBoundingClientRect();
  const hudTopInRoot = hudRect ? (hudRect.top - rootRect.top) : arenaH;
  const maxY = Math.max(0, hudTopInRoot - 12 - itemH);
  return Math.min(y, maxY);
}

    // Target items
    for (const key of audit.targets) {
      const def = AUDIT_ITEM_DEFS[key];
      const node = makeAuditItemSprite(key);

      // Larger target item sizes (visibility/mobile)
      const sizes = {
  wrench: [72, 36],
  mug: [44, 52],
  bolts: [48, 36],
  fuse: [54, 26],
  badge: [42, 52],
  tape: [48, 48],
  stamp: [48, 44],
  valvecap: [54, 54],
  rag: [62, 40],
  key: [54, 28]
};
      const [w, h] = sizes[def.sprite] || [36, 24];
      node.style.width = `${w}px`;
      node.style.height = `${h}px`;

      // Strong preference: try the item's preferred zones multiple times before 
	const candidateZones = [...def.zones, ...def.zones, "floor"];
      let placed = false;

      for (let zi = 0; zi < candidateZones.length && !placed; zi++) {
        for (let tries = 0; tries < 24 && !placed; tries++) {
          const p = zonePoint(candidateZones[zi]);
          const box = { x: p.x, y: p.y, w, h };
          if (overlapsAny(box, placedBoxes, 10)) continue;

          node.style.left = `${p.x}px`;
          node.style.top = `${safeY(p.y, h)}px`;
          node.style.zIndex = "70";

          const onPick = (e) => {
            if (!running || paused || intermission || !audit.active || mode !== "audit" || levelResolving) return;
            e.preventDefault?.();
            e.stopPropagation();

            const itemKey = node.dataset.itemKey;
            if (!itemKey || audit.found.has(itemKey)) return;

            audit.found.add(itemKey);
            node.classList.add("found");
            renderAuditHudList();

            score += AUDIT_ITEM_POINTS;
            levelScore += AUDIT_ITEM_POINTS;
            reduceChaos(0.6);
            updateHUD();

            node.classList.add("pickup");
            setHint(`Recovered: ${AUDIT_ITEM_DEFS[itemKey].label}. Suspiciously normal.`);

            setTimeout(() => node.remove(), 140);

            if (audit.found.size >= audit.targets.length) {
              finishAuditSuccess();
            }
          };

          node.addEventListener("pointerdown", onPick, { passive: false });

          itemsLayer.appendChild(node);
          audit.itemNodes.push(node);
          placedBoxes.push(box);
          placed = true;
        }
      }

      if (!placed) {
        const p = zonePoint("floor");
        node.style.left = `${p.x}px`;
        node.style.top = `${safeY(p.y, h)}px`;
        node.style.zIndex = "70";
        itemsLayer.appendChild(node);
        audit.itemNodes.push(node);
      }
    }

    // Decoys (larger too)
    const decoys = ["bolts", "mug", "rag", "fuse", "tape", "wrench", "key"];
    const decoyCount = 8;

    for (let i = 0; i < decoyCount; i++) {
      const sprite = choice(decoys);
      const n = makeAuditItemSprite(sprite);
      n.classList.add("decoy");
      n.disabled = true;
      n.tabIndex = -1;
      n.setAttribute("aria-hidden", "true");
      n.style.pointerEvents = "none";
      n.querySelectorAll("*").forEach((c) => c.style.pointerEvents = "none");

      const sizeMap = {
        wrench: [50, 24],
        mug: [30, 36],
        bolts: [32, 24],
        fuse: [38, 18],
        rag: [42, 24],
        tape: [32, 32],
        key: [38, 20]
      };
      const [w, h] = sizeMap[sprite] || [28, 18];
      n.style.width = `${w}px`;
      n.style.height = `${h}px`;

      let placed = false;
      for (let tries = 0; tries < 20 && !placed; tries++) {
        const p = zonePoint(choice(["bench", "floor", "crate", "partsTray", "desk"]));
        const box = { x: p.x, y: p.y, w, h };
        if (overlapsAny(box, placedBoxes, 8)) continue;
        n.style.left = `${p.x}px`;
        n.style.top = `${safeY(p.y, h)}px`;
        n.style.zIndex = "62";
        itemsLayer.appendChild(n);
        placedBoxes.push(box);
        placed = true;
      }
      audit.itemNodes.push(n);
    }
  }

  function startAuditMode() {
    mode = "audit";
    audit.active = true;
    audit.found = new Set();
    audit.targets = chooseAuditTargetsForLevel();
    audit.timeLeft = getAuditTimeForLevel(level);

    clearTapObjects();
    arena.classList.add("audit-mode");

    const { root, clutter, items } = createAuditRoot();
    audit.root = root;

    populateAuditClutter(clutter);
    audit.hud = createAuditHud();
    audit.root.appendChild(audit.hud);
    renderAuditHudList();
    placeAuditItems(items);

    setHint("AUDIT SWEEP: locate missing items before blame is assigned.");
  }

  function teardownAuditMode() {
    arena.classList.remove("audit-mode");

    if (audit.root) audit.root.remove();
    if (audit.hud) audit.hud.remove();

    audit = {
      active: false,
      timeLeft: 0,
      targets: [],
      found: new Set(),
      root: null,
      hud: null,
      itemNodes: [],
      clutterNodes: []
    };
  }

  function updateAuditHudTime() {
    if (!audit.hud) return;
    const timerEl = audit.hud.querySelector(".js-audit-time");
    if (timerEl) timerEl.textContent = String(Math.ceil(audit.timeLeft));
  }

  function finishAuditSuccess() {
    if (!audit.active || levelResolving) return;

    levelResolving = true;
    levelEndSnapshot = {
      level,
      levelScore, // includes found items
      score,
      mode: "audit-success"
    };

    // no completion bonus here; item points already define audit pass scoring
    reduceChaos(1.0);
    updateHUD();

    setHint("Audit passed. Evidence relocated. Carry on.");

    // Freeze a final snapshot after bonus
    levelEndSnapshot = {
      level,
      levelScore,
      score,
      mode: "audit-success"
    };

    teardownAuditMode();
    resolveLevelEndWithSnapshot();
  }

  function finishAuditTimeout() {
    if (!audit.active || levelResolving) return;

    levelResolving = true;
    levelEndSnapshot = {
      level,
      levelScore,
      score,
      mode: "audit-timeout"
    };

    addChaos(1.5, "auditTimeout");
    setHint("Audit failed. Everything looked incriminating.");

    teardownAuditMode();
    resolveLevelEndWithSnapshot();
  }

  /* ==============================
     Level flow / progression
     ============================== */
  function scoreNeededToAdvance(currentLevel) {
  if (currentLevel >= MAX_LEVEL) return Infinity;

  // Keep the authored early curve for Levels 1–7
  const preset = LEVEL_TARGET_SCORE[currentLevel];
  if (Number.isFinite(preset)) return preset;

  // Levels 8–40: gentler ramp (playable with time scaling)
  // Level 8 starts around 20 and increases slowly.
  const extra = currentLevel - 7;
  return Math.round(18 + extra * 1.15);
}

  function isAuditLevel(lvl) {
    return AUDIT_LEVELS.has(lvl);
  }

  function setupLevelStateForNewLevel() {
    levelEpoch += 1;           // critical stale-timer guard
    levelResolving = false;
    levelEndSnapshot = null;

    // Tap levels get slightly more time after Level 7 so targets remain achievable.
    const tapTime =
  level <= 7
    ? (BASE_LEVEL_TIME + ((level === 5 || level === 6) ? 3 : 0))
    : clamp(BASE_LEVEL_TIME + (level - 7) * 0.7, BASE_LEVEL_TIME, 26);

levelTimeLeft = isAuditLevel(level)
  ? getAuditTimeForLevel(level)
  : tapTime;

    levelScore = 0;
    streak = 0;
    missStreak = 0;
    emptyTapMissStreak = 0;
    breachLock = false;

    chaos = 0;
    updateChaosBar();

    clearTapObjects();
    teardownAuditMode();
  }

  function startCurrentLevelMode() {
    if (!running || paused || gameEnded || levelResolving) return;
    const mutation = LEVEL_MUTATIONS[level] || null;

    if (isAuditLevel(level)) {
  startAuditMode();

  // Emergency Audit: keep spawning tap targets during audit
  if (mutation === "emergency_audit") {
    startTapSpawnLoop();
  }
}
      else {
      mode = "tap";
      arena.classList.remove("audit-mode");
      // Apply level mutation if present
if (mutation === "flicker") {
  arena.classList.add("flicker-mode");
} else {
  arena.classList.remove("flicker-mode");
}

if (mutation === "mirror") {
  arena.classList.add("mirror-mode");
} else {
  arena.classList.remove("mirror-mode");
}
if (mutation === "drift") {
  arena.classList.add("drift-mode");
} else {
  arena.classList.remove("drift-mode");
}
if (mutation === "emergency_audit") {
  arena.classList.add("emergency-audit-mode");
} else {
  arena.classList.remove("emergency-audit-mode");
}

if (mutation === "meltdown") {
  chaos = CHAOS_MAX * 0.9;
  updateChaosBar();
}
      startTapSpawnLoop();

      const needed = scoreNeededToAdvance(level);
      setHint(
        level < MAX_LEVEL
          ? `LEVEL ${level}: Score ${needed} to advance. Try not to unionize the explosions.`
          : `LEVEL ${level}: Final shift. Survive and outperform your bad decisions.`
      );
    }

    updateHUD();
  }

  function beginLevel(levelNumber, showCard = false) {
    level = clamp(levelNumber, 1, MAX_LEVEL);
    setupLevelStateForNewLevel();
    updateHUD();

    if (showCard) {
      showLevelCard(level);
    } else {
      startCurrentLevelMode();
    }
  }

  function beginLevelResolution(reason = "timeout") {
    if (!running || gameEnded) return;
    if (levelResolving) return;

    levelResolving = true;
    levelEndSnapshot = {
      level,
      levelScore,  // frozen gate value
      score,
      reason
    };

    clearTimer("spawnTimer");
    clearTapObjects();

    resolveLevelEndWithSnapshot();
  }

  function resolveLevelEndWithSnapshot() {
    if (!levelEndSnapshot) {
      levelResolving = false;
      return;
    }

    const snap = levelEndSnapshot;
    const needed = scoreNeededToAdvance(snap.level);

    // final level complete
    if (snap.level >= MAX_LEVEL) {
      endGame(true);
      return;
    }

    if (snap.levelScore >= needed) {
      const next = snap.level + 1;
      beginLevel(next, true);
    } else {
      endGame(false);
    }
  }

  /* ==============================
     Main game clock
     ============================== */
  function startTickLoop() {
    clearTimer("tickTimer");

    tickTimer = setInterval(() => {
      if (!running || paused || intermission || gameEnded || levelResolving) return;

      levelTimeLeft = Math.max(0, levelTimeLeft - (TICK_MS / 1000));

      if (mode === "tap") {
        const perTick = PASSIVE_CHAOS_PER_SEC * (TICK_MS / 1000);
        addChaos(perTick, "passive");
      } else if (mode === "audit" && audit.active) {
        audit.timeLeft = Math.max(0, levelTimeLeft);
      }

      updateHUD();
      if (mode === "audit") updateAuditHudTime();

      if (levelTimeLeft <= 0) {
        if (mode === "audit") {
          finishAuditTimeout();
        } else {
          beginLevelResolution("timeout");
        }
      }
    }, TICK_MS);
  }

  /* ==============================
     Input handlers
     ============================== */
  function arenaEmptyClickHandler(e) {
    if (!running || paused || intermission || gameEnded || levelResolving) return;

    const target = e.target;
    if (target && (target.closest(".target") || target.closest(".trap") || target.closest(".ft-audit-item"))) return;

    if (mode === "audit") return;

    const rect = arena.getBoundingClientRect();
    const x = (e.clientX ?? rect.left) - rect.left;
    const y = (e.clientY ?? rect.top) - rect.top;

    doAshPuff(x, y);
    SFX.emptyTap();

    addChaos(EMPTY_TAP_PENALTY, "emptyTap");
    streak = 0;
    emptyTapMissStreak += 1;

    setHint("Empty tap. Excellent strategy for accelerating doom.");
  }

  function togglePause() {
    if (!running || gameEnded || intermission || levelResolving) return;
    paused = !paused;
    if (paused) SFX.pause();
    else SFX.resume();
    if (pauseBtn) pauseBtn.textContent = paused ? "Resume" : "Pause";

    if (paused) {
      showPauseBanner();
      setHint('PAUSED. "Temporary compliance with collapse."');
    } else {
      hidePauseBanner();
      const needed = scoreNeededToAdvance(level);
      if (mode === "audit") {
        setHint("AUDIT SWEEP resumed. Pretend you know what you're doing.");
      } else {
        setHint(`LEVEL ${level}: ${levelScore}/${needed} points this shift.`);
      }
    }
  }

  function restartRun() {
    clearGameTimers();
    removeDynamicNodes();
    teardownAuditMode();

    running = false;
    paused = false;
    intermission = false;
    gameEnded = false;
    mode = "tap";

    score = 0;
    level = 1;
    levelScore = 0;
    levelTimeLeft = BASE_LEVEL_TIME;
    chaos = 0;
    streak = 0;
    missStreak = 0;
    emptyTapMissStreak = 0;
    breachLock = false;

    levelEpoch = 0;
    levelResolving = false;
    levelEndSnapshot = null;

    if (pauseBtn) pauseBtn.textContent = "Pause";
    hidePauseBanner();
    setButtonsForRunState(false);
    updateHUD();
    setHint("PRESS BEGIN TO DELAY COLLAPSE.");
    showOverlay("FINAL TAP", "Every tap delays the inevitable.", "INITIATE CONTAINMENT");
  }

  function startGame() {
  hideOverlay();

  // Intro slides → then the existing icon briefing → then the run
  showIntroThenBriefingThenStart();
}

  function endGame(victory = false) {
    if (gameEnded) return;

    gameEnded = true;
    running = false;
    paused = false;
    intermission = false;
    levelResolving = false;

    clearGameTimers();
    clearTapObjects();
    hidePauseBanner();
    teardownAuditMode();
    saveBest();

    setButtonsForRunState(false);
    startBtn.disabled = false;

    const summary =
      victory
        ? `Shift survived. Final Score: ${score}. Level ${level} cleared.`
        : `Containment failed. Final Score: ${score}. Reached Level ${level}.`;

    showOverlay(
      victory ? "SHIFT REPORT: UNEXPECTED SUCCESS" : "CONTAINMENT REPORT",
      summary,
      "RESTART CONTAINMENT"
    );

    setHint(victory ? "You made it. HR wants a word." : "Everything is under control (statement pending).");
  }

  /* ==============================
     Wiring
     ============================== */
  startBtn.addEventListener("click", () => {
  SFX.unlock();
  startGame();
});

if (overlayStart) {
  overlayStart.addEventListener("click", () => {
    SFX.unlock();
    startGame();
  });
}

  if (pauseBtn) pauseBtn.addEventListener("click", togglePause);
  if (restartBtn) restartBtn.addEventListener("click", restartRun);

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      localStorage.removeItem(BEST_KEY);
      loadBest();
      setHint("Best score reset. Corporate memory wiped.");
    });
  }

  // pointerdown feels better on mobile; click kept as fallback
  arena.addEventListener("pointerdown", arenaEmptyClickHandler, { passive: true });
  arena.addEventListener("click", arenaEmptyClickHandler, { passive: true });

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      if (e.target && /input|textarea|button/i.test(e.target.tagName)) return;
      e.preventDefault();
      if (running) togglePause();
    }
  });

  /* ==============================
     Init
     ============================== */
  setBuildTag();
  loadBest();

  level = 1;
  score = 0;
  levelScore = 0;
  levelTimeLeft = BASE_LEVEL_TIME;
  chaos = 0;
  updateHUD();

  setButtonsForRunState(false);
  setHint("PRESS BEGIN TO DELAY COLLAPSE.");
  showOverlay("FINAL TAP", "Every tap delays the inevitable.", "INITIATE CONTAINMENT");
})();
