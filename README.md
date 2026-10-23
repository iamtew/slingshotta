# Slingshotta

Fly a ship past planets. Graze the ring for a boost. Hit the body and the Pilot crashes.

## Play

From this folder:

```
npx serve .
```

Open the URL it prints. Press a button on the splash to fly. Click the view to capture the mouse. Enter, Esc, Start, or the Menu overlay opens the menu. Portrait and landscape both work. On a phone, translucent pads cover thrust, brake, boost, roll, and look. Gyro aim is off until you grant it in Settings.

The ship flies where the nose points. W thrusts, S brakes by pitching the hull so the bell burns (release finishes the flip), Shift boosts. In a well the hull leans in and the path follows; the Pilot keeps that curve on the way out. Mouse or arrows pitch and yaw. A / D rolls. The heat-shield nose is heading. The dashed cyan line is where current velocity goes. The round disc is a 3D radar. Graze the instrument rings around a body. Rocks have a small well too. Speeds are m/s. Distances are metres, kilometres past 1000 m.

A gamepad works too: either stick aims, triggers thrust and brake, B boosts, bumpers roll. Start opens the menu, A selects, B backs. Hold D-pad to run the list. Left or right on a settings row cycles it.

Controls in the pause menu lists fly and pause bindings. How to play is the briefing. Settings holds invert, touch overlays (auto / on / off), and gyro.

## Marks

Source files live in `assets/` and stay black for the editor. The site reads `static/img/` and `static/fonts/`. The splash paints the SVG with the title color; `just assets` tints the favicon to match. After changing the logo:

```
just assets
```

## GitHub Pages

Repo root is the site. Relative URLs, so a project site works. The share card is the line in `index.html`, with the picture at `static/img/og.jpg` (absolute Pages URL, because crawlers drop a relative one).

Settings, Pages, deploy from the branch that has `index.html` at the root.

Backlog for later sessions: [TODO.md](TODO.md).

## License

GNU Affero General Public License v3.0. See [LICENSE](LICENSE).

ENOCH (Modestype) in `static/fonts/` is personal-use unless you buy the commercial pack.
