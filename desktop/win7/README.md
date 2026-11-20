# LLMHarbor for Windows 7 SP1 — portable preview

This is the desktop router and its built-in dashboard, not a shortcut to a hosted service. It bundles its own runtime; **you don't need Node.js, npm, Python, or a separate browser** on the Windows 7 PC.

## Download and start

1. Open the [Windows 7 downloads](https://github.com/zelvior/llmharbor/releases?q=win7). Under **Assets**, choose the ZIP ending in `-windows7-x86.zip` for 32-bit Windows, or `-windows7-x64.zip` for 64-bit Windows. Check **Start → right-click Computer → Properties → System type** if unsure. This preview targets Windows 7 **Service Pack 1** (check with `winver`).
2. Right-click the ZIP → **Extract All**. Open the extracted folder and double-click **LLMHarbor.exe**. Keep the EXE, DLLs, and `resources` folder together. Do **not** use the old Start Menu shortcut or the normal `windows-x86` / `windows-x64` installer: those builds need Windows 10 or newer.
3. The dashboard opens on the first launch. After that, click the tray icon (it may be under the up arrow), or launch the EXE again to bring it forward. If you want a shortcut, right-click **this extracted EXE** → **Send to → Desktop (create shortcut)**. This ZIP does not install or repair a Start Menu entry.

The default local API URL is `http://127.0.0.1:31415/v1`. Get the API key from the dashboard. Windows 7 no longer receives regular security fixes: leave **LAN access off** and don't expose the gateway to the internet.

## Data and updates

- Settings, database, encryption key and logs are in `%APPDATA%\LLMHarbor-Win7`, separate from the modern install. Nothing is migrated or removed. Back up the **whole folder**, including `.encryption-key`, with the app quit.
- Updates are manual: quit from the tray, extract the **next Windows 7 ZIP** into a fresh folder and start its EXE. Your data stays in your profile. Do not unpack over a normal LLMHarbor installation. Neither stable Windows update feed is used.
- Inbound images still pass through to providers, but are not resized locally. SQLite is built into the runtime; this edition does not ship `better-sqlite3` or `sharp`. Third-party agent tools still have their own OS requirements.

## What has been verified?

The runtime is [Electron-Legacy 44.10.2](https://github.com/Alex313031/electron-legacy/releases/tag/v44.10.2), a **community fork**, not official Electron support. Its Windows ZIPs are pinned by SHA-256 in `runtime.json`. CI checks the architecture and minimum PE subsystem, starts **each extracted ZIP** on Windows Server 2022, and exercises SQLite, a rendered and signed-in dashboard, the authenticated `/v1/models` API and manual update behavior. This is **not a test on Windows 7**. The package is a preview pending confirmation on a real Windows 7 SP1 install.

To confirm on Windows 7: launch as a normal user, open the dashboard and add a provider, test it, then quit from the tray and reopen to check that settings persist. If it doesn't start, report the exact error (including any missing DLL name), system type, SP1 status and ZIP filename. If the app got far enough to create a log, it is at `%APPDATA%\LLMHarbor-Win7\logs\freeapi.log`. Don't share your database, encryption key, or API keys. Don't download individual DLLs from third-party sites.

## Build (on a modern 64-bit host, not on Windows 7)

Use Node.js 22 LTS, npm, Python 3.9+ and `curl`. From the repository root:

```sh
npm ci --ignore-scripts
npm --prefix desktop ci --ignore-scripts
npm run build -w client -- --mode win7 --outDir ../desktop/dist-electron/windows7/client --emptyOutDir
npm --prefix desktop run bundle:win7
python desktop/win7/package.py x86
python desktop/win7/package.py x64
```

Output: `desktop/dist-electron/windows7/LLMHarbor-<version>-windows7-{x86,x64}.zip`. `--runtime-zip <file>` uses an already downloaded upstream ZIP with the same mandatory hash check. Nothing from the host's `node_modules` is copied into the packages. A tag `win7-v<version>` matching `python desktop/win7/package.py --version` builds both ZIPs and publishes a **separate prerelease**, never the stable/latest release.
