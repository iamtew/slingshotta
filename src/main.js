import * as THREE from "three";
import { createPass, selfCheck, step } from "./physics.js";

selfCheck();

const MAIN = 26;
const RCS_LIN = 18;
const RCS_ANG = 2.6;
// ponytail: weak spin damping so a tap coasts. Drop it for pure counter-thrust.
const ANG_DAMP = 0.7;
const MAX_SPIN = 2.2;
// Wide of Vela, coasting +Z. Doing nothing misses. Steer in for the ring.
const SPAWN = { x: -40, y: 0, z: -130, vx: 0, vy: 0, vz: 10 };

const planets = [
  { id: "Vela", x: 0, y: 0, z: 0, radius: 12, gm: 1100, color: 0x3d8bfd },
  { id: "Kor", x: 96, y: 0, z: 36, radius: 8, gm: 520, color: 0xe0a15a },
  { id: "Mira", x: -28, y: 0, z: 108, radius: 16, gm: 1700, color: 0xc46b8a },
];

for (const p of planets) {
  // Band sits just off the surface. Well is the outer edge of that band.
  p.sweetIn = p.radius * 1.25;
  p.sweetOut = p.radius * 2.05;
  p.well = p.sweetOut;
}

const rocks = [];
const BELT_R = 58;
const ROCK_N = 70;
for (let i = 0; i < ROCK_N; i++) {
  const a = (i / ROCK_N) * Math.PI * 2 + (i % 5) * 0.07;
  const rad = BELT_R + ((i * 17) % 11) - 5;
  rocks.push({
    id: "rock" + i,
    x: Math.cos(a) * rad,
    y: ((i % 7) - 3) * 0.8,
    z: Math.sin(a) * rad,
    radius: 1.15,
    gm: 0,
    well: 0,
    sweetIn: 0,
    sweetOut: 0,
  });
}

const bodies = planets.concat(rocks);
const ship = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
const pass = createPass();
// Attitude is independent of velocity. Nose is local +Z.
const orient = new THREE.Quaternion();
const spin = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
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
  } else if (act === "back") showMenuPage("home");
  else showMenuPage(act);
});

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 800);
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
  const rad = 220 + Math.random() * 80;
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
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(p.sweetIn, p.sweetOut, 48),
    new THREE.MeshBasicMaterial({
      color: p.color,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(p.x, 0.2, p.z);
  scene.add(ring);
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
scene.add(craft);

// Where the ship is going, not where the nose points.
const pathArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 6, 0x7ecbff, 1.3, 0.65);
scene.add(pathArrow);

const speedEl = document.querySelector("#speed");
const nearEl = document.querySelector("#near");
const hintEl = document.querySelector("#hint");
const DEFAULT_HINT = "Click to steer. Mouse pitch/yaw, Q/E roll. W/S engine. A/D strafe, Space/C up/down. Blue arrow is your path. Enter or Esc: menu.";
let hintUntil = 0;
let hintText = DEFAULT_HINT;

function say(text) {
  hintText = text;
  hintUntil = performance.now() + 2600;
}

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

let last = performance.now();

function frame(now) {
  if (paused) {
    last = now;
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
    return;
  }
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  let main = 0;
  let strafe = 0;
  let lift = 0;
  let pitch = 0;
  let yaw = 0;
  let roll = 0;
  if (keys.has("KeyW")) main += 1;
  if (keys.has("KeyS")) main -= 0.65;
  if (keys.has("KeyA")) strafe -= 1;
  if (keys.has("KeyD")) strafe += 1;
  if (keys.has("Space")) lift += 1;
  if (keys.has("KeyC") || keys.has("ControlLeft")) lift -= 1;
  if (keys.has("ArrowUp")) pitch -= 1;
  if (keys.has("ArrowDown")) pitch += 1;
  if (keys.has("ArrowLeft")) yaw -= 1;
  if (keys.has("ArrowRight")) yaw += 1;
  if (keys.has("KeyQ")) roll -= 1;
  if (keys.has("KeyE")) roll += 1;
  // Mouse right yaws right. Mouse up pitches the nose up.
  yaw += mouse.x * 0.08;
  pitch += mouse.y * 0.08;
  mouse.x = 0;
  mouse.y = 0;

  const pads = navigator.getGamepads?.() ?? [];
  for (const pad of pads) {
    if (!pad) continue;
    const lx = pad.axes[0] ?? 0;
    const ly = pad.axes[1] ?? 0;
    const rx = pad.axes[2] ?? 0;
    const ry = pad.axes[3] ?? 0;
    if (Math.abs(lx) > 0.18) strafe += lx;
    if (Math.abs(ly) > 0.18) main += -ly;
    if (Math.abs(rx) > 0.18) yaw += rx;
    if (Math.abs(ry) > 0.18) pitch += ry;
    main += pad.buttons[7]?.value ?? 0;
    main -= pad.buttons[6]?.value ?? 0;
    if (pad.buttons[4]?.pressed) roll -= 1;
    if (pad.buttons[5]?.pressed) roll += 1;
  }
  main = Math.max(-1, Math.min(1, main));
  strafe = Math.max(-1, Math.min(1, strafe));
  lift = Math.max(-1, Math.min(1, lift));

  spin.x += pitch * RCS_ANG * dt;
  spin.y += yaw * RCS_ANG * dt;
  spin.z += roll * RCS_ANG * dt;
  spin.multiplyScalar(Math.exp(-ANG_DAMP * dt));
  if (spin.length() > MAX_SPIN) spin.multiplyScalar(MAX_SPIN / spin.length());

  const rate = spin.length();
  if (rate > 1e-5) {
    axis.copy(spin).multiplyScalar(1 / rate);
    turn.setFromAxisAngle(axis, rate * dt);
    orient.multiply(turn);
    orient.normalize();
  }

  forward.set(0, 0, 1).applyQuaternion(orient);
  right.set(1, 0, 0).applyQuaternion(orient);
  up.set(0, 1, 0).applyQuaternion(orient);
  ship.vx += (forward.x * main * MAIN + right.x * strafe * RCS_LIN + up.x * lift * RCS_LIN) * dt;
  ship.vy += (forward.y * main * MAIN + right.y * strafe * RCS_LIN + up.y * lift * RCS_LIN) * dt;
  ship.vz += (forward.z * main * MAIN + right.z * strafe * RCS_LIN + up.z * lift * RCS_LIN) * dt;

  const hit = step(ship, bodies, pass, dt);
  if (hit.event === "crash") {
    say("Crash. Back to the start.");
    reset();
  } else if (hit.event === "boost") {
    say("Boost off " + hit.bodyId + ".");
  } else if (hit.event === "bounce") {
    say("Bounced off " + hit.bodyId + ", slower.");
  }

  craft.position.set(ship.x, ship.y, ship.z);
  craft.quaternion.copy(orient);
  plume.visible = main > 0.05;
  plume.scale.y = 0.35 + main * 1.4;

  const speed = Math.hypot(ship.vx, ship.vy, ship.vz);
  if (speed > 0.35) {
    prograde.set(ship.vx, ship.vy, ship.vz).multiplyScalar(1 / speed);
    pathArrow.position.set(ship.x, ship.y, ship.z);
    pathArrow.setDirection(prograde);
    pathArrow.setLength(Math.min(16, 5 + speed * 0.25), 1.4, 0.7);
    pathArrow.visible = true;
  } else {
    pathArrow.visible = false;
  }

  const camBack = 14;
  const camUp = 4.2;
  const look = 10;
  camera.position.set(
    ship.x - forward.x * camBack + up.x * camUp,
    ship.y - forward.y * camBack + up.y * camUp,
    ship.z - forward.z * camBack + up.z * camUp
  );
  camera.up.copy(up);
  camera.lookAt(ship.x + forward.x * look, ship.y + forward.y * look, ship.z + forward.z * look);
  let nearest = planets[0];
  let nearestD = Infinity;
  for (const p of planets) {
    const d = Math.hypot(ship.x - p.x, ship.y - p.y, ship.z - p.z);
    if (d < nearestD) {
      nearestD = d;
      nearest = p;
    }
  }
  speedEl.textContent = "speed " + speed.toFixed(0);
  nearEl.textContent = nearest.id + "  " + nearestD.toFixed(0);
  if (hintUntil && now > hintUntil) {
    hintText = DEFAULT_HINT;
    hintUntil = 0;
  }
  hintEl.textContent = hintText;

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
