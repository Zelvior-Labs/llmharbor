[English](../en/architecture.md) · **简体中文**

# 架构

## 仓库结构

| 路径 | 内容 |
| --- | --- |
| `server/` | Express 5 服务器（TypeScript）：路由、路由器、速率限制、提供方适配器、SQLite 访问、迁移。工作区 `@llmharbor/server`。 |
| `client/` | React + Vite 仪表板，构建产物由服务器提供。 |
| `shared/` | 服务器和客户端共用的类型，包括 `Platform` 联合类型。 |
| `cli/` | 智能体配置与密钥管理 CLI（`npm run cli`），未发布到 npm。 |
| `desktop/` | Electron 托盘应用、Windows 7 版（`desktop/win7/`）和 32 位 Linux 服务器包（`desktop/linux-browser/`）。使用自己的 `package.json`，不是 npm 工作区。 |
| `android/` | 独立 Android APK：Java 启动器加运行在 nodejs-mobile 上的 `gateway.mjs`。 |
| `site/` | 部署到 <https://llmharbor.vercel.app> 的静态网站。 |
| `examples/fetch-relay-worker/` | 用于 Fetch Relay 出站模式的 Cloudflare Worker。 |
| `scripts/` | `cli.mjs`（`npm run cli` 的包装脚本）和开发引导脚本。 |
| `.github/workflows/` | CI、Docker 镜像、桌面、Linux、Windows 7 和 Android 的发布工作流。 |

## 请求流程

1. 请求从某个入口到达：`/v1`（OpenAI 兼容和 Anthropic Messages）、`/v1beta`（Gemini）、`/api/*`（Ollama 模拟）或 `/mcp`。
2. 中间件依次处理主机白名单、Helmet 安全头、CORS、请求正文大小限制和按 IP 的速率限制。
3. 路由校验统一密钥、客户端配置密钥或 URL 令牌。
4. 运行可选的请求端步骤：图片规范化、提示词压缩、响应缓存查找。
5. 路由器（`server/src/services/router.ts`）把 `model` 字段解析为候选模型链，来源是当前回退链、`auto:<axis>` 排序、命名链或固定模型。
6. 回退循环（`server/src/lib/fallback-loop.ts`）按顺序尝试候选模型，在故障切换时间预算内最多尝试 20 次。每次尝试都会选择一个
   健康、不在冷却中且未超过速率限制的密钥，在内存中解密，然后调用提供方适配器。
7. 尝试失败时（例如 429、5xx、超时或流停滞），该模型/密钥进入冷却，并尝试下一个候选。响应会在 `X-Fallback-Trail` 中报告跳过的各跳。
8. 按平台、模型和密钥记录用量，分析数据写入 SQLite。

## 路由

- **策略：**`balanced`（默认）、`smartest`、`fastest` 和 `reliable` 是对可靠性、速度和智能得分的权重预设；`custom` 使用您自己的
  权重；`priority` 按您手动设置的链顺序；`decision` 用于决策请求。得分由基于实时结果的 Thompson 采样多臂老虎机算法抽样得出。
- **速率限制：**按密钥统计每分钟和每个 UTC 日的请求数和词元数，另有多个模型共享同一额度的提供方级额度池。进行中的请求在完成前就会被计入。
- **冷却：**失败的模型/密钥组合会被暂停使用，后台探测可以提前解除。
- **粘性会话：**一个对话在最多 30 分钟内保持使用它开始时的模型，多轮会话不会在模型之间跳来跳去。
- **健康检查：**按计划验证每个已存储的密钥（`HEALTH_CHECK_INTERVAL_MS`，默认 5 分钟，带随机抖动）。

![Models 页面：当前策略以及决定当前顺序的实时评分。](../images/models.png)

<sub>Models 页面：当前策略以及决定当前顺序的实时评分。</sub>

## 存储

- SQLite：服务器和桌面安装使用 `better-sqlite3`，Android 和 Windows 7 版使用内置 `node:sqlite`，32 位 Linux 包使用 WebAssembly
  驱动 `node-sqlite3-wasm`。`FREEAPI_SQLITE_DRIVER`（`node:sqlite` 或 `wasm`）用于选择驱动。
- 表结构和自带模型目录是 `server/src/db/migrations/` 中的迁移，使用 `npm run db:migration:create|up|down|status|fresh`。
- 提供方密钥用 `ENCRYPTION_KEY`（或生成的 `.encryption-key` 文件）以 AES-256-GCM 加密。`server/src/scripts/rotate-encryption-key.ts`
  可用新密钥重新加密它们（见[故障排查](troubleshooting.md)）。
- 签名目录同步可以在迁移之上添加或更新模型，见[提供方](providers.md#模型目录)。

![Analytics 页面读取已记录的请求。](../images/analytics.png)

<sub>Analytics 页面读取已记录的请求。</sub>

## 这种方式的局限

模型池依赖提供方控制的免费额度，额度、模型可用性和条款都可能不经通知而变化。延迟因提供方而异，也没有 SLA。链中最好的模型
用完每日额度后，请求会落到仍然可用的模型上；每日计数在 UTC 午夜重置。您对每个提供方的使用受该提供方条款约束。
