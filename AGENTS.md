# Slingshotta

Movement game. Meat Bag flies a ship through a small system and slings it off planets.

## Gravity, per pass

One visit to a planet's well, then the flags clear on the way out.

- Inside the body: crash. Burst, then a "You crashed" screen. Restart from there.
- Sweet band, and the pass is mostly sideways: one speed boost along velocity.
- Outside the well: gravity only. Rocks have a small well and a thin band too.
- Drawn wells are ship instrumentation (cyan/amber rings), not planet tint. They only show when the ship is close. Inside the inner band, the view shakes and the HUD warns.

Do not replace this with a generic orbit sim. Boost or crash is the game.

## Stack

Static site. `index.html` at the repo root. Three.js and PixiJS from the CDN import map in that file. No bundler, no package.json.

Three.js is the world. PixiJS is the HUD overlay (`pointer-events: none` so clicks still hit the view). Pause menu stays HTML.

Relative URLs only, so GitHub Pages project sites (`/slingshotta/`) work.

## Run

Any static server, then open the root. `file://` will not load the module.

World stays low-spec: pixel ratio 1, antialias off, no postprocessing. Pixi HUD may use `min(2, devicePixelRatio)`. Layout must fit 1440x900 with no page scroll. HUD sits on the bottom center: speed left of the radar, nearest body right of it. A sun and colored gas sit in the system.

World units are kilometres. `KM` in `src/physics.js` is the feel-preserving scale (Vela radius 6000 km, same arcade clock as the old unit system).

## Input

Arcade flight. The ship flies where the nose points. A faint line trails the flown path. RCS jets flash on the hull while turning.

- The white tick on the nose is heading. The dashed cyan line is a ballistic read of current velocity.
- W thrust. S brake. Shift boost. No strafe.
- Gamepad: either stick aims, triggers thrust and brake, B boosts, bumpers roll.
- Enter or Esc pauses and opens the menu (resume, restart, how to play, controls, help).

## Files

- `src/physics.js` — step, arcade engine/align, and `selfCheck`. Change the rules here, not in the renderer.
- `src/hud.js` — Pixi overlay, radar projection, HUD `selfCheck`.
- `src/main.js` — scene, input, loop.
