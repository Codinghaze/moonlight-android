# Hati 🐺🌙

**Hati** is a dual-screen game-streaming client for the **AYN Thor** handheld. The game/desktop
streams on the top screen, while the bottom touchscreen becomes a fully customizable control pad —
a trackpad, macro buttons, an on-screen keyboard, and per-app JSON layouts. Named for the Norse
wolf that forever chases the moon (Máni) across the sky.

Hati is a fork of **[Artemis](https://github.com/ClassicOldSong/moonlight-android)** (a.k.a. Moonlight
Noir) by ClassicOldSong, which is itself a fork of **[Moonlight](https://github.com/moonlight-stream/moonlight-android)**.
It is distributed under the **GPL-3.0** license, the same as its upstreams. Full credit to the
Moonlight and Artemis projects — see [NOTICE.md](NOTICE.md).

Pair it with [Apollo](https://github.com/ClassicOldSong/Apollo) / [Sunshine](https://github.com/LizardByte/Sunshine)
(or compatible forks like Lumen) on your host PC/Mac.

---

## How the dual screen works

Everything Artemis already does happens on the **top** screen (`displayId 0`). The only new
piece is **ThorPad**: a control surface Hati launches onto the Thor's **bottom** screen
(the secondary display) the moment a stream starts.

When a stream comes up on the primary display, [Game.java](app/src/main/java/com/limelight/Game.java)
calls `maybeLaunchThorPad()`, which finds the secondary display and starts
[ThorPadActivity](app/src/main/java/com/limelight/ThorPadActivity.java) on it via
`ActivityOptions.setLaunchDisplayId()`. The pad shares the stream's live `NvConnection`, so every
touch, button, and macro is dispatched to the host over the existing GameStream input channel — no
second connection, no host-side agent. If there's no secondary display (i.e. you're not on a Thor),
ThorPad simply doesn't launch and Hati behaves like stock Artemis.

## ThorPad control pad

ThorPad renders a control surface from a JSON layout. Layouts are plain files you can drop in over
USB or edit on-device — **no rebuild needed**.

### Per-app layouts

Layout files live under `<externalFilesDir>/thorpad/` on the device
(`Android/data/dev.codinghaze.hati/files/thorpad/`). They're resolved **per streamed app**:

1. `<app_name>.json` — e.g. streaming **Vault Hunters** looks for `vault_hunters.json`
2. `default.json` — fallback for any app without its own layout
3. a built-in default baked into the app

### Layout format

Elements are positioned with **normalized** coordinates — `x / y / w / h` are fractions `0..1` of
the screen, so a layout is resolution-independent. Two element types:

- **`trackpad`** — a mouse-movement area (drag to move the cursor, tap to click).
- **`button`** — a labeled key that fires an **action**.

```json
{
  "name": "Vault Hunters",
  "trackpadSensitivity": 1.4,
  "elements": [
    { "type": "trackpad", "x": 0, "y": 0, "w": 1, "h": 0.5 },
    { "type": "button", "x": 0.025, "y": 0.775, "w": 0.18, "h": 0.2,
      "label": "❤️", "action": { "type": "key", "key": "c" } },
    { "type": "button", "x": 0.6, "y": 0.775, "w": 0.18, "h": 0.2,
      "label": "🔥", "action": { "type": "key", "key": "f" } }
  ]
}
```

### Actions

Button actions are parsed in `ThorPadActivity.executeAction()`. Input actions go to the host over
the stream; UI actions stay local on the pad.

| `type` | Sends to host | Fields |
|---|---|---|
| `key` | a keystroke | `key`, optional `modifiers`: `ctrl` / `shift` / `alt` / `meta` |
| `text` | a string typed as keystrokes | `text` |
| `mouse` | a mouse click | `button`: `left` / `right` / `middle` |
| `macro` | an ordered sequence | `steps`: any of the above plus `{ "type":"delay", "ms":100 }` |
| `keyboard` | *(local)* toggles the on-screen keyboard panel | — |
| `zoom` | *(local)* toggles the top-screen video between 1× and a scale | `scale` |
| `settings` | *(local)* opens the on-device layout manager | — |
| `reload` | *(local)* hot-reloads the current layout JSON | — |

> Note: `text` is delivered as real key events rather than `sendUtf8Text`, because some hosts
> (e.g. Sunshine on macOS) don't honor UTF-8 text packets — so it is keyboard-layout sensitive.

## Editing layouts

**On the device** — bind a button to `{ "action": { "type": "settings" } }` (or use the built-in
default pad) to open [ThorPadSettingsActivity](app/src/main/java/com/limelight/ThorPadSettingsActivity.java):
list / create-per-app / edit / save-and-hot-reload / delete layout files. Good for quick
on-the-couch tweaks.

**On a computer** — the richer drag-and-drop builder is the web tool in
[tools/thorpad-webui/](tools/thorpad-webui/). It's a zero-dependency HTML/CSS/JS page: just open
`index.html`, lay out trackpads and buttons visually, and export the exact JSON the app reads.
See [its README](tools/thorpad-webui/README.md).

## Build & run

Toolchain (JDK 17 + Android SDK/NDK) is configured for development on the Thor. Convenience
deploy scripts are at the repo root:

```bash
# Build, install, and launch Hati on a connected Thor
./deploy-hati.sh

# Or build the APK directly
./gradlew assembleNonRoot_gameDebug
#   → app/build/outputs/apk/nonRoot_game/debug/app-nonRoot_game-arm64-v8a-debug.apk
```

- **applicationId:** `dev.codinghaze.hati` (debug builds add a `.debug` suffix). The launcher
  Activity is still `com.limelight.PcView`.
- [deploy-artemis.sh](deploy-artemis.sh) builds/installs upstream Artemis side-by-side for
  comparison.
- Release signing is optional: drop a gitignored `keystore.properties` (with `storeFile` /
  `storePassword` / `keyAlias` / `keyPassword`) at the repo root and release builds get signed;
  without it they're simply unsigned.

To use it: pair Hati with your Apollo / Sunshine / Lumen host, start a stream on the top screen,
and the ThorPad pad appears on the bottom screen.

## Roadmap

ThorPad actions currently dispatch **input** to the host. Launching scripts / apps / URLs on the
host (e.g. a "Web" button that opens a browser) is designed in
[docs/host-actions-design.md](docs/host-actions-design.md) — it proposes reusing Moonlight's
non-input control channel rather than brittle keystroke macros.

---

## Inherited from Artemis

Hati keeps everything Artemis (Moonlight Noir) offers on the top screen, including:

- Custom virtual buttons with import/export, custom resolutions, bitrates, and frame-rate handling.
- Multiple mouse modes (normal, multi-touch, touchpad, local cursor) with sensitivity/space tuning.
- Optimized virtual gamepad skins, free joystick, Joycon D-pad support, device-motor rumble.
- External-monitor mode, display-on-top mode, portrait mode, in-game rotate, and Fit/Fill/Stretch scaling.
- View pan/zoom, trackpad tap/scroll, natural-trackpad mode, non-QWERTY layouts, soft-keyboard switching.
- Virtual Display, Server Command, and clipboard-sync integration with [Apollo](https://github.com/ClassicOldSong/Apollo).
- SBS 3D for external displays, a back-menu, custom shortcut commands, and a gamepad debugging page.

For the full upstream feature list and project background, see the
[Artemis README](https://github.com/ClassicOldSong/moonlight-android).

## Credits & license

Hati is GPL-3.0, the same as its upstreams. It builds on the work of:

- **Moonlight** — the original open-source GameStream client, by students at Case Western
  ([Cameron Gutman](https://github.com/cgutman), [Diego Waxemberg](https://github.com/dwaxemberg),
  [Aaron Neyer](https://github.com/Aaronneyer), [Andrew Hennessy](https://github.com/yetanothername)).
- **Artemis / Moonlight Noir** by [ClassicOldSong](https://github.com/ClassicOldSong) — the direct upstream.

Full attribution and the list of changes Hati makes are in [NOTICE.md](NOTICE.md).
