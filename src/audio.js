// Generated SFX. Bake PCM, then BufferSource into SFX → master → compressor.
const SR = 44100;
const LOOP = ["engine", "boost", "space", "well", "warn", "rcs"];
const WOBBLE = { "ui-move": 0.03 };
const TAKES = {
  engine: 1,
  boost: 1,
  space: 1,
  well: 1,
  warn: 1,
  "engine-on": 3,
  "engine-off": 2,
  rcs: 1,
  sling: 2,
  "well-in": 2,
  "well-out": 2,
  "warn-beep": 1,
  crash: 3,
  count: 1,
  go: 1,
  gate: 1,
  finish: 1,
  "ui-move": 3,
  "ui-ok": 2,
  "ui-back": 1,
};

const pcm = {};
const lastTake = {};
const buffers = {};
let ready = false;
let live = null;
let sfxGain = null;
let masterGain = null;
const loopGain = {};
let volMaster = 1;
let volSfx = 1;
let wasBell = false;
let wasWell = false;
let wasWarn = false;
let rcsLev = 0;

function clamp01(v) {
  const n = Number(v);
  if (!(n >= 0)) return 0;
  if (n > 1) return 1;
  return n;
}

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function pickTake(n, last) {
  if (n <= 1) return 0;
  let i = last;
  while (i === last) i = (Math.random() * n) | 0;
  return i;
}

function sine(t, f) {
  return Math.sin(2 * Math.PI * f * t);
}

function white(rand) {
  return rand() * 2 - 1;
}

// Baked biquad. q is resonance; 0.7 is flat, 2–4 hums.
function lp(fc, q) {
  const w0 = (2 * Math.PI * fc) / SR;
  const alpha = Math.sin(w0) / (2 * Math.max(0.2, q));
  const cos = Math.cos(w0);
  const a0 = 1 + alpha;
  const b0 = ((1 - cos) / 2) / a0;
  const b1 = (1 - cos) / a0;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  return (x) => {
    const y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
}

function bp(fc, q) {
  const w0 = (2 * Math.PI * fc) / SR;
  const alpha = Math.sin(w0) / (2 * Math.max(0.2, q));
  const a0 = 1 + alpha;
  const b0 = alpha / a0;
  const a1 = (-2 * Math.cos(w0)) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  return (x) => {
    const y = b0 * x - b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
}

function shot(dur, fn) {
  const n = Math.max(1, (dur * SR) | 0);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / SR, i, n);
  return out;
}

function loopPcm(dur, fn) {
  const fade = 512;
  const n = Math.max(fade * 2, (dur * SR) | 0);
  const extra = n + fade;
  const tmp = new Float32Array(extra);
  for (let i = 0; i < extra; i++) tmp[i] = fn(i / SR, i);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    tmp[i] = tmp[i] * k + tmp[n + i] * (1 - k);
  }
  return tmp.subarray(0, n);
}

function cook(name, take) {
  const rand = rng(name.length * 997 + take * 7919 + 13);
  if (name === "engine") {
    const f = lp(190, 2.6);
    return loopPcm(2.2, (t) => f(white(rand)) * 0.55 + sine(t, 48) * 0.14 + sine(t, 96) * 0.05);
  }
  if (name === "boost") {
    const f = lp(420, 2.1);
    return loopPcm(1.8, (t) => f(white(rand)) * 0.42 + sine(t, 90) * 0.08 + sine(t, 180) * 0.04);
  }
  if (name === "space") {
    const f = lp(620, 1.1);
    return loopPcm(3, () => f(white(rand)) * 0.06);
  }
  if (name === "well") {
    const f = lp(62, 3.4);
    return loopPcm(3, () => f(white(rand)) * 0.9);
  }
  if (name === "warn") {
    return loopPcm(1, (t) => sine(t, 880) * 0.09 + sine(t, 1760) * 0.03);
  }
  if (name === "engine-on") {
    const f = lp(240, 2.2);
    return shot(0.14, (t) => (f(white(rand)) * 0.4 + sine(t, 70 + take * 8) * 0.22) * (1 - t / 0.14));
  }
  if (name === "engine-off") {
    const f = lp(160, 1.8);
    return shot(0.16, (t) => (f(white(rand)) * 0.32 + sine(t, 52) * 0.16) * Math.max(0, 1 - t / 0.16));
  }
  if (name === "rcs") {
    const f = bp(720, 2.4);
    return loopPcm(0.7, () => f(white(rand)) * 0.5);
  }
  if (name === "sling") {
    const f = lp(480, 1.8);
    return shot(0.38, (t) => {
      const whoosh = f(white(rand)) * Math.max(0, 1 - t / 0.22) * 0.45;
      return whoosh + sine(t, 620) * Math.max(0, 1 - t / 0.38) * 0.26;
    });
  }
  if (name === "well-in") {
    const f = lp(78, 3);
    return shot(0.22, (t) => (f(white(rand)) * 0.55 + sine(t, 38 + take * 3) * 0.22) * Math.max(0, 1 - t / 0.22));
  }
  if (name === "well-out") {
    const f = lp(210, 1.6);
    return shot(0.2, (t) => {
      const e = t / 0.2;
      return f(white(rand)) * 0.35 * (1 - e) + sine(t, 120) * 0.1 * e * (1 - e) * 4;
    });
  }
  if (name === "warn-beep") {
    return shot(0.11, (t) => sine(t, 1240) * Math.max(0, 1 - t / 0.11) * 0.32);
  }
  if (name === "crash") {
    const f = lp(88, 2.4);
    return shot(0.55, (t) => {
      const boom = sine(t, 42 + take * 4) * Math.max(0, 1 - t / 0.4) * 0.42;
      return f(white(rand)) * Math.max(0, 1 - t / 0.55) * 0.7 + boom;
    });
  }
  if (name === "count") {
    return shot(0.09, (t) => sine(t, 660) * Math.max(0, 1 - t / 0.09) * 0.34);
  }
  if (name === "go") {
    return shot(0.22, (t) => {
      const e = Math.max(0, 1 - t / 0.22);
      return (sine(t, 880) + sine(t, 1320) * 0.6) * e * 0.28;
    });
  }
  if (name === "gate") {
    return shot(0.14, (t) => {
      const e = Math.max(0, 1 - t / 0.14);
      return (sine(t, 740) * 0.7 + sine(t, 1110) * 0.4) * e * 0.3;
    });
  }
  if (name === "finish") {
    return shot(0.42, (t) => {
      const e = Math.max(0, 1 - t / 0.42);
      return (sine(t, 523) + sine(t, 784) * 0.7 + sine(t, 1046) * 0.4) * e * 0.26;
    });
  }
  if (name === "ui-move") {
    return shot(0.04, (t) => sine(t, 480 + take * 18) * Math.max(0, 1 - t / 0.04) * 0.22);
  }
  if (name === "ui-ok") {
    return shot(0.08, (t) => sine(t, 640 + take * 40) * Math.max(0, 1 - t / 0.08) * 0.26);
  }
  return shot(0.07, (t) => sine(t, 310) * Math.max(0, 1 - t / 0.07) * 0.24);
}

const JOBS = Object.keys(TAKES).flatMap((name) =>
  Array.from({ length: TAKES[name] }, (_, take) => ({ name, take }))
);

export function isReady() {
  return ready;
}

export function bake(onProgress) {
  return new Promise((resolve) => {
    let i = 0;
    function step() {
      if (i >= JOBS.length) {
        ready = true;
        onProgress?.(1);
        resolve();
        return;
      }
      const { name, take } = JOBS[i];
      if (!pcm[name]) pcm[name] = [];
      pcm[name][take] = cook(name, take);
      i += 1;
      onProgress?.(i / JOBS.length);
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(step);
      else step();
    }
    step();
  });
}

function applyVol() {
  if (!masterGain) return;
  masterGain.gain.value = volMaster;
  sfxGain.gain.value = volSfx;
}

export function setVolumes(master, sfx) {
  volMaster = clamp01(master);
  volSfx = clamp01(sfx);
  applyVol();
}

function toBuf(ctx, data) {
  const buf = ctx.createBuffer(1, data.length, SR);
  buf.getChannelData(0).set(data);
  return buf;
}

function ensureGraph() {
  if (live) return live;
  const AC = window.AudioContext || window.webkitAudioContext;
  live = new AC({ sampleRate: SR });
  sfxGain = live.createGain();
  masterGain = live.createGain();
  const comp = live.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  sfxGain.connect(masterGain);
  masterGain.connect(comp);
  comp.connect(live.destination);
  applyVol();
  for (const name of Object.keys(pcm)) {
    buffers[name] = pcm[name].map((d) => toBuf(live, d));
  }
  for (const name of LOOP) {
    const src = live.createBufferSource();
    src.buffer = buffers[name][0];
    src.loop = true;
    const g = live.createGain();
    g.gain.value = 0;
    src.connect(g);
    g.connect(sfxGain);
    src.start();
    loopGain[name] = g;
  }
  return live;
}

export function unlock() {
  if (!ready) return;
  const ctx = ensureGraph();
  if (ctx.state === "suspended") ctx.resume();
}

function startCue(name) {
  const pool = buffers[name];
  if (!pool?.length) return;
  const i = pickTake(pool.length, lastTake[name]);
  lastTake[name] = i;
  const src = live.createBufferSource();
  src.buffer = pool[i];
  const wob = WOBBLE[name];
  if (wob) src.playbackRate.value = 1 + (Math.random() * 2 - 1) * wob;
  src.connect(sfxGain);
  src.start();
  if (name === "crash") cutLoops();
}

export function play(name) {
  if (!ready) return;
  const ctx = ensureGraph();
  if (ctx.state === "suspended") {
    ctx.resume().then(() => startCue(name));
    return;
  }
  startCue(name);
}

function setLoop(name, v) {
  const g = loopGain[name];
  if (!g) return;
  g.gain.value = v;
}

function cutLoops() {
  for (const name of LOOP) setLoop(name, 0);
  wasBell = false;
  rcsLev = 0;
}

export function tick(state) {
  if (!ready || !live) return;
  if (!state.flying) {
    cutLoops();
    wasWell = false;
    wasWarn = false;
    return;
  }
  const burn = state.burn ? (state.boost ? 0.55 : 0.38) : 0;
  setLoop("engine", burn);
  setLoop("boost", state.boost ? 0.42 : 0);
  setLoop("space", 0.08 + 0.22 * Math.min(1, state.speed));
  setLoop("well", state.well * 0.55);
  setLoop("warn", state.warn ? 0.22 + 0.35 * state.warn : 0);
  const rcsWant = state.rcs ? 0.34 : 0;
  const rcsK = state.rcs ? 55 : 24;
  rcsLev += (rcsWant - rcsLev) * (1 - Math.exp(-rcsK * state.dt));
  if (!state.rcs && rcsLev < 0.002) rcsLev = 0;
  setLoop("rcs", rcsLev);

  if (state.burn && !wasBell) play("engine-on");
  if (!state.burn && wasBell) play("engine-off");
  wasBell = state.burn;

  const inWell = state.well > 0.02;
  if (inWell && !wasWell) play("well-in");
  if (!inWell && wasWell) play("well-out");
  wasWell = inWell;

  const inner = state.warn > 0;
  if (inner && !wasWarn) play("warn-beep");
  wasWarn = inner;
}

export function selfCheck() {
  function assert(cond, msg) {
    if (!cond) throw new Error(msg);
  }
  assert(clamp01(-1) === 0 && clamp01(2) === 1 && clamp01(0.4) === 0.4, "gain clamp");
  const seen = new Set();
  for (let n = 0; n < 20; n++) {
    const i = pickTake(3, 1);
    assert(i !== 1 && i >= 0 && i < 3, "pool skip");
    seen.add(i);
  }
  assert(seen.size === 2, "pool covers rest");
  assert(pickTake(1, 0) === 0, "single take");
  const f = lp(200, 3);
  f(1);
  let ring = 0;
  for (let i = 0; i < 240; i++) ring += Math.abs(f(0));
  assert(ring > 0.2, "lp rings");
}

if (typeof process !== "undefined" && process.argv[1]?.endsWith("audio.js")) {
  selfCheck();
}
