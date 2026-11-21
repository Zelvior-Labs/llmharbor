# LLMHarbor for 32-bit Intel Linux

This is the API server with the browser dashboard, **not** an Electron app or an ARM download. It needs a Linux distribution with a working 32-bit Node.js **18 or newer**. SQLite is bundled as pure WebAssembly (`node-sqlite3-wasm`), so there is **no** dependency on Node's built-in `node:sqlite` and **no** native npm addons, compiler, or npm install on the target PC. Node is not bundled. On Alpine Linux 3.22 x86, install `nodejs` and `ca-certificates` with `apk add` (as root).

1. Download `LLMHarbor-<version>-linux-i686-server.tar.gz` from [GitHub Releases](https://github.com/Zelvior-Labs/llmharbor/releases/latest). Extract it with `tar -xzf <archive>` and enter the extracted directory.
2. As **your normal user**, run `node start.mjs`. Leave the terminal open.
3. Open **http://127.0.0.1:3001** in a browser on that PC. Create the local dashboard account and add your provider keys. Set `PORT` before launch to use a different port. Press Ctrl+C to stop.

The launcher binds to loopback by default. Data stays in `$XDG_DATA_HOME/llmharbor` (default `~/.local/share/llmharbor`), outside the application directory. With the server stopped, back up that whole directory, **including the hidden `.env` encryption key**. To update, extract the new archive into a fresh directory and run its launcher as the same user. The package does not replace itself or read an upstream desktop installation's data.

Image inputs are forwarded at their original size: this build omits the optional native image resizer (`sharp`). The Linux x64 desktop AppImage, DEB, RPM and tar.xz are separate downloads.
