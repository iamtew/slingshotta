import * as THREE from "three";
import { alignArcade, createPass, engineArcade, ghostPath, KM, selfCheck, step } from "./physics.js";
import { createHud, selfCheck as hudCheck } from "./hud.js";

selfCheck();
hudCheck();

const TURN = 2.2;
const MAX_SPIN = 2.2;
// Locked mouse: pixels this frame are turn rate, then they clear.
const MOUSE_TURN = 0.15;
// All axes start inverted. Toggles on the Controls page.
const invert = { pitch: true, yaw: true, roll: true };
// Wide of Vela, coasting +Z. Doing nothing misses. Steer in for the ring.
const SPAWN = { x: -40 * KM, y: 0, z: -130 * KM, vx: 0, vy: 0, vz: 10 * KM };
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
  { id: "Kor", x: 96, y: 0, z: 36, radius: 8, gm: 520, color: 0xe0a15a },
  { id: "Mira", x: -28, y: 0, z: 108, radius: 16, gm: 1700, color: 0xc46b8a },
  { id: "Nox", x: 54, y: -18, z: -72, radius: 5, gm: 180, color: 0x2a8f8a },
  { id: "Rhea", x: -110, y: 12, z: 48, radius: 22, gm: 2400, color: 0xc9b48a },
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
const BELT_R = 58 * KM;
const ROCK_N = 70;
const GATE = 16 * KM;
for (let i = 0; i < ROCK_N; i++) {
  const a = (i / ROCK_N) * Math.PI * 2 + (i % 5) * 0.07;
  const rad = BELT_R + (((i * 17) % 11) - 5) * KM;
  const x = Math.cos(a) * rad;
  const y = ((i % 7) - 3) * 0.8 * KM;
  const z = Math.sin(a) * rad;
  // Keep the spawn coast clear. Rock pull would otherwise snag the inbound line.
  if (Math.hypot(x - SPAWN.x, y) < GATE) continue;
  const radius = (0.7 + (i % 5) * 0.18) * KM;
  const rock = {
    id: "rock" + i,
    x,
    y,
    z,
    radius,
    // Density like Vela. Stronger gm yanks the coast into the belt.
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

function reset() {
  ship.x = SPAWN.x;
  ship.y = SPAWN.y;
  ship.z = SPAWN.z;
  ship.vx = SPAWN.vx;
  ship.vy = SPAWN.vy;
  ship.vz = SPAWN.vz;
  orient.identity();
  spin.set(0, 0, 0);
  pass.boosted.clear();
  pass.prevRad.clear();
}

reset();

const keys = new Set();
let pointerDown = false;
let paused = false;
const mouse = { x: 0, y: 0 };
const menu = document.querySelector("#menu");
const crashEl = document.querySelector("#crash");
let crashMode = "play";

function invertLabel(axis) {
  return axis[0].toUpperCase() + axis.slice(1) + ": " + (invert[axis] ? "inverted" : "normal");
}

function showMenuPage(name) {
  for (const id of ["home", "how", "controls", "help"]) {
    document.querySelector("#menu-" + id).hidden = id !== name;
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
renderer.setClearColor(0x0a0814);
document.body.prepend(renderer.domElement);
renderer.domElement.id = "view";
renderer.domElement.addEventListener("click", () => {
  sawClick = true;
  if (paused || crashMode !== "play") return;
  renderer.domElement.requestPointerLock();
});
menu.addEventListener("click", (e) => {
  const act = e.target.closest("button")?.dataset.act;
  if (!act) return;
  if (act === "resume") setMenu(false);
  else if (act === "restart") {
    restartPlay();
    setMenu(false);
  } else if (act === "invert") {
    const btn = e.target.closest("button");
    const axisName = btn.dataset.axis;
    invert[axisName] = !invert[axisName];
    btn.textContent = invertLabel(axisName);
  } else if (act === "back") showMenuPage("home");
  else showMenuPage(act);
});

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1 * KM, 1600 * KM);
scene.add(new THREE.AmbientLight(0x6a7a99, 0.32));

// Past Vela on the spawn look, so it reads as the system's sun.
const SUN_POS = new THREE.Vector3(12 * KM, 22 * KM, 180 * KM);
const sunDir = new THREE.DirectionalLight(0xfff1d0, 1.15);
sunDir.position.copy(SUN_POS);
scene.add(sunDir);
const sunLamp = new THREE.PointLight(0xffdca0, 2.4, 900 * KM, 1.4);
sunLamp.position.copy(SUN_POS);
scene.add(sunLamp);
const sunMesh = new THREE.Mesh(
  new THREE.SphereGeometry(48 * KM, 32, 24),
  new THREE.MeshBasicMaterial({ color: 0xffe7a0 })
);
sunMesh.position.copy(SUN_POS);
sunMesh.frustumCulled = false;
sunMesh.renderOrder = -2;
scene.add(sunMesh);
const sunHalo = new THREE.Mesh(
  new THREE.SphereGeometry(70 * KM, 16, 12),
  new THREE.MeshBasicMaterial({
    color: 0xffb15a,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
);
sunHalo.position.copy(SUN_POS);
sunHalo.frustumCulled = false;
sunHalo.renderOrder = -1;
scene.add(sunHalo);

const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(700 * 3);
for (let i = 0; i < 700; i++) {
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  const rad = (280 + Math.random() * 220) * KM;
  starPos[i * 3] = rad * Math.sin(phi) * Math.cos(theta);
  starPos[i * 3 + 1] = rad * Math.cos(phi) * 0.5;
  starPos[i * 3 + 2] = rad * Math.sin(phi) * Math.sin(theta);
}
starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xc9d6e2, size: 1.2 })));

function addCloud(color, cx, cy, cz, spread, n) {
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (cx + (Math.random() - 0.5) * spread) * KM;
    pos[i * 3 + 1] = (cy + (Math.random() - 0.5) * spread * 0.45) * KM;
    pos[i * 3 + 2] = (cz + (Math.random() - 0.5) * spread) * KM;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  scene.add(
    new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color,
        size: 28,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      })
    )
  );
}
addCloud(0xc45cff, 80, 40, -90, 90, 220);
addCloud(0x2ec4b6, -120, -30, 70, 110, 260);
addCloud(0xff9a3c, 40, -50, 140, 80, 180);
addCloud(0x3d8bfd, -60, 55, -40, 95, 240);
addCloud(0xe05a8c, 150, 20, 40, 70, 160);

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
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(p.radius * 1.55, p.radius * 0.06, 8, 48),
      new THREE.MeshPhongMaterial({ color: 0xd8c8a4, transparent: true, opacity: 0.55, shininess: 4 })
    );
    ring.rotation.x = Math.PI / 2.4;
    ring.position.copy(mesh.position);
    scene.add(ring);
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

const craft = new THREE.Group();
const hullMat = new THREE.MeshLambertMaterial({ color: 0xd7dee6 });
const darkMat = new THREE.MeshLambertMaterial({ color: 0x2a3544 });
const nose = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.55, 8), hullMat);
nose.rotation.x = Math.PI / 2;
nose.position.z = 1.1;
const fuselage = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.38, 1.55), hullMat);
const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.55), darkMat);
canopy.position.set(0, 0.24, 0.35);
const podL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.9), hullMat);
podL.position.set(-0.62, 0, -0.12);
const podR = podL.clone();
podR.position.x = 0.62;
const finL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.55), hullMat);
finL.position.set(-0.28, 0.28, -0.55);
const finR = finL.clone();
finR.position.x = 0.28;
const bellL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.28, 8), darkMat);
bellL.rotation.x = Math.PI / 2;
bellL.position.set(-0.62, 0, -0.62);
const bellR = bellL.clone();
bellR.position.x = 0.62;
const plume = new THREE.Mesh(
  new THREE.ConeGeometry(0.22, 1.3, 6),
  new THREE.MeshBasicMaterial({ color: 0xffb15a })
);
plume.rotation.x = -Math.PI / 2;
plume.position.z = -1.15;
const noseRingPts = [];
for (let i = 0; i <= 20; i++) {
  const a = (i / 20) * Math.PI * 2;
  noseRingPts.push(new THREE.Vector3(Math.cos(a) * 0.28, Math.sin(a) * 0.28, 3.15));
}
const noseNeedle = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints(noseRingPts),
  new THREE.LineBasicMaterial({ color: 0xf4f7fb })
);
craft.add(nose, fuselage, canopy, podL, podR, finL, finR, bellL, bellR, plume, noseNeedle);
// Cold gas. Exhaust is opposite the turn. Local +Z is the nose.
const rcsGeo = new THREE.ConeGeometry(0.12, 0.55, 5);
const rcsMat = new THREE.MeshBasicMaterial({ color: 0xd8f2ff });
function rcsJet(x, y, z, rx, rz) {
  const jet = new THREE.Mesh(rcsGeo, rcsMat);
  jet.position.set(x, y, z);
  jet.rotation.set(rx, 0, rz);
  jet.visible = false;
  craft.add(jet);
  return jet;
}
const rcsUp = rcsJet(0, 0.28, 0.85, 0, 0);
const rcsDown = rcsJet(0, -0.28, 0.85, Math.PI, 0);
const rcsRight = rcsJet(0.4, 0, 0.85, 0, -Math.PI / 2);
const rcsLeft = rcsJet(-0.4, 0, 0.85, 0, Math.PI / 2);
const rcsRollL = rcsJet(-0.62, 0.22, -0.15, 0, 0);
const rcsRollR = rcsJet(0.62, 0.22, -0.15, 0, 0);
const RCS_DZ = 0.18;
craft.scale.setScalar(KM);
scene.add(craft);

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
  clearDebris();
  clearTrail();
  ghostLine.visible = false;
}

crashEl.addEventListener("click", (e) => {
  if (e.target.closest("button")?.dataset.act === "restart") restartPlay();
});

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
  });
}

function frame(now) {
  if (paused) {
    last = now;
    const near = nearestBody();
    paintHud(now, near.nearest, near.nearestD, 0);
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
  // Mouse right yaws right. Invert (default) makes mouse up pitch the nose down.
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
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
    return;
  }

  const { nearest, nearestD, inWell } = nearestBody();
  alignArcade(ship, forward.x, forward.y, forward.z, dt, inWell);

  craft.position.set(ship.x, ship.y, ship.z);
  craft.quaternion.copy(orient);
  plume.visible = thrust || boost;
  plume.scale.y = 0.35 + (boost ? 1.8 : 1.4);
  rcsUp.visible = spin.x > RCS_DZ;
  rcsDown.visible = spin.x < -RCS_DZ;
  rcsRight.visible = spin.y > RCS_DZ;
  rcsLeft.visible = spin.y < -RCS_DZ;
  rcsRollL.visible = spin.z > RCS_DZ;
  rcsRollR.visible = spin.z < -RCS_DZ;
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

  const camBack = 14 * KM;
  const camUp = 4.2 * KM;
  const look = 10 * KM;
  const shake = danger * 0.55 * KM;
  camShake.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  camera.position.set(
    ship.x - forward.x * camBack + up.x * camUp + camShake.x,
    ship.y - forward.y * camBack + up.y * camUp + camShake.y,
    ship.z - forward.z * camBack + up.z * camUp + camShake.z
  );
  camera.up.copy(up);
  camera.lookAt(ship.x + forward.x * look, ship.y + forward.y * look, ship.z + forward.z * look);
  paintHud(now, nearest, nearestD, danger);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
