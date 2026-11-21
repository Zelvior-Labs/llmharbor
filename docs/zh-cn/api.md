[English](../en/api.md) · **简体中文**

# API

服务器在同一个端口上支持四种协议：OpenAI 兼容（`/v1`）、Anthropic Messages（`/v1/messages`）、Gemini（`/v1beta`），
以及开启后的 Ollama（`/api/*`）。它还提供 MCP 端点（`/mcp`）。OpenAPI 文档位于 `GET /v1/openapi.json`，查看器位于
`GET /v1/docs`，两者都不需要认证。

下面的示例使用 `http://localhost:3001`；桌面版和 Android 默认使用 `http://127.0.0.1:31415`。

![仪表板的 Playground 使用统一密钥向 /v1/chat/completions 发送聊天请求，并显示实际回答的模型。](../images/playground.png)

<sub>仪表板的 Playground 使用统一密钥向 /v1/chat/completions 发送聊天请求，并显示实际回答的模型。</sub>

试验台的各种模式、智能体工具和工作区见[试验台](playground.md)。

## 认证

推理路由接受放在以下任一请求头中的**统一 API 密钥**（`llmharbor-…`，在 **Keys → Unified API key** 中显示）：

- `Authorization: Bearer <key>`
- `x-api-key: <key>`（Anthropic 客户端）
- `x-goog-api-key: <key>`（Gemini 客户端）。Gemini 路由也接受 `?key=`，但会记录警告，因为密钥会出现在 URL 中。

**客户端配置密钥**（`sk-cp-…`）在同一个仪表板标签页中创建。它们可作为推理密钥使用，并可强制附加系统提示词（放在
调用方自己的系统消息之前）。它们不能读取全局数据，例如 `GET /v1/usage`、`GET /v1/providers` 或
`GET /v1/quota-forecast`。

**URL 令牌**用于无法发送请求头的客户端。在 **Keys → Agents → Revocable URL tokens** 中创建，然后把
`http://localhost:3001/v1/t/<token>` 用作 OpenAI 基础 URL（例如 `…/v1/t/<token>/chat/completions`，Ollama 用
`…/v1/t/<token>/api/chat`）。URL 令牌适用于 OpenAI 兼容路由（`GET /v1/usage` 除外）、Responses API 和 Ollama 路由。
令牌可能泄露到历史记录和日志中，不再需要时请撤销。

仪表板的 `/api/*` 路由使用登录后获得的独立会话令牌，统一密钥在那里无效。

## 选择模型

`model` 字段可以是：

| 值 | 含义 |
| --- | --- |
| `auto`（或留空） | 按当前路由策略遍历当前的回退链。 |
| `auto:smart`、`auto:fast`、`auto:reliable`、`auto:balanced`、`auto:cheap` | 本次请求按某一维度对所有已启用模型排序。别名：`smartest`/`intelligence`、`fastest`/`speed`、`reliability`、`cheapest`/`price`/`budget`。`auto:cheap` 使用 balanced 权重。 |
| `auto:<链名称>` | 使用在 Models 页面创建的命名回退链（profile）。 |
| `fusion` | 把提示词并行发给多个模型，再由一个评审模型写出一个回答。在 **Models → Fusion** 中配置。 |
| 模型 id | 固定使用 `GET /v1/models` 中的某个模型。 |

路由策略在仪表板的 Models 页面设置，可选 `priority`、`balanced`（默认）、`smartest`、`fastest`、`reliable`、
`custom` 和 `decision`。

## OpenAI 兼容端点

| 方法和路径 | 用途 |
| --- | --- |
| `GET /v1/models` | 模型、命名链、`auto` 和 `fusion`。 |
| `POST /v1/chat/completions` | 聊天。支持 `stream: true`（SSE）、工具、`response_format` 和视觉内容。 |
| `POST /v1/completions` | 旧版文本补全（编辑器自动补全）。 |
| `POST /v1/responses` | OpenAI Responses API（Codex CLI 使用）。 |
| `POST /v1/embeddings` | 向量嵌入。`model` 可以是 `auto`、模型系列名或提供方模型 id。 |
| `POST /v1/rerank` | 文档重排序（Cohere 密钥或提供 `/rerank` 的自定义端点）。 |
| `POST /v1/moderations` | 内容审核。 |
| `POST /v1/images/generations` | 图片生成。 |
| `POST /v1/videos/generations` | 视频生成。 |
| `POST /v1/audio/speech` | 文字转语音。 |
| `POST /v1/audio/transcriptions` | 语音转文字（multipart 上传）。 |
| `POST /v1/search`、`GET /v1/search/engines` | 跨搜索提供方的网页搜索。 |
| `POST /v1/decisions`、`GET /v1/decisions/models` | 决策模型（`/v1/systemone` 是别名）。 |
| `GET /v1/codex/models` | Codex 所需格式的模型列表。 |
| `GET /v1/usage` | 每个密钥的月度用量和上限（仅统一密钥）。 |
| `GET /v1/providers` | 提供方状态（仅统一密钥）。 |
| `GET /v1/quota-forecast` | 额度展望（仅统一密钥）。 |

## Anthropic、Gemini 与 Ollama

- **Anthropic：**`POST /v1/messages`、`POST /v1/messages/count_tokens` 和 `GET /v1/models`。Anthropic SDK 和
  Claude Code 应指向服务器根地址（`http://localhost:3001`，不带 `/v1`）。Claude 模型名在 **Keys → Anthropic** 中
  映射到 `auto` 或某个固定模型。
- **Gemini：**`GET /v1beta/models`、`GET /v1beta/models/{model}`，以及 `POST /v1beta/models/{model}:generateContent`、
  `:streamGenerateContent` 和 `:countTokens`。Gemini 模型名在 **Keys → Agents → Gemini model mapping** 中映射。
- **Ollama：**`GET /api/tags`、`GET /api/version`、`POST /api/show`、`POST /api/chat`、`POST /api/generate`、
  `POST /api/embed` 和 `POST /api/embeddings`。默认关闭，在 **Keys → Agents → Ollama emulation** 中开启：
  - *API key required* 会校验统一密钥。
  - *Open on loopback* 只接受来自本机的未认证请求。

## MCP

`/mcp`（POST、GET、DELETE）是 Model Context Protocol 端点，新安装默认关闭，在 **Keys → Agents → MCP server** 中开启。
它的认证方式与 `/v1` 相同。提供的工具有 `ask_llmharbor`、`healthcheck`、`list_models`、`provider_health`、
`usage_summary`、`routing_info`、`set_routing_strategy`、`cache_stats`、`web_search`、`compression_stats`、
`provider_list`、`clear_cache` 和 `quota_outlook`。

## 响应头

| 响应头 | 含义 |
| --- | --- |
| `X-Routed-Via` | 实际处理请求的 `<platform>/<model>`，或 `cache`。 |
| `X-Request-ID` | 请求 id；如果您发送了 `X-Request-ID`，则原样返回。 |
| `X-Fallback-Trail` | 在成功应答之前失败的各跳及原因。 |
| `X-Fallback-Detail` | 每一跳的耗时，仅在 `FALLBACK_DETAIL_HEADER=1` 时发送。 |
| `X-OSLLM-Cache` | 响应来自响应缓存时为 `HIT`。 |
| `X-OSLLM-Compress` | 开启提示词压缩时的压缩结果。 |
| `X-Provider`、`X-Model` | 在媒体响应（图片、语音、转写）中设置。 |

## 健康检查

`GET /livez` 和 `GET /readyz` 报告进程状态和就绪状态；`GET /api/ping` 是 Docker 健康检查使用的轻量检查。三者都不需要认证。

## 示例

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
# Anthropic 协议
curl http://localhost:3001/v1/messages \
  -H "x-api-key: $LLMHARBOR_KEY" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4-5","max_tokens":256,"messages":[{"role":"user","content":"Hello"}]}'
```
