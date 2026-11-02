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

const DEFAULT_CFG = {
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
      };
    }
  } catch (_) { /* storage unavailable or corrupt */ }
  return { current: { ...DEFAULT_CFG }, workouts: [], selectedId: '', volume: 0.8 };
}

let store = loadStore();

function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (_) { /* ignore */ }
}

/* ---------------------------- config ----------------------------------- */

function int(v, min, max, fallback) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function readForm() {
  return {
    totalMin: int($('totalMin').value, 0, 180, 0),
    totalSec: int($('totalSec').value, 0, 59, 0),
    work: int($('work').value, 1, 3600, 40),
    rest: int($('rest').value, 0, 3600, 0),
    lifts: $('lifts').value,
  };
}

function writeForm(cfg) {
  $('totalMin').value = cfg.totalMin;
  $('totalSec').value = cfg.totalSec;
  $('work').value = cfg.work;
  $('rest').value = cfg.rest;
  $('lifts').value = cfg.lifts;
}

function parseLifts(text) {
  return String(text || '').split('\n').map((s) => s.trim()).filter(Boolean);
}

/* Build the full timeline of segments for a config. Times are seconds from
 * pressing Start (lead-in included). */
function buildPlan(cfg) {
  const total = cfg.totalMin * 60 + cfg.totalSec;
  const lifts = parseLifts(cfg.lifts);
  const segs = [{ type: 'lead', start: 0, dur: LEAD_IN }];
  let t = LEAD_IN;
  let used = 0;
  let round = 0;

  while (used < total) {
    round++;
    const lift = lifts.length ? lifts[(round - 1) % lifts.length] : 'Work';
    const w = Math.min(cfg.work, total - used);
    segs.push({ type: 'work', start: t, dur: w, round, lift });
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
    ev.push({ t: end, kind: !nxt ? 'finish' : nxt.type === 'work' ? 'go' : 'rest' });
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
  if (plan.total <= 0) { alert('Set a total time greater than 0.'); return; }
  ensureAudio();
  run.plan = plan;
  run.events = buildEvents(plan);
  run.active = true;
  run.paused = false;
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
  run.startPerf = performance.now() - run.pausedAt * 1000;
  scheduleFrom(run.pausedAt);
  requestWake();
  $('pauseBtn').textContent = 'Pause';
  loop();
}

function stopRun() {
  run.active = false;
  run.paused = false;
  cancelScheduled();
  cancelAnimationFrame(run.raf);
  clearInterval(run.timer);
  releaseWake();
  setPhaseClass(null);
}

function finishRun() {
  const p = run.plan;
  stopRun();
  setPhaseClass('done');
  $('doneStats').textContent = `${plural(p.rounds, 'round')} · ${fmt(p.total)} total`;
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
  const key = seg.start + ':' + shown + ':' + run.paused;

  if (key !== run.lastShown) {
    run.lastShown = key;
    setPhaseClass(seg.type);
    const big = $('bigTime');
    big.textContent = shown >= 60 ? fmt(shown) : String(shown);
    if (shown <= WARN_SECS && !run.paused) {
      big.classList.remove('warn-tick'); void big.offsetWidth; big.classList.add('warn-tick');
    }

    if (seg.type === 'lead') {
      $('phaseLabel').textContent = run.paused ? 'PAUSED' : 'GET READY';
      $('liftLabel').textContent = seg.next || 'Work';
      $('subLabel').textContent = 'First up';
      $('roundLabel').textContent = plural(p.rounds, 'round');
    } else if (seg.type === 'work') {
      $('phaseLabel').textContent = run.paused ? 'PAUSED' : 'WORK';
      $('liftLabel').textContent = seg.lift;
      $('subLabel').textContent = seg.next && seg.round < p.rounds ? `Next: ${seg.next}` : 'Last one!';
      $('roundLabel').textContent = `Round ${seg.round} / ${p.rounds}`;
    } else {
      $('phaseLabel').textContent = run.paused ? 'PAUSED' : 'REST';
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
  const sorted = [...store.workouts].sort((a, b) => a.name.localeCompare(b.name));
  for (const w of sorted) {
    const o = document.createElement('option');
    o.value = w.id;
    const t = w.cfg.totalMin * 60 + w.cfg.totalSec;
    o.textContent = `${w.name} (${fmt(t)}, ${w.cfg.work}/${w.cfg.rest})`;
    sel.append(o);
  }
  if (!store.workouts.some((w) => w.id === store.selectedId)) store.selectedId = '';
  sel.value = store.selectedId;
  $('deleteBtn').disabled = !store.selectedId;
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

$('savedSelect').addEventListener('change', (e) => {
  store.selectedId = e.target.value;
  const w = store.workouts.find((x) => x.id === store.selectedId);
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

$('deleteBtn').addEventListener('click', () => {
  const w = store.workouts.find((x) => x.id === store.selectedId);
  if (!w || !confirm(`Delete “${w.name}”?`)) return;
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

for (const id of ['totalMin', 'totalSec', 'work', 'rest', 'lifts']) {
  $(id).addEventListener('input', onFormChange);
}
for (const id of ['totalMin', 'totalSec', 'work', 'rest']) {
  $(id).addEventListener('focus', (e) => e.target.select());
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
$('stopBtn').addEventListener('click', () => {
  const wasPaused = run.paused;
  if (!wasPaused) pauseRun();
  if (confirm('Stop this workout?')) { stopRun(); show('setup'); }
  else if (!wasPaused) resumeRun();
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
