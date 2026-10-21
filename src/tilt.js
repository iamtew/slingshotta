// Device beta/gamma deltas (degrees) -> screen yaw/pitch degrees.
// angleDeg is screen.orientation.angle: 0, 90, 180, 270.

export function screenTilt(dBeta, dGamma, angleDeg) {
  const a = (((Math.round(Number(angleDeg) / 90) * 90) % 360) + 360) % 360;
  if (a === 90) return { yaw: dBeta, pitch: -dGamma };
  if (a === 180) return { yaw: -dGamma, pitch: -dBeta };
  if (a === 270) return { yaw: -dBeta, pitch: dGamma };
  return { yaw: dGamma, pitch: dBeta };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function selfCheck() {
  const p = screenTilt(10, 3, 0);
  assert(p.yaw === 3 && p.pitch === 10, "portrait");
  const l = screenTilt(10, 3, 90);
  assert(l.yaw === 10 && l.pitch === -3, "landscape 90");
  const u = screenTilt(10, 3, 180);
  assert(u.yaw === -3 && u.pitch === -10, "upside down");
  const r = screenTilt(10, 3, 270);
  assert(r.yaw === -10 && r.pitch === 3, "landscape 270");
  const wrap = screenTilt(1, 2, -90);
  assert(wrap.yaw === -1 && wrap.pitch === 2, "neg 90 is 270");
}

if (typeof process !== "undefined" && process.argv[1]?.endsWith("tilt.js")) {
  selfCheck();
}
