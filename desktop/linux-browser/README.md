# LLMHarbor Linux Legacy (x86 and x64)

This is the API server with the browser dashboard, **not** the Electron desktop app. It is meant for 32-bit Intel PCs and for older or minimal x64 distributions. It needs a Linux distribution with a working Node.js **18 or newer** (32-bit Node on x86). SQLite is bundled as pure WebAssembly (`node-sqlite3-wasm`), so there is **no** dependency on Node's built-in `node:sqlite` and **no** native npm addons, compiler, or npm install on the target PC. Node is not bundled. Install it with your package manager first, for example `sudo apt install nodejs` on Debian/Ubuntu, or `apk add nodejs ca-certificates` (as root) on Alpine.

Download one of these from [GitHub Releases](https://github.com/Zelvior-Labs/llmharbor/releases/latest). They contain the same program:

| File | How to start it |
| --- | --- |
| `LLMHarbor-<version>-linux-legacy-x86.deb` / `-x64.deb` | `sudo dpkg -i <file>`, then run `llmharbor-legacy`, or use **LLMHarbor Legacy** in the application menu. Remove it with `sudo dpkg -r llmharbor-legacy`. |
| `LLMHarbor-<version>-linux-legacy-x86.AppImage` / `-x64.AppImage` | `chmod +x <file>`, then run it. Without FUSE, run it with `APPIMAGE_EXTRACT_AND_RUN=1`. |
| `LLMHarbor-<version>-linux-legacy-x86-portable.tar.gz` / `-x64-portable.tar.gz` | `tar -xzf <file>`, enter the extracted directory, then run `./llmharbor-legacy` or `node start.mjs`. |

1. Start it as **your normal user** and leave the terminal open. The launcher explains what to install if no suitable `node` is found. Set `LLMHARBOR_NODE` to use a Node binary that is not on `PATH`.
2. Open **http://127.0.0.1:3001** in a browser on that PC. The application menu entry and the AppImage try to open it for you when a desktop session is running. Create the local dashboard account and add your provider keys. Set `PORT` before launch to use a different port. Press Ctrl+C to stop.

The launcher binds to loopback by default. Data stays in `$XDG_DATA_HOME/llmharbor` (default `~/.local/share/llmharbor`), outside the application directory, so all three files share it. With the server stopped, back up that whole directory, **including the hidden `.env` encryption key**. To update, install the new `.deb` or AppImage, or extract the new archive into a fresh directory, and run it as the same user. The package does not replace itself or read an upstream desktop installation's data.

Image inputs are forwarded at their original size: this build omits the optional native image resizer (`sharp`). The Linux x64 and arm64 desktop AppImage, DEB, RPM and tar.xz are separate downloads.
