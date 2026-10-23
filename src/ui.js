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
import { fmtDist, fmtSpeed, fmtTime } from "./hud.js";
import { choosePalette, chooseSlot, hideShip, nudgeYaw, showShip } from "./shipview.js";

export const menu = document.querySelector("#menu");
export const crashEl = document.querySelector("#crash");
const crashStatsEl = document.querySelector("#crash-stats");
export const splashEl = document.querySelector("#splash");

export let paused = false;
export let splash = true;
export let waitingPlay = true;
export let splashAng = 0;
export let crashMode = "play";
let menuPage = "home";
let menuIx = 0;
let lastHomeIx = 0;
const padHeld = { start: false, a: false, b: false, up: false, down: false, left: false, right: false, any: false };
const navHold = {};
const PAGE_TITLE = {
  home: "Paused",
  how: "How to play",
  controls: "Controls",
  settings: "Settings",
  ship: "Ship",
  play: "Play",
  dev: "Developer",
};
const TOGGLE_ACT = { invert: 1, overlays: 1, gyro: 1, developer: 1, details: 1 };

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
  page.querySelector("[data-act=developer]").textContent = "Developer mode: " + (inputPrefs.developer ? "on" : "off");
}

function paintDevEntry() {
  document.querySelector("[data-act=dev]").hidden = !inputPrefs.developer;
}

function paintDetails() {
  document.querySelector("[data-act=details]").textContent = "Details: " + (inputPrefs.details ? "on" : "off");
}

function paintPlay() {
  const page = document.querySelector("#menu-play");
  const racing = inputPrefs.playMode === "race";
  page.querySelector("[data-act=free-roam]").classList.toggle("picked", !racing);
  page.querySelector("[data-act=race-daily]").classList.toggle("picked", racing && inputPrefs.raceKind === "daily");
  page.querySelector("[data-act=race-weekly]").classList.toggle("picked", racing && inputPrefs.raceKind === "weekly");
}

function showMenuPage(name) {
  menuPage = name;
  for (const id of ["home", "how", "controls", "settings", "ship", "play", "dev"]) {
    document.querySelector("#menu-" + id).hidden = id !== name;
  }
  document.querySelector("#menu-title").textContent = PAGE_TITLE[name];
  menu.classList.toggle("wide", name === "ship");
  paintDevEntry();
  if (name === "settings") paintSettings();
  if (name === "play") paintPlay();
  if (name === "dev") {
    paintDetails();
    document.querySelector("#dev-seed").value = inputPrefs.seed;
  }
  if (name === "ship") showShip();
  else hideShip();
  menuIx = name === "home" ? lastHomeIx : 0;
  focusMenu();
}

function menuButtons() {
  return [...document.querySelector("#menu-" + menuPage).querySelectorAll("button")].filter(
    (btn) => !btn.closest("[hidden]")
  );
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
  btns[menuIx].focus({ preventScroll: true });
  if (paused && menuPage === "home") lastHomeIx = menuIx;
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
  } else if (act === "developer") {
    inputPrefs.developer = !inputPrefs.developer;
    savePrefs();
    paintSettings();
    paintDevEntry();
    hooks.syncDevReadout();
    if (!inputPrefs.developer && inputPrefs.playMode !== "race") hooks.setPlayMode("free");
  } else if (act === "details") {
    inputPrefs.details = !inputPrefs.details;
    savePrefs();
    paintDetails();
    hooks.syncDevReadout();
  } else if (act === "load-seed") {
    waitingPlay = false;
    if (hooks.loadSeed(document.querySelector("#dev-seed").value)) setMenu(false);
  } else if (act === "free-roam") {
    waitingPlay = false;
    if (hooks.setPlayMode("free")) setMenu(false);
  } else if (act === "race-daily") {
    waitingPlay = false;
    if (hooks.setPlayMode("race", "daily")) setMenu(false);
  } else if (act === "race-weekly") {
    waitingPlay = false;
    if (hooks.setPlayMode("race", "weekly")) setMenu(false);
  } else if (act === "palette") {
    choosePalette(menuButtons()[menuIx]?.dataset.palette);
  } else if (act === "slot") {
    chooseSlot(menuButtons()[menuIx]?.dataset.slot);
  } else if (act === "exit") enterSplash();
  else if (act === "back") showMenuPage("home");
  else showMenuPage(act);
}

export function enterSplash() {
  waitingPlay = true;
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
  waitingPlay = true;
  setMenu(true);
  showMenuPage("play");
  syncPads();
}

export function spinSplash(dt) {
  splashAng += dt * 0.18;
  return splashAng;
}

export function setMenu(open) {
  if (!open && waitingPlay && !splash) {
    paused = true;
    menu.hidden = false;
    showMenuPage("play");
    clearLook();
    clearPadHold();
    syncPads();
    return;
  }
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
  if (!open) hideShip();
  clearPadHold();
  syncPads();
}

function padEdge(name, now) {
  const fire = now && !padHeld[name];
  padHeld[name] = now;
  return fire;
}

function padRepeat(name, now) {
  const t = performance.now();
  if (!now) {
    delete navHold[name];
    return false;
  }
  const slot = navHold[name];
  if (!slot) {
    navHold[name] = { next: t + 280 };
    return true;
  }
  if (t >= slot.next) {
    slot.next = t + 90;
    return true;
  }
  return false;
}

function fireToggle() {
  const act = uiButtons()[menuIx]?.dataset.act;
  if (TOGGLE_ACT[act]) runMenu(act);
}

export function pollUi() {
  const pads = navigator.getGamepads?.() ?? [];
  let start = false;
  let a = false;
  let b = false;
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  let any = false;
  for (const pad of pads) {
    if (!pad) continue;
    if (pad.buttons.some((btn) => btn.pressed || btn.value > 0.25)) any = true;
    if (pad.buttons[9]?.pressed || pad.buttons[8]?.pressed) start = true;
    if (pad.buttons[0]?.pressed) a = true;
    if (pad.buttons[1]?.pressed) b = true;
    if (pad.buttons[12]?.pressed || (pad.axes[1] ?? 0) < -0.55) up = true;
    if (pad.buttons[13]?.pressed || (pad.axes[1] ?? 0) > 0.55) down = true;
    if (pad.buttons[14]?.pressed || (pad.axes[0] ?? 0) < -0.55) left = true;
    if (pad.buttons[15]?.pressed || (pad.axes[0] ?? 0) > 0.55) right = true;
  }
  const startHit = padEdge("start", start);
  const aHit = padEdge("a", a);
  const bHit = padEdge("b", b);
  const leftHit = padEdge("left", left);
  const rightHit = padEdge("right", right);
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
  if (padRepeat("up", up)) {
    menuIx -= 1;
    focusMenu();
  }
  if (padRepeat("down", down)) {
    menuIx += 1;
    focusMenu();
  }
  if (leftHit || rightHit) {
    if (paused && menuPage === "ship") nudgeYaw(rightHit ? 1 : -1);
    else if (paused) fireToggle();
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

export function paintCrashStats(flight) {
  document.querySelector("#crash h1").textContent = "Pilot crashed";
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

export function paintFinishStats(run, best) {
  document.querySelector("#crash h1").textContent = "Pilot finished";
  crashStatsEl.innerHTML =
    "<li>Bodies <span>" +
    run.cleared +
    " / " +
    run.total +
    "</span></li>" +
    "<li>Time <span>" +
    fmtTime(run.t) +
    "</span></li>" +
    "<li>Ribbon miss <span>" +
    fmtDist(run.ribbon) +
    "</span></li>" +
    "<li>Top speed <span>" +
    fmtSpeed(run.vmax) +
    "</span></li>" +
    "<li>Distance <span>" +
    fmtDist(run.dist) +
    "</span></li>" +
    "<li>Gravity boosts <span>" +
    run.boosts +
    "</span></li>" +
    "<li>Best <span>" +
    (best ? fmtTime(best.t) : fmtTime(run.t)) +
    "</span></li>";
}

export function bindUi() {
  addEventListener("keydown", (e) => {
    if (splash) {
      e.preventDefault();
      if (!e.repeat) endSplash();
      return;
    }
    const menuOpen = paused || crashMode === "overlay";
    if (menuOpen) {
      const typing = e.target instanceof Element && e.target.closest("input, #ship-picker");
      if (e.code === "Escape") {
        e.preventDefault();
        if (e.repeat) return;
        if (!paused) setMenu(true);
        else if (menuPage !== "home") showMenuPage("home");
        else setMenu(false);
        return;
      }
      if (typing) return;
      if (e.code === "ArrowUp" || e.code === "ArrowDown") {
        e.preventDefault();
        menuIx += e.code === "ArrowDown" ? 1 : -1;
        focusMenu();
        return;
      }
      if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        e.preventDefault();
        if (paused && menuPage === "ship") nudgeYaw(e.code === "ArrowRight" ? 1 : -1);
        else if (paused) fireToggle();
        return;
      }
      if (e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        if (!e.repeat) uiButtons()[menuIx]?.click();
        return;
      }
      return;
    }
    if (e.code === "Enter" || e.code === "Escape") {
      e.preventDefault();
      if (!e.repeat) {
        if (crashMode !== "play") hooks.restartPlay();
        else setMenu(true);
      }
      return;
    }
    if (crashMode !== "play") return;
    hooks.onKey(e);
  });
  menu.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    const act = btn?.dataset.act;
    if (!act) return;
    const btns = menuButtons();
    const ix = btns.indexOf(btn);
    if (ix >= 0) menuIx = ix;
    focusMenu();
    runMenu(act);
  });
  crashEl.addEventListener("click", (e) => {
    const act = e.target.closest("button")?.dataset.act;
    if (act === "restart") hooks.restartPlay();
    else if (act === "menu") setMenu(true);
  });
  splashEl.addEventListener("click", endSplash);
}
