# LLMHarbor Desktop

An Electron tray (menu-bar) app that runs the LLMHarbor server and dashboard locally on
`127.0.0.1:31415`. If that port is taken, it uses the next free port and remembers it. The tray
popover shows a 24-hour request chart and quick stats, and lets you copy the base URL and key. The
full dashboard opens in an app window.

User guide (downloads, data folder, LAN access): [docs/en/desktop.md](../docs/en/desktop.md).
Installers are on [GitHub Releases](https://github.com/Zelvior-Labs/llmharbor/releases).

Other editions in this folder:

- [`win7/`](win7/README.md): the Windows 7 / 8 / 8.1 edition (x86/x64), as a per-user installer and a
  portable ZIP (`-windows-legacy-*`).
- [`linux-browser/`](linux-browser/README.md): Linux Legacy, the server and browser-dashboard package
  for x86 and x64 Linux with Node.js 18+ (`-linux-legacy-*` .deb, AppImage and portable tar.gz).

All of them are built, tested and published together by
[`.github/workflows/release.yml`](../.github/workflows/release.yml): run **Actions → Release → Run
workflow** with the tag `v<desktop/package.json version>`.

## Prerequisites

- Node.js 20+
- A native build toolchain for `better-sqlite3`:
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`) and Python 3
  - **Windows**: Visual Studio Build Tools ("Desktop development with C++")

## Build it yourself

From the **repository root** (builds the dashboard, then packages):

```bash
npm install
npm install --prefix desktop
npm run desktop:dist          # macOS arm64 → desktop/dist-electron/*-macos-arm64.dmg (+ .zip)
npm run desktop:dist:mac:x64  # macOS Intel → *-macos-x64.dmg (+ .zip)
npm run desktop:dist:win      # Windows x64 → *-windows-x64-setup.exe (+ .zip)
npm run desktop:dist:linux    # Linux x64 → AppImage, deb, rpm, tar.xz
```

Build on the matching architecture so `better-sqlite3` is rebuilt natively. Locally built apps
don't carry the macOS quarantine attribute or Windows Mark-of-the-Web, so they launch without
Gatekeeper or SmartScreen warnings.

### 32-bit Windows

Use a 64-bit Windows host. Build the dashboard with x64 Node, then switch to **x86 Node 20.x** before
installing the desktop dependencies so npm picks the x86 native modules:

```powershell
# x64 Node
npm ci
npm run build -w client

# x86 Node 20.x (node -p process.arch prints ia32)
npm --prefix desktop ci
npm --prefix desktop run dist:win:ia32
```

Output goes to `desktop/dist-electron/ia32/`. Rerun `npm --prefix desktop ci` under x64 Node before
going back to x64 work.

### Linux Legacy package (x86 and x64)

On a Linux x64 host, after `npm ci` and `npm --prefix desktop ci --ignore-scripts`:

```bash
npm run build -w client && npm --prefix desktop run dist:linux:legacy
```

That writes the architecture-neutral `desktop/dist-electron/linux-legacy/LLMHarbor-<version>-linux-legacy.tar.gz`.
`desktop/linux-browser/package-legacy.sh` turns it into the x86/x64 `.deb`, AppImage and portable files.
It needs `dpkg-deb`, plus `APPIMAGETOOL` and `APPIMAGE_RUNTIME_DIR`, which the release workflow downloads
with pinned checksums.

### Linux arm64

On an arm64 Linux host, run `npm --prefix desktop run build:all && npm --prefix desktop run stage:client`,
then from `desktop/`:

```bash
USE_SYSTEM_FPM=true npx --no-install electron-builder --linux AppImage tar.xz deb rpm --arm64 \
  --config electron-builder.arm64.yml --publish never
```

electron-builder's bundled `fpm` is x86_64-only, so install `fpm` (Ruby gem) and `rpm` first. Output
goes to `desktop/dist-electron/arm64/`.

## Develop

```bash
cd desktop
npm install
npm run rebuild:native   # rebuild better-sqlite3 for Electron's ABI (dev loop only)
npm run dev              # bundle and launch
```

The dev run serves the repository's `client/dist`. Build it first (`npm run build -w client`), or
use `npm run desktop:dev` from the root, which does both. `FREEAPI_REPO=/path/to/checkout` points
the app at a different checkout.

Dev-only helpers: `FREEAPI_SHOT=1 npx electron .` captures the popover and dashboard to `/tmp`, then
quits. `FREEAPI_SHOT=hold` keeps the popover open.

Don't run plain `npm rebuild` here. It rebuilds `better-sqlite3` for the system Node ABI and breaks
the Electron dev loop. `npm run rebuild:native` fixes that. Packaging rebuilds native modules
itself.
