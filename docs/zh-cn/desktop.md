[English](../en/desktop.md) · **简体中文**

# 桌面版

桌面版是一个 Electron 托盘（菜单栏）应用，在您的电脑上以进程内方式运行同样的服务器和仪表板。源码在
[`desktop/`](../../desktop)，构建说明见 [desktop/README.md](../../desktop/README.md)（英文）。

## 下载

`release.yml` 工作流（在 **Actions → Release → Run workflow** 手动启动）为每个 `v*` 标签把所有平台的文件一起发布到同一个
[GitHub Release](https://github.com/Zelvior-Labs/llmharbor/releases/latest)。按文件后缀选择：

| 系统 | 文件后缀 |
| --- | --- |
| Windows 10/11，64 位 | `-windows-x64-setup.exe`（安装程序）或 `-windows-x64-portable.zip`（便携版） |
| Windows 10/11，32 位 | `-windows-x86-setup.exe` 或 `-windows-x86-portable.zip` |
| Windows 7 / 8 / 8.1 | `-windows-legacy-x86-setup.exe` / `-windows-legacy-x64-setup.exe`（按用户安装）或 `-windows-legacy-{x86,x64}-portable.zip`。见 [desktop/win7/README.md](../../desktop/win7/README.md)（英文）。 |
| macOS 12+，Apple Silicon | `-macos-arm64.dmg` 或 `.zip` |
| macOS 12+，Intel | `-macos-x64.dmg` 或 `.zip` |
| Linux x64 | `-linux-x64.AppImage`、`.deb`、`.rpm` 或 `.tar.xz` |
| Linux arm64 | `-linux-arm64.AppImage`、`.deb`、`.rpm` 或 `.tar.xz` |
| Linux Legacy（x86 或 x64，Node.js 18+） | `-linux-legacy-{x86,x64}.deb`、`.AppImage` 或 `-portable.tar.gz`：服务器加浏览器仪表板，不是 Electron。见 [desktop/linux-browser/README.md](../../desktop/linux-browser/README.md)（英文）。 |

同一发布中的 `SHA256SUMS.txt` 列出了每个文件的校验和。

## 运行方式

- 服务器监听 `127.0.0.1`，从 **31415** 端口开始；端口被占用时会尝试后面的端口，并保存找到的端口供以后启动使用。
- 仪表板窗口通过一个隐藏的本地账户自动登录，无需设置密码。可从托盘菜单（**Open Dashboard**）打开。
- 托盘菜单可以复制 OpenAI URL、Claude URL 和密钥；弹出面板显示请求统计。
- **Allow LAN access (0.0.0.0)**（托盘菜单，默认关闭）会在重启后把服务器改为绑定 `0.0.0.0`，让其他设备可以访问。这些
  设备看到的是普通登录表单，所有 API 请求仍需要统一密钥。
- 应用会检查 GitHub Releases 上的新版本。

## 数据目录

数据库（`freeapi.db`）、加密密钥、`config.json`、`logs/` 和 `backups/` 都在应用的数据目录中：

| 系统 | 路径 |
| --- | --- |
| Windows | `%APPDATA%\LLMHarbor\` |
| macOS | `~/Library/Application Support/LLMHarbor/` |
| Linux | `~/.config/LLMHarbor/` |

Windows 7 版使用 `%APPDATA%\LLMHarbor-Win7\`。日志文件是 `logs/freeapi.log`，托盘菜单中的 **Open Logs Folder** 可以打开它。

卸载应用不会删除此目录，需要删除全部数据时请手动删除。请在关闭应用后备份整个目录，并包含加密密钥文件，否则已存储的
提供方密钥将无法解密。
