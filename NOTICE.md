# NOTICE — Hati

Hati is licensed under the **GNU General Public License v3.0** (see `LICENSE.txt`).

## Attribution & lineage

Hati is a derivative work built on the following projects, with gratitude:

- **Moonlight** — the original open-source GameStream client.
  https://github.com/moonlight-stream/moonlight-android (GPL-3.0)
- **Artemis** (a.k.a. "Moonlight Noir") by **ClassicOldSong** — the direct upstream this fork is based on.
  https://github.com/ClassicOldSong/moonlight-android (GPL-3.0)
- **moonlight-common-c** — the shared GameStream protocol core. (GPL-3.0)

Bundled third-party native libraries:
- **libopus** (BSD), **enet** (MIT), **OpenSSL** — all GPL-3.0-compatible.

The copyright notices of the upstream projects are retained in the source as required by the GPL.

## Changes made in Hati (GPL-3.0 §5a)

This fork adds, on top of Artemis:

- **ThorPad** — a control surface rendered on the AYN Thor's secondary (bottom) display while the
  stream runs on the primary (top) display. Launched from the streaming activity via Android's
  multi-display APIs (`setLaunchDisplayId`), sending input through the live connection.
- A **JSON-driven layout engine** with per-streamed-app layout files
  (`<externalFilesDir>/thorpad/<appname>.json`), normalized coordinates, and element types
  `trackpad` and `button`.
- Button **actions**: `key` (with shift/ctrl/alt/meta modifiers), `text` (typed as key events),
  `mouse`, `macro` (sequences with delays), and client-side actions `keyboard`, `settings`,
  `zoom`, `reload`.
- An on-device **settings / layout manager** and an in-app **on-screen keyboard**.
- A standalone web-based **layout designer** (`tools/thorpad-webui/`).
- Rebranding to "Hati" with its own application id `dev.codinghaze.hati`.

## Trademarks

"Moonlight" and "Artemis" are the names/brands of their respective projects and are used here only
to credit upstream lineage, not to imply endorsement. "Hati" is the name of this fork.
