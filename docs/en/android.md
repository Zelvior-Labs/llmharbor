**English** · [简体中文](../zh-cn/android.md)

# Android

The Android app is a standalone APK for Android 8.0 (API 26) and later. It bundles a Node.js runtime
([nodejs-mobile](https://github.com/fogtape/nodejs-mobile), version pinned in
[`android/version.json`](../../android/version.json)), the server and the dashboard. You don't need
Termux, root or a PC. The full guide, including signing and building, is
[android/README.md](../../android/README.md).

## Install

1. Download an APK (`LLMHarbor-<version>-android-<abi>.apk`) from the
   [latest release](https://github.com/Zelvior-Labs/llmharbor/releases/latest). Every `v*` release
   carries all three. Older previews are under `android-v*` tags. Pick the ABI that matches your device:
   - `arm64-v8a`: most current phones.
   - `armeabi-v7a`: 32-bit ARM phones.
   - `x86_64`: emulators and x86 devices.
2. Open the app and tap **Start gateway**. Tap **Show setup/reset code**, confirm with your screen
   lock, then **Open dashboard** and create the local account with that code.
3. Add provider keys on **Keys**. Apps on the same phone use `http://127.0.0.1:31415/v1` with the
   unified API key.

## Behaviour worth knowing

- The gateway runs as a foreground service with a notification. If port 31415 is taken, it uses the
  next free port up to 31430.
- **Allow other devices on my Wi-Fi (LAN)** is off by default. The app has no TLS listener, so use it only on trusted networks.
- Requests to cloud providers still need an internet connection. The app routes requests; it does
  not run models on the phone.
- SQLite uses Node's built-in `node:sqlite`. The database key is wrapped by the Android Keystore.
- Preview builds use a version-specific application id, so a new preview installs beside the old one
  and does not share its data. Move keys with the app's encrypted backup export and import.
- Clearing the app's data or uninstalling deletes the database and its key.

## Device test runner (maintainers)

The hosted CI tests the APKs on emulators. `.github/workflows/android-device.yml` runs the same
`android/tests/device.py` smoke test on a real phone attached to a self-hosted runner. It covers
what emulators can't: Android Go memory pressure, OEM battery managers and real arm64 hardware.

**Runner machine.** Any always-on Linux or macOS machine with USB access to one phone. It needs
`adb` on `PATH` (plus a udev rule on Linux so the runner user can reach the device), `python3` and
`gh`. Register a GitHub Actions runner for this repository with the labels the workflow requires:

```sh
./config.sh --url https://github.com/Zelvior-Labs/llmharbor --token <runner-token> \
  --labels self-hosted,android,arm64 --unattended
```

A runner holds repository credentials, so run it on a machine you control. The workflow can only
be started manually (`workflow_dispatch`) or called by another workflow, never by pull requests.

**Phone.** Turn on USB debugging and **Stay awake while charging**, and set a screen lock (the test
confirms the setup-code prompt). If you exempt the app from an OEM battery manager, record that,
because users on the same phone will need the same setting.

**Run.** Use the run id of a finished `Release` workflow run (its `android-apks` artifact):

```sh
gh workflow run android-device.yml -f run_id=<run_id> -f abi=arm64-v8a -f note="Android Go 2 GB"
gh run watch
```

The job downloads the APKs signed in that run, checks `SHA256SUMS.txt`, and refuses to start unless
exactly one device is attached. It then runs the smoke test. `meminfo.txt` and `logcat.txt` are
uploaded even when the run fails, so you can tell a low-memory kill from a crash.
