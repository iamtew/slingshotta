# Slingshotta

Movement game. Meat Bag flies a ship through a small system and slings it off planets.

## Gravity, per pass

One visit to a planet's well, then the flags clear on the way out.

- Inside the body: crash. Reset to the start.
- Sweet band, and the pass is mostly sideways: one speed boost along velocity.
- In the well but aimed steeply at the body: reflect off the radial line and slow down.
- Outside the well: gravity only. Asteroids crash, they do not pull.

Do not replace this with a generic orbit sim. The three outcomes are the game.

## Stack

Static site. `index.html` at the repo root. Three.js from the CDN import map in that file. No bundler, no package.json, no second renderer.

Relative URLs only, so GitHub Pages project sites (`/slingshotta/`) work.

## Run

Any static server, then open the root. `file://` will not load the module.

Low-spec on purpose: pixel ratio 1, antialias off, no postprocessing. Layout must fit 1440x900 with no page scroll. HUD stays in the corner.

## Input

Attitude and velocity are separate. Turning the nose does not bend the path. The blue arrow is the path. Translation thrusters and the main engine change it.

- Click the view for mouse pitch and yaw. Arrows do the same. Q / E roll.
- W / S main engine. A / D strafe. Space / C up and down.
- Gamepad: right stick aims, left stick strafes and thrusts, triggers throttle, bumpers roll.
- Enter or Esc pauses and opens the menu (resume, restart, how to play, controls, help).

## Files

- `src/physics.js` — step and `selfCheck`. Change the rules here, not in the renderer.
- `src/main.js` — scene, input, loop.
