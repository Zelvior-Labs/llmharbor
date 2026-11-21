<div align="center">

# LLMHarbor

一个自托管网关，把多家 LLM API 提供方的免费额度汇集到同一个 OpenAI 兼容端点之后。

LLMHarbor 是 Tashfeen Ahmed 的 [freellmapi](https://github.com/tashfeenahmed/freellmapi/) 的修改版，由 Zelvior Labs 维护。

[![CI](https://github.com/Zelvior-Labs/llmharbor/actions/workflows/ci.yml/badge.svg)](https://github.com/Zelvior-Labs/llmharbor/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

[English](README.md) · [Türkçe](README.tr.md) · **简体中文** · [Русский](README.ru.md) · [O'zbekcha](README.uz.md)

[网站](https://llmharbor.vercel.app) · [下载](https://github.com/Zelvior-Labs/llmharbor/releases) · [文档](docs/zh-cn/README.md)

</div>

## 功能

- **一个 API，多个提供方。**为您使用的提供方添加密钥即可。仪表板的 Keys 页面提供 84 个提供方平台、9 个网页搜索提供方，以及
  自定义 OpenAI 兼容端点（llama.cpp、LM Studio、vLLM、Ollama、其他网关）。见[提供方](docs/zh-cn/providers.md)。
- **路由与故障切换。**每个请求都会被路由到一个拥有健康密钥且未超过速率限制的模型。如果提供方返回 429 或 5xx、超时或停滞，
  路由器会让该模型/密钥进入冷却，并尝试下一个候选。成功的响应会在 `X-Routed-Via` 中注明实际处理它的模型。
- **多种协议。**OpenAI 兼容的 `/v1`（聊天、补全、Responses、向量嵌入、重排序、审核、图片、视频、语音、转写、搜索）、
  Anthropic Messages（`/v1/messages`）、Gemini（`/v1beta`）、可选的 Ollama 模拟（`/api/*`）以及 MCP 端点（`/mcp`）。
  见 [API](docs/zh-cn/api.md)。
- **模型选择。**可使用 `auto`、`auto:smart|fast|reliable|balanced|cheap` 排序、命名回退链（`auto:<name>`）、`fusion`
  （多个模型分别回答，再由评审模型合成），或某个具体的模型 id。
- **密钥留在本地。**提供方密钥以 AES-256-GCM 加密存储在您机器上的 SQLite 中。客户端只会看到一个统一的 `llmharbor-…`
  密钥，或您创建的客户端配置密钥和可撤销的 URL 令牌。
- **仪表板。**管理密钥、模型和回退链，并提供试验台、分析、日志和备份。仪表板界面提供 60 种语言。
- **试验台模式。**可以直接对话，也可以在智能体、编程和研究模式中让智能体使用工具：写文件、创建 zip/tar 压缩包、搜索网页、
  生成图片、视频和语音、搜索你的知识文件并使用 GitHub。对比模式把同一个提示词并排发给最多四个模型。默认使用路由器（`auto`），
  也可以改选任意模型。可在桌面应用和手机浏览器中使用。见[试验台](docs/zh-cn/playground.md)。
- **编程智能体配置。**`npm run cli -- setup-<tool>` 可为 Claude Code、Codex CLI、Cline、Continue、Aider、OpenCode、
  Qwen Code 等写入配置。见[智能体与 CLI](docs/zh-cn/agents.md)。

## 截图

截取自本地构建的仪表板，请求路由到一个本地 OpenAI 兼容测试服务器。

<table>
<tr>
<td width="50%"><img src="docs/images/models.png" alt="模型：路由策略与实时评分"><br><sub>模型：路由策略与实时评分</sub></td>
<td width="50%"><img src="docs/images/playground.png" alt="试验台：对话模式，回复及其实际使用的模型"><br><sub>试验台：对话模式，回复及其实际使用的模型</sub></td>
</tr>
<tr>
<td><img src="docs/images/analytics.png" alt="分析：请求、延迟与 token"><br><sub>分析：请求、延迟与 token</sub></td>
<td><img src="docs/images/agents.png" alt="Agents：编码工具的配置命令"><br><sub>Agents：编码工具的配置命令</sub></td>
</tr>
<tr>
<td><img src="docs/images/playground-coding.png" alt="试验台：编程模式，智能体写了文件并打包成 zip"><br><sub>试验台：编程模式，智能体写了文件并打包成 zip</sub></td>
<td><img src="docs/images/playground-compare.png" alt="试验台：对比模式，两个模型并排回答"><br><sub>试验台：对比模式，两个模型并排回答</sub></td>
</tr>
</table>

## 获取

| 平台 | 下载 | 指南 |
| --- | --- | --- |
| Windows 10/11、macOS 12+、Linux x64/arm64 | [最新版本](https://github.com/Zelvior-Labs/llmharbor/releases/latest)（`v*`） | [桌面版](docs/zh-cn/desktop.md) |
| Windows 7 / 8 / 8.1 · 32 位 | [`v*` 版本](https://github.com/Zelvior-Labs/llmharbor/releases/latest)中的 `-windows-x86-*` 安装程序或便携 ZIP — x86 文件采用 legacy 版本构建，可在 Windows 7/8/8.1 上运行 | [desktop/win7](desktop/win7/README.md)（英文） |
| Windows 7 / 8 / 8.1 · 64 位 | [`v*` 版本](https://github.com/Zelvior-Labs/llmharbor/releases/latest)中的 `-windows-legacy-x64-*` 安装程序或便携 ZIP | [desktop/win7](desktop/win7/README.md)（英文） |
| Linux Legacy（x86/x64，Node.js 18+） | [`v*` 版本](https://github.com/Zelvior-Labs/llmharbor/releases/latest)中的 `-linux-legacy-*` .deb、AppImage 或便携包 | [desktop/linux-browser](desktop/linux-browser/README.md)（英文） |
| Android 8.0+ | [`v*` 版本](https://github.com/Zelvior-Labs/llmharbor/releases/latest)中的 `-android-*.apk` | [Android](docs/zh-cn/android.md) |
| Docker | 从本仓库构建，或使用 `ghcr.io/zelvior-labs/llmharbor` | [Docker](docs/zh-cn/docker.md) |
| Node.js（源码） | `git clone` | [安装](docs/zh-cn/install.md) |

## 从源码快速开始

需要 Node.js `>=20.18.0 <25.0.0` 和 npm 10+。

```bash
git clone https://github.com/Zelvior-Labs/llmharbor.git
cd llmharbor
npm install
npm run dev
```

这会在 3001 端口启动 API，在 <http://localhost:5173> 启动仪表板。然后：

1. 在仪表板中创建第一个账户。
2. 在 **Keys** 中添加提供方密钥。
3. 在 **Keys → Unified API key** 复制统一 API 密钥。

生产构建、Docker、局域网访问和首次运行设置码见[安装](docs/zh-cn/install.md)。

## 使用

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:3001/v1", api_key="llmharbor-...")
resp = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "用一句话概括罗马帝国的衰亡。"}],
)
print(resp.choices[0].message.content)
```

桌面版和 Android 默认监听 `http://127.0.0.1:31415`。

在检出的仓库中配置编程智能体（CLI 未发布到 npm）：

```bash
npm run cli -- setup-claude --url http://localhost:3001 --api-key llmharbor-...
```

## 文档

[安装](docs/zh-cn/install.md) · [配置](docs/zh-cn/configuration.md) · [提供方](docs/zh-cn/providers.md) ·
[API](docs/zh-cn/api.md) · [试验台](docs/zh-cn/playground.md) · [智能体与 CLI](docs/zh-cn/agents.md) · [桌面版](docs/zh-cn/desktop.md) ·
[Android](docs/zh-cn/android.md) · [Docker](docs/zh-cn/docker.md) · [网络](docs/zh-cn/networking.md) ·
[架构](docs/zh-cn/architecture.md) · [故障排查](docs/zh-cn/troubleshooting.md)

## 局限

- 免费额度由提供方控制，额度、模型和条款都可能不经通知而变化。请查看各提供方当前的条款，通过本网关使用时这些条款同样适用。
- 延迟不固定，也没有 SLA。最强的模型用完每日额度后，请求会落到仍然可用的模型上，直到计数在 UTC 午夜重置。
- LLMHarbor 是单用户工具，面向可信网络。它的 API 只由统一密钥保护，不要直接暴露到互联网。
- 模型目录从 `api.freellmapi.co` 同步。设置 `CATALOG_SYNC_DISABLED=1` 可只使用构建自带的目录。见[提供方](docs/zh-cn/providers.md#模型目录)。

本项目用于个人实验和学习。如果要在其上构建重要的东西，请使用付费 API。

## 付费方案

LLMHarbor 没有付费方案。本仓库中的一切都在 MIT 许可证下免费提供。

原项目 freellmapi 在 [freellmapi.co](https://freellmapi.co/#pricing) 提供可选的付费方案。仪表板的 **Premium**
页面和配置中的 `license` 字段来自 freellmapi 的代码。LLMHarbor 不出售许可证密钥，因此标准安装使用签名目录的免费每月快照。

附注：如果您想付费，请使用原版工具，网址：[freellmapi.co](https://freellmapi.co/)。

## 贡献与安全

- [CONTRIBUTING.md](CONTRIBUTING.md)：开发流程、测试、迁移、翻译（英文）。
- [SECURITY.md](SECURITY.md)：如何报告漏洞（英文）。
- 问题和错误报告：[GitHub issues](https://github.com/Zelvior-Labs/llmharbor/issues) 或 [zelvior@proton.me](mailto:zelvior@proton.me)。

## 许可证

[MIT](./LICENSE)
