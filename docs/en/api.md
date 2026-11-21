**English** · [简体中文](../zh-cn/api.md)

# API

The server speaks four wire formats from one port: OpenAI-compatible (`/v1`), Anthropic Messages
(`/v1/messages`), Gemini (`/v1beta`) and, when you turn it on, Ollama (`/api/*`). It also serves an
MCP endpoint (`/mcp`). An OpenAPI document is served at `GET /v1/openapi.json`, with a viewer at
`GET /v1/docs`. Neither needs authentication.

The examples below use `http://localhost:3001`. The desktop and Android apps use
`http://127.0.0.1:31415` by default.

![The dashboard Playground sends chat requests to /v1/chat/completions with the unified key and shows which model answered.](../images/playground.png)

<sub>The dashboard Playground sends chat requests to /v1/chat/completions with the unified key and shows which model answered.</sub>

## Authentication

Inference routes accept the **unified API key** (`llmharbor-…`, shown on **Keys → Unified API key**)
in any of these headers:

- `Authorization: Bearer <key>`
- `x-api-key: <key>` (Anthropic clients)
- `x-goog-api-key: <key>` (Gemini clients). The Gemini routes also accept `?key=`, but log a
  warning because the key then appears in URLs.

**Client profile keys** (`sk-cp-…`) are created on the same dashboard tab. They work as inference
keys and can enforce a system prompt, which is placed before the caller's own system message.
They cannot read install-wide data such as `GET /v1/usage`, `GET /v1/providers` or
`GET /v1/quota-forecast`.

**URL tokens** are for clients that cannot send headers. Create one under **Keys → Agents →
Revocable URL tokens**, then use `http://localhost:3001/v1/t/<token>` as the OpenAI base URL
(for example `…/v1/t/<token>/chat/completions`, or `…/v1/t/<token>/api/chat` for Ollama). A URL
token covers the OpenAI-compatible routes (except `GET /v1/usage`), the Responses API and the
Ollama routes. Tokens can leak into history and logs, so revoke them when you no longer need them.

The dashboard's `/api/*` routes use a separate session token from signing in. The unified key does
not work there.

## Choosing a model

The `model` field accepts:

| Value | Meaning |
| --- | --- |
| `auto` (or empty) | Walk the active fallback chain using the current routing strategy. |
| `auto:smart`, `auto:fast`, `auto:reliable`, `auto:balanced`, `auto:cheap` | Rank all enabled models by one axis for this request. Aliases: `smartest`/`intelligence`, `fastest`/`speed`, `reliability`, `cheapest`/`price`/`budget`. `auto:cheap` uses the balanced weighting. |
| `auto:<chain-name>` | Use a named fallback chain (profile) created on the Models page. |
| `fusion` | Send the prompt to several models in parallel, then have a judge model write one answer. Configure it under **Models → Fusion**. |
| a model id | Pin a model from `GET /v1/models`. |

Routing strategies, set on the dashboard's Models page, are `priority`, `balanced` (the default),
`smartest`, `fastest`, `reliable`, `custom` and `decision`.

## OpenAI-compatible endpoints

| Method and path | Purpose |
| --- | --- |
| `GET /v1/models` | Models, named chains, `auto` and `fusion`. |
| `POST /v1/chat/completions` | Chat. Supports `stream: true` (SSE), tools, `response_format` and vision content parts. |
| `POST /v1/completions` | Legacy text completions (editor autocomplete). |
| `POST /v1/responses` | OpenAI Responses API (used by Codex CLI). |
| `POST /v1/embeddings` | Embeddings. `model` may be `auto`, a family name, or a provider model id. |
| `POST /v1/rerank` | Rerank documents (Cohere key or a custom endpoint exposing `/rerank`). |
| `POST /v1/moderations` | Moderation. |
| `POST /v1/images/generations` | Image generation. |
| `POST /v1/videos/generations` | Video generation. |
| `POST /v1/audio/speech` | Text to speech. |
| `POST /v1/audio/transcriptions` | Speech to text (multipart upload). |
| `POST /v1/search`, `GET /v1/search/engines` | Web search across the search providers. |
| `POST /v1/decisions`, `GET /v1/decisions/models` | Decision models (`/v1/systemone` is an alias). |
| `GET /v1/codex/models` | Model list in the format Codex expects. |
| `GET /v1/usage` | Monthly usage and caps per key (unified key only). |
| `GET /v1/providers` | Provider status (unified key only). |
| `GET /v1/quota-forecast` | Quota outlook (unified key only). |

## Anthropic, Gemini and Ollama

- **Anthropic:** `POST /v1/messages`, `POST /v1/messages/count_tokens` and `GET /v1/models`. Point
  Anthropic SDKs and Claude Code at the server root (`http://localhost:3001`, without `/v1`).
  Claude model names are mapped to `auto` or a pinned model under **Keys → Anthropic**.
- **Gemini:** `GET /v1beta/models`, `GET /v1beta/models/{model}`, and
  `POST /v1beta/models/{model}:generateContent`, `:streamGenerateContent` and `:countTokens`.
  Gemini model names are mapped under **Keys → Agents → Gemini model mapping**.
- **Ollama:** `GET /api/tags`, `GET /api/version`, `POST /api/show`, `POST /api/chat`,
  `POST /api/generate`, `POST /api/embed` and `POST /api/embeddings`. This is off by default. Turn
  it on under **Keys → Agents → Ollama emulation**:
  - *API key required* checks the unified key.
  - *Open on loopback* accepts unauthenticated requests from the same machine only.

## MCP

`/mcp` (POST, GET, DELETE) is a Model Context Protocol endpoint. New installs start with it off.
Turn it on under **Keys → Agents → MCP server**. It authenticates like `/v1`. Its tools are
`ask_llmharbor`, `healthcheck`, `list_models`, `provider_health`, `usage_summary`,
`routing_info`, `set_routing_strategy`, `cache_stats`, `web_search`, `compression_stats`,
`provider_list`, `clear_cache` and `quota_outlook`.

## Response headers

| Header | Meaning |
| --- | --- |
| `X-Routed-Via` | `<platform>/<model>` that served the request, or `cache`. |
| `X-Request-ID` | The request id. It echoes your `X-Request-ID` if you sent one. |
| `X-Fallback-Trail` | Hops that failed before the one that answered, and why. |
| `X-Fallback-Detail` | Per-hop timings. Only sent when `FALLBACK_DETAIL_HEADER=1`. |
| `X-OSLLM-Cache` | `HIT` when the response came from the response cache. |
| `X-OSLLM-Compress` | Compression result when prompt compression is on. |
| `X-Provider`, `X-Model` | Set on media responses (images, speech, transcription). |

## Health

`GET /livez` and `GET /readyz` report process and readiness state. `GET /api/ping` is the
lightweight check used by the Docker health check. None of them need authentication.

## Examples

```bash
curl http://localhost:3001/v1/chat/completions \
  -H "Authorization: Bearer $LLMHARBOR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"auto","messages":[{"role":"user","content":"Hello"}]}'
```

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:3001/v1", api_key="llmharbor-...")
resp = client.chat.completions.with_raw_response.create(
    model="auto",
    messages=[{"role": "user", "content": "Hello"}],
)
print(resp.headers.get("x-routed-via"))
print(resp.parse().choices[0].message.content)
```

```bash
# Anthropic wire format
curl http://localhost:3001/v1/messages \
  -H "x-api-key: $LLMHARBOR_KEY" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4-5","max_tokens":256,"messages":[{"role":"user","content":"Hello"}]}'
```
