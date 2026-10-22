// Molniya in the pause menu. Preview canvas, bureau palettes, saved paint.
import * as THREE from "three";
import { createRacer, paintLivery } from "./ship.js";

const PALETTES = {
  lavochkin: { vessel: "#4a6b45", pods: "#c8b07a", truss: "#48577a" },
  baikonur: { vessel: "#e6e1d3", pods: "#d5e6f2", truss: "#c47a3a" },
  krasnaya: { vessel: "#8e2a2a", pods: "#d4a24a", truss: "#ff9a3c" },
  nauka: { vessel: "#7ec8c3", pods: "#e8eef2", truss: "#e07a3d" },
  mir: { vessel: "#1e3a5f", pods: "#5ec8e6", truss: "#f0e6d4" },
};

const STORE = "slingshotta-livery";
const state = {
  palette: "lavochkin",
  slot: "vessel",
  colors: { ...PALETTES.lavochkin },
};

export function parseHex(s) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(s).trim());
  return m ? "#" + m[1].toLowerCase() : null;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function selfCheck() {
  assert(parseHex("aabbcc") === "#aabbcc", "hex");
  assert(parseHex("#AABBCC") === "#aabbcc", "hash");
  assert(parseHex("gg0000") === null, "junk");
}

function saveLivery() {
  localStorage.setItem(STORE, JSON.stringify(state));
}

export function loadLivery() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || "{}");
    if (saved.palette === "custom" || PALETTES[saved.palette]) state.palette = saved.palette;
    if (saved.slot === "vessel" || saved.slot === "pods" || saved.slot === "truss") state.slot = saved.slot;
    if (saved.colors) {
      for (const key of ["vessel", "pods", "truss"]) {
        const hex = parseHex(saved.colors[key] || "");
        if (hex) state.colors[key] = hex;
      }
    } else if (PALETTES[state.palette]) {
      state.colors = { ...PALETTES[state.palette] };
    }
  } catch {
    /* keep factory */
  }
  paintLivery(state.colors);
}

function paintChrome() {
  const page = document.querySelector("#menu-ship");
  if (!page) return;
  for (const btn of page.querySelectorAll("[data-palette]")) {
    btn.classList.toggle("picked", btn.dataset.palette === state.palette);
  }
  const custom = document.querySelector("#ship-custom");
  const wheel = document.querySelector("#ship-wheel");
  custom.hidden = state.palette !== "custom";
  wheel.hidden = state.palette !== "custom";
  for (const btn of custom.querySelectorAll("[data-slot]")) {
    btn.classList.toggle("picked", btn.dataset.slot === state.slot);
    btn.style.boxShadow = "inset 6px 0 0 " + state.colors[btn.dataset.slot];
  }
  document.querySelector("#ship-hex").value = state.colors[state.slot];
}

let picker = null;
let pickerTask = null;

function onPick(color) {
  const hex = parseHex(color.hexString);
  if (!hex || hex === state.colors[state.slot]) return;
  state.colors[state.slot] = hex;
  state.palette = "custom";
  paintLivery(state.colors);
  saveLivery();
  paintChrome();
}

function syncPicker() {
  if (!picker) return;
  const hex = state.colors[state.slot];
  if (parseHex(picker.color.hexString) !== hex) picker.color.hexString = hex;
}

function ensurePicker() {
  if (picker) {
    syncPicker();
    return;
  }
  if (pickerTask) return;
  pickerTask = import("@jaames/iro")
    .then((mod) => {
      const iro = mod.default;
      picker = iro.ColorPicker("#ship-picker", {
        width: 180,
        color: state.colors[state.slot],
        borderWidth: 1,
        borderColor: "#31465f",
        layout: [
          { component: iro.ui.Wheel },
          { component: iro.ui.Slider, options: { sliderType: "value" } },
        ],
      });
      picker.on("color:change", onPick);
      syncPicker();
    })
    .catch(() => {
      pickerTask = null;
      document.querySelector("#ship-picker-fail").hidden = false;
    });
}

let view = null;
let active = false;
let raf = 0;
let dragging = false;
let yaw = 0.7;
let pitch = 0.28;
let last = 0;
let dragX = 0;
let dragY = 0;

function placeCam() {
  const dist = 7.6;
  const cp = Math.cos(pitch);
  view.camera.position.set(Math.sin(yaw) * cp * dist, Math.sin(pitch) * dist + 0.35, Math.cos(yaw) * cp * dist);
  view.camera.lookAt(0, 0.1, -0.2);
}

function fit() {
  const canvas = view.renderer.domElement;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w < 2 || h < 2) return;
  if (canvas.width !== w || canvas.height !== h) {
    view.renderer.setSize(w, h, false);
    view.camera.aspect = w / h;
    view.camera.updateProjectionMatrix();
  }
}

function frame(now) {
  raf = 0;
  if (!active || !view) return;
  const dt = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;
  // Right stick matches a drag: x yaws, y pitches. Auto-spin waits while it is held.
  const looking = stickOrbit(dt);
  if (!dragging && !looking) yaw += dt * 0.28;
  placeCam();
  fit();
  view.renderer.render(view.scene, view.camera);
  raf = requestAnimationFrame(frame);
}

function ensureView() {
  if (view) return;
  const canvas = document.querySelector("#ship-view");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "low-power" });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x07080e);
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xc4d2e4, 0.55));
  const sun = new THREE.DirectionalLight(0xffd4a8, 1.25);
  sun.position.set(3, 4, 5);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  const { plume } = createRacer(scene, 1);
  plume.visible = false;
  view = { renderer, scene, camera };

  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    dragX = e.clientX;
    dragY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    yaw += (e.clientX - dragX) * 0.01;
    pitch = Math.max(-0.9, Math.min(0.9, pitch + (e.clientY - dragY) * 0.01));
    dragX = e.clientX;
    dragY = e.clientY;
  });
  const endDrag = (e) => {
    dragging = false;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
}

const STICK_DEAD = 0.18;
const STICK_RATE = 1.8;

function stickOrbit(dt) {
  let used = false;
  const pads = navigator.getGamepads?.() ?? [];
  for (const pad of pads) {
    if (!pad) continue;
    const rx = pad.axes[2] ?? 0;
    const ry = pad.axes[3] ?? 0;
    if (Math.abs(rx) > STICK_DEAD) {
      yaw += rx * STICK_RATE * dt;
      used = true;
    }
    if (Math.abs(ry) > STICK_DEAD) {
      pitch = Math.max(-0.9, Math.min(0.9, pitch + ry * STICK_RATE * dt));
      used = true;
    }
  }
  return used;
}

export function nudgeYaw(dir) {
  yaw += dir * 0.22;
}

export function showShip() {
  ensureView();
  active = true;
  last = performance.now();
  paintChrome();
  if (state.palette === "custom") ensurePicker();
  if (!raf) raf = requestAnimationFrame(frame);
}

export function hideShip() {
  active = false;
}

export function choosePalette(id) {
  if (id !== "custom" && !PALETTES[id]) return;
  state.palette = id;
  if (PALETTES[id]) {
    state.colors = { ...PALETTES[id] };
    paintLivery(state.colors);
  }
  saveLivery();
  paintChrome();
  if (id === "custom") ensurePicker();
}

export function chooseSlot(slot) {
  if (slot !== "vessel" && slot !== "pods" && slot !== "truss") return;
  state.slot = slot;
  saveLivery();
  paintChrome();
  syncPicker();
}

document.querySelector("#ship-hex").addEventListener("input", () => {
  const hex = document.querySelector("#ship-hex");
  const next = parseHex(hex.value);
  if (!next) return;
  state.colors[state.slot] = next;
  state.palette = "custom";
  paintLivery(state.colors);
  saveLivery();
  syncPicker();
  paintChrome();
});

selfCheck();
loadLivery();
