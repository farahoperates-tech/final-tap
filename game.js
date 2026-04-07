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
   Corridor SFX (Web Audio, no files)
   ============================== */
const CORRIDOR_SFX = (() => {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }

  function unlock() {
    try { ensure(); if (ctx && ctx.state === "suspended") ctx.resume(); } catch (_) {}
  }

  function ready() {
    ensure();
    if (!ctx || !master) return false;
    if (ctx.state === "suspended") ctx.resume();
    return true;
  }

  // Low distant rumble/moan — worker approaching
  function spawn() {
    if (!ready()) return;
    const t0 = ctx.currentTime;
    const osc  = ctx.createOscillator();
    const filt = ctx.createBiquadFilter();
    const g    = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(65, t0);
    osc.frequency.linearRampToValueAtTime(80, t0 + 0.3);
    osc.frequency.linearRampToValueAtTime(52, t0 + 0.75);
    filt.type = "lowpass";
    filt.frequency.value = 260;
    filt.Q.value = 2.2;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.35, t0 + 0.14);
    g.gain.linearRampToValueAtTime(0, t0 + 0.85);
    osc.connect(filt); filt.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + 0.9);
  }

  // Short soft pfft/whoosh — dart fired
  function dartShoot() {
    if (!ready()) return;
    const t0  = ctx.currentTime;
    const dur = 0.12;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
    const src  = ctx.createBufferSource();
    src.buffer = buf;
    const bp   = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(3400, t0);
    bp.frequency.exponentialRampToValueAtTime(820, t0 + dur);
    bp.Q.value = 1.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.32, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  // Bright two-note chime — worker cured
  function workerCured() {
    if (!ready()) return;
    const t0 = ctx.currentTime;
    [[880, 0], [1320, 0.09]].forEach(([freq, delay]) => {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0 + delay);
      g.gain.exponentialRampToValueAtTime(0.48, t0 + delay + 0.007);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 0.30);
      osc.connect(g); g.connect(master);
      osc.start(t0 + delay); osc.stop(t0 + delay + 0.34);
    });
  }

  // Wet hiss spray + low droning wobble — worker attacks
  function workerAttack() {
    if (!ready()) return;
    const t0 = ctx.currentTime;

    // Hiss spray
    const hDur = 0.30;
    const hLen = Math.floor(ctx.sampleRate * hDur);
    const hBuf = ctx.createBuffer(1, hLen, ctx.sampleRate);
    const hd   = hBuf.getChannelData(0);
    for (let i = 0; i < hLen; i++) hd[i] = (Math.random() * 2 - 1);
    const hSrc = ctx.createBufferSource();
    hSrc.buffer = hBuf;
    const hFilt = ctx.createBiquadFilter();
    hFilt.type = "bandpass";
    hFilt.frequency.setValueAtTime(4800, t0);
    hFilt.frequency.exponentialRampToValueAtTime(1100, t0 + hDur);
    hFilt.Q.value = 0.7;
    const hGain = ctx.createGain();
    hGain.gain.setValueAtTime(0.52, t0);
    hGain.gain.exponentialRampToValueAtTime(0.0001, t0 + hDur);
    hSrc.connect(hFilt); hFilt.connect(hGain); hGain.connect(master);
    hSrc.start(t0); hSrc.stop(t0 + hDur + 0.02);

    // Low drone with wobble
    const dOsc  = ctx.createOscillator();
    const lfo   = ctx.createOscillator();
    const lfoG  = ctx.createGain();
    const dFilt = ctx.createBiquadFilter();
    const dGain = ctx.createGain();
    dOsc.type = "sawtooth";
    dOsc.frequency.value = 76;
    lfo.type = "sine";
    lfo.frequency.value = 5.2;
    lfoG.gain.value = 7;
    lfo.connect(lfoG); lfoG.connect(dOsc.frequency);
    dFilt.type = "lowpass";
    dFilt.frequency.value = 340;
    dGain.gain.setValueAtTime(0, t0 + 0.06);
    dGain.gain.linearRampToValueAtTime(0.28, t0 + 0.20);
    dGain.gain.linearRampToValueAtTime(0, t0 + 0.72);
    dOsc.connect(dFilt); dFilt.connect(dGain); dGain.connect(master);
    dOsc.start(t0 + 0.06); dOsc.stop(t0 + 0.75);
    lfo.start(t0 + 0.06); lfo.stop(t0 + 0.75);
  }

  return { unlock, spawn, dartShoot, workerCured, workerAttack };
})();

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
  let lives = 0;
  let level = 1;
  let levelTimeLeft = BASE_LEVEL_TIME;
  let levelScore = 0;   // score earned in current level (gate value)
  let chaos = 0;
  let streak = 0;

  let breachLock = false;
  let gameEnded = false;
  let interventionActive = false;
  let firstEvilClick = true;
  let interventionTimeout = null;
  let currentIntervention = null;
  let evilClickCount = 0;
  let integration = 0;
  const integrationMax = 20;

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

  // Sector 20 / corridor state
  let corridorActive = false;
  let corridorPaused = false;
  let corridorLives = 3;
  let corridorDarts = 5;
  let corridorHealth = 100;
  let corridorTimeLeft = 45;
  let corridorCureCount = 0;
  let corridorWorkers = [];
  let corridorSpawnTimer = null;
  let corridorTickTimer = null;
  let corridorMoveTimer = null;
  let corridorRogueDarts = [];
  let corridorRogueDartTimer = null;
  let corridorRogueDartIdSeq = 0;
  let corridorNextLevel = 20;
  let corridorEl = null;
  let corridorWorkerIdSeq = 0;
  let corridorTouchHandler = null;
  let sector20Unlocked = false;
  let sector20Cleared = false;
  let descentUnlocked = false;
  let descentCleared = false;

  /* ==============================
     Utility
     ============================== */
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }
 

  function livesDisplay() {
  if (level < 10) return "";
  if (lives <= 0) return " | Lives: ";
  return " | Lives: " + Array.from({ length: lives }, () => '<span class="ft-life-pip"></span>').join("");
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

  chaosFill.classList.remove("chaos-high", "chaos-critical");
  arena.classList.remove("arena-chaos-warning", "arena-chaos-critical", "chaos-glitch");

  if (pct >= 85) {
    chaosFill.classList.add("chaos-critical");
    arena.classList.add("arena-chaos-critical", "chaos-glitch");
  } else if (pct >= 60) {
    chaosFill.classList.add("chaos-high");
    arena.classList.add("arena-chaos-warning");
  }
}

  function updateIntegrationBar() {
    const fill = document.getElementById("integrationFill");
    if (!fill) return;
    const pct = clamp((integration / integrationMax) * 100, 0, 100);
    fill.style.width = `${pct}%`;
    // Interpolate from dark grey (0%) to biohazard yellow (100%)
    const r = Math.round(40 + (200 - 40) * (pct / 100));
    const g = Math.round(40 + (180 - 40) * (pct / 100));
    const b = Math.round(40 * (1 - pct / 100));
    fill.style.background = `rgba(${r},${g},${b},0.9)`;
  }

  function addIntegration(amount) {
    if (level < 10) return;
    integration = clamp(integration + amount, 0, integrationMax);
    updateIntegrationBar();
    if (integration >= integrationMax * 0.75) {
      document.body.classList.add("integration-warning");
    }
    if (integration >= integrationMax) {
      showAbsorptionScreen();
    }
  }

  function setHint(msg) {
  if (!hintEl) return;
  hintEl.innerHTML = msg + livesDisplay();
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
    
    const severityText = level <= 2
  ? "MINOR INCIDENT. PAPERWORK MULTIPLIED."
  : level <= 4
    ? "CONTAINMENT BREACH. MANAGEMENT BLAMING INTERNS."
    : level <= 6
      ? "FACILITY INCIDENT ESCALATION. PLEASE LOOK BUSY."
      : "REACTOR MELTDOWN EVENT. PUBLIC RELATIONS UNAVAILABLE.";

setHint(`⚠️ ${severityText}`);

    chaos = CHAOS_BREACH_RESET;
    updateChaosBar();
    breachLock = true;
    setTimeout(() => { breachLock = false; }, 300);
  }

  /* ==============================
     Intervention system
     ============================== */
  const INTERVENTIONS = [
    { file: "intervention-coolant.png",            label: "EMERGENCY COOLANT",    type: "good", effect: "reduceChaos" },
    { file: "intervention-backup-operator.png",    label: "BACKUP OPERATOR",      type: "good", effect: "addLife" },
    { file: "intervention-manual-override.png",    label: "MANUAL OVERRIDE",      type: "evil", effect: "chaosSpike" },
    { file: "intervention-system-purge.png",       label: "SYSTEM PURGE",         type: "evil", effect: "scoreDrain" },
    { file: "intervention-compliance-check.png",   label: "COMPLIANCE CHECK",     type: "evil", effect: "chaosDrain" },
    { file: "intervention-pressure-vent.png",      label: "PRESSURE VENT",        type: "evil", effect: "spawnTraps" },
    { file: "intervention-worker-reassignment.png",label: "WORKER REASSIGNMENT",  type: "evil", effect: "spawnWorkers" },
    { file: "intervention-thermal-boost.png",      label: "THERMAL BOOST",        type: "evil", effect: "speedUp" },
    { file: "intervention-signal-calibration.png", label: "SIGNAL CALIBRATION",   type: "evil", effect: "reverseControls" },
    { file: "intervention-containment-drill.png",  label: "CONTAINMENT DRILL",    type: "evil", effect: "fakeCalmThenSpike" }
  ];

  function showLoreFloat(msg) {
    const el = document.createElement("div");
    el.className = "ft-lore-float";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }

  const LIFE_LOST_MESSAGES = [
    "LIFE LOST.\nThe facility is disappointed.",
    "OPERATOR DOWN.\nReconstitution in progress.",
    "BRAIN TISSUE DEGRADED.\nContinuity protocol engaged.",
    "NEURAL LAPSE DETECTED.\nThe factory notes your failure.",
    "CONTAINMENT LAPSE.\nYour record has been updated.",
  ];

  function showLifeLostFlash(onDone) {
    const msg = LIFE_LOST_MESSAGES[Math.floor(Math.random() * LIFE_LOST_MESSAGES.length)];
    const el = document.createElement("div");
    el.className = "ft-life-lost-flash";
    el.innerHTML = msg.replace("\n", "<br>");
    document.body.appendChild(el);
    // Fade out after 1.6s, remove and continue after 2s
    setTimeout(() => el.classList.add("ft-life-lost-flash--out"), 1600);
    setTimeout(() => { el.remove(); onDone(); }, 2000);
  }

  function showIntervention() {
    const entry = choice(INTERVENTIONS);
    const panel = document.getElementById("interventionPanel");
    const icon = document.getElementById("interventionIcon");
    const btn = document.getElementById("interventionBtn");
    if (!panel || !icon || !btn) return;

    icon.src = "assets/interventions/" + entry.file;
    btn.textContent = entry.label;
    currentIntervention = entry;
    panel.classList.remove("hidden");
    interventionActive = true;
    interventionTimeout = setTimeout(hideIntervention, 2500);
  }

  function hideIntervention() {
    const panel = document.getElementById("interventionPanel");
    if (panel) panel.classList.add("hidden");
    interventionActive = false;
    clearTimeout(interventionTimeout);
    interventionTimeout = null;
  }

  /* ==============================
     Small FX for taps / misses
     ============================== */
function doAshPuff(x, y) {
  const puff = document.createElement("div");
  puff.className = "ft-ash-puff";

  Object.assign(puff.style, {
    position: "absolute",
    left: `${x}px`,
    top: `${y}px`,
    width: "52px",
    height: "52px",
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(210,210,210,0.82) 28%, rgba(120,120,120,0.42) 58%, rgba(80,80,80,0) 78%)",
    boxShadow: "0 0 22px rgba(255,255,255,0.45)",
    transform: "translate(-50%, -50%) scale(0.55)",
    opacity: "1",
    pointerEvents: "none",
    zIndex: "120",
    transition: "transform 240ms ease-out, opacity 240ms ease-out"
  });

  arena.appendChild(puff);

  requestAnimationFrame(() => {
    puff.style.transform = "translate(-50%, -50%) scale(1.45)";
    puff.style.opacity = "0";
  });

  setTimeout(() => puff.remove(), 260);
}

 function doSparkPuff(x, y) {
  const fx = document.createElement("div");
  fx.className = "ft-spark-puff";

  Object.assign(fx.style, {
    position: "absolute",
    left: `${x}px`,
    top: `${y}px`,
    width: "34px",
    height: "34px",
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(255,245,180,1) 0%, rgba(255,210,70,0.95) 28%, rgba(255,120,20,0.55) 55%, rgba(255,120,20,0) 78%)",
    boxShadow: "0 0 16px rgba(255,210,70,0.75)",
    transform: "translate(-50%, -50%) scale(0.7)",
    opacity: "1",
    pointerEvents: "none",
    zIndex: "121",
    transition: "transform 180ms ease-out, opacity 180ms ease-out"
  });

  arena.appendChild(fx);

  requestAnimationFrame(() => {
    fx.style.transform = "translate(-50%, -50%) scale(1.35)";
    fx.style.opacity = "0";
  });

  setTimeout(() => fx.remove(), 200);
}

function doTrapSlap() {
  const fx = document.createElement("div");
  fx.className = "ft-trap-slap";
  arena.appendChild(fx);
  setTimeout(() => fx.remove(), 190);
}

function doTrapFlash() {
  const fx = document.createElement("div");
  fx.className = "ft-trap-flash";
  arena.appendChild(fx);
  setTimeout(() => fx.remove(), 190);
}

function shakeArenaTrap() {
  const seq = [
    "translate(0,0)",
    "translate(-6px,2px)",
    "translate(5px,-2px)",
    "translate(-4px,1px)",
    "translate(3px,-1px)",
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
  }, 24);
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
  },
  {
    subtitle: "REACTOR EVENT LOG — 00:04:17",
    title: "EVERYTHING IS FINE",
    text: "It is not fine.",
    img: "intro-3.png"
  },
  {
    subtitle: "FACILITY COMMUNICATION",
    title: "WE SEE YOU.",
    text: "You are not alone in here. You never were.",
    img: "intro-4.png"
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
      node.remove();
      return;
    }

    node.remove();

    missStreak += 1;
    emptyTapMissStreak += 1;
    streak = 0;

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

      // Immediately advance if the score threshold is reached — no need to wait for timer
      if (mode === "tap" && !levelResolving && levelScore >= scoreNeededToAdvance(level)) {
        beginLevelResolution("score");
        return;
      }

      flashObject(node, "hitPulse");
      doSparkPuff(cx, cy);
      node.classList.add("tapAnim");
      setTimeout(() => node.classList.remove("tapAnim"), 140);

    } else if (kind === "trap") {
      SFX.trapTap();
      streak = 0;
      missStreak = 0;
      emptyTapMissStreak = 0;

      addChaos(TRAP_TAP_PENALTY, "trapClick");
      setHint("Excellent. You touched the wrong thing.");

      doTrapFlash();
      addBodyFlash();
      spawnAshBlast();
      shakeArenaTrap();

      node.classList.add("tapAnim");
      node.classList.add("trapHitPulse");
      setTimeout(() => {
        node.classList.remove("tapAnim");
        node.classList.remove("trapHitPulse");
      }, 140);
    }

    node.remove();
    updateHUD();
  };

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
    teardownAuditMode();
    setHint("Audit failed. Everything looked incriminating.");
    addChaos(1.5, "auditTimeout");

    const earlyHunts = [4, 7, 12, 18];
    const lateHunts = [25, 33, 40];

    if (earlyHunts.includes(level)) {
      const wrap = document.createElement("div");
      wrap.className = "ft-sector-choice";
      wrap.innerHTML = `
        <div class="ft-sector-choice-card">
          <div class="ft-sector-choice-alert">AUDIT INCOMPLETE</div>
          <div class="ft-sector-choice-title">MANAGEMENT IS DISAPPOINTED.</div>
          <div class="ft-sector-choice-sub">You have one more chance to locate the evidence.</div>
          <div class="ft-sector-choice-buttons">
            <button class="ft-checkpoint-btn-sector" type="button">RETRY AUDIT</button>
          </div>
        </div>
      `;
      document.body.appendChild(wrap);
      wrap.querySelector('.ft-checkpoint-btn-sector').onclick = () => {
        wrap.remove();
        levelResolving = false;
        beginLevel(level, false);
        startTickLoop();
      };
    } else if (lateHunts.includes(level)) {
      const wrap = document.createElement("div");
      wrap.className = "ft-sector-choice";
      wrap.innerHTML = `
        <div class="ft-sector-choice-card">
          <div class="ft-sector-choice-alert">JUDGMENT INITIATED</div>
          <div class="ft-sector-choice-title">YOU HAVE BEEN FOUND LACKING.</div>
          <div class="ft-sector-choice-sub">The Factory has deemed your soul unworthy of passage. You will be sent to the Purgatory of the Factory — THE PIT. Prove yourself pure. Endure the suffering. Only then shall the Factory grant you mercy and a second chance at your audit. Fail the Pit and you return to the very beginning. The Factory does not forgive twice.</div>
          <div class="ft-sector-choice-buttons">
            <button class="ft-checkpoint-btn-sector" type="button">ACCEPT JUDGMENT</button>
          </div>
        </div>
      `;
      document.body.appendChild(wrap);
      wrap.querySelector('.ft-checkpoint-btn-sector').onclick = () => {
        wrap.remove();
        startThePit(level);
      };
    } else {
      levelResolving = false;
      beginLevel(level, false);
      startTickLoop();
    }
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

if (level >= 10 && lives <= 0) {
  lives = 3;
}

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

      // Integration checkpoint — appears exactly once after level 19
      if (snap.level === 19) {
        showIntegrationCheckpoint(next);
        return;
      }

      // The Descent — appears once after level 39
      if (snap.level === 39) {
        showDescentChoice(next);
        return;
      }

      // GEHENNA — triggers on Kabbalah levels where digits sum to 7
      if ([16,34,43,52,61,70,79,88,97].includes(snap.level)) {
        showGehennaChoice(next);
        return;
      }

      // Sector 20 random re-appearance after level 20 once unlocked
      if (sector20Unlocked && snap.level > 20 && Math.random() < 0.25) {
        showSector20Choice(next);
        return;
      }

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

      if (mode === "tap" && !interventionActive && level >= 11 && Math.random() < 0.005) {
        showIntervention();
      }

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

    // Clean up any lingering overlay screens from the previous run
    document.querySelectorAll(
      ".ft-absorption-screen, .ft-corridor, .ft-integration-checkpoint, " +
      ".ft-integration-transition, .ft-sector-choice, .ft-sector-briefing"
    ).forEach(n => n.remove());

    running = false;
    paused = false;
    intermission = false;
    gameEnded = false;
    mode = "tap";

    score = 0;
    level = 1;
    lives = 0;
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

    // Reset integration and intervention state so absorption can't retrigger
    integration = 0;
    updateIntegrationBar();
    document.body.classList.remove("integration-warning");
    interventionActive = false;
    currentIntervention = null;
    evilClickCount = 0;
    firstEvilClick = true;
    if (interventionTimeout) { clearTimeout(interventionTimeout); interventionTimeout = null; }

    // Reset sector flags
    sector20Cleared = false;
    sector20Unlocked = false;

    // Reset corridor state
    corridorActive = false;
    corridorPaused = false;
    corridorWorkers = [];

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

  if (!victory && level >= 10 && lives > 0) {
    lives -= 1;
    addIntegration(1);

    if (lives > 0) {
      clearGameTimers();
      clearTapObjects();
      hidePauseBanner();
      teardownAuditMode();

      running = true;
      paused = false;
      intermission = false;
      gameEnded = false;
      levelResolving = false;

      chaos = CHAOS_MAX * 0.5;
      updateChaosBar();

      setButtonsForRunState(true);
      if (pauseBtn) pauseBtn.textContent = "Pause";

      const resumeLevel = level;
      showLifeLostFlash(() => {
        if (!gameEnded) {
          setHint("Operator continuity restored. Brain tissue degraded.");
          beginLevel(resumeLevel, false);
          startTickLoop();
        }
      });
      return;
    }
  }

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

  function showAbsorptionScreen() {
    document.querySelectorAll(".ft-absorption-screen").forEach((n) => n.remove());

    const wrap = document.createElement("div");
    wrap.className = "ft-absorption-screen";
    Object.assign(wrap.style, {
      position: "fixed",
      inset: "0",
      zIndex: "3000",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "flex-end",
      background: "#000",
      paddingBottom: "48px"
    });

    const img = document.createElement("img");
    img.src = "gameover-absorbed.png";
    Object.assign(img.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      objectFit: "cover",
      objectPosition: "center"
    });

    const textWrap = document.createElement("div");
    Object.assign(textWrap.style, {
      position: "relative",
      zIndex: "1",
      textAlign: "center",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "10px"
    });

    const title = document.createElement("div");
    title.textContent = "INTEGRATION COMPLETE.";
    Object.assign(title.style, {
      color: "#00ff88",
      fontWeight: "900",
      fontSize: "20px",
      letterSpacing: "3px",
      textShadow: "0 0 18px rgba(0,255,136,0.75)"
    });

    const subtitle = document.createElement("div");
    subtitle.textContent = "The facility thanks you for your service.";
    Object.assign(subtitle.style, {
      color: "rgba(255,255,255,0.55)",
      fontSize: "13px",
      letterSpacing: "1px"
    });

    const btn = document.createElement("button");
    btn.textContent = "Try Again";
    Object.assign(btn.style, {
      marginTop: "16px",
      padding: "10px 24px",
      borderRadius: "10px",
      border: "1px solid rgba(255,255,255,0.25)",
      background: "rgba(0,0,0,0.65)",
      color: "white",
      fontSize: "13px",
      fontWeight: "900",
      letterSpacing: "1px",
      cursor: "pointer"
    });
    btn.addEventListener("click", () => {
      wrap.remove();
      restartRun();
    });

    textWrap.append(title, subtitle, btn);
    wrap.append(img, textWrap);
    document.body.appendChild(wrap);
  }
  /* ==============================
     Sector 20 — Corridor Level
     ============================== */

  function showIntegrationCheckpoint(nextLevel) {
    document.querySelectorAll(".ft-integration-checkpoint").forEach(n => n.remove());

    const wrap = document.createElement("div");
    wrap.className = "ft-integration-checkpoint";
    wrap.innerHTML = `
      <div class="ft-integration-checkpoint-card">
        <div class="ft-integration-checkpoint-label">INTEGRATION CHECKPOINT</div>
        <div class="ft-integration-checkpoint-body">You have survived longer than anticipated. The facility is impressed. The facility does not care. Your absorption is inevitable regardless of what you choose next.</div>
        <div class="ft-integration-checkpoint-buttons">
          <button class="ft-checkpoint-btn-continue" type="button">CONTINUE CONTAINMENT</button>
          <button class="ft-checkpoint-btn-sector" type="button">ENTER SECTOR 20</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);

    function onChoice(proceedFn) {
      wrap.remove();
      const msg = document.createElement("div");
      msg.className = "ft-integration-transition";
      msg.innerHTML = `<div class="ft-integration-transition-text">Noted. Your choice has been logged. It does not matter. The factory thanks you for your continued cooperation.</div>`;
      document.body.appendChild(msg);
      setTimeout(() => {
        msg.remove();
        proceedFn();
      }, 3000);
    }

    wrap.querySelector(".ft-checkpoint-btn-continue").addEventListener("click", () => {
      onChoice(() => {
        beginLevel(nextLevel, true);
        startTickLoop();
      });
    });

    wrap.querySelector(".ft-checkpoint-btn-sector").addEventListener("click", () => {
      onChoice(() => {
        startCorridorLevel(nextLevel);
      });
    });
  }

  function showSector20Choice(nextLevel) {
    sector20Unlocked = true;
    document.querySelectorAll(".ft-sector-choice").forEach(n => n.remove());

    const wrap = document.createElement("div");
    wrap.className = "ft-sector-choice";
    wrap.innerHTML = `
      <div class="ft-sector-choice-card">
        <div class="ft-sector-choice-alert">SECTOR ALERT</div>
        <div class="ft-sector-choice-title">SECTOR 20 BREACH DETECTED.</div>
        <div class="ft-sector-choice-sub">Corrupted workers reported.</div>
        <div class="ft-sector-choice-buttons">
          <button class="ft-sector-btn-enter" type="button">ENTER SECTOR 20</button>
          <button class="ft-sector-btn-continue" type="button">CONTINUE CONTAINMENT</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);

    wrap.querySelector(".ft-sector-btn-enter").addEventListener("click", () => {
      wrap.remove();
      showSector20Briefing(nextLevel);
    });

    wrap.querySelector(".ft-sector-btn-continue").addEventListener("click", () => {
      wrap.remove();
      beginLevel(nextLevel, true);
      startTickLoop();
    });
  }

  function showSector20Briefing(nextLevel) {
    document.querySelectorAll(".ft-sector-briefing").forEach(n => n.remove());

    const wrap = document.createElement("div");
    wrap.className = "ft-sector-briefing";
    wrap.innerHTML = `
      <div class="ft-sector-briefing-card">
        <div class="ft-sector-briefing-title">SECTOR 20 — DEPLOYMENT BRIEF</div>
        <div class="ft-sector-briefing-text">You are entering a contaminated zone. Corrupted workers — former employees absorbed by the hivemind — are advancing. You have 5 antidote darts. Tap workers to cure them. Cure 3 workers to earn 1 new dart. Do not let them reach you.</div>
        <button class="ft-sector-briefing-deploy" type="button">DEPLOY</button>
      </div>
    `;
    document.body.appendChild(wrap);

    wrap.querySelector(".ft-sector-briefing-deploy").addEventListener("click", () => {
      wrap.remove();
      startCorridorLevel(nextLevel);
    });
  }

  function showGooSplatter() {
    const el = document.createElement("div");
    el.className = "ft-corridor-splatter";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }

  function showGreenTendrils() {
    const el = document.createElement("div");
    el.className = "ft-corridor-tendrils";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  function startCorridorLevel(nextLevel) {
    corridorNextLevel = nextLevel;
    corridorActive = true;
    corridorLives = 3;
    corridorDarts = 8;
    corridorHealth = 100;
    corridorTimeLeft = 45;
    corridorCureCount = 0;
    corridorWorkers = [];
    corridorWorkerIdSeq = 0;
    corridorRogueDarts = [];
    corridorRogueDartIdSeq = 0;

    CORRIDOR_SFX.unlock();
    clearGameTimers();
    buildCorridorDOM();

    // Single document-level touchstart — the only tap detection for the corridor.
    // Removed when the corridor ends. Never attaches listeners to worker elements.
    corridorTouchHandler = (e) => {
      if (!corridorActive || corridorPaused) return;
      const t = e.changedTouches[0] || e.touches[0];
      if (!t) return;
      const tx = t.clientX;
      const ty = t.clientY;

      // Check rogue darts before workers
      for (const dart of corridorRogueDarts) {
        if (dart.removed || !dart.el.isConnected) continue;
        const r = dart.el.getBoundingClientRect();
        const PAD = 16;
        if (tx >= r.left - PAD && tx <= r.right + PAD && ty >= r.top - PAD && ty <= r.bottom + PAD) {
          collectRogueDart(dart);
          return;
        }
      }

      // Loop all workers, check each bounding rect, collect hits
      const hits = [];
      for (const w of corridorWorkers) {
        if (w.removed || !w.el.isConnected) continue;
        const r = w.el.getBoundingClientRect();
        if (tx >= r.left && tx <= r.right && ty >= r.top && ty <= r.bottom) {
          hits.push({ worker: w, area: r.width * r.height });
        }
      }
      if (hits.length === 0) {
        const arenaEl = corridorEl && corridorEl.querySelector(".js-corridor-arena");
        if (arenaEl) {
          const ar = arenaEl.getBoundingClientRect();
          if (tx >= ar.left && tx <= ar.right && ty >= ar.top && ty <= ar.bottom) {
            drainCorridorHealth(5);
          }
        }
        return;
      }

      // Pick the largest (= deepest = frontmost)
      hits.sort((a, b) => b.area - a.area);
      cureCorridorWorker(hits[0].worker);
    };
    document.addEventListener("touchstart", corridorTouchHandler, { passive: true });

    startCorridorLoops();
  }

  function buildCorridorDOM() {
    document.querySelectorAll(".ft-corridor").forEach(n => n.remove());

    const wrap = document.createElement("div");
    wrap.className = "ft-corridor";
    wrap.innerHTML = `
      <div class="ft-corridor-bg"></div>
      <div class="ft-corridor-hud">
        <div class="ft-corridor-hud-row">
          <div class="ft-corridor-timer js-corridor-timer">45s</div>
          <div class="ft-corridor-hud-right">
            <div class="ft-corridor-lives-row js-corridor-lives"></div>
          </div>
        </div>
        <div class="ft-corridor-health-bar">
          <div class="ft-corridor-health-fill js-corridor-health"></div>
        </div>
      </div>
      <div class="ft-corridor-arena js-corridor-arena"></div>
      <button class="js-corridor-pause ft-corridor-pause-btn" type="button">PAUSE</button>
    `;
    document.body.appendChild(wrap);
    corridorEl = wrap;
    updateCorridorHUD();

    wrap.querySelector(".js-corridor-pause").addEventListener("click", (e) => {
      e.stopPropagation();
      corridorPaused = !corridorPaused;
      wrap.querySelector(".js-corridor-pause").textContent = corridorPaused ? "RESUME" : "PAUSE";
    });
  }

  function updateCorridorHUD() {
    if (!corridorEl) return;
    const timerEl  = corridorEl.querySelector(".js-corridor-timer");
    const livesEl  = corridorEl.querySelector(".js-corridor-lives");
    const healthEl = corridorEl.querySelector(".js-corridor-health");

    if (timerEl)  timerEl.textContent  = `${Math.ceil(corridorTimeLeft)}s`;
    if (livesEl)  livesEl.innerHTML    = Array.from({ length: corridorLives }, () => '<span class="ft-life-pip"></span>').join("");
    if (healthEl) healthEl.style.width = `${clamp(corridorHealth, 0, 100)}%`;
  }

  function spawnCorridorWorker() {
    if (!corridorActive || !corridorEl) return;
    if (corridorWorkers.length >= 10) return;
    const arena = corridorEl.querySelector(".js-corridor-arena");
    if (!arena) return;

    const id = ++corridorWorkerIdSeq;
    const el = document.createElement("div");
    el.className = "ft-corridor-worker";
    el.dataset.workerId = String(id);
    el.style.pointerEvents = "auto";
    el.style.zIndex = "50";

    // Start invisible; position set by move loop
    el.style.opacity = "0";
    el.style.width = "18px";
    el.style.height = "22px";

    const hasCanister = Math.random() < 0.50;
    if (hasCanister) {
      const pip = document.createElement("div");
      pip.className = "ft-corridor-canister-pip";
      el.appendChild(pip);
    }

    arena.appendChild(el);

    corridorWorkers.push({
      id,
      el,
      removed: false,
      hasCanister,
      depth: 0.02,
      speed: hasCanister ? rand(0.014, 0.026) : rand(0.007, 0.013),
      lateralDrift: rand(-0.28, 0.28),
      wobblePhase: rand(0, Math.PI * 2),
      wobbleAmp: rand(0.02, 0.05)
    });

    CORRIDOR_SFX.spawn();
  }

  function showDartFlash(cx, cy) {
    if (!corridorEl) return;
    const arena = corridorEl.querySelector(".js-corridor-arena");
    if (!arena) return;
    const flash = document.createElement("div");
    flash.className = "ft-corridor-dart-flash";
    flash.style.left = `${cx}px`;
    flash.style.top  = `${cy}px`;
    arena.appendChild(flash);
    setTimeout(() => flash.remove(), 200);
  }

  function spawnRogueDart() {
    if (!corridorActive || !corridorEl) return;
    const arena = corridorEl.querySelector(".js-corridor-arena");
    if (!arena) return;

    const id  = ++corridorRogueDartIdSeq;
    const ltr = Math.random() < 0.5;
    const dur = (rand(6, 9) | 0) + "s";
    const topPct = (rand(18, 72) | 0) + "%";

    const div = document.createElement("div");
    div.className = "ft-corridor-rogue-dart " + (ltr ? "ft-rogue-dart-ltr" : "ft-rogue-dart-rtl");
    div.style.setProperty("--dart-dur", dur);
    div.style.top = topPct;
    arena.appendChild(div);

    const dartObj = { id, el: div, removed: false };
    corridorRogueDarts.push(dartObj);

    div.addEventListener("animationend", (e) => {
      if (e.animationName === "ftRogueFloatLTR" || e.animationName === "ftRogueFloatRTL") {
        dartObj.removed = true;
        div.remove();
        corridorRogueDarts = corridorRogueDarts.filter(d => d.id !== id);
      }
    });
  }

  function collectRogueDart(dart) {
    dart.removed = true;
    if (dart.el.isConnected) {
      dart.el.classList.add("ft-rogue-dart-collected");
      setTimeout(() => { if (dart.el.isConnected) dart.el.remove(); }, 300);
    }
    corridorRogueDarts = corridorRogueDarts.filter(d => d.id !== dart.id);
    corridorDarts += 1;
    updateCorridorHUD();
    setHint("Rogue dart recovered. +1 dart.");
  }

  function scheduleRogueDart() {
    if (!corridorActive) return;
    const delay = (rand(8000, 10000) | 0);
    corridorRogueDartTimer = setTimeout(() => {
      if (corridorActive && !corridorPaused) {
        if (corridorRogueDarts.filter(d => !d.removed).length < 2) {
          spawnRogueDart();
        }
      }
      scheduleRogueDart();
    }, delay);
  }

  function cureCorridorWorker(worker) {
    if (!corridorActive) return;

    worker.removed = true;

    // Dart flash before removing from DOM so getBoundingClientRect still works
    if (worker.el.isConnected && corridorEl) {
      const arena = corridorEl.querySelector(".js-corridor-arena");
      if (arena) {
        const wRect = worker.el.getBoundingClientRect();
        const aRect = arena.getBoundingClientRect();
        showDartFlash(
          wRect.left - aRect.left + wRect.width  / 2,
          wRect.top  - aRect.top  + wRect.height / 2
        );
      }
      worker.el.remove();
    }

    const idx = corridorWorkers.indexOf(worker);
    if (idx !== -1) corridorWorkers.splice(idx, 1);

    CORRIDOR_SFX.dartShoot();
    corridorCureCount += 1;
    setTimeout(() => CORRIDOR_SFX.workerCured(), 95);

    setHint(worker.hasCanister ? "Canister neutralised." : "Worker cured.");
    updateCorridorHUD();
  }

  function moveCorridorWorkers() {
    if (!corridorActive || !corridorEl) return;
    const arena = corridorEl.querySelector(".js-corridor-arena");
    if (!arena) return;

    const rect  = arena.getBoundingClientRect();
    const aW    = rect.width  || window.innerWidth;
    const aH    = rect.height || (window.innerHeight - 82);

    // Corridor vanishing point and player-edge target
    const vanishX = aW * 0.50;
    const vanishY = aH * 0.20;
    const edgeY   = aH * 0.90;

    const minW = 16, maxW = 82;
    const minH = 20, maxH = 98;

    const reached = [];

    corridorWorkers.forEach(w => {
      if (w.removed) return;
      w.depth += w.speed;
      w.wobblePhase += 0.13;

      if (w.depth >= 0.97) {
        w.removed = true;
        reached.push(w.id);
        if (w.el.isConnected) w.el.remove();
        return;
      }

      const targetX = vanishX + w.lateralDrift * aW;
      const cx = vanishX + (targetX - vanishX) * w.depth;
      const cy = vanishY + (edgeY - vanishY) * w.depth;
      const wobble = Math.sin(w.wobblePhase) * w.wobbleAmp * aW * w.depth;

      const ww = minW + (maxW - minW) * w.depth;
      const wh = minH + (maxH - minH) * w.depth;

      if (w.el.isConnected) {
        w.el.style.left    = `${cx + wobble - ww / 2}px`;
        w.el.style.top     = `${cy - wh}px`;
        w.el.style.width   = `${ww}px`;
        w.el.style.height  = `${wh}px`;
        w.el.style.opacity = String(clamp(w.depth * 10, 0, 1));
        w.el.style.zIndex  = String(Math.floor(w.depth * 90) + 10);
      }
    });

    if (reached.length > 0) {
      corridorWorkers = corridorWorkers.filter(w => !reached.includes(w.id));
      reached.forEach(() => drainCorridorHealth(20));
    }
  }

  function drainCorridorHealth(amount) {
    CORRIDOR_SFX.workerAttack();
    showGooSplatter();
    showGreenTendrils();
    corridorHealth = Math.max(0, corridorHealth - amount);
    updateCorridorHUD();
    if (corridorHealth <= 0) loseCorridorLife();
  }

  function loseCorridorLife() {
    corridorLives -= 1;
    corridorHealth = 100;
    updateCorridorHUD();
    addBodyFlash();

    if (corridorLives <= 0) {
      setHint("Sector 20 overwhelmed.");
      setTimeout(() => endCorridorLevel(false), 800);
    } else {
      setHint("Breached. Falling back.");
    }
  }

  function endCorridorLevel(won = true) {
    corridorActive = false;
    corridorPaused = false;
    if (corridorSpawnTimer)    { clearInterval(corridorSpawnTimer);    corridorSpawnTimer    = null; }
    if (corridorTickTimer)     { clearInterval(corridorTickTimer);     corridorTickTimer     = null; }
    if (corridorMoveTimer)     { clearInterval(corridorMoveTimer);     corridorMoveTimer     = null; }
    if (corridorRogueDartTimer){ clearTimeout(corridorRogueDartTimer); corridorRogueDartTimer = null; }
    corridorRogueDarts.forEach(d => { if (d.el && d.el.isConnected) d.el.remove(); });
    corridorRogueDarts = [];
    if (corridorTouchHandler) {
      document.removeEventListener("touchstart", corridorTouchHandler);
      corridorTouchHandler = null;
    }
    corridorWorkers = [];
    if (corridorEl) { corridorEl.remove(); corridorEl = null; }

    // Reset level state so tap levels behave normally after the corridor
    levelResolving   = false;
    levelEndSnapshot = null;
    levelScore       = 0;

    if (won) {
      sector20Cleared = true;
      beginLevel(corridorNextLevel, true);
      startTickLoop();
    } else {
      showIntegrationCheckpoint(20);
    }
  }

  function startCorridorLoops() {
    corridorTickTimer = setInterval(() => {
      if (!corridorActive || corridorPaused) return;
      corridorTimeLeft = Math.max(0, corridorTimeLeft - 1);
      updateCorridorHUD();
      if (corridorTimeLeft <= 0) {
        setHint("You survived. Sector 20 contained.");
        endCorridorLevel(true);
      }
    }, 1000);

    corridorMoveTimer = setInterval(() => {
      if (!corridorActive || corridorPaused) return;
      moveCorridorWorkers();
    }, 50);

    corridorSpawnTimer = setInterval(() => {
      if (!corridorActive || corridorPaused) return;
      const count = rand(2, 3) | 0;
      for (let i = 0; i < count; i++) {
        const delay = i * rand(180, 380) | 0;
        if (delay === 0) {
          spawnCorridorWorker();
        } else {
          setTimeout(() => {
            if (corridorActive && !corridorPaused) spawnCorridorWorker();
          }, delay);
        }
      }
    }, 470);

    // Spawn first group immediately
    spawnCorridorWorker();
    setTimeout(() => { if (corridorActive) spawnCorridorWorker(); }, 300);

    scheduleRogueDart();
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

  const interventionBtn = document.getElementById("interventionBtn");
  if (interventionBtn) {
    interventionBtn.addEventListener("click", () => {
      if (!interventionActive || !currentIntervention) return;
      const effect = currentIntervention.effect;
      const type = currentIntervention.type;
      hideIntervention();

      if (type === "evil") {
        evilClickCount += 1;
        addIntegration(0.5);
        const count = evilClickCount;

        let loreMsg = null;
        switch (count) {
          case 1: loreMsg = "Integration pathway opened."; break;
          case 2: loreMsg = "Noted. Your compliance is improving."; break;
          case 3: loreMsg = "You are beginning to understand."; break;
          case 5: loreMsg = "The facility has updated your file."; break;
          case 8: loreMsg = "You are no longer a visitor."; break;
          default: if (count > 8) loreMsg = "You belong to us now."; break;
        }

        if (loreMsg) {
          showLoreFloat(loreMsg);
          setTimeout(() => setHint(loreMsg), 1000);
        }
      }

      switch (effect) {
        case "reduceChaos":
          reduceChaos(3.5);
          setHint("Emergency coolant deployed. Factory slightly less on fire.");
          break;
        case "addLife":
          lives += 1;
          setHint("Backup operator clocked in. Suspiciously eager.");
          break;
        case "chaosSpike":
          addChaos(2.5, "intervention");
          setHint("Manual override engaged. Something important broke.");
          break;
        case "scoreDrain":
          score = Math.max(0, score - 5);
          updateHUD();
          setHint("System purge complete. Also purged your score.");
          break;
        case "chaosDrain":
          reduceChaos(1.5);
          setHint("Compliance check passed. Barely.");
          break;
        case "spawnTraps":
          for (let i = 0; i < 3; i++) spawnTapObject();
          addChaos(1.0, "intervention");
          setHint("Pressure vented. Directly onto the floor.");
          break;
        case "spawnWorkers":
          for (let i = 0; i < 3; i++) spawnTapObject();
          setHint("Workers reassigned. To your problem.");
          break;
        case "speedUp":
          addChaos(1.5, "intervention");
          setHint("Thermal boost applied. Everything is now faster and worse.");
          break;
        case "reverseControls":
          addChaos(1.0, "intervention");
          setHint("Signal calibrated. To the wrong frequency.");
          break;
        case "fakeCalmThenSpike":
          reduceChaos(2.0);
          setTimeout(() => {
            addChaos(3.5, "intervention");
            setHint("Drill over. That was not a drill.");
          }, 1800);
          setHint("Containment drill initiated. Everything seems fine.");
          break;
      }

      updateHUD();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      localStorage.removeItem(BEST_KEY);
      loadBest();
      setHint("Best score reset. Corporate memory wiped.");
    });
  }

  // pointerdown feels better on mobile; click kept as fallback
  arena.addEventListener("pointerdown", arenaEmptyClickHandler, { passive: true });
// arena.addEventListener("click", arenaEmptyClickHandler, { passive: true });

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

function showDescentChoice(nextLevel) {
  descentUnlocked = true;
  document.querySelectorAll(".ft-integration-transition, .ft-sector-choice, .ft-sector-briefing").forEach(n => n.remove());
  const wrap = document.createElement("div");
  wrap.className = "ft-sector-choice";
  wrap.innerHTML = `
    <div class="ft-sector-choice-card">
      <div class="ft-sector-choice-alert">SECTOR ALERT</div>
      <div class="ft-sector-choice-title">THE DESCENT — BREACH DETECTED.</div>
      <div class="ft-sector-choice-sub">You have gone too deep. The factory does not end.</div>
      <div class="ft-sector-choice-buttons">
        <button class="ft-checkpoint-btn-continue" type="button">CONTINUE CONTAINMENT</button>
        <button class="ft-checkpoint-btn-sector" type="button">ENTER THE DESCENT</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
  wrap.querySelector('.ft-checkpoint-btn-continue').onclick = () => {
    wrap.remove();
    beginLevel(nextLevel, false);
    startTickLoop();
  };
  wrap.querySelector('.ft-checkpoint-btn-sector').onclick = () => {
    wrap.remove();
    startDescent(nextLevel);
  };
}

function startDescent(nextLevel) {
  const canvas = document.createElement('canvas');
  canvas.id = 'descent-canvas';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;background:#000;touch-action:none;';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const GROUND = H - 80;
  const GRAVITY = 0.55;
  const JUMP = -14;
  const SPEED = 4;

  const player = { x: 60, y: GROUND - 56, w: 28, h: 56, vx: 0, vy: 0, onGround: false, frame: 0, alive: true };

  const platforms = [
    { x: 0, y: GROUND, w: W * 5, h: 80 },
    { x: 300, y: GROUND - 120, w: 140, h: 16 },
    { x: 600, y: GROUND - 180, w: 120, h: 16 },
    { x: 900, y: GROUND - 130, w: 150, h: 16 },
    { x: 1200, y: GROUND - 200, w: 130, h: 16 },
    { x: 1500, y: GROUND - 150, w: 140, h: 16 },
    { x: 1800, y: GROUND - 170, w: 120, h: 16 },
    { x: 2100, y: GROUND - 140, w: 160, h: 16 },
    { x: 2400, y: GROUND - 190, w: 130, h: 16 },
    { x: 2700, y: GROUND - 160, w: 140, h: 16 },
  ];

  const enemies = [
    { x: 500, y: GROUND - 56, w: 32, h: 56, vx: -1.2, frame: 0, alive: true },
    { x: 900, y: GROUND - 56, w: 32, h: 56, vx: 1.3, frame: 0, alive: true },
    { x: 1300, y: GROUND - 56, w: 32, h: 56, vx: -1.1, frame: 0, alive: true },
    { x: 1700, y: GROUND - 56, w: 32, h: 56, vx: 1.4, frame: 0, alive: true },
    { x: 2100, y: GROUND - 56, w: 32, h: 56, vx: -1.2, frame: 0, alive: true },
    { x: 2500, y: GROUND - 56, w: 32, h: 56, vx: 1.3, frame: 0, alive: true },
    { x: 2800, y: GROUND - 56, w: 32, h: 56, vx: -1.0, frame: 0, alive: true },
  ];

  const hazards = [
    { x: 450, y: GROUND - 20, w: 50, h: 20, type: 'acid' },
    { x: 1050, y: GROUND - 20, w: 60, h: 20, type: 'acid' },
    { x: 1650, y: GROUND - 20, w: 50, h: 20, type: 'acid' },
    { x: 2250, y: GROUND - 20, w: 55, h: 20, type: 'acid' },
    { x: 700, y: 0, w: 12, h: H, type: 'steam', timer: 0 },
    { x: 1400, y: 0, w: 12, h: H, type: 'steam', timer: 0 },
    { x: 2000, y: 0, w: 12, h: H, type: 'steam', timer: 0 },
  ];

  const EXIT_X = 3000;
  let camX = 0;
  let tick = 0;
  let score = 0;
  let lives = 3;
  let particles = [];
  const keys = new Set();
  let dead = false;
  let won = false;
  let deathTimer = 0;

  const bgImg = new Image();
  bgImg.src = 'corridor-bg.png';
  const playerImg = new Image();
  playerImg.src = 'player-sprite.png';

  function hits(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function resetPlayer() {
    player.x = 60; player.y = GROUND - 56;
    player.vx = 0; player.vy = 0;
    player.onGround = false; player.alive = true;
    camX = 0;
  }

  function spawnParticles(x, y, color) {
    for (let i = 0; i < 10; i++) {
      particles.push({ x, y, vx: (Math.random()-0.5)*6, vy: -Math.random()*5, life: 30, color, size: 4 });
    }
  }

  function drawBG() {
    ctx.drawImage(bgImg, 0, 0, W, H);
    const grad = ctx.createLinearGradient(0,0,0,H);
    grad.addColorStop(0,'rgba(20,0,0,0.7)');
    grad.addColorStop(1,'rgba(0,0,0,0.3)');
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,W,H);
  }

  function drawPlatform(p) {
    const sx = p.x - camX;
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(sx, p.y, p.w, p.h);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(sx, p.y, p.w, 4);
  }

  function drawEnemy(e) {
    if (!e.alive) return;
    const sx = e.x - camX;
    e.frame++;
    ctx.fillStyle = '#cc0';
    ctx.fillRect(sx+3, e.y+14, 26, 26);
    ctx.fillStyle = '#dd0';
    ctx.beginPath();
    ctx.arc(sx+16, e.y+10, 11, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(sx+16, e.y+10, 6, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#0f0';
    ctx.fillRect(sx+12, e.y+8, 3, 3);
    ctx.fillRect(sx+19, e.y+8, 3, 3);
    const lOff = Math.sin(e.frame*0.15)*3;
    ctx.fillStyle = '#aa0';
    ctx.fillRect(sx+6, e.y+40, 7, 8+lOff);
    ctx.fillRect(sx+19, e.y+40, 7, 8-lOff);
  }

  function drawHazard(h) {
    const sx = h.x - camX;
    if (h.type === 'acid') {
      ctx.fillStyle = '#0a0';
      ctx.fillRect(sx, h.y, h.w, h.h);
      ctx.fillStyle = '#0f0';
      ctx.shadowColor = '#0f0';
      ctx.shadowBlur = 8;
      ctx.fillRect(sx+2, h.y+2, h.w-4, 4);
      ctx.shadowBlur = 0;
    } else if (h.type === 'steam') {
      const active = Math.sin(tick * 0.04) > 0;
      if (!active) return;
      ctx.fillStyle = 'rgba(0,255,0,0.12)';
      for (let i = 0; i < 6; i++) {
        const yy = i * (H/6) + Math.sin(tick*0.1+i)*12;
        ctx.beginPath();
        ctx.arc(sx+6, yy, 16+Math.sin(tick*0.08+i)*5, 0, Math.PI*2);
        ctx.fill();
      }
    }
  }

  function drawPlayer() {
    const sx = player.x - camX;
    const sy = player.y;
    const f = player.frame;
    const legOff = Math.sin(f * 0.25) * 4;
    ctx.fillStyle = '#ffdd00';
    ctx.fillRect(sx + 5, sy + 16, 18, 24);
    ctx.fillStyle = '#ffee44';
    ctx.beginPath();
    ctx.arc(sx + 14, sy + 11, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(sx + 14, sy + 11, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff4400';
    ctx.fillRect(sx + 10, sy + 9, 3, 3);
    ctx.fillRect(sx + 16, sy + 9, 3, 3);
    ctx.fillStyle = '#ddaa00';
    ctx.fillRect(sx + 6, sy + 40, 6, 10 + legOff);
    ctx.fillRect(sx + 16, sy + 40, 6, 10 - legOff);
  }

  function drawExit() {
    const sx = EXIT_X - camX;
    ctx.fillStyle = '#080';
    ctx.fillRect(sx, GROUND-80, 50, 80);
    ctx.fillStyle = '#0f0';
    ctx.shadowColor = '#0f0';
    ctx.shadowBlur = 20;
    ctx.fillRect(sx+4, GROUND-76, 42, 72);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('EXIT', sx+8, GROUND-38);
  }

  function drawHUD() {
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(8,8,220,60);
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 15px monospace';
    ctx.fillText('THE DESCENT', 18, 28);
    ctx.fillStyle = '#0f0';
    ctx.fillText('SCORE: ' + score, 18, 48);
    ctx.fillStyle = '#fff';
    ctx.fillText('LIVES: ' + lives, 140, 48);
  }

  function drawOverlay(text, sub) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0,0,W,H);
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(text, W/2, H/2-20);
    ctx.fillStyle = '#aaa';
    ctx.font = '18px monospace';
    ctx.fillText(sub, W/2, H/2+20);
    ctx.textAlign = 'left';
  }

  function gameLoop() {
    tick++;
    player.frame++;

    if (dead) {
      deathTimer++;
      drawBG();
      for (const p of platforms) drawPlatform(p);
      drawExit();
      drawHUD();
      drawOverlay('INFECTED', lives > 0 ? 'Respawning...' : 'ABSORBED. THE FACTORY WINS.');
      particles = particles.filter(pt => { pt.x+=pt.vx; pt.y+=pt.vy; pt.vy+=0.2; pt.life--; return pt.life>0; });
      ctx.globalAlpha=1;
      if (deathTimer > 90) {
        if (lives <= 0) {
          endDescent(false, nextLevel);
          return;
        }
        dead = false;
        deathTimer = 0;
        resetPlayer();
      }
      raf = requestAnimationFrame(gameLoop);
      return;
    }

    if (won) {
      drawBG();
      drawOverlay('ESCAPED.', 'The factory cannot hold you.');
      if (deathTimer++ > 150) { endDescent(true, nextLevel); return; }
      raf = requestAnimationFrame(gameLoop);
      return;
    }

    // Input
    if (keys.has('ArrowRight') || keys.has('d')) player.vx = SPEED;
    else if (keys.has('ArrowLeft') || keys.has('a')) player.vx = -SPEED;
    else player.vx = 0;
    if ((keys.has(' ') || keys.has('ArrowUp') || keys.has('w')) && player.onGround) {
      player.vy = JUMP;
      player.onGround = false;
    }

    // Physics
    player.vy += GRAVITY;
    player.x += player.vx;
    player.y += player.vy;
    player.onGround = false;

    for (const pl of platforms) {
      if (player.x + player.w > pl.x && player.x < pl.x + pl.w) {
        if (player.y + player.h >= pl.y && player.y + player.h <= pl.y + pl.h + 10 && player.vy >= 0) {
          player.y = pl.y - player.h;
          player.vy = 0;
          player.onGround = true;
        }
      }
    }

    if (player.y > H + 60) { lives--; spawnParticles(player.x - camX, H/2, '#f00'); dead=true; deathTimer=0; return; }

    // Enemies
    for (const e of enemies) {
      if (!e.alive) continue;
      e.x += e.vx;
      let onP = false;
      for (const pl of platforms) {
        if (e.x+e.w > pl.x && e.x < pl.x+pl.w && e.y+e.h >= pl.y-2 && e.y+e.h <= pl.y+12) {
          onP = true;
          if (e.x <= pl.x || e.x+e.w >= pl.x+pl.w) e.vx *= -1;
        }
      }
      if (!onP) e.vx *= -1;
      if (hits(player, e)) {
        if (player.vy > 0 && player.y + player.h < e.y + e.h/2) {
          e.alive = false;
          player.vy = -9;
          score += 150;
          spawnParticles(e.x - camX, e.y, '#0f0');
        } else {
          lives--;
          spawnParticles(player.x - camX, player.y, '#f00');
          dead = true; deathTimer = 0;
        }
      }
    }

    // Hazards
    for (const h of hazards) {
      if (h.type === 'acid' && hits(player, h)) { lives--; dead=true; deathTimer=0; spawnParticles(player.x-camX, player.y, '#0f0'); }
      if (h.type === 'steam' && Math.sin(tick*0.04) > 0 && hits(player, {x:h.x-8, y:h.y, w:h.w+16, h:h.h})) { lives--; dead=true; deathTimer=0; }
    }

    // Win
    if (player.x >= EXIT_X) { won = true; deathTimer = 0; }

    // Camera
    const target = player.x - W/3;
    camX += (target - camX) * 0.1;
    if (camX < 0) camX = 0;

    // Particles
    particles = particles.filter(pt => { pt.x+=pt.vx; pt.y+=pt.vy; pt.vy+=0.2; pt.life--; return pt.life>0; });

    // Draw
    drawBG();
    for (const p of platforms) drawPlatform(p);
    drawExit();
    for (const h of hazards) drawHazard(h);
    for (const e of enemies) drawEnemy(e);
    drawPlayer();
    ctx.globalAlpha=1;
    for (const pt of particles) {
      ctx.globalAlpha = Math.max(0, pt.life/30);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
    }
    ctx.globalAlpha=1;
    drawHUD();

    raf = requestAnimationFrame(gameLoop);
  }

  // Touch controls
  let touchStartX = 0;
  canvas.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; });
  canvas.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) < 20) { if (player.onGround) { player.vy = JUMP; player.onGround = false; } }
    else if (dx > 0) { player.x += SPEED * 18; }
    else { player.x -= SPEED * 18; }
  });

  window.addEventListener('keydown', e => { keys.add(e.key); if(e.key===' '||e.key==='ArrowUp') e.preventDefault(); });
  window.addEventListener('keyup', e => keys.delete(e.key));

  let raf = requestAnimationFrame(gameLoop);

  function endDescent(survived, nextLevel) {
    cancelAnimationFrame(raf);
    keys.clear();
    canvas.remove();
    descentCleared = survived;
    beginLevel(nextLevel, false);
    startTickLoop();
  }
}

function startThePit(returnToLevel) {
  const canvas = document.createElement('canvas');
  canvas.id = 'pit-canvas';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;background:#000;touch-action:none;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const GROUND = H - 80;
  const GRAVITY = 0.65;
  const JUMP = -13;
  const SPEED = 3.5;
  const EXIT_X = 1800;
  const player = { x: 60, y: GROUND - 56, w: 28, h: 56, vx: 0, vy: 0, onGround: false, frame: 0 };
  const platforms = [
    { x: 0, y: GROUND, w: W * 4, h: 80 },
    { x: 250, y: GROUND - 100, w: 80, h: 16 },
    { x: 450, y: GROUND - 140, w: 80, h: 16 },
    { x: 650, y: GROUND - 100, w: 80, h: 16 },
    { x: 850, y: GROUND - 160, w: 80, h: 16 },
    { x: 1050, y: GROUND - 110, w: 80, h: 16 },
    { x: 1250, y: GROUND - 150, w: 80, h: 16 },
    { x: 1450, y: GROUND - 120, w: 80, h: 16 },
  ];
  const enemies = [
    { x: 300, y: GROUND - 56, w: 32, h: 56, vx: -1.8, frame: 0, alive: true },
    { x: 600, y: GROUND - 56, w: 32, h: 56, vx: 2.0, frame: 0, alive: true },
    { x: 900, y: GROUND - 56, w: 32, h: 56, vx: -1.9, frame: 0, alive: true },
    { x: 1100, y: GROUND - 56, w: 32, h: 56, vx: 1.7, frame: 0, alive: true },
    { x: 1300, y: GROUND - 56, w: 32, h: 56, vx: -2.1, frame: 0, alive: true },
    { x: 1500, y: GROUND - 56, w: 32, h: 56, vx: 1.8, frame: 0, alive: true },
  ];
  const hazards = [
    { x: 350, y: GROUND - 20, w: 60, h: 20, type: 'acid' },
    { x: 700, y: GROUND - 20, w: 70, h: 20, type: 'acid' },
    { x: 1000, y: GROUND - 20, w: 65, h: 20, type: 'acid' },
    { x: 1350, y: GROUND - 20, w: 70, h: 20, type: 'acid' },
    { x: 500, y: 0, w: 12, h: H, type: 'steam' },
    { x: 1000, y: 0, w: 12, h: H, type: 'steam' },
    { x: 1400, y: 0, w: 12, h: H, type: 'steam' },
  ];
  const bgImg = new Image();
  bgImg.src = 'corridor-bg.png';
  let camX = 0, tick = 0, particles = [], dead = false, won = false, deathTimer = 0, raf;
  const keys = new Set();
  function hits(a, b) { return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y; }
  function spawnParticles(x, y, color) { for (let i=0;i<10;i++) particles.push({x,y,vx:(Math.random()-.5)*6,vy:-Math.random()*5,life:30,color,size:4}); }
  function drawBG() {
    ctx.drawImage(bgImg,0,0,W,H);
    ctx.fillStyle='rgba(120,0,0,0.55)';
    ctx.fillRect(0,0,W,H);
    if(Math.sin(tick*0.3)>0.7){ctx.fillStyle='rgba(180,0,0,0.08)';ctx.fillRect(0,0,W,H);}
  }
  function drawPlatform(p){const sx=p.x-camX;ctx.fillStyle='#1a0000';ctx.fillRect(sx,p.y,p.w,p.h);ctx.fillStyle='#3a0000';ctx.fillRect(sx,p.y,p.w,4);}
  function drawEnemy(e){
    if(!e.alive)return;const sx=e.x-camX;e.frame++;
    ctx.fillStyle='#cc0';ctx.fillRect(sx+3,e.y+14,26,26);
    ctx.fillStyle='#dd0';ctx.beginPath();ctx.arc(sx+16,e.y+10,11,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#111';ctx.beginPath();ctx.arc(sx+16,e.y+10,6,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#f00';ctx.fillRect(sx+12,e.y+8,3,3);ctx.fillRect(sx+19,e.y+8,3,3);
    const lOff=Math.sin(e.frame*.15)*3;ctx.fillStyle='#aa0';
    ctx.fillRect(sx+6,e.y+40,7,8+lOff);ctx.fillRect(sx+19,e.y+40,7,8-lOff);
  }
  function drawHazard(h){
    const sx=h.x-camX;
    if(h.type==='acid'){ctx.fillStyle='#1a0000';ctx.fillRect(sx,h.y,h.w,h.h);ctx.fillStyle='#ff2200';ctx.shadowColor='#ff2200';ctx.shadowBlur=10;ctx.fillRect(sx+2,h.y+2,h.w-4,4);ctx.shadowBlur=0;}
    else if(h.type==='steam'){const active=Math.sin(tick*.04)>0;if(!active)return;ctx.fillStyle='rgba(255,0,0,0.12)';for(let i=0;i<6;i++){const yy=i*(H/6)+Math.sin(tick*.1+i)*12;ctx.beginPath();ctx.arc(sx+6,yy,16+Math.sin(tick*.08+i)*5,0,Math.PI*2);ctx.fill();}}
  }
  function drawPlayerSprite(){
    const sx=player.x-camX,sy=player.y,f=player.frame,legOff=Math.sin(f*.25)*4;
    ctx.fillStyle='#ffdd00';ctx.fillRect(sx+5,sy+16,18,24);
    ctx.fillStyle='#ffee44';ctx.beginPath();ctx.arc(sx+14,sy+11,10,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#111';ctx.beginPath();ctx.arc(sx+14,sy+11,6,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#ff4400';ctx.fillRect(sx+10,sy+9,3,3);ctx.fillRect(sx+16,sy+9,3,3);
    ctx.fillStyle='#ddaa00';ctx.fillRect(sx+6,sy+40,6,10+legOff);ctx.fillRect(sx+16,sy+40,6,10-legOff);
  }
  function drawExit(){const sx=EXIT_X-camX;ctx.fillStyle='#800000';ctx.fillRect(sx,GROUND-80,50,80);ctx.fillStyle='#ff2200';ctx.shadowColor='#ff2200';ctx.shadowBlur=20;ctx.fillRect(sx+4,GROUND-76,42,72);ctx.shadowBlur=0;ctx.fillStyle='#fff';ctx.font='bold 11px monospace';ctx.fillText('ESCAPE',sx+4,GROUND-38);}
  function drawHUD(){ctx.fillStyle='rgba(80,0,0,0.85)';ctx.fillRect(8,8,260,70);ctx.fillStyle='#ff2200';ctx.font='bold 14px monospace';ctx.fillText('THE PIT',18,26);ctx.fillStyle='#ff6600';ctx.font='11px monospace';ctx.fillText('PURGATORY OF THE FACTORY',18,42);ctx.fillStyle='#fff';ctx.fillText('Prove yourself pure. Reach the exit.',18,58);}
  function drawOverlay(title,sub){ctx.fillStyle='rgba(0,0,0,0.82)';ctx.fillRect(0,0,W,H);ctx.fillStyle='#ff2200';ctx.font='bold 36px monospace';ctx.textAlign='center';ctx.fillText(title,W/2,H/2-20);ctx.fillStyle='#aaa';ctx.font='15px monospace';ctx.fillText(sub,W/2,H/2+18);ctx.textAlign='left';}
  function endPit(survived){cancelAnimationFrame(raf);keys.clear();canvas.remove();levelResolving=false;if(survived){beginLevel(returnToLevel,false);}else{beginLevel(1,false);}startTickLoop();}
  function gameLoop(){
    tick++;player.frame++;
    if(dead){deathTimer++;drawBG();for(const p of platforms)drawPlatform(p);drawExit();drawHUD();drawOverlay('CONSUMED.','The Pit does not forgive. Returning to level 1.');if(deathTimer>120){endPit(false);return;}raf=requestAnimationFrame(gameLoop);return;}
    if(won){deathTimer++;drawBG();drawOverlay('PROVEN PURE.','The Factory grants you mercy. Your audit awaits.');if(deathTimer>120){endPit(true);return;}raf=requestAnimationFrame(gameLoop);return;}
    if(keys.has('ArrowRight')||keys.has('d'))player.vx=SPEED;
    else if(keys.has('ArrowLeft')||keys.has('a'))player.vx=-SPEED;
    else player.vx=0;
    if((keys.has(' ')||keys.has('ArrowUp')||keys.has('w'))&&player.onGround){player.vy=JUMP;player.onGround=false;}
    player.vy+=GRAVITY;player.x+=player.vx;player.y+=player.vy;player.onGround=false;
    for(const pl of platforms){if(player.x+player.w>pl.x&&player.x<pl.x+pl.w){if(player.y+player.h>=pl.y&&player.y+player.h<=pl.y+pl.h+10&&player.vy>=0){player.y=pl.y-player.h;player.vy=0;player.onGround=true;}}}
    if(player.y>H+60){spawnParticles(player.x-camX,H/2,'#f00');dead=true;deathTimer=0;return;}
    for(const e of enemies){
      if(!e.alive)continue;e.x+=e.vx;let onP=false;
      for(const pl of platforms){if(e.x+e.w>pl.x&&e.x<pl.x+pl.w&&e.y+e.h>=pl.y-2&&e.y+e.h<=pl.y+12){onP=true;if(e.x<=pl.x||e.x+e.w>=pl.x+pl.w)e.vx*=-1;}}
      if(!onP)e.vx*=-1;
      if(hits(player,e)){if(player.vy>0&&player.y+player.h<e.y+e.h/2){e.alive=false;player.vy=-9;spawnParticles(e.x-camX,e.y,'#ff0');}else{dead=true;deathTimer=0;spawnParticles(player.x-camX,player.y,'#f00');}}
    }
    for(const h of hazards){
      if(h.type==='acid'&&hits(player,h)){dead=true;deathTimer=0;spawnParticles(player.x-camX,player.y,'#f00');}
      if(h.type==='steam'&&Math.sin(tick*.04)>0&&hits(player,{x:h.x-8,y:h.y,w:h.w+16,h:h.h})){dead=true;deathTimer=0;}
    }
    if(player.x>=EXIT_X){won=true;deathTimer=0;}
    const target=player.x-W/3;camX+=(target-camX)*.1;if(camX<0)camX=0;
    particles=particles.filter(pt=>{pt.x+=pt.vx;pt.y+=pt.vy;pt.vy+=.2;pt.life--;return pt.life>0;});
    drawBG();for(const p of platforms)drawPlatform(p);drawExit();for(const h of hazards)drawHazard(h);for(const e of enemies)drawEnemy(e);drawPlayerSprite();
    ctx.globalAlpha=1;for(const pt of particles){ctx.globalAlpha=Math.max(0,pt.life/30);ctx.fillStyle=pt.color;ctx.fillRect(pt.x,pt.y,pt.size,pt.size);}ctx.globalAlpha=1;
    drawHUD();raf=requestAnimationFrame(gameLoop);
  }
  canvas.addEventListener('touchstart',e=>{e._startX=e.touches[0].clientX;});
  canvas.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-(e._startX||0);if(Math.abs(dx)<20){if(player.onGround){player.vy=JUMP;player.onGround=false;}}else if(dx>0)player.x+=SPEED*18;else player.x-=SPEED*18;});
  window.addEventListener('keydown',e=>{keys.add(e.key);if(e.key===' '||e.key==='ArrowUp')e.preventDefault();});
  window.addEventListener('keyup',e=>keys.delete(e.key));
  raf=requestAnimationFrame(gameLoop);
}

function showGehennaChoice(nextLevel) {
  document.querySelectorAll(".ft-integration-transition, .ft-sector-choice, .ft-sector-briefing").forEach(n => n.remove());
  const wrap = document.createElement("div");
  wrap.className = "ft-sector-choice";
  wrap.innerHTML = `
    <div class="ft-sector-choice-card">
      <div class="ft-sector-choice-alert">BOSS ENCOUNTER</div>
      <div class="ft-sector-choice-title">GEHENNA AWAITS.</div>
      <div class="ft-sector-choice-sub">You have survived long enough to be noticed. The depths of the factory have opened. Three waves of horrors stand between you and the next level. Die and you return to the beginning. The factory does not reward cowardice.</div>
      <div class="ft-sector-choice-buttons">
        <button class="ft-checkpoint-btn-sector" type="button">DESCEND INTO GEHENNA</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
  wrap.querySelector('.ft-checkpoint-btn-sector').onclick = () => {
    wrap.remove();
    startGehenna(nextLevel);
  };
}

function startGehenna(nextLevel) {
  const canvas = document.createElement('canvas');
  canvas.id = 'gehenna-canvas';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;background:#000;touch-action:none;cursor:crosshair;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const FOV = Math.PI / 3;
  const MAP_SIZE = 16;
  const MAX_DEPTH = 16;
  const MOVE_SPEED = 0.06;
  const ROT_SPEED = 0.04;
  const SHOOT_CD = 12;

  const MAP = [
    1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1,
    1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1,
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    1,0,1,1,0,0,0,0,0,0,0,0,1,1,0,1,
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    1,0,1,1,0,0,0,0,0,0,0,0,1,1,0,1,
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1,
    1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1,
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
  ];

  function getMap(x,y){const mx=Math.floor(x),my=Math.floor(y);if(mx<0||mx>=MAP_SIZE||my<0||my>=MAP_SIZE)return 1;return MAP[my*MAP_SIZE+mx];}

  const waveCount = Math.min(3, Math.floor(nextLevel / 10));
  const speedMult = 1 + (nextLevel / 100);

  function spawnWave(wave) {
    const spots = [[2,2],[13,2],[2,13],[13,13],[7,2],[7,13],[2,7],[13,7],[4,4],[11,4],[4,11],[11,11]];
    const count = 3 + wave * 2;
    const demons = [];
    for (let i = 0; i < Math.min(count, spots.length); i++) {
      const [sx,sy] = spots[i];
      const types = ['brute','crawler','spitter'];
      demons.push({
        x: sx+0.5, y: sy+0.5,
        hp: 2+wave, maxHp: 2+wave,
        alive: true, frame: 0,
        type: types[i%3],
        attackTimer: 60+Math.random()*120,
      });
    }
    return demons;
  }

  let state = 'playing';
  let px=8, py=8, angle=0;
  let hp=100, maxHp=100;
  let lives=3;
  let demons=spawnWave(0);
  let projectiles=[];
  let wave=1;
  let kills=0;
  let tick=0;
  let shootCooldown=0;
  let muzzleLife=0;
  let dmgTimer=0;
  let ammo=30;
  let waveClearTimer=0;
  let deathTimer=0;
  let particles=[];
  let raf;
  const keys=new Set();
  let shooting=false;

  function castRays() {
    for (let i=0; i<W; i++) {
      const rayAngle = angle - FOV/2 + (i/W)*FOV;
      const sin=Math.sin(rayAngle), cos=Math.cos(rayAngle);
      let dist=0, hit=false, hitX=px, hitY=py;
      for (let d=0; d<MAX_DEPTH*50; d++) {
        dist+=0.02; hitX=px+cos*dist; hitY=py+sin*dist;
        if(getMap(hitX,hitY)){hit=true;break;}
      }
      if(!hit)dist=MAX_DEPTH;
      const corrected=dist*Math.cos(rayAngle-angle);
      const wallH=Math.min(H,(H*0.8)/corrected);
      const wallTop=(H-wallH)/2;
      const cg=ctx.createLinearGradient(i,0,i,wallTop);
      cg.addColorStop(0,'#0a0000');cg.addColorStop(1,'#1a0505');
      ctx.fillStyle=cg;ctx.fillRect(i,0,2,wallTop);
      const fg=ctx.createLinearGradient(i,wallTop+wallH,i,H);
      fg.addColorStop(0,'#1a0505');fg.addColorStop(0.5,'#2a0a00');
      fg.addColorStop(1,`rgba(${180+Math.sin(tick*0.03+i*0.01)*40},20,0,1)`);
      ctx.fillStyle=fg;ctx.fillRect(i,wallTop+wallH,2,H-(wallTop+wallH));
      const shade=Math.max(0,1-corrected/MAX_DEPTH);
      const r=Math.floor(40*shade);const g2=Math.floor(10*shade);const b=Math.floor(8*shade);
      ctx.fillStyle=`rgb(${r},${g2},${b})`;ctx.fillRect(i,wallTop,2,wallH);
      if(shade>0.3&&(Math.floor(hitX*4+hitY*4)%7===0)){
        ctx.fillStyle=`rgba(120,40,0,${shade*0.4})`;ctx.fillRect(i,wallTop+wallH*0.3,2,wallH*0.5);
      }
    }
  }

  function drawDemons() {
    const sorted=demons.filter(d=>d.alive).map(d=>({...d,dist:Math.hypot(d.x-px,d.y-py),ang:Math.atan2(d.y-py,d.x-px)})).sort((a,b)=>b.dist-a.dist);
    for (const d of sorted) {
      let relAngle=d.ang-angle;
      while(relAngle>Math.PI)relAngle-=Math.PI*2;
      while(relAngle<-Math.PI)relAngle+=Math.PI*2;
      if(Math.abs(relAngle)>FOV/2+0.1)continue;
      const screenX=W/2+(relAngle/(FOV/2))*(W/2);
      const spriteH=Math.min(H,(H*0.6)/d.dist);
      const spriteW=spriteH*0.7;
      const spriteTop=(H-spriteH)/2;
      const shade=Math.max(0.15,1-d.dist/MAX_DEPTH);
      if(d.type==='brute'){
        ctx.fillStyle=`rgba(${Math.floor(60*shade)},${Math.floor(20*shade)},${Math.floor(15*shade)},1)`;
        ctx.fillRect(screenX-spriteW/2,spriteTop+spriteH*0.15,spriteW,spriteH*0.6);
        ctx.fillStyle=`rgba(${Math.floor(80*shade)},${Math.floor(30*shade)},${Math.floor(20*shade)},1)`;
        ctx.beginPath();ctx.arc(screenX,spriteTop+spriteH*0.12,spriteW*0.3,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=`rgba(255,${30+Math.sin(tick*0.1)*20},0,${shade})`;
        ctx.shadowColor='#f00';ctx.shadowBlur=10*shade;
        const es=spriteW*0.06;
        ctx.fillRect(screenX-spriteW*0.12,spriteTop+spriteH*0.1,es,es);
        ctx.fillRect(screenX+spriteW*0.06,spriteTop+spriteH*0.1,es,es);
        ctx.shadowBlur=0;
        ctx.strokeStyle=`rgba(${Math.floor(100*shade)},${Math.floor(60*shade)},0,1)`;
        ctx.lineWidth=spriteW*0.08;
        const armSwing=Math.sin(d.frame*0.08)*spriteW*0.15;
        ctx.beginPath();ctx.moveTo(screenX-spriteW/2,spriteTop+spriteH*0.3);ctx.lineTo(screenX-spriteW/2-armSwing,spriteTop+spriteH*0.6);ctx.stroke();
        ctx.beginPath();ctx.moveTo(screenX+spriteW/2,spriteTop+spriteH*0.3);ctx.lineTo(screenX+spriteW/2+armSwing,spriteTop+spriteH*0.6);ctx.stroke();
        const legOff=Math.sin(d.frame*0.1)*spriteW*0.1;
        ctx.fillStyle=`rgba(${Math.floor(40*shade)},${Math.floor(15*shade)},${Math.floor(10*shade)},1)`;
        ctx.fillRect(screenX-spriteW*0.25,spriteTop+spriteH*0.75,spriteW*0.2,spriteH*0.25+legOff);
        ctx.fillRect(screenX+spriteW*0.05,spriteTop+spriteH*0.75,spriteW*0.2,spriteH*0.25-legOff);
      } else if(d.type==='crawler'){
        const crawlH=spriteH*0.4;const crawlTop=spriteTop+spriteH*0.6;
        ctx.fillStyle=`rgba(${Math.floor(50*shade)},${Math.floor(35*shade)},${Math.floor(10*shade)},1)`;
        ctx.fillRect(screenX-spriteW*0.6,crawlTop,spriteW*1.2,crawlH*0.5);
        ctx.strokeStyle=`rgba(${Math.floor(70*shade)},${Math.floor(40*shade)},0,1)`;ctx.lineWidth=2;
        for(let leg=0;leg<4;leg++){
          const lx=screenX-spriteW*0.5+leg*spriteW*0.35;
          const lOff=Math.sin(d.frame*0.15+leg)*5;
          ctx.beginPath();ctx.moveTo(lx,crawlTop+crawlH*0.3);ctx.lineTo(lx+(leg<2?-8:8),crawlTop+crawlH*0.5+lOff);ctx.stroke();
        }
        ctx.fillStyle=`rgba(255,50,0,${shade})`;ctx.shadowColor='#f30';ctx.shadowBlur=8*shade;
        ctx.beginPath();ctx.arc(screenX-3,crawlTop-2,3*shade,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(screenX+3,crawlTop-2,3*shade,0,Math.PI*2);ctx.fill();
        ctx.shadowBlur=0;
      } else {
        ctx.fillStyle=`rgba(${Math.floor(30*shade)},${Math.floor(50*shade)},${Math.floor(10*shade)},1)`;
        ctx.fillRect(screenX-spriteW*0.2,spriteTop+spriteH*0.1,spriteW*0.4,spriteH*0.7);
        ctx.fillStyle=`rgba(${Math.floor(40*shade)},${Math.floor(60*shade)},${Math.floor(15*shade)},1)`;
        ctx.beginPath();ctx.arc(screenX,spriteTop+spriteH*0.08,spriteW*0.22,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=`rgba(0,${Math.floor(255*shade)},0,${shade*0.8})`;
        ctx.shadowColor='#0f0';ctx.shadowBlur=6*shade;
        const droolLen=spriteH*0.1+Math.sin(d.frame*0.05)*spriteH*0.05;
        ctx.fillRect(screenX-2,spriteTop+spriteH*0.15,4,droolLen);
        ctx.shadowBlur=0;
        ctx.fillStyle=`rgba(0,255,0,${shade})`;
        ctx.fillRect(screenX-spriteW*0.1,spriteTop+spriteH*0.05,3,3);
        ctx.fillRect(screenX+spriteW*0.04,spriteTop+spriteH*0.05,3,3);
      }
      if(d.hp<d.maxHp){
        const barW=spriteW*0.8;
        ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(screenX-barW/2,spriteTop-8,barW,4);
        ctx.fillStyle='#f00';ctx.fillRect(screenX-barW/2,spriteTop-8,barW*(d.hp/d.maxHp),4);
      }
    }
  }

  function drawWeapon(){
    const bob=Math.sin(tick*0.08)*3;
    const gunX=W/2+80, gunY=H-120+bob;
    ctx.fillStyle='#2a2a2a';ctx.fillRect(gunX,gunY,60,25);ctx.fillRect(gunX+10,gunY+25,20,40);
    ctx.fillStyle='#1a1a1a';ctx.fillRect(gunX-30,gunY+5,40,15);
    ctx.fillStyle='#333';ctx.fillRect(gunX+5,gunY+3,50,3);
    if(muzzleLife>0){ctx.fillStyle='rgba(255,150,0,0.6)';ctx.beginPath();ctx.arc(gunX-30,gunY+12,8,0,Math.PI*2);ctx.fill();}
  }

  function drawMuzzle(){
    if(muzzleLife<=0)return;
    const alpha=muzzleLife/6;
    ctx.fillStyle=`rgba(255,${150+muzzleLife*15},0,${alpha})`;
    ctx.shadowColor='#ff8800';ctx.shadowBlur=30;
    ctx.beginPath();ctx.arc(W/2,H-60,20+muzzleLife*3,0,Math.PI*2);ctx.fill();
    ctx.shadowBlur=0;
  }

  function drawCrosshair(){
    ctx.strokeStyle='#f44';ctx.lineWidth=2;ctx.shadowColor='#f00';ctx.shadowBlur=4;
    const cx=W/2,cy=H/2;
    ctx.beginPath();ctx.moveTo(cx-15,cy);ctx.lineTo(cx-5,cy);ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx+5,cy);ctx.lineTo(cx+15,cy);ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx,cy-15);ctx.lineTo(cx,cy-5);ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx,cy+5);ctx.lineTo(cx,cy+15);ctx.stroke();
    ctx.shadowBlur=0;
  }

  function drawHUD(){
    ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(10,H-50,220,40);
    ctx.strokeStyle='#600';ctx.lineWidth=1;ctx.strokeRect(10,H-50,220,40);
    ctx.fillStyle='#f00';ctx.font='bold 14px monospace';ctx.fillText('HEALTH',20,H-32);
    const hpW=140*(hp/maxHp);
    ctx.fillStyle='#300';ctx.fillRect(80,H-40,140,16);
    ctx.fillStyle=hp>maxHp*0.3?'#f00':'#f80';ctx.fillRect(80,H-40,hpW,16);
    ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(W-200,H-50,190,40);
    ctx.fillStyle='#f44';ctx.font='bold 14px monospace';ctx.fillText('WAVE: '+wave,W-190,H-32);
    ctx.fillStyle='#fa0';ctx.fillText('KILLS: '+kills,W-190,H-16);
    ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(W/2-60,H-50,120,40);
    ctx.fillStyle='#ff0';ctx.font='bold 16px monospace';ctx.textAlign='center';
    ctx.fillText('AMMO: '+ammo,W/2,H-24);ctx.textAlign='left';
    ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(10,10,160,30);
    ctx.fillStyle='#f44';ctx.font='bold 12px monospace';
    ctx.fillText('GEHENNA  LIVES: '+lives,18,28);
    ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(10,45,160,24);
    ctx.fillStyle='#fa0';ctx.font='11px monospace';
    ctx.fillText('WAVE '+wave+' OF '+waveCount,18,60);
  }

  function drawDamageOverlay(){
    if(dmgTimer<=0)return;
    const alpha=Math.min(0.4,dmgTimer/20);
    ctx.fillStyle=`rgba(180,0,0,${alpha})`;ctx.fillRect(0,0,W,H);
    const grad=ctx.createRadialGradient(W/2,H/2,H*0.3,W/2,H/2,H*0.8);
    grad.addColorStop(0,'transparent');grad.addColorStop(1,`rgba(100,0,0,${alpha*1.5})`);
    ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
  }

  function drawOverlay(title,sub){
    ctx.fillStyle='rgba(0,0,0,0.88)';ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#ff2200';ctx.font='bold 38px monospace';ctx.textAlign='center';
    ctx.fillText(title,W/2,H/2-30);
    ctx.fillStyle='#aaa';ctx.font='16px monospace';
    ctx.fillText(sub,W/2,H/2+10);
    ctx.fillStyle='#666';ctx.font='13px monospace';
    ctx.fillText('Lives remaining: '+lives,W/2,H/2+35);
    ctx.textAlign='left';
  }

  function shoot(){
    if(shootCooldown>0||ammo<=0)return;
    shootCooldown=SHOOT_CD;muzzleLife=6;ammo--;
    const shootCos=Math.cos(angle),shootSin=Math.sin(angle);
    let closest=null,closestDist=Infinity;
    for(const d of demons){
      if(!d.alive)continue;
      const ddist=Math.hypot(d.x-px,d.y-py);
      let relAng=Math.atan2(d.y-py,d.x-px)-angle;
      while(relAng>Math.PI)relAng-=Math.PI*2;
      while(relAng<-Math.PI)relAng+=Math.PI*2;
      const hitW=0.4/ddist;
      if(Math.abs(relAng)<hitW&&ddist<closestDist){
        let blocked=false;
        for(let t=0;t<ddist;t+=0.1){if(getMap(px+shootCos*t,py+shootSin*t)){blocked=true;break;}}
        if(!blocked){closest=d;closestDist=ddist;}
      }
    }
    if(closest){closest.hp--;if(closest.hp<=0){closest.alive=false;kills++;}}
  }

  function endGehenna(survived){
    cancelAnimationFrame(raf);keys.clear();canvas.remove();
    levelResolving=false;
    if(survived){beginLevel(nextLevel,false);}
    else{beginLevel(1,false);}
    startTickLoop();
  }

  function gameLoop(){
    tick++;
    if(keys.has('ArrowLeft')||keys.has('a'))angle-=ROT_SPEED;
    if(keys.has('ArrowRight')||keys.has('d'))angle+=ROT_SPEED;
    const cos=Math.cos(angle),sin=Math.sin(angle);
    let dx=0,dy=0;
    if(keys.has('ArrowUp')||keys.has('w')){dx+=cos*MOVE_SPEED;dy+=sin*MOVE_SPEED;}
    if(keys.has('ArrowDown')||keys.has('s')){dx-=cos*MOVE_SPEED;dy-=sin*MOVE_SPEED;}
    if(!getMap(px+dx*3,py))px+=dx;
    if(!getMap(px,py+dy*3))py+=dy;
    shootCooldown=Math.max(0,shootCooldown-1);
    if(shooting)shoot();
    ammo = 999;
    muzzleLife=Math.max(0,muzzleLife-1);
    dmgTimer=Math.max(0,dmgTimer-1);

    let allDead=true;
    for(const d of demons){
      if(!d.alive)continue;
      allDead=false;d.frame++;
      const ddist=Math.hypot(d.x-px,d.y-py);
      if(ddist>0.8){
        const toX=(px-d.x)/ddist,toY=(py-d.y)/ddist;
        const speed=(d.type==='crawler'?0.012*1.8:0.012)*speedMult;
        const nx=d.x+toX*speed,ny=d.y+toY*speed;
        if(!getMap(nx,d.y))d.x=nx;if(!getMap(d.x,ny))d.y=ny;
      }
      if(ddist<0.7){d.attackTimer--;if(d.attackTimer<=0){hp-=d.type==='brute'?15:8;dmgTimer=15;d.attackTimer=d.type==='brute'?40:25;}}
      if(d.type==='spitter'&&ddist<8&&ddist>2){d.attackTimer--;if(d.attackTimer<=0){const toX2=(px-d.x)/ddist,toY2=(py-d.y)/ddist;projectiles.push({x:d.x,y:d.y,dx:toX2*0.08,dy:toY2*0.08,life:120});d.attackTimer=80+Math.random()*40;}}
    }

    projectiles=projectiles.filter(pr=>{
      pr.x+=pr.dx;pr.y+=pr.dy;pr.life--;
      if(getMap(pr.x,pr.y))return false;
      if(Math.hypot(pr.x-px,pr.y-py)<0.4){hp-=10;dmgTimer=10;return false;}
      return pr.life>0;
    });

    if(hp<=0){
      lives--;
      if(lives<=0){
        ctx.fillStyle='rgba(0,0,0,0.88)';ctx.fillRect(0,0,W,H);
        ctx.fillStyle='#ff2200';ctx.font='bold 38px monospace';ctx.textAlign='center';
        ctx.fillText('CONSUMED BY GEHENNA',W/2,H/2-20);
        ctx.fillStyle='#aaa';ctx.font='16px monospace';
        ctx.fillText('Returning to level 1...',W/2,H/2+20);
        ctx.textAlign='left';
        setTimeout(()=>endGehenna(false),2500);
        return;
      }
      hp=maxHp;dmgTimer=30;
      drawOverlay('CONSUMED.','Respawning... '+lives+' lives left.');
      setTimeout(()=>{px=8;py=8;raf=requestAnimationFrame(gameLoop);},1500);
      return;
    }

    if(allDead){
      waveClearTimer++;
      if(waveClearTimer>90){
        if(wave>=waveCount){
          ctx.fillStyle='rgba(0,0,0,0.88)';ctx.fillRect(0,0,W,H);
          ctx.fillStyle='#ff4400';ctx.font='bold 36px monospace';ctx.textAlign='center';
          ctx.fillText('GEHENNA CONQUERED.',W/2,H/2-20);
          ctx.fillStyle='#aaa';ctx.font='16px monospace';
          ctx.fillText('The factory grants you passage.',W/2,H/2+20);
          ctx.textAlign='left';
          setTimeout(()=>endGehenna(true),2500);
          return;
        }
        wave++;ammo+=20;hp=Math.min(maxHp,hp+30);
        demons=spawnWave(wave-1);waveClearTimer=0;
      }
    }

    ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
    castRays();
    drawDemons();
    drawWeapon();drawMuzzle();drawCrosshair();drawDamageOverlay();drawHUD();

    if(allDead&&wave<waveCount){
      ctx.fillStyle='#f44';ctx.font='bold 28px monospace';ctx.textAlign='center';
      ctx.fillText('WAVE '+wave+' CLEARED',W/2,H/2-20);
      ctx.fillStyle='#aaa';ctx.font='16px monospace';
      ctx.fillText('Descending deeper...',W/2,H/2+10);
      ctx.textAlign='left';
    }

    raf=requestAnimationFrame(gameLoop);
  }

  canvas.addEventListener('mousedown',()=>{shooting=true;});
  canvas.addEventListener('mouseup',()=>{shooting=false;});
  canvas.addEventListener('touchstart',e=>{e.preventDefault();shooting=true;},{passive:false});
  canvas.addEventListener('touchend',e=>{e.preventDefault();shooting=false;},{passive:false});
  window.addEventListener('keydown',e=>{keys.add(e.key);if([' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))e.preventDefault();});
  window.addEventListener('keyup',e=>keys.delete(e.key));

  raf=requestAnimationFrame(gameLoop);
}

})();
