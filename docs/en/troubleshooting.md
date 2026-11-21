**English** · [简体中文](../zh-cn/troubleshooting.md)

# Troubleshooting

## Where are the logs?

| Install | Logs |
| --- | --- |
| Source | The terminal running the server. Warnings and errors are also kept in the dashboard's **Logs** page. |
| Docker | `docker compose logs -f llmharbor` |
| Desktop | `<data folder>/logs/freeapi.log`. Use **Open Logs Folder** in the tray menu. See [Desktop](desktop.md#data-folder). |
| Windows 7 edition | `%APPDATA%\LLMHarbor-Win7\logs\freeapi.log` |
| Android | The app can export a diagnostics zip. See [android/README.md](../../android/README.md). |

## I can't create the first account from another device

While no account exists, a browser on another device must enter the one-time setup code. The
server prints it at startup as `First-run setup code: …`. A new code is generated on each start
while no account exists. A browser on the same machine as the server doesn't need it.

## I forgot the dashboard password

Click **Forgot password?** on the sign-in page. There is no email step. The server prints a
`Password-reset code:` line to its log (see the table above), and the code is valid for 15 minutes.
The desktop app signs in automatically, so it has no password to forget.

## "The loaded encryption key cannot decrypt the provider keys"

The database was opened with a different encryption key from the one it was written with. This
happens, for example, after a database is copied without its `.encryption-key` file, or after
`ENCRYPTION_KEY` changes. Put the original key back. To move to a new key on purpose, use
the rotation script while you still have the old key. Stop the server first:

```bash
npm run rotate-encryption-key -w server -- --old-key <old 64 hex> --new-key <new 64 hex> [--db <path>] [--dry-run]
```

Then start the server with the new key.

## `Invalid ENCRYPTION_KEY`

The key must be exactly 64 hexadecimal characters (32 bytes). Generate one with
`openssl rand -hex 32`.

## Requests fail with 413 `request_too_large`

The JSON body is larger than `REQUEST_BODY_LIMIT_MB` (default 25). Long vision sessions resend their
images on every turn. Raise the limit, or keep `IMAGE_NORMALIZE` on so large images are downscaled.

## Requests get 403 before reaching the app

`ALLOWED_HOSTS` is set, and the `Host` header you use isn't in it. Add the hostname or IP you use to
reach the server.

## Analytics or rate limits show the proxy's IP

Set `TRUST_PROXY` (for example `TRUST_PROXY=1` for one reverse proxy on the same host). See
[Networking](networking.md#reverse-proxy-tls).

## A model returns "Profile '…' not found"

`auto:<name>` refers to a named chain that doesn't exist. Use `auto`, one of the `auto:smart|fast|…`
aliases, or a chain name from `GET /v1/models`.

## Streams stop early or clients time out

- If a provider pauses mid-stream for longer than 90 seconds, raise
  `PROVIDER_STREAM_STALL_TIMEOUT_MS` (or the per-platform `_<PLATFORM>` variant).
- If a client gives up while a reasoning model is still thinking, set `STREAM_KEEPALIVE_MS` (for
  example `15000`) so the gateway sends SSE heartbeats.
- Slow providers can also need a larger `PROVIDER_TIMEOUT_<PLATFORM>`.

## A proxy on the host doesn't work from Docker

Use `host.docker.internal` instead of `127.0.0.1`, and make sure the proxy listens on more than
loopback. See [Docker](docker.md#network-settings).

## The desktop app uses a port other than 31415

Another program held 31415 at startup, so the app took the next free port and saved it. The tray
popover shows the current base URL.

## Uninstalling

Remove the app (or `docker compose down -v` for Docker, which also deletes the data volume), then
delete the data folder if you want the data gone: `%APPDATA%\LLMHarbor\`,
`~/Library/Application Support/LLMHarbor/` or `~/.config/LLMHarbor/`. A source install keeps its data
in `server/data/` unless `FREEAPI_DB_PATH` says otherwise.
