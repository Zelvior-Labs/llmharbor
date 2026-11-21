# Contributing

Contributions are welcome. Most changes are one of: adding or fixing a provider, adding an
endpoint, improving the router, working on the dashboard, or fixing bugs. The repository layout is
described in [docs/en/architecture.md](docs/en/architecture.md).

## Development loop

```bash
npm install
npm run dev             # API server on :3001 and dashboard on :5173, both reloading on change
npm run db:migration:up # apply migrations to your local database
npm test                # bootstrap, CLI wrapper and hook tests, server, CLI and client suites
npm run lint            # server and CLI
npm run build           # server, CLI and dashboard
npm run cli -- --help   # the agent-setup CLI, built on demand
```

For a repeatable setup, run the bootstrap script for your shell. It installs dependencies only
when `package-lock.json` has changed, and creates `.env` from `.env.example` when it is missing:

```bash
./scripts/dev-bootstrap.sh
```

```powershell
.\scripts\dev-bootstrap.ps1
```

Every PR should:

- Include a test, and keep the existing suite green (`npm test`).
- Match the `.editorconfig` and tsconfig defaults already in the repo.
- Stay scoped to one change. Smaller PRs get reviewed and merged faster.
- Avoid adding paid or card-gated services. Built-in providers must have a free tier that you can start using without a credit card.
- Update the docs in `docs/en/` when behaviour they describe changes.

## Database migrations

Schema changes go in new files under `server/src/db/migrations/`. Do not edit migrations that have
already been applied. The built-in model catalog also lives in migrations, so add, retire or correct
default models with a new forward migration. Details: [server/src/db/README.md](server/src/db/README.md).

```bash
npm run db:migration:create --name=add_embedding_index
npm run db:migration:up
npm run db:migration:down
npm run db:migration:status
```

## Translations

The dashboard ships 60 locales. `en.json` is the source of truth, and every other file mirrors its
keys. Run `npm run check:i18n` from `client/` before opening a PR. The rules and the settled Chinese
terminology are in [docs/TRANSLATION.md](docs/TRANSLATION.md).

## Commit checklist hook

This hook is optional and off by default. If you use [Claude Code](https://claude.com/claude-code),
the repo ships a hook that reads this file. Before the agent runs `git commit` or `git push`, the hook
reminds it to check its diff against the rules above. It reminds; it does not block.

To see what it would say without enabling anything:

```bash
node .claude/hooks/contributing-check.mjs --preview
```

To turn it on, add this to your own `.claude/settings.local.json`. Nothing is wired up for you:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/contributing-check.mjs\""
          }
        ]
      }
    ]
  }
}
```

The hook parses this file each time it fires, so edits to the rules take effect with no
regeneration step.

## AI and LLM-assisted contributions

LLM-assisted PRs are welcome. The bar is the same as for any other PR: you are responsible for what
you submit.

- **Understand your own diff.** If a reviewer asks why a line is there, you should be able to answer.
- **Test it for real.** Run the code. Generated tests that do not exercise the change are worse than no tests.
- **Keep it scoped.** Strip unrelated reformatting, renames and rewritten comments before opening the PR.
- **No invented facts.** Check provider rate limits, model ids and endpoints against the provider. Don't rely on a model's memory for them.
- You don't need to label a PR as AI-assisted.

## Reporting issues

Bug reports are most useful when they include your version (or commit), the provider involved, and
the exact request and response where you can share them. For routing bugs, include the server log
around the failing request and the `X-Fallback-Trail` / `X-Routed-Via` response headers. Report
security problems privately. See [SECURITY.md](SECURITY.md).
