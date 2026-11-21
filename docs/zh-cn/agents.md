[English](../en/agents.md) · **简体中文**

# 智能体与 CLI

任何能设置 OpenAI 兼容基础 URL 的客户端都可以使用 LLMHarbor：基础 URL 用 `http://<主机>:<端口>/v1`，密钥用统一 API
密钥。Claude Code 和其他 Anthropic 客户端使用服务器根地址（不带 `/v1`）。参见 [API](api.md)。

对于下面列出的工具，仓库自带一个 CLI，可以替您写好它们的配置文件。

## 运行 CLI

CLI 位于 [`cli/`](../../cli)，**没有发布到 npm**，所以不存在 `npx llmharbor`。请在检出的仓库中运行：

```bash
git clone https://github.com/Zelvior-Labs/llmharbor.git
cd llmharbor
npm install
npm run cli -- --help
```

`npm run cli` 运行 `scripts/cli.mjs`：首次运行以及源码变化时会构建 `cli/dist`，然后在您调用它的目录中执行命令。在其他目录中
可使用 `npm --prefix <仓库路径> run cli -- <命令>`。

`launch` 和 `doctor` 与当前目录有关：`launch` 在当前目录启动智能体，`doctor` 读取当前项目的 `.claude/` 设置。请在您的
项目目录中配合 `--prefix` 运行：

```bash
cd ~/my-project
npm --prefix ~/llmharbor run cli -- launch
```

桌面版的 **Agents** 页面也可以在应用内配置支持的工具（**Apply** 按钮），桌面用户无需检出仓库。

![仪表板的 Agents 页面会显示填好服务器地址的配置命令，以及手动配置所需的基础 URL 和密钥。](../images/agents.png)

<sub>仪表板的 Agents 页面会显示填好服务器地址的配置命令，以及手动配置所需的基础 URL 和密钥。</sub>

## 命令

| 命令 | 作用 |
| --- | --- |
| `setup-<tool>` | 写入或合并某个工具的配置（列表见下）。 |
| `launch` | 只在 Claude Code 的进程环境中注入网关凭据并运行它。 |
| `launch-codex` | 以 `-c` 参数传入提供方覆盖、在环境中注入密钥来运行 Codex CLI。 |
| `doctor [claude\|codex]` | 检查该工具的设置是否真正指向本网关，否则以非零退出。`--timeout MS` 可延长探测等待。 |
| `list` | 打印每个工具的 id、协议和基础 URL 形式。 |
| `keys …` | 管理提供方密钥（[见下](#提供方密钥)）。 |

支持的 `setup-` 目标及其协议：

| 命令 | 工具 | 协议 |
| --- | --- | --- |
| `setup-claude` | Claude Code | Anthropic Messages（服务器根地址） |
| `setup-codex` | Codex CLI | OpenAI Responses |
| `setup-qwen` | Qwen Code | OpenAI 或 Gemini |
| `setup-cline`、`setup-continue`、`setup-aider`、`setup-opencode`、`setup-goose`、`setup-roo`、`setup-kilo`、`setup-crush`、`setup-dsh`、`setup-mimo`、`setup-atomcode`、`setup-openclaw`、`setup-hermes`、`setup-pi`、`setup-reasonix`、`setup-zcode` | Cline、Continue、Aider、OpenCode、Goose、Roo Code、Kilo Code、Crush、DeepSeek Harness、MiMo Code、AtomCode、OpenClaw、Hermes Agent、Pi、Reasonix、ZCode | OpenAI Chat |
| `setup-cursor` | Cursor | 只打印说明：Cursor 通过自己的云端转发流量，因此网关需要一个公网 HTTPS 地址。 |
| `setup-generic` | 任意 OpenAI 客户端 | 打印基础 URL、密钥和一条测试用的 `curl` 命令。 |

## 选项

| 参数 | 环境变量 | 含义 |
| --- | --- | --- |
| `--url URL` | `LLMHarbor_URL` | 网关地址（默认 `http://localhost:3001`）。 |
| `--api-key KEY` | `LLMHarbor_API_KEY` | 统一 API 密钥，缺省时会提示输入。 |
| `--profile NAME` | — | 生成的配置档或提供方条目的名称（默认 `default`）。 |
| `--model ID` | — | 固定一个模型，会对照网关目录进行检查。 |
| `--dry-run` | — | 只打印差异，不写入任何内容。 |

生成器会从网关读取实时模型列表，合并到现有配置文件中而不是替换，并且在修改前把文件复制为
`<文件>.backup-<时间戳>-<id>`。包含密钥的文件以 `0600` 权限写入。`launch` 和 `launch-codex` 不写磁盘。

示例：

```bash
npm run cli -- setup-claude --url http://localhost:3001 --api-key llmharbor-...
npm run cli -- setup-codex --dry-run
npm run cli -- doctor claude
```

`setup-claude` 写入 `~/.claude/settings.json`（使用 `--profile` 时为 `~/.claude/profiles/<name>/settings.json`）；
`setup-codex` 写入 `~/.codex/config.toml`。其他工具请用 `--dry-run` 查看确切路径。

## 提供方密钥

`keys` 调用的是仪表板 API，因此需要**仪表板会话令牌**，而不是统一密钥。通过 `LLMHarbor_DASHBOARD_TOKEN` 或 `--token`
设置；登录仪表板后，浏览器会把它保存在本地存储的 `llmharbor_dashboard_token` 中。

```bash
export LLMHarbor_URL=http://localhost:3001
export LLMHarbor_DASHBOARD_TOKEN='<仪表板会话令牌>'

npm run cli -- keys add groq              # 不回显地提示输入密钥
npm run cli -- keys add groq --key '<key>'
npm run cli -- keys list
npm run cli -- keys test groq             # 测试 groq 的所有已存密钥
npm run cli -- keys remove groq --id 7
```

- `add` 先保存密钥再验证；验证失败时密钥仍保留，命令以退出码 1 结束。
- 某个平台有多个密钥时，`remove` 需要 `--id`。
- 免密钥提供方不会提示输入密钥。
- 自定义端点需要在仪表板中创建。
- `--timeout MS`（默认 30000）作用于每个请求。

## MCP 与 ChatGPT

开启后（**Keys → Agents → MCP server**），`/mcp` 会向 MCP 客户端提供推理、模型列表、健康、用量、缓存和路由等工具。
`ask_llmharbor` 工具通过 `/v1/chat/completions` 路由提示词，默认使用 `auto`，除非设置了 `MCP_INFERENCE_DEFAULT_MODEL`。
ChatGPT 等远程客户端只能通过您自己提供的隧道访问本地网关；请把密钥放在隧道或客户端配置中，不要放进 URL。工具列表见
[API](api.md#mcp)。
