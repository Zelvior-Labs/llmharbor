**English** · [简体中文](../zh-cn/agents.md)

# Agents and CLI

Any client that lets you set an OpenAI-compatible base URL works with LLMHarbor. Use
`http://<host>:<port>/v1` as the base URL and the unified API key as the key. Claude Code and other
Anthropic clients use the server root, without `/v1`. See [API](api.md).

For the tools listed below, the repository ships a CLI that writes their config files for you.

## Running the CLI

The CLI lives in [`cli/`](../../cli) and is **not published to npm**, so there is no
`npx llmharbor`. Run it from a checkout:

```bash
git clone https://github.com/Zelvior-Labs/llmharbor.git
cd llmharbor
npm install
npm run cli -- --help
```

`npm run cli` runs `scripts/cli.mjs`, which builds `cli/dist` the first time and whenever the
sources change. It then runs the command in the directory you called it from. From another
directory, use `npm --prefix <path-to-checkout> run cli -- <command>`.

`launch` and `doctor` depend on the current directory: `launch` starts the agent there, and
`doctor` reads that project's `.claude/` settings. Run them from your project with `--prefix`:

```bash
cd ~/my-project
npm --prefix ~/llmharbor run cli -- launch
```

The desktop app's **Agents** page can also configure supported tools from inside the app (its
**Apply** button), so desktop users don't need a checkout.

![The dashboard's Agents page shows each setup command with your server's URL filled in, plus the base URL and key for manual setup.](../images/agents.png)

<sub>The dashboard's Agents page shows each setup command with your server's URL filled in, plus the base URL and key for manual setup.</sub>

## Commands

| Command | What it does |
| --- | --- |
| `setup-<tool>` | Write or merge the config for one tool (list below). |
| `launch` | Run Claude Code with the gateway credentials in its environment only. |
| `launch-codex` | Run Codex CLI with provider overrides passed as `-c` flags and the key in its environment. |
| `doctor [claude\|codex]` | Check whether that tool's settings actually point at this gateway. Exits non-zero if not. `--timeout MS` raises the probe wait. |
| `list` | Print each tool id, its protocol and its base URL form. |
| `keys …` | Manage provider keys ([below](#provider-keys)). |

Supported `setup-` targets, with the protocol each uses:

| Command | Tool | Protocol |
| --- | --- | --- |
| `setup-claude` | Claude Code | Anthropic Messages (server root) |
| `setup-codex` | Codex CLI | OpenAI Responses |
| `setup-qwen` | Qwen Code | OpenAI or Gemini |
| `setup-cline`, `setup-continue`, `setup-aider`, `setup-opencode`, `setup-goose`, `setup-roo`, `setup-kilo`, `setup-crush`, `setup-dsh`, `setup-mimo`, `setup-atomcode`, `setup-openclaw`, `setup-hermes`, `setup-pi`, `setup-reasonix`, `setup-zcode` | Cline, Continue, Aider, OpenCode, Goose, Roo Code, Kilo Code, Crush, DeepSeek Harness, MiMo Code, AtomCode, OpenClaw, Hermes Agent, Pi, Reasonix, ZCode | OpenAI Chat |
| `setup-cursor` | Cursor | Prints instructions only. Cursor sends traffic through its own cloud, so it needs a public HTTPS URL for the gateway. |
| `setup-generic` | Any OpenAI client | Prints the base URL, key and a test `curl` command. |

## Options

| Flag | Environment variable | Meaning |
| --- | --- | --- |
| `--url URL` | `LLMHarbor_URL` | Gateway URL (default `http://localhost:3001`). |
| `--api-key KEY` | `LLMHarbor_API_KEY` | Unified API key. If missing, you are prompted for it. |
| `--profile NAME` | — | Name of the generated profile or provider entry (default `default`). |
| `--model ID` | — | Pin a model. It is checked against the gateway's catalog. |
| `--dry-run` | — | Print the diff and write nothing. |

The generators read the live model list from the gateway, merge into existing config files instead
of replacing them, and copy any file they change to `<file>.backup-<timestamp>-<id>` first. Files
that hold the key are written with `0600` permissions. `launch` and `launch-codex` write nothing to
disk.

Examples:

```bash
npm run cli -- setup-claude --url http://localhost:3001 --api-key llmharbor-...
npm run cli -- setup-codex --dry-run
npm run cli -- doctor claude
```

`setup-claude` writes `~/.claude/settings.json`, or `~/.claude/profiles/<name>/settings.json` with
`--profile`. `setup-codex` writes `~/.codex/config.toml`. For other tools, run with `--dry-run` to
see the exact paths.

## Provider keys

`keys` talks to the dashboard API, so it needs a **dashboard session token**, not the unified key.
Set it with `LLMHarbor_DASHBOARD_TOKEN` or `--token`. After you sign in to the dashboard, the
browser keeps the token in local storage under `llmharbor_dashboard_token`.

```bash
export LLMHarbor_URL=http://localhost:3001
export LLMHarbor_DASHBOARD_TOKEN='<dashboard-session-token>'

npm run cli -- keys add groq              # prompts for the key without echoing it
npm run cli -- keys add groq --key '<key>'
npm run cli -- keys list
npm run cli -- keys test groq             # test every stored groq key
npm run cli -- keys remove groq --id 7
```

- `add` saves the key, then validates it. If validation fails, the key stays saved and the command
  exits with code 1.
- `remove` needs `--id` when a platform has more than one key.
- Keyless providers don't prompt for a key.
- Custom endpoints must be created in the dashboard.
- `--timeout MS` (default 30000) applies to each request.

## MCP and ChatGPT

When it is turned on (**Keys → Agents → MCP server**), `/mcp` exposes inference, model listing,
health, usage, cache and routing tools to MCP clients. The `ask_llmharbor` tool routes a prompt
through `/v1/chat/completions`. It uses `auto` unless `MCP_INFERENCE_DEFAULT_MODEL` is set. A remote
client such as ChatGPT can only reach a local gateway through a tunnel you provide. Keep the key in
the tunnel or client configuration, never in the URL. See [API](api.md#mcp) for the tool list.
