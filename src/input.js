// Prefs, keys, mouse, pads, gyro. No UI import — the loop wires splash/pause.
import { screenTilt } from "./tilt.js";

export const invert = { pitch: false, yaw: true, roll: true };
export const inputPrefs = { overlays: "auto", gyro: false, developer: false, details: false, seed: "classic" };
const STORE = "slingshotta-input";

export function loadPrefs() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || "{}");
    if (typeof s.invert?.pitch === "boolean") invert.pitch = s.invert.pitch;
    if (typeof s.invert?.yaw === "boolean") invert.yaw = s.invert.yaw;
    if (typeof s.invert?.roll === "boolean") invert.roll = s.invert.roll;
    if (s.overlays === "on" || s.overlays === "off" || s.overlays === "auto") inputPrefs.overlays = s.overlays;
    if (typeof s.gyro === "boolean") inputPrefs.gyro = s.gyro;
    if (typeof s.developer === "boolean") inputPrefs.developer = s.developer;
    if (typeof s.details === "boolean") inputPrefs.details = s.details;
    if (typeof s.seed === "string" && s.seed.length > 0 && s.seed.length <= 8) inputPrefs.seed = s.seed;
  } catch {
    /* keep defaults */
  }
}

export function savePrefs() {
  localStorage.setItem(
    STORE,
    JSON.stringify({
      invert,
      overlays: inputPrefs.overlays,
      gyro: inputPrefs.gyro,
      developer: inputPrefs.developer,
      details: inputPrefs.details,
      seed: inputPrefs.seed,
    })
  );
}

loadPrefs();

export const keys = new Set();
export let pointerDown = false;
export const mouse = { x: 0, y: 0 };

export const padsEl = document.querySelector("#pads");
export const padEngines = document.querySelector("#pad-engines");
export const padAim = document.querySelector("#pad-aim");
export const padMenuBtn = document.querySelector("#pad-menu");
export const padLook = document.querySelector("#pad-look");
const padKnob = document.querySelector("#pad-knob");
export const padHold = { thrust: false, brake: false, boost: false, rollL: false, rollR: false };
export const lookStick = { x: 0, y: 0, id: null };

let gyroLive = false;
const gyroSample = { beta: null, gamma: null };
const gyroZero = { beta: null, gamma: null };

export function needsGyroGrant() {
  return typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function";
}

function onOrient(e) {
  if (e.beta == null || e.gamma == null) return;
  gyroSample.beta = e.beta;
  gyroSample.gamma = e.gamma;
  if (gyroZero.beta == null) {
    gyroZero.beta = e.beta;
    gyroZero.gamma = e.gamma;
  }
}

export function stopGyroListen() {
  gyroLive = false;
  gyroSample.beta = gyroSample.gamma = null;
  removeEventListener("deviceorientation", onOrient);
}

export function startGyroListen() {
  if (gyroLive) return;
  gyroZero.beta = gyroZero.gamma = null;
  addEventListener("deviceorientation", onOrient);
  gyroLive = true;
}

export async function toggleGyro() {
  if (inputPrefs.gyro && gyroLive) {
    inputPrefs.gyro = false;
    stopGyroListen();
    savePrefs();
    return;
  }
  if (needsGyroGrant()) {
    let perm = "denied";
    try {
      perm = await DeviceOrientationEvent.requestPermission();
    } catch {
      perm = "denied";
    }
    if (perm !== "granted") {
      inputPrefs.gyro = false;
      stopGyroListen();
      savePrefs();
      return;
    }
  }
  inputPrefs.gyro = true;
  startGyroListen();
  savePrefs();
}

export function recenterGyro() {
  if (gyroSample.beta == null) return;
  gyroZero.beta = gyroSample.beta;
  gyroZero.gamma = gyroSample.gamma;
}

export function gyroAxes() {
  if (!gyroLive || gyroSample.beta == null || gyroZero.beta == null) return { pitch: 0, yaw: 0 };
  const angle = screen.orientation?.angle ?? window.orientation ?? 0;
  const t = screenTilt(gyroSample.beta - gyroZero.beta, gyroSample.gamma - gyroZero.gamma, angle);
  const dead = 2;
  const full = 28;
  function axis(v) {
    if (Math.abs(v) < dead) return 0;
    return Math.max(-1, Math.min(1, v / full));
  }
  return { pitch: axis(t.pitch), yaw: axis(t.yaw) };
}

export function gyroLabel() {
  if (!inputPrefs.gyro) return "Gyro: off";
  if (gyroLive) return "Gyro: on";
  return "Gyro: on — tap to grant";
}

export function coarsePointer() {
  return matchMedia("(pointer: coarse)").matches;
}

export function overlaysWanted() {
  if (inputPrefs.overlays === "on") return true;
  if (inputPrefs.overlays === "off") return false;
  return coarsePointer() || "ontouchstart" in window;
}

export function clearPadHold() {
  padHold.thrust = padHold.brake = padHold.boost = padHold.rollL = padHold.rollR = false;
  lookStick.id = null;
  lookStick.x = lookStick.y = 0;
  padKnob.style.transform = "";
  for (const btn of padsEl.querySelectorAll("[data-hold]")) btn.classList.remove("on");
}

export function clearLook() {
  keys.clear();
  mouse.x = 0;
  mouse.y = 0;
  pointerDown = false;
}

export function bindPads({ canLook, onMenu }) {
  function setLook(x, y) {
    lookStick.x = x;
    lookStick.y = y;
    const reach = padLook.clientWidth * 0.5 - 18;
    padKnob.style.transform = "translate(" + x * reach + "px, " + y * reach + "px)";
  }

  function lookFromEvent(e) {
    const box = padLook.getBoundingClientRect();
    const cx = box.left + box.width * 0.5;
    const cy = box.top + box.height * 0.5;
    const r = Math.max(1, box.width * 0.5);
    const nx = (e.clientX - cx) / r;
    const ny = (e.clientY - cy) / r;
    const mag = Math.hypot(nx, ny) || 1;
    const k = mag > 1 ? 1 / mag : 1;
    setLook(nx * k, ny * k);
  }

  padLook.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    padLook.setPointerCapture(e.pointerId);
    lookStick.id = e.pointerId;
    lookFromEvent(e);
  });
  padLook.addEventListener("pointermove", (e) => {
    if (lookStick.id !== e.pointerId) return;
    lookFromEvent(e);
  });
  function endLook(e) {
    if (lookStick.id !== e.pointerId) return;
    lookStick.id = null;
    setLook(0, 0);
  }
  padLook.addEventListener("pointerup", endLook);
  padLook.addEventListener("pointercancel", endLook);

  padsEl.addEventListener("pointerdown", (e) => {
    const btn = e.target.closest("[data-hold]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    btn.setPointerCapture(e.pointerId);
    padHold[btn.dataset.hold] = true;
    btn.classList.add("on");
  });
  function endHold(e) {
    const btn = e.target.closest("[data-hold]");
    if (!btn) return;
    padHold[btn.dataset.hold] = false;
    btn.classList.remove("on");
  }
  padsEl.addEventListener("pointerup", endHold);
  padsEl.addEventListener("pointercancel", endHold);
  padsEl.addEventListener("contextmenu", (e) => e.preventDefault());
  padMenuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onMenu();
  });

  addEventListener("keyup", (e) => keys.delete(e.code));
  addEventListener("pointerdown", (e) => {
    if (e.target.closest("#pads, #menu, #crash, #splash")) return;
    if (overlaysWanted()) return;
    if (canLook()) pointerDown = true;
  });
  addEventListener("pointerup", () => {
    pointerDown = false;
  });
  addEventListener("pointermove", (e) => {
    const locked = document.pointerLockElement != null;
    if (!locked && !pointerDown) return;
    mouse.x += e.movementX;
    mouse.y += e.movementY;
  });

  if (inputPrefs.gyro && !needsGyroGrant()) startGyroListen();
}
