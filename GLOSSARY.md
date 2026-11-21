# Glossary

Shared vocabulary for working in this repository, especially in `server/src/services/router.ts`,
`server/src/services/ratelimit.ts`, `server/src/lib/fallback-loop.ts`, `server/src/providers/` and
`server/src/services/model-*` / `custom-model-*`. For how the pieces fit together, see
[docs/en/architecture.md](docs/en/architecture.md).

## The product

- **Gateway**: the whole product. A self-hosted proxy that puts many providers' free tiers behind
  one API.
- **Unified API key**: the single `llmharbor-…` bearer key that clients use for `/v1`, `/v1beta`,
  `/api/*` (Ollama emulation) and `/mcp`.
- **Client profile**: an extra API key with its own settings, created under **Keys → Unified API key**.
- **URL token**: a revocable credential embedded in the URL path (`/v1/t/<token>/…`), for clients
  that can't send an `Authorization` header.

## Four nouns that get mixed up

- **Platform**: a named upstream such as `google`, `groq` or `openrouter`. The closed list is the
  `Platform` union in `shared/types.ts`.
- **Provider adapter**: the code for a platform (`server/src/providers/<platform>.ts`). Most extend
  `OpenAICompatProvider`. A few with unusual wire protocols extend `BaseProvider` directly.
- **Model row**: one routable `(platform, model_id)` entry in the database, with its limits,
  capabilities and score inputs.
- **Key**: one stored upstream credential for a platform. A model routes only when it has at least
  one healthy key that is under its limits.

## Chains, pools, catalog

- **Chain**: the ordered list of model rows tried for one request.
- **Fallback chain**: the user-editable default chain on the dashboard's Fallback page.
- **`auto:<axis>`**: a sorted alias (`auto:smart`, `auto:fast`, `auto:reliable`, `auto:balanced`,
  `auto:cheap`).
- **Named chain / profile**: a saved chain in the `profile_models` table, selectable as
  `auto:<name>`.
- **Pool**: a shared quota bucket that several models draw from, for example a provider-wide daily
  cap.
- **Catalog**: the model list. The baseline comes from migrations, and the signed catalog sync adds
  to it. New catalog entries reach the live tier first. Installs without a license key get
  them later through the monthly snapshot. LLMHarbor has no paid plan.
- **Custom model**: a row that points at a user-supplied `base_url`. The same `model_id` on two
  endpoints is two different rows.
- **Tombstone / override / retirement**: the ways a catalog row is hidden by the user, edited
  locally, or retired upstream without the catalog itself changing.

## Routing and quota

- **Router**: picks a `(platform, model, key)` for each request. It uses a Thompson-sampling bandit
  over reliability, speed and intelligence, multiplied by headroom guardrails. It is not
  round-robin.
- **Strategy**: the weight preset (`balanced`, `smartest`, `fastest`, `reliable`, `custom`,
  `priority`). Key selection (`auto` or `least-remaining`) is a separate setting.
- **Headroom**: remaining quota as a 0–1 factor. It steers traffic away before a cap is hit. It
  never lets a request past a real limit.
- **Quota windows**: RPM/TPM (sliding minute) and RPD/TPD (UTC day), plus provider-wide pools and
  in-flight leases (in-flight requests count before they finish).
- **Hard gate vs steering**: `canMakeRequest` / `canUseTokens` decide yes or no on the hot path. The
  short-lived usage snapshot (5-second TTL) only affects ranking. Never treat the snapshot as
  permission.
- **Cooldown**: a benched `(model, key)` after a 429, a 5xx or an auth failure. The source is one of
  `heuristic` (our own guess, eligible for early probing), `authoritative` (provider Retry-After or
  a daily reset), `credit` (402), `tier` (403) or `checkin`. Repeated heuristic 429s escalate the
  bench through 2 min → 10 min → 1 h → 24 h within a day.
- **Fallback loop**: the shared retry driver used by every route (`server/src/lib/fallback-loop.ts`).
  It allows up to 20 attempts within one time budget.
- **Sticky session**: a conversation stays on its first model for up to 30 minutes.
- **Tool-call rescue**: tool calls that a model emits as plain text are turned into real
  `tool_calls` (`server/src/lib/tool-call-rescue.ts`).

## Confusables

- Platform ≠ provider adapter ≠ model row ≠ key.
- Chain (ordered attempts) ≠ pool (shared quota bucket).
- Catalog (what exists) ≠ chain (what this request tries).
- Custom model (your endpoint) ≠ catalog entry.
- Cooldown (benched after a failure) ≠ quota (allowance not yet spent).
- Headroom (steering factor) ≠ reliability (bandit posterior).
- Named chain (saved list of models) ≠ strategy (score weights).
- Unified API key (clients) ≠ dashboard session token (dashboard and `npm run cli -- keys`).
