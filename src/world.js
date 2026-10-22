// Hand-placed Vela system. Seeded layouts later replace this file, not the loop.
import { KM } from "./physics.js";

// Graze lap ~12 s at cruise. Rocks use ROCK, not PLANET, so the belt is not moons.
const PLANET = 6;
const ROCK = 5;
// Gaps between worlds. Spawn stays by Vela so the first planet still reads huge.
const SPACE = 6;
// Wide of Vela, coasting +Z. Doing nothing misses. Steer in for the ring.
export const SPAWN = { x: -140 * KM, y: 8 * KM, z: -420 * KM, vx: 0, vy: 0, vz: 12 * KM };

function finishBody(p, inMul, outMul) {
  p.sweetIn = p.radius * inMul;
  p.sweetOut = p.radius * outMul;
  p.well = p.sweetOut;
}

export const planets = [
  { id: "Vela", x: 0, y: 0, z: 0, radius: 12, gm: 1100, color: 0x3d8bfd },
  { id: "Kor", x: 340, y: 90, z: 140, radius: 8, gm: 520, color: 0xe0a15a },
  { id: "Mira", x: -120, y: 180, z: 380, radius: 16, gm: 1700, color: 0xc46b8a },
  { id: "Nox", x: 200, y: -200, z: -280, radius: 5, gm: 180, color: 0x2a8f8a },
  { id: "Rhea", x: -380, y: 240, z: 180, radius: 22, gm: 2400, color: 0xc9b48a },
];

for (const p of planets) {
  p.x *= KM * SPACE;
  p.y *= KM * SPACE;
  p.z *= KM * SPACE;
  p.radius *= KM * PLANET;
  p.gm *= KM * KM * KM * PLANET * PLANET;
  finishBody(p, 1.25, 2.05);
}

export const moons = [];
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
addMoon("Vela-1", planets[0], 42, 26, 16, 2.4, 36, 0xa8b8c8);
addMoon("Vela-2", planets[0], -38, 22, -20, 1.8, 22, 0xb0a090);
addMoon("Mira-1", planets[2], -50, 34, 12, 3.2, 70, 0xd9c4a0);
addMoon("Rhea-1", planets[4], 62, -30, 22, 4.1, 95, 0x8aa0b0);

export const rocks = [];
function rockBlocked(x, y, z, radius) {
  if (Math.hypot(x - SPAWN.x, y - SPAWN.y) < 32 * KM && z < SPAWN.z + 90 * KM) return true;
  for (const p of planets) {
    if (Math.hypot(x - p.x, y - p.y, z - p.z) < p.radius * 2.5 + radius) return true;
  }
  for (const m of moons) {
    if (Math.hypot(x - m.x, y - m.y, z - m.z) < m.radius * 2.5 + radius) return true;
  }
  return false;
}
function addRock(x, y, z, radius, i, kind) {
  if (rockBlocked(x, y, z, radius)) return;
  const rock = {
    id: "rock" + rocks.length,
    x,
    y,
    z,
    radius,
    gm: 0.64 * Math.pow(radius / KM, 3) * KM * KM * KM,
    kind: kind ?? i % 3,
    sx: 0.7 + ((i * 3) % 5) * 0.12,
    sy: 0.55 + ((i * 5) % 7) * 0.1,
    sz: 0.65 + ((i * 2) % 4) * 0.14,
    rx: i * 0.7,
    ry: i * 1.1,
    rz: i * 0.4,
  };
  finishBody(rock, 1.25, 2.0);
  rocks.push(rock);
}
function addCluster(cx, cy, cz, n, seed) {
  for (let i = 0; i < n; i++) {
    const j = seed + i;
    addRock(
      cx + (((j * 13) % 11) - 5) * 4 * KM * SPACE,
      cy + (((j * 7) % 9) - 4) * 3 * KM * SPACE,
      cz + (((j * 17) % 11) - 5) * 4 * KM * SPACE,
      (1.2 + (i % 4) * 0.35) * KM * ROCK,
      j
    );
  }
}
for (let i = 0; i < 140; i++) {
  const a = (i / 140) * Math.PI * 2 + (i % 5) * 0.07;
  const rad = (170 + (((i * 17) % 11) - 5) * 4) * KM * SPACE;
  addRock(Math.cos(a) * rad, ((i % 7) - 3) * 12 * KM * SPACE, Math.sin(a) * rad, (0.7 + (i % 5) * 0.2) * KM * ROCK, i);
}
for (let a = 0; a < planets.length; a++) {
  for (let b = a + 1; b < planets.length; b++) {
    const pa = planets[a];
    const pb = planets[b];
    for (let k = 1; k <= 13; k++) {
      const t = k / 14;
      const j = a * 40 + b * 11 + k;
      addRock(
        pa.x + (pb.x - pa.x) * t + (((j * 13) % 17) - 8) * 6 * KM * SPACE,
        pa.y + (pb.y - pa.y) * t + (((j * 5) % 9) - 4) * 8 * KM * SPACE,
        pa.z + (pb.z - pa.z) * t + (((j * 7) % 15) - 7) * 6 * KM * SPACE,
        (0.8 + (k % 4) * 0.25) * KM * ROCK,
        j
      );
    }
  }
}
for (let i = 0; i < 70; i++) {
  addRock(
    (((i * 37) % 61) - 30) * 14 * KM * SPACE,
    (((i * 11) % 13) - 6) * 14 * KM * SPACE,
    (((i * 19) % 59) - 29) * 14 * KM * SPACE,
    (0.9 + (i % 6) * 0.2) * KM * ROCK,
    i + 200
  );
}
const bigRocks = [
  [90, -90, -170, 3.6],
  [-150, 110, 70, 3.2],
  [210, 70, 90, 3.8],
  [-40, -140, 220, 2.9],
  [60, 160, 310, 3.4],
  [-240, -80, -40, 3.3],
  [130, -180, -90, 4.0],
  [-90, 95, -200, 2.8],
  [170, 50, 60, 3.7],
  [80, -110, -80, 3.2],
  [-250, 200, 280, 3.5],
  [20, 70, -250, 3.0],
  [-180, -150, 40, 3.6],
];
bigRocks.forEach((r, i) => addRock(r[0] * KM * SPACE, r[1] * KM * SPACE, r[2] * KM * SPACE, r[3] * KM * ROCK, i + 80));
// Tight packs in the gaps, not on spawn.
addCluster(170 * KM * SPACE, 45 * KM * SPACE, 70 * KM * SPACE, 9, 400);
addCluster(110 * KM * SPACE, 135 * KM * SPACE, 260 * KM * SPACE, 10, 420);
addCluster(-250 * KM * SPACE, 210 * KM * SPACE, 280 * KM * SPACE, 9, 440);
addCluster(100 * KM * SPACE, -100 * KM * SPACE, -140 * KM * SPACE, 8, 460);
addCluster(-80 * KM * SPACE, 80 * KM * SPACE, 200 * KM * SPACE, 8, 480);
addCluster(250 * KM * SPACE, -60 * KM * SPACE, -40 * KM * SPACE, 8, 500);
// Kind 3: potato moons. Radius uses PLANET so they sit next to real moons.
const hulks = [
  [40, 120, -80, 2.2],
  [-200, -40, 120, 2.0],
  [280, 40, 200, 2.3],
  [-60, -160, -220, 1.9],
  [100, 200, 40, 2.1],
  [-300, 80, -100, 2.0],
  [160, -90, 250, 2.2],
];
hulks.forEach((r, i) => addRock(r[0] * KM * SPACE, r[1] * KM * SPACE, r[2] * KM * SPACE, r[3] * KM * PLANET, i + 600, 3));

export const bodies = planets.concat(moons, rocks);
export const radarBodies = planets.concat(moons);
