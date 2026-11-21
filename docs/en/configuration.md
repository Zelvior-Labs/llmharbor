**English** · [简体中文](../zh-cn/configuration.md)

# Configuration

The server reads environment variables. In a source checkout it also loads `.env` from the
repository root. Set `FREEAPI_ENV_PATH` to load a different file. [`.env.example`](../../.env.example)
documents every variable below in more detail. Copy it to `.env` as a starting point.

Most runtime behaviour (routing strategy, fallback chain, cache, compression, outbound proxy) can
also be changed from the dashboard. Where a dashboard setting and an environment variable both
exist, `.env.example` says which one wins.

## Core

| Variable | Default | Meaning |
| --- | --- | --- |
| `ENCRYPTION_KEY` | auto-generated outside production | 64 hex characters (32 bytes) used to encrypt stored provider keys. **Required** when `NODE_ENV=production`. Without it, the key is read from (or written to) `.encryption-key` next to the database. |
| `PORT` | `3001` | HTTP port. |
| `HOST` | `::` | Listen address. If IPv6 is unavailable, the server falls back to `0.0.0.0`. Use `127.0.0.1` for local-only. |
| `NODE_ENV` | — | `production` makes `ENCRYPTION_KEY` mandatory. `development` skips automatic migrations. |
| `FREEAPI_DB_PATH` | `server/data/freeapi.db` | SQLite file location. |
| `FREEAPI_ENV_PATH` | `<repo>/.env` | Explicit `.env` file to load. |
| `CLIENT_DIST` | `client/dist` | Directory of a prebuilt dashboard to serve. |

## Network exposure and security

| Variable | Default | Meaning |
| --- | --- | --- |
| `HOST_BIND` | `127.0.0.1` | Docker Compose only: the host interface the container port is published on. |
| `ALLOWED_HOSTS` | off | Comma-separated Host-header allowlist (DNS-rebinding guard). Loopback names are always allowed. |
| `TRUST_PROXY` | `false` | Trust `X-Forwarded-*` headers: `true`, a hop count, or a list of addresses/CIDRs. |
| `DASHBOARD_ORIGINS` | — | Extra browser origins allowed by CORS. The Vite dev origins on port 5173 are always allowed. |
| `CSP_UPGRADE_INSECURE_REQUESTS` | auto | Force the CSP `upgrade-insecure-requests` directive on (`true`) or off (`false`). |
| `PROXY_RATE_LIMIT_RPM` | `120` | `/v1` requests per minute per client IP. `0` disables the limit. |
| `ADMIN_RATE_LIMIT_RPM` | `600` | `/api` dashboard requests per minute per client IP. `0` disables the limit. |
| `REQUEST_BODY_LIMIT_MB` | `25` | JSON body limit for inference routes. |
| `FREEAPI_BLOCK_PRIVATE_PROVIDER_URLS` | off | Also reject loopback and private-range addresses as custom provider base URLs. Metadata and link-local addresses are always rejected. |

See [Networking](networking.md) for reverse proxies, LAN access and outbound proxies.

## Routing and failover

| Variable | Default | Meaning |
| --- | --- | --- |
| `FALLBACK_TIME_BUDGET_MS` | `45000` | Wall-clock budget for failing over between providers. `0` disables the budget. |
| `SLOW_ENDPOINT_BUFFER_MS`, `TTFB_BUDGET_*` | see `.env.example` | Widen the budget for endpoints with a slow time-to-first-byte history. |
| `PROVIDER_TIMEOUT_<PLATFORM>` | per provider | Chat HTTP timeout for one platform, in ms. Also the first-byte grace period for streams. |
| `PROVIDER_STREAM_STALL_TIMEOUT_MS` | `90000` | Mid-stream inactivity timeout. A `_<PLATFORM>` suffix sets it for one platform. |
| `PROVIDER_DAILY_REQUEST_CAP_<PLATFORM>` | per provider | Daily request cap for one platform. `0` disables it. |
| `CLOUDFLARE_DAILY_NEURON_CAP` | `9000` | Daily neuron cap per Cloudflare account. |
| `MODEL_ROUTING_OVERRIDES` | — | JSON map of model id → score multiplier from `0` to `2`. |
| `REQUEST_MAX_TOKENS_BUDGET` | `0` (off) | Reject requests whose estimated input plus `max_tokens` exceed this value. |
| `MAX_CONSECUTIVE_UPSTREAM_FAILS` | `0` (off) | Stop failing over after this many consecutive upstream failures. |
| `VALIDATE_TOOL_ARGUMENTS` | off | Fail over when tool-call arguments violate the declared schema. |
| `FALLBACK_DETAIL_HEADER` | off | Add an `X-Fallback-Detail` response header with per-hop timings. |
| `STREAM_KEEPALIVE_MS` | off | Send SSE heartbeat comments while a stream waits for its first token (minimum 1000 ms). |

## Health checks and probes

| Variable | Default | Meaning |
| --- | --- | --- |
| `HEALTH_CHECK_INTERVAL_MS` | `300000` | Interval of the scheduled key health check (minimum 60000). |
| `MODEL_PROBE_ENABLED` | off | Every 30 minutes, send a tiny chat to a few models to check they answer. Each probe spends quota. |
| `MODEL_PROBE_MAX_PER_PASS` | `3` | Number of models probed per pass. |
| `MODELSCOPE_VALIDATE_CACHE_MS` | `86400000` | How long a successful ModelScope key validation is cached. |
| `BUDGET_ALERT_WEBHOOK_URL` | — | Receives a JSON POST when a key crosses 80% or 100% of its monthly cap. |

## Response cache, compression, context handoff

| Variable | Default | Meaning |
| --- | --- | --- |
| `RESPONSE_CACHE` | `false` | Exact-match cache for `/v1/chat/completions`. |
| `RESPONSE_CACHE_PERSIST` | `true` | Persist cached non-streaming answers to SQLite. The answers are stored as plaintext. |
| `RESPONSE_CACHE_TTL_SECONDS` | `3600` | How long a cached answer stays fresh. |
| `RESPONSE_CACHE_MAX_TEMPERATURE` | `1.0` | Only requests at or below this temperature are cached. |
| `RESPONSE_CACHE_MAX_ENTRIES` | `5000` | Maximum number of stored entries. |
| `LLMHarbor_COMPRESSION` | `off` | Prompt compression mode: `off`, `lossless`, `standard` or `aggressive`. |
| `LLMHarbor_CONTEXT_HANDOFF` | off | `on_model_switch` injects a short system note when a session switches model. |

Clients can override the cache per request with the `X-OSLLM-Cache: on|off` header. They can lower
the compression mode with `X-OSLLM-Compress`.

## Images

`IMAGE_NORMALIZE` (default `on`), `IMAGE_NORMALIZE_MAX_DIMENSION` (`2048`),
`IMAGE_NORMALIZE_THRESHOLD_KB` (`1024`) and `IMAGE_NORMALIZE_QUALITY` (`90`) control how inbound
data-URL images are downscaled and re-encoded before routing.

## Outbound proxy

`PROXY_URL`, `ALL_PROXY`, `HTTPS_PROXY`, `HTTP_PROXY`, `NO_PROXY`, `PROXY_REQUIRED_PLATFORMS`,
`FREEAPI_PROXY_LOCAL_DESTINATIONS`, `PROXY_MODE` and `FETCH_RELAY_TOKEN` are described in
[Networking](networking.md#outbound-proxy).

## Retention

Each pair below bounds one log table by age (days) and by row count. `0` disables that bound.

| Variables | Defaults |
| --- | --- |
| `REQUEST_ANALYTICS_RETENTION_DAYS`, `REQUEST_ANALYTICS_MAX_ROWS` | `90`, `100000` |
| `QUOTA_OBSERVATIONS_RETENTION_DAYS`, `QUOTA_OBSERVATIONS_MAX_ROWS` | `7`, `50000` |
| `SERVER_LOGS_RETENTION_DAYS`, `SERVER_LOGS_MAX_ROWS` | `7`, `50000` |
| `SEARCH_LOGS_RETENTION_DAYS`, `SEARCH_LOGS_MAX_ROWS` | `90`, `100000` |
| `DECISION_LOGS_RETENTION_DAYS`, `DECISION_LOGS_MAX_ROWS` | `90`, `100000` |

`REQUEST_ANALYTICS_LOG_CLIENT=false` stops recording the caller's IP and User-Agent.

## Database backups

| Variable | Meaning |
| --- | --- |
| `FREEAPI_DB_BACKUP_PATH` / `FREEAPI_DB_BACKUP_URL` | Encrypted backup target (file path or HTTP(S) URL). The backup is restored at startup if the database file is missing. |
| `FREEAPI_DB_BACKUP_TOKEN` | Bearer token for the backup URL. |
| `FREEAPI_DB_BACKUP_KEY` | Separate 64-hex-character backup key. Defaults to `ENCRYPTION_KEY`. |
| `FREEAPI_DB_BACKUP_INTERVAL_MS` | Upload interval in ms (default `300000`). |
| `AUTO_BACKUP_DUMP_RETENTION` | Number of automatic dumps kept on the Backups page (default `10`, `0` keeps all). |
| `FREEAPI_DB_DIR_HARDENING` | `1` or `0` to force or skip restricting permissions on the database directory. |

## Declarative startup config

`FREEAPI_CONFIG_PATH` (path to a JSON file) or `FREEAPI_CONFIG_JSON` (inline JSON) is applied
after migrations on every boot, before the HTTP listener starts. The schema is in
`server/src/services/declarative-config.ts`. These top-level fields are optional:

- `admin`: `{ "email", "password" }`. Creates the first account, only while no account exists.
  The password needs at least 8 characters.
- `license`: a license key for the dashboard's **Premium** page. This field comes from freellmapi;
  LLMHarbor has no paid plan and sells no keys.
- `keys`: `[{ "platform", "key", "label", "baseUrl", "enabled" }]`.
- `customProviders`: `[{ "baseUrl", "apiKey", "label", "models": [...] }]`.
- `models`: per-model overrides (`platform`, `modelId`, ranks, limits, `enabled`, …).
- `fallback`: `[{ "platform", "modelId", "priority", "enabled" }]`.
- `routing`: `{ "strategy", "weights", "keySelectionStrategy" }`. The strategy is one of
  `priority`, `balanced`, `smartest`, `fastest`, `reliable`, `custom` or `decision`.

```json
{
  "admin": { "email": "ops@example.com", "password": "change-me-please" },
  "keys": [{ "platform": "groq", "key": "gsk_...", "label": "main" }],
  "routing": { "strategy": "balanced" }
}
```

The file contains plaintext secrets, so protect it like `ENCRYPTION_KEY`.

## Catalog sync and updates

| Variable | Meaning |
| --- | --- |
| `CATALOG_SYNC_DISABLED=1` | Turn off the model-catalog sync described in [Providers](providers.md#model-catalog). |
| `CATALOG_BASE_URL`, `CATALOG_PUBKEY` | Point the sync at another catalog server and signing key. |
| `LLMHarbor_UPDATE_CHECK=off` | Hide the update checker in Settings and stop update-check requests. |
| `LLMHarbor_UPDATE_GITHUB_TOKEN` | Optional token used only for update checks against GitHub. |
| `WATCHTOWER_TOKEN` | Enables Docker "Update now". See [Docker](docker.md#self-update). |
| `MCP_INFERENCE_DEFAULT_MODEL`, `MCP_INFERENCE_TIMEOUT_MS` | Default model (`auto`) and timeout (`120000`) of the MCP `ask_llmharbor` tool. |
