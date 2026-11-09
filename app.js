'use strict';

/* =========================================================================
 * Interval Timer
 *  - 5 s lead-in, then alternating work / rest until the total time is used.
 *  - Beeps on the last 5 s of every interval, plus a tone at each change.
 *  - Audio uses the Web Audio API with an "ambient" audio session so it
 *    mixes with music (Spotify etc.) instead of pausing it.
 *  - Screen Wake Lock keeps the display on while the timer runs.
 *  - Workouts are saved in this browser's localStorage.
 * ========================================================================= */

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const LEAD_IN = 5;      // seconds before the first work interval
const WARN_SECS = 5;    // countdown beeps at the end of each interval
const STORE_KEY = 'intervalTimer.v1';

const $ = (id) => document.getElementById(id);

/* ---------------------------- storage ---------------------------------- */

const DEFAULT_AMRAP = 'Push-up x 5\nOverhead press x 8\nBurpee x 10';

const DEFAULT_CFG = {
  mode: 'interval',
  amrap: DEFAULT_AMRAP,
  totalMin: 20, totalSec: 0, work: 40, rest: 20,
  lifts: 'Goblet squat\nPush-ups\nKettlebell swing\nPlank',
};

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return {
        current: { ...DEFAULT_CFG, ...(s.current || {}) },
        workouts: Array.isArray(s.workouts) ? s.workouts : [],
        selectedId: s.selectedId || '',
        volume: typeof s.volume === 'number' ? s.volume : 0.8,
        presetLevel: s.presetLevel === 2 ? 2 : 1,
      };
    }
  } catch (_) { /* storage unavailable or corrupt */ }
  return { current: { ...DEFAULT_CFG }, workouts: [], selectedId: '', volume: 0.8, presetLevel: 1 };
}

let store = loadStore();

function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (_) { /* ignore */ }
}

/* ---------------------------- presets ---------------------------------- */
/* Built-in 20-minute kettlebell workouts, all 40 s work / 20 s rest
 * (20 rounds). Presets are read-only; "Save" makes your own copy. */

const L2 = { totalMin: 20, totalSec: 0, work: 40, rest: 20 };
const lines = (...a) => a.join('\n');

const PRESETS = [
  { id: 'preset-full-2', name: 'KB Full Body · Level 2', cfg: { ...L2, lifts: lines(
    'Two-hand swing', 'Goblet squat', 'Clean & press – left', 'Clean & press – right',
    'Renegade row', 'Reverse lunge – alternating', 'Push-up', 'Russian twist') } },
  { id: 'preset-lower-2', name: 'KB Lower Body · Level 2', cfg: { ...L2, lifts: lines(
    'Two-hand swing', 'Goblet squat', 'Single-leg deadlift – left', 'Single-leg deadlift – right',
    'Goblet reverse lunge – alternating', 'Sumo deadlift high pull', 'Lateral lunge – alternating',
    'Goblet squat pulse') } },
  { id: 'preset-upper-2', name: 'KB Upper Body & Core · Level 2', cfg: { ...L2, lifts: lines(
    'Clean & press – left', 'Clean & press – right', 'Renegade row', 'Push-up',
    'Bent-over row – left', 'Bent-over row – right', 'Half get-up – alternating',
    'Plank pull-through', 'Russian twist', 'Overhead press – alternating') } },
  { id: 'preset-cond-2', name: 'KB Swing Conditioning · Level 2', cfg: { ...L2, lifts: lines(
    'Two-hand swing', 'Goblet squat thruster', 'Single-arm swing – left', 'Single-arm swing – right',
    'High pull – alternating', 'Snatch – left', 'Snatch – right', 'Burpee') } },

  // 5-move circuit from a workout card, both 40 s on / 20 s off for 20 minutes.
  { id: 'preset-circuit5-1', name: 'KB 5-Move Circuit · Level 1', cfg: { ...L2, lifts: lines(
    'Swings', 'Squat to press', 'Plank row', 'Deadlift', 'Reverse lunge & curl') } },
  { id: 'preset-circuit5-2', name: 'KB 5-Move Circuit · Level 2', cfg: { ...L2, lifts: lines(
    'Two-handed swing: Snap your hips and let the bell float to chest height.',
    'Goblet squat: Hold the bell at your chest and squat to a controlled depth.',
    'Single-arm row: Hinge forward and pull the bell to your hip.',
    'Clean and press: Keep your core tight and avoid leaning back.',
    'Reverse lunge: Hold the bell at your chest and alternate legs.') } },
];

// AMRAP presets: as many rounds as possible in 20 minutes.
const AMRAP20 = { mode: 'amrap', totalMin: 20, totalSec: 0, work: 40, rest: 20, lifts: '' };
PRESETS.push(
  { id: 'preset-amrap-1', name: 'KB AMRAP · Level 1', cfg: { ...AMRAP20, amrap: lines(
    'Two-hand swing x 10', 'Goblet squat x 8', 'Push-up x 5', 'Bent-over row x 8', 'Dead bug x 6 / side') } },
  { id: 'preset-amrap-2', name: 'KB AMRAP · Level 2', cfg: { ...AMRAP20, amrap: lines(
    'Two-hand swing x 15', 'Goblet squat thruster x 10', 'Renegade row x 6 / side',
    'Clean & press x 5 / side', 'Reverse lunge x 8 / side', 'Burpee x 8') } },
);

// Presets named "X · Level N" are grouped: one entry in the list, with a
// Level 1 / Level 2 toggle to switch between them.
for (const pr of PRESETS) {
  const m = pr.name.match(/^(.*?)\s*·\s*Level\s*(\d+)$/);
  pr.base = m ? m[1] : pr.name;
  pr.level = m ? Number(m[2]) : 0;
}
const presetGroup = (base) => PRESETS.filter((p) => p.base === base).sort((a, b) => a.level - b.level);
const GROUP_PREFIX = 'group:';

const findAny = (id) => store.workouts.find((w) => w.id === id) || PRESETS.find((w) => w.id === id);

/* ---------------------------- config ----------------------------------- */

function int(v, min, max, fallback) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

let mode = 'interval';

function setMode(m) {
  mode = m === 'amrap' ? 'amrap' : 'interval';
  document.body.classList.toggle('mode-amrap', mode === 'amrap');
  document.body.classList.toggle('mode-interval', mode === 'interval');
  for (const b of document.querySelectorAll('.mode-btn')) {
    const on = b.dataset.mode === mode;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on);
  }
  $('addLift').textContent = mode === 'amrap' ? '+ Add exercise' : '+ Add lift';
}

/* ----- Lift rows: one input per lift, backed by the hidden #lifts text ----- */

const EXAMPLES = {
  interval: ['Goblet squat', 'Push-up', 'Kettlebell swing', 'Plank'],
  amrap: [['Push-up', '5'], ['Overhead press', '8'], ['Burpee', '10']],
};

function renderLiftRows(focusIndex) {
  const box = $('liftRows');
  box.innerHTML = '';
  const items = mode === 'amrap'
    ? parseAmrap($('lifts').value).map((it) => [it.name, it.qty])
    : String($('lifts').value || '').split('\n').map((s) => s.trim()).filter(Boolean).map((s) => [s, '']);
  if (!items.length) items.push(['', '']);
  items.forEach(([name, reps], i) => box.append(makeLiftRow(name, reps, i)));
  renumberRows();
  if (focusIndex != null) {
    const r = box.children[Math.min(focusIndex, box.children.length - 1)];
    if (r) r.querySelector('.lift-name').focus();
  }
}

function makeLiftRow(name, reps, i) {
  const row = document.createElement('div');
  row.className = 'lift-row';

  const num = document.createElement('span');
  num.className = 'num';

  const nameIn = document.createElement('input');
  nameIn.type = 'text';
  nameIn.className = 'lift-name';
  nameIn.value = name;
  nameIn.autocomplete = 'off';
  nameIn.enterKeyHint = 'next';
  nameIn.maxLength = 200;
  const ex = mode === 'amrap' ? EXAMPLES.amrap[i % EXAMPLES.amrap.length][0] : EXAMPLES.interval[i % EXAMPLES.interval.length];
  nameIn.placeholder = ex;
  nameIn.setAttribute('aria-label', mode === 'amrap' ? 'Exercise' : 'Lift');
  row.append(num, nameIn);

  if (mode === 'amrap') {
    const repsIn = document.createElement('input');
    repsIn.type = 'text';
    repsIn.className = 'lift-reps';
    repsIn.value = reps;
    repsIn.autocomplete = 'off';
    repsIn.enterKeyHint = 'next';
    repsIn.maxLength = 20;
    repsIn.placeholder = 'reps';
    repsIn.setAttribute('aria-label', 'Reps');
    row.append(repsIn);
  }

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn ghost icon-btn';
  del.textContent = '−';
  del.setAttribute('aria-label', 'Remove');
  del.addEventListener('click', () => removeRow(row));
  row.append(del);

  for (const inp of row.querySelectorAll('input')) {
    inp.addEventListener('input', syncLifts);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (inp.classList.contains('lift-name') && row.querySelector('.lift-reps')) row.querySelector('.lift-reps').focus();
        else addRow(row);
      } else if (e.key === 'Backspace' && inp.classList.contains('lift-name') && !inp.value
                 && !(row.querySelector('.lift-reps') || {}).value && $('liftRows').children.length > 1) {
        e.preventDefault();
        const prev = row.previousElementSibling || row.nextElementSibling;
        removeRow(row);
        if (prev) prev.querySelector('.lift-name').focus();
      }
    });
  }
  return row;
}

function renumberRows() {
  [...$('liftRows').children].forEach((r, i) => { r.querySelector('.num').textContent = `${i + 1}.`; });
}

function addRow(after) {
  const box = $('liftRows');
  const row = makeLiftRow('', '', after ? [...box.children].indexOf(after) + 1 : box.children.length);
  if (after && after.nextSibling) box.insertBefore(row, after.nextSibling); else box.append(row);
  renumberRows();
  row.querySelector('.lift-name').focus();
}

function removeRow(row) {
  const box = $('liftRows');
  if (box.children.length > 1) row.remove();
  else for (const inp of row.querySelectorAll('input')) inp.value = '';
  renumberRows();
  syncLifts();
}

function syncLifts() {
  const lines = [...$('liftRows').children].map((r) => {
    const name = r.querySelector('.lift-name').value.trim();
    const repsEl = r.querySelector('.lift-reps');
    const reps = repsEl ? repsEl.value.trim() : '';
    if (!name) return '';
    return reps ? `${name} x ${reps}` : name;
  }).filter(Boolean);
  $('lifts').value = lines.join('\n');
  onFormChange();
}

function readForm() {
  const text = $('lifts').value;
  return {
    mode,
    lifts: mode === 'interval' ? text : (store.current.lifts ?? DEFAULT_CFG.lifts),
    amrap: mode === 'amrap' ? text : (store.current.amrap ?? DEFAULT_AMRAP),
    totalMin: int($('totalMin').value, 0, 180, 0),
    totalSec: int($('totalSec').value, 0, 59, 0),
    work: int($('work').value, 1, 3600, 40),
    rest: int($('rest').value, 0, 3600, 0),
  };
}

function writeForm(cfg) {
  $('totalMin').value = cfg.totalMin;
  $('totalSec').value = cfg.totalSec;
  $('work').value = cfg.work;
  $('rest').value = cfg.rest;
  setMode(cfg.mode);
  $('lifts').value = mode === 'amrap' ? (cfg.amrap ?? DEFAULT_AMRAP) : cfg.lifts;
  renderLiftRows();
}

/* One lift per line. An optional cue can follow a colon:
 *   "Goblet squat: Hold the bell at your chest and squat to depth." */
function parseLifts(text) {
  return String(text || '').split('\n').map((s) => s.trim()).filter(Boolean).map((line) => {
    const i = line.indexOf(':');
    if (i > 0 && i < line.length - 1) return { name: line.slice(0, i).trim(), cue: line.slice(i + 1).trim() };
    return { name: line.replace(/:$/, '').trim(), cue: '' };
  });
}

/* AMRAP lines: "Push-up x 5", "5 x Push-up", "10 burpees" or just a name. */
function parseAmrap(text) {
  return String(text || '').split('\n').map((s) => s.trim()).filter(Boolean).map((line) => {
    let m = line.match(/^(.*?\S)\s*[x×*]\s*(\d.*)$/i);
    if (m) return { name: m[1].trim(), qty: m[2].trim() };
    m = line.match(/^(\d+\S*)\s*(?:[x×*]\s*)?(\D.*)$/i);
    if (m) return { name: m[2].trim(), qty: m[1].trim() };
    return { name: line, qty: '' };
  });
}

/* Build the full timeline of segments for a config. Times are seconds from
 * pressing Start (lead-in included). */
function buildPlan(cfg) {
  const total = cfg.totalMin * 60 + cfg.totalSec;
  const lifts = parseLifts(cfg.lifts);
  const segs = [{ type: 'lead', start: 0, dur: LEAD_IN }];
  if (cfg.mode === 'amrap') {
    const items = parseAmrap(cfg.amrap);
    if (total > 0) segs.push({ type: 'amrap', start: LEAD_IN, dur: total });
    for (const s of segs) s.next = null;
    return { segs, total, end: LEAD_IN + total, rounds: 0, lifts: [], amrap: items, mode: 'amrap' };
  }
  let t = LEAD_IN;
  let used = 0;
  let round = 0;

  while (used < total) {
    round++;
    const item = lifts.length ? lifts[(round - 1) % lifts.length] : { name: 'Work', cue: '' };
    const w = Math.min(cfg.work, total - used);
    segs.push({ type: 'work', start: t, dur: w, round, lift: item.name, cue: item.cue });
    t += w; used += w;
    if (used >= total) break;
    const r = Math.min(cfg.rest, total - used);
    if (r > 0) {
      segs.push({ type: 'rest', start: t, dur: r, round });
      t += r; used += r;
    }
  }

  const rounds = round;
  // Fill in what comes next for every segment.
  for (let i = 0; i < segs.length; i++) {
    const next = segs.slice(i + 1).find((s) => s.type === 'work');
    segs[i].next = next ? next.lift : null;
    segs[i].nextCue = next ? next.cue : '';
    segs[i].rounds = rounds;
  }
  // First "next" for lead-in is round 1.
  return { segs, total, end: t, rounds, lifts };
}

/* Sound events: countdown beeps in the last 5 s of each segment and a tone
 * at each boundary. */
function buildEvents(plan) {
  const ev = [];
  plan.segs.forEach((s, i) => {
    const end = s.start + s.dur;
    for (let k = WARN_SECS; k >= 1; k--) {
      const t = end - k;
      if (t > s.start + 0.01) ev.push({ t, kind: 'tick' });
    }
    const nxt = plan.segs[i + 1];
    ev.push({ t: end, kind: !nxt ? 'finish' : nxt.type === 'rest' ? 'rest' : 'go' });
  });
  return ev.sort((a, b) => a.t - b.t);
}

/* ---------------------------- audio ------------------------------------ */

// Ask iOS/Safari (16.4+) to mix our sounds with other apps' audio instead of
// interrupting it. Must be set before audio starts.
try {
  if (navigator.audioSession) navigator.audioSession.type = 'ambient';
} catch (_) { /* unsupported */ }

let ctx = null;
let master = null;      // master volume
let batch = null;       // gain node for the current batch of scheduled tones
let anchor = null;      // { ctxTime, perf } mapping between the two clocks

function ensureAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.gain.value = store.volume;
    master.connect(ctx.destination);
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  // Unlock on iOS: play an empty buffer inside the user gesture.
  try {
    const b = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = b; src.connect(ctx.destination); src.start(0);
  } catch (_) { /* ignore */ }
  return ctx;
}

const TONES = {
  tick:   [{ f: 880,  d: 0.12, off: 0 }],
  go:     [{ f: 1320, d: 0.45, off: 0 }],
  rest:   [{ f: 660,  d: 0.45, off: 0 }],
  finish: [{ f: 990, d: 0.18, off: 0 }, { f: 1320, d: 0.18, off: 0.22 }, { f: 1760, d: 0.6, off: 0.44 }],
};

function tone(dest, when, freq, dur) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'triangle';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.9, when + 0.008);
  g.gain.setValueAtTime(0.9, when + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(g); g.connect(dest);
  o.start(when);
  o.stop(when + dur + 0.02);
}

function playKind(dest, when, kind) {
  for (const p of TONES[kind]) tone(dest, when + p.off, p.f, p.d);
}

function cancelScheduled() {
  if (batch) {
    try { batch.gain.cancelScheduledValues(0); batch.gain.value = 0; batch.disconnect(); } catch (_) {}
    batch = null;
  }
}

/* Schedule every remaining sound for the run up front. This keeps beeps
 * accurate even if the page's timers get throttled. */
function scheduleFrom(elapsed) {
  cancelScheduled();
  if (!ctx) return;
  batch = ctx.createGain();
  batch.connect(master);
  const nowCtx = ctx.currentTime;
  anchor = { ctxTime: nowCtx, perf: performance.now() };
  for (const e of run.events) {
    if (e.t < elapsed - 0.02) continue;
    const when = nowCtx + (e.t - elapsed) + 0.03;
    playKind(batch, when, e.kind);
  }
}

/* ---------------------------- wake lock -------------------------------- */

/* Preferred: the Screen Wake Lock API (Chrome, Safari 16.4+, Firefox).
 * Fallback: Android WebView browsers (DuckDuckGo, many in-app browsers)
 * don't have it, but they keep the screen on while a video plays. So we loop
 * a tiny black video. It has NO audio track, so it never takes audio focus
 * and your music keeps playing. */

let wakeLock = null;
let wakeVideo = null;

function getWakeVideo() {
  if (wakeVideo) return wakeVideo;
  const v = document.createElement('video');
  v.setAttribute('playsinline', '');
  v.setAttribute('aria-hidden', 'true');
  v.loop = true;
  v.preload = 'auto';
  v.disableRemotePlayback = true;
  v.className = 'wake-video';
  for (const [src, type] of [['keepawake.webm', 'video/webm'], ['keepawake.mp4', 'video/mp4']]) {
    const s = document.createElement('source');
    s.src = src; s.type = type;
    v.append(s);
  }
  document.body.append(v);
  wakeVideo = v;
  return v;
}

function startWakeVideo() {
  const v = getWakeVideo();
  if (!v.paused) return;
  v.play().catch(() => {
    // Some browsers block unmuted autoplay outside a tap; muted is always allowed.
    v.muted = true;
    v.play().catch(() => {});
  });
}

async function requestWake() {
  if ('wakeLock' in navigator) {
    try {
      if (wakeLock && !wakeLock.released) return;
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
      return;
    } catch (_) { /* denied or unavailable: fall through to video */ }
  }
  startWakeVideo();
}

function releaseWake() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  if (wakeVideo && !wakeVideo.paused) wakeVideo.pause();
}

/* ---------------------------- run state -------------------------------- */

const run = {
  active: false,
  paused: false,
  stopped: false,
  plan: null,
  events: [],
  startPerf: 0,      // performance.now() when elapsed == 0
  pausedAt: 0,       // elapsed seconds when paused
  lastShown: null,
  raf: 0,
  timer: 0,
};

function elapsedNow() {
  return run.paused ? run.pausedAt : (performance.now() - run.startPerf) / 1000;
}

function show(screen) {
  for (const id of ['setup', 'run', 'done']) $(id).hidden = id !== screen;
  window.scrollTo(0, 0);
}

function setPhaseClass(type) {
  document.body.classList.remove('phase-lead', 'phase-work', 'phase-rest', 'phase-done');
  if (type) document.body.classList.add('phase-' + type);
}

function fmt(secs) {
  secs = Math.max(0, Math.ceil(secs - 1e-6));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m + ':' + String(s).padStart(2, '0');
}

function startRun(cfg) {
  const plan = buildPlan(cfg);
  if (plan.total <= 0) return;
  ensureAudio();
  run.plan = plan;
  run.roundsDone = 0;
  $('roundCount').textContent = '0';
  document.body.classList.toggle('run-amrap', plan.mode === 'amrap');
  renderAmrapList(plan.amrap || []);
  run.events = buildEvents(plan);
  run.active = true;
  run.paused = false;
  run.stopped = false;
  resetStopBtn();
  run.startPerf = performance.now();
  run.lastShown = null;
  scheduleFrom(0);
  requestWake();
  $('pauseBtn').textContent = 'Pause';
  show('run');
  loop();
  clearInterval(run.timer);
  run.timer = setInterval(tick, 250);
}

function resetStopBtn() {
  $('stopBtn').textContent = 'Stop';
  $('stopBtn').classList.remove('danger');
}

function pauseRun() {
  if (!run.active || run.paused) return;
  run.pausedAt = elapsedNow();
  run.paused = true;
  cancelScheduled();
  $('pauseBtn').textContent = 'Resume';
  render();
}

function resumeRun() {
  if (!run.active || !run.paused) return;
  ensureAudio();
  run.paused = false;
  run.stopped = false;
  resetStopBtn();
  run.startPerf = performance.now() - run.pausedAt * 1000;
  scheduleFrom(run.pausedAt);
  requestWake();
  $('pauseBtn').textContent = 'Pause';
  loop();
}

const figure = new MoveFigure($('moveFig'));

function renderAmrapList(items) {
  const ul = $('amrapList');
  ul.innerHTML = '';
  ul.classList.toggle('dense', items.length > 6);
  for (const it of items) {
    const li = document.createElement('li');
    const q = document.createElement('span');
    q.className = 'qty';
    q.textContent = it.qty ? `× ${it.qty}` : '';
    const n = document.createElement('span');
    n.className = 'name';
    n.textContent = it.name;
    li.append(n, q);
    ul.append(li);
  }
}

function bumpRounds(d) {
  if (!run.active) return;
  run.roundsDone = Math.max(0, (run.roundsDone || 0) + d);
  $('roundCount').textContent = run.roundsDone;
}
$('roundPlus').addEventListener('click', () => bumpRounds(1));
$('roundMinus').addEventListener('click', () => bumpRounds(-1));

function stopRun() {
  figure.set(null);
  document.body.classList.remove('run-amrap');
  run.active = false;
  run.paused = false;
  run.stopped = false;
  resetStopBtn();
  cancelScheduled();
  cancelAnimationFrame(run.raf);
  clearInterval(run.timer);
  releaseWake();
  setPhaseClass(null);
}

function finishRun() {
  const p = run.plan;
  const rounds = p.mode === 'amrap' ? (run.roundsDone || 0) : p.rounds;
  stopRun();
  setPhaseClass('done');
  $('doneStats').textContent = p.mode === 'amrap'
    ? `AMRAP ${fmt(p.total)} · ${plural(rounds, 'round')} completed`
    : `${plural(rounds, 'round')} · ${fmt(p.total)} total`;
  show('done');
}

function loop() {
  cancelAnimationFrame(run.raf);
  const step = () => {
    if (!run.active) return;
    render();
    if (!run.paused) run.raf = requestAnimationFrame(step);
  };
  step();
}

// Runs even when rAF is throttled: checks for the end and clock drift.
function tick() {
  if (!run.active || run.paused) return;
  const el = elapsedNow();
  if (el >= run.plan.end) { finishRun(); return; }
  if (ctx && anchor) {
    const expected = anchor.ctxTime + (performance.now() - anchor.perf) / 1000;
    if (ctx.state !== 'running' || Math.abs(ctx.currentTime - expected) > 0.08) {
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
      else scheduleFrom(el);
    }
  }
}

function render() {
  const p = run.plan;
  const el = elapsedNow();
  if (el >= p.end) { if (!run.paused) finishRun(); return; }

  let seg = p.segs[0];
  for (const s of p.segs) { if (el >= s.start) seg = s; else break; }

  const segLeft = seg.start + seg.dur - el;
  const shown = Math.max(1, Math.ceil(segLeft - 1e-6));
  const key = seg.start + ':' + shown + ':' + run.paused + ':' + run.stopped;
  // Movement guide: current lift while working, the next one otherwise.
  const moveName = p.mode === 'amrap' ? null : seg.type === 'work' ? seg.lift : seg.next;
  const moveCue = seg.type === 'work' ? seg.cue : seg.nextCue;
  const move = moveName ? MOVES.find(moveName) : null;
  figure.set(move);
  $('moveDesc').textContent = p.mode === 'amrap' ? '' : (moveCue || (move ? move.desc : ''));

  const label = (txt) => (run.stopped ? 'STOPPED' : run.paused ? 'PAUSED' : txt);

  if (key !== run.lastShown) {
    run.lastShown = key;
    setPhaseClass(seg.type === 'amrap' ? 'work' : seg.type);
    const big = $('bigTime');
    big.textContent = shown >= 60 || seg.type === 'amrap' ? fmt(shown) : String(shown);
    if (shown <= WARN_SECS && !run.paused) {
      big.classList.remove('warn-tick'); void big.offsetWidth; big.classList.add('warn-tick');
    }

    if (p.mode === 'amrap') {
      $('phaseLabel').textContent = label(seg.type === 'lead' ? 'GET READY' : 'AMRAP');
      $('roundLabel').textContent = `AMRAP ${fmt(p.total)}`;
    } else if (seg.type === 'lead') {
      $('phaseLabel').textContent = label('GET READY');
      $('liftLabel').textContent = seg.next || 'Work';
      $('subLabel').textContent = 'First up';
      $('roundLabel').textContent = plural(p.rounds, 'round');
    } else if (seg.type === 'work') {
      $('phaseLabel').textContent = label('WORK');
      $('liftLabel').textContent = seg.lift;
      $('subLabel').textContent = seg.next && seg.round < p.rounds ? `Next: ${seg.next}` : 'Last one!';
      $('roundLabel').textContent = `Round ${seg.round} / ${p.rounds}`;
    } else {
      $('phaseLabel').textContent = label('REST');
      $('liftLabel').textContent = seg.next ? `Up next: ${seg.next}` : 'Almost done';
      $('subLabel').textContent = seg.next ? `Round ${seg.round + 1} of ${p.rounds}` : 'Final rest';
      $('roundLabel').textContent = `Round ${seg.round} / ${p.rounds}`;
    }
  }

  const workoutElapsed = Math.max(0, el - LEAD_IN);
  $('totalLeft').textContent = `${fmt(p.total - workoutElapsed)} left`;
  $('segBar').style.width = `${Math.min(100, ((el - seg.start) / seg.dur) * 100)}%`;
  $('totalBar').style.width = `${Math.min(100, (workoutElapsed / p.total) * 100)}%`;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !run.active) return;
  requestWake();
  if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
  if (!run.paused) {
    if (elapsedNow() >= run.plan.end) { finishRun(); return; }
    scheduleFrom(elapsedNow());
    loop();
  }
});

/* ---------------------------- setup UI --------------------------------- */

function updateSummary() {
  const cfg = readForm();
  const plan = buildPlan(cfg);
  if (plan.total <= 0) {
    $('summary').innerHTML = 'Set a total time to begin.';
    $('previewList').innerHTML = '';
    $('startBtn').disabled = true;
    return;
  }
  $('startBtn').disabled = false;
  $('previewSummary').textContent = cfg.mode === 'amrap' ? 'Preview list' : 'Preview rounds';
  if (cfg.mode === 'amrap') {
    $('summary').innerHTML = `<strong>AMRAP</strong> · ${fmt(plan.total)} + ${LEAD_IN}s lead-in · ${plural(plan.amrap.length, 'exercise')}`;
    const ol = $('previewList');
    ol.innerHTML = '';
    for (const it of plan.amrap) {
      const li = document.createElement('li');
      const b = document.createElement('b');
      b.textContent = it.name;
      li.append(b, it.qty ? ` × ${it.qty}` : '');
      const mv = MOVES.find(it.name);
      if (mv) { const sm = document.createElement('small'); sm.textContent = mv.desc; li.append(sm); }
      ol.append(li);
    }
    return;
  }
  const cycle = cfg.work + cfg.rest;
  const partial = plan.total % cycle !== 0;
  $('summary').innerHTML =
    `<strong>${plural(plan.rounds, 'round')}</strong> · ${fmt(plan.total)} + ${LEAD_IN}s lead-in` +
    (partial ? ' · last interval is shortened to fit' : '');

  const ol = $('previewList');
  ol.innerHTML = '';
  for (const s of plan.segs) {
    if (s.type !== 'work') continue;
    const li = document.createElement('li');
    const b = document.createElement('b');
    b.textContent = s.lift;
    li.append(b, ` — ${s.dur}s`);
    const mv = MOVES.find(s.lift);
    const cue = s.cue || (mv ? mv.desc : '');
    if (cue) { const sm = document.createElement('small'); sm.textContent = cue; li.append(sm); }
    ol.append(li);
  }
}

function onFormChange() {
  store.current = readForm();
  persist();
  updateSummary();
  flash('');
}

function renderSaved() {
  const sel = $('savedSelect');
  sel.innerHTML = '';
  const blank = document.createElement('option');
  blank.value = ''; blank.textContent = '— New workout —';
  sel.append(blank);
  const group = (label, list) => {
    if (!list.length) return;
    const g = document.createElement('optgroup');
    g.label = label;
    for (const w of list) {
      const o = document.createElement('option');
      o.value = w.id;
      const t = w.cfg.totalMin * 60 + w.cfg.totalSec;
      o.textContent = w.cfg.mode === 'amrap'
        ? `${w.name} (AMRAP ${fmt(t)})`
        : `${w.name} (${fmt(t)}, ${w.cfg.work}/${w.cfg.rest})`;
      g.append(o);
    }
    sel.append(g);
  };
  group('My workouts', [...store.workouts].sort((a, b) => a.name.localeCompare(b.name)));
  // One option per preset group; the level toggle picks the version.
  const bases = [...new Set(PRESETS.map((p) => p.base))];
  const pg = document.createElement('optgroup');
  pg.label = 'Kettlebell · 20 min';
  for (const base of bases) {
    const first = presetGroup(base)[0];
    const o = document.createElement('option');
    o.value = GROUP_PREFIX + base;
    const t = first.cfg.totalMin * 60 + first.cfg.totalSec;
    o.textContent = first.cfg.mode === 'amrap'
      ? `${base} (AMRAP ${fmt(t)})`
      : `${base} (${fmt(t)}, ${first.cfg.work}/${first.cfg.rest})`;
    pg.append(o);
  }
  sel.append(pg);

  if (!findAny(store.selectedId)) store.selectedId = '';
  const preset = PRESETS.find((p) => p.id === store.selectedId);
  sel.value = preset ? GROUP_PREFIX + preset.base : store.selectedId;

  const levels = preset ? presetGroup(preset.base) : [];
  $('levelToggle').hidden = levels.length < 2;
  for (const b of document.querySelectorAll('.level-btn')) {
    const on = !!preset && Number(b.dataset.level) === preset.level;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on);
    b.disabled = !levels.some((p) => p.level === Number(b.dataset.level));
  }
  armDelete(false);
  $('deleteBtn').disabled = !store.workouts.some((w) => w.id === store.selectedId);
  const cur = store.workouts.find((w) => w.id === store.selectedId);
  $('workoutName').value = cur ? cur.name : '';
  $('saveBtn').textContent = cur ? 'Update' : 'Save';
}

let flashTimer = 0;
function flash(msg) {
  $('saveMsg').textContent = msg;
  clearTimeout(flashTimer);
  if (msg) flashTimer = setTimeout(() => { $('saveMsg').textContent = ''; }, 2500);
}

function selectPreset(id) {
  store.selectedId = id;
  const w = findAny(id);
  if (w) { store.current = { ...DEFAULT_CFG, ...w.cfg }; writeForm(store.current); }
  persist();
  renderSaved();
  updateSummary();
}

for (const b of document.querySelectorAll('.level-btn')) {
  b.addEventListener('click', () => {
    const cur = PRESETS.find((p) => p.id === store.selectedId);
    if (!cur) return;
    const lvl = Number(b.dataset.level);
    const target = presetGroup(cur.base).find((p) => p.level === lvl);
    if (!target || target.id === cur.id) return;
    store.presetLevel = lvl;
    selectPreset(target.id);
  });
}

$('savedSelect').addEventListener('change', (e) => {
  let id = e.target.value;
  if (id.startsWith(GROUP_PREFIX)) {
    // Open at the last level used (Level 1 by default) when it exists.
    const grp = presetGroup(id.slice(GROUP_PREFIX.length));
    const want = store.presetLevel || 1;
    id = (grp.find((p) => p.level === want) || grp[0]).id;
  }
  store.selectedId = id;
  const w = findAny(store.selectedId);
  if (w) { store.current = { ...DEFAULT_CFG, ...w.cfg }; writeForm(store.current); }
  persist();
  renderSaved();
  updateSummary();
});

$('workoutName').addEventListener('input', () => {
  const name = $('workoutName').value.trim();
  const cur = store.workouts.find((w) => w.id === store.selectedId);
  // Typing a different name on a loaded workout saves it as a new one.
  $('saveBtn').textContent = cur && cur.name === name ? 'Update' : 'Save';
});

$('saveBtn').addEventListener('click', () => {
  const name = $('workoutName').value.trim();
  if (!name) { flash('Give the workout a name first.'); $('workoutName').focus(); return; }
  const cfg = readForm();
  let w = store.workouts.find((x) => x.id === store.selectedId && x.name === name)
       || store.workouts.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (w) {
    w.name = name; w.cfg = cfg; w.updated = Date.now();
    flash(`Updated “${name}”.`);
  } else {
    w = { id: 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, cfg, updated: Date.now() };
    store.workouts.push(w);
    flash(`Saved “${name}”.`);
  }
  store.selectedId = w.id;
  persist();
  renderSaved();
});

// Browser pop-ups (confirm/alert) are blocked in some Android browsers such
// as DuckDuckGo, so destructive actions use a second tap instead.
let deleteArmed = 0;
function armDelete(on) {
  clearTimeout(deleteArmed);
  deleteArmed = 0;
  const b = $('deleteBtn');
  b.textContent = on ? 'Confirm?' : 'Delete';
  b.classList.toggle('danger', on);
  if (on) deleteArmed = setTimeout(() => armDelete(false), 3000);
}

$('deleteBtn').addEventListener('click', () => {
  const w = store.workouts.find((x) => x.id === store.selectedId);
  if (!w) return;
  if (!deleteArmed) { armDelete(true); return; }
  armDelete(false);
  store.workouts = store.workouts.filter((x) => x.id !== w.id);
  store.selectedId = '';
  persist();
  renderSaved();
  flash(`Deleted “${w.name}”.`);
});

/* Backup: export/import saved workouts as a JSON file. Useful because
 * browsers like DuckDuckGo can clear site data automatically. */
$('exportBtn').addEventListener('click', () => {
  if (!store.workouts.length) { flash('No saved workouts to export yet.'); return; }
  const data = JSON.stringify({ app: 'interval-timer', version: 1, workouts: store.workouts }, null, 2);
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `workouts-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  flash(`Exported ${store.workouts.length} workout(s).`);
});

$('importBtn').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data) ? data : data.workouts;
    if (!Array.isArray(list)) throw new Error('bad file');
    let added = 0, updated = 0;
    for (const w of list) {
      if (!w || typeof w.name !== 'string' || !w.cfg) continue;
      const cfg = { ...DEFAULT_CFG, ...w.cfg };
      const existing = store.workouts.find((x) => x.name.toLowerCase() === w.name.toLowerCase());
      if (existing) { existing.cfg = cfg; existing.updated = Date.now(); updated++; }
      else {
        store.workouts.push({ id: 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: w.name, cfg, updated: Date.now() });
        added++;
      }
    }
    persist();
    renderSaved();
    flash(`Imported: ${added} new, ${updated} updated.`);
  } catch (_) {
    flash('That file isn\u2019t a workout export.');
  }
});

// Ask the browser not to evict our storage (no prompt in most browsers).
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (_) {}

$('addLift').addEventListener('click', () => addRow(null));

for (const id of ['totalMin', 'totalSec', 'work', 'rest']) {
  $(id).addEventListener('input', onFormChange);
}
for (const id of ['totalMin', 'totalSec', 'work', 'rest']) {
  $(id).addEventListener('focus', (e) => e.target.select());
}

for (const b of document.querySelectorAll('.mode-btn')) {
  b.addEventListener('click', () => {
    if (b.dataset.mode === mode) return;
    store.current = readForm();      // keep the other list's text
    store.current.mode = b.dataset.mode;
    writeForm(store.current);
    persist();
    updateSummary();
  });
}

$('volume').value = store.volume;
$('volume').addEventListener('input', (e) => {
  store.volume = Number(e.target.value);
  if (master) master.gain.value = store.volume;
  persist();
});

$('testBtn').addEventListener('click', () => {
  if (!ensureAudio()) return;
  const t = ctx.currentTime + 0.05;
  playKind(master, t, 'tick');
  playKind(master, t + 1, 'tick');
  playKind(master, t + 2, 'go');
});

$('startBtn').addEventListener('click', () => startRun(readForm()));
$('pauseBtn').addEventListener('click', () => (run.paused ? resumeRun() : pauseRun()));
// Stop halts the timer and turns into "Reset". Resume carries on; Reset
// clears the run and goes back to the setup screen.
$('stopBtn').addEventListener('click', () => {
  if (!run.active) return;
  if (!run.stopped) {
    pauseRun();
    run.stopped = true;
    run.lastShown = null;
    releaseWake();
    $('stopBtn').textContent = 'Reset';
    $('stopBtn').classList.add('danger');
    render();
  } else {
    stopRun();
    show('setup');
  }
});
$('againBtn').addEventListener('click', () => { setPhaseClass(null); startRun(readForm()); });
$('backBtn').addEventListener('click', () => { setPhaseClass(null); show('setup'); });

/* ---------------------------- init ------------------------------------- */

writeForm(store.current);
renderSaved();
updateSummary();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
