**English** · [简体中文](../zh-cn/docker.md)

# Docker

The [`Dockerfile`](../../Dockerfile) builds the server, CLI and dashboard and runs
`node server/dist/index.js` on port 3001 as the unprivileged `node` user. The entrypoint first
fixes ownership of the data directory. [`docker-compose.yml`](../../docker-compose.yml) wraps it with
a named volume (`llmharbor-data` mounted at `/app/server/data`) and a health check on `/api/ping`.

## Start

```bash
git clone https://github.com/Zelvior-Labs/llmharbor.git
cd llmharbor
printf "ENCRYPTION_KEY=%s\n" "$(openssl rand -hex 32)" > .env
docker compose up -d --build
```

Open <http://localhost:3001> and follow [First run](install.md#first-run). The Compose file sets
`NODE_ENV=production`, so `ENCRYPTION_KEY` must be set in `.env`. Keep that file and back it up:
without it, the stored provider keys cannot be decrypted.

Useful commands:

```bash
docker compose ps
docker compose logs -f llmharbor     # also shows the first-run setup code and password-reset codes
docker compose down                  # stop (data stays in the volume)
docker compose down -v               # stop and DELETE the data volume
```

## Prebuilt image

The `docker.yml` workflow publishes `ghcr.io/zelvior-labs/llmharbor` for `linux/amd64` and
`linux/arm64` with these tags:

- `main` and `sha-<commit>` on every push to `main`.
- `<tag>` for each `v*` tag.
- `latest` only for stable `v*` tags (tags without a `-` suffix).

`docker-compose.yml` names the image `ghcr.io/zelvior-labs/llmharbor:latest`. With `--build`,
Compose builds it from your checkout instead of pulling. To use a published image, run
`docker compose pull` before `docker compose up -d`, or set the `image:` line to a specific tag.

## Updating

From a checkout: `git pull && docker compose up -d --build`. The volume is kept.

### Self-update

The optional `autoupdate` profile adds a [Watchtower](https://github.com/nicholas-fedor/watchtower)
container. Its token-protected HTTP endpoint is what **Settings → Check for updates → Update now**
calls:

```bash
echo "WATCHTOWER_TOKEN=$(openssl rand -hex 32)" >> .env
docker compose --profile autoupdate up -d
```

Watchtower only acts when you click the button, and only on containers carrying the `llmharbor`
scope label. It pulls the image tag named in `docker-compose.yml`. It needs the Docker socket,
which gives root-equivalent access to the host, so leave the profile off if that is not acceptable.

## Network settings

- The port is published on `127.0.0.1` only. Set `HOST_BIND=0.0.0.0` in `.env` to reach it from your
  LAN, and only do that on a trusted network.
- `PORT` in `.env` changes the published host port. The container always listens on 3001.
- Inside the container, `127.0.0.1` is the container itself. To use a proxy that runs on the host, use
  `host.docker.internal`, which the Compose file maps to the host gateway. For example:
  `PROXY_URL=socks5h://host.docker.internal:7890`.

See [Networking](networking.md) for reverse proxies and [Configuration](configuration.md) for every
variable.
