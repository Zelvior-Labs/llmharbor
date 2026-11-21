**English** · [简体中文](../zh-cn/install.md)

# Install

LLMHarbor is one Node.js server that serves the `/v1` API and the React dashboard from the same
port. You can run it in any of these ways:

| Option | Default URL | Guide |
| --- | --- | --- |
| Desktop app (Windows, macOS, Linux x64) | `http://127.0.0.1:31415` | [Desktop](desktop.md) |
| Windows 7 SP1 portable ZIP | `http://127.0.0.1:31415` | [desktop/win7/README.md](../../desktop/win7/README.md) |
| 32-bit Intel Linux server package | `http://127.0.0.1:3001` | [desktop/linux-browser/README.md](../../desktop/linux-browser/README.md) |
| Android APK (Android 8.0+) | `http://127.0.0.1:31415` | [Android](android.md) |
| Docker Compose | `http://localhost:3001` | [Docker](docker.md) |
| From source (Node.js) | `http://localhost:3001` | This page |

Prebuilt downloads are on the
[GitHub Releases page](https://github.com/Zelvior-Labs/llmharbor/releases).

## Run from source

### Requirements

- Node.js `>=20.18.0 <25.0.0` and npm `>=10` (the `engines` field in `package.json`).
- On most platforms the server opens SQLite through the optional `better-sqlite3` dependency,
  which is a native addon. If npm cannot download a prebuilt binary for your platform it compiles
  one, which needs Python 3 and a C++ toolchain.

### Development mode

```bash
git clone https://github.com/Zelvior-Labs/llmharbor.git
cd llmharbor
npm install
npm run dev
```

`npm run dev` starts the API server on port 3001 (`tsx watch`) and the Vite dashboard on port 5173.
Both reload when you change code. Open <http://localhost:5173>. Use `npm run dev:lan` to make
the Vite dashboard listen on your LAN as well.

You can also run `./scripts/dev-bootstrap.sh` (Bash) or `.\scripts\dev-bootstrap.ps1`
(PowerShell). It checks your Node.js and npm versions, runs `npm install` only when
`package-lock.json` has changed, and creates `.env` if it doesn't exist yet.

### Production build

```bash
npm install
npm run build                 # server, CLI and dashboard
NODE_ENV=production ENCRYPTION_KEY=<64 hex chars> node server/dist/index.js
```

The built server serves `client/dist` itself, so the dashboard and API share port 3001.
`ENCRYPTION_KEY` is required when `NODE_ENV=production`. You can generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Outside production you can leave `ENCRYPTION_KEY` unset. The server then generates a key and saves
it in a `.encryption-key` file next to the database. See [Configuration](configuration.md).

### Where data lives

- The database defaults to `server/data/freeapi.db`. Change it with `FREEAPI_DB_PATH`.
- Migrations run automatically at startup, unless `NODE_ENV` is set to `development`. In that
  case, run `npm run db:migration:up` yourself.

## First run

1. Open the dashboard and create the first account (email and password).
   - From a browser on the same machine, you don't need anything else.
   - From another device, you also need a one-time **setup code**. The server prints it to its
     log at startup while no account exists. Look for the line `First-run setup code:`.
2. Open **Keys** and add at least one provider key. Some providers need no key. See
   [Providers](providers.md).
3. Copy the **unified API key** from **Keys → Unified API key**. It starts with `llmharbor-`.
4. Point clients at `http://<host>:<port>/v1` and use the unified key as the bearer token. See
   [API](api.md) and [Agents and CLI](agents.md).

The desktop app signs in to its own dashboard automatically. A device reaching the desktop app over
LAN access still sees the sign-in form.

## Updating a source install

```bash
git pull
npm install
npm run build
```

Then restart the server. Pending migrations run at the next start.
