# 在真机上运行 Android 测试

托管工作流只在模拟器上安装 APK，能发现打包、签名和 API 级别问题，但无法复现真正让这个应用出问题的两种情况：

- **Android Go 的内存行为。** 1–2 GB 的手机杀前台服务远比 4 GB 模拟器激进，网关的 Node 运行时、
  SQLite 和仪表盘网页要抢同一份堆内存。
- **真实 arm64 硬件。** `arm64-v8a` 是几乎所有手机使用的 ABI，但托管 runner 无法原生执行它
  （x86 runner 只能通过转换层模拟 ARMv7）。

接一台真机的自托管 runner 正好补上这个缺口：它运行与模拟器任务相同的 `android/tests/device.py`，
因此失败意味着应用有问题，而不是测试环境有问题。

## 1. 准备 runner 机器

任何能通过 USB 常连手机的 Linux 或 macOS 机器都行；Android Go 设备便宜，这正是重点。

```sh
# 需要把 Android platform tools（adb）放进 PATH
sudo apt install android-tools-adb            # Debian/Ubuntu
# udev 规则，让普通 runner 用户也能访问手机
echo 'SUBSYSTEM=="usb", ATTR{idVendor}=="<vendor>", MODE="0660", GROUP="plugdev"' \
  | sudo tee /etc/udev/rules.d/51-android.rules
sudo udevadm control --reload-rules
adb devices        # 应当只有一行以 "device" 结尾
```

安装 GitHub Actions runner，注册到本仓库，并设置工作流要求的三个标签：

```sh
./config.sh --url https://github.com/zelvior/ossllmapi --token <runner-token> \
  --labels self-hosted,android,arm64 --unattended
./run.sh            # 或用 ./svc.sh install 安装为服务
```

另外安装 `python3`（3.11+）和 `gh`。runner 持有仓库凭据，因此请放在自己控制的机器上，优先使用
临时/容器化 runner，绝不要对来自 fork 的 PR 开放 —— `android-device.yml` 只允许 `workflow_dispatch`，
正是出于这个原因。

## 2. 准备手机

- 打开开发者选项和 **USB 调试**，打开 **充电时保持唤醒**。
- 解锁屏幕并保持设备 PIN 已设置：启动器只有在机主确认后才显示设置码，测试会执行该确认。
- 关闭会杀服务的厂商省电管理（小米、华为、三星等都有）。这正是本次运行要观察的行为，所以请记录
  你授予的每个豁免：如果只有加豁免才能通过，那么使用该机型的用户也需要同样设置。
- 至少留出 2 GB 可用空间，并让手机保持充电。

## 3. 运行

1. 推送 `android-v*` 标签（或运行预览工作流），等待 `Android standalone preview` 工作流完成。
   运行 id 在 URL 中：`…/actions/runs/<run_id>`。
2. 触发真机工作流：

   ```sh
   gh workflow run android-device.yml -f run_id=<run_id> -f abi=arm64-v8a -f note="Android Go 2 GB"
   gh run watch
   ```

该任务下载的正是 CI 签名的 APK，校验 `SHA256SUMS.txt`，在不是恰好一台设备连接时拒绝运行，然后依次验证
安装 → 启动 → 隐藏设置码 → 仪表盘渲染 → 首次使用安全 → 通过受控上游对话 → 停止/重启后数据保留 →
密码重置 → 局域网模式，断言与模拟器任务相同。

即使失败，它也会上传 `meminfo.txt` 和 `logcat.txt`，并在日志中打印 lowmemorykiller 和 `am_kill` 记录，
以便区分服务被杀和崩溃：

```sh
adb shell dumpsys meminfo <package-id>
adb logcat -d | grep -E 'lowmemorykiller|am_kill'
```

## 4. 这里没有覆盖的内容

- **x86_64 和 armeabi-v7a** 仍由托管模拟器任务覆盖；真机是 arm64。
- **签名升级** 仍通过更新器的指纹校验来验证，而不是先安装旧版本再升级。
- **Play 商店分发** 不涉及：预览版是 GitHub 预发布，永远不会标为 `--latest`。

如果把手机插着电放进抽屉跑一周并保持网关启动，你测的就是任何模拟器都测不了的场景：真实内存压力和
真实厂商电源管理下长期存活的前台服务。
