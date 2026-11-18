# OSSLLMAPI Desktop

Lean Electron menu-bar app for [OSSLLMAPI](https://github.com/zelvior/ossllmapi):
runs the whole router locally on `127.0.0.1:31415`, with a dark-glass tray
popover (live 24h request chart, quick stats, copy URL/key) and the full
dashboard in a native-feeling window.

Download an installer from [Releases](https://github.com/zelvior/ossllmapi/releases/latest),
or build against the server and client sources in this checkout.

On macOS, choose **arm64** for Apple Silicon (M-series) or **x64** for Intel.
Both require **macOS 12 Monterey or later**. Each architecture has a DMG
installer and a ZIP containing the app.

**Windows 7 SP1:** Use the [separate Windows 7 portable preview](win7/README.md) (x86 or x64). Extract the ZIP and run `OSSLLMAPI.exe`; the standard installers and their shortcuts will not work on Windows 7.

Windows 10/11 installers end in `-windows-x86-setup.exe` (32-bit) or `-windows-x64-setup.exe` (64-bit); the matching `.zip` is portable. These are GitHub downloads, not the upstream Microsoft Store product.

Linux x64 has an AppImage, DEB, RPM and tar.xz. On a **32-bit Intel Linux PC**, use the [`linux-i686-server.tar.gz` browser package](linux-browser/README.md), not an Electron installer. To build it on a Linux x64 host after `npm ci` and `npm --prefix desktop ci --ignore-scripts`, run `npm run build -w client && npm --prefix desktop run dist:linux:x86-server`. Output: `desktop/dist-electron/browser/`.

## Prerequisites

- Node.js 20+
- A native build toolchain for `better-sqlite3`:
  - **macOS** — Xcode Command Line Tools (`xcode-select --install`) and Python 3
  - **Windows** — Visual Studio Build Tools ("Desktop development with C++")

## Build it yourself

From the **repo root** (one-time client build + package):

```bash
npm install
npm install --prefix desktop  # install desktop dependencies
npm run desktop:dist          # macOS → desktop/dist-electron/OSSLLMAPI-…-macos-arm64.dmg
npm run desktop:dist:mac:x64  # Intel Mac → desktop/dist-electron/OSSLLMAPI-…-macos-x64.dmg
npm run desktop:dist:win      # Windows → desktop/dist-electron/OSSLLMAPI-…-windows-x64-setup.exe
```

Both Mac commands also produce a ZIP. Prefer building on the matching Mac
architecture so `better-sqlite3` can be rebuilt and tested natively. The release
workflow does this in separate Apple Silicon and Intel jobs, signs/notarizes
when credentials are configured, then verifies their final checksums and publishes one combined
`latest-mac.yml`.

> Locally built apps don't carry the macOS quarantine attribute or Windows
> Mark-of-the-Web, so they launch without Gatekeeper/SmartScreen warnings —
> no code signing needed.

### 32-bit Windows build

Use a 64-bit Windows build host. Build the dashboard with **x64 Node** (its
build tools need it), then switch to **x86 Node 20.19+ (20.x)** before
installing the desktop dependencies so npm selects the x86 native modules.
Run both stages from the repo root:

```powershell
# With x64 Node
npm ci
npm run build -w client

# After switching to x86 Node 20.x (node -p process.arch should print ia32)
npm --prefix desktop ci
npm --prefix desktop run dist:win:ia32
```

The x86 artifacts are written to `desktop/dist-electron/ia32/`. If switching
back to x64 development, rerun `npm --prefix desktop ci` under x64 Node.

## Develop

```bash
cd desktop
npm install
npm run rebuild:native   # better-sqlite3 against Electron's ABI (dev loop only)
npm run dev              # bundle + launch
```

The dev run serves the repo's own `client/dist` — build it first
(`npm run build -w client` from the root) or use `npm run desktop:dev` from
the root, which does both. `FREEAPI_REPO=/path/to/checkout` overrides the
client/server source location if you ever need a different one.

UI iteration helpers (dev only): `FREEAPI_SHOT=1 npx electron .` captures the
popover + dashboard to /tmp and quits; `FREEAPI_SHOT=hold` pins the popover
open for real-screen captures.

## Notes

- DB + config live in `~/Library/Application Support/OSSLLMAPI/` (macOS) /
  `%APPDATA%/OSSLLMAPI/` (Windows).
- The server binds loopback only; default port 31415, scan-up on conflict,
  resolved port persisted.
- Do not run plain `npm rebuild` here — it rebuilds better-sqlite3 for the
  system Node ABI and breaks the Electron dev loop (`npm run rebuild:native`
  fixes it). Packaging rebuilds natives itself.
