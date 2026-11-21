[English](../en/configuration.md) · **简体中文**

# 配置

服务器读取环境变量；在源码检出中，它还会加载仓库根目录的 `.env`（设置 `FREEAPI_ENV_PATH` 可加载其他文件）。
[`.env.example`](../../.env.example) 对下面每个变量都有更详细的说明，可以复制为 `.env` 作为起点。

大部分运行时行为（路由策略、回退链、缓存、压缩、出站代理）也可以在仪表板中修改。当仪表板设置和环境变量同时存在时，
`.env.example` 会说明哪一个优先。

## 核心

| 变量 | 默认值 | 含义 |
| --- | --- | --- |
| `ENCRYPTION_KEY` | 非生产环境自动生成 | 64 位十六进制字符（32 字节），用于加密已存储的提供方密钥。`NODE_ENV=production` 时**必填**。未设置时，从数据库旁的 `.encryption-key` 读取（或写入）。 |
| `PORT` | `3001` | HTTP 端口。 |
| `HOST` | `::` | 监听地址；IPv6 不可用时回退到 `0.0.0.0`。仅限本机请用 `127.0.0.1`。 |
| `NODE_ENV` | — | `production` 时 `ENCRYPTION_KEY` 为必填；`development` 时跳过自动迁移。 |
| `FREEAPI_DB_PATH` | `server/data/freeapi.db` | SQLite 文件位置。 |
| `FREEAPI_ENV_PATH` | `<仓库>/.env` | 要加载的 `.env` 文件。 |
| `CLIENT_DIST` | `client/dist` | 要提供的预构建仪表板目录。 |

## 网络暴露与安全

| 变量 | 默认值 | 含义 |
| --- | --- | --- |
| `HOST_BIND` | `127.0.0.1` | 仅限 Docker Compose：容器端口发布到的主机接口。 |
| `ALLOWED_HOSTS` | 关闭 | 逗号分隔的 Host 头白名单（防 DNS 重绑定）。回环名称始终允许。 |
| `TRUST_PROXY` | `false` | 信任 `X-Forwarded-*` 头：`true`、跳数，或地址/CIDR 列表。 |
| `DASHBOARD_ORIGINS` | — | CORS 额外允许的浏览器来源。5173 端口上的 Vite 开发来源始终允许。 |
| `CSP_UPGRADE_INSECURE_REQUESTS` | 自动 | 强制开启（`true`）或关闭（`false`）CSP 的 `upgrade-insecure-requests`。 |
| `PROXY_RATE_LIMIT_RPM` | `120` | 每个客户端 IP 每分钟的 `/v1` 请求数，`0` 表示不限。 |
| `ADMIN_RATE_LIMIT_RPM` | `600` | 每个客户端 IP 每分钟的 `/api` 仪表板请求数，`0` 表示不限。 |
| `REQUEST_BODY_LIMIT_MB` | `25` | 推理路由的 JSON 请求正文大小上限。 |
| `FREEAPI_BLOCK_PRIVATE_PROVIDER_URLS` | 关闭 | 同时拒绝把回环和私有网段地址用作自定义提供方的基础 URL（元数据和链路本地地址始终被拒绝）。 |

反向代理、局域网访问和出站代理见[网络](networking.md)。

## 路由与故障切换

| 变量 | 默认值 | 含义 |
| --- | --- | --- |
| `FALLBACK_TIME_BUDGET_MS` | `45000` | 在提供方之间故障切换的总时间预算，`0` 表示不限。 |
| `SLOW_ENDPOINT_BUFFER_MS`、`TTFB_BUDGET_*` | 见 `.env.example` | 为首字节时间历来较慢的端点放宽预算。 |
| `PROVIDER_TIMEOUT_<PLATFORM>` | 按提供方 | 某个平台的聊天 HTTP 超时（毫秒），也是流式响应的首字节宽限期。 |
| `PROVIDER_STREAM_STALL_TIMEOUT_MS` | `90000` | 流式响应中途无数据的超时；加 `_<PLATFORM>` 后缀可单独设置某个平台。 |
| `PROVIDER_DAILY_REQUEST_CAP_<PLATFORM>` | 按提供方 | 某个平台的每日请求上限，`0` 表示关闭。 |
| `CLOUDFLARE_DAILY_NEURON_CAP` | `9000` | 每个 Cloudflare 账户的每日 neuron 上限。 |
| `MODEL_ROUTING_OVERRIDES` | — | 模型 id → 得分倍数（`0` 到 `2`）的 JSON 映射。 |
| `REQUEST_MAX_TOKENS_BUDGET` | `0`（关闭） | 估算输入加 `max_tokens` 超过此值的请求会被拒绝。 |
| `MAX_CONSECUTIVE_UPSTREAM_FAILS` | `0`（关闭） | 连续多少次上游失败后停止故障切换。 |
| `VALIDATE_TOOL_ARGUMENTS` | 关闭 | 工具调用参数不符合声明的 schema 时进行故障切换。 |
| `FALLBACK_DETAIL_HEADER` | 关闭 | 添加带有每一跳耗时的 `X-Fallback-Detail` 响应头。 |
| `STREAM_KEEPALIVE_MS` | 关闭 | 在流式响应等待首个词元时发送 SSE 心跳注释（最小 1000 毫秒）。 |

## 健康检查与探测

| 变量 | 默认值 | 含义 |
| --- | --- | --- |
| `HEALTH_CHECK_INTERVAL_MS` | `300000` | 定时密钥健康检查的间隔（最小 60000）。 |
| `MODEL_PROBE_ENABLED` | 关闭 | 每 30 分钟向少数模型发送一条很短的聊天，确认它们能应答。每次探测都会消耗额度。 |
| `MODEL_PROBE_MAX_PER_PASS` | `3` | 每轮探测的模型数。 |
| `MODELSCOPE_VALIDATE_CACHE_MS` | `86400000` | ModelScope 密钥验证成功后的缓存时长。 |
| `BUDGET_ALERT_WEBHOOK_URL` | — | 密钥用量越过月度上限的 80% 或 100% 时，向此地址 POST JSON。 |

## 响应缓存、压缩、上下文交接

| 变量 | 默认值 | 含义 |
| --- | --- | --- |
| `RESPONSE_CACHE` | `false` | `/v1/chat/completions` 的精确匹配缓存。 |
| `RESPONSE_CACHE_PERSIST` | `true` | 把缓存的非流式回答持久化到 SQLite（以明文存储）。 |
| `RESPONSE_CACHE_TTL_SECONDS` | `3600` | 缓存回答的有效时长。 |
| `RESPONSE_CACHE_MAX_TEMPERATURE` | `1.0` | 只缓存温度不高于此值的请求。 |
| `RESPONSE_CACHE_MAX_ENTRIES` | `5000` | 最多存储的条目数。 |
| `LLMHarbor_COMPRESSION` | `off` | 提示词压缩模式：`off`、`lossless`、`standard` 或 `aggressive`。 |
| `LLMHarbor_CONTEXT_HANDOFF` | 关闭 | `on_model_switch`：会话切换模型时注入一条简短的系统说明。 |

客户端可以用 `X-OSLLM-Cache: on|off` 请求头逐个请求覆盖缓存设置，用 `X-OSLLM-Compress` 降低压缩模式。

## 图片

`IMAGE_NORMALIZE`（默认 `on`）、`IMAGE_NORMALIZE_MAX_DIMENSION`（`2048`）、`IMAGE_NORMALIZE_THRESHOLD_KB`（`1024`）
和 `IMAGE_NORMALIZE_QUALITY`（`90`）控制入站 data URL 图片在路由前如何缩小和重新编码。

## 出站代理

`PROXY_URL`、`ALL_PROXY`、`HTTPS_PROXY`、`HTTP_PROXY`、`NO_PROXY`、`PROXY_REQUIRED_PLATFORMS`、
`FREEAPI_PROXY_LOCAL_DESTINATIONS`、`PROXY_MODE` 和 `FETCH_RELAY_TOKEN` 见[网络](networking.md#出站代理)。

## 保留期限

下面每一对变量分别按天数和行数限制一张日志表，`0` 表示不限制该项。

| 变量 | 默认值 |
| --- | --- |
| `REQUEST_ANALYTICS_RETENTION_DAYS`、`REQUEST_ANALYTICS_MAX_ROWS` | `90`、`100000` |
| `QUOTA_OBSERVATIONS_RETENTION_DAYS`、`QUOTA_OBSERVATIONS_MAX_ROWS` | `7`、`50000` |
| `SERVER_LOGS_RETENTION_DAYS`、`SERVER_LOGS_MAX_ROWS` | `7`、`50000` |
| `SEARCH_LOGS_RETENTION_DAYS`、`SEARCH_LOGS_MAX_ROWS` | `90`、`100000` |
| `DECISION_LOGS_RETENTION_DAYS`、`DECISION_LOGS_MAX_ROWS` | `90`、`100000` |

`REQUEST_ANALYTICS_LOG_CLIENT=false` 会停止记录调用方的 IP 和 User-Agent。

## 数据库备份

| 变量 | 含义 |
| --- | --- |
| `FREEAPI_DB_BACKUP_PATH` / `FREEAPI_DB_BACKUP_URL` | 加密备份目标（文件路径或 HTTP(S) URL）。启动时如果数据库文件不存在，会从备份恢复。 |
| `FREEAPI_DB_BACKUP_TOKEN` | 备份 URL 的 Bearer 令牌。 |
| `FREEAPI_DB_BACKUP_KEY` | 独立的 64 位十六进制备份密钥，默认使用 `ENCRYPTION_KEY`。 |
| `FREEAPI_DB_BACKUP_INTERVAL_MS` | 上传间隔，毫秒（默认 `300000`）。 |
| `AUTO_BACKUP_DUMP_RETENTION` | Backups 页面保留的自动转储数量（默认 `10`，`0` 表示全部保留）。 |
| `FREEAPI_DB_DIR_HARDENING` | `1` 或 `0`：强制或跳过收紧数据库目录的权限。 |

## 声明式启动配置

`FREEAPI_CONFIG_PATH`（JSON 文件路径）或 `FREEAPI_CONFIG_JSON`（内联 JSON）会在每次启动时、迁移完成后、HTTP
监听开始前应用。schema 在 `server/src/services/declarative-config.ts`。以下顶层字段均为可选：

- `admin`：`{ "email", "password" }`，仅在还没有账户时创建第一个账户（密码至少 8 个字符）。
- `license`：仪表板 **Premium** 页面使用的许可证密钥。该字段来自 freellmapi；LLMHarbor 没有付费方案，也不出售密钥。
- `keys`：`[{ "platform", "key", "label", "baseUrl", "enabled" }]`。
- `customProviders`：`[{ "baseUrl", "apiKey", "label", "models": [...] }]`。
- `models`：逐个模型的覆盖设置（`platform`、`modelId`、排名、限额、`enabled` 等）。
- `fallback`：`[{ "platform", "modelId", "priority", "enabled" }]`。
- `routing`：`{ "strategy", "weights", "keySelectionStrategy" }`，strategy 取 `priority`、`balanced`、`smartest`、
  `fastest`、`reliable`、`custom` 或 `decision` 之一。

```json
{
  "admin": { "email": "ops@example.com", "password": "change-me-please" },
  "keys": [{ "platform": "groq", "key": "gsk_...", "label": "main" }],
  "routing": { "strategy": "balanced" }
}
```

该文件包含明文机密，请像保护 `ENCRYPTION_KEY` 一样保护它。

## 目录同步与更新

| 变量 | 含义 |
| --- | --- |
| `CATALOG_SYNC_DISABLED=1` | 关闭[提供方](providers.md#模型目录)中描述的模型目录同步。 |
| `CATALOG_BASE_URL`、`CATALOG_PUBKEY` | 让同步使用另一个目录服务器和签名公钥。默认服务器是 `https://api.freellmapi.co`。 |
| `PREMIUM_SITE_URL` | **Premium** 页面中链接（价格和找回密钥）指向的地址。默认 `https://freellmapi.co`。 |
| `LLMHarbor_UPDATE_CHECK=off` | 隐藏 Settings 中的更新检查，并停止检查更新的请求。 |
| `LLMHarbor_UPDATE_GITHUB_TOKEN` | 可选，仅用于向 GitHub 检查更新的令牌。 |
| `WATCHTOWER_TOKEN` | 启用 Docker 的 “Update now”，见 [Docker](docker.md#自更新)。 |
| `MCP_INFERENCE_DEFAULT_MODEL`、`MCP_INFERENCE_TIMEOUT_MS` | MCP 工具 `ask_llmharbor` 的默认模型（`auto`）和超时（`120000`）。 |
