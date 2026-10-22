// Splash, pause pages, crash overlay. Game reset stays a hook from the loop.
import {
  clearLook,
  clearPadHold,
  coarsePointer,
  gyroLabel,
  inputPrefs,
  invert,
  overlaysWanted,
  padAim,
  padEngines,
  padsEl,
  recenterGyro,
  savePrefs,
  toggleGyro,
} from "./input.js";
import { fmtDist, fmtSpeed } from "./hud.js";

export const menu = document.querySelector("#menu");
export const crashEl = document.querySelector("#crash");
const crashStatsEl = document.querySelector("#crash-stats");
export const splashEl = document.querySelector("#splash");

export let paused = false;
export let splash = true;
export let splashAng = 0;
export let crashMode = "play";
let menuPage = "home";
let menuIx = 0;
const padHeld = { start: false, a: false, b: false, up: false, down: false, any: false };

let hooks = {};
export function setUiHooks(h) {
  hooks = h;
}

export function flying() {
  return !splash && !paused && crashMode === "play";
}

export function setCrashMode(mode) {
  crashMode = mode;
}

export function syncPads() {
  const play = flying();
  const full = play && overlaysWanted();
  const menuOnly = play && coarsePointer() && !full;
  padsEl.hidden = !full && !menuOnly;
  padEngines.hidden = !full;
  padAim.hidden = !full;
}

export function playHint() {
  if (overlaysWanted()) return "Touch pads to fly. Point the nose. Menu is top right.";
  return "Click to steer. Point the nose. Dashed cyan is where velocity goes. Enter or Esc: menu.";
}

function invertLabel(axis) {
  return axis[0].toUpperCase() + axis.slice(1) + ": " + (invert[axis] ? "inverted" : "normal");
}

function paintSettings() {
  const page = document.querySelector("#menu-settings");
  for (const btn of page.querySelectorAll("[data-act=invert]")) {
    btn.textContent = invertLabel(btn.dataset.axis);
  }
  page.querySelector("[data-act=overlays]").textContent = "Touch overlays: " + inputPrefs.overlays;
  page.querySelector("[data-act=gyro]").textContent = gyroLabel();
}

function showMenuPage(name) {
  menuPage = name;
  for (const id of ["home", "how", "controls", "settings", "help"]) {
    document.querySelector("#menu-" + id).hidden = id !== name;
  }
  if (name === "settings") paintSettings();
  menuIx = 0;
  focusMenu();
}

function menuButtons() {
  return [...document.querySelector("#menu-" + menuPage).querySelectorAll("button")];
}

function uiButtons() {
  if (paused) return menuButtons();
  if (crashMode === "overlay") return [...crashEl.querySelectorAll("button")];
  return [];
}

export function focusMenu() {
  const btns = uiButtons();
  if (!btns.length) return;
  menuIx = (menuIx + btns.length) % btns.length;
  for (let i = 0; i < btns.length; i++) btns[i].classList.toggle("on", i === menuIx);
}

export function showCrashUi() {
  crashEl.hidden = false;
  menuIx = 0;
  focusMenu();
}

function runMenu(act) {
  if (act === "resume") setMenu(false);
  else if (act === "restart") {
    hooks.restartPlay();
    setMenu(false);
  } else if (act === "invert") {
    const btn = menuButtons()[menuIx];
    const axisName = btn?.dataset.axis;
    if (!axisName) return;
    invert[axisName] = !invert[axisName];
    btn.textContent = invertLabel(axisName);
    savePrefs();
  } else if (act === "overlays") {
    inputPrefs.overlays = inputPrefs.overlays === "auto" ? "on" : inputPrefs.overlays === "on" ? "off" : "auto";
    savePrefs();
    paintSettings();
    syncPads();
  } else if (act === "gyro") {
    toggleGyro().then(paintSettings);
  } else if (act === "recenter") {
    recenterGyro();
  } else if (act === "exit") enterSplash();
  else if (act === "back") showMenuPage("home");
  else showMenuPage(act);
}

export function enterSplash() {
  hooks.restartPlay();
  hooks.poseSplash();
  splash = true;
  splashAng = 0;
  splashEl.hidden = false;
  setMenu(false);
}

export function endSplash() {
  if (!splash) return;
  splash = false;
  splashEl.hidden = true;
  hooks.onLeaveSplash();
  syncPads();
}

export function spinSplash(dt) {
  splashAng += dt * 0.18;
  return splashAng;
}

export function setMenu(open) {
  paused = open;
  menu.hidden = !open;
  clearLook();
  if (open) {
    showMenuPage("home");
    document.exitPointerLock?.();
    hooks.hideGhost();
    if (crashMode !== "play") crashEl.hidden = true;
  } else if (crashMode === "overlay") {
    showCrashUi();
  }
  clearPadHold();
  syncPads();
}

function padEdge(name, now) {
  const fire = now && !padHeld[name];
  padHeld[name] = now;
  return fire;
}

export function pollUi() {
  const pads = navigator.getGamepads?.() ?? [];
  let start = false;
  let a = false;
  let b = false;
  let up = false;
  let down = false;
  let any = false;
  for (const pad of pads) {
    if (!pad) continue;
    if (pad.buttons.some((btn) => btn.pressed || btn.value > 0.25)) any = true;
    if (pad.buttons[9]?.pressed || pad.buttons[8]?.pressed) start = true;
    if (pad.buttons[0]?.pressed) a = true;
    if (pad.buttons[1]?.pressed) b = true;
    if (pad.buttons[12]?.pressed || (pad.axes[1] ?? 0) < -0.55) up = true;
    if (pad.buttons[13]?.pressed || (pad.axes[1] ?? 0) > 0.55) down = true;
  }
  const startHit = padEdge("start", start);
  const aHit = padEdge("a", a);
  const bHit = padEdge("b", b);
  const upHit = padEdge("up", up);
  const downHit = padEdge("down", down);
  const anyHit = padEdge("any", any);
  if (splash) {
    if (anyHit) endSplash();
    return;
  }
  if (paused) {
    if (startHit) {
      setMenu(false);
      return;
    }
  } else if (crashMode === "burst") {
    return;
  } else if (crashMode === "overlay") {
    if (startHit) {
      setMenu(true);
      return;
    }
  } else if (startHit) {
    setMenu(true);
    return;
  } else {
    return;
  }
  if (upHit) {
    menuIx -= 1;
    focusMenu();
  }
  if (downHit) {
    menuIx += 1;
    focusMenu();
  }
  if (aHit) {
    const act = uiButtons()[menuIx]?.dataset.act;
    if (act) {
      if (paused) runMenu(act);
      else if (act === "restart") hooks.restartPlay();
      else if (act === "menu") setMenu(true);
    }
  }
  if (bHit && paused) {
    if (menuPage !== "home") showMenuPage("home");
    else setMenu(false);
  }
}

function fmtTime(s) {
  if (s < 60) return s.toFixed(1) + " s";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m + ":" + String(sec).padStart(2, "0");
}

export function paintCrashStats(flight) {
  crashStatsEl.innerHTML =
    "<li>Flight time <span>" +
    fmtTime(flight.t) +
    "</span></li>" +
    "<li>Top speed <span>" +
    fmtSpeed(flight.vmax) +
    "</span></li>" +
    "<li>Gravity boosts <span>" +
    flight.boosts +
    "</span></li>" +
    "<li>Near warnings <span>" +
    flight.warns +
    "</span></li>" +
    "<li>Distance <span>" +
    fmtDist(flight.dist) +
    "</span></li>";
}

export function bindUi() {
  addEventListener("keydown", (e) => {
    if (splash) {
      e.preventDefault();
      if (!e.repeat) endSplash();
      return;
    }
    if (e.code === "Enter" || e.code === "Escape") {
      e.preventDefault();
      if (!e.repeat) {
        if (paused) setMenu(false);
        else if (crashMode !== "play") hooks.restartPlay();
        else setMenu(true);
      }
      return;
    }
    if (paused || crashMode !== "play") return;
    hooks.onKey(e);
  });
  menu.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    const act = btn?.dataset.act;
    if (!act) return;
    const btns = menuButtons();
    const ix = btns.indexOf(btn);
    if (ix >= 0) menuIx = ix;
    runMenu(act);
  });
  crashEl.addEventListener("click", (e) => {
    const act = e.target.closest("button")?.dataset.act;
    if (act === "restart") hooks.restartPlay();
    else if (act === "menu") setMenu(true);
  });
  splashEl.addEventListener("click", endSplash);
}
