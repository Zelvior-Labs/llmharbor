[English](../en/networking.md) · **简体中文**

# 网络

LLMHarbor 被设计为单用户、可信网络中的服务，它的 `/v1` API 只由统一 API 密钥保护。不要把它直接暴露到互联网。

## 监听地址

| 安装方式 | 默认 | 如何开放到局域网 |
| --- | --- | --- |
| 源码 | `HOST=::`（所有接口，IPv6 和 IPv4） | 已经在监听；设置 `HOST=127.0.0.1` 可限制为本机。 |
| Docker Compose | 发布在 `127.0.0.1` | `HOST_BIND=0.0.0.0` |
| 桌面版 | `127.0.0.1:31415` | 托盘菜单 → **Allow LAN access (0.0.0.0)** |
| Android | `127.0.0.1:31415` | 应用中的 **Allow other devices on my Wi-Fi (LAN)** |
| 32 位 Linux 包 | `127.0.0.1:3001` | 运行 `start.mjs` 前设置 `HOST` |

在还没有账户时，其他设备上的浏览器需要服务器日志中的一次性设置码才能创建第一个账户。

## 反向代理（TLS）

在服务器前面使用 Caddy、nginx 或 Traefik 时：

- 设置 `TRUST_PROXY`，让客户端 IP（用于速率限制和分析）和 HTTPS 协议取自 `X-Forwarded-*`。同一台主机上只有一层代理时用
  `TRUST_PROXY=1`，也可以填写地址或 CIDR 列表。
- 把 `ALLOWED_HOSTS` 设为您使用的主机名，例如 `ALLOWED_HOSTS=llmharbor.home.arpa`。之后 `Host` 头为其他值的请求（回环名称除外）会得到 403。
- 流式响应是 Server-Sent Events，请在代理中为 `/v1`、`/v1beta` 和 `/mcp` 关闭响应缓冲。
- 如果仪表板与 API 不同源，请把仪表板的来源加入 `DASHBOARD_ORIGINS`。

转发头永远不会让请求被视为本地请求：经过代理的请求和其他远程请求一样需要设置码。

## 出站代理

发往提供方的请求可以走代理。可在仪表板的 **Keys → Outbound proxy** 中设置，无界面安装则使用环境变量：

| 变量 | 含义 |
| --- | --- |
| `PROXY_URL` | `http`、`https`、`socks4`、`socks4a`、`socks5` 或 `socks5h` URL（带 `h`/`a` 的变体在代理端解析 DNS）。 |
| `ALL_PROXY`、`HTTPS_PROXY`、`HTTP_PROXY` | 标准变量，小写写法同样会被读取。 |
| `NO_PROXY` | 绕过代理的主机。裸域名同时覆盖其子域名，`*` 表示禁用代理。 |
| `PROXY_REQUIRED_PLATFORMS` | 必须走代理的平台 id；代理缺失或被绕过时，这些请求会失败，而不是直接发出。 |
| `FREEAPI_PROXY_LOCAL_DESTINATIONS=true` | 让回环和局域网目标也走代理（默认它们总是绕过代理）。 |

优先级：`PROXY_URL` → 仪表板设置 → `ALL_PROXY` → `HTTPS_PROXY` → `HTTP_PROXY`。

### Fetch Relay

`PROXY_MODE=fetch-relay` 会把提供方请求发给一个 HTTP 中继，而不是 CONNECT/SOCKS 代理。中继负责请求目标地址，并把响应流式返回：

```dotenv
PROXY_MODE=fetch-relay
PROXY_URL=https://relay.example.workers.dev
FETCH_RELAY_TOKEN=<足够长的随机令牌>
```

每个请求都带有 `Fetch-Relay-Target: <完整的提供方 URL>` 和 `Fetch-Relay-Authorization: Bearer <中继令牌>`，以及原始的方法、
请求头和请求正文。重定向不会被自动跟随。`FETCH_RELAY_TOKEN` 优先于仪表板中保存的令牌。中继能看到提供方密钥和请求内容，
请自己部署。[`examples/fetch-relay-worker`](../../examples/fetch-relay-worker/README.md)（英文）是一个现成的 Cloudflare Worker。
