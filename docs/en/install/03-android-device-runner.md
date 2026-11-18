# Run the Android tests on a real phone

The hosted workflow installs each APK on emulators. That catches packaging, signing and API-level
mistakes, but it cannot reproduce the two things that actually break this app in the field:

- **Android Go memory behaviour.** A 1–2 GB phone kills a foreground service far more aggressively than
  a 4 GB emulator, and the gateway's Node runtime, SQLite and the dashboard's web view compete for the
  same heap.
- **Real arm64 hardware.** `arm64-v8a` is the ABI almost every phone uses, yet no hosted runner can
  execute it natively (x86 runners only emulate ARMv7 through a translation layer).

A self-hosted runner with one USB phone attached closes that gap. It runs the same
`android/tests/device.py` script the emulator jobs run, so a failure means the app, not the harness.

## 1. Prepare the runner machine

Any always-on Linux or macOS box with USB access to the phone works; Android Go hardware is cheap and
that is the point.

```sh
# Android platform tools (adb) must be on PATH
sudo apt install android-tools-adb            # Debian/Ubuntu
# udev rule so an unprivileged runner user may talk to the phone
echo 'SUBSYSTEM=="usb", ATTR{idVendor}=="<vendor>", MODE="0660", GROUP="plugdev"' \
  | sudo tee /etc/udev/rules.d/51-android.rules
sudo udevadm control --reload-rules
adb devices        # exactly one line ending in "device"
```

Install the GitHub Actions runner, register it against this repository, and give it the three labels the
workflow asks for:

```sh
./config.sh --url https://github.com/zelvior/ossllmapi --token <runner-token> \
  --labels self-hosted,android,arm64 --unattended
./run.sh            # or install it as a service with ./svc.sh install
```

Keep `python3` (3.11+) and `gh` installed. A runner holds repository credentials, so run it on a machine
you control, prefer an ephemeral/containerised runner, and never expose it to pull requests from forks —
`android-device.yml` is `workflow_dispatch`-only for exactly that reason.

## 2. Prepare the phone

- Developer options on, **USB debugging** on, **Stay awake while charging** on.
- Unlock the screen and keep the device PIN set: the launcher hides setup codes until the owner
  authenticates, and the test performs that confirmation.
- Disable OEM battery managers that kill services (Xiaomi, Huawei, Samsung and others ship one). This is
  the behaviour the run is meant to observe, so record any exemption you grant: if the test only passes
  with an exemption, users on that phone need the same setting.
- Leave at least 2 GB free storage and let the phone charge.

## 3. Run it

1. Push an `android-v*` tag (or run the preview workflow) and wait for the `Android standalone preview`
   workflow to finish. Its run id is in the URL: `…/actions/runs/<run_id>`.
2. Dispatch the device workflow:

   ```sh
   gh workflow run android-device.yml -f run_id=<run_id> -f abi=arm64-v8a -f note="Android Go 2 GB"
   gh run watch
   ```

The job downloads exactly the APKs that CI signed, verifies `SHA256SUMS.txt`, refuses to run unless
exactly one device is attached, and then exercises install → launch → hidden setup code → dashboard render
→ first-run security → chat through a controlled upstream → stop/restart persistence → password reset →
LAN mode, the same assertions as the emulator jobs.

Even on failure it uploads `meminfo.txt` and `logcat.txt`, and prints lowmemorykiller and `am_kill` lines
in the log, so a service death can be told apart from a crash:

```sh
adb shell dumpsys meminfo <package-id>
adb logcat -d | grep -E 'lowmemorykiller|am_kill'
```

## 4. What this does not cover

- **x86_64 and armeabi-v7a** stay on the hosted emulator jobs; the phone is arm64.
- **Signed upgrades** are still verified by the updater's fingerprint check rather than by installing a
  previous release first.
- **Play Store distribution** is not involved: previews are GitHub pre-releases and never `--latest`.

If you run the phone in a drawer for a week with the gateway started, you are testing the one scenario no
emulator can: a long-lived foreground service under real memory pressure and real OEM power management.
