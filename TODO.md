# Backlog

Later sessions. One item at a time. No flight code in the session that wrote this file.

Base today: `layout("classic")` in `src/world.js` (hand-placed Vela: planets, moons, rocks, `SPAWN`), arcade step in `src/physics.js`, Pixi HUD in `src/hud.js`, HTML crash panel ("Pilot crashed" plus flight stats). Preferences already live in `localStorage` (`slingshotta-input`).

Rules stay in `physics.js`, or one new module if that file would bloat. Each non-trivial rule gets a `selfCheck`.

## 1. Call the player Pilot (done)

Copy only. Splash, pause, how-to, help, crash title, `AGENTS.md`, and `README.md` say Pilot where they currently say "you" in the flight sense. Ship name stays Slingshot Racer.

## 2. G-force meter and strain picture (done)

`feltG` in `src/physics.js`: sideways `|Δv| / dt / FELT`, sampled around engine/step/align. HUD G ball beside speed, high G reuses inner-band shake plus a Pixi tunnel vignette.

## 3. Juice and Pilot health

Reads `feltG` from physics. Two modes, picked before flight (menu). Default Casual Pain.

- **Juice.** A cockpit shot (key plus a touch pad) that raises the G the Pilot can hold for a few seconds. Limited doses. Refill only in Casual, and only while G is calm.
- **Casual Pain.** Strain builds above the comfort G and falls back when the Pilot eases off. Vision and control dull at the top. The Pilot does not die from strain.
- **Permanent Pain.** The same strain writes injuries that never heal. Enough of them and the Pilot dies. Engines cut, the hull keeps its last spin, and the ship tumbles. Crash-into-a-body stays the existing burst in `beginCrash`.
- **Wreck screen.** Reuse `#crash`. Headline is the killing blow (impact, or the injury that finished the Pilot). Under it, every injury from that run, so a long bad flight is a long list. Store the last wreck in `localStorage` and show one epitaph line on the next splash.

Injury names stay a short fixed list (blackout, redout, burst vessel, and so on), picked from how hard and how long the G was. No medical sim.

## 4. Seeded universe (done)

Done. `layout(seed)` in `src/world.js`. Same string in, same bodies out. Boot is `layout("classic")`, today's Vela system and spawn, so free flight does not move. A seed longer than 8 characters throws.

- Daily seed, UTC date: `20261022`
- Weekly seed, ISO week, Monday start: `2026WW43` (the double W is the written form)

Free space can take an optional seed later. Do not generate a new layout on every boot.

## 5. Auto race (done)

Done. `course(world)` in `src/race.js`. Gates are planets, moons, and asteroids (`asteroid` on the big rocks and hulks). Belt pebbles are not gates. Consecutive wells must sit apart, and the hop must not bore through a body. Start outside the first well. Finish is the last gate. Same seed, same course.

Score is time to the last gate plus mean distance off the ribbon (`t + meanRibbon / CRUISE`). Top speed is shown, not sorted on. Pause Play page: Free roam (weekly seed, no gates), Daily, Weekly. Typed seed stays on Developer. Local best is `slingshotta-race` per seed.

## 6. Scores, still on GitHub

Pages cannot keep a write secret. Two steps, second one only after races feel worth timing.

- **Yours.** Done with the race: `localStorage` key `slingshotta-race`, best per seed. No server.
- **Shared.** A score issue template plus a GitHub Action that appends sane rows (seed matches, time above zero and under a cap) to a JSON file the page fetches raw. Cheating is accepted. No second host, no token in the client. If that click-to-file-an-issue flow is too clumsy, stop there.

Seed string builds the universe layout, which builds the gate chain. Flight step feeds felt G, which feeds juice and strain, which feeds the wreck list. A race writes a local best, and that best is what a later shared board would publish.

## 7. Audio

First pass is in. Generated WebAudio SFX, Master/SFX sliders, bake bar on splash. Cue list and mixer notes stay in [AUDIO.md](AUDIO.md). Music and extra buses wait.
