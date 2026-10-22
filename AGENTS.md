# Slingshotta

Movement game. Meat Bag flies a ship through a wide system and slings it off planets.

## Gravity, per pass

One visit to a planet's well, then the flags clear on the way out.

- Inside the body: crash. Burst, then a "Pilot crashed" screen. Restart from there.
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
Meat Bag hosts `http://localhost:8000` during development, Clanker doesn't need to host one, because Meat Bag is a real G.

World stays low-spec: pixel ratio 1, antialias off, no postprocessing. Pixi HUD may use `min(2, devicePixelRatio)`. Layout must fit 1440x900 with no page scroll. HUD sits on the bottom center: speed left of the radar, nearest body right of it. The sun and nebula live on a camera-locked sky, not as bodies in the system.

World units are metres. `KM` in `src/physics.js` is the feel-preserving arcade clock. Planets are large vs the racer (a Vela graze is several seconds at cruise) and far apart. HUD shows m/s and metres, kilometres past 1000 m.

## Input

Arcade flight. The ship flies where the nose points. A faint line trails the flown path. The ship is the Slingshot Racer: domed heat shield nose, green pressure vessels, big bell, and a truss with 8 thruster pods. RCS jets flash on those pods while turning; a jet fires when its torque agrees with the spin. The chase camera turns a bit slower than the ship, so turns show the hull side-on. In a well it peeks toward the body so the slingshot stays in view. The hull is drawn small against the KM worlds.

- The heat-shield nose is heading. The dashed cyan line is a ballistic read of current velocity. Burns leave a bright trail from the bell; RCS jets leave dimmer streaks.
- W thrust. S brake: the hull pitches so the bell burns; release continues through a full turn. Shift boost. No strafe. In a well the hull leans toward the body and the path follows. The heading picks up the bend so the exit keeps the slingshot.
- Gamepad: either stick aims, triggers thrust and brake, B boosts, bumpers roll. Start opens the menu. D-pad or left stick moves, A selects, B backs. Right stick looks around Molniya on the Ship page.
- Touch overlays (auto on coarse pointers): thrust, brake, boost, roll, look disc, and a Menu button. Portrait and landscape both work. Settings can force overlays on or off.
- Gyro (off until granted in Settings): tilt aims pitch and yaw. Engines stay on the overlays.
- Enter, Esc, Start, or the Menu overlay pauses (Ship, resume, restart, how to play, controls, settings, help). Arrows move the menu, Enter selects, Esc backs out. Controls lists bindings. Settings holds invert, overlays, and gyro. Ship is Molniya: a preview, part specs, and three paints (vessels, pods, truss).
- Splash first: ship coasts, camera orbits it, any button continues. Menu Exit returns to splash. HUD drive reads RCS pitch/yaw/roll while jets fire.

Keep a file under ~500 lines. Split at a named concern before it grows past that.

## Files

- `assets/` — source marks (Affinity, logo SVG). Not served. Rebuild published copies with `just assets`.
- `static/img/` — what the site loads: logo SVG and favicon.
- `static/fonts/` — served WOFF. ENOCH is the display face for splash/menu/crash titles and HUD alerts.
- `Justfile` — copy the logo and bake a light favicon from the black `assets/` SVG.
- `src/physics.js` — step, arcade engine/align, and `selfCheck`. Change the rules here, not in the renderer.
- `src/hud.js` — Pixi overlay, radar projection, HUD `selfCheck`.
- `src/tilt.js` — device tilt to screen yaw/pitch, and `selfCheck`.
- `src/world.js` — `layout(seed)`, daily and weekly seed strings. `classic` is the hand-placed Vela system. Seeds are at most 8 characters.
- `src/ship.js` — Slingshot Racer mesh, RCS jets, plume, livery paint.
- `src/shipview.js` — pause-menu ship preview, palettes, custom color.
- `src/sky.js` — camera-locked nebula/sun, stars, planet canvases.
- `src/fx.js` — flown-path trail from the bell, RCS streaks, ballistic ghost line, crash burst.
- `src/input.js` — prefs, keys, mouse, pads, gyro. Does not import UI.
- `src/ui.js` — splash, pause pages, crash overlay. Settings toggles Developer mode. The Developer page loads an 8-character seed and can show a corner readout.
- `src/main.js` — renderer, wells, camera, flight loop.
