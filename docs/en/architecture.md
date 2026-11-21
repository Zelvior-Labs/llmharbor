**English** · [简体中文](../zh-cn/architecture.md)

# Architecture

## Repository layout

| Path | Contents |
| --- | --- |
| `server/` | Express 5 server (TypeScript): routes, router, rate limits, provider adapters, SQLite access, migrations. Workspace `@llmharbor/server`. |
| `client/` | React + Vite dashboard. The server serves its build output. |
| `shared/` | Types shared by server and client, including the `Platform` union. |
| `cli/` | The agent-setup and key-management CLI (`npm run cli`). Not published to npm. |
| `desktop/` | Electron tray app, the Windows 7 edition (`desktop/win7/`) and the 32-bit Linux server package (`desktop/linux-browser/`). Uses its own `package.json`, not an npm workspace. |
| `android/` | Standalone Android APK: Java launcher plus `gateway.mjs` on nodejs-mobile. |
| `site/` | Static website deployed to <https://llmharbor.vercel.app>. |
| `examples/fetch-relay-worker/` | Cloudflare Worker for the Fetch Relay outbound mode. |
| `scripts/` | `cli.mjs` (the `npm run cli` wrapper) and the dev bootstrap scripts. |
| `.github/workflows/` | CI, Docker image, desktop, Linux, Windows 7 and Android release workflows. |

## Request flow

1. A request arrives on one of the inbound surfaces: `/v1` (OpenAI-compatible and Anthropic
   Messages), `/v1beta` (Gemini), `/api/*` (Ollama emulation) or `/mcp`.
2. Middleware applies the host allowlist, Helmet security headers, CORS, body limits and the
   per-IP rate limits.
3. The route authenticates the unified key, a client-profile key, or a URL token.
4. Optional request-side steps run: image normalization, prompt compression, response-cache
   lookup.
5. The router (`server/src/services/router.ts`) resolves the `model` field into a chain of
   candidate models. The source is the active fallback chain, an `auto:<axis>` sort, a named chain,
   or a pinned model.
6. The fallback loop (`server/src/lib/fallback-loop.ts`) tries candidates in order. It allows up to
   20 attempts within the failover time budget. Each attempt picks a key that is healthy, not
   cooling down, and under its rate limits, decrypts it in memory, and calls the provider adapter.
7. When an attempt fails (for example on 429, 5xx, a timeout or a stalled stream), that model/key is
   put on cooldown and the next candidate is tried. The response reports the hops it skipped in
   `X-Fallback-Trail`.
8. Usage is recorded per platform, model and key. Analytics are written to SQLite.

## Routing

- **Strategies.** `balanced` (the default), `smartest`, `fastest` and `reliable` are weight presets
  over reliability, speed and intelligence scores. `custom` uses your own weights. `priority`
  follows the chain order you set by hand. `decision` routes decision requests. Scores are sampled
  from a Thompson-sampling bandit fed by live results.
- **Rate limits.** Per-key counters track requests and tokens per minute and per UTC day, plus
  provider-wide pools where several models share one allowance. In-flight requests are counted
  before they finish.
- **Cooldowns.** Failed model/key pairs are benched. A background probe can release them early.
- **Sticky sessions.** A conversation stays on the model it started with for up to 30 minutes, so
  multi-turn sessions don't hop between models.
- **Health checks.** Every stored key is validated on a schedule (`HEALTH_CHECK_INTERVAL_MS`,
  default 5 minutes, with jitter).

![The Models page: the active strategy and the live scores behind the current order.](../images/models.png)

<sub>The Models page: the active strategy and the live scores behind the current order.</sub>

## Storage

- SQLite through `better-sqlite3` on server and desktop installs, built-in `node:sqlite` on Android
  and in the Windows 7 edition, and the WebAssembly driver `node-sqlite3-wasm` in the 32-bit Linux
  package. `FREEAPI_SQLITE_DRIVER` (`node:sqlite` or `wasm`) selects the driver.
- Schema and the bundled model catalog are migrations in `server/src/db/migrations/`. Use
  `npm run db:migration:create|up|down|status|fresh`.
- Provider keys are encrypted with AES-256-GCM using `ENCRYPTION_KEY` (or the generated
  `.encryption-key` file). `server/src/scripts/rotate-encryption-key.ts`
  re-encrypts them under a new key (see [Troubleshooting](troubleshooting.md)).
- A signed catalog sync can add or update models on top of the migrations. See
  [Providers](providers.md#model-catalog).

![The Analytics page reads the recorded requests.](../images/analytics.png)

<sub>The Analytics page reads the recorded requests.</sub>

## Limits of the approach

The pool depends on free tiers that the providers control. Quotas, model availability and terms can
change without notice. Latency varies by provider, and there is no SLA. When the best models in the
chain exhaust their daily quotas, requests fall through to whatever is still available. Daily
counters reset at UTC midnight. Your use of each provider is governed by that provider's terms.
