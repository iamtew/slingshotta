# Audio

Generated SFX. No sample files this pass. `src/audio.js` bakes PCM into `AudioBuffer`s, then plays them through Web Audio. Music is later.

Splash shows a CRT load bar while cues bake, one cue per frame. Continue is locked until that finishes. The first press unlocks the `AudioContext`. A cue while the context is suspended is a skipped play. Flight still runs.

Pools are several takes of one cue, different noise seeds. The picker skips the take just played. Pitch wobble (±3%) is only on menu move. Sling, warn beep, crash, countdown, gate, and finish stay fixed so they stay readable.

Loops meet at the seam. One-shots are short. Everything is mono. The ship is the listener. No panner until something off the nose needs a direction.

## Mixer

```
sources → sfxGain → masterGain → compressor → destination
```

Buses are levels. Master and SFX only. Engine and ambience ride SFX. Music gets its own bus when it exists.

Settings → Audio holds two ranges. Stored on the input prefs (`volMaster`, `volSfx`). Defaults 1. Slider at 0 is mute. A muted bus stays muted.

The frame loop sets loop gains. Pause, splash, and the wreck panel duck the flight loops. `beginCrash` plays an impact and cuts the engine.

`selfCheck` covers the pool picker (no immediate repeat) and gain clamping. It does not open an audio context.

## Loops

Gain in the frame loop. Silent when the Pilot is not flying.

- [x] `engine` — the bell. Thrust and the brake burn, including the flip after S is released. A bit hotter on boost.
- [x] `boost` — layer on the bell while Shift is held. Not a replacement.
- [x] `space` — quiet hull air. Rises with speed.
- [x] `well` — low rumble. Silent outside, louder toward the body. Same rumble every planet and every rock.
- [x] `warn` — thin inner-band tone. Follows the shake band.
- [x] `rcs` — nitrogen while a pod is lit. A tap is a puff; a held turn holds the hiss.

## Flight one-shots

- [x] `engine-on` — bell lights. Pool of 3.
- [x] `engine-off` — bell dies. Pool of 2. The brake flip still has the bell lit, so this waits until the burn actually ends.
- [x] `sling` — the graze. Pool of 2. Twins: same length, same pitch center.
- [x] `well-in` — on the way in. Pool of 2.
- [x] `well-out` — on the way out. Pool of 2.
- [x] `warn-beep` — once when the inner band starts. The warn loop carries the rest.
- [x] `crash` — impact. Pool of 3.

## Race

- [x] `count` — each step of 3-2-1.
- [x] `go` — engines unlock.
- [x] `gate` — graze clears a body that is not the finish.
- [x] `finish` — last gate. Short sting, not a loop.

## Menu

Pause open reuses confirm. Pause close and Esc reuse back.

- [x] `ui-move` — arrows and d-pad. Pool of 3.
- [x] `ui-ok` — confirm. Pool of 2.
- [x] `ui-back` — back. Single take.

## Not now

Music (menu / flight / crash sting as a bed), a voice, a sound per planet, juice, strain, a tumble death, TOO STEEP as its own beep.
