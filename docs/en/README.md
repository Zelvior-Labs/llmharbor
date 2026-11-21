**English** · [简体中文](../zh-cn/README.md)

# LLMHarbor documentation

LLMHarbor is a self-hosted gateway. It puts the free tiers of many LLM API providers, plus your own
OpenAI-compatible endpoints, behind one API. It routes each request to an available model and fails
over to the next one when a provider is rate-limited or down.

| Page | Covers |
| --- | --- |
| [Install](install.md) | All install options, running from source, first run |
| [Configuration](configuration.md) | Environment variables and declarative startup config |
| [Providers](providers.md) | Supported platforms, keyless and custom providers, the model catalog |
| [API](api.md) | Endpoints, authentication, model selection, response headers |
| [Agents and CLI](agents.md) | `npm run cli`, coding-agent setup, provider keys from the terminal, MCP |
| [Desktop](desktop.md) | Desktop downloads, ports, data folder |
| [Android](android.md) | The standalone APK |
| [Docker](docker.md) | Docker Compose, the published image, self-update |
| [Networking](networking.md) | LAN access, reverse proxies, outbound proxies, Fetch Relay |
| [Architecture](architecture.md) | Repository layout, request flow, routing, storage |
| [Troubleshooting](troubleshooting.md) | Logs, passwords, common errors, uninstalling |

Other references in the repository:

- [README](../../README.md): project overview.
- [CONTRIBUTING.md](../../CONTRIBUTING.md): development loop, migrations, translations.
- [SECURITY.md](../../SECURITY.md): reporting vulnerabilities.
- [GLOSSARY.md](../../GLOSSARY.md): terms used in the code.
- [cli/README.md](../../cli/README.md), [desktop/README.md](../../desktop/README.md),
  [android/README.md](../../android/README.md), [docker/README.md](../../docker/README.md).
