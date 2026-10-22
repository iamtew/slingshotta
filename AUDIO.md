# Audio

Checklist for the files. Drop each one at the path shown and tick it. 33 files. Code is a later session; this list is the source of truth for names and which cues are pools.

A pool is several takes of one cue. The game picks among the takes that are not the one just played, so the same clip never repeats back to back. Pitch wobble (±3%) is code, and only on the RCS ticks and the menu move. The slingshot, the warn beep, and the crash stay fixed so they stay readable.

Loops that must meet at the seam are WAV. Music and one-shots are MP3. Mono for everything except the two music loops. Ambience and engine loops stay a few seconds. Music can be longer.

## Music

Splash itself is silent. The first press leaves the splash and starts the flight loop. Pause and the wreck panel crossfade to the menu loop.

- [ ] `static/audio/music/menu.mp3` — pause and the wreck panel. Calm, no drop.
- [ ] `static/audio/music/flight.mp3` — under the engine. Sparse. It does not lead.
- [ ] `static/audio/music/crash.mp3` — short sting after the impact. Not a loop.

## Ambience

Seamless WAV. One file each. Level is driven in code: space rises with speed, the well is silent outside and louder toward the body, the warn tone follows the inner-band shake. The same well rumble is every planet and every rock.

- [ ] `static/audio/amb/space.wav` — quiet hull air.
- [ ] `static/audio/amb/well.wav` — low rumble.
- [ ] `static/audio/amb/warn.wav` — thin inner-band tone.

## Engine loops

Seamless WAV. The bell loop covers thrust and the brake burn, including the flip after S is released. Boost sits on top while Shift is held.

- [ ] `static/audio/sfx/engine.wav` — the bell.
- [ ] `static/audio/sfx/boost.wav` — layer on the bell. Not a replacement.

## One-shots

MP3. A trailing number is a pool.

Bell:

- [ ] `static/audio/sfx/engine-on-1.mp3` — bell lights.
- [ ] `static/audio/sfx/engine-on-2.mp3`
- [ ] `static/audio/sfx/engine-on-3.mp3`
- [ ] `static/audio/sfx/engine-off-1.mp3` — bell dies. The brake flip still has the bell lit, so this waits until the burn actually ends.
- [ ] `static/audio/sfx/engine-off-2.mp3`

RCS. Short and quiet. A pod lighting up plays one tick, with a gap so a held turn does not machine-gun.

- [ ] `static/audio/sfx/rcs-1.mp3`
- [ ] `static/audio/sfx/rcs-2.mp3`
- [ ] `static/audio/sfx/rcs-3.mp3`
- [ ] `static/audio/sfx/rcs-4.mp3`

Slingshot. The graze. These two are twins: same length, same pitch center.

- [ ] `static/audio/sfx/sling-1.mp3`
- [ ] `static/audio/sfx/sling-2.mp3`

Well. Once per pass, on the way in and on the way out.

- [ ] `static/audio/sfx/well-in-1.mp3`
- [ ] `static/audio/sfx/well-in-2.mp3`
- [ ] `static/audio/sfx/well-out-1.mp3`
- [ ] `static/audio/sfx/well-out-2.mp3`

Warn and crash. The beep is a single file, played once when the inner band starts. The warn loop above carries the rest. The impacts play, then the crash sting.

- [ ] `static/audio/sfx/warn.mp3`
- [ ] `static/audio/sfx/crash-1.mp3`
- [ ] `static/audio/sfx/crash-2.mp3`
- [ ] `static/audio/sfx/crash-3.mp3`

Menu. Pause open reuses confirm. Pause close and Esc reuse back. Settings, paint, and the crash buttons reuse these three.

- [ ] `static/audio/sfx/ui-move-1.mp3` — arrows and d-pad.
- [ ] `static/audio/sfx/ui-move-2.mp3`
- [ ] `static/audio/sfx/ui-move-3.mp3`
- [ ] `static/audio/sfx/ui-ok-1.mp3` — confirm.
- [ ] `static/audio/sfx/ui-ok-2.mp3`
- [ ] `static/audio/sfx/ui-back.mp3` — back. Single file.

## Not now

No files for these. The same module grows the cues when the features land: a voice, a sound per planet, juice, strain, a tumble death, race gates.

## When the code lands

One module, `src/audio.js`. No library. Web Audio only: music, ambience, and effects into a master gain, then one compressor so a boost plus a crash does not clip. A missing file is a skipped cue. Flight still runs.

Buses are levels. The ship is the listener. No panner until something off the nose needs a direction.

The frame loop sets the bell and the boost layer, and sets the three ambience levels. `hit.event === "boost"` plays the slingshot. `beginCrash` plays an impact and cuts the engine. The rising edge of the inner band plays the beep.

Settings grows four ranges: master, music, ambience, effects. Stored beside the input prefs. Defaults: master 1, music 0.45, ambience 0.7, effects 1. A muted bus stays muted.

`selfCheck` covers the pool picker (no immediate repeat) and gain clamping. It does not open an audio context.
