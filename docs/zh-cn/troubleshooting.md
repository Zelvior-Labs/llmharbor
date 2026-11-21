[English](../en/troubleshooting.md) · **简体中文**

# 故障排查

## 日志在哪里？

| 安装方式 | 日志 |
| --- | --- |
| 源码 | 运行服务器的终端。警告和错误也会保存在仪表板的 **Logs** 页面。 |
| Docker | `docker compose logs -f llmharbor` |
| 桌面版 | `<数据目录>/logs/freeapi.log`，可用托盘菜单的 **Open Logs Folder** 打开。见[桌面版](desktop.md#数据目录)。 |
| Windows 7 版 | `%APPDATA%\LLMHarbor-Win7\logs\freeapi.log` |
| Android | 应用可以导出诊断 zip，见 [android/README.md](../../android/README.md)（英文）。 |

## 无法从其他设备创建第一个账户

在还没有账户时，其他设备上的浏览器必须输入一次性设置码。服务器启动时会以 `First-run setup code: …` 打印它；只要还没有账户，
每次启动都会生成新的代码。与服务器在同一台机器上的浏览器不需要它。

## 忘记了仪表板密码

点击登录页上的 **Forgot password?**。没有邮件步骤：服务器会在日志中打印一行 `Password-reset code:`（见上表），代码有效期为
15 分钟。桌面版会自动登录，没有需要记住的密码。

## “The loaded encryption key cannot decrypt the provider keys”

数据库是用与写入时不同的加密密钥打开的，例如复制数据库时没有带上 `.encryption-key` 文件，或 `ENCRYPTION_KEY` 被修改。请恢复
原来的密钥。如果是有意更换密钥，请在仍持有旧密钥时使用轮换脚本（先停止服务器）：

```bash
npm run rotate-encryption-key -w server -- --old-key <旧的 64 位十六进制> --new-key <新的 64 位十六进制> [--db <路径>] [--dry-run]
```

然后用新密钥启动服务器。

## `Invalid ENCRYPTION_KEY`

密钥必须正好是 64 个十六进制字符（32 字节），可用 `openssl rand -hex 32` 生成。

## 请求返回 413 `request_too_large`

JSON 请求正文超过了 `REQUEST_BODY_LIMIT_MB`（默认 25）。长时间的视觉会话每一轮都会重新发送图片。请提高上限，或保持
`IMAGE_NORMALIZE` 开启以缩小大图。

## 请求在到达应用之前就返回 403

设置了 `ALLOWED_HOSTS`，而您使用的 `Host` 头不在其中。请把访问服务器所用的主机名或 IP 加进去。

## 分析或速率限制显示的是代理的 IP

设置 `TRUST_PROXY`（例如同一台主机上有一层反向代理时用 `TRUST_PROXY=1`）。见[网络](networking.md#反向代理tls)。

## 模型返回 “Profile '…' not found”

`auto:<name>` 指向了不存在的命名链。请使用 `auto`、某个 `auto:smart|fast|…` 别名，或 `GET /v1/models` 中的链名称。

## 流式响应提前停止或客户端超时

- 如果提供方在流中途暂停超过 90 秒，请提高 `PROVIDER_STREAM_STALL_TIMEOUT_MS`（或按平台的 `_<PLATFORM>` 变体）。
- 如果客户端在推理模型仍在思考时放弃，请设置 `STREAM_KEEPALIVE_MS`（例如 `15000`），让网关发送 SSE 心跳。
- 较慢的提供方可能还需要更大的 `PROVIDER_TIMEOUT_<PLATFORM>`。

## Docker 中无法使用主机上的代理

使用 `host.docker.internal` 代替 `127.0.0.1`，并确保代理监听的不只是回环地址。见 [Docker](docker.md#网络设置)。

## 桌面版使用的端口不是 31415

启动时有其他程序占用了 31415，应用使用了下一个空闲端口并保存下来。托盘弹出面板会显示当前的基础 URL。

## 卸载

删除应用（Docker 用 `docker compose down -v`，会同时删除数据卷），如需删除数据，再删除数据目录：`%APPDATA%\LLMHarbor\`、
`~/Library/Application Support/LLMHarbor/` 或 `~/.config/LLMHarbor/`。源码安装的数据在 `server/data/` 中，除非
`FREEAPI_DB_PATH` 另有指定。
