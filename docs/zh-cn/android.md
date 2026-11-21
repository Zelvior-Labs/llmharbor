[English](../en/android.md) · **简体中文**

# Android

Android 应用是一个独立 APK，支持 Android 8.0（API 26）及以上。它内置 Node.js 运行时
（[nodejs-mobile](https://github.com/fogtape/nodejs-mobile)，版本固定在 [`android/version.json`](../../android/version.json)）、
服务器和仪表板，不需要 Termux、root 或电脑。包括签名和构建在内的完整说明见
[android/README.md](../../android/README.md)（英文）。

## 安装

1. 从 [Android 发布页](https://github.com/Zelvior-Labs/llmharbor/releases?q=android)下载 APK（以 `android-v*` 标签作为
   预发布版发布），选择与设备匹配的 ABI：
   - `arm64-v8a`：目前大多数手机。
   - `armeabi-v7a`：32 位 ARM 手机。
   - `x86_64`：模拟器和 x86 设备。
2. 打开应用，点击 **Start gateway**。点击 **Show setup/reset code** 并用屏幕锁确认，然后点 **Open dashboard**，用该代码
   创建本地账户。
3. 在 **Keys** 中添加提供方密钥。同一部手机上的应用使用 `http://127.0.0.1:31415/v1` 和统一 API 密钥。

## 值得了解的行为

- 网关作为带通知的前台服务运行。31415 端口被占用时，会使用直到 31430 的下一个空闲端口。
- **Allow other devices on my Wi-Fi (LAN)** 默认关闭。应用没有 TLS 监听，请只在可信网络中使用。
- 访问云端提供方仍需要联网：应用负责路由请求，并不在手机上运行模型。
- SQLite 使用 Node 内置的 `node:sqlite`，数据库密钥由 Android Keystore 包装保护。
- 预览版使用与版本相关的应用 id，因此新预览版会与旧版并存安装，且不共享数据。可使用应用内的加密备份导出/导入来迁移密钥。
- 清除应用数据或卸载会删除数据库及其密钥。

## 真机测试运行器（维护者）

托管 CI 在模拟器上测试 APK。`.github/workflows/android-device.yml` 会在连接到自托管运行器的真实手机上运行同一个
`android/tests/device.py` 冒烟测试，覆盖模拟器无法复现的情况：Android Go 内存压力、厂商电池管理和真实 arm64 硬件。

**运行器机器：**任何常开、能通过 USB 连接一部手机的 Linux 或 macOS 机器。需要 `PATH` 中有 `adb`（Linux 上还需要 udev
规则让运行器用户访问设备）、`python3` 和 `gh`。为本仓库注册 GitHub Actions 运行器，并设置工作流要求的标签：

```sh
./config.sh --url https://github.com/Zelvior-Labs/llmharbor --token <runner-token> \
  --labels self-hosted,android,arm64 --unattended
```

运行器持有仓库凭据，请在您控制的机器上运行。该工作流只能手动触发（`workflow_dispatch`）或被其他工作流调用，不会由拉取请求触发。

**手机：**打开 USB 调试和 **Stay awake while charging**（充电时保持唤醒），并设置屏幕锁（测试会确认设置码提示）。如果为
应用开启了厂商电池管理豁免，请记录下来，因为该机型的用户也需要相同设置。

**运行：**使用一次已完成的 `Android standalone preview` 工作流的运行 id：

```sh
gh workflow run android-device.yml -f run_id=<run_id> -f abi=arm64-v8a -f note="Android Go 2 GB"
gh run watch
```

该任务会下载那次运行签名的 APK，校验 `SHA256SUMS.txt`，并且只有在恰好连接一台设备时才会开始，然后运行冒烟测试。即使失败
也会上传 `meminfo.txt` 和 `logcat.txt`，便于区分低内存终止和崩溃。
