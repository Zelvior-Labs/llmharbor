**English** · [简体中文](../zh-cn/desktop.md)

# Desktop app

The desktop app is an Electron tray (menu-bar) app. It runs the same server and dashboard
in-process on your machine. The source is in [`desktop/`](../../desktop). Build instructions are in
[desktop/README.md](../../desktop/README.md).

## Downloads

Releases are published on
[GitHub Releases](https://github.com/Zelvior-Labs/llmharbor/releases) by the
`desktop-release.yml` workflow when a `v*` tag is pushed. Pick the file by its suffix:

| System | File suffix |
| --- | --- |
| Windows 10/11, 64-bit | `-windows-x64-setup.exe` (installer) or `-windows-x64.zip` (portable) |
| Windows 10/11, 32-bit | `-windows-x86-setup.exe` or `-windows-x86.zip` |
| macOS 12+, Apple Silicon | `-macos-arm64.dmg` or `.zip` |
| macOS 12+, Intel | `-macos-x64.dmg` or `.zip` |
| Linux x64 | `-linux-x64.AppImage`, `.deb`, `.rpm` or `.tar.xz` |
| 32-bit Intel Linux | `-linux-i686-server.tar.gz`. This is the server and browser dashboard, not Electron. See [desktop/linux-browser/README.md](../../desktop/linux-browser/README.md). |
| Windows 7 SP1 | `-windows7-x86.zip` / `-windows7-x64.zip`, published separately under `win7-v*` tags. See [desktop/win7/README.md](../../desktop/win7/README.md). |

## How it runs

- The server listens on `127.0.0.1`, starting at port **31415**. If that port is taken, it tries the
  next ports, then saves the port it found for later launches.
- The dashboard window signs in automatically through a hidden local account, so there is no
  password to set. Open it from the tray menu (**Open Dashboard**).
- The tray menu can copy the OpenAI URL, the Claude URL and the key. The popover shows request stats.
- **Allow LAN access (0.0.0.0)** (tray menu, off by default) rebinds the server to `0.0.0.0` after a
  restart, so other devices can reach it. Those devices see the normal sign-in form. Every API request still needs the
  unified key.
- The app checks GitHub releases for new versions.

## Data folder

The database (`freeapi.db`), the encryption key, `config.json`, `logs/` and `backups/` live in the
app's data folder:

| OS | Path |
| --- | --- |
| Windows | `%APPDATA%\LLMHarbor\` |
| macOS | `~/Library/Application Support/LLMHarbor/` |
| Linux | `~/.config/LLMHarbor/` |

The Windows 7 edition uses `%APPDATA%\LLMHarbor-Win7\` instead. The log file is
`logs/freeapi.log`. **Open Logs Folder** in the tray menu opens it.

Uninstalling the app does not delete this folder. Delete it yourself to remove all data. Back it up
with the app closed, and include the encryption key file. Without that file, the stored provider
keys cannot be decrypted.
