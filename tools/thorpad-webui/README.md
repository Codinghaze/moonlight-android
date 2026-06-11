# ThorPad Layout Designer

A tiny, self-contained web tool for visually designing **ThorPad** control-pad
layouts for the AYN Thor handheld (Moonlight / Artemis game-streaming client),
and exporting/importing them in the exact JSON format the Android app reads.

No build step, no framework, no server. Plain HTML + CSS + vanilla JS.

## Live version

Hosted on GitHub Pages — no download needed:
**https://codinghaze.github.io/moonlight-android/**

(Auto-deploys from `tools/thorpad-webui/` on every push to `main`.)

## Files

- `index.html` — the app (open this)
- `styles.css` — styling (dark, device-matching theme)
- `app.js` — all logic

## How to open

Just double-click `index.html`, or open it in any browser:

```
file:///Users/zach/Development/MoonlightThor/artemis/tools/thorpad-webui/index.html
```

Everything is loaded relatively, so `file://` works fine. If your browser is
strict about local files, run a trivial static server from this folder instead:

```bash
python3 -m http.server 8080
# then visit http://localhost:8080/
```

## How to use

1. **Canvas** — represents the Thor bottom screen (1240 x 1080 aspect).
   Drag an element to move it; drag the blue corner handle to resize.
   Toggle **Snap to grid** in the top bar for clean alignment.
2. **Add elements** — `+ Trackpad` and `+ Button` in the top bar.
   - *Trackpad*: shaded striped rectangle, no label/action (mouse movement area).
   - *Button*: has a label and an action.
3. **Select** an element (click it) to edit it in the right-hand properties panel:
   - Numeric `x / y / w / h` (fractions 0..1) — editing these moves/resizes the
     element on the canvas, and dragging updates the numbers. Two-way bound.
   - `label` (buttons only)
   - **Style** (buttons only): `fill color`, `text color`, `corners` (0–3
     roundness), `font size`, and an `opacity` slider. These map to the
     `color / textColor / radius / fontSize / alpha` JSON keys; defaults are
     omitted from the export so untouched buttons stay clean.
   - **Action editor** (buttons only): pick the action type and fill in details:
     - `key` — key picker (letters, digits, or named keys like `enter`, `esc`,
       `f5`, `volup`, …) plus `shift / ctrl / alt / meta` modifier checkboxes.
     - `text` — a string typed as keystrokes on the host.
     - `mouse` — `left / right / middle` click.
     - `macro` — an ordered list of steps; add `key / text / mouse / delay`
       steps, reorder with the arrows, remove with `×`.
     - **On-device specials** (no host needed): `keyboard` (toggle the on-screen
       keys), `zoom` (toggle top-screen zoom — set the scale), `settings` (open
       the layout manager), `reload` (re-read this layout's JSON).
4. **Top-level fields** — layout `name` and `trackpadSensitivity` in the top bar.
5. **JSON preview** (far right) updates live as you edit.
6. **Export** downloads `<name>.json`. **Import** lets you paste JSON or upload a
   `.json` file; it round-trips losslessly. Invalid JSON is reported, not loaded.
7. **Templates** menu: *Default A/B/C/D*, *Mac desktop*, *Blank (trackpad only)*.
8. **Validation** — overlapping or out-of-bounds elements are outlined in red and
   listed as warnings under the canvas. (These are warnings, not blockers.)

Press `Delete` / `Backspace` to remove the selected element (when not typing in a
field).

## JSON format

```json
{
  "name": "default",
  "trackpadSensitivity": 1.4,
  "elements": [
    { "type": "trackpad", "x": 0.0, "y": 0.0, "w": 0.78, "h": 1.0 },
    { "type": "button", "x": 0.80, "y": 0.02, "w": 0.18, "h": 0.225,
      "label": "A", "action": { "type": "key", "key": "A", "modifiers": ["ctrl"] } }
  ]
}
```

All `x, y, w, h` are fractions of the screen (0..1); `x, y` is the top-left
corner, `w, h` the size. Action shapes:

- `{ "type": "key",  "key": "A", "modifiers": ["ctrl"] }`
  Key names: a single letter/digit, or one of:
  `enter esc space tab backspace delete up down left right home end pageup
  pagedown f1..f12 volup voldown mute playpause next prev`.
  Modifiers (optional): `shift ctrl alt meta`.
- `{ "type": "text", "text": "hello world" }`
- `{ "type": "mouse", "button": "left" }`  (`left | right | middle`)
- `{ "type": "macro", "steps": [ <action>, { "type": "delay", "ms": 100 }, <action> ] }`

## Getting a layout onto the device

Export your `.json`, then push it to the Thor over `adb`. Layouts live in the
app's external files dir, one file per streamed app:

```bash
adb push <appname>.json /sdcard/Android/data/com.limelight.noirdebug/files/thorpad/<appname>.json
```

For example, a layout named `default` for a game would be pushed as
`default.json` into that `thorpad/` folder. Re-launch / re-stream the app on the
Thor to pick up the new layout.
