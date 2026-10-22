// Gravity step. Outcomes live here so the renderer cannot drift them.
// ponytail: one global pass-flag set per body, fine while body count stays small.

const BOOST = 1.4;
// At the closest point, below this counts as a sideways graze.
const GRAZE = 0.45;
const MAX_DT = 1 / 90;
// World units are metres. 500 keeps the old arcade clock (Vela radius 12 → 6000 m).
export const KM = 500;
const MAIN = 26 * KM;
const BRAKE = 32 * KM;
const CRUISE = 40 * KM;
const BOOST_MULT = 1.8;
const ALIGN_SPACE = 2;
const ALIGN_WELL = 0.35;
const SLING = 2.2;
// Extra 1/r on top of Newtonian. Surface pull is (1+CLOSE)×, far coast barely moves.
const CLOSE = 10;
// Arcade G: |perp Δv/dt| / FELT. A hard Vela inner-band graze sits near 1.
export const FELT = 48 * KM;

function gravityScale(gm, radius, r) {
  return (gm / (r * r * r)) * (1 + (CLOSE * radius) / r);
}

export function createPass() {
  return {
    boosted: new Set(),
    prevRad: new Map(),
  };
}

function hypot3(x, y, z) {
  return Math.hypot(x, y, z);
}

// Sideways change in velocity, not SI gees. Along-track thrust/brake/boost drop out.
export function feltG(vx0, vy0, vz0, vx1, vy1, vz1, dt) {
  if (!(dt > 1e-8)) return 0;
  const dvx = vx1 - vx0;
  const dvy = vy1 - vy0;
  const dvz = vz1 - vz0;
  const sp = hypot3(vx0, vy0, vz0);
  let perp;
  if (sp < 1e-8) {
    perp = hypot3(dvx, dvy, dvz);
  } else {
    const along = (dvx * vx0 + dvy * vy0 + dvz * vz0) / sp;
    const px = dvx - (along * vx0) / sp;
    const py = dvy - (along * vy0) / sp;
    const pz = dvz - (along * vz0) / sp;
    perp = hypot3(px, py, pz);
  }
  return perp / dt / FELT;
}

// One small slice. Mutates ship and pass. Crash returns before later bodies.
function substep(ship, bodies, pass, dt) {
  let ax = 0;
  let ay = 0;
  let az = 0;

  for (const b of bodies) {
    const dx = ship.x - b.x;
    const dy = ship.y - b.y;
    const dz = ship.z - b.z;
    const r = hypot3(dx, dy, dz);
    if (r < b.radius) return { event: "crash", bodyId: b.id };
    if (b.gm > 0 && r > 1e-4) {
      const scale = gravityScale(b.gm, b.radius, r);
      ax -= dx * scale;
      ay -= dy * scale;
      az -= dz * scale;
    }
  }

  ship.vx += ax * dt;
  ship.vy += ay * dt;
  ship.vz += az * dt;
  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;
  ship.z += ship.vz * dt;

  let event = null;
  let bodyId = null;

  for (const b of bodies) {
    // Recompute after the move. The pre-move r is only for gravity.
    const nx = ship.x - b.x;
    const ny = ship.y - b.y;
    const nz = ship.z - b.z;
    const nr = hypot3(nx, ny, nz);
    if (nr < b.radius) return { event: "crash", bodyId: b.id };

    const inWell = b.well > 0 && nr < b.well;
    if (!inWell) {
      pass.boosted.delete(b.id);
      pass.prevRad.delete(b.id);
      continue;
    }

    const speed = hypot3(ship.vx, ship.vy, ship.vz);
    if (speed < 1e-4) continue;
    const ux = nx / nr;
    const uy = ny / nr;
    const uz = nz / nr;
    // Positive radial speed is leaving the body.
    const vrad = ship.vx * ux + ship.vy * uy + ship.vz * uz;
    const radialFrac = Math.abs(vrad) / speed;
    const prev = pass.prevRad.has(b.id) ? pass.prevRad.get(b.id) : vrad;
    const peri = prev < 0 && vrad >= 0;
    pass.prevRad.set(b.id, vrad);

    const grazing =
      peri &&
      !pass.boosted.has(b.id) &&
      nr >= b.sweetIn &&
      nr <= b.sweetOut &&
      radialFrac < GRAZE;
    if (grazing) {
      ship.vx *= BOOST;
      ship.vy *= BOOST;
      ship.vz *= BOOST;
      pass.boosted.add(b.id);
      pass.prevRad.set(b.id, vrad * BOOST);
      event = "boost";
      bodyId = b.id;
    }
  }

  return { event, bodyId };
}

export function step(ship, bodies, pass, dt) {
  let left = dt;
  let event = null;
  let bodyId = null;
  while (left > 1e-8) {
    const h = Math.min(MAX_DT, left);
    const hit = substep(ship, bodies, pass, h);
    if (hit.event === "crash") return hit;
    if (hit.event) {
      event = hit.event;
      bodyId = hit.bodyId;
    }
    left -= h;
  }
  return { event, bodyId };
}

// Arcade: W adds along the nose under cruise, S kills speed, path weathervanes to the nose.
export function engineArcade(ship, nx, ny, nz, dt, thrust, brake, boost) {
  const cruise = boost ? CRUISE * BOOST_MULT : CRUISE;
  const force = boost ? MAIN * BOOST_MULT : MAIN;
  const speed0 = hypot3(ship.vx, ship.vy, ship.vz);
  if (thrust && speed0 < cruise) {
    ship.vx += nx * force * dt;
    ship.vy += ny * force * dt;
    ship.vz += nz * force * dt;
    const speed1 = hypot3(ship.vx, ship.vy, ship.vz);
    if (speed1 > cruise) {
      const s = cruise / speed1;
      ship.vx *= s;
      ship.vy *= s;
      ship.vz *= s;
    }
  }
  if (brake) {
    const speed = hypot3(ship.vx, ship.vy, ship.vz);
    const drop = BRAKE * dt;
    if (speed <= drop) {
      ship.vx = 0;
      ship.vy = 0;
      ship.vz = 0;
    } else {
      const s = (speed - drop) / speed;
      ship.vx *= s;
      ship.vy *= s;
      ship.vz *= s;
    }
  }
}

// Ballistic ghost. Copies the ship, gravity only, no crash/boost/thrust.
export function ghostPath(ship, bodies, dt, n, out) {
  let x = ship.x;
  let y = ship.y;
  let z = ship.z;
  let vx = ship.vx;
  let vy = ship.vy;
  let vz = ship.vz;
  out[0] = x;
  out[1] = y;
  out[2] = z;
  for (let i = 1; i < n; i++) {
    let ax = 0;
    let ay = 0;
    let az = 0;
    for (const b of bodies) {
      if (!(b.gm > 0)) continue;
      const dx = x - b.x;
      const dy = y - b.y;
      const dz = z - b.z;
      const r = hypot3(dx, dy, dz);
      if (r < 1e-4) continue;
      const scale = gravityScale(b.gm, b.radius, r);
      ax -= dx * scale;
      ay -= dy * scale;
      az -= dz * scale;
    }
    vx += ax * dt;
    vy += ay * dt;
    vz += az * dt;
    x += vx * dt;
    y += vy * dt;
    z += vz * dt;
    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;
  }
}

// Nose tips toward a pull. depth 0 leaves it. depth 1 blends 0.45 of the way, about 25° sideways.
// Mix the nose toward current velocity so a well's bend is not aligned away on exit.
export function slingNose(nx, ny, nz, vx, vy, vz, mix) {
  const a = Math.max(0, Math.min(1, mix));
  const sp = hypot3(vx, vy, vz);
  if (a < 1e-8 || sp < 1e-8) return { x: nx, y: ny, z: nz };
  const x = nx * (1 - a) + (vx / sp) * a;
  const y = ny * (1 - a) + (vy / sp) * a;
  const z = nz * (1 - a) + (vz / sp) * a;
  const n = hypot3(x, y, z);
  if (n < 1e-8) return { x: nx, y: ny, z: nz };
  return { x: x / n, y: y / n, z: z / n };
}

export function slingMix(depth, dt) {
  return 1 - Math.exp(-SLING * Math.max(0, depth) * dt);
}

export function leanNose(nx, ny, nz, px, py, pz, depth) {
  const a = 0.45 * Math.max(0, Math.min(1, depth));
  const x = nx + px * a;
  const y = ny + py * a;
  const z = nz + pz * a;
  const n = hypot3(x, y, z);
  if (n < 1e-8) return { x: nx, y: ny, z: nz };
  return { x: x / n, y: y / n, z: z / n };
}

// Strongest body currently inside its well. Unit vector toward it.
// Depth is 0 at the well edge and 1 at the surface.
export function wellPull(ship, bodies) {
  let best = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  let depth = 0;
  for (const b of bodies) {
    if (!(b.well > 0) || !(b.gm > 0)) continue;
    const dx = b.x - ship.x;
    const dy = b.y - ship.y;
    const dz = b.z - ship.z;
    const r = hypot3(dx, dy, dz);
    if (r < 1e-4 || r >= b.well) continue;
    const mag = gravityScale(b.gm, b.radius, r) * r;
    if (mag <= best) continue;
    best = mag;
    x = dx / r;
    y = dy / r;
    z = dz / r;
    const span = b.well - b.radius;
    depth = span > 1e-4 ? (b.well - r) / span : 1;
    if (depth < 0) depth = 0;
    if (depth > 1) depth = 1;
  }
  return { x, y, z, depth };
}

export function alignArcade(ship, nx, ny, nz, dt, wellBlend) {
  const speed = hypot3(ship.vx, ship.vy, ship.vz);
  if (speed < 1e-6) return;
  const t = Math.max(0, Math.min(1, wellBlend));
  const align = ALIGN_SPACE + (ALIGN_WELL - ALIGN_SPACE) * t;
  const k = Math.min(1, align * dt);
  ship.vx += (nx * speed - ship.vx) * k;
  ship.vy += (ny * speed - ship.vy) * k;
  ship.vz += (nz * speed - ship.vz) * k;
  const n = hypot3(ship.vx, ship.vy, ship.vz);
  if (n < 1e-8) return;
  const s = speed / n;
  ship.vx *= s;
  ship.vy *= s;
  ship.vz *= s;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function selfCheck() {
  const shipCrash = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  const crashBody = {
    id: "c",
    x: 0,
    y: 0,
    z: 0,
    radius: 10,
    gm: 0,
    well: 0,
    sweetIn: 0,
    sweetOut: 0,
  };
  assert(step(shipCrash, [crashBody], createPass(), 0.016).event === "crash", "crash");

  const well = {
    id: "b",
    x: 0,
    y: 0,
    z: 0,
    radius: 10,
    gm: 200,
    well: 28,
    sweetIn: 14,
    sweetOut: 24,
  };
  // Impact 12 sits between the surface and the sweet band. Gravity only: no bounce, no boost.
  const steep = { x: 12, y: 0, z: 40, vx: 0, vy: 0, vz: -30 };
  const steepPass = createPass();
  let steepBoost = false;
  for (let i = 0; i < 200; i++) {
    const res = step(steep, [well], steepPass, 0.02);
    assert(res.event !== "bounce", "steep bounced");
    if (res.event === "boost") steepBoost = true;
    if (res.event === "crash") break;
  }
  assert(!steepBoost, "steep boosted");

  const headOn = { x: 0, y: 0, z: 40, vx: 0, vy: 0, vz: -30 };
  let crashed = false;
  for (let i = 0; i < 200; i++) {
    const res = step(headOn, [well], createPass(), 0.02);
    if (res.event === "crash") crashed = true;
  }
  assert(crashed, "head-on crash");

  // Straight graze through the band. gm 0 so the line stays at x = 18.
  const graze = { x: 18, y: 0, z: -40, vx: 0, vy: 0, vz: 30 };
  const band = {
    id: "g",
    x: 0,
    y: 0,
    z: 0,
    radius: 10,
    gm: 0,
    well: 28,
    sweetIn: 14,
    sweetOut: 24,
  };
  const grazePass = createPass();
  let boosted = false;
  for (let i = 0; i < 200; i++) {
    const res = step(graze, [band], grazePass, 0.02);
    assert(res.event !== "crash", "graze crashed");
    if (res.event === "boost") boosted = true;
  }
  assert(boosted, "boost");
  assert(hypot3(graze.vx, graze.vy, graze.vz) > 30, "boost not faster");

  const go = { vx: 0, vy: 0, vz: 5 * KM };
  engineArcade(go, 0, 0, 1, 0.1, true, false, false);
  assert(go.vz > 5 * KM, "thrust");
  const hot = { vx: 0, vy: 0, vz: CRUISE * 2 };
  engineArcade(hot, 0, 0, 1, 0.1, true, false, false);
  assert(Math.abs(hot.vz - CRUISE * 2) < 1e-9, "no thrust above cruise");
  const stop = { vx: 0, vy: 0, vz: 20 * KM };
  engineArcade(stop, 0, 0, 1, 0.1, false, true, false);
  assert(stop.vz < 20 * KM && stop.vz > 0, "brake");
  const side = { vx: 10 * KM, vy: 0, vz: 0 };
  alignArcade(side, 0, 0, 1, 0.5, 0);
  assert(side.vz > 0 && side.vx < 10 * KM, "align");
  assert(Math.abs(hypot3(side.vx, side.vy, side.vz) - 10 * KM) < 1e-6, "align keeps speed");
  const still = slingNose(0, 0, 1, 1, 0, 0, 0);
  assert(Math.abs(still.x) < 1e-9 && Math.abs(still.z - 1) < 1e-9, "sling mix 0");
  const yanked = slingNose(0, 0, 1, 1, 0, 0, 1);
  assert(yanked.x > 0.9 && Math.abs(yanked.z) < 0.1, "sling mix 1 faces vel");

  const rock = {
    id: "r",
    x: 0,
    y: 0,
    z: 0,
    radius: 4,
    gm: 0,
    well: 12,
    sweetIn: 5,
    sweetOut: 10,
  };
  const rockGraze = { x: 7, y: 0, z: -20, vx: 0, vy: 0, vz: 18 };
  const rockPass = createPass();
  let rockBoost = false;
  for (let i = 0; i < 200; i++) {
    const res = step(rockGraze, [rock], rockPass, 0.02);
    assert(res.event !== "crash", "rock graze crashed");
    if (res.event === "boost") rockBoost = true;
  }
  assert(rockBoost, "rock boost");

  const rockHit = { x: 0, y: 0, z: 20, vx: 0, vy: 0, vz: -18 };
  let rockCrash = false;
  for (let i = 0; i < 200; i++) {
    if (step(rockHit, [rock], createPass(), 0.02).event === "crash") rockCrash = true;
  }
  assert(rockCrash, "rock crash");

  const ghost = new Float32Array(12);
  ghostPath({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 10 }, [], 0.1, 4, ghost);
  assert(ghost[11] > 2.9 && ghost[11] < 3.1, "ghost coast");

  const aNear = gravityScale(1, 10, 10) * 10;
  const aFar = gravityScale(1, 10, 40) * 40;
  assert(aNear / aFar > 16, "close bite steeper than 1/r^2");

  // Side graze with gravity. Heading follows the bend so exit keeps the sideways kick.
  const slingBody = {
    id: "s",
    x: 0,
    y: 0,
    z: 0,
    radius: 10,
    gm: 400,
    well: 28,
    sweetIn: 14,
    sweetOut: 24,
  };
  const slingShip = { x: 18, y: 0, z: -50, vx: 0, vy: 0, vz: 28 };
  const slingPass = createPass();
  let nx = 0;
  let ny = 0;
  let nz = 1;
  let depth = 0;
  let seenWell = false;
  let after = -1;
  let vxExit = 0;
  for (let i = 0; i < 400; i++) {
    step(slingShip, [slingBody], slingPass, 0.02);
    const r = hypot3(slingShip.x, slingShip.y, slingShip.z);
    const span = slingBody.well - slingBody.radius;
    const raw = r < slingBody.well && span > 1e-4 ? (slingBody.well - r) / span : 0;
    depth += (raw - depth) * (1 - Math.exp(-4 * 0.02));
    if (raw > 0) seenWell = true;
    if (seenWell && raw <= 0 && after < 0) {
      after = 0;
      vxExit = slingShip.vx;
    } else if (after >= 0) {
      after += 0.02;
    }
    const n = slingNose(nx, ny, nz, slingShip.vx, slingShip.vy, slingShip.vz, slingMix(depth, 0.02));
    nx = n.x;
    ny = n.y;
    nz = n.z;
    alignArcade(slingShip, nx, ny, nz, 0.02, depth);
    if (after > 1.2) break;
  }
  assert(after > 1, "sling left the well");
  assert(Math.abs(vxExit) > 3, "sling actually bent");
  assert(Math.abs(slingShip.vx) > 0.5 * Math.abs(vxExit), "sling keeps the curve");

  const straight = leanNose(0, 0, 1, 1, 0, 0, 0);
  assert(Math.abs(straight.x) < 1e-9 && Math.abs(straight.z - 1) < 1e-9, "lean depth 0");
  const tipped = leanNose(0, 0, 1, 1, 0, 0, 1);
  assert(tipped.x > 0.3 && tipped.x < 0.5 && tipped.z > 0.8, "lean tips toward pull");

  const v0z = 5 * KM;
  const push = { vx: 0, vy: 0, vz: v0z };
  engineArcade(push, 0, 0, 1, 0.1, true, false, false);
  assert(feltG(0, 0, v0z, push.vx, push.vy, push.vz, 0.1) < 0.05, "thrust is along-track");
  const dtG = 0.02;
  assert(Math.abs(feltG(0, 0, 10, FELT * dtG, 0, 10, dtG) - 1) < 1e-6, "perp FELT is 1");
  assert(feltG(0, 0, 0, 0, 0, 0, 0) === 0, "zero dt");
  assert(feltG(0, 0, 0, 0, 0, 0, 0.016) === 0, "still");
}

// node src/physics.js
if (typeof process !== "undefined" && process.argv[1]?.endsWith("physics.js")) {
  selfCheck();
}
