// Pixi overlay HUD. World stays in Three. Click-through: canvas has pointer-events none.
// Pixi loads inside createHud so `node src/hud.js` can still run selfCheck.
import { KM } from "./physics.js";

export const RADAR_RANGE = 480 * KM;
const TILT = 0.45;
const RADAR_R = 118;
const STEM = 36;
const CRT = 0x6aff8a;
const CRT_DIM = 0x3d8a58;
const CRT_LIT = 0xc8ffd4;
const WARN = 0xff9a3c;
const HOT = 0xff6a4a;
const BOOST = 0xffb15a;

function rotateByQuat(v, q) {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

// World offset -> ship space. Nose (+Z) is up on the disc. +Y is a raised stem.
export function projectRadar(rel, orient) {
  const inv = { x: -orient.x, y: -orient.y, z: -orient.z, w: orient.w };
  const local = rotateByQuat(rel, inv);
  let x = local.x / RADAR_RANGE;
  let y = local.z / RADAR_RANGE;
  const elev = local.y / RADAR_RANGE;
  const r = Math.hypot(x, y);
  if (r > 1) {
    x /= r;
    y /= r;
  }
  return { x, y, elev };
}

export function fmtDist(m) {
  if (m < 1000) return m.toFixed(0) + " m";
  const km = m / 1000;
  return (km < 10 ? km.toFixed(1) : km.toFixed(0)) + " km";
}

export function fmtSpeed(mps) {
  return mps.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f") + " m/s";
}

function zoneCue(zone) {
  if (zone === "graze") return ["GRAZE", CRT];
  if (zone === "steep") return ["TOO STEEP", WARN];
  if (zone === "low") return ["TOO LOW", WARN];
  return ["OUTSIDE", CRT_DIM];
}

// Ship-local +Y is up. No pull: blob falls down. Mag is 0..1 G.
export function gOffset(g, dx, dy) {
  const mag = Math.max(0, Math.min(1, g || 0));
  const len = Math.hypot(dx || 0, dy || 0);
  if (len < 1e-6) return { x: 0, y: -mag };
  return { x: (dx / len) * mag, y: (dy / len) * mag };
}

// Well danger, scaled G, ignition kick. HUD glitch and stage jitter read this.
export function strain(danger, g, kick) {
  return Math.max(danger || 0, Math.min(1, Math.max(0, g || 0)) * 0.85, kick || 0);
}

const SPIN_DZ = 0.18;
const SPIN_CAP = 2.2;

export function spinMark(v) {
  const n = v || 0;
  if (n < SPIN_DZ && n > -SPIN_DZ) return 0;
  const m = n / SPIN_CAP;
  return m > 1 ? 1 : m < -1 ? -1 : m;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function selfCheck() {
  const id = { x: 0, y: 0, z: 0, w: 1 };
  const fwd = projectRadar({ x: 0, y: 0, z: 40 }, id);
  assert(fwd.y > 0 && Math.abs(fwd.x) < 1e-6 && Math.abs(fwd.elev) < 1e-6, "forward maps up");
  const above = projectRadar({ x: 0, y: 40, z: 0 }, id);
  assert(above.elev > 0 && Math.abs(above.x) < 1e-6 && Math.abs(above.y) < 1e-6, "above maps to stem");
  const far = projectRadar({ x: 0, y: 0, z: RADAR_RANGE * 4 }, id);
  assert(Math.abs(far.y - 1) < 1e-6, "clamp to rim");
  assert(fmtDist(847) === "847 m" && fmtDist(1500) === "1.5 km", "dist units");
  assert(fmtDist(210000) === "210 km" && fmtSpeed(40) === "40 m/s", "km and speed");
  assert(fmtSpeed(12345) === "12\u202f345 m/s", "speed groups");
  assert(strain(0, 0, 0) === 0 && strain(0.4, 0, 0) === 0.4, "strain danger");
  assert(strain(0, 1, 0) === 0.85 && strain(0.2, 0, 0.9) === 0.9, "strain mix");
  assert(spinMark(0.1) === 0 && spinMark(2.2) === 1 && spinMark(-2.2) === -1, "spin deadzone");
  assert(zoneCue("graze")[0] === "GRAZE" && zoneCue("steep")[0] === "TOO STEEP", "zone cue");
  const rest = gOffset(0, 1, 0);
  assert(rest.x === 0 && rest.y === 0, "g rest");
  const down = gOffset(1, 0, 0);
  assert(Math.abs(down.x) < 1e-6 && down.y === -1, "g down");
  const right = gOffset(0.5, 2, 0);
  assert(Math.abs(right.x - 0.5) < 1e-6 && Math.abs(right.y) < 1e-6, "g pull");
}

if (typeof process !== "undefined" && process.argv[1]?.endsWith("hud.js")) {
  selfCheck();
}

const LABEL = {
  fontFamily: "Segoe UI, system-ui, sans-serif",
  fontSize: 11,
  fill: CRT_DIM,
  letterSpacing: 2.4,
};
const VALUE = {
  fontFamily: "ui-monospace, Consolas, Segoe UI, monospace",
  fontSize: 26,
  fill: CRT_LIT,
  fontWeight: "600",
  letterSpacing: 1,
};
const NAME = {
  fontFamily: "ui-monospace, Consolas, Segoe UI, monospace",
  fontSize: 18,
  fill: CRT_LIT,
  fontWeight: "600",
  letterSpacing: 1,
};
const TOAST = {
  fontFamily: "Segoe UI, system-ui, sans-serif",
  fontSize: 14,
  fill: CRT_LIT,
  align: "center",
  wordWrap: true,
  wordWrapWidth: 520,
  stroke: { color: 0x041208, width: 4 },
};
const ALERT = {
  fontFamily: "ENOCH, Segoe UI, system-ui, sans-serif",
  fontSize: 22,
  fill: HOT,
  fontWeight: "400",
  letterSpacing: 3,
  stroke: { color: 0x041208, width: 4 },
};

// Open chevron + ticks. No fill. mirror=true is the right (nearest) side.
function drawBracket(g, w, h, mirror) {
  const cut = 14;
  const x0 = mirror ? w : 0;
  const dir = mirror ? -1 : 1;
  const xInner = x0 + dir * cut;
  g.moveTo(xInner, 2);
  g.lineTo(x0, cut);
  g.lineTo(x0, h - cut);
  g.lineTo(xInner, h - 2);
  g.stroke({ width: 1.6, color: CRT, alpha: 0.8 });
  // Short cap, not a lid — a full top/bottom stroke reads as a box.
  g.moveTo(xInner, 4);
  g.lineTo(xInner + dir * 40, 4);
  g.stroke({ width: 1.8, color: CRT, alpha: 0.75 });
  for (let i = 0; i < 6; i++) {
    if (i === 2) continue;
    const x = xInner + dir * (10 + i * 16);
    g.moveTo(x, h - 4);
    g.lineTo(x, h - (i % 3 === 0 ? 12 : 8));
  }
  g.stroke({ width: 1, color: CRT, alpha: 0.4 });
  const dead = xInner + dir * 42;
  g.moveTo(dead, h - 4);
  g.lineTo(dead, h - 6);
  g.stroke({ width: 1, color: CRT, alpha: 0.22 });
}

function drawGauge(g, cx, cy, r) {
  g.circle(cx, cy, r);
  g.fill({ color: 0x041208, alpha: 0.5 });
  g.circle(cx, cy, r);
  g.stroke({ width: 2, color: CRT, alpha: 0.9 });
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const inner = i % 2 === 0 ? r - 6 : r - 3;
    g.moveTo(cx + c * inner, cy + s * inner);
    g.lineTo(cx + c * r, cy + s * r);
  }
  g.stroke({ width: 1, color: CRT, alpha: 0.5 });
  g.circle(cx, cy, 2);
  g.fill({ color: CRT_DIM, alpha: 0.85 });
}

function paintBall(g, cx, cy, r, load, pull) {
  const off = gOffset(load, pull?.x, pull?.y);
  const reach = r - 7;
  const bx = cx + off.x * reach;
  const by = cy - off.y * reach;
  const hot = load > 0.7;
  g.clear();
  g.circle(bx, by, 6);
  g.fill({ color: hot ? HOT : CRT, alpha: 0.95 });
  g.circle(bx, by, 9);
  g.stroke({ width: 1.4, color: hot ? HOT : CRT_LIT, alpha: 0.5 });
}

// One soft falloff. Stretched over the frame it reads as a tunnel, not rings.
function tunnelCanvas() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const falloff = ctx.createRadialGradient(64, 64, 18, 64, 64, 72);
  falloff.addColorStop(0, "rgba(7,8,14,0)");
  falloff.addColorStop(0.45, "rgba(7,8,14,0)");
  falloff.addColorStop(0.78, "rgba(7,8,14,0.55)");
  falloff.addColorStop(1, "rgba(7,8,14,1)");
  ctx.fillStyle = falloff;
  ctx.fillRect(0, 0, 128, 128);
  return c;
}

function paintFeel(g, w, h, spin) {
  g.clear();
  const px = spinMark(spin?.x);
  const py = spinMark(spin?.y);
  const pz = spinMark(spin?.z);
  if (!px && !py && !pz) return;
  const cx = w * 0.5;
  const cy = h * 0.4;
  if (py) {
    const s = Math.sign(py);
    for (let i = 0; i < 3; i++) {
      g.moveTo(cx + s * (50 + i * 22), cy - 36 + i * 24);
      g.lineTo(cx + s * (50 + i * 22) + s * 18 * Math.abs(py), cy - 36 + i * 24);
    }
    g.stroke({ width: 1.1, color: CRT, alpha: 0.16 + 0.28 * Math.abs(py) });
  }
  if (px) {
    const s = Math.sign(px);
    for (let i = 0; i < 3; i++) {
      g.moveTo(cx - 40 + i * 28, cy + s * (24 + i * 20));
      g.lineTo(cx - 40 + i * 28, cy + s * (24 + i * 20) + s * 16 * Math.abs(px));
    }
    g.stroke({ width: 1.1, color: CRT, alpha: 0.16 + 0.28 * Math.abs(px) });
  }
  if (pz) {
    const dir = Math.sign(pz);
    for (const off of [-0.9, 0.9, 2.2]) {
      const a0 = -pz * 0.4 + off;
      const a1 = a0 + 0.35 * dir;
      g.moveTo(cx + Math.cos(a0) * 70, cy + Math.sin(a0) * 70);
      g.lineTo(cx + Math.cos(a1) * 70, cy + Math.sin(a1) * 70);
    }
    g.stroke({ width: 1.2, color: CRT, alpha: 0.14 + 0.3 * Math.abs(pz) });
  }
}

export async function createHud() {
  const { Application, Container, Graphics, Sprite, Texture, Text } = await import("pixi.js");
  const canvas = document.querySelector("#hud");
  const app = new Application();
  await app.init({
    canvas,
    backgroundAlpha: 0,
    antialias: true,
    resolution: Math.min(2, window.devicePixelRatio || 1),
    autoDensity: true,
    width: innerWidth,
    height: innerHeight,
  });
  app.stage.eventMode = "none";

  const left = new Container();
  const leftBg = new Graphics();
  const speedLabel = new Text({ text: "SPEED", style: LABEL });
  const speedVal = new Text({ text: "0 m/s", style: VALUE });
  const driveVal = new Text({ text: "COAST", style: LABEL });
  speedLabel.position.set(18, 8);
  const gMeter = new Graphics();
  const gBall = new Graphics();
  const gLabel = new Text({ text: "G", style: LABEL });
  gLabel.anchor.set(0.5, 0);
  left.addChild(leftBg, speedLabel, speedVal, driveVal, gMeter, gBall, gLabel);

  const vignette = new Sprite(Texture.from(tunnelCanvas()));
  vignette.alpha = 0;
  const feel = new Graphics();

  const right = new Container();
  const rightBg = new Graphics();
  const bodyLabel = new Text({ text: "NEAREST", style: LABEL });
  const bodyName = new Text({ text: "—", style: NAME });
  const bodyDist = new Text({ text: "", style: LABEL });
  const bodyZone = new Text({ text: "", style: LABEL });
  bodyLabel.anchor.set(1, 0);
  bodyName.anchor.set(1, 0);
  bodyDist.anchor.set(1, 0);
  bodyZone.anchor.set(1, 0);
  right.addChild(rightBg, bodyLabel, bodyName, bodyDist, bodyZone);

  const radar = new Container();
  const radarPlate = new Graphics();
  const radarBlips = new Graphics();
  radar.addChild(radarPlate, radarBlips);
  const rail = new Graphics();

  const toast = new Text({ text: "", style: TOAST });
  toast.anchor.set(0.5, 1);

  const warn = new Container();
  const warnGfx = new Graphics();
  const warnText = new Text({ text: "PROXIMITY", style: ALERT });
  warnText.anchor.set(0.5, 0.5);
  const warnGhost = new Text({
    text: "PROXIMITY",
    style: { ...ALERT, fill: CRT },
  });
  warnGhost.anchor.set(0.5, 0.5);
  warn.addChild(warnGfx, warnGhost, warnText);
  warn.visible = false;

  app.stage.addChild(vignette, feel, warn, rail, left, right, radar, toast);

  const GAP = 18;
  const gauge = { cx: 0, cy: 0, r: 0 };

  function viewSize() {
    const vv = window.visualViewport;
    return {
      w: Math.round(vv?.width ?? innerWidth),
      h: Math.round(vv?.height ?? innerHeight),
      x: vv?.offsetLeft ?? 0,
      y: vv?.offsetTop ?? 0,
    };
  }

  function layout() {
    const view = viewSize();
    if (app.renderer) app.renderer.resize(view.w, view.h);
    canvas.style.left = view.x + "px";
    canvas.style.top = view.y + "px";
    canvas.style.width = view.w + "px";
    canvas.style.height = view.h + "px";
    const w = app.screen.width;
    const h = app.screen.height;
    const short = Math.min(w, h);
    const portrait = h > w;
    const radarScale = portrait ? Math.max(0.42, w / 900) : short < 720 ? Math.max(0.52, short / 720) : 1;
    const rr = RADAR_R * radarScale;
    const panelH = short < 720 ? 70 : 88;
    const pad = 12;
    // Portrait: pads sit under the cluster. Landscape: pads are corners, HUD stays bottom center.
    const padLift = portrait ? 210 : 0;
    const panelW = Math.min(210, Math.max(110, (w - rr * 2 - pad * 4) / 2));
    const radarX = w * 0.5;
    const radarY = h - 20 - rr * TILT - padLift;
    const clusterY = h - panelH - pad - padLift;
    radar.scale.set(radarScale);
    left.position.set(radarX - rr - GAP - panelW, clusterY);
    right.position.set(radarX + rr + GAP, clusterY);
    radar.position.set(radarX, radarY);
    toast.position.set(radarX, clusterY - 36);
    toast.style.wordWrapWidth = Math.min(560, w - 40);
    warnText.position.set(w * 0.5, h * 0.38);
    const rx = panelW - 18;
    bodyLabel.position.set(rx, 8);
    bodyName.position.set(rx, 24);
    bodyDist.position.set(rx, 46);
    bodyZone.position.set(rx, 64);
    leftBg.clear();
    drawBracket(leftBg, panelW, panelH, false);
    rightBg.clear();
    drawBracket(rightBg, panelW, panelH, true);
    const tight = panelH < 80;
    const gr = tight ? 22 : 28;
    gauge.r = gr;
    gauge.cx = panelW - 10 - gr;
    gauge.cy = panelH * 0.52;
    gLabel.position.set(gauge.cx, 2);
    const speedY = tight ? 22 : 24;
    const driveY = panelH - (tight ? 14 : 16);
    const room = gauge.cx - gauge.r - 18;
    const speedSize = Math.max(13, Math.min(tight ? 15 : 20, driveY - speedY - 2, (room / 5.6) | 0));
    speedVal.style.fontSize = speedSize;
    speedVal.position.set(18, speedY);
    driveVal.position.set(18, driveY);
    vignette.width = w;
    vignette.height = h;
    gMeter.clear();
    drawGauge(gMeter, gauge.cx, gauge.cy, gauge.r);
    const railY = clusterY + panelH - 4;
    const gap = rr + 8;
    rail.clear();
    rail.moveTo(left.x, railY);
    rail.lineTo(radarX - gap, railY);
    rail.moveTo(radarX + gap, railY);
    rail.lineTo(right.x + panelW, railY);
    rail.stroke({ width: 1, color: CRT, alpha: 0.28 });
    rail.moveTo(radarX - gap, railY - 6);
    rail.lineTo(radarX - gap, railY + 6);
    rail.moveTo(radarX + gap, railY - 6);
    rail.lineTo(radarX + gap, railY + 6);
    rail.stroke({ width: 1.2, color: CRT, alpha: 0.45 });
  }

  // Static disc. Blips redraw each frame.
  radarPlate.clear();
  radarPlate.ellipse(0, 0, RADAR_R + 8, (RADAR_R + 8) * TILT);
  radarPlate.fill({ color: 0x041208, alpha: 0.72 });
  radarPlate.ellipse(0, 0, RADAR_R + 8, (RADAR_R + 8) * TILT);
  radarPlate.stroke({ width: 2, color: CRT, alpha: 0.85 });
  for (const t of [1, 0.66, 0.33]) {
    radarPlate.ellipse(0, 0, RADAR_R * t, RADAR_R * t * TILT);
    radarPlate.stroke({ width: 1.2, color: CRT, alpha: 0.35 + t * 0.2 });
  }
  radarPlate.moveTo(0, -RADAR_R * TILT);
  radarPlate.lineTo(0, RADAR_R * TILT);
  radarPlate.moveTo(-RADAR_R, 0);
  radarPlate.lineTo(RADAR_R, 0);
  radarPlate.stroke({ width: 1, color: CRT, alpha: 0.28 });
  radarPlate.moveTo(-7, 6);
  radarPlate.lineTo(0, -10);
  radarPlate.lineTo(7, 6);
  radarPlate.closePath();
  radarPlate.fill({ color: CRT, alpha: 0.95 });
  radarPlate.moveTo(RADAR_R + 2, -5);
  radarPlate.lineTo(RADAR_R + 9, -5);
  radarPlate.stroke({ width: 1, color: CRT, alpha: 0.32 });

  layout();
  addEventListener("resize", layout);
  visualViewport?.addEventListener("resize", layout);
  visualViewport?.addEventListener("scroll", layout);

  return {
    update(state) {
      layout();
      const splash = Boolean(state.splash);
      left.visible = right.visible = radar.visible = rail.visible = !splash;
      toast.visible = !splash && Boolean(state.toast);
      if (splash) {
        warn.visible = false;
        vignette.alpha = 0;
        feel.clear();
        app.stage.position.set(0, 0);
        return;
      }
      const g = Math.max(0, Math.min(1, state.g || 0));
      const danger = state.danger || 0;
      const load = strain(danger, g, state.kick);
      const sw = app.screen.width;
      const sh = app.screen.height;
      vignette.alpha = g < 0.02 ? 0 : g * 0.82;
      paintFeel(feel, sw, sh, state.spin);
      app.stage.position.set(load > 0.04 ? (Math.random() - 0.5) * load * 5 : 0, load > 0.04 ? (Math.random() - 0.5) * load * 4 : 0);
      paintBall(gBall, gauge.cx, gauge.cy, gauge.r, g, state.pull);
      let speed = fmtSpeed(state.speed);
      if (load > 0.28) {
        const slot = (state.now / 80) | 0;
        if ((slot * 13) % 7 <= load * 6) {
          const i = slot % Math.max(1, speed.length - 2);
          speed = speed.slice(0, i) + "/" + speed.slice(i + 1);
        }
      }
      speedVal.text = speed;
      let drive = "COAST";
      let driveFill = CRT_DIM;
      if (state.boost) {
        drive = "BOOST";
        driveFill = BOOST;
      } else if (state.thrust) {
        drive = "THRUST";
        driveFill = CRT;
      } else if (state.brake) {
        drive = "BRAKE";
        driveFill = WARN;
      } else if (state.rcs) {
        drive = state.rcs;
        driveFill = CRT_LIT;
      }
      driveVal.text = drive;
      driveVal.style.fill = driveFill;

      bodyName.text = state.nearest.id;
      bodyDist.text = fmtDist(state.nearest.dist);
      const [zoneText, zoneFill] = zoneCue(state.nearest.zone);
      bodyZone.text = zoneText;
      bodyZone.style.fill = zoneFill;

      toast.text = state.toast || "";
      toast.visible = Boolean(state.toast);

      const inWell = state.nearest.zone !== "outside";
      warn.visible = inWell;
      warnGfx.clear();
      if (inWell) {
        const pulse = 0.35 + 0.45 * Math.abs(Math.sin(state.now / 90));
        const hit = danger > 0.65;
        warnText.text = hit ? "IMPACT" : zoneText;
        warnText.style.fill = hit ? HOT : zoneFill;
        warnText.alpha = danger > 0 ? 0.55 + Math.min(1, danger) * pulse * 0.45 : 0.92;
        warnGhost.text = warnText.text;
        warnGhost.position.set(warnText.x + 2, warnText.y);
        warnGhost.visible = load > 0.2;
        warnGhost.alpha = load * 0.4;
        if (danger > 0) {
          const alpha = Math.min(1, danger) * pulse;
          warnGfx.moveTo(18, 22);
          warnGfx.lineTo(52, 22);
          warnGfx.lineTo(18, 56);
          warnGfx.moveTo(sw - 18, 22);
          warnGfx.lineTo(sw - 52, 22);
          warnGfx.lineTo(sw - 18, 56);
          warnGfx.moveTo(18, sh - 22);
          warnGfx.lineTo(52, sh - 22);
          warnGfx.lineTo(18, sh - 56);
          warnGfx.moveTo(sw - 18, sh - 22);
          warnGfx.lineTo(sw - 52, sh - 22);
          warnGfx.lineTo(sw - 18, sh - 56);
          warnGfx.stroke({ width: 2, color: HOT, alpha: 0.4 + alpha * 0.6 });
        }
      } else {
        warnGhost.visible = false;
      }

      radarBlips.clear();
      const sweep = (state.now / 1800) % 1;
      const ang = sweep * Math.PI * 2;
      radarBlips.moveTo(0, 0);
      radarBlips.lineTo(Math.cos(ang) * RADAR_R, Math.sin(ang) * RADAR_R * TILT);
      radarBlips.stroke({ width: 1.5, color: CRT, alpha: 0.35 });

      for (const p of state.planets) {
        const hit = projectRadar(
          { x: p.x - state.ship.x, y: p.y - state.ship.y, z: p.z - state.ship.z },
          state.orient
        );
        const px = hit.x * RADAR_R;
        const py = -hit.y * RADAR_R * TILT;
        const ey = py - hit.elev * STEM;
        radarBlips.moveTo(px, py);
        radarBlips.lineTo(px, ey);
        radarBlips.stroke({ width: 1.2, color: p.color, alpha: 0.7 });
        radarBlips.circle(px, ey, p.moon ? 3 : 4.5);
        radarBlips.fill({ color: p.color, alpha: 0.95 });
        radarBlips.circle(px, py, 2);
        radarBlips.fill({ color: p.color, alpha: 0.5 });
      }
    },
  };
}
