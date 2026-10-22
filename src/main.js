import * as THREE from "three";
import { alignArcade, createPass, engineArcade, ghostPath, KM, leanNose, selfCheck, slingMix, slingNose, step, wellPull } from "./physics.js";
import { createHud, fmtDist, fmtSpeed, selfCheck as hudCheck } from "./hud.js";
import { screenTilt, selfCheck as tiltCheck } from "./tilt.js";

selfCheck();
hudCheck();
tiltCheck();

const TURN = 2.2;
const MAX_SPIN = 2.2;
// Locked mouse: pixels this frame are turn rate, then they clear.
const MOUSE_TURN = 0.15;
// Yaw and roll start inverted. Pitch starts normal. Toggles on Settings.
const invert = { pitch: false, yaw: true, roll: true };
const inputPrefs = { overlays: "auto", gyro: false };
const STORE = "slingshotta-input";
function loadPrefs() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || "{}");
    if (typeof s.invert?.pitch === "boolean") invert.pitch = s.invert.pitch;
    if (typeof s.invert?.yaw === "boolean") invert.yaw = s.invert.yaw;
    if (typeof s.invert?.roll === "boolean") invert.roll = s.invert.roll;
    if (s.overlays === "on" || s.overlays === "off" || s.overlays === "auto") inputPrefs.overlays = s.overlays;
    if (typeof s.gyro === "boolean") inputPrefs.gyro = s.gyro;
  } catch {
    /* keep defaults */
  }
}
function savePrefs() {
  localStorage.setItem(STORE, JSON.stringify({ invert, overlays: inputPrefs.overlays, gyro: inputPrefs.gyro }));
}
loadPrefs();
// Graze lap ~12 s at cruise. Rocks stay unscaled so the belt is not moons.
const PLANET = 4;
// Gaps between worlds. Spawn stays by Vela so the first planet still reads huge.
const SPACE = 6;
// Wide of Vela, coasting +Z. Doing nothing misses. Steer in for the ring.
const SPAWN = { x: -140 * KM, y: 8 * KM, z: -420 * KM, vx: 0, vy: 0, vz: 12 * KM };
const WELL_SHOW = 2.2;
const GHOST_N = 14;
const GHOST_DT = 0.14;

function finishBody(p, inMul, outMul) {
  p.sweetIn = p.radius * inMul;
  p.sweetOut = p.radius * outMul;
  p.well = p.sweetOut;
}

const planets = [
  { id: "Vela", x: 0, y: 0, z: 0, radius: 12, gm: 1100, color: 0x3d8bfd },
  { id: "Kor", x: 340, y: 8, z: 140, radius: 8, gm: 520, color: 0xe0a15a },
  { id: "Mira", x: -120, y: 24, z: 380, radius: 16, gm: 1700, color: 0xc46b8a },
  { id: "Nox", x: 200, y: -60, z: -280, radius: 5, gm: 180, color: 0x2a8f8a },
  { id: "Rhea", x: -380, y: 50, z: 180, radius: 22, gm: 2400, color: 0xc9b48a },
];

for (const p of planets) {
  p.x *= KM * SPACE;
  p.y *= KM * SPACE;
  p.z *= KM * SPACE;
  p.radius *= KM * PLANET;
  p.gm *= KM * KM * KM * PLANET * PLANET;
  finishBody(p, 1.25, 2.05);
}

const moons = [];
function addMoon(id, parent, ox, oy, oz, radius, gm, color) {
  const m = {
    id,
    x: parent.x + ox * KM * PLANET,
    y: parent.y + oy * KM * PLANET,
    z: parent.z + oz * KM * PLANET,
    radius: radius * KM * PLANET,
    gm: gm * KM * KM * KM * PLANET * PLANET,
    color,
    moon: true,
  };
  finishBody(m, 1.3, 1.9);
  moons.push(m);
}
addMoon("Vela-1", planets[0], 22, 4, 8, 2.4, 36, 0xa8b8c8);
addMoon("Mira-1", planets[2], -26, 7, 5, 3.2, 70, 0xd9c4a0);
addMoon("Rhea-1", planets[4], 34, -5, 12, 4.1, 95, 0x8aa0b0);

const rocks = [];
function rockBlocked(x, y, z, radius) {
  if (Math.hypot(x - SPAWN.x, y - SPAWN.y) < 32 * KM && z < SPAWN.z + 90 * KM) return true;
  for (const p of planets) {
    if (Math.hypot(x - p.x, y - p.y, z - p.z) < p.radius * 2.5 + radius) return true;
  }
  return false;
}
function addRock(x, y, z, radius, i) {
  if (rockBlocked(x, y, z, radius)) return;
  const rock = {
    id: "rock" + rocks.length,
    x,
    y,
    z,
    radius,
    gm: 0.64 * Math.pow(radius / KM, 3) * KM * KM * KM,
    kind: i % 3,
    sx: 0.7 + ((i * 3) % 5) * 0.12,
    sy: 0.55 + ((i * 5) % 7) * 0.1,
    sz: 0.65 + ((i * 2) % 4) * 0.14,
    rx: i * 0.7,
    ry: i * 1.1,
    rz: i * 0.4,
  };
  finishBody(rock, 1.2, 1.7);
  rocks.push(rock);
}
for (let i = 0; i < 90; i++) {
  const a = (i / 90) * Math.PI * 2 + (i % 5) * 0.07;
  const rad = (170 + (((i * 17) % 11) - 5) * 4) * KM * SPACE;
  addRock(Math.cos(a) * rad, ((i % 7) - 3) * 2.2 * KM, Math.sin(a) * rad, (0.7 + (i % 5) * 0.2) * KM, i);
}
for (let a = 0; a < planets.length; a++) {
  for (let b = a + 1; b < planets.length; b++) {
    const pa = planets[a];
    const pb = planets[b];
    for (let k = 1; k <= 7; k++) {
      const t = k / 8;
      const j = a * 40 + b * 11 + k;
      addRock(
        pa.x + (pb.x - pa.x) * t + (((j * 13) % 17) - 8) * 6 * KM * SPACE,
        pa.y + (pb.y - pa.y) * t + (((j * 5) % 9) - 4) * 4 * KM * SPACE,
        pa.z + (pb.z - pa.z) * t + (((j * 7) % 15) - 7) * 6 * KM * SPACE,
        (0.8 + (k % 4) * 0.25) * KM,
        j
      );
    }
  }
}
for (let i = 0; i < 40; i++) {
  addRock(
    (((i * 37) % 61) - 30) * 14 * KM * SPACE,
    (((i * 11) % 13) - 6) * 8 * KM * SPACE,
    (((i * 19) % 59) - 29) * 14 * KM * SPACE,
    (0.9 + (i % 6) * 0.2) * KM,
    i + 200
  );
}
const bigRocks = [
  [90, -24, -170, 6.8],
  [-150, 28, 70, 5.4],
  [210, 16, 90, 7.2],
  [-40, -36, 220, 4.8],
  [60, 40, 310, 6.1],
  [-240, -12, -40, 5.6],
  [130, -50, -90, 8.0],
  [-90, 22, -200, 4.4],
];
bigRocks.forEach((r, i) => addRock(r[0] * KM * SPACE, r[1] * KM * SPACE, r[2] * KM * SPACE, r[3] * KM, i + 80));

const bodies = planets.concat(moons, rocks);
const radarBodies = planets.concat(moons);
const ship = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
const pass = createPass();
// Nose is local +Z. Arcade: velocity weathervanes onto it.
const orient = new THREE.Quaternion();
const spin = new THREE.Vector3();
const forward = new THREE.Vector3();
const up = new THREE.Vector3();
const axis = new THREE.Vector3();
const turn = new THREE.Quaternion();
const camShake = new THREE.Vector3();
const camQ = new THREE.Quaternion();
const camFwd = new THREE.Vector3();
const camUpDir = new THREE.Vector3();
const CAM_FOLLOW = 5;
// Worlds stay KM. Hull is drawn small. Cam stays on world metres so bodies dwarf it.
const SHIP = 0.28 * KM;
const WELL_PEEK = 4 * KM;
const WELL_OUT = 1.2 * KM;
// Hull pose is not the flight frame. Camera and the nose tick stay on orient.
const leanQ = new THREE.Quaternion();
const rollQ = new THREE.Quaternion();
const flipQ = new THREE.Quaternion();
const orientInv = new THREE.Quaternion();
const leanedNose = new THREE.Vector3();
const pull = new THREE.Vector3();
const localPull = new THREE.Vector3();
const shipRight = new THREE.Vector3(1, 0, 0);
const shipNose = new THREE.Vector3(0, 0, 1);
const BRAKE_FLIP = 1 / 0.12;
const TWO_PI = Math.PI * 2;
const LEAN_EASE = 4;
const ROLL_MAX = 0.61;
let flipAng = 0;
let leanDepth = 0;

// Always spin the same way. Brake rests at π (bell forward); release continues to 2π.
function remainingFlip(phase, braking) {
  const p = ((phase % TWO_PI) + TWO_PI) % TWO_PI;
  const want = braking ? Math.PI : 0;
  const d = Math.abs(p - want);
  if (d < 0.06 || d > TWO_PI - 0.06) return 0;
  return (want - p + TWO_PI) % TWO_PI;
}

{
  const e = 0.01;
  if (remainingFlip(0, false) > e) throw new Error("flip rest");
  if (Math.abs(remainingFlip(0, true) - Math.PI) > e) throw new Error("flip start");
  if (remainingFlip(Math.PI, true) > e) throw new Error("flip held");
  if (Math.abs(remainingFlip(Math.PI, false) - Math.PI) > e) throw new Error("flip continue");
}

const flight = { t: 0, dist: 0, vmax: 0, boosts: 0, warns: 0, inWarn: false, x: 0, y: 0, z: 0 };

function clearFlight() {
  flight.t = 0;
  flight.dist = 0;
  flight.vmax = 0;
  flight.boosts = 0;
  flight.warns = 0;
  flight.inWarn = false;
  flight.x = ship.x;
  flight.y = ship.y;
  flight.z = ship.z;
}

function reset() {
  ship.x = SPAWN.x;
  ship.y = SPAWN.y;
  ship.z = SPAWN.z;
  ship.vx = SPAWN.vx;
  ship.vy = SPAWN.vy;
  ship.vz = SPAWN.vz;
  orient.identity();
  camQ.copy(orient);
  spin.set(0, 0, 0);
  pass.boosted.clear();
  pass.prevRad.clear();
  flipAng = 0;
  leanDepth = 0;
  pull.set(0, 0, 0);
  clearFlight();
}

reset();

const keys = new Set();
let pointerDown = false;
let paused = false;
const mouse = { x: 0, y: 0 };
const menu = document.querySelector("#menu");
const crashEl = document.querySelector("#crash");
const crashStatsEl = document.querySelector("#crash-stats");
const splashEl = document.querySelector("#splash");
const padsEl = document.querySelector("#pads");
const padEngines = document.querySelector("#pad-engines");
const padAim = document.querySelector("#pad-aim");
const padMenuBtn = document.querySelector("#pad-menu");
const padLook = document.querySelector("#pad-look");
const padKnob = document.querySelector("#pad-knob");
const padHold = { thrust: false, brake: false, boost: false, rollL: false, rollR: false };
const lookStick = { x: 0, y: 0, id: null };
let gyroLive = false;
const gyroSample = { beta: null, gamma: null };
const gyroZero = { beta: null, gamma: null };
let crashMode = "play";
let splash = true;
let splashAng = 0;
let menuPage = "home";
let menuIx = 0;
const padHeld = { start: false, a: false, b: false, up: false, down: false, any: false };

function poseSplash() {
  ship.x = 80 * KM;
  ship.y = 48 * KM;
  ship.z = -260 * KM;
  ship.vx = 4 * KM;
  ship.vy = 0;
  ship.vz = 10 * KM;
  orient.identity();
  axis.set(1, 0, 0);
  turn.setFromAxisAngle(axis, -0.22);
  orient.multiply(turn);
}
poseSplash();

function invertLabel(axis) {
  return axis[0].toUpperCase() + axis.slice(1) + ": " + (invert[axis] ? "inverted" : "normal");
}

function needsGyroGrant() {
  return typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function";
}

function onOrient(e) {
  if (e.beta == null || e.gamma == null) return;
  gyroSample.beta = e.beta;
  gyroSample.gamma = e.gamma;
  if (gyroZero.beta == null) {
    gyroZero.beta = e.beta;
    gyroZero.gamma = e.gamma;
  }
}

function stopGyroListen() {
  gyroLive = false;
  gyroSample.beta = gyroSample.gamma = null;
  removeEventListener("deviceorientation", onOrient);
}

function startGyroListen() {
  if (gyroLive) return;
  gyroZero.beta = gyroZero.gamma = null;
  addEventListener("deviceorientation", onOrient);
  gyroLive = true;
}

async function toggleGyro() {
  if (inputPrefs.gyro && gyroLive) {
    inputPrefs.gyro = false;
    stopGyroListen();
    savePrefs();
    paintSettings();
    return;
  }
  if (needsGyroGrant()) {
    let perm = "denied";
    try {
      perm = await DeviceOrientationEvent.requestPermission();
    } catch {
      perm = "denied";
    }
    if (perm !== "granted") {
      inputPrefs.gyro = false;
      stopGyroListen();
      savePrefs();
      paintSettings();
      return;
    }
  }
  inputPrefs.gyro = true;
  startGyroListen();
  savePrefs();
  paintSettings();
}

function recenterGyro() {
  if (gyroSample.beta == null) return;
  gyroZero.beta = gyroSample.beta;
  gyroZero.gamma = gyroSample.gamma;
}

function gyroAxes() {
  if (!gyroLive || gyroSample.beta == null || gyroZero.beta == null) return { pitch: 0, yaw: 0 };
  const angle = screen.orientation?.angle ?? window.orientation ?? 0;
  const t = screenTilt(gyroSample.beta - gyroZero.beta, gyroSample.gamma - gyroZero.gamma, angle);
  const dead = 2;
  const full = 28;
  function axis(v) {
    if (Math.abs(v) < dead) return 0;
    return Math.max(-1, Math.min(1, v / full));
  }
  return { pitch: axis(t.pitch), yaw: axis(t.yaw) };
}

function coarsePointer() {
  return matchMedia("(pointer: coarse)").matches;
}

function overlaysWanted() {
  if (inputPrefs.overlays === "on") return true;
  if (inputPrefs.overlays === "off") return false;
  return coarsePointer() || "ontouchstart" in window;
}

function flying() {
  return !splash && !paused && crashMode === "play";
}

function clearPadHold() {
  padHold.thrust = padHold.brake = padHold.boost = padHold.rollL = padHold.rollR = false;
  lookStick.id = null;
  lookStick.x = lookStick.y = 0;
  padKnob.style.transform = "";
  for (const btn of padsEl.querySelectorAll("[data-hold]")) btn.classList.remove("on");
}

function syncPads() {
  const play = flying();
  const full = play && overlaysWanted();
  const menuOnly = play && coarsePointer() && !full;
  padsEl.hidden = !full && !menuOnly;
  padEngines.hidden = !full;
  padAim.hidden = !full;
}

function playHint() {
  if (overlaysWanted()) return "Touch pads to fly. White tick is the nose. Menu is top right.";
  return "Click to steer. White tick is the nose. Dashed cyan is where velocity goes. Enter or Esc: menu.";
}

function gyroLabel() {
  if (!inputPrefs.gyro) return "Gyro: off";
  if (gyroLive) return "Gyro: on";
  return "Gyro: on — tap to grant";
}

function paintSettings() {
  const page = document.querySelector("#menu-settings");
  for (const btn of page.querySelectorAll("[data-act=invert]")) {
    btn.textContent = invertLabel(btn.dataset.axis);
  }
  page.querySelector("[data-act=overlays]").textContent = "Touch overlays: " + inputPrefs.overlays;
  page.querySelector("[data-act=gyro]").textContent = gyroLabel();
}

function showMenuPage(name) {
  menuPage = name;
  for (const id of ["home", "how", "controls", "settings", "help"]) {
    document.querySelector("#menu-" + id).hidden = id !== name;
  }
  if (name === "settings") paintSettings();
  menuIx = 0;
  focusMenu();
}

function menuButtons() {
  return [...document.querySelector("#menu-" + menuPage).querySelectorAll("button")];
}

function uiButtons() {
  if (paused) return menuButtons();
  if (crashMode === "overlay") return [...crashEl.querySelectorAll("button")];
  return [];
}

function focusMenu() {
  const btns = uiButtons();
  if (!btns.length) return;
  menuIx = (menuIx + btns.length) % btns.length;
  for (let i = 0; i < btns.length; i++) btns[i].classList.toggle("on", i === menuIx);
}

function showCrashUi() {
  crashEl.hidden = false;
  menuIx = 0;
  focusMenu();
}

function runMenu(act) {
  if (act === "resume") setMenu(false);
  else if (act === "restart") {
    restartPlay();
    setMenu(false);
  } else if (act === "invert") {
    const btn = menuButtons()[menuIx];
    const axisName = btn?.dataset.axis;
    if (!axisName) return;
    invert[axisName] = !invert[axisName];
    btn.textContent = invertLabel(axisName);
    savePrefs();
  } else if (act === "overlays") {
    inputPrefs.overlays = inputPrefs.overlays === "auto" ? "on" : inputPrefs.overlays === "on" ? "off" : "auto";
    savePrefs();
    paintSettings();
    syncPads();
  } else if (act === "gyro") {
    toggleGyro();
  } else if (act === "recenter") {
    recenterGyro();
  } else if (act === "exit") enterSplash();
  else if (act === "back") showMenuPage("home");
  else showMenuPage(act);
}

function enterSplash() {
  restartPlay();
  poseSplash();
  splash = true;
  splashAng = 0;
  splashEl.hidden = false;
  setMenu(false);
}

function endSplash() {
  if (!splash) return;
  splash = false;
  splashEl.hidden = true;
  sawClick = true;
  reset();
  clearTrail();
  ghostLine.visible = false;
  syncPads();
}

function rcsLabel() {
  const ax = Math.abs(spin.x);
  const ay = Math.abs(spin.y);
  const az = Math.abs(spin.z);
  if (ax < 0.18 && ay < 0.18 && az < 0.18) return "";
  if (ax >= ay && ax >= az) return "RCS PITCH";
  if (ay >= az) return "RCS YAW";
  return "RCS ROLL";
}

function padEdge(name, now) {
  const fire = now && !padHeld[name];
  padHeld[name] = now;
  return fire;
}

function pollUi() {
  const pads = navigator.getGamepads?.() ?? [];
  let start = false;
  let a = false;
  let b = false;
  let up = false;
  let down = false;
  let any = false;
  for (const pad of pads) {
    if (!pad) continue;
    if (pad.buttons.some((btn) => btn.pressed || btn.value > 0.25)) any = true;
    if (pad.buttons[9]?.pressed || pad.buttons[8]?.pressed) start = true;
    if (pad.buttons[0]?.pressed) a = true;
    if (pad.buttons[1]?.pressed) b = true;
    if (pad.buttons[12]?.pressed || (pad.axes[1] ?? 0) < -0.55) up = true;
    if (pad.buttons[13]?.pressed || (pad.axes[1] ?? 0) > 0.55) down = true;
  }
  const startHit = padEdge("start", start);
  const aHit = padEdge("a", a);
  const bHit = padEdge("b", b);
  const upHit = padEdge("up", up);
  const downHit = padEdge("down", down);
  const anyHit = padEdge("any", any);
  if (splash) {
    if (anyHit) endSplash();
    return;
  }
  if (paused) {
    if (startHit) {
      setMenu(false);
      return;
    }
  } else if (crashMode === "burst") {
    return;
  } else if (crashMode === "overlay") {
    if (startHit) {
      setMenu(true);
      return;
    }
  } else if (startHit) {
    setMenu(true);
    return;
  } else {
    return;
  }
  if (upHit) {
    menuIx -= 1;
    focusMenu();
  }
  if (downHit) {
    menuIx += 1;
    focusMenu();
  }
  if (aHit) {
    const act = uiButtons()[menuIx]?.dataset.act;
    if (act) {
      if (paused) runMenu(act);
      else if (act === "restart") restartPlay();
      else if (act === "menu") setMenu(true);
    }
  }
  if (bHit && paused) {
    if (menuPage !== "home") showMenuPage("home");
    else setMenu(false);
  }
}

function setMenu(open) {
  paused = open;
  menu.hidden = !open;
  keys.clear();
  mouse.x = 0;
  mouse.y = 0;
  pointerDown = false;
  if (open) {
    showMenuPage("home");
    document.exitPointerLock?.();
    ghostLine.visible = false;
    if (crashMode !== "play") crashEl.hidden = true;
  } else if (crashMode === "overlay") {
    showCrashUi();
  }
  clearPadHold();
  syncPads();
}

addEventListener("keydown", (e) => {
  if (splash) {
    e.preventDefault();
    if (!e.repeat) endSplash();
    return;
  }
  if (e.code === "Enter" || e.code === "Escape") {
    e.preventDefault();
    if (!e.repeat) {
      if (paused) setMenu(false);
      else if (crashMode !== "play") restartPlay();
      else setMenu(true);
    }
    return;
  }
  if (paused || crashMode !== "play") return;
  keys.add(e.code);
  if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("pointerdown", (e) => {
  if (e.target.closest("#pads, #menu, #crash, #splash")) return;
  if (overlaysWanted()) return;
  if (!paused && crashMode === "play") pointerDown = true;
});
addEventListener("pointerup", () => {
  pointerDown = false;
});
addEventListener("pointermove", (e) => {
  const locked = document.pointerLockElement != null;
  if (!locked && !pointerDown) return;
  mouse.x += e.movementX;
  mouse.y += e.movementY;
});

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "low-power" });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x1a0830);
document.body.prepend(renderer.domElement);
renderer.domElement.id = "view";
renderer.domElement.addEventListener("click", () => {
  if (splash) {
    endSplash();
    return;
  }
  sawClick = true;
  if (paused || crashMode !== "play") return;
  if (coarsePointer() || overlaysWanted()) return;
  renderer.domElement.requestPointerLock();
});
menu.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  const act = btn?.dataset.act;
  if (!act) return;
  const btns = menuButtons();
  const ix = btns.indexOf(btn);
  if (ix >= 0) menuIx = ix;
  runMenu(act);
});

function setLook(x, y) {
  lookStick.x = x;
  lookStick.y = y;
  const reach = padLook.clientWidth * 0.5 - 18;
  padKnob.style.transform = "translate(" + x * reach + "px, " + y * reach + "px)";
}

function lookFromEvent(e) {
  const box = padLook.getBoundingClientRect();
  const cx = box.left + box.width * 0.5;
  const cy = box.top + box.height * 0.5;
  const r = Math.max(1, box.width * 0.5);
  const nx = (e.clientX - cx) / r;
  const ny = (e.clientY - cy) / r;
  const mag = Math.hypot(nx, ny) || 1;
  const k = mag > 1 ? 1 / mag : 1;
  setLook(nx * k, ny * k);
}

padLook.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  e.stopPropagation();
  padLook.setPointerCapture(e.pointerId);
  lookStick.id = e.pointerId;
  lookFromEvent(e);
});
padLook.addEventListener("pointermove", (e) => {
  if (lookStick.id !== e.pointerId) return;
  lookFromEvent(e);
});
function endLook(e) {
  if (lookStick.id !== e.pointerId) return;
  lookStick.id = null;
  setLook(0, 0);
}
padLook.addEventListener("pointerup", endLook);
padLook.addEventListener("pointercancel", endLook);

padsEl.addEventListener("pointerdown", (e) => {
  const btn = e.target.closest("[data-hold]");
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  btn.setPointerCapture(e.pointerId);
  padHold[btn.dataset.hold] = true;
  btn.classList.add("on");
});
function endHold(e) {
  const btn = e.target.closest("[data-hold]");
  if (!btn) return;
  padHold[btn.dataset.hold] = false;
  btn.classList.remove("on");
}
padsEl.addEventListener("pointerup", endHold);
padsEl.addEventListener("pointercancel", endHold);
padsEl.addEventListener("contextmenu", (e) => e.preventDefault());
padMenuBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  setMenu(true);
});

if (inputPrefs.gyro && !needsGyroGrant()) startGyroListen();
syncPads();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1 * KM, 12000 * KM);
scene.add(new THREE.AmbientLight(0xc4d2e4, 0.42));
scene.add(new THREE.HemisphereLight(0x9ec0ea, 0x1a1218, 0.4));
// Sky sun lives on the dome. Light only; no body in the system.
const sunDir = new THREE.DirectionalLight(0xffd4a8, 1.15);
sunDir.position.set(0.45, 0.55, 0.7);
scene.add(sunDir);
// Arcade fill: lights the side the camera sees, dies before it washes the planets.
const fill = new THREE.PointLight(0xd8e8ff, 3.2, 20 * KM);
scene.add(fill);

const SKY_R = 8000 * KM;

function skyMap() {
  const w = 2048;
  const h = 1024;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#07080e";
  ctx.fillRect(0, 0, w, h);
  function blob(x, y, r, color) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Squashed radial, so a cloud reads as a streak instead of a ball.
  function wisp(x, y, rx, ry, rot, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(1, ry / rx);
    blob(0, 0, rx, color);
    ctx.restore();
  }
  ctx.globalCompositeOperation = "lighter";
  blob(180, 160, 260, "rgba(210,40,150,0.42)");
  blob(1680, 140, 300, "rgba(255,120,40,0.34)");
  blob(1860, 780, 240, "rgba(90,50,220,0.4)");
  blob(240, 860, 220, "rgba(20,180,200,0.32)");
  blob(1100, 920, 280, "rgba(160,30,80,0.3)");
  blob(1280, 360, 200, "rgba(40,90,200,0.28)");
  // Spawn looks +Z, about u=0.25 on a Three sphere. Sun sits there.
  blob(512, 310, 70, "rgba(255,250,210,1)");
  blob(512, 310, 150, "rgba(255,170,50,0.7)");
  blob(512, 310, 260, "rgba(255,90,40,0.22)");
  wisp(620, 180, 180, 48, 0.4, "rgba(220,60,160,0.16)");
  wisp(980, 240, 220, 40, -0.5, "rgba(40,200,210,0.14)");
  wisp(1500, 520, 200, 36, 0.8, "rgba(255,150,50,0.13)");
  wisp(400, 640, 160, 32, -0.3, "rgba(140,80,255,0.15)");
  wisp(800, 720, 240, 44, 0.2, "rgba(40,160,200,0.12)");
  wisp(1320, 760, 190, 38, 1.1, "rgba(200,40,120,0.14)");
  wisp(1700, 300, 170, 30, -0.9, "rgba(255,180,80,0.12)");
  wisp(260, 420, 150, 28, 0.6, "rgba(80,80,220,0.13)");
  wisp(1040, 120, 160, 26, 0.15, "rgba(40,210,160,0.1)");
  wisp(560, 880, 200, 34, -0.7, "rgba(180,60,200,0.12)");
  wisp(1480, 160, 140, 24, 1.4, "rgba(20,180,220,0.11)");
  wisp(720, 480, 130, 22, -1.2, "rgba(255,100,60,0.1)");
  ctx.globalCompositeOperation = "source-over";
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(SKY_R, 48, 32),
  new THREE.MeshBasicMaterial({ map: skyMap(), side: THREE.BackSide, depthWrite: false })
);
sky.frustumCulled = false;
scene.add(sky);

const starPos = new Float32Array(900 * 3);
const starCol = new Float32Array(900 * 3);
for (let i = 0; i < 900; i++) {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  const r = SKY_R * 0.96;
  starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
  starPos[i * 3 + 1] = r * Math.cos(phi);
  starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  const tint = Math.random();
  starCol[i * 3] = tint > 0.85 ? 1 : tint > 0.7 ? 0.6 : 1;
  starCol[i * 3 + 1] = tint > 0.85 ? 0.7 : tint > 0.7 ? 0.9 : 1;
  starCol[i * 3 + 2] = tint > 0.85 ? 0.45 : tint > 0.7 ? 1 : 0.92;
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
starGeo.setAttribute("color", new THREE.BufferAttribute(starCol, 3));
sky.add(
  new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({
      vertexColors: true,
      size: 1.6,
      sizeAttenuation: false,
      depthWrite: false,
    })
  )
);

function hitchSky() {
  sky.position.copy(camera.position);
  fill.position.copy(camera.position);
}

function planetMap(hex) {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 32;
  const ctx = c.getContext("2d");
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  ctx.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
  ctx.fillRect(0, 0, 64, 32);
  for (let i = 0; i < 420; i++) {
    const n = (Math.random() - 0.35) * 48;
    const rr = Math.max(0, Math.min(255, r + n));
    const gg = Math.max(0, Math.min(255, g + n));
    const bb = Math.max(0, Math.min(255, b + n * 0.7));
    ctx.fillStyle = "rgba(" + (rr | 0) + "," + (gg | 0) + "," + (bb | 0) + ",0.55)";
    ctx.fillRect(Math.random() * 64, Math.random() * 32, 1 + Math.random() * 7, 1 + Math.random() * 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

for (const p of planets) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(p.radius, 36, 24),
    new THREE.MeshPhongMaterial({
      map: planetMap(p.color),
      color: 0xffffff,
      shininess: 8,
      specular: 0x222222,
    })
  );
  mesh.position.set(p.x, p.y, p.z);
  scene.add(mesh);
  if (p.id === "Rhea") {
    // Flat annuli. A torus tube reads as a donut.
    const rings = new THREE.Group();
    const bands = [
      [1.28, 1.36, 0xc4b49a, 0.35],
      [1.42, 1.72, 0xe6d2a8, 0.55],
      [1.78, 1.86, 0x8f9bb5, 0.28],
      [1.94, 2.18, 0xd7c4b0, 0.42],
      [2.24, 2.32, 0xf0e6d4, 0.22],
    ];
    for (const [inner, outer, color, opacity] of bands) {
      rings.add(
        new THREE.Mesh(
          new THREE.RingGeometry(p.radius * inner, p.radius * outer, 80),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
        )
      );
    }
    rings.rotation.x = Math.PI / 2.4;
    rings.position.copy(mesh.position);
    scene.add(rings);
  }
}

for (const m of moons) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(m.radius, 24, 16),
    new THREE.MeshPhongMaterial({ map: planetMap(m.color), color: 0xffffff, shininess: 6 })
  );
  mesh.position.set(m.x, m.y, m.z);
  scene.add(mesh);
}

const wellMat = new THREE.LineBasicMaterial({
  color: 0x7ecbff,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
});
const bandMat = new THREE.LineBasicMaterial({
  color: 0xffb15a,
  transparent: true,
  opacity: 0.72,
  depthWrite: false,
});

function ringPts(radius, y, segs) {
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius));
  }
  return pts;
}

function meridianPts(radius, segs) {
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pts.push(new THREE.Vector3(0, Math.cos(a) * radius, Math.sin(a) * radius));
  }
  return pts;
}

function makeWellMark() {
  const g = new THREE.Group();
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts(1, 0, 48)), wellMat));
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts(0.86, 0.5, 36)), wellMat));
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts(0.86, -0.5, 36)), wellMat));
  const mer = new THREE.Line(new THREE.BufferGeometry().setFromPoints(meridianPts(1, 40)), wellMat);
  const mer2 = mer.clone();
  mer2.rotation.y = Math.PI / 2;
  g.add(mer, mer2);
  const band = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts(1, 0, 40)), bandMat);
  band.name = "band";
  g.add(band);
  g.visible = false;
  scene.add(g);
  return g;
}

const wellPool = Array.from({ length: 12 }, makeWellMark);
const wellNear = [];

const rockGeos = [
  new THREE.IcosahedronGeometry(1, 0),
  new THREE.DodecahedronGeometry(1, 0),
  new THREE.OctahedronGeometry(1, 0),
];
const rockMat = new THREE.MeshPhongMaterial({ color: 0x8a8178, shininess: 4, flatShading: true });
const dummy = new THREE.Object3D();
for (let kind = 0; kind < 3; kind++) {
  const batch = rocks.filter((r) => r.kind === kind);
  if (!batch.length) continue;
  const mesh = new THREE.InstancedMesh(rockGeos[kind], rockMat, batch.length);
  batch.forEach((rock, i) => {
    dummy.position.set(rock.x, rock.y, rock.z);
    dummy.rotation.set(rock.rx, rock.ry, rock.rz);
    dummy.scale.set(rock.radius * rock.sx, rock.radius * rock.sy, rock.radius * rock.sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  scene.add(mesh);
}

// Slingshot Racer. Domed heat shield nose, two green pressure vessels, service section, big bell,
// and a truss holding 8 thruster pods (the RCS). Local +Z is the nose.
const craft = new THREE.Group();
const hullMat = new THREE.MeshLambertMaterial({ color: 0x4a6b45, emissive: 0x162414, emissiveIntensity: 0.35 });
const darkMat = new THREE.MeshLambertMaterial({ color: 0x2a2e33, emissive: 0x0a0c10, emissiveIntensity: 0.2 });
const whiteMat = new THREE.MeshLambertMaterial({ color: 0xe6e1d3, emissive: 0x2a2824, emissiveIntensity: 0.22 });
const copperMat = new THREE.MeshLambertMaterial({ color: 0xa8643a, emissive: 0x2a1208, emissiveIntensity: 0.2 });
const dishMat = new THREE.MeshLambertMaterial({ color: 0xb8b4aa, emissive: 0x222018, emissiveIntensity: 0.22, side: THREE.DoubleSide });
const metalMat = new THREE.MeshLambertMaterial({ color: 0x55575c, emissive: 0x12141a, emissiveIntensity: 0.25, side: THREE.DoubleSide });
const strutMat = new THREE.MeshLambertMaterial({ color: 0x48577a, emissive: 0x10141c, emissiveIntensity: 0.25 });
const podMat = new THREE.MeshLambertMaterial({ color: 0xc8b07a, emissive: 0x2a2010, emissiveIntensity: 0.2 });

// Cylinders and cones grow along +Y; this lays one along Z at z.
function alongZ(mesh, z) {
  mesh.rotation.x = Math.PI / 2;
  mesh.position.z = z;
  craft.add(mesh);
  return mesh;
}
// Convex heat shield: a cap cut from a sphere of radius 1.49 (rim radius 0.78,
// dome depth 0.22). The sphere center sits back so the rim lands at z 1.35.
alongZ(new THREE.Mesh(new THREE.SphereGeometry(1.49, 16, 4, 0, Math.PI * 2, 0, 0.55), dishMat), 0.08);
const orbital = new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 8), hullMat);
orbital.position.z = 0.95;
alongZ(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 10), darkMat), 0.48);
const vessel = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), hullMat);
vessel.scale.z = 1.3;
vessel.position.z = -0.05;
craft.add(orbital, vessel);
alongZ(new THREE.Mesh(new THREE.CylinderGeometry(0.51, 0.51, 0.12, 12), whiteMat), 0);
alongZ(new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.12, 12), whiteMat), -0.25);
alongZ(new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.6, 10), darkMat), -0.8);
alongZ(new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.08, 10), copperMat), -0.6);
// Bell: narrow end forward (+Y top maps to +Z).
alongZ(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.52, 0.75, 14, 1, true), metalMat), -1.45);

const yAxis = new THREE.Vector3(0, 1, 0);
const strutGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 5);
const strutDir = new THREE.Vector3();
function strut(a, b) {
  const m = new THREE.Mesh(strutGeo, strutMat);
  strutDir.subVectors(b, a);
  m.scale.y = strutDir.length();
  m.position.addVectors(a, b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(yAxis, strutDir.normalize());
  craft.add(m);
}

// Cold gas. Exhaust leaves the pod; thrust pushes the other way.
// Wide end is +Y. Small end sits on the pod, gas flares out.
const rcsGeo = new THREE.SphereGeometry(0.09, 8, 6);
const rcsMat = new THREE.MeshBasicMaterial({
  color: 0x7eb4d8,
  transparent: true,
  opacity: 0.22,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const rcsHaloMat = new THREE.MeshBasicMaterial({
  color: 0x4a88b8,
  transparent: true,
  opacity: 0.09,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const rcsJets = [];
const rcsThrust = new THREE.Vector3();
function rcsJet(pod, dx, dy) {
  const jet = new THREE.Mesh(rcsGeo, rcsMat);
  const out = new THREE.Vector3(dx, dy, 0);
  jet.position.copy(pod).addScaledVector(out, 0.4);
  jet.quaternion.setFromUnitVectors(yAxis, out);
  jet.scale.set(1.05, 1.9, 1.05);
  const halo = new THREE.Mesh(rcsGeo, rcsHaloMat);
  halo.scale.set(1.65, 1.25, 1.65);
  jet.add(halo);
  // Torque this jet puts on the ship: pod x thrust. Fires when it agrees with spin.
  rcsThrust.copy(out).negate();
  jet.userData.torque = new THREE.Vector3().crossVectors(pod, rcsThrust).normalize();
  jet.visible = false;
  craft.add(jet);
  rcsJets.push(jet);
}

const podGeo = new THREE.BoxGeometry(0.22, 0.22, 0.26);
for (const sx of [-1, 1]) {
  for (const sy of [-1, 1]) {
    const front = new THREE.Vector3(sx * 0.8, sy * 0.8, 0.95);
    const rear = new THREE.Vector3(sx * 0.8, sy * 0.8, -1.15);
    for (const p of [front, rear]) {
      const pod = new THREE.Mesh(podGeo, podMat);
      pod.position.copy(p);
      craft.add(pod);
      rcsJet(p, sx, 0);
      rcsJet(p, 0, sy);
    }
    strut(front, new THREE.Vector3(sx * 0.3, sy * 0.3, 0.95));
    strut(front, new THREE.Vector3(sx * 0.3, sy * 0.3, 0.3));
    strut(rear, new THREE.Vector3(sx * 0.25, sy * 0.25, -0.9));
    strut(rear, new THREE.Vector3(sx * 0.3, sy * 0.3, -0.4));
    strut(front, rear);
  }
}
const RCS_DZ = 0.18;

const plume = new THREE.Group();
plume.rotation.x = -Math.PI / 2;
plume.position.z = -2.4;
function addPlume(r0, r1, h, color, opacity) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(r0, r1, h, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  plume.add(m);
}
addPlume(0.03, 0.08, 1.9, 0xeef8ff, 0.85);
addPlume(0.1, 0.22, 1.7, 0x6ad0ff, 0.4);
addPlume(0.2, 0.42, 1.45, 0x2a6cff, 0.18);
const noseRingPts = [];
for (let i = 0; i <= 20; i++) {
  const a = (i / 20) * Math.PI * 2;
  noseRingPts.push(new THREE.Vector3(Math.cos(a) * 0.28, Math.sin(a) * 0.28, 3.15));
}
const noseNeedle = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints(noseRingPts),
  new THREE.LineBasicMaterial({ color: 0xf4f7fb })
);
craft.add(plume);
craft.scale.setScalar(SHIP);
scene.add(craft);
// Heading tick stays on the flight frame when the hull flips or leans.
noseNeedle.scale.setScalar(SHIP);
scene.add(noseNeedle);

const ghostPos = new Float32Array(GHOST_N * 3);
const ghostGeo = new THREE.BufferGeometry();
ghostGeo.setAttribute("position", new THREE.BufferAttribute(ghostPos, 3));
const ghostLine = new THREE.Line(
  ghostGeo,
  new THREE.LineDashedMaterial({
    color: 0x7ecbff,
    dashSize: 1.1 * KM,
    gapSize: 0.7 * KM,
    transparent: true,
    opacity: 0.9,
  })
);
ghostLine.frustumCulled = false;
ghostLine.visible = false;
scene.add(ghostLine);

const TRAIL_N = 80;
const TRAIL_STEP = 0.8 * SHIP;
const trailPos = new Float32Array(TRAIL_N * 3);
const trailCol = new Float32Array(TRAIL_N * 3);
for (let i = 0; i < TRAIL_N; i++) {
  const t = 0.2 + 0.8 * (i / (TRAIL_N - 1));
  trailCol[i * 3] = 0.49 * t;
  trailCol[i * 3 + 1] = 0.8 * t;
  trailCol[i * 3 + 2] = t;
}
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
trailGeo.setAttribute("color", new THREE.BufferAttribute(trailCol, 3));
trailGeo.setDrawRange(0, 1);
const trailLine = new THREE.Line(
  trailGeo,
  new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55 })
);
trailLine.frustumCulled = false;
scene.add(trailLine);
const lastTrail = new THREE.Vector3();
let trailCount = 1;

function clearTrail() {
  for (let i = 0; i < TRAIL_N; i++) {
    trailPos[i * 3] = ship.x;
    trailPos[i * 3 + 1] = ship.y;
    trailPos[i * 3 + 2] = ship.z;
  }
  trailCount = 1;
  lastTrail.set(ship.x, ship.y, ship.z);
  trailGeo.setDrawRange(0, 1);
  trailGeo.attributes.position.needsUpdate = true;
}

function sampleTrail() {
  const dx = ship.x - lastTrail.x;
  const dy = ship.y - lastTrail.y;
  const dz = ship.z - lastTrail.z;
  if (Math.hypot(dx, dy, dz) < TRAIL_STEP) return;
  lastTrail.set(ship.x, ship.y, ship.z);
  if (trailCount < TRAIL_N) {
    const i = trailCount++;
    trailPos[i * 3] = ship.x;
    trailPos[i * 3 + 1] = ship.y;
    trailPos[i * 3 + 2] = ship.z;
  } else {
    trailPos.copyWithin(0, 3);
    trailPos[(TRAIL_N - 1) * 3] = ship.x;
    trailPos[(TRAIL_N - 1) * 3 + 1] = ship.y;
    trailPos[(TRAIL_N - 1) * 3 + 2] = ship.z;
  }
  trailGeo.setDrawRange(0, trailCount);
  trailGeo.attributes.position.needsUpdate = true;
}

clearTrail();

const CRASH_BURST = 1;
let crashT = 0;
const debris = [];
const debrisGeo = new THREE.BoxGeometry(0.22, 0.16, 0.4);
const fireMat = new THREE.MeshBasicMaterial({
  color: 0xff7a22,
  transparent: true,
  opacity: 0.95,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const fireball = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), fireMat);
fireball.visible = false;
scene.add(fireball);

function clearDebris() {
  for (const bit of debris) scene.remove(bit.mesh);
  debris.length = 0;
  fireball.visible = false;
}

function fmtTime(s) {
  if (s < 60) return s.toFixed(1) + " s";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m + ":" + String(sec).padStart(2, "0");
}

function noteFlight(dt, hit, nearest, nearestD) {
  const speed = Math.hypot(ship.vx, ship.vy, ship.vz);
  flight.t += dt;
  flight.dist += Math.hypot(ship.x - flight.x, ship.y - flight.y, ship.z - flight.z);
  flight.x = ship.x;
  flight.y = ship.y;
  flight.z = ship.z;
  if (speed > flight.vmax) flight.vmax = speed;
  if (hit.event === "boost") flight.boosts += 1;
  const warn = nearestD < nearest.sweetIn;
  if (warn && !flight.inWarn) flight.warns += 1;
  flight.inWarn = warn;
}

function paintCrashStats() {
  crashStatsEl.innerHTML =
    "<li>Flight time <span>" +
    fmtTime(flight.t) +
    "</span></li>" +
    "<li>Top speed <span>" +
    fmtSpeed(flight.vmax) +
    "</span></li>" +
    "<li>Gravity boosts <span>" +
    flight.boosts +
    "</span></li>" +
    "<li>Near warnings <span>" +
    flight.warns +
    "</span></li>" +
    "<li>Distance <span>" +
    fmtDist(flight.dist) +
    "</span></li>";
}

function beginCrash(bodyId) {
  paintCrashStats();
  crashMode = "burst";
  crashT = 0;
  craft.visible = false;
  noseNeedle.visible = false;
  ghostLine.visible = false;
  document.exitPointerLock?.();
  keys.clear();
  mouse.x = 0;
  mouse.y = 0;
  pointerDown = false;
  clearPadHold();
  syncPads();
  clearDebris();
  // Buried inside the mesh. Project onto the skin so bits don't spawn in the rock.
  const body = bodies.find((b) => b.id === bodyId);
  let nx = 0;
  let ny = 1;
  let nz = 0;
  let wx = craft.position.x;
  let wy = craft.position.y;
  let wz = craft.position.z;
  if (body) {
    nx = ship.x - body.x;
    ny = ship.y - body.y;
    nz = ship.z - body.z;
    const r = Math.hypot(nx, ny, nz) || 1;
    nx /= r;
    ny /= r;
    nz /= r;
    const skin = body.radius + 0.4 * KM;
    wx = body.x + nx * skin;
    wy = body.y + ny * skin;
    wz = body.z + nz * skin;
  }
  const vrad = ship.vx * nx + ship.vy * ny + ship.vz * nz;
  const tx = ship.vx - vrad * nx;
  const ty = ship.vy - vrad * ny;
  const tz = ship.vz - vrad * nz;
  fireball.userData.ox = wx;
  fireball.userData.oy = wy;
  fireball.userData.oz = wz;
  fireball.userData.nx = nx;
  fireball.userData.ny = ny;
  fireball.userData.nz = nz;
  const fireR = 0.6 * KM;
  fireball.position.set(wx + nx * fireR, wy + ny * fireR, wz + nz * fireR);
  fireball.scale.setScalar(fireR);
  fireMat.opacity = 0.95;
  fireball.visible = true;
  for (let i = 0; i < 8; i++) {
    const mesh = new THREE.Mesh(debrisGeo, hullMat);
    mesh.position.set(wx, wy, wz);
    mesh.scale.setScalar(SHIP * (0.7 + Math.random() * 0.6));
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    let rx = Math.random() - 0.5;
    let ry = Math.random() - 0.5;
    let rz = Math.random() - 0.5;
    if (rx * nx + ry * ny + rz * nz < 0) {
      rx = -rx;
      ry = -ry;
      rz = -rz;
    }
    // Drop most of the impact speed or the bits leave the frame in a blink.
    const skim = 0.08;
    const kick = (2.2 + Math.random() * 1.6) * KM;
    const spread = (0.7 + Math.random() * 1.1) * KM;
    debris.push({
      mesh,
      vx: tx * skim + nx * kick + rx * spread,
      vy: ty * skim + ny * kick + ry * spread,
      vz: tz * skim + nz * kick + rz * spread,
      sx: (Math.random() - 0.5) * 6,
      sy: (Math.random() - 0.5) * 6,
      sz: (Math.random() - 0.5) * 6,
    });
    scene.add(mesh);
  }
}

function stepDebris(dt) {
  for (const bit of debris) {
    bit.mesh.position.x += bit.vx * dt;
    bit.mesh.position.y += bit.vy * dt;
    bit.mesh.position.z += bit.vz * dt;
    bit.mesh.rotation.x += bit.sx * dt;
    bit.mesh.rotation.y += bit.sy * dt;
    bit.mesh.rotation.z += bit.sz * dt;
  }
  if (!fireball.visible) return;
  const t = Math.min(1, crashT / CRASH_BURST);
  const fireR = (0.6 + t * 3.4) * KM;
  fireball.scale.setScalar(fireR);
  fireball.position.set(
    fireball.userData.ox + fireball.userData.nx * fireR,
    fireball.userData.oy + fireball.userData.ny * fireR,
    fireball.userData.oz + fireball.userData.nz * fireR
  );
  fireMat.opacity = 0.95 * (1 - t);
  if (t >= 1) fireball.visible = false;
}

function restartPlay() {
  reset();
  crashMode = "play";
  crashT = 0;
  crashEl.hidden = true;
  craft.visible = true;
  noseNeedle.visible = true;
  clearDebris();
  clearTrail();
  ghostLine.visible = false;
  syncPads();
}

crashEl.addEventListener("click", (e) => {
  const act = e.target.closest("button")?.dataset.act;
  if (act === "restart") restartPlay();
  else if (act === "menu") setMenu(true);
});
splashEl.addEventListener("click", endSplash);

const hud = await createHud();
function sizeView() {
  const vv = visualViewport;
  const w = Math.round(vv?.width ?? innerWidth);
  const h = Math.round(vv?.height ?? innerHeight);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  renderer.domElement.style.left = (vv?.offsetLeft ?? 0) + "px";
  renderer.domElement.style.top = (vv?.offsetTop ?? 0) + "px";
}
sizeView();
let hintUntil = 0;
let hintText = playHint();
let sawClick = false;

function say(text) {
  hintText = text;
  hintUntil = performance.now() + 2600;
}

addEventListener("resize", sizeView);
visualViewport?.addEventListener("resize", sizeView);
visualViewport?.addEventListener("scroll", sizeView);
addEventListener("orientationchange", sizeView);

let last = performance.now();
let thrust = false;
let brake = false;
let boost = false;

function zoneOf(p, d) {
  if (d > p.well) return "outside";
  if (d >= p.sweetIn) return "band";
  return "well";
}

function nearestBody() {
  let nearest = bodies[0];
  let nearestD = Infinity;
  for (const b of bodies) {
    const d = Math.hypot(ship.x - b.x, ship.y - b.y, ship.z - b.z);
    if (d < nearestD) {
      nearestD = d;
      nearest = b;
    }
  }
  return { nearest, nearestD };
}

function paintWells() {
  wellNear.length = 0;
  for (const b of bodies) {
    if (b.well <= 0) continue;
    const d = Math.hypot(ship.x - b.x, ship.y - b.y, ship.z - b.z);
    if (d < b.well * WELL_SHOW) wellNear.push(b);
  }
  wellNear.sort((a, c) => {
    const da = Math.hypot(ship.x - a.x, ship.y - a.y, ship.z - a.z);
    const dc = Math.hypot(ship.x - c.x, ship.y - c.y, ship.z - c.z);
    return da - dc;
  });
  for (let i = 0; i < wellPool.length; i++) {
    const mark = wellPool[i];
    const b = wellNear[i];
    if (!b) {
      mark.visible = false;
      continue;
    }
    mark.visible = true;
    mark.position.set(b.x, b.y, b.z);
    mark.scale.setScalar(b.well);
    const band = mark.getObjectByName("band");
    const s = b.sweetIn / b.well;
    band.scale.set(s, s, s);
  }
}

function paintHud(now, nearest, nearestD, danger) {
  if (hintUntil && now > hintUntil) {
    hintText = playHint();
    hintUntil = 0;
  }
  const toast = hintUntil || !sawClick ? hintText : "";
  hud.update({
    now,
    speed: Math.hypot(ship.vx, ship.vy, ship.vz),
    thrust,
    brake,
    boost,
    nearest: { id: nearest.id, dist: nearestD, zone: zoneOf(nearest, nearestD) },
    toast,
    ship,
    orient,
    planets: radarBodies,
    danger,
    rcs: rcsLabel(),
    splash,
  });
}

// Camera turns a bit slower than the ship, so turns show the hull side-on.
// At MAX_SPIN the lag settles near MAX_SPIN / CAM_FOLLOW rad (~25 deg).
function placeTick() {
  noseNeedle.position.set(ship.x, ship.y, ship.z);
  noseNeedle.quaternion.copy(orient);
}

// Leaned nose is what thrust and align follow. Flip and roll are the mesh only.
function poseHull(dt) {
  const info = wellPull(ship, bodies);
  if (info.depth > 0) pull.set(info.x, info.y, info.z);
  leanDepth += (info.depth - leanDepth) * (1 - Math.exp(-LEAN_EASE * dt));
  const nose = leanNose(forward.x, forward.y, forward.z, pull.x, pull.y, pull.z, leanDepth);
  leanedNose.set(nose.x, nose.y, nose.z);
  leanQ.setFromUnitVectors(forward, leanedNose);
  orientInv.copy(orient).invert();
  localPull.copy(pull).applyQuaternion(orientInv);
  const roll = Math.max(-ROLL_MAX, Math.min(ROLL_MAX, -localPull.x * ROLL_MAX * leanDepth));
  rollQ.setFromAxisAngle(shipNose, roll);
  const rem = remainingFlip(flipAng, brake);
  flipAng += rem * (1 - Math.exp(-BRAKE_FLIP * dt));
  if (flipAng >= TWO_PI) flipAng -= TWO_PI;
  if (remainingFlip(flipAng, brake) < 0.06) flipAng = brake ? Math.PI : 0;
  flipQ.setFromAxisAngle(shipRight, flipAng);
  craft.quaternion.copy(leanQ).multiply(orient).multiply(rollQ).multiply(flipQ);
}

function chaseCam(danger, dt) {
  camQ.slerp(orient, 1 - Math.exp(-CAM_FOLLOW * dt));
  camFwd.set(0, 0, 1).applyQuaternion(camQ);
  camUpDir.set(0, 1, 0).applyQuaternion(camQ);
  const camBack = 4.2 * KM;
  const camUp = 1.4 * KM;
  const look = 3.2 * KM;
  const shake = danger * 0.22 * KM;
  camShake.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  let px = 0;
  let py = 0;
  let pz = 0;
  const plen = Math.hypot(pull.x, pull.y, pull.z);
  if (leanDepth > 0.02 && plen > 1e-8) {
    const k = leanDepth / plen;
    px = pull.x * k;
    py = pull.y * k;
    pz = pull.z * k;
  }
  camera.position.set(
    ship.x - camFwd.x * camBack + camUpDir.x * camUp - px * WELL_OUT + camShake.x,
    ship.y - camFwd.y * camBack + camUpDir.y * camUp - py * WELL_OUT + camShake.y,
    ship.z - camFwd.z * camBack + camUpDir.z * camUp - pz * WELL_OUT + camShake.z
  );
  camera.up.copy(camUpDir);
  camera.lookAt(
    ship.x + camFwd.x * look + px * WELL_PEEK,
    ship.y + camFwd.y * look + py * WELL_PEEK,
    ship.z + camFwd.z * look + pz * WELL_PEEK
  );
}

function frame(now) {
  pollUi();
  if (splash) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    forward.set(0, 0, 1).applyQuaternion(orient);
    engineArcade(ship, forward.x, forward.y, forward.z, dt, false, false, false);
    step(ship, bodies, pass, dt);
    craft.position.set(ship.x, ship.y, ship.z);
    craft.quaternion.copy(orient);
    placeTick();
    plume.visible = false;
    sampleTrail();
    splashAng += dt * 0.18;
    const dist = 5 * KM;
    camera.position.set(
      ship.x + Math.cos(splashAng) * dist,
      ship.y + 1.6 * KM,
      ship.z + Math.sin(splashAng) * dist
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(ship.x, ship.y, ship.z);
    const near = nearestBody();
    paintHud(now, near.nearest, near.nearestD, 0);
    hitchSky();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
    return;
  }
  if (paused) {
    last = now;
    const near = nearestBody();
    paintHud(now, near.nearest, near.nearestD, 0);
    hitchSky();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
    return;
  }
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (crashMode !== "play") {
    if (crashMode === "burst") crashT += dt;
    stepDebris(dt);
    if (crashMode === "burst") {
      if (crashT >= CRASH_BURST) {
        crashMode = "overlay";
        showCrashUi();
        syncPads();
      }
    }
    const near = nearestBody();
    chaseCam(crashMode === "burst" ? Math.max(0, 1 - crashT / CRASH_BURST) : 0, dt);
    paintHud(now, near.nearest, near.nearestD, 0);
    hitchSky();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
    return;
  }

  thrust = false;
  brake = false;
  boost = keys.has("ShiftLeft") || keys.has("ShiftRight");
  let pitch = 0;
  let yaw = 0;
  let roll = 0;
  if (keys.has("KeyW")) thrust = true;
  if (keys.has("KeyS")) brake = true;
  if (keys.has("ArrowUp")) pitch -= 1;
  if (keys.has("ArrowDown")) pitch += 1;
  if (keys.has("ArrowLeft")) yaw -= 1;
  if (keys.has("ArrowRight")) yaw += 1;
  if (keys.has("KeyA") || keys.has("KeyQ")) roll -= 1;
  if (keys.has("KeyD") || keys.has("KeyE")) roll += 1;
  if (padHold.thrust) thrust = true;
  if (padHold.brake) brake = true;
  if (padHold.boost) boost = true;
  if (padHold.rollL) roll -= 1;
  if (padHold.rollR) roll += 1;
  pitch += lookStick.y;
  yaw += lookStick.x;
  const gyro = gyroAxes();
  pitch += gyro.pitch;
  yaw += gyro.yaw;
  // Mouse right yaws right. Pitch starts normal: mouse up pitches the nose up.
  const mouseYaw = mouse.x * MOUSE_TURN;
  const mousePitch = mouse.y * MOUSE_TURN;
  mouse.x = 0;
  mouse.y = 0;

  const pads = navigator.getGamepads?.() ?? [];
  for (const pad of pads) {
    if (!pad) continue;
    const lx = pad.axes[0] ?? 0;
    const ly = pad.axes[1] ?? 0;
    const rx = pad.axes[2] ?? 0;
    const ry = pad.axes[3] ?? 0;
    if (Math.abs(lx) > 0.18) yaw += lx;
    if (Math.abs(ly) > 0.18) pitch += ly;
    if (Math.abs(rx) > 0.18) yaw += rx;
    if (Math.abs(ry) > 0.18) pitch += ry;
    if ((pad.buttons[7]?.value ?? 0) > 0.1) thrust = true;
    if ((pad.buttons[6]?.value ?? 0) > 0.1) brake = true;
    if (pad.buttons[1]?.pressed) boost = true;
    if (pad.buttons[4]?.pressed) roll -= 1;
    if (pad.buttons[5]?.pressed) roll += 1;
  }

  pitch = Math.max(-1, Math.min(1, pitch));
  yaw = Math.max(-1, Math.min(1, yaw));
  roll = Math.max(-1, Math.min(1, roll));
  spin.set(
    (pitch * TURN + mousePitch) * (invert.pitch ? -1 : 1),
    (yaw * TURN + mouseYaw) * (invert.yaw ? -1 : 1),
    roll * TURN * (invert.roll ? -1 : 1)
  );
  if (spin.length() > MAX_SPIN) spin.multiplyScalar(MAX_SPIN / spin.length());

  const rate = spin.length();
  if (rate > 1e-5) {
    axis.copy(spin).multiplyScalar(1 / rate);
    turn.setFromAxisAngle(axis, rate * dt);
    orient.multiply(turn);
    orient.normalize();
  }

  forward.set(0, 0, 1).applyQuaternion(orient);
  up.set(0, 1, 0).applyQuaternion(orient);
  poseHull(dt);
  engineArcade(ship, leanedNose.x, leanedNose.y, leanedNose.z, dt, thrust || boost, brake, boost);

  const hit = step(ship, bodies, pass, dt);
  const nearHit = nearestBody();
  noteFlight(dt, hit, nearHit.nearest, nearHit.nearestD);
  if (hit.event === "crash") {
    beginCrash(hit.bodyId);
  } else if (hit.event === "boost") {
    say("Boost off " + hit.bodyId + ".");
  }

  if (crashMode !== "play") {
    const near = nearestBody();
    chaseCam(crashMode === "burst" ? Math.max(0, 1 - crashT / CRASH_BURST) : 0, dt);
    paintHud(now, near.nearest, near.nearestD, 0);
    hitchSky();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
    return;
  }

  const { nearest, nearestD } = nearHit;
  // Pick up the well's bend so space-align does not yank velocity back onto the old nose.
  if (leanDepth > 0.02) {
    const sn = slingNose(forward.x, forward.y, forward.z, ship.vx, ship.vy, ship.vz, slingMix(leanDepth, dt));
    axis.set(sn.x, sn.y, sn.z);
    if (forward.dot(axis) > -0.999) {
      turn.setFromUnitVectors(forward, axis);
      orient.premultiply(turn);
      orient.normalize();
      forward.set(0, 0, 1).applyQuaternion(orient);
      const nose = leanNose(forward.x, forward.y, forward.z, pull.x, pull.y, pull.z, leanDepth);
      leanedNose.set(nose.x, nose.y, nose.z);
    }
  }
  alignArcade(ship, leanedNose.x, leanedNose.y, leanedNose.z, dt, leanDepth);

  craft.position.set(ship.x, ship.y, ship.z);
  placeTick();
  const bellFwd = 0.5 - 0.5 * Math.cos(flipAng);
  plume.visible = thrust || boost || bellFwd > 0.04;
  // Wider on a brake burn so the flame shows past the heat shield, which faces the camera.
  const along = 0.35 + (boost ? 1.8 : thrust ? 1.4 : 0) + 1.7 * bellFwd;
  const wide = 1 + 1.6 * bellFwd;
  plume.scale.set(wide, along, wide);
  for (const jet of rcsJets) jet.visible = jet.userData.torque.dot(spin) > RCS_DZ;
  sampleTrail();
  paintWells();

  const speed = Math.hypot(ship.vx, ship.vy, ship.vz);
  if (speed > 0.35 * KM) {
    ghostPath(ship, bodies, GHOST_DT, GHOST_N, ghostPos);
    ghostGeo.attributes.position.needsUpdate = true;
    ghostLine.computeLineDistances();
    ghostLine.visible = true;
  } else {
    ghostLine.visible = false;
  }

  let danger = 0;
  if (nearestD < nearest.sweetIn) {
    const span = nearest.sweetIn - nearest.radius;
    danger = span > 1e-4 ? 1 - (nearestD - nearest.radius) / span : 1;
    danger = Math.max(0, Math.min(1, danger));
  }

  chaseCam(danger, dt);
  paintHud(now, nearest, nearestD, danger);

  hitchSky();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
