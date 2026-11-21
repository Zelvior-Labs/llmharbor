# LLMHarbor CLI

Configures coding agents to use an [LLMHarbor](https://github.com/Zelvior-Labs/llmharbor) gateway,
and manages provider keys from a terminal.

The package is private and **not published to npm**, so `npx llmharbor` does not exist. Run it from
a checkout of the repository:

```bash
npm install                     # once, at the repository root
npm run cli -- --help
npm run cli -- setup-claude --url http://localhost:3001 --api-key llmharbor-...
```

`npm run cli` (`scripts/cli.mjs`) builds `cli/dist` the first time and whenever the sources change.
It then runs in the directory you called it from. From another directory:
`npm --prefix <checkout> run cli -- <command>`. This matters for `launch` (starts the agent in the
current directory) and `doctor` (reads the current project's `.claude/` settings).

## Commands

| Command | What it does |
| --- | --- |
| `setup-claude` | Claude Code (Anthropic Messages, server root URL) |
| `setup-codex` | Codex CLI (OpenAI Responses) |
| `setup-cline`, `setup-continue`, `setup-aider`, `setup-opencode`, `setup-goose`, `setup-qwen`, `setup-roo`, `setup-kilo`, `setup-crush`, `setup-dsh`, `setup-mimo`, `setup-atomcode`, `setup-openclaw`, `setup-hermes`, `setup-pi`, `setup-reasonix`, `setup-zcode` | The matching tool |
| `setup-cursor` | Prints instructions (Cursor needs a public HTTPS URL) |
| `setup-generic` | Prints the base URL, key and a test `curl` command |
| `launch` | Run Claude Code with credentials injected into its environment |
| `launch-codex` | Run Codex CLI with provider overrides and credentials injected |
| `doctor [claude\|codex]` | Check whether the tool's settings reach this gateway (non-zero exit if not) |
| `list` | Print tool id, protocol and base URL form |
| `keys` | Add, list, remove or test provider keys (`keys --help`) |

## Options

| Flag | Environment | Meaning |
| --- | --- | --- |
| `--url URL` | `LLMHarbor_URL` | Gateway URL (default `http://localhost:3001`) |
| `--api-key KEY` | `LLMHarbor_API_KEY` | Unified API key (prompted for if missing) |
| `--profile NAME` | — | Profile or provider entry name (default `default`) |
| `--model ID` | — | Pin a model, checked against the gateway's catalog |
| `--dry-run` | — | Show the diff, write nothing |
| `--timeout MS` | — | `doctor` probe wait, or per-request timeout for `keys` (default 30000) |
| `--token TOKEN` | `LLMHarbor_DASHBOARD_TOKEN` | Dashboard session token (`keys` only) |

Generators merge into existing config files and back up any file they change to
`<file>.backup-<timestamp>-<id>`. Files containing the key are written with mode `0600`. `launch` and
`launch-codex` write nothing to disk.

## Provider keys

```bash
export LLMHarbor_DASHBOARD_TOKEN='<dashboard-session-token>'
npm run cli -- keys add groq           # hidden prompt
npm run cli -- keys list
npm run cli -- keys test groq
npm run cli -- keys remove groq --id 7
```

The token comes from a signed-in dashboard (browser local storage key
`llmharbor_dashboard_token`). The unified API key is not accepted here. `add` validates after saving.
If validation fails, the key stays saved and the command exits with code 1. Custom endpoints must
be created in the dashboard.

## Requirements

Node.js `>=20.18.0 <25.0.0` and a running LLMHarbor gateway. More detail:
[docs/en/agents.md](../docs/en/agents.md).

## License

MIT. See [LICENSE](LICENSE).
