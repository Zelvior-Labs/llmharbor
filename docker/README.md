# Docker

The image is built from the root [`Dockerfile`](../Dockerfile) and run with
[`docker-compose.yml`](../docker-compose.yml). One process serves the API and the dashboard on port
3001. SQLite lives in the `llmharbor-data` volume at `/app/server/data`.

```bash
printf "ENCRYPTION_KEY=%s\n" "$(openssl rand -hex 32)" > .env
docker compose up -d --build
docker compose logs -f llmharbor
```

Open <http://localhost:3001>. Keep the same volume and `ENCRYPTION_KEY` across upgrades. Without
the key, stored provider keys cannot be decrypted.

Variables commonly used with Docker:

| Variable | Default | Meaning |
| --- | --- | --- |
| `ENCRYPTION_KEY` | — (required) | 64 hex characters. Encrypts provider keys at rest. |
| `PORT` | `3001` | Host port published by Compose. The container always listens on 3001. |
| `HOST_BIND` | `127.0.0.1` | Host address the port is published on. Set `0.0.0.0` for LAN access. |
| `WATCHTOWER_TOKEN` | — | Enables the dashboard's **Update now** with `--profile autoupdate`. |
| `FREEAPI_DB_PATH` | `/app/server/data/freeapi.db` | SQLite file path. |
| `FREEAPI_DB_BACKUP_PATH` / `FREEAPI_DB_BACKUP_URL` | — | Encrypted database backup to a file or an HTTP(S) URL. It is restored at startup when the database is missing. |
| `FREEAPI_CONFIG_PATH` / `FREEAPI_CONFIG_JSON` | — | Declarative config applied on every boot. |

Full guide (published image tags, self-update, proxies on the host):
[docs/en/docker.md](../docs/en/docker.md). All variables:
[docs/en/configuration.md](../docs/en/configuration.md).
