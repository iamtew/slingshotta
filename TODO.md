# Backlog

Later sessions. One item at a time. No flight code in the session that wrote this file.

Base today: hand-placed system in `src/main.js` (`planets`, moons, rocks, `SPAWN`), arcade step in `src/physics.js`, Pixi HUD in `src/hud.js`, HTML crash panel ("You crashed" plus flight stats). Preferences already live in `localStorage` (`slingshotta-input`).

Rules stay in `physics.js`, or one new module if that file would bloat. Each non-trivial rule gets a `selfCheck`.

## 1. Call the player Pilot

Copy only. Splash, pause, how-to, help, crash title, `AGENTS.md`, and `README.md` say Pilot where they currently say "you" in the flight sense. Ship name stays Slingshot Racer.

## 2. G-force meter and strain picture

Felt G is the sideways change in velocity, not raw `m/s² / 9.81`. Cruise is already `12 * KM` m/s (`KM` is 500), so real gees would pin the needle on the first bend. Scale so a hard slingshot sits near the top of an airplane-style gauge and a gentle turn sits low. Sample it where `step` already changes `vx, vy, vz`. Along-track thrust counts little; the turn counts.

HUD: a small gauge on the existing bottom cluster in `src/hud.js`, beside speed. High G reuses the shake that already runs inside the inner band, plus a tunnel vignette on the Pixi overlay. No new postprocessing.

## 3. Juice and Pilot health

Two modes, picked before flight (menu). Default Casual Pain.

- **Juice.** A cockpit shot (key plus a touch pad) that raises the G the Pilot can hold for a few seconds. Limited doses. Refill only in Casual, and only while G is calm.
- **Casual Pain.** Strain builds above the comfort G and falls back when the Pilot eases off. Vision and control dull at the top. The Pilot does not die from strain.
- **Permanent Pain.** The same strain writes injuries that never heal. Enough of them and the Pilot dies. Engines cut, the hull keeps its last spin, and the ship tumbles. Crash-into-a-body stays the existing burst in `beginCrash`.
- **Wreck screen.** Reuse `#crash`. Headline is the killing blow (impact, or the injury that finished the Pilot). Under it, every injury from that run, so a long bad flight is a long list. Store the last wreck in `localStorage` and show one epitaph line on the next splash.

Injury names stay a short fixed list (blackout, redout, burst vessel, and so on), picked from how hard and how long the G was. No medical sim.

## 4. Seeded universe

Move body placement out of the top of `src/main.js` into one generator. Same string in, same bodies out. A tiny numeric hash (no dependency) feeds the loops that already exist: planets, moons, belt rocks, rocks between neighbors.

The hand layout stays. Seed `classic` is today's Vela system and today's spawn, so free flight does not move.

- Daily seed, UTC date: `20261022`
- Weekly seed, ISO week, Monday start: `2026WW43` (the double W is the written form)

Free space can take an optional seed later. Do not generate a new layout on every boot.

## 5. Auto race

A race is an ordered chain of graze gates on bodies from that seed. The builder walks planets whose wells are apart and whose connecting segment does not bore through a body. Start outside the first well. Finish is the last gate. Same seed, same course.

Score is time to the last gate, plus how far the flown path sat off the ribbon between gates. Top speed is shown, not the thing you sort on. Menu grows a mode row: Free space (what exists now) and Race (today's daily, this week's weekly, or a typed seed).

## 6. Scores, still on GitHub

Pages cannot keep a write secret. Two steps, second one only after races feel worth timing.

- **Yours.** `localStorage` best per mode and seed. No server.
- **Shared.** A score issue template plus a GitHub Action that appends sane rows (seed matches, time above zero and under a cap) to a JSON file the page fetches raw. Cheating is accepted. No second host, no token in the client. If that click-to-file-an-issue flow is too clumsy, stop there.

Seed string builds the universe layout, which builds the gate chain. Flight step feeds felt G, which feeds juice and strain, which feeds the wreck list. A race writes a local best, and that best is what a later shared board would publish.
