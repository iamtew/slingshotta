// One seed, one layout, one gate chain. Graze in order. Score is time plus off-ribbon.
import { CRUISE } from "./physics.js";
import { bodies, moons, planets, rocks, SPAWN, spawnNear } from "./world.js";

const BEST = "slingshotta-race";

function dist3(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function pointSegDist(px, py, pz, ax, ay, az, bx, by, bz) {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const ab2 = abx * abx + aby * aby + abz * abz;
  let t = ab2 < 1e-12 ? 0 : (apx * abx + apy * aby + apz * abz) / ab2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return Math.hypot(px - (ax + t * abx), py - (ay + t * aby), pz - (az + t * abz));
}

// Consecutive wells must sit apart, and the hop must not bore through a body.
export function hopClear(a, b, bodies) {
  if (dist3(a, b) <= a.well + b.well) return false;
  const minx = Math.min(a.x, b.x);
  const maxx = Math.max(a.x, b.x);
  const miny = Math.min(a.y, b.y);
  const maxy = Math.max(a.y, b.y);
  const minz = Math.min(a.z, b.z);
  const maxz = Math.max(a.z, b.z);
  for (const c of bodies) {
    if (c.id === a.id || c.id === b.id) continue;
    const r = c.radius;
    if (c.x + r < minx || c.x - r > maxx || c.y + r < miny || c.y - r > maxy || c.z + r < minz || c.z - r > maxz) continue;
    if (pointSegDist(c.x, c.y, c.z, a.x, a.y, a.z, b.x, b.y, b.z) < r) return false;
  }
  return true;
}

function isGateBody(b) {
  if (!(b.well > 0)) return false;
  if (b.asteroid) return true;
  return b.kind == null;
}

function rotAxis(x, y, z, ax, ay, az, ang) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const d = ax * x + ay * y + az * z;
  return {
    x: x * c + (ay * z - az * y) * s + ax * d * (1 - c),
    y: y * c + (az * x - ax * z) * s + ay * d * (1 - c),
    z: z * c + (ax * y - ay * x) * s + az * d * (1 - c),
  };
}

// Sideways graze on the outside of the turn. Tangent hops, not aimed at the core.
export function wrapArc(prev, body, next, steps) {
  const r = body.sweetOut;
  let ix = body.x - prev.x;
  let iy = body.y - prev.y;
  let iz = body.z - prev.z;
  const il = Math.hypot(ix, iy, iz) || 1;
  ix /= il;
  iy /= il;
  iz /= il;
  let ox = next.x - body.x;
  let oy = next.y - body.y;
  let oz = next.z - body.z;
  const ol = Math.hypot(ox, oy, oz) || 1;
  ox /= ol;
  oy /= ol;
  oz /= ol;
  let nx = iy * oz - iz * oy;
  let ny = iz * ox - ix * oz;
  let nz = ix * oy - iy * ox;
  let nl = Math.hypot(nx, ny, nz);
  if (nl < 1e-6) {
    nx = iz;
    ny = 0;
    nz = -ix;
    nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-6) {
      nx = 1;
      ny = 0;
      nz = 0;
      nl = 1;
    }
  }
  nx /= nl;
  ny /= nl;
  nz /= nl;
  let ux = iy * nz - iz * ny;
  let uy = iz * nx - ix * nz;
  let uz = ix * ny - iy * nx;
  let ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul;
  uy /= ul;
  uz /= ul;
  let vx = oy * nz - oz * ny;
  let vy = oz * nx - ox * nz;
  let vz = ox * ny - oy * nx;
  let vl = Math.hypot(vx, vy, vz) || 1;
  vx /= vl;
  vy /= vl;
  vz /= vl;
  let ax = uy * vz - uz * vy;
  let ay = uz * vx - ux * vz;
  let az = ux * vy - uy * vx;
  let al = Math.hypot(ax, ay, az);
  let ang = Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy + uz * vz)));
  if (al < 1e-6) {
    if (ux * vx + uy * vy + uz * vz > 0) {
      return [{ x: body.x + ux * r, y: body.y + uy * r, z: body.z + uz * r }];
    }
    ax = nx;
    ay = ny;
    az = nz;
    al = 1;
    ang = Math.PI;
  }
  ax /= al;
  ay /= al;
  az /= al;
  const n = Math.max(4, steps | 0);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const q = rotAxis(ux, uy, uz, ax, ay, az, (i / n) * ang);
    pts.push({ x: body.x + q.x * r, y: body.y + q.y * r, z: body.z + q.z * r });
  }
  return pts;
}

export function ribbonWaypoints(c) {
  const pts = [{ x: c.spawn.x, y: c.spawn.y, z: c.spawn.z }];
  const g = c.gates;
  for (let i = 0; i < g.length; i++) {
    const prev = i === 0 ? c.spawn : g[i - 1];
    const cur = g[i];
    const next =
      i === g.length - 1
        ? { x: cur.x * 2 - prev.x, y: cur.y * 2 - prev.y, z: cur.z * 2 - prev.z }
        : g[i + 1];
    const arc = wrapArc(prev, cur, next, 8);
    for (const p of arc) pts.push(p);
  }
  return pts;
}

export function nudgeOffBodies(p, bodies) {
  let x = p.x;
  let y = p.y;
  let z = p.z;
  for (const b of bodies) {
    const dx = x - b.x;
    const dy = y - b.y;
    const dz = z - b.z;
    const d = Math.hypot(dx, dy, dz);
    const min = b.radius * 1.15;
    if (d < min) {
      if (d < 1e-8) {
        y = b.y + min;
      } else {
        const s = min / d;
        x = b.x + dx * s;
        y = b.y + dy * s;
        z = b.z + dz * s;
      }
    }
  }
  return { x, y, z };
}

export function course(world) {
  const first = world.planets[0];
  const gates = [first];
  const used = new Set([first.id]);
  const pool = world.bodies.filter(isGateBody);
  const bodies = world.bodies;
  while (true) {
    const cur = gates[gates.length - 1];
    let best = null;
    let bestD = Infinity;
    let bestI = pool.length;
    for (let i = 0; i < pool.length; i++) {
      const b = pool[i];
      if (used.has(b.id)) continue;
      if (!hopClear(cur, b, bodies)) continue;
      const d = dist3(cur, b);
      if (d < bestD || (d === bestD && i < bestI)) {
        best = b;
        bestD = d;
        bestI = i;
      }
    }
    if (!best) break;
    gates.push(best);
    used.add(best.id);
  }
  return { gates, spawn: spawnNear(first) };
}

export function raceScore(t, ribbon) {
  return t + ribbon / CRUISE;
}

export function ribbonMean(sum, n) {
  return n > 0 ? sum / n : 0;
}

function stamp(c) {
  return c.gates.map((g) => g.id).join(",");
}

export function readBest(seed) {
  if (typeof localStorage === "undefined") return null;
  try {
    const row = JSON.parse(localStorage.getItem(BEST) || "{}")[seed];
    if (!row || !(row.t > 0) || !(row.score > 0)) return null;
    return row;
  } catch {
    return null;
  }
}

export function recordBest(seed, run) {
  const prev = readBest(seed);
  const better = !prev || run.score < prev.score;
  if (better && typeof localStorage !== "undefined") {
    try {
      const all = JSON.parse(localStorage.getItem(BEST) || "{}");
      all[seed] = { t: run.t, ribbon: run.ribbon, vmax: run.vmax, score: run.score };
      localStorage.setItem(BEST, JSON.stringify(all));
    } catch {
      /* private mode */
    }
  }
  return better ? run : prev;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function selfCheck() {
  const a = { planets, moons, rocks, bodies, SPAWN };
  const c1 = course(a);
  const c2 = course(a);
  assert(stamp(c1) === stamp(c2) && c1.gates.length > 1, "classic stable");
  assert(c1.gates[0].id === "Vela", "first vela");
  assert(
    c1.gates.some((g) => g.moon) && c1.gates.some((g) => g.asteroid) && c1.gates.every((g) => g.kind == null || g.asteroid),
    "planets moons asteroids"
  );
  const way = ribbonWaypoints(c1);
  assert(way.length > c1.gates.length + 1, "waypoints");
  const shell = {
    x: 0,
    y: 0,
    z: 0,
    radius: 3,
    sweetOut: 5,
  };
  const around = wrapArc({ x: -20, y: 10, z: 0 }, shell, { x: -20, y: -10, z: 0 }, 8);
  assert(
    around.every((p) => Math.abs(dist3(p, shell) - 5) < 1e-6 && dist3(p, shell) > 3),
    "arc on shell"
  );
  assert(around.every((p) => p.x > -0.01), "outside flyby");
  const buried = nudgeOffBodies({ x: c1.gates[0].x, y: c1.gates[0].y, z: c1.gates[0].z }, [c1.gates[0]]);
  assert(dist3(buried, c1.gates[0]) >= c1.gates[0].radius * 1.14, "nudge");
  const hopA = wrapArc(c1.spawn, c1.gates[0], c1.gates[1], 6);
  const hopB = wrapArc(c1.gates[0], c1.gates[1], c1.gates[2] || c1.gates[0], 6);
  const mid = {
    x: (hopA[hopA.length - 1].x + hopB[0].x) * 0.5,
    y: (hopA[hopA.length - 1].y + hopB[0].y) * 0.5,
    z: (hopA[hopA.length - 1].z + hopB[0].z) * 0.5,
  };
  const chord = pointSegDist(mid.x, mid.y, mid.z, hopA[hopA.length - 1].x, hopA[hopA.length - 1].y, hopA[hopA.length - 1].z, hopB[0].x, hopB[0].y, hopB[0].z);
  assert(chord < 1, "straight hop");
  for (let i = 1; i < c1.gates.length; i++) {
    assert(hopClear(c1.gates[i - 1], c1.gates[i], a.bodies), "classic hop");
  }
  const sp = c1.spawn;
  assert(dist3(sp, c1.gates[0]) > c1.gates[0].well, "spawn outside");

  const close = { id: "a", x: 0, y: 0, z: 0, well: 10, radius: 2 };
  const other = { id: "b", x: 5, y: 0, z: 0, well: 10, radius: 2 };
  assert(!hopClear(close, other, []), "overlap");

  const left = { id: "l", x: 0, y: 0, z: 0, well: 2, radius: 1 };
  const right = { id: "r", x: 100, y: 0, z: 0, well: 2, radius: 1 };
  const plug = { id: "p", x: 50, y: 0, z: 0, well: 2, radius: 5 };
  assert(hopClear(left, right, [left, right]), "open hop");
  assert(!hopClear(left, right, [left, right, plug]), "bored hop");

  assert(pointSegDist(5, 0, 0, 0, 0, 0, 10, 0, 0) < 1e-9, "on ribbon");
  assert(Math.abs(pointSegDist(5, 3, 0, 0, 0, 0, 10, 0, 0) - 3) < 1e-9, "off ribbon");
  assert(Math.abs(raceScore(10, CRUISE) - 11) < 1e-9, "score");
  assert(ribbonMean(0, 0) === 0 && Math.abs(ribbonMean(CRUISE, 1) - CRUISE) < 1e-9, "mean");
}

if (typeof process !== "undefined" && process.argv[1]?.endsWith("race.js")) {
  selfCheck();
}
