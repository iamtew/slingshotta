import * as THREE from "three";
import { createPass, selfCheck, step } from "./physics.js";

selfCheck();

const ACCEL = 22;
const YAW_RATE = 1.7;
// Outside the belt. The nose misses Vela by about one band width.
const SPAWN = { x: -96, y: 0, z: -72, speed: 12, yaw: Math.atan2(84, 88) };

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
let yaw = 0;

function reset() {
  ship.x = SPAWN.x;
  ship.y = SPAWN.y;
  ship.z = SPAWN.z;
  yaw = SPAWN.yaw;
  ship.vx = Math.sin(yaw) * SPAWN.speed;
  ship.vy = 0;
  ship.vz = Math.cos(yaw) * SPAWN.speed;
  pass.boosted.clear();
  pass.bounced.clear();
  pass.prevRad.clear();
}

reset();

const keys = new Set();
let pointerDown = false;
let mouseYaw = 0;

addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("pointerdown", (e) => {
  pointerDown = true;
  e.target.setPointerCapture?.(e.pointerId);
});
addEventListener("pointerup", () => {
  pointerDown = false;
});
addEventListener("pointermove", (e) => {
  if (pointerDown) mouseYaw -= e.movementX * 0.004;
});

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "low-power" });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x070b14);
document.body.prepend(renderer.domElement);
renderer.domElement.id = "view";

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
const hull = new THREE.Mesh(
  new THREE.ConeGeometry(0.7, 2.4, 6),
  new THREE.MeshLambertMaterial({ color: 0xf2f4f8 })
);
hull.rotation.x = Math.PI / 2;
craft.add(hull);
scene.add(craft);

const speedEl = document.querySelector("#speed");
const nearEl = document.querySelector("#near");
const hintEl = document.querySelector("#hint");
const DEFAULT_HINT = "Graze a ring to boost. Too steep bounces. Hit the body and you crash.";
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
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  let thrust = 0;
  let yawInput = mouseYaw;
  mouseYaw = 0;
  if (keys.has("KeyW")) thrust += 1;
  if (keys.has("KeyS")) thrust -= 0.45;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) yawInput += YAW_RATE * dt;
  if (keys.has("KeyD") || keys.has("ArrowRight")) yawInput -= YAW_RATE * dt;

  const pads = navigator.getGamepads?.() ?? [];
  for (const pad of pads) {
    if (!pad) continue;
    const lx = pad.axes[0] ?? 0;
    const ly = pad.axes[1] ?? 0;
    if (Math.abs(lx) > 0.18) yawInput -= lx * YAW_RATE * dt;
    if (Math.abs(ly) > 0.18) thrust += -ly;
    thrust += pad.buttons[7]?.value ?? 0;
  }
  thrust = Math.max(-0.45, Math.min(1, thrust));
  yaw += yawInput;

  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  ship.vx += fx * thrust * ACCEL * dt;
  ship.vz += fz * thrust * ACCEL * dt;

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
  craft.rotation.y = yaw;

  const camBack = 16;
  const camUp = 7;
  camera.position.set(ship.x - fx * camBack, ship.y + camUp, ship.z - fz * camBack);
  camera.lookAt(ship.x, ship.y, ship.z);

  const speed = Math.hypot(ship.vx, ship.vy, ship.vz);
  let nearest = planets[0];
  let nearestD = Infinity;
  for (const p of planets) {
    const d = Math.hypot(ship.x - p.x, ship.z - p.z);
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
