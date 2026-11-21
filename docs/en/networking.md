**English** · [简体中文](../zh-cn/networking.md)

# Networking

LLMHarbor is designed as a single-user, trusted-network service. Its `/v1` API is protected only by
the unified API key. Don't expose it directly to the internet.

## Listening address

| Install | Default | How to open it to the LAN |
| --- | --- | --- |
| Source | `HOST=::` (all interfaces, IPv6 and IPv4) | Already listening. Set `HOST=127.0.0.1` to restrict it to this machine. |
| Docker Compose | published on `127.0.0.1` | `HOST_BIND=0.0.0.0` |
| Desktop app | `127.0.0.1:31415` | Tray menu → **Allow LAN access (0.0.0.0)** |
| Android | `127.0.0.1:31415` | **Allow other devices on my Wi-Fi (LAN)** in the app |
| 32-bit Linux package | `127.0.0.1:3001` | Set `HOST` before running `start.mjs` |

While no account exists, a browser on another device needs the one-time setup code from the server
log to create the first account.

## Reverse proxy (TLS)

To put Caddy, nginx or Traefik in front of the server:

- Set `TRUST_PROXY` so client IPs (for rate limits and analytics) and the HTTPS scheme come from
  `X-Forwarded-*`. Use `TRUST_PROXY=1` for one proxy on the same host. A list of addresses or CIDRs
  also works.
- Set `ALLOWED_HOSTS` to the hostnames you use, for example `ALLOWED_HOSTS=llmharbor.home.arpa`.
  Requests with any other `Host` header (except loopback names) then get a 403.
- Streaming responses are Server-Sent Events, so turn off response buffering in the proxy for
  `/v1`, `/v1beta` and `/mcp`.
- If the dashboard is served from a different origin than the API, add that origin to
  `DASHBOARD_ORIGINS`.

Forwarded headers never make a request count as local. A request that passed through a proxy needs
the setup code like any other remote request.

## Outbound proxy

Provider requests can go through a proxy. Set it on **Keys → Outbound proxy** in the dashboard, or
with environment variables on headless installs:

| Variable | Meaning |
| --- | --- |
| `PROXY_URL` | `http`, `https`, `socks4`, `socks4a`, `socks5` or `socks5h` URL. The `h`/`a` variants resolve DNS at the proxy. |
| `ALL_PROXY`, `HTTPS_PROXY`, `HTTP_PROXY` | Standard variables. Lower-case spellings are read too. |
| `NO_PROXY` | Hosts that bypass the proxy. A bare domain also covers its subdomains. `*` disables the proxy. |
| `PROXY_REQUIRED_PLATFORMS` | Platform ids that must use the proxy. If the proxy is missing or bypassed, their requests fail instead of going out directly. |
| `FREEAPI_PROXY_LOCAL_DESTINATIONS=true` | Also send loopback and LAN destinations through the proxy. By default they always bypass it. |

Precedence: `PROXY_URL` → dashboard setting → `ALL_PROXY` → `HTTPS_PROXY` → `HTTP_PROXY`.

### Fetch Relay

`PROXY_MODE=fetch-relay` sends provider requests to an HTTP relay instead of a CONNECT/SOCKS proxy.
The relay fetches the target and streams the response back:

```dotenv
PROXY_MODE=fetch-relay
PROXY_URL=https://relay.example.workers.dev
FETCH_RELAY_TOKEN=<long random token>
```

Each request carries `Fetch-Relay-Target: <full provider URL>` and
`Fetch-Relay-Authorization: Bearer <relay token>`, along with the original method, headers and body.
Redirects are not followed. `FETCH_RELAY_TOKEN` takes precedence over a token saved in the dashboard.
The relay sees provider keys and request content, so run your own.
[`examples/fetch-relay-worker`](../../examples/fetch-relay-worker/README.md) is a ready-made
Cloudflare Worker.
