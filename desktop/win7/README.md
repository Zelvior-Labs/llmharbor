# LLMHarbor for Windows 7, 8 and 8.1 — legacy edition (preview)

This is the desktop router and its built-in dashboard, not a shortcut to a hosted service. It bundles its own runtime; **you don't need Node.js, npm, Python, or a separate browser** on the PC. Modern Electron (and so the normal installer) needs Windows 10 or newer; this edition is for Windows 7 SP1, 8 and 8.1.

## Download and start

1. Open the [latest release](https://github.com/Zelvior-Labs/llmharbor/releases/latest). Under **Assets**, pick the `-windows-x86` files for 32-bit Windows, or `-windows-legacy-x64` for 64-bit Windows. Check **Start → right-click Computer → Properties → System type** if unsure. On Windows 7, Service Pack 1 is required (check with `winver`). The 32-bit files are published as plain `-windows-x86` because this legacy edition IS the x86 build: modern Electron binaries need Windows 10 or newer to load.
2. Either:
   - **Installer:** run `LLMHarbor-<version>-windows-x86-setup.exe` (32-bit) or `LLMHarbor-<version>-windows-legacy-x64-setup.exe` (64-bit). It installs for your user only (no admin rights) into `%LOCALAPPDATA%\Programs\LLMHarbor Legacy` and adds **LLMHarbor Legacy** shortcuts to the Start Menu and the desktop. Remove it from **Programs and Features**; your data is kept.
   - **Portable:** right-click `LLMHarbor-<version>-windows-x86-portable.zip` (32-bit) or `LLMHarbor-<version>-windows-legacy-x64-portable.zip` (64-bit) → **Extract All**, open the extracted folder and double-click **LLMHarbor.exe**. Keep the EXE, DLLs, and `resources` folder together. The ZIP does not create shortcuts; right-click the EXE → **Send to → Desktop (create shortcut)** if you want one.

   Do **not** use the normal `-windows-x64` installer or its old **LLMHarbor** shortcut on these systems: that build needs Windows 10 or newer.
3. The dashboard opens on the first launch. After that, click the tray icon (it may be under the up arrow), or launch the app again to bring it forward.

The default local API URL is `http://127.0.0.1:31415/v1`. Get the API key from the dashboard. Windows 7, 8 and 8.1 no longer receive security fixes: leave **LAN access off** and don't expose the gateway to the internet.

## Data and updates

- Settings, database, encryption key and logs are in `%APPDATA%\LLMHarbor-Win7`, separate from the modern install, and shared by the installer and the ZIP. Nothing is migrated or removed. Back up the **whole folder**, including `.encryption-key`, with the app quit.
- Updates are manual: quit from the tray, then run the **next legacy installer** over the old one, or extract the **next legacy ZIP** into a fresh folder and start its EXE. Your data stays in your profile. Do not unpack over a normal LLMHarbor installation. Neither stable Windows update feed is used.
- Inbound images still pass through to providers, but are not resized locally. SQLite is built into the runtime; this edition does not ship `better-sqlite3` or `sharp`. Third-party agent tools still have their own OS requirements.

## What has been verified?

The runtime is [Electron-Legacy 44.10.2](https://github.com/Alex313031/electron-legacy/releases/tag/v44.10.2), a **community fork**, not official Electron support. Its Windows ZIPs are pinned by SHA-256 in `runtime.json`. CI checks the architecture and minimum PE subsystem, starts **each extracted ZIP and each silently installed copy** on Windows Server 2022, and exercises SQLite, a rendered and signed-in dashboard, the authenticated `/v1/models` API and manual update behavior. It also checks that the installer creates its Start Menu shortcut and that the uninstaller removes the app. This is **not a test on Windows 7, 8 or 8.1**. The package is a preview pending confirmation on real installs.

To confirm on Windows 7, 8 or 8.1: launch as a normal user, open the dashboard and add a provider, test it, then quit from the tray and reopen to check that settings persist. If it doesn't start, report the exact error (including any missing DLL name), system type, Windows version (and SP1 status) and the file you used. If the app got far enough to create a log, it is at `%APPDATA%\LLMHarbor-Win7\logs\freeapi.log`. Don't share your database, encryption key, or API keys. Don't download individual DLLs from third-party sites.

## Build (on a modern 64-bit host, not on Windows 7, 8 or 8.1)

Use Node.js 22 LTS, npm, Python 3.9+ and `curl`. From the repository root:

```sh
npm ci --ignore-scripts
npm --prefix desktop ci --ignore-scripts
npm run build -w client -- --mode win7 --outDir ../desktop/dist-electron/windows7/client --emptyOutDir
npm --prefix desktop run bundle:win7
python desktop/win7/package.py x86
python desktop/win7/package.py x64
```

Output: `desktop/dist-electron/windows7/LLMHarbor-<version>-windows7-{x86,x64}.zip`. `--runtime-zip <file>` uses an already downloaded upstream ZIP with the same mandatory hash check. Nothing from the host's `node_modules` is copied into the packages. The installer is built from the extracted ZIP with NSIS 3 and [`installer.nsi`](installer.nsi); see the defines at the top of that file.

The [release workflow](../../.github/workflows/release.yml) builds and tests both ZIPs and installers and publishes them in the normal `v*` release: the 32-bit pair as `LLMHarbor-<version>-windows-x86-{setup.exe,portable.zip}` and the 64-bit pair as `LLMHarbor-<version>-windows-legacy-x64-{setup.exe,portable.zip}`. Inside the app the version still carries the `-preview.N` suffix from `runtime.json`.
