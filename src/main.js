import * as THREE from "three";
import { alignArcade, createPass, engineArcade, ghostPath, KM, selfCheck, step } from "./physics.js";
import { createHud, selfCheck as hudCheck } from "./hud.js";

selfCheck();
hudCheck();

const TURN = 2.2;
const MAX_SPIN = 2.2;
// Locked mouse: pixels this frame are turn rate, then they clear.
const MOUSE_TURN = 0.15;
// Yaw and roll start inverted. Pitch starts normal. Toggles on the Controls page.
const invert = { pitch: false, yaw: true, roll: true };
// Wide of Vela, coasting +Z. Doing nothing misses. Steer in for the ring.
const SPAWN = { x: -90 * KM, y: 8 * KM, z: -420 * KM, vx: 0, vy: 0, vz: 12 * KM };
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
  p.x *= KM;
  p.y *= KM;
  p.z *= KM;
  p.radius *= KM;
  p.gm *= KM * KM * KM;
  finishBody(p, 1.25, 2.05);
}

const moons = [];
function addMoon(id, parent, ox, oy, oz, radius, gm, color) {
  const m = {
    id,
    x: parent.x + ox * KM,
    y: parent.y + oy * KM,
    z: parent.z + oz * KM,
    radius: radius * KM,
    gm: gm * KM * KM * KM,
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
  const rad = (170 + (((i * 17) % 11) - 5) * 4) * KM;
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
        pa.x + (pb.x - pa.x) * t + (((j * 13) % 17) - 8) * 6 * KM,
        pa.y + (pb.y - pa.y) * t + (((j * 5) % 9) - 4) * 4 * KM,
        pa.z + (pb.z - pa.z) * t + (((j * 7) % 15) - 7) * 6 * KM,
        (0.8 + (k % 4) * 0.25) * KM,
        j
      );
    }
  }
}
for (let i = 0; i < 40; i++) {
  addRock(
    (((i * 37) % 61) - 30) * 14 * KM,
    (((i * 11) % 13) - 6) * 8 * KM,
    (((i * 19) % 59) - 29) * 14 * KM,
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
bigRocks.forEach((r, i) => addRock(r[0] * KM, r[1] * KM, r[2] * KM, r[3] * KM, i + 80));

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
// Hull yaw on brake is not the flight frame. Camera and the nose tick stay on orient.
const flipQ = new THREE.Quaternion();
const shipUp = new THREE.Vector3(0, 1, 0);
const BRAKE_FLIP = 1 / 0.12;
let brakeBlend = 0;

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
  brakeBlend = 0;
}

reset();

const keys = new Set();
let pointerDown = false;
let paused = false;
const mouse = { x: 0, y: 0 };
const menu = document.querySelector("#menu");
const crashEl = document.querySelector("#crash");
const splashEl = document.querySelector("#splash");
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

function showMenuPage(name) {
  menuPage = name;
  for (const id of ["home", "how", "controls", "help"]) {
    document.querySelector("#menu-" + id).hidden = id !== name;
  }
  menuIx = 0;
  focusMenu();
}

function menuButtons() {
  return [...document.querySelector("#menu-" + menuPage).querySelectorAll("button")];
}

function focusMenu() {
  const btns = menuButtons();
  if (!btns.length) return;
  menuIx = (menuIx + btns.length) % btns.length;
  for (let i = 0; i < btns.length; i++) btns[i].classList.toggle("on", i === menuIx);
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
  if (crashMode !== "play") {
    if (startHit || aHit) restartPlay();
    return;
  }
  if (startHit) {
    setMenu(!paused);
    return;
  }
  if (!paused) return;
  if (upHit) {
    menuIx -= 1;
    focusMenu();
  }
  if (downHit) {
    menuIx += 1;
    focusMenu();
  }
  if (aHit) {
    const act = menuButtons()[menuIx]?.dataset.act;
    if (act) runMenu(act);
  }
  if (bHit) {
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
  }
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
      if (crashMode !== "play") restartPlay();
      else setMenu(!paused);
    }
    return;
  }
  if (paused || crashMode !== "play") return;
  keys.add(e.code);
  if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("pointerdown", () => {
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

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1 * KM, 5000 * KM);
scene.add(new THREE.AmbientLight(0x9a6ab8, 0.22));
// Sky sun lives on the dome. Light only; no body in the system.
const sunDir = new THREE.DirectionalLight(0xffd4a8, 1.2);
sunDir.position.set(0.45, 0.55, 0.7);
scene.add(sunDir);

const SKY_R = 2800 * KM;

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
const hullMat = new THREE.MeshLambertMaterial({ color: 0x4a6b45 });
const darkMat = new THREE.MeshLambertMaterial({ color: 0x2a2e33 });
const whiteMat = new THREE.MeshLambertMaterial({ color: 0xe6e1d3 });
const copperMat = new THREE.MeshLambertMaterial({ color: 0xa8643a });
const dishMat = new THREE.MeshLambertMaterial({ color: 0xb8b4aa, side: THREE.DoubleSide });
const metalMat = new THREE.MeshLambertMaterial({ color: 0x55575c, side: THREE.DoubleSide });
const strutMat = new THREE.MeshLambertMaterial({ color: 0x48577a });
const podMat = new THREE.MeshLambertMaterial({ color: 0xc8b07a });

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
const rcsGeo = new THREE.CylinderGeometry(0.12, 0.03, 0.5, 6);
const rcsMat = new THREE.MeshBasicMaterial({ color: 0xd8f2ff, transparent: true, opacity: 0.85 });
const rcsJets = [];
const rcsThrust = new THREE.Vector3();
function rcsJet(pod, dx, dy) {
  const jet = new THREE.Mesh(rcsGeo, rcsMat);
  const out = new THREE.Vector3(dx, dy, 0);
  jet.position.copy(pod).addScaledVector(out, 0.36);
  jet.quaternion.setFromUnitVectors(yAxis, out);
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

const plume = new THREE.Mesh(
  new THREE.ConeGeometry(0.36, 1.3, 12),
  new THREE.MeshBasicMaterial({ color: 0xffb15a })
);
plume.rotation.x = -Math.PI / 2;
plume.position.z = -2.4;
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
craft.scale.setScalar(KM);
scene.add(craft);
// Heading tick stays on the flight frame when the hull flips.
noseNeedle.scale.setScalar(KM);
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
const TRAIL_STEP = 0.8 * KM;
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

function clearDebris() {
  for (const bit of debris) scene.remove(bit.mesh);
  debris.length = 0;
}

function beginCrash() {
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
  clearDebris();
  const wx = craft.position.x;
  const wy = craft.position.y;
  const wz = craft.position.z;
  for (let i = 0; i < 8; i++) {
    const mesh = new THREE.Mesh(debrisGeo, hullMat);
    mesh.position.set(wx, wy, wz);
    mesh.scale.setScalar(KM * (0.7 + Math.random() * 0.6));
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    const kick = (4 + Math.random() * 6) * KM;
    debris.push({
      mesh,
      vx: ship.vx + (Math.random() - 0.5) * kick,
      vy: ship.vy + (Math.random() - 0.5) * kick,
      vz: ship.vz + (Math.random() - 0.5) * kick,
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
}

crashEl.addEventListener("click", (e) => {
  if (e.target.closest("button")?.dataset.act === "restart") restartPlay();
});
splashEl.addEventListener("click", endSplash);

const hud = await createHud();
function sizeView() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
sizeView();
const DEFAULT_HINT =
  "Click to steer. White tick is the nose. Dashed cyan is where velocity goes. Enter or Esc: menu.";
let hintUntil = 0;
let hintText = DEFAULT_HINT;
let sawClick = false;

function say(text) {
  hintText = text;
  hintUntil = performance.now() + 2600;
}

addEventListener("resize", sizeView);

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
  let inWell = false;
  for (const b of bodies) {
    const d = Math.hypot(ship.x - b.x, ship.y - b.y, ship.z - b.z);
    if (b.well > 0 && d < b.well) inWell = true;
    if (d < nearestD) {
      nearestD = d;
      nearest = b;
    }
  }
  return { nearest, nearestD, inWell };
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
    hintText = DEFAULT_HINT;
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

// Bell points along travel while braking. The flight frame does not flip.
function poseHull(dt) {
  brakeBlend += ((brake ? 1 : 0) - brakeBlend) * (1 - Math.exp(-BRAKE_FLIP * dt));
  flipQ.setFromAxisAngle(shipUp, Math.PI * brakeBlend);
  craft.quaternion.copy(orient).multiply(flipQ);
}

function chaseCam(danger, dt) {
  camQ.slerp(orient, 1 - Math.exp(-CAM_FOLLOW * dt));
  camFwd.set(0, 0, 1).applyQuaternion(camQ);
  camUpDir.set(0, 1, 0).applyQuaternion(camQ);
  const camBack = 14 * KM;
  const camUp = 4.2 * KM;
  const look = 10 * KM;
  const shake = danger * 0.55 * KM;
  camShake.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  camera.position.set(
    ship.x - camFwd.x * camBack + camUpDir.x * camUp + camShake.x,
    ship.y - camFwd.y * camBack + camUpDir.y * camUp + camShake.y,
    ship.z - camFwd.z * camBack + camUpDir.z * camUp + camShake.z
  );
  camera.up.copy(camUpDir);
  camera.lookAt(ship.x + camFwd.x * look, ship.y + camFwd.y * look, ship.z + camFwd.z * look);
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
    const dist = 18 * KM;
    camera.position.set(
      ship.x + Math.cos(splashAng) * dist,
      ship.y + 5.5 * KM,
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
    stepDebris(dt);
    if (crashMode === "burst") {
      crashT += dt;
      if (crashT >= CRASH_BURST) {
        crashMode = "overlay";
        crashEl.hidden = false;
      }
    }
    const near = nearestBody();
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
  engineArcade(ship, forward.x, forward.y, forward.z, dt, thrust || boost, brake, boost);

  const hit = step(ship, bodies, pass, dt);
  if (hit.event === "crash") {
    beginCrash();
  } else if (hit.event === "boost") {
    say("Boost off " + hit.bodyId + ".");
  }

  if (crashMode !== "play") {
    const near = nearestBody();
    paintHud(now, near.nearest, near.nearestD, 0);
    hitchSky();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
    return;
  }

  const { nearest, nearestD, inWell } = nearestBody();
  alignArcade(ship, forward.x, forward.y, forward.z, dt, inWell);

  craft.position.set(ship.x, ship.y, ship.z);
  placeTick();
  plume.visible = thrust || boost || brakeBlend > 0.04;
  // Wider on a brake burn so the flame shows past the heat shield, which faces the camera.
  const along = 0.35 + (boost ? 1.8 : thrust ? 1.4 : 0) + 1.7 * brakeBlend;
  const wide = 1 + 1.6 * brakeBlend;
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
