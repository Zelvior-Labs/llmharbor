**English** · [简体中文](../../zh-cn/cli/01-generators.md)

# Setup generators

## Usage

Run these from your LLMHarbor checkout (after `npm install`). The CLI is not on npm, so `npx llmharbor` does not work. From another directory, use `npm --prefix /path/to/llmharbor run cli -- <command>`.

```bash
npm run cli -- setup-claude        # wire Claude Code
npm run cli -- setup-codex         # wire Codex CLI
npm run cli -- setup-dsh           # wire DeepSeek Harness
npm run cli -- setup-mimo          # wire MiMo Code
npm run cli -- setup-atomcode      # wire AtomCode
npm run cli -- --dry-run setup-claude  # preview without writing
npm run cli -- setup-claude --model gpt-4o  # pin a model
```

Every generator (`cli/src/tools.ts:52-622`) fetches the live catalog, resolves `--model` against the unfiltered catalog (`c942352`), backs up existing config with a timestamped copy, merges without clobbering unrelated keys, and writes with `0600`.

## Generator table

| Command | Target file | Protocol | Notes |
| --- | --- | --- | --- |
| `setup-claude` | `~/.claude/settings.json` | Anthropic Messages | `ANTHROPIC_BASE_URL`/`AUTH_TOKEN`/`MODEL`, `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`, `launch` zero-persistence launcher |
| `setup-codex` | `~/.codex/config.toml` | OpenAI Responses | `[model_providers.llmharbor]` `wire_api=responses`, `launch-codex` launcher |
| `setup-cline` | `~/.config/Code/User/settings.json` | OpenAI Chat | Cline VS Code extension |
| `setup-continue` | `~/.continue/config.json` | OpenAI Chat | Continue ghost-text autocomplete |
| `setup-aider` | `~/.aider.conf.yml` | OpenAI Chat | Aider pair-programmer |
| `setup-opencode` | `~/.config/opencode/opencode.json` + key in `~/.local/share/opencode/auth.json` | OpenAI Chat | OpenCode agent |
| `setup-goose` | `~/.config/goose/config.yaml` | OpenAI Chat | Goose agent |
| `setup-qwen` | `~/.qwen/settings.json` | OpenAI/Gemini | Qwen Code, `/v1` or native `/v1beta` |
| `setup-roo` | `~/.config/roo/config.json` | OpenAI Chat | Roo Code |
| `setup-kilo` | `~/.config/kilo/config.json` | OpenAI Chat | Kilo Code |
| `setup-crush` | `~/.config/crush/config.json` | OpenAI Chat | Crush (charmbracelet) |
| `setup-dsh` | `~/.dsh/config.json` | OpenAI Chat | DeepSeek Harness (#995) |
| `setup-mimo` | `~/.config/mimocode/config.json` | OpenAI Chat | MiMo Code `~/.config/mimocode/config.json` `default_provider=llmharbor` + `[providers.llmharbor]` `type=openai` `base_url=/v1` `api_key` `model` `context_window` (#1003) |
| `setup-atomcode` | `~/.atomcode/config.toml` | OpenAI Chat | `default_model=llmharbor` + `[provider_accounts.llmharbor]` + `[models.llmharbor]`; preserves unrelated configuration |
| `setup-cursor` | guide only | OpenAI Chat | Manual `Cursor Settings → Models → Add Model` (no file) |
| `setup-generic` | guide only | OpenAI Chat | Any OpenAI-compatible client |

## Zero-persistence launchers

```bash
npm run cli -- launch            # injects LLMHarbor_API_KEY + model into `claude`
npm run cli -- launch-codex      # injects into `codex --profile NAME`
```

These do not write config files; they spawn the child process with `LLMHarbor_API_KEY`/`LLMHarbor_MODEL` in env only. Useful for ephemeral or shared machines.

## `llmharbor doctor`

```bash
npm run cli -- doctor
```

Proves a client's requests reach this gateway (checks routed `Authorization` header, catalog, live probe).

## Common flags

| Flag | Effect |
| --- | --- |
| `--dry-run` | Preview changes without writing; shows diff |
| `--model <id>` | Pin to a model (resolved against unfiltered catalog) |
| `--profile <name>` | Named profile (Codex `codex --profile NAME`, Claude `CLAUDE_CONFIG_DIR`) |

## Related

- [Config files](02-config-files.md) — merge strategies, `tools.json`, adding a new generator.
- [Clients & agents](../clients/01-agent-clients.md) — per-agent wiring recipes, headerless URL tokens, MCP.
