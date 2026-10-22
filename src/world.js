// Hand-placed Vela system. Seeded layouts later replace this file, not the loop.
import { KM } from "./physics.js";

// Graze lap ~12 s at cruise. Rocks stay unscaled so the belt is not moons.
const PLANET = 4;
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
addMoon("Vela-1", planets[0], 22, 4, 8, 2.4, 36, 0xa8b8c8);
addMoon("Mira-1", planets[2], -26, 7, 5, 3.2, 70, 0xd9c4a0);
addMoon("Rhea-1", planets[4], 34, -5, 12, 4.1, 95, 0x8aa0b0);

export const rocks = [];
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

export const bodies = planets.concat(moons, rocks);
export const radarBodies = planets.concat(moons);
