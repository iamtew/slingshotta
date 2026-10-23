import * as THREE from "three";
import { alignArcade, createPass, engineArcade, feltG, ghostPath, KM, leanNose, passHint, selfCheck, slingMix, slingNose, step, wellPull } from "./physics.js";
import { createHud, fmtDist, fmtSpeed, selfCheck as hudCheck } from "./hud.js";
import { selfCheck as tiltCheck } from "./tilt.js";
import {
  SPAWN as classicSpawn,
  bodies as classicBodies,
  layout,
  moons as classicMoons,
  planets as classicPlanets,
  radarBodies as classicRadar,
  rocks as classicRocks,
  selfCheck as worldCheck,
} from "./world.js";
import { createRacer } from "./ship.js";
import { createSky } from "./sky.js";
import { createFx } from "./fx.js";
import {
  bindPads,
  clearLook,
  clearPadHold,
  coarsePointer,
  gyroAxes,
  inputPrefs,
  invert,
  keys,
  lookStick,
  mouse,
  overlaysWanted,
  padHold,
  savePrefs,
} from "./input.js";
import {
  bindUi,
  crashEl,
  crashMode,
  endSplash,
  paintCrashStats,
  paused,
  playHint,
  pollUi,
  setCrashMode,
  setMenu,
  setUiHooks,
  showCrashUi,
  splash,
  spinSplash,
  syncPads,
} from "./ui.js";

selfCheck();
hudCheck();
tiltCheck();
worldCheck();

const classicWorld = {
  bodies: classicBodies,
  planets: classicPlanets,
  moons: classicMoons,
  rocks: classicRocks,
  radarBodies: classicRadar,
  SPAWN: classicSpawn,
};

function worldFor(seed) {
  return seed === "classic" ? classicWorld : layout(seed);
}

let activeSeed = inputPrefs.developer ? inputPrefs.seed : "classic";
let world = worldFor(activeSeed);
let bodies = world.bodies;
let radarBodies = world.radarBodies;
let SPAWN = world.SPAWN;
let home = world.planets[0];

const TURN = 2.2;
const MAX_SPIN = 2.2;
// Locked mouse: pixels this frame are turn rate, then they clear.
const MOUSE_TURN = 0.15;
const WELL_SHOW = 2.2;
const WELL_FADE = 10;
const WELL_RING_A = 0.18;
const WELL_BAND_A = 0.22;
const WELL_SHELL_G = 0.16;
const WELL_BAND_G = 0.1;
const GHOST_N = 14;
const GHOST_DT = 0.14;

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
// Hull pose is not the flight frame. Camera stays on orient.
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
let gLoad = 0;
let burnKick = 0;
let wasBurn = false;

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
  gLoad = 0;
  burnKick = 0;
  wasBurn = false;
  clearFlight();
}

reset();

function poseSplash() {
  ship.x = home.x + 80 * KM;
  ship.y = home.y + 48 * KM;
  ship.z = home.z - 260 * KM;
  ship.vx = 4 * KM;
  ship.vy = 0;
  ship.vz = 10 * KM;
  orient.identity();
  axis.set(1, 0, 0);
  turn.setFromAxisAngle(axis, -0.22);
  orient.multiply(turn);
}
poseSplash();

function rcsLabel() {
  const ax = Math.abs(spin.x);
  const ay = Math.abs(spin.y);
  const az = Math.abs(spin.z);
  if (ax < 0.18 && ay < 0.18 && az < 0.18) return "";
  if (ax >= ay && ax >= az) return "RCS PITCH";
  if (ay >= az) return "RCS YAW";
  return "RCS ROLL";
}

let sawClick = false;
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

const { hitchSky, planetMap } = createSky(scene, camera, fill, KM);

const wellMat = new THREE.MeshBasicMaterial({
  color: 0x6aff8a,
  transparent: true,
  opacity: WELL_RING_A,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const bandMat = new THREE.MeshBasicMaterial({
  color: 0xff9a3c,
  transparent: true,
  opacity: WELL_BAND_A,
  depthWrite: false,
  side: THREE.DoubleSide,
});

// Tube, not a line. A flat ring in the sling plane vanishes edge-on.
const ringGeo = new THREE.TorusGeometry(1, 0.018, 6, 72);
// Rim-lit bubble. The face stays clear so the field reads as a shell.
const shellGeo = new THREE.SphereGeometry(1, 40, 28);
const shellMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  uniforms: {
    uColor: { value: new THREE.Color(0x6aff8a) },
    uGain: { value: WELL_SHELL_G },
  },
  vertexShader: `
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vN = normalize(mat3(modelMatrix) * normal);
      vV = normalize(cameraPosition - w.xyz);
      gl_Position = projectionMatrix * viewMatrix * w;
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uGain;
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.6);
      gl_FragColor = vec4(uColor, f * uGain);
    }
  `,
});
const bandShellMat = shellMat.clone();
bandShellMat.uniforms.uColor.value.set(0xff9a3c);
bandShellMat.uniforms.uGain.value = WELL_BAND_G;

function makeRing(material) {
  const mesh = new THREE.Mesh(ringGeo, material);
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

function makeWellMark() {
  const g = new THREE.Group();
  const ring = wellMat.clone();
  const bandM = bandMat.clone();
  const shell = shellMat.clone();
  const bandShell = bandShellMat.clone();
  const band = makeRing(bandM);
  band.name = "band";
  const inner = new THREE.Mesh(shellGeo, bandShell);
  inner.name = "shellBand";
  g.add(new THREE.Mesh(shellGeo, shell), inner, makeRing(ring), band);
  g.userData = { fade: 0, bodyId: null, ring, band: bandM, shell, bandShell };
  g.visible = false;
  scene.add(g);
  return g;
}

const wellPool = Array.from({ length: 12 }, makeWellMark);

const rockGeos = [
  new THREE.IcosahedronGeometry(1, 0),
  new THREE.DodecahedronGeometry(1, 0),
  new THREE.OctahedronGeometry(1, 0),
  new THREE.TetrahedronGeometry(1, 0),
];
const rockMat = new THREE.MeshPhongMaterial({ color: 0x8a8178, shininess: 4, flatShading: true });
const dummy = new THREE.Object3D();
let system = null;

function clearSystem() {
  if (!system) return;
  system.traverse((obj) => {
    // Rock shapes and rockMat are shared across seeds. Instance data is not.
    if (obj.isInstancedMesh) {
      obj.instanceMatrix.dispose?.();
      return;
    }
    if (obj.geometry) obj.geometry.dispose();
    const mats = obj.material ? [].concat(obj.material) : [];
    for (const m of mats) {
      if (m === rockMat || m === wellMat || m === bandMat || m === shellMat || m === bandShellMat) continue;
      m.map?.dispose();
      m.dispose();
    }
  });
  scene.remove(system);
  system = null;
}

function mountWorld(next) {
  clearSystem();
  bodies = next.bodies;
  radarBodies = next.radarBodies;
  SPAWN = next.SPAWN;
  home = next.planets[0];
  system = new THREE.Group();
  scene.add(system);
  for (const p of next.planets) {
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
    system.add(mesh);
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
      system.add(rings);
    }
  }
  for (const m of next.moons) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(m.radius, 24, 16),
      new THREE.MeshPhongMaterial({ map: planetMap(m.color), color: 0xffffff, shininess: 6 })
    );
    mesh.position.set(m.x, m.y, m.z);
    system.add(mesh);
  }
  for (let kind = 0; kind < rockGeos.length; kind++) {
    const batch = next.rocks.filter((r) => r.kind === kind);
    if (!batch.length) continue;
    const mesh = new THREE.InstancedMesh(rockGeos[kind], rockMat, batch.length);
    batch.forEach((rock, i) => {
      dummy.position.set(rock.x, rock.y, rock.z);
      dummy.rotation.set(rock.rx, rock.ry, rock.rz);
      dummy.scale.set(rock.radius * rock.sx, rock.radius * rock.sy, rock.radius * rock.sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    system.add(mesh);
  }
}

mountWorld(world);

const { craft, plume, bell, rcsJets, RCS_DZ, hullMat } = createRacer(scene, SHIP);
const { ghostPos, ghostGeo, ghostLine, clearTrail, sampleTrail, clearDebris, spawnBurst, stepDebris } = createFx({
  scene,
  ship,
  km: KM,
  shipScale: SHIP,
  hullMat,
  ghostN: GHOST_N,
  craft,
  bell,
  rcsJets,
});
clearTrail();

const CRASH_BURST = 1;
let crashT = 0;

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

function beginCrash(bodyId) {
  paintCrashStats(flight);
  setCrashMode("burst");
  crashT = 0;
  craft.visible = false;
  ghostLine.visible = false;
  document.exitPointerLock?.();
  clearLook();
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
  spawnBurst(wx, wy, wz, nx, ny, nz, ship.vx, ship.vy, ship.vz);
}

function restartPlay() {
  reset();
  setCrashMode("play");
  crashT = 0;
  crashEl.hidden = true;
  craft.visible = true;
  clearDebris();
  clearTrail();
  ghostLine.visible = false;
  syncPads();
}

function applyWorld(seed) {
  activeSeed = seed;
  mountWorld(worldFor(seed));
  if (splash) poseSplash();
  else restartPlay();
}

function loadSeed(raw) {
  const seed = String(raw ?? "").trim() || "classic";
  if (seed.length > 8) return false;
  inputPrefs.seed = seed;
  savePrefs();
  applyWorld(seed);
  return true;
}

const devReadout = document.querySelector("#dev-readout");
let fps = 0;

function syncDevReadout() {
  devReadout.hidden = !(inputPrefs.developer && inputPrefs.details);
}

function paintDevReadout(dt, nearest, nearestD) {
  if (devReadout.hidden) return;
  if (dt > 1e-4) fps = fps === 0 ? 1 / dt : fps + (1 / dt - fps) * 0.08;
  const speed = Math.hypot(ship.vx, ship.vy, ship.vz);
  devReadout.textContent = [
    fps.toFixed(0) + " fps",
    activeSeed,
    fmtDist(ship.x) + "  " + fmtDist(ship.y) + "  " + fmtDist(ship.z),
    fmtSpeed(ship.vx) + "  " + fmtSpeed(ship.vy) + "  " + fmtSpeed(ship.vz),
    fmtSpeed(speed),
    gLoad.toFixed(2) + " g",
    nearest.id + "  " + fmtDist(nearestD),
  ].join("\n");
}

syncDevReadout();

setUiHooks({
  restartPlay,
  poseSplash,
  loadSeed,
  applyWorld,
  syncDevReadout,
  hideGhost() {
    ghostLine.visible = false;
  },
  onLeaveSplash() {
    sawClick = true;
    reset();
    clearTrail();
    ghostLine.visible = false;
  },
  onKey(e) {
    keys.add(e.code);
    if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
  },
});
bindUi();
bindPads({
  canLook: () => !paused && crashMode === "play",
  onMenu: () => setMenu(true),
});
syncPads();

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

function paintWells(dt) {
  const near = [];
  for (const b of bodies) {
    if (!(b.well > 0)) continue;
    const d = Math.hypot(ship.x - b.x, ship.y - b.y, ship.z - b.z);
    if (d < b.well * WELL_SHOW) near.push(b);
  }
  near.sort((a, c) => {
    const da = Math.hypot(ship.x - a.x, ship.y - a.y, ship.z - a.z);
    const dc = Math.hypot(ship.x - c.x, ship.y - c.y, ship.z - c.z);
    return da - dc;
  });
  const step = 1 - Math.exp(-WELL_FADE * dt);
  for (let i = 0; i < wellPool.length; i++) {
    const mark = wellPool[i];
    const b = near[i];
    if (b && mark.userData.bodyId !== b.id) {
      mark.userData.bodyId = b.id;
      mark.userData.fade = 0;
    }
    const target = b ? 1 : 0;
    mark.userData.fade += (target - mark.userData.fade) * step;
    if (!b && mark.userData.fade < 0.02) {
      mark.userData.bodyId = null;
      mark.userData.fade = 0;
      mark.visible = false;
      continue;
    }
    mark.visible = true;
    if (b) {
      mark.position.set(b.x, b.y, b.z);
      mark.scale.setScalar(b.well);
      const s = b.sweetIn / b.well;
      mark.getObjectByName("band").scale.set(s, s, s);
      mark.getObjectByName("shellBand").scale.set(s, s, s);
    }
    const fade = mark.userData.fade;
    mark.userData.ring.opacity = WELL_RING_A * fade;
    mark.userData.band.opacity = WELL_BAND_A * fade;
    mark.userData.shell.uniforms.uGain.value = WELL_SHELL_G * fade;
    mark.userData.bandShell.uniforms.uGain.value = WELL_BAND_G * fade;
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
    nearest: { id: nearest.id, dist: nearestD, zone: passHint(ship, nearest) },
    toast,
    ship,
    orient,
    planets: radarBodies,
    danger,
    g: Math.min(1, gLoad),
    pull: { x: localPull.x, y: localPull.y },
    kick: paused || splash ? 0 : burnKick,
    spin: paused || splash ? { x: 0, y: 0, z: 0 } : spin,
    rcs: rcsLabel(),
    splash,
  });
}

// Camera turns a bit slower than the ship, so turns show the hull side-on.
// At MAX_SPIN the lag settles near MAX_SPIN / CAM_FOLLOW rad (~25 deg).
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
    plume.visible = false;
    sampleTrail(false);
    const ang = spinSplash(dt);
    const dist = 5 * KM;
    camera.position.set(
      ship.x + Math.cos(ang) * dist,
      ship.y + 1.6 * KM,
      ship.z + Math.sin(ang) * dist
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(ship.x, ship.y, ship.z);
    const near = nearestBody();
    paintHud(now, near.nearest, near.nearestD, 0);
    paintDevReadout(dt, near.nearest, near.nearestD);
    hitchSky();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
    return;
  }
  if (paused) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const near = nearestBody();
    paintHud(now, near.nearest, near.nearestD, 0);
    paintDevReadout(dt, near.nearest, near.nearestD);
    hitchSky();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
    return;
  }
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (crashMode !== "play") {
    if (crashMode === "burst") crashT += dt;
    stepDebris(dt, crashT, CRASH_BURST);
    if (crashMode === "burst") {
      if (crashT >= CRASH_BURST) {
        setCrashMode("overlay");
        showCrashUi();
        syncPads();
      }
    }
    const near = nearestBody();
    const burst = crashMode === "burst" ? Math.max(0, 1 - crashT / CRASH_BURST) : 0;
    burnKick *= Math.exp(-10 * dt);
    chaseCam(Math.max(burst, burnKick), dt);
    paintHud(now, near.nearest, near.nearestD, burst);
    paintDevReadout(dt, near.nearest, near.nearestD);
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
  const vx0 = ship.vx;
  const vy0 = ship.vy;
  const vz0 = ship.vz;
  engineArcade(ship, leanedNose.x, leanedNose.y, leanedNose.z, dt, thrust || boost, brake, boost);

  const hit = step(ship, bodies, pass, dt);
  const nearHit = nearestBody();
  noteFlight(dt, hit, nearHit.nearest, nearHit.nearestD);
  if ((thrust || boost) && !wasBurn) burnKick = boost ? 0.55 : 0.32;
  wasBurn = thrust || boost;
  if (hit.event === "crash") {
    beginCrash(hit.bodyId);
  } else if (hit.event === "boost") {
    say("Boost off " + hit.bodyId + ".");
    burnKick = Math.max(burnKick, 0.72);
  }
  burnKick *= Math.exp(-10 * dt);

  if (crashMode !== "play") {
    const near = nearestBody();
    const burst = crashMode === "burst" ? Math.max(0, 1 - crashT / CRASH_BURST) : 0;
    chaseCam(Math.max(burst, burnKick), dt);
    paintHud(now, near.nearest, near.nearestD, burst);
    paintDevReadout(dt, near.nearest, near.nearestD);
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
  gLoad = feltG(vx0, vy0, vz0, ship.vx, ship.vy, ship.vz, dt);

  craft.position.set(ship.x, ship.y, ship.z);
  const bellFwd = 0.5 - 0.5 * Math.cos(flipAng);
  plume.visible = thrust || boost || bellFwd > 0.04;
  // Wider on a brake burn so the flame shows past the heat shield, which faces the camera.
  const along = 0.35 + (boost ? 1.8 : thrust ? 1.4 : 0) + 1.7 * bellFwd;
  const wide = 1 + 1.6 * bellFwd;
  plume.scale.set(wide, along, wide);
  for (const jet of rcsJets) jet.visible = jet.userData.torque.dot(spin) > RCS_DZ;
  sampleTrail(thrust || boost || bellFwd > 0.04);
  paintWells(dt);

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
  const highG = gLoad > 0.5 ? Math.min(1, (gLoad - 0.5) / 0.5) : 0;

  chaseCam(Math.max(danger, highG, burnKick), dt);
  paintHud(now, nearest, nearestD, danger);
  paintDevReadout(dt, nearest, nearestD);

  hitchSky();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
