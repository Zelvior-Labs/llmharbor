[English](../../en/cli/01-generators.md) · **简体中文**

# 安装生成器

## 用法

请在 LLMHarbor 仓库目录中运行（先执行 `npm install`）。该 CLI 不在 npm 上，因此 `npx llmharbor` 不可用。在其他目录中可使用 `npm --prefix /path/to/llmharbor run cli -- <命令>`。

```bash
npm run cli -- setup-claude        # 接入 Claude Code
npm run cli -- setup-codex         # 接入 Codex CLI
npm run cli -- setup-dsh           # 接入 DeepSeek Harness
npm run cli -- setup-mimo          # 接入 MiMo Code
npm run cli -- setup-atomcode      # 接入 AtomCode
npm run cli -- --dry-run setup-claude  # 预览而不写入
npm run cli -- setup-claude --model gpt-4o  # 固定模型
```

每个生成器（`cli/src/tools.ts:52-622`）都会拉取实时目录、对照未过滤目录解析 `--model`（`c942352`）、对已有配置做带时间戳的备份、在不覆盖无关键的前提下合并，并以 `0600` 权限写入。

## 生成器一览

| 命令 | 目标文件 | 协议 | 备注 |
| --- | --- | --- | --- |
| `setup-claude` | `~/.claude/settings.json` | Anthropic Messages | `ANTHROPIC_BASE_URL`/`AUTH_TOKEN`/`MODEL`、`CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`、`launch` 零持久化启动器 |
| `setup-codex` | `~/.codex/config.toml` | OpenAI Responses | `[model_providers.llmharbor]` `wire_api=responses`、`launch-codex` 启动器 |
| `setup-cline` | `~/.config/Code/User/settings.json` | OpenAI Chat | Cline VS Code 扩展 |
| `setup-continue` | `~/.continue/config.json` | OpenAI Chat | Continue 幽灵文本自动补全 |
| `setup-aider` | `~/.aider.conf.yml` | OpenAI Chat | Aider 结对编程 |
| `setup-opencode` | `~/.config/opencode/opencode.json` + 密钥写入 `~/.local/share/opencode/auth.json` | OpenAI Chat | OpenCode 智能体 |
| `setup-goose` | `~/.config/goose/config.yaml` | OpenAI Chat | Goose 智能体 |
| `setup-qwen` | `~/.qwen/settings.json` | OpenAI/Gemini | Qwen Code，`/v1` 或原生 `/v1beta` |
| `setup-roo` | `~/.config/roo/config.json` | OpenAI Chat | Roo Code |
| `setup-kilo` | `~/.config/kilo/config.json` | OpenAI Chat | Kilo Code |
| `setup-crush` | `~/.config/crush/config.json` | OpenAI Chat | Crush（charmbracelet） |
| `setup-dsh` | `~/.dsh/config.json` | OpenAI Chat | DeepSeek Harness（#995） |
| `setup-mimo` | `~/.config/mimocode/config.json` | OpenAI Chat | MiMo Code `~/.config/mimocode/config.json` `default_provider=llmharbor` + `[providers.llmharbor]` `type=openai` `base_url=/v1` `api_key` `model` `context_window`（#1003） |
| `setup-atomcode` | `~/.atomcode/config.toml` | OpenAI Chat | `default_model=llmharbor` + `[provider_accounts.llmharbor]` + `[models.llmharbor]`；保留其他账户、模型和旧版提供方配置 |
| `setup-cursor` | 仅指引 | OpenAI Chat | 手动 `Cursor Settings → Models → Add Model`（无文件） |
| `setup-generic` | 仅指引 | OpenAI Chat | 任意 OpenAI 兼容客户端 |

## 零持久化启动器

```bash
npm run cli -- launch            # 仅在 env 中注入 LLMHarbor_API_KEY + model 并启动 `claude`
npm run cli -- launch-codex      # 注入到 `codex --profile NAME`
```

这些命令不会写入配置文件；它们仅在子进程的环境变量中注入 `LLMHarbor_API_KEY`/`LLMHarbor_MODEL`。适用于临时或共享机器。

## `llmharbor doctor`

```bash
npm run cli -- doctor
```

验证客户端请求是否到达本网关（检查已路由的 `Authorization` 头、目录、实时探针）。

## 通用参数

| 参数 | 作用 |
| --- | --- |
| `--dry-run` | 预览变更而不写入；显示 diff |
| `--model <id>` | 固定到指定模型（对照未过滤目录解析） |
| `--profile <name>` | 命名配置档（Codex `codex --profile NAME`、Claude `CLAUDE_CONFIG_DIR`） |

## 相关

- [配置文件](02-config-files.md) —— 合并策略、`tools.json`、新增生成器。
- [客户端与编程智能体](../clients/01-agent-clients.md) —— 按智能体接入配方、无头 URL 令牌、MCP。
