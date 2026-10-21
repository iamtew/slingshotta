// Pixi overlay HUD. World stays in Three. Click-through: canvas has pointer-events none.
// Pixi loads inside createHud so `node src/hud.js` can still run selfCheck.
import { KM } from "./physics.js";

export const RADAR_RANGE = 480 * KM;
const TILT = 0.45;
const RADAR_R = 118;
const STEM = 36;

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
}

if (typeof process !== "undefined" && process.argv[1]?.endsWith("hud.js")) {
  selfCheck();
}

const LABEL = {
  fontFamily: "Segoe UI, system-ui, sans-serif",
  fontSize: 11,
  fill: 0x8aa0b8,
  letterSpacing: 1.2,
};
const VALUE = {
  fontFamily: "Segoe UI, system-ui, sans-serif",
  fontSize: 28,
  fill: 0xe8f0f6,
  fontWeight: "600",
};
const NAME = {
  fontFamily: "Segoe UI, system-ui, sans-serif",
  fontSize: 18,
  fill: 0xe8f0f6,
  fontWeight: "600",
};
const TOAST = {
  fontFamily: "Segoe UI, system-ui, sans-serif",
  fontSize: 14,
  fill: 0xd7e2ea,
  align: "center",
  wordWrap: true,
  wordWrapWidth: 520,
  stroke: { color: 0x070b14, width: 4 },
};
const ALERT = {
  fontFamily: "Segoe UI, system-ui, sans-serif",
  fontSize: 22,
  fill: 0xff6a4a,
  fontWeight: "700",
  letterSpacing: 3,
  stroke: { color: 0x14080a, width: 4 },
};

function drawPanel(g, w, h) {
  g.roundRect(0, 0, w, h, 6);
  g.fill({ color: 0x0a121c, alpha: 0.78 });
  g.roundRect(0, 0, w, h, 6);
  g.stroke({ width: 1.5, color: 0xff9a3c, alpha: 0.55 });
  g.moveTo(10, 0);
  g.lineTo(w - 10, 0);
  g.stroke({ width: 2, color: 0x7ecbff, alpha: 0.7 });
}

export async function createHud() {
  const { Application, Container, Graphics, Text } = await import("pixi.js");
  const canvas = document.querySelector("#hud");
  const app = new Application();
  await app.init({
    canvas,
    backgroundAlpha: 0,
    antialias: true,
    resolution: Math.min(2, window.devicePixelRatio || 1),
    autoDensity: true,
    resizeTo: window,
  });
  app.stage.eventMode = "none";

  const left = new Container();
  const leftBg = new Graphics();
  const speedLabel = new Text({ text: "SPEED", style: LABEL });
  const speedVal = new Text({ text: "0 km/s", style: VALUE });
  const driveVal = new Text({ text: "COAST", style: LABEL });
  speedLabel.position.set(16, 12);
  speedVal.position.set(16, 30);
  driveVal.position.set(16, 70);
  left.addChild(leftBg, speedLabel, speedVal, driveVal);

  const right = new Container();
  const rightBg = new Graphics();
  const bodyLabel = new Text({ text: "NEAREST", style: LABEL });
  const bodyName = new Text({ text: "—", style: NAME });
  const bodyDist = new Text({ text: "", style: LABEL });
  const bodyZone = new Text({ text: "", style: LABEL });
  bodyLabel.position.set(16, 12);
  bodyName.position.set(16, 30);
  bodyDist.position.set(16, 56);
  bodyZone.position.set(16, 74);
  right.addChild(rightBg, bodyLabel, bodyName, bodyDist, bodyZone);

  const radar = new Container();
  const radarPlate = new Graphics();
  const radarBlips = new Graphics();
  radar.addChild(radarPlate, radarBlips);

  const toast = new Text({ text: "", style: TOAST });
  toast.anchor.set(0.5, 1);

  const warn = new Container();
  const warnGfx = new Graphics();
  const warnText = new Text({ text: "PROXIMITY", style: ALERT });
  warnText.anchor.set(0.5, 0.5);
  warn.addChild(warnGfx, warnText);
  warn.visible = false;

  app.stage.addChild(warn, left, right, radar, toast);

  const PANEL_H = 100;
  const GAP = 18;

  function layout() {
    const w = app.screen.width;
    const h = app.screen.height;
    const pad = 18;
    const panelW = Math.min(210, Math.max(128, (w - RADAR_R * 2 - pad * 4) / 2));
    const radarX = w * 0.5;
    const radarY = h - 28 - RADAR_R * TILT;
    const clusterY = h - PANEL_H - pad;
    left.position.set(radarX - RADAR_R - GAP - panelW, clusterY);
    right.position.set(radarX + RADAR_R + GAP, clusterY);
    radar.position.set(radarX, radarY);
    toast.position.set(radarX, clusterY - 36);
    toast.style.wordWrapWidth = Math.min(560, w - 40);
    warnText.position.set(w * 0.5, h * 0.38);
    leftBg.clear();
    drawPanel(leftBg, panelW, PANEL_H);
    rightBg.clear();
    drawPanel(rightBg, panelW, PANEL_H);
  }

  // Static disc. Blips redraw each frame.
  radarPlate.clear();
  radarPlate.ellipse(0, 0, RADAR_R + 8, (RADAR_R + 8) * TILT);
  radarPlate.fill({ color: 0x14080a, alpha: 0.72 });
  radarPlate.ellipse(0, 0, RADAR_R + 8, (RADAR_R + 8) * TILT);
  radarPlate.stroke({ width: 2, color: 0xff9a3c, alpha: 0.85 });
  for (const t of [1, 0.66, 0.33]) {
    radarPlate.ellipse(0, 0, RADAR_R * t, RADAR_R * t * TILT);
    radarPlate.stroke({ width: 1.2, color: 0xff9a3c, alpha: 0.35 + t * 0.2 });
  }
  radarPlate.moveTo(0, -RADAR_R * TILT);
  radarPlate.lineTo(0, RADAR_R * TILT);
  radarPlate.moveTo(-RADAR_R, 0);
  radarPlate.lineTo(RADAR_R, 0);
  radarPlate.stroke({ width: 1, color: 0xff9a3c, alpha: 0.28 });
  radarPlate.moveTo(-7, 6);
  radarPlate.lineTo(0, -10);
  radarPlate.lineTo(7, 6);
  radarPlate.closePath();
  radarPlate.fill({ color: 0x7ecbff, alpha: 0.95 });

  layout();
  addEventListener("resize", layout);

  return {
    update(state) {
      layout();
      const splash = Boolean(state.splash);
      left.visible = right.visible = radar.visible = !splash;
      toast.visible = !splash && Boolean(state.toast);
      if (splash) {
        warn.visible = false;
        return;
      }
      speedVal.text = state.speed.toFixed(0) + " km/s";
      let drive = "COAST";
      let driveFill = 0x8aa0b8;
      if (state.boost) {
        drive = "BOOST";
        driveFill = 0xffb15a;
      } else if (state.thrust) {
        drive = "THRUST";
        driveFill = 0x7ecbff;
      } else if (state.brake) {
        drive = "BRAKE";
        driveFill = 0xff9a3c;
      } else if (state.rcs) {
        drive = state.rcs;
        driveFill = 0xd8f2ff;
      }
      driveVal.text = drive;
      driveVal.style.fill = driveFill;

      bodyName.text = state.nearest.id;
      bodyDist.text = state.nearest.dist.toFixed(0) + " km";
      bodyZone.text = state.nearest.zone.toUpperCase();
      bodyZone.style.fill =
        state.nearest.zone === "band" ? 0x7ecbff : state.nearest.zone === "well" ? 0xff9a3c : 0x8aa0b8;

      toast.text = state.toast || "";
      toast.visible = Boolean(state.toast);

      const danger = state.danger || 0;
      warn.visible = danger > 0;
      if (danger > 0) {
        const w = app.screen.width;
        const h = app.screen.height;
        const pulse = 0.35 + 0.45 * Math.abs(Math.sin(state.now / 90));
        const alpha = Math.min(1, danger) * pulse;
        warnGfx.clear();
        warnGfx.rect(0, 0, w, 10);
        warnGfx.rect(0, h - 10, w, 10);
        warnGfx.rect(0, 0, 10, h);
        warnGfx.rect(w - 10, 0, 10, h);
        warnGfx.fill({ color: 0xff3a28, alpha: 0.22 + alpha * 0.45 });
        warnGfx.moveTo(18, 22);
        warnGfx.lineTo(52, 22);
        warnGfx.lineTo(18, 56);
        warnGfx.moveTo(w - 18, 22);
        warnGfx.lineTo(w - 52, 22);
        warnGfx.lineTo(w - 18, 56);
        warnGfx.moveTo(18, h - 22);
        warnGfx.lineTo(52, h - 22);
        warnGfx.lineTo(18, h - 56);
        warnGfx.moveTo(w - 18, h - 22);
        warnGfx.lineTo(w - 52, h - 22);
        warnGfx.lineTo(w - 18, h - 56);
        warnGfx.stroke({ width: 2, color: 0xff6a4a, alpha: 0.4 + alpha * 0.6 });
        warnText.text = danger > 0.65 ? "IMPACT" : "PROXIMITY";
        warnText.alpha = 0.55 + alpha * 0.45;
      }

      radarBlips.clear();
      const sweep = (state.now / 1800) % 1;
      const ang = sweep * Math.PI * 2;
      radarBlips.moveTo(0, 0);
      radarBlips.lineTo(Math.cos(ang) * RADAR_R, Math.sin(ang) * RADAR_R * TILT);
      radarBlips.stroke({ width: 1.5, color: 0xff9a3c, alpha: 0.35 });

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
