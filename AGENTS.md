# Slingshotta

Movement game. Meat Bag flies a ship through a small system and slings it off planets.

## Gravity, per pass

One visit to a planet's well, then the flags clear on the way out.

- Inside the body: crash. Reset to the start.
- Sweet band, and the pass is mostly sideways: one speed boost along velocity.
- Outside the well: gravity only. Asteroids crash, they do not pull.

Do not replace this with a generic orbit sim. Boost or crash is the game.

## Stack

Static site. `index.html` at the repo root. Three.js and PixiJS from the CDN import map in that file. No bundler, no package.json.

Three.js is the world. PixiJS is the HUD overlay (`pointer-events: none` so clicks still hit the view). Pause menu stays HTML.

Relative URLs only, so GitHub Pages project sites (`/slingshotta/`) work.

## Run

Any static server, then open the root. `file://` will not load the module.

World stays low-spec: pixel ratio 1, antialias off, no postprocessing. Pixi HUD may use `min(2, devicePixelRatio)`. Layout must fit 1440x900 with no page scroll. HUD sits on the bottom: speed left, 3D radar center, nearest body right. Planets show a spherical well haze.

World units are kilometres. `KM` in `src/physics.js` is the feel-preserving scale (Vela radius 6000 km, same arcade clock as the old unit system).

## Input

Arcade flight. The ship flies where the nose points. The blue arrow is a path read. A faint line trails the flown path. RCS jets flash on the hull while turning.

- Click the view for mouse pitch and yaw. Stop the mouse, stop the turn. Arrows do the same. A / D or Q / E roll. Pitch, yaw, and roll start inverted. Per-axis toggles on the Controls page.
- W thrust. S brake. Shift boost. No strafe.
- Gamepad: either stick aims, triggers thrust and brake, B boosts, bumpers roll.
- Enter or Esc pauses and opens the menu (resume, restart, how to play, controls, help).

## Files

- `src/physics.js` — step, arcade engine/align, and `selfCheck`. Change the rules here, not in the renderer.
- `src/hud.js` — Pixi overlay, radar projection, HUD `selfCheck`.
- `src/main.js` — scene, input, loop.
