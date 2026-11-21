# Security Policy

LLMHarbor stores real credentials: your provider API keys (encrypted at rest in SQLite), the unified
API key, client-profile keys and URL tokens, and a dashboard account. Bugs that expose any of these
are taken seriously. Thank you for reporting them responsibly.

## Supported versions

Fixes ship only on the latest release (currently the 0.16.x line, on
[GitHub Releases](https://github.com/Zelvior-Labs/llmharbor/releases)). Older lines get no backported
patch releases. To stay patched, update the desktop app, rebuild from the latest checkout, or pull
the newest Docker image.

## Reporting a vulnerability

Email **support@llmharbor.co** with `[llmharbor security]` in the subject. Don't open a public issue,
PR or discussion about a security bug until a fix is released.

A useful report includes:

- The affected version or commit, and how you run it (Docker, source, desktop, Android).
- The impact: what an attacker gains (reading keys, bypassing auth, code execution, …).
- Steps to reproduce: the exact request, config or `.env` settings involved. Redact real provider
  keys.
- Server logs around the failing request, where you can share them.

## What to expect

- **Acknowledgement:** within a few days. This is a small project with no 24-hour SLA.
- **Fix:** best effort, prioritised by severity.
- **Disclosure:** after a fix is released. You are credited in the release notes if you want to be,
  so tell us the name or handle to use.
- **No bug bounty.**

## Scope

In scope:

- The server: `/v1`, `/v1beta`, the Ollama emulation under `/api/*`, the dashboard API under `/api/*`,
  and `/mcp`.
- Dashboard authentication (email and password account, session tokens, setup and reset codes) and
  the API credentials listed above.
- Key handling: AES-256-GCM encryption at rest, `ENCRYPTION_KEY` and the generated key file,
  encrypted backups, key import and export.
- The desktop apps, the Android app, and their local data.
- The Docker image and packaging (`Dockerfile`, `docker-compose.yml`), including secrets leaking
  into image layers or logs.
- Premium license validation and the signed catalog feed.

Out of scope:

- Vulnerabilities in the upstream LLM providers themselves. Report those to the provider. Bugs in
  how this gateway talks to them are in scope.
- Problems that require the operator to deliberately expose the server to the public internet.
  LLMHarbor is a single-user, trusted-network tool with no multi-tenant auth.
- Social engineering, phishing, physical access, and attacks that assume an already-compromised host
  or account.
- Automated scanner output with no demonstrated impact.

## Hardening tips

- **Keep it off the public internet.** Docker publishes on `127.0.0.1` by default. Change
  `HOST_BIND` only on a network you trust. If remote access is unavoidable, put the server behind a
  TLS reverse proxy with its own authentication. See [docs/en/networking.md](docs/en/networking.md).
- **Protect `ENCRYPTION_KEY` and `.env`.** They decrypt every stored provider key. Keep them out of
  git and backed up somewhere safe. Losing the key means losing the stored keys. In production, set
  `ENCRYPTION_KEY` explicitly.
- **Update regularly.** Dependency and security fixes ship with normal releases.
- **Rotate what leaks.** Regenerate the unified API key on the Keys page if a client that held it is
  compromised. Revoke URL tokens you no longer use. Replace suspect provider keys.
