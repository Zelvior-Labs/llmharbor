[English](../en/docker.md) · **简体中文**

# Docker

[`Dockerfile`](../../Dockerfile) 构建服务器、CLI 和仪表板，并以非特权用户 `node` 在 3001 端口运行
`node server/dist/index.js`（入口脚本会先修正数据目录的所有权）。[`docker-compose.yml`](../../docker-compose.yml)
在此基础上添加了命名卷（`llmharbor-data`，挂载到 `/app/server/data`）和针对 `/api/ping` 的健康检查。

## 启动

```bash
git clone https://github.com/Zelvior-Labs/llmharbor.git
cd llmharbor
printf "ENCRYPTION_KEY=%s\n" "$(openssl rand -hex 32)" > .env
docker compose up -d --build
```

打开 <http://localhost:3001>，按照[首次运行](install.md#首次运行)操作。Compose 文件设置了 `NODE_ENV=production`，因此
`.env` 中必须有 `ENCRYPTION_KEY`。请保留并备份该文件，否则已存储的提供方密钥将无法解密。

常用命令：

```bash
docker compose ps
docker compose logs -f llmharbor     # 也会显示首次运行设置码和密码重置码
docker compose down                  # 停止（数据保留在卷中）
docker compose down -v               # 停止并删除数据卷
```

## 预构建镜像

`docker.yml` 工作流为 `linux/amd64` 和 `linux/arm64` 发布 `ghcr.io/zelvior-labs/llmharbor`，标签如下：

- 每次推送到 `main` 时：`main` 和 `sha-<commit>`。
- 每个 `v*` 标签：`<tag>`。
- 只有稳定的 `v*` 标签（不带 `-` 后缀）才会更新 `latest`。

`docker-compose.yml` 中的镜像名是 `ghcr.io/zelvior-labs/llmharbor:latest`。使用 `--build` 时 Compose 会从您的检出构建，而不是
拉取。要使用已发布的镜像，请先运行 `docker compose pull` 再 `docker compose up -d`，或把 `image:` 改成具体标签。

## 更新

从源码检出更新：`git pull && docker compose up -d --build`，数据卷会保留。

### 自更新

可选的 `autoupdate` profile 会添加一个 [Watchtower](https://github.com/nicholas-fedor/watchtower) 容器，**Settings →
Check for updates → Update now** 调用的就是它受令牌保护的 HTTP 端点：

```bash
echo "WATCHTOWER_TOKEN=$(openssl rand -hex 32)" >> .env
docker compose --profile autoupdate up -d
```

Watchtower 只在您点击按钮时动作，并且只作用于带有 `llmharbor` 作用域标签的容器。它拉取的是 `docker-compose.yml` 中指定
的镜像标签。它需要 Docker 套接字，这相当于主机的 root 权限；如果无法接受，请不要启用此 profile。

## 网络设置

- 端口只发布在 `127.0.0.1` 上。在 `.env` 中设置 `HOST_BIND=0.0.0.0` 可从局域网访问，请只在可信网络中这样做。
- `.env` 中的 `PORT` 修改发布到主机的端口，容器内始终监听 3001。
- 在容器内，`127.0.0.1` 指容器自身。要使用主机上运行的代理，请使用 `host.docker.internal`（Compose 文件已把它映射到主机
  网关），例如 `PROXY_URL=socks5h://host.docker.internal:7890`。

反向代理见[网络](networking.md)，全部变量见[配置](configuration.md)。
