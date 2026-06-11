# ThorPad Host Actions — Design Doc

**Status:** Proposal
**Author:** ThorPad
**Date:** 2026-06-11
**Scope:** Let ThorPad pad buttons launch scripts / arbitrary actions on the host (the AYN Thor's streamed Mac/PC). Canonical example: a **"Web"** button that opens a browser on the host and navigates to a URL. Also: launch an app, run a shell script, open a file, switch OBS scenes, etc.

---

## 1. Background — what ThorPad does today

ThorPad renders a JSON-driven control surface on the Thor's bottom screen while Moonlight/Artemis streams the host to the top screen. Buttons dispatch *input* to the host through the active stream connection (`NvConnection`).

Current action types (parsed in `ThorPadActivity.executeAction(JSONObject)`,
`app/src/main/java/com/limelight/ThorPadActivity.java:169-206`):

```json
{ "type":"key",   "key":"A", "modifiers":["ctrl"] }
{ "type":"text",  "text":"hello" }
{ "type":"mouse", "button":"left|right|middle" }
{ "type":"macro", "steps":[ { "...": "..." }, { "type":"delay", "ms":100 } ] }
```

Every one of these is delivered as **input events over the existing game-stream protocol**. None of them can launch a process or run a script on the host. That is the gap this doc closes.

> Key insight for everything below: ThorPad already holds a live `NvConnection` (`Game.instance.conn`), and Moonlight's protocol already has a *non-input* control channel that can ask the host to run a host-defined command. We should exploit that before building anything new.

---

## 2. The three approaches

### Approach 1 — Pure client-side keystroke macro (no host changes)

Encode "open a URL" as a `macro` of keystrokes that drives the host's UI. On macOS, opening a URL in Safari would be roughly:

```json
{ "type":"macro", "steps":[
  { "type":"key", "key":"space", "modifiers":["meta"] },        // Spotlight
  { "type":"delay", "ms":350 },
  { "type":"text", "text":"Safari" },
  { "type":"key", "key":"enter" },
  { "type":"delay", "ms":700 },
  { "type":"key", "key":"L", "modifiers":["meta"] },            // focus address bar
  { "type":"delay", "ms":150 },
  { "type":"text", "text":"https://example.com" },
  { "type":"key", "key":"enter" }
] }
```

This works *today* with zero host changes — it reuses `key`/`text`/`delay` which are already implemented and already proven against Lumen/Sunshine on macOS (the codebase even notes `text` is sent as real key events because `sendUtf8Text` isn't honored by Sunshine on macOS — `ThorPadActivity.java:179-182`).

**But it is genuinely fragile:**

- **Timing-coupled.** `delay` values are guesses. Spotlight indexing lag, app cold-start, a busy CPU, or a slow first-paint all break the sequence. There is no feedback loop — a step can land in the wrong window.
- **State-coupled.** Assumes Safari isn't already focused weirdly, no modal/dialog is open, the address bar shortcut is default, the right keyboard layout is active (`text` → key events is layout-sensitive), Spotlight is enabled and is the top hit for "Safari".
- **OS- and app-specific.** macOS uses `Cmd+Space`/`Cmd+L`; Windows uses `Win`/`Ctrl+L`. Every host OS and every target app needs its own brittle script.
- **Silent failure & side effects.** A misfire types your URL into a game chat or triggers a random shortcut. For "run a shell script" there's no clean keyboard path at all (you'd have to drive a terminal).

**Verdict:** Great as a *zero-setup fallback* and for trivial in-focus shortcuts. Unacceptable as the primary mechanism for "launch app / open URL / run script."

---

### Approach 2 — Sunshine/Apollo **Server Commands** (native, client-triggerable)

This is the most promising native path, and the plumbing **already exists end-to-end in this client**.

**What it is (host side).** Apollo (the Sunshine fork; "Lumen" here is a Sunshine/GameStream host fork in the same family) adds **Server Commands**: "a set of customizable commands defined on the server side, which can be executed from the client-side back menu." Each command has:

- **Name** — label shown in the client UI
- **Command Value** — the actual shell command run on the host (quote if it contains spaces)
- **Elevated** — `true`/`false`, run with admin/root privileges

They are stored in the host config (`sunshine.conf` / Apollo's equivalent) as a JSON array, e.g.:

```
server_cmd = [{"cmd":"bubbles.scr","elevated":false,"name":"Bubbles"}]
```

Apollo explicitly supports arbitrary host commands and even AutoHotKey scripts as command values (examples in the wiki include `calc.exe`, `shutdown /s /f /t 0`, Task Manager). On a Mac host the `cmd` would be a shell line such as `open -a Safari https://example.com` or `/Users/zach/bin/some-script.sh`. These are **global** server commands (not tied to launching a specific app), which is exactly what we want for a "Web" button.

> Distinguish from **prep-cmd** (`do`/`undo`) and **Client Commands**: those fire automatically on app start/stop or client connect/disconnect — they are *not* on-demand. Server Commands are the on-demand, client-triggered list. Base upstream Sunshine historically only had prep/launch commands tied to app lifecycle; the *on-demand client-triggerable menu* is the Apollo Server Commands feature. **Action item:** confirm the specific host fork ("Lumen") exposes `server_cmd`; if it's Apollo-based it does.

**What it is (client side — already wired in this repo).** The Artemis client already discovers, carries, and triggers these commands:

| Stage | Location |
|---|---|
| Parse `<ServerCommand>` names from host's serverinfo XML → `List<String>` | `app/.../nvstream/http/NvHTTP.java:568-570` (`getServerCmds`) |
| Stored on the computer | `nvstream/http/ComputerDetails.java:90` (`serverCommands`) |
| Passed into the stream as an Intent extra `ArrayList<String>` | `utils/ServerHelper.java:116` → `Game.EXTRA_SERVER_COMMANDS` (`Game.java:269`) |
| Held during the stream | `Game.java:282` (`serverCommands`) |
| Shown in the in-stream menu, **identified by 0-based index** | `GameMenu.java:274-286` (`game.sendExecServerCmd(finalI)`) |
| Trigger mid-stream | `Game.sendExecServerCmd(int)` → `NvConnection.sendExecServerCmd(int)` → `MoonBridge.sendExecServerCmd(int)` (native) |

So a ThorPad button can fire a host command **right now** by calling `Game.instance.sendExecServerCmd(index)` — no new transport, no new daemon, encrypted over the existing paired stream connection. The command list `Game.serverCommands` lets us resolve a **name → index** so layouts stay readable.

**Pros**
- Native, already implemented client transport; rides the existing paired+encrypted control channel (no new open port, no new auth surface on the host).
- Truly on-demand, mid-stream; works for launch-app / open-URL / run-script uniformly.
- Host owns the command definitions = inherent allowlist (client can only invoke pre-defined commands, never arbitrary shell).

**Cons / limits**
- **Requires an Apollo-class host.** If "Lumen" doesn't ship Server Commands, this path is unavailable until the host config supports it.
- **Commands are fixed strings with no runtime arguments.** You cannot pass a *dynamic* URL from the client; you get a fixed list ("Open GitHub", "Open Gmail"). One command per parameterization. For a handful of buttons that's fine; for "type any URL" it's not.
- **Addressed by index, not name.** Reordering the host list silently remaps buttons. We must resolve by *name* against `Game.serverCommands` at runtime, not hardcode indices in JSON.
- Per-command elevation and quoting are host-config concerns; we depend on the user configuring them.

**Verdict:** Best primary mechanism *when the host supports it*. Covers the common "fixed action" buttons (open URL X, launch app Y, switch scene Z) with near-zero client risk.

---

### Approach 3 — A dedicated **companion app / daemon on the host** (HTTP/WebSocket API)

A small background service on the Mac that exposes a tiny LAN/Tailscale API; ThorPad buttons POST to it. The host is an **Apple Silicon Mac on Tailscale**.

This is the **only** approach that gives full power: dynamic arguments (any URL), structured responses (success/failure, current OBS scene), actions with no keyboard equivalent, and host-fork independence (works even if Lumen lacks Server Commands).

**Recommended shape: a named-command allowlist, never arbitrary shell.**

This is Remote Code Execution by design, so it must be locked down hard (see §4). The companion does **not** accept shell strings from the client. It accepts a **named command + typed args**, looks the name up in a server-side allowlist, validates args, and runs a pre-defined script.

- **Stack:** A single static Go binary (easy cross-compile, no runtime deps, trivial to run as a `launchd` LaunchAgent on Apple Silicon). Python/Node are acceptable but bring a runtime. Go is the lowest-friction "drop one file + a plist" deploy.
- **Transport:** HTTP/1.1 + JSON over a long-lived connection (no need for WebSocket; commands are fire-and-forget with a JSON result). Add WebSocket later only if push/state-sync is needed (e.g. live OBS scene).
- **Binding:** Bind to the **Tailscale interface only** (the `100.64.0.0/10` CGNAT address) or `127.0.0.1`. **Never** `0.0.0.0`. Tailscale gives us an authenticated, encrypted, NAT-traversing private network and a stable name — `ZachsMacStudio` / MagicDNS `zachsmacstudio.tailnet-name.ts.net`. ThorPad addresses the companion by Tailscale hostname.
- **Auth:** A long random **bearer token** (`Authorization: Bearer …`) required on every request, compared in constant time. Stored on the Thor in app-private storage and on the Mac in the companion's config (chmod 600). Tailscale ACLs further restrict which tailnet devices may reach the port. Defense in depth: token + Tailnet ACL + interface bind.
- **Allowlist mapping:** A host-side config maps a command **name** to a script template + an arg schema. The companion fills the template from validated args (proper arg-array exec, **no shell string interpolation**) and runs it. Example:

  ```jsonc
  // ~/Library/Application Support/ThorPadCompanion/commands.json
  {
    "bind": "tailscale",          // tailscale | localhost
    "commands": {
      "open-url":   { "exec": ["open", "{url}"],
                      "args": { "url": { "type":"url", "required":true } } },
      "launch-app": { "exec": ["open", "-a", "{app}"],
                      "args": { "app": { "type":"enum", "values":["Safari","OBS","Terminal"] } } },
      "run-script": { "exec": ["/Users/zach/bin/{script}"],
                      "args": { "script": { "type":"enum", "values":["deploy.sh","backup.sh"] } } },
      "obs-scene":  { "exec": ["/Users/zach/bin/obs-scene.sh", "{scene}"],
                      "args": { "scene": { "type":"string", "maxLen":40 } } }
    }
  }
  ```

  - `url` type → must parse as `http(s)://`, reject `file://`, `javascript:`, shell metacharacters.
  - `enum` → value must be in the listed set (the strongest control; prefer it).
  - Args are passed as **separate exec() argv elements**, so even a nasty `string` arg can't inject a second command.

- **API:**

  ```http
  POST /run  HTTP/1.1
  Host: zachsmacstudio.<tailnet>.ts.net:8787
  Authorization: Bearer <token>
  Content-Type: application/json

  { "command": "open-url", "args": { "url": "https://example.com" } }
  ```

  Response: `200 {"ok":true}` or `4xx {"ok":false,"error":"unknown command|bad arg|..."}`.
  Also `GET /health` (no side effects) for ThorPad's status dot, and `GET /commands` (lists allowed names + arg schema) so the pad can self-validate / show only available buttons.

**Pros**
- Full power: dynamic args, real results, host-fork independent, any action scriptable.
- We control the security model end-to-end.

**Cons**
- It's a second thing to install, run, and keep alive (launchd) on the host.
- It *is* RCE — a token leak or misconfig is serious. Must be built carefully.
- Slightly more client work (HTTP client, token storage, host discovery/config).

**Verdict:** The capable, future-proof path and the right home for "open *any* URL" and "run *my* scripts." Worth building, but it must be the hardened allowlist design, not a `POST /shell`.

---

## 3. Comparison & recommendation

| Criterion | 1. Client keystroke macro | 2. Server Commands (native) | 3. Companion daemon |
|---|---|---|---|
| Host changes required | None | Host fork must support `server_cmd` + user config | Install + run daemon + config |
| Client work | None (already built) | Tiny (resolve name→index, one new action case) | Moderate (HTTP client, token, discovery) |
| Dynamic arguments (any URL) | Yes but brittle | **No** (fixed strings) | **Yes** |
| Run shell script / launch app | Poor / N/A | Yes | Yes |
| Reliability | Low (timing/state/OS fragile) | High | High |
| Security surface | None new (rides stream) | None new (rides stream, host allowlist) | **New** — RCE; needs token+Tailnet+bind+allowlist |
| Result feedback | None | None | Yes (JSON) |
| OS/app coupling | High | Low | Low |
| Host-fork independence | Yes | **No** (needs Apollo-class) | Yes |
| Network path | Existing paired stream | Existing paired stream | Tailscale/LAN HTTP |

### Recommendation — **Hybrid, in priority order**

1. **Primary: Server Commands (Approach 2)** for all *fixed* actions, because the client transport is already implemented and it adds no new attack surface. ThorPad gets a `{"type":"host","via":"server-command","name":"Open GitHub"}` action that resolves the name to an index against `Game.serverCommands` and calls `sendExecServerCmd`.
2. **Power tier: Hardened companion (Approach 3)** for anything needing *dynamic args*, *results*, or that the host fork can't express as a server command (open arbitrary URL, run my scripts, OBS scene by name). Action: `{"type":"host","via":"companion","command":"open-url","args":{...}}`.
3. **Fallback: keystroke macro (Approach 1)** stays available via the existing `macro` type for zero-setup convenience and in-focus shortcuts. No new code; just document the pattern.

This sequencing ships value almost immediately (Phase 1 is mostly wiring), and only takes on the RCE risk of the daemon once the cheap native path is exhausted.

---

## 4. Proposed JSON action schema additions

Add one new action `type`: **`host`**, discriminated by a `via` field. This keeps the existing four types untouched and composes with `macro` (a host action can be one step of a macro).

**Server-command variant** (Approach 2). Resolve by **name** (never a hardcoded index):

```json
{ "type":"host", "via":"server-command", "name":"Open GitHub" }
```

- `name` (required): must match (case-insensitive) an entry in `Game.serverCommands`. ThorPad finds its index and calls `sendExecServerCmd(index)`. If not found, no-op + a Toast ("server command 'Open GitHub' not configured on host").

**Companion variant** (Approach 3):

```json
{ "type":"host", "via":"companion", "command":"open-url",
  "args": { "url":"https://example.com" } }
```

- `command` (required): named command the companion must have in its allowlist.
- `args` (optional object): validated by the companion against that command's arg schema.

**Convenience default:** if `via` is omitted, ThorPad tries `server-command` first (by `name` or `command`), then falls back to `companion` if a companion is configured. Explicit `via` is recommended for predictable layouts.

**Companion connection config** lives in the layout root (or a global ThorPad setting), not per-button:

```json
{
  "host": {
    "companion": {
      "baseUrl": "http://zachsmacstudio.<tailnet>.ts.net:8787",
      "tokenRef": "thorpad_companion_token"   // key into app-private secure storage; never the token literal
    }
  },
  "elements": [
    { "type":"button", "x":0.80, "y":0.02, "w":0.18, "h":0.22, "label":"Web",
      "action": { "type":"host", "via":"companion", "command":"open-url",
                  "args": { "url":"https://example.com" } } }
  ]
}
```

Worked examples:

```json
// Launch an app via native server command
{ "type":"host", "via":"server-command", "name":"Launch OBS" }

// Open an arbitrary URL via companion
{ "type":"host", "via":"companion", "command":"open-url", "args":{ "url":"https://news.ycombinator.com" } }

// Run an allowlisted script
{ "type":"host", "via":"companion", "command":"run-script", "args":{ "script":"deploy.sh" } }

// As a macro step: focus host, then open URL
{ "type":"macro", "steps":[
  { "type":"key", "key":"tab", "modifiers":["meta"] },
  { "type":"delay", "ms":150 },
  { "type":"host", "via":"companion", "command":"open-url", "args":{ "url":"https://example.com" } }
] }
```

**Client dispatch (sketch, to add in `ThorPadActivity.executeAction`, `ThorPadActivity.java:174`):**

```java
case "host": {
    String via = action.optString("via", "");
    if ("companion".equals(via) || (via.isEmpty() && hasCompanion())) {
        postToCompanion(action.optString("command", ""), action.optJSONObject("args"));
    } else {                                  // default: native server command
        int idx = indexOfServerCommand(
            action.optString("name", action.optString("command", "")));
        if (idx >= 0 && Game.instance != null) {
            Game.instance.sendExecServerCmd(idx);
        } else {
            toast("Host command not available");
        }
    }
    break;
}
```

`indexOfServerCommand(name)` does a case-insensitive lookup over `Game.instance.serverCommands` (the `ArrayList<String>` from `EXTRA_SERVER_COMMANDS`). `postToCompanion` runs on the existing off-UI worker thread (buttons already execute actions on a background thread, `ThorPadActivity.java:159`).

---

## 5. Security

Approaches 1 and 2 add **no new** network surface (both ride the already-paired, encrypted Moonlight stream; Approach 2's command set is a host-defined allowlist the client can only index into). All meaningful risk is in the **companion daemon (Approach 3)** — treat it as production RCE:

1. **No arbitrary shell, ever.** The API takes a *named command + typed args*, not a command string. The name maps to a fixed exec template in host config; args fill template slots and are passed as **separate argv elements** (no shell, no string interpolation). Prefer `enum` args over free strings.
2. **Token auth on every request.** Long (≥256-bit) random bearer token, constant-time compare, required even on the Tailnet. Stored in app-private storage on the Thor and a `chmod 600` config on the Mac. Provide a rotate path. Never log the token; never put it in the JSON layout (use `tokenRef`).
3. **Bind narrowly.** Default bind to **Tailscale interface or `127.0.0.1`**, never `0.0.0.0`. Tailscale provides device identity, encryption, and ACLs; add a Tailscale ACL allowing only the Thor's node to reach the companion's port.
4. **Validate args strictly.** URL args must parse as `http(s)://` only (reject `file:`, `javascript:`, `data:`, embedded shell metacharacters, newlines); enums must match; strings get length caps and a charset allowlist.
5. **Least privilege.** Run the companion as the normal user via a `launchd` LaunchAgent, **not** root. Per-command elevation only if a specific command demands it, and that command should still be a fixed script.
6. **Rate limit & log.** Throttle `/run`; append-only audit log of `{time, command, args, result}` (token redacted) so misuse is visible.
7. **Fail closed.** Unknown command, bad arg, missing/invalid token, or oversized body → `4xx`, no execution. Default config ships with an **empty** command allowlist (you opt commands in).
8. **TLS note.** Tailscale already encrypts device-to-device, so plain HTTP over the Tailnet is acceptable for v1; if ever exposed beyond Tailscale, require HTTPS (Tailscale can issue certs via `tailscale cert`). Document that the companion must **not** be port-forwarded to the public internet.

For Approach 2, the residual concern is purely that server commands run host-defined shell — but that's authored by the host owner, and the client can only trigger entries that already exist. Resolve by **name** so a host-side reorder can't make a "Web" button fire "Shutdown".

---

## 6. Phased build plan

**Phase 0 — Documentation only (ship today).**
Document the keystroke-macro pattern (Approach 1) for macOS and Windows in the ThorPad README as the zero-setup option. No code. Confirm whether the "Lumen" host fork is Apollo-based and exposes `server_cmd`; this decides how soon Phase 1 lands.

**Phase 1 — Native Server Commands (small, high-value).**
- Add the `host` action type with `via:"server-command"` to `executeAction` and a case-insensitive `indexOfServerCommand` against `Game.serverCommands`.
- Surface a clear Toast when a named command isn't present on the host.
- Configure a couple of real server commands on the host (`open -a Safari https://…`, a script) and bind a "Web" button.
- *Outcome:* fixed-action host buttons working over the existing secure channel, ~no new attack surface.

**Phase 2 — Hardened companion v1 (the power tier).**
- Build the Go daemon: `POST /run`, `GET /health`, `GET /commands`; bearer-token auth; Tailscale/localhost bind; `commands.json` allowlist with enum/url/string arg validation; argv-array exec (no shell); launchd LaunchAgent + token-rotate helper; audit log.
- Client: companion config block (`baseUrl` + `tokenRef`), secure token storage, `postToCompanion`, `via:"companion"` dispatch, health-dot in the status overlay.
- Ship the canonical **"Web" → open arbitrary URL** button plus `launch-app` and `run-script` (enum) commands.
- *Outcome:* dynamic-arg host actions with results; host-fork independent.

**Phase 3 — Polish & richer actions.**
- `GET /commands`-driven discovery so the pad can grey out unavailable buttons and validate args before sending.
- Optional WebSocket for state push (live OBS scene, "is app running").
- Per-command confirmation flag for destructive actions; visual success/error feedback (haptic + Toast) from the JSON result.
- Token pairing UX (QR or one-time code) instead of manual paste.

**Ship order rationale:** Phase 1 is mostly wiring on top of code that already exists end-to-end and carries essentially no new risk, so it lands first. The companion (Phase 2) is where the real capability *and* the real risk live, so it's built deliberately with the allowlist model from day one. Approach 1 is the always-available fallback and needs only docs.

---

## 7. Sources

- Apollo Server Commands (definition, name/value/elevated, client back-menu, AutoHotKey, arbitrary commands): <https://github.com/ClassicOldSong/Apollo/wiki/Server-Commands>
- Apollo Client Commands (connect/disconnect prep, contrast with on-demand server commands): <https://github.com/ClassicOldSong/Apollo/wiki/Client-Commands>
- `server_cmd = [{"cmd":...,"elevated":...,"name":...}]` config shape (Apollo discussions/issues): <https://github.com/ClassicOldSong/Apollo> · issue evidence: <https://github.com/ClassicOldSong/Apollo/issues/561>
- Sunshine prep-cmd / app launch (upstream lifecycle commands, contrast): <https://docs.lizardbyte.dev/projects/sunshine/v0.22.2/about/guides/app_examples.html>
- Sunshine project (host for Moonlight): <https://github.com/LizardByte/Sunshine>
- Self-hosted streaming over Tailscale (deployment context): <https://gauranshmathur.site/self-hosted-cloud-gaming/>

**Client-side code this design builds on (verified in this repo):**
- `app/src/main/java/com/limelight/ThorPadActivity.java:169` — `executeAction` dispatch (extension point)
- `app/src/main/java/com/limelight/Game.java:269,282` — `EXTRA_SERVER_COMMANDS`, `serverCommands`, `sendExecServerCmd(int)`
- `app/src/main/java/com/limelight/nvstream/NvConnection.java` — `sendExecServerCmd(int)` → `MoonBridge.sendExecServerCmd`
- `app/src/main/java/com/limelight/GameMenu.java:274` — existing index-based trigger of server commands
- `app/src/main/java/com/limelight/nvstream/http/NvHTTP.java:568` — `getServerCmds` parses `<ServerCommand>` names
- `app/src/main/java/com/limelight/utils/ServerHelper.java:116` — commands handed to the stream Intent
