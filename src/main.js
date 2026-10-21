import * as THREE from "three";
import { alignArcade, createPass, engineArcade, KM, selfCheck, step } from "./physics.js";
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

const planets = [
  { id: "Vela", x: 0, y: 0, z: 0, radius: 12, gm: 1100, color: 0x3d8bfd },
  { id: "Kor", x: 96, y: 0, z: 36, radius: 8, gm: 520, color: 0xe0a15a },
  { id: "Mira", x: -28, y: 0, z: 108, radius: 16, gm: 1700, color: 0xc46b8a },
];

for (const p of planets) {
  p.x *= KM;
  p.y *= KM;
  p.z *= KM;
  p.radius *= KM;
  p.gm *= KM * KM * KM;
  // Band sits just off the surface. Well is the outer edge of that band.
  p.sweetIn = p.radius * 1.25;
  p.sweetOut = p.radius * 2.05;
  p.well = p.sweetOut;
}

const rocks = [];
const BELT_R = 58 * KM;
const ROCK_N = 70;
for (let i = 0; i < ROCK_N; i++) {
  const a = (i / ROCK_N) * Math.PI * 2 + (i % 5) * 0.07;
  const rad = BELT_R + (((i * 17) % 11) - 5) * KM;
  rocks.push({
    id: "rock" + i,
    x: Math.cos(a) * rad,
    y: ((i % 7) - 3) * 0.8 * KM,
    z: Math.sin(a) * rad,
    radius: 1.15 * KM,
    gm: 0,
    well: 0,
    sweetIn: 0,
    sweetOut: 0,
  });
}

const bodies = planets.concat(rocks);
const ship = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
const pass = createPass();
// Nose is local +Z. Arcade: velocity weathervanes onto it.
const orient = new THREE.Quaternion();
const spin = new THREE.Vector3();
const forward = new THREE.Vector3();
const up = new THREE.Vector3();
const axis = new THREE.Vector3();
const turn = new THREE.Quaternion();
const prograde = new THREE.Vector3();

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
  pass.bounced.clear();
  pass.prevRad.clear();
}

reset();

const keys = new Set();
let pointerDown = false;
let paused = false;
const mouse = { x: 0, y: 0 };
const menu = document.querySelector("#menu");

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
    pathArrow.visible = false;
  }
}

addEventListener("keydown", (e) => {
  if (e.code === "Enter" || e.code === "Escape") {
    e.preventDefault();
    if (!e.repeat) setMenu(!paused);
    return;
  }
  if (paused) return;
  keys.add(e.code);
  if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("pointerdown", () => {
  if (!paused) pointerDown = true;
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
renderer.setClearColor(0x070b14);
document.body.prepend(renderer.domElement);
renderer.domElement.id = "view";
renderer.domElement.addEventListener("click", () => {
  sawClick = true;
  if (paused) return;
  renderer.domElement.requestPointerLock();
});
menu.addEventListener("click", (e) => {
  const act = e.target.closest("button")?.dataset.act;
  if (!act) return;
  if (act === "resume") setMenu(false);
  else if (act === "restart") {
    reset();
    setMenu(false);
  } else if (act === "invert") {
    const btn = e.target.closest("button");
    const axis = btn.dataset.axis;
    invert[axis] = !invert[axis];
    btn.textContent = invertLabel(axis);
  } else if (act === "back") showMenuPage("home");
  else showMenuPage(act);
});

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1 * KM, 800 * KM);
scene.add(new THREE.AmbientLight(0xffffff, 0.45));
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(40, 80, 20);
scene.add(sun);

const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(500 * 3);
for (let i = 0; i < 500; i++) {
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  const rad = (220 + Math.random() * 80) * KM;
  starPos[i * 3] = rad * Math.sin(phi) * Math.cos(theta);
  starPos[i * 3 + 1] = rad * Math.cos(phi) * 0.45;
  starPos[i * 3 + 2] = rad * Math.sin(phi) * Math.sin(theta);
}
starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xc9d6e2, size: 1.2 })));

for (const p of planets) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(p.radius, 20, 14),
    new THREE.MeshLambertMaterial({ color: p.color })
  );
  mesh.position.set(p.x, p.y, p.z);
  scene.add(mesh);
  // Spherical well so the graze volume reads from any approach, not just the equator.
  const wellHaze = new THREE.Mesh(
    new THREE.SphereGeometry(p.well, 24, 16),
    new THREE.MeshBasicMaterial({
      color: p.color,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  wellHaze.position.set(p.x, p.y, p.z);
  scene.add(wellHaze);
  const bandHaze = new THREE.Mesh(
    new THREE.SphereGeometry(p.sweetIn, 20, 14),
    new THREE.MeshBasicMaterial({
      color: p.color,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  bandHaze.position.set(p.x, p.y, p.z);
  scene.add(bandHaze);
}

const rockMesh = new THREE.InstancedMesh(
  new THREE.SphereGeometry(1, 6, 5),
  new THREE.MeshLambertMaterial({ color: 0x8a8178 }),
  rocks.length
);
const dummy = new THREE.Object3D();
rocks.forEach((rock, i) => {
  dummy.position.set(rock.x, rock.y, rock.z);
  dummy.scale.setScalar(rock.radius);
  dummy.updateMatrix();
  rockMesh.setMatrixAt(i, dummy.matrix);
});
scene.add(rockMesh);

const craft = new THREE.Group();
const hullMat = new THREE.MeshLambertMaterial({ color: 0xd7dee6 });
const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.5, 6), hullMat);
nose.rotation.x = Math.PI / 2;
nose.position.z = 1.05;
const fuselage = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.4, 1.5), hullMat);
const podL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.85), hullMat);
podL.position.set(-0.62, 0, -0.15);
const podR = podL.clone();
podR.position.x = 0.62;
const plume = new THREE.Mesh(
  new THREE.ConeGeometry(0.22, 1.3, 6),
  new THREE.MeshBasicMaterial({ color: 0xffb15a })
);
plume.rotation.x = -Math.PI / 2;
plume.position.z = -1.15;
craft.add(nose, fuselage, podL, podR, plume);
craft.scale.setScalar(KM);
scene.add(craft);

// Path read. Arcade flight lines this up with the nose.
const pathArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 6 * KM, 0x7ecbff, 1.3 * KM, 0.65 * KM);
scene.add(pathArrow);

const hud = await createHud();
function sizeView() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
sizeView();
const DEFAULT_HINT = "Click to steer. Mouse pitch/yaw, A/D roll. W thrust, S brake, Shift boost. Nose is the path. Enter or Esc: menu.";
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

function paintHud(now) {
  if (hintUntil && now > hintUntil) {
    hintText = DEFAULT_HINT;
    hintUntil = 0;
  }
  let nearest = planets[0];
  let nearestD = Infinity;
  for (const p of planets) {
    const d = Math.hypot(ship.x - p.x, ship.y - p.y, ship.z - p.z);
    if (d < nearestD) {
      nearestD = d;
      nearest = p;
    }
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
    planets,
  });
}

function frame(now) {
  if (paused) {
    last = now;
    paintHud(now);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
    return;
  }
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

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
    say("Crash. Back to the start.");
    reset();
  } else if (hit.event === "boost") {
    say("Boost off " + hit.bodyId + ".");
  } else if (hit.event === "bounce") {
    say("Bounced off " + hit.bodyId + ", slower.");
  }

  let nearest = planets[0];
  let nearestD = Infinity;
  let inWell = false;
  for (const p of planets) {
    const d = Math.hypot(ship.x - p.x, ship.y - p.y, ship.z - p.z);
    if (d < p.well) inWell = true;
    if (d < nearestD) {
      nearestD = d;
      nearest = p;
    }
  }
  if (hit.event !== "crash") alignArcade(ship, forward.x, forward.y, forward.z, dt, inWell);

  craft.position.set(ship.x, ship.y, ship.z);
  craft.quaternion.copy(orient);
  plume.visible = thrust || boost;
  plume.scale.y = 0.35 + (boost ? 1.8 : 1.4);

  const speed = Math.hypot(ship.vx, ship.vy, ship.vz);
  if (speed > 0.35 * KM) {
    prograde.set(ship.vx, ship.vy, ship.vz).multiplyScalar(1 / speed);
    pathArrow.position.set(ship.x, ship.y, ship.z);
    pathArrow.setDirection(prograde);
    pathArrow.setLength(Math.min(16 * KM, 5 * KM + speed * 0.25), 1.4 * KM, 0.7 * KM);
    pathArrow.visible = true;
  } else {
    pathArrow.visible = false;
  }

  const camBack = 14 * KM;
  const camUp = 4.2 * KM;
  const look = 10 * KM;
  camera.position.set(
    ship.x - forward.x * camBack + up.x * camUp,
    ship.y - forward.y * camBack + up.y * camUp,
    ship.z - forward.z * camBack + up.z * camUp
  );
  camera.up.copy(up);
  camera.lookAt(ship.x + forward.x * look, ship.y + forward.y * look, ship.z + forward.z * look);
  paintHud(now);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
