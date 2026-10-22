// One seed string, one system. `classic` is the hand-placed Vela layout.
// Any other seed, 8 characters max, feeds the same planet, moon, and rock loops.
import { KM } from "./physics.js";

// Graze lap ~12 s at cruise. Rocks use ROCK, not PLANET, so the belt is not moons.
const PLANET = 6;
const ROCK = 5;
// Gaps between worlds. Spawn sits wide of the first planet so it still reads huge.
const SPACE = 6;
const SEED_MAX = 8;
// Seeded names skip Rhea. Her rings in main.js are the classic system only.
const NAMES = ["Sable", "Puck", "Hale", "Quill", "Orn", "Tess", "Brin", "Cair", "Dusk", "Elm"];
const COLORS = [0x3d8bfd, 0xe0a15a, 0xc46b8a, 0x2a8f8a, 0xc9b48a, 0x7d6bff, 0xd2c07a, 0x6aa84f];

const BIG = [
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
const CLUSTERS = [
  [170, 45, 70, 9],
  [110, 135, 260, 10],
  [-250, 210, 280, 9],
  [100, -100, -140, 8],
  [-80, 80, 200, 8],
  [250, -60, -40, 8],
];
const HULKS = [
  [40, 120, -80, 2.2],
  [-200, -40, 120, 2.0],
  [280, 40, 200, 2.3],
  [-60, -160, -220, 1.9],
  [100, 200, 40, 2.1],
  [-300, 80, -100, 2.0],
  [160, -90, 250, 2.2],
];

// FNV-1a. Eight characters is the whole seed, so a 32-bit mix is enough.
function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// UTC calendar day. 2026-10-22 is 20261022.
export function dailySeed(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

// ISO week, Monday start. The year is the Thursday of that week. 2026-10-22 is 2026WW43.
export function weeklySeed(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}WW${String(week).padStart(2, "0")}`;
}

function finishBody(p, inMul, outMul) {
  p.sweetIn = p.radius * inMul;
  p.sweetOut = p.radius * outMul;
  p.well = p.sweetOut;
}

function scalePlanet(p) {
  p.x *= KM * SPACE;
  p.y *= KM * SPACE;
  p.z *= KM * SPACE;
  p.radius *= KM * PLANET;
  p.gm *= KM * KM * KM * PLANET * PLANET;
  finishBody(p, 1.25, 2.05);
}

// Wide of the first world, coasting +Z. Doing nothing misses. Steer in for the ring.
function spawnNear(p) {
  return { x: p.x - 140 * KM, y: p.y + 8 * KM, z: p.z - 420 * KM, vx: 0, vy: 0, vz: 12 * KM };
}

function build(rng) {
  const planets = [];
  const moons = [];
  const rocks = [];
  let spawn;

  // Classic keeps the modulo term. A seed replaces it with a draw in the same range.
  function n(mod, bias, classic) {
    return rng ? Math.floor(rng() * mod) - bias : classic;
  }
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
  function rockBlocked(x, y, z, radius) {
    if (Math.hypot(x - spawn.x, y - spawn.y) < 32 * KM && z < spawn.z + 90 * KM) return true;
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
  function addCluster(cx, cy, cz, count, seed) {
    for (let i = 0; i < count; i++) {
      const j = seed + i;
      addRock(
        cx + n(11, 5, ((j * 13) % 11) - 5) * 4 * KM * SPACE,
        cy + n(9, 4, ((j * 7) % 9) - 4) * 3 * KM * SPACE,
        cz + n(11, 5, ((j * 17) % 11) - 5) * 4 * KM * SPACE,
        (1.2 + n(4, 0, i % 4) * 0.35) * KM * ROCK,
        j
      );
    }
  }

  if (!rng) {
    planets.push(
      { id: "Vela", x: 0, y: 0, z: 0, radius: 12, gm: 1100, color: 0x3d8bfd },
      { id: "Kor", x: 340, y: 90, z: 140, radius: 8, gm: 520, color: 0xe0a15a },
      { id: "Mira", x: -120, y: 180, z: 380, radius: 16, gm: 1700, color: 0xc46b8a },
      { id: "Nox", x: 200, y: -200, z: -280, radius: 5, gm: 180, color: 0x2a8f8a },
      { id: "Rhea", x: -380, y: 240, z: 180, radius: 22, gm: 2400, color: 0xc9b48a }
    );
  } else {
    const pool = NAMES.slice();
    for (let i = 0; i < 5; i++) {
      const radius = 5 + rng() * 17;
      const gm = 80 + rng() * 2320;
      const color = COLORS[Math.floor(rng() * COLORS.length)];
      const id = pool.splice(Math.floor(rng() * pool.length), 1)[0];
      let x = 0;
      let y = 0;
      let z = 0;
      let clear = false;
      for (let guard = 0; guard < 64 && !clear; guard++) {
        const span = 360 + guard * 40;
        x = (rng() * 2 - 1) * span;
        y = (rng() * 2 - 1) * span * 0.5;
        z = (rng() * 2 - 1) * span;
        clear = planets.every((p) => Math.hypot(x - p.x, y - p.y, z - p.z) > (radius + p.radius) * 2.05 + 8);
      }
      // Packed box: step past the furthest world on +X. Wells stay apart.
      if (!clear) {
        x = radius * 2.05 + 8;
        y = 0;
        z = 0;
        for (const p of planets) x = Math.max(x, p.x + (radius + p.radius) * 2.05 + 8);
      }
      planets.push({ id, x, y, z, radius, gm, color });
    }
  }
  for (const p of planets) scalePlanet(p);
  spawn = spawnNear(planets[0]);

  if (!rng) {
    addMoon("Vela-1", planets[0], 42, 26, 16, 2.4, 36, 0xa8b8c8);
    addMoon("Vela-2", planets[0], -38, 22, -20, 1.8, 22, 0xb0a090);
    addMoon("Mira-1", planets[2], -50, 34, 12, 3.2, 70, 0xd9c4a0);
    addMoon("Rhea-1", planets[4], 62, -30, 22, 4.1, 95, 0x8aa0b0);
  } else {
    for (let i = 0; i < 4; i++) {
      const parent = planets[Math.floor(rng() * planets.length)];
      const radius = 1.6 + rng() * 2.6;
      const gm = 18 + rng() * 80;
      const color = COLORS[Math.floor(rng() * COLORS.length)];
      const pr = parent.radius / (KM * PLANET);
      let ox = 0;
      let oy = 0;
      let oz = 0;
      for (let guard = 0; guard < 12; guard++) {
        const reach = pr * 2.05 + radius * 2.05 + 16 + guard * 18 + rng() * 24;
        const yaw = rng() * Math.PI * 2;
        const elev = (rng() * 2 - 1) * 0.55;
        const c = Math.cos(elev);
        ox = Math.cos(yaw) * c * reach;
        oy = Math.sin(elev) * reach;
        oz = Math.sin(yaw) * c * reach;
        const mx = parent.x + ox * KM * PLANET;
        const my = parent.y + oy * KM * PLANET;
        const mz = parent.z + oz * KM * PLANET;
        const hit = planets.concat(moons).some((b) => Math.hypot(mx - b.x, my - b.y, mz - b.z) < b.well + radius * KM * PLANET * 1.9);
        if (!hit) break;
      }
      addMoon(`${parent.id}-${i + 1}`, parent, ox, oy, oz, radius, gm, color);
    }
  }

  for (let i = 0; i < 140; i++) {
    const a = (i / 140) * Math.PI * 2 + (rng ? rng() * Math.PI * 2 : (i % 5) * 0.07);
    const rad = (170 + n(11, 5, ((i * 17) % 11) - 5) * 4) * KM * SPACE;
    addRock(Math.cos(a) * rad, n(7, 3, (i % 7) - 3) * 12 * KM * SPACE, Math.sin(a) * rad, (0.7 + n(5, 0, i % 5) * 0.2) * KM * ROCK, i);
  }
  for (let a = 0; a < planets.length; a++) {
    for (let b = a + 1; b < planets.length; b++) {
      const pa = planets[a];
      const pb = planets[b];
      for (let k = 1; k <= 13; k++) {
        const t = k / 14;
        const j = a * 40 + b * 11 + k;
        addRock(
          pa.x + (pb.x - pa.x) * t + n(17, 8, ((j * 13) % 17) - 8) * 6 * KM * SPACE,
          pa.y + (pb.y - pa.y) * t + n(9, 4, ((j * 5) % 9) - 4) * 8 * KM * SPACE,
          pa.z + (pb.z - pa.z) * t + n(15, 7, ((j * 7) % 15) - 7) * 6 * KM * SPACE,
          (0.8 + n(4, 0, k % 4) * 0.25) * KM * ROCK,
          j
        );
      }
    }
  }
  for (let i = 0; i < 70; i++) {
    addRock(
      n(61, 30, ((i * 37) % 61) - 30) * 14 * KM * SPACE,
      n(13, 6, ((i * 11) % 13) - 6) * 14 * KM * SPACE,
      n(59, 29, ((i * 19) % 59) - 29) * 14 * KM * SPACE,
      (0.9 + n(6, 0, i % 6) * 0.2) * KM * ROCK,
      i + 200
    );
  }
  for (let i = 0; i < BIG.length; i++) {
    const r = BIG[i];
    if (rng) addRock((rng() * 2 - 1) * 280 * KM * SPACE, (rng() * 2 - 1) * 200 * KM * SPACE, (rng() * 2 - 1) * 310 * KM * SPACE, (2.8 + rng() * 1.2) * KM * ROCK, i + 80);
    else addRock(r[0] * KM * SPACE, r[1] * KM * SPACE, r[2] * KM * SPACE, r[3] * KM * ROCK, i + 80);
  }
  for (let c = 0; c < CLUSTERS.length; c++) {
    const row = CLUSTERS[c];
    const at = rng ? [(rng() * 2 - 1) * 250, (rng() * 2 - 1) * 210, (rng() * 2 - 1) * 280] : row;
    addCluster(at[0] * KM * SPACE, at[1] * KM * SPACE, at[2] * KM * SPACE, row[3], 400 + c * 20);
  }
  for (let i = 0; i < HULKS.length; i++) {
    const r = HULKS[i];
    if (rng) addRock((rng() * 2 - 1) * 300 * KM * SPACE, (rng() * 2 - 1) * 200 * KM * SPACE, (rng() * 2 - 1) * 250 * KM * SPACE, (1.9 + rng() * 0.4) * KM * PLANET, i + 600, 3);
    else addRock(r[0] * KM * SPACE, r[1] * KM * SPACE, r[2] * KM * SPACE, r[3] * KM * PLANET, i + 600, 3);
  }

  return {
    planets,
    moons,
    rocks,
    bodies: planets.concat(moons, rocks),
    radarBodies: planets.concat(moons),
    SPAWN: spawn,
  };
}

export function layout(seed) {
  if (typeof seed !== "string" || seed.length > SEED_MAX) throw new Error("seed");
  return build(seed === "classic" ? null : mulberry32(hash32(seed)));
}

const boot = layout("classic");
export const SPAWN = boot.SPAWN;
export const planets = boot.planets;
export const moons = boot.moons;
export const rocks = boot.rocks;
export const bodies = boot.bodies;
export const radarBodies = boot.radarBodies;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function stamp(w) {
  const bits = [w.SPAWN.x, w.SPAWN.y, w.SPAWN.z, w.SPAWN.vz];
  for (const list of [w.planets, w.moons, w.rocks]) {
    for (const b of list) bits.push(b.id, b.x, b.y, b.z, b.radius);
  }
  return bits.join(",");
}

function wellsApart(list) {
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const p = list[i];
      const q = list[j];
      if (Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) <= p.well + q.well) return false;
    }
  }
  return true;
}

export function selfCheck() {
  const a = layout("classic");
  const b = layout("classic");
  assert(a.planets[0].id === "Vela" && a.planets[0].x === 0 && a.planets[0].y === 0 && a.planets[0].z === 0, "vela");
  assert(a.SPAWN.x === -140 * KM && a.SPAWN.y === 8 * KM && a.SPAWN.z === -420 * KM && a.SPAWN.vz === 12 * KM && a.SPAWN.vx === 0 && a.SPAWN.vy === 0, "spawn");
  assert(a.planets[4].id === "Rhea" && a.planets[4].x === -380 * KM * SPACE, "rhea");
  assert(a.moons.length === 4 && a.moons[0].id === "Vela-1" && a.moons[0].x === 42 * KM * PLANET, "vela moon");
  assert(a.rocks.length === 405 && a.rocks[0].x === 150 * KM * SPACE && a.rocks[0].radius === 0.7 * KM * ROCK, "classic rocks");
  assert(stamp(a) === stamp(b), "classic stable");

  const day = new Date(Date.UTC(2026, 9, 22, 23, 0));
  assert(dailySeed(day) === "20261022" && dailySeed(day).length === 8, "daily");
  assert(weeklySeed(day) === "2026WW43" && weeklySeed(day).length === 8, "weekly");
  assert(weeklySeed(new Date(Date.UTC(2021, 0, 1))) === "2020WW53", "iso year");

  const s1 = layout("20261022");
  const s2 = layout("20261022");
  assert(stamp(s1) === stamp(s2), "seed stable");
  assert(s1.planets.length === 5 && s1.moons.length === 4, "counts");
  assert(s1.planets[0].x !== 0 || s1.planets[1].x !== a.planets[1].x, "seed moves");
  assert(s1.planets.every((p) => p.id !== "Rhea"), "no rhea");
  const week = layout("2026WW43");
  assert(stamp(week) === stamp(layout("2026WW43")), "week stable");
  for (const w of [s1, week]) {
    assert(wellsApart(w.planets), "wells");
    for (const m of w.moons) {
      const parent = w.planets.find((p) => m.id.startsWith(p.id + "-"));
      const gap = Math.hypot(m.x - parent.x, m.y - parent.y, m.z - parent.z);
      assert(parent && gap > parent.well + m.radius, "moon outside");
    }
  }

  let threw = false;
  try {
    layout("123456789");
  } catch {
    threw = true;
  }
  assert(threw, "long seed");
}

if (typeof process !== "undefined" && process.argv[1]?.endsWith("world.js")) {
  selfCheck();
}
