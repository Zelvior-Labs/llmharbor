[English](../en/README.md) · **简体中文**

# LLMHarbor 文档

LLMHarbor 是一个自托管网关：它把多家 LLM API 提供方的免费额度以及您自己的 OpenAI 兼容端点汇集到同一个
API 之后，为每个请求挑选可用的模型，并在某个提供方限流或宕机时自动切换到下一个。

| 页面 | 内容 |
| --- | --- |
| [安装](install.md) | 各种安装方式、从源码运行、首次运行 |
| [配置](configuration.md) | 环境变量与声明式启动配置 |
| [提供方](providers.md) | 支持的平台、免密钥与自定义提供方、模型目录 |
| [API](api.md) | 端点、认证、模型选择、响应头 |
| [试验台](playground.md) | 对话、智能体、编程、研究、对比和创作模式；文件、知识、GitHub |
| [智能体与 CLI](agents.md) | `npm run cli`、编程智能体配置、命令行管理提供方密钥、MCP |
| [桌面版](desktop.md) | 桌面版下载、端口、数据目录 |
| [Android](android.md) | 独立 APK |
| [Docker](docker.md) | Docker Compose、已发布的镜像、自更新 |
| [网络](networking.md) | 局域网访问、反向代理、出站代理、Fetch Relay |
| [架构](architecture.md) | 仓库结构、请求流程、路由、存储 |
| [故障排查](troubleshooting.md) | 日志、密码、常见错误、卸载 |

仓库中的其他参考：

- [README](../../README.zh-cn.md)：项目概览。
- [CONTRIBUTING.md](../../CONTRIBUTING.md)：开发流程、迁移、翻译（英文）。
- [SECURITY.md](../../SECURITY.md)：漏洞报告（英文）。
- [GLOSSARY.md](../../GLOSSARY.md)：代码中使用的术语（英文）。
- [docs/TRANSLATION.md](../TRANSLATION.md)：翻译规则与中文术语表。
