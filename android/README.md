# OSSLLMAPI for Android · standalone preview

A signed APK for Android 11 (API 30) and later. Both the gateway and the dashboard are inside the
app: no PC, Termux, Node installation, root access or first-run runtime download. The dashboard
opens in your phone's browser so uploads, downloads and the clipboard work normally.

| APK | Use it for |
| --- | --- |
| `…-android-arm64-v8a.apk` | Most phones from the last few years. |
| `…-android-armeabi-v7a.apk` | 32-bit phones, including many Android 11 Go devices. |
| `…-android-x86_64.apk` | Emulators, Chromebooks and x86 tablets. |

Android refuses an APK whose CPUs do not match the device, so try `arm64-v8a` first on a modern
phone and `armeabi-v7a` on an older or low-RAM one.

1. Download the APK from the [Android releases](https://github.com/zelvior/ossllmapi/releases?q=android).
   Tap it, allow **Install unknown apps** for that browser or file manager if prompted, then install.
   You can turn that permission off again afterward.
2. Open **OSSLLMAPI → Start gateway**. Wait for **Gateway running**, then tap **Show setup/reset code**
   and confirm it is you. Tap **Open dashboard**, and create a local account with that code. Nothing
   is emailed.
3. In **Keys**, add a provider key (or your own compatible endpoint). In the playground, choose a model
   and send a message. For another OpenAI-compatible app **on this phone**, use
   **`http://127.0.0.1:31415/v1`** and the **unified API key** from Keys — not the dashboard password or
   your upstream key. Cloud models still need connectivity; the APK routes requests, it is not an
   offline model.
4. Prefer smaller images and fewer parallel requests on a low-memory phone: images pass through
   without native `sharp` resizing. If Android frees the service, tap **Start gateway** again; accounts,
   provider keys and settings survive.

## What the app does on its own

- **Foreground service and notification.** The notification shows the live port and offers
  **Open dashboard** and **Stop**. A Quick Settings tile and a home-screen widget start and stop the
  gateway without opening the app.
- **Port fallback.** If another app owns 31415, the gateway takes the next free port up to 31430 and
  the launcher, notification and copy buttons follow it.
- **LAN mode (off by default).** Allow other devices on your Wi-Fi to use this phone as their gateway;
  the launcher shows the LAN URL and a copy button. Every request still needs the dashboard login or a
  unified API key. Use it on trusted networks only — there is no TLS listener in the app, so put
  Tailscale (or another encrypted tunnel) in front of it for anything beyond your own Wi-Fi.
- **Background options, both opt-in.** Start the gateway when the phone boots, and let Android
  restart it after memory pressure. A "battery optimization" button opens the system exemption page
  for phones that kill long-running services.
- **Updates.** **Check for updates** reads the project's GitHub pre-releases, verifies the published
  SHA-256, and only hands an APK to Android when its package name and signing certificate match this
  install. A version-locked preview cannot update itself: the app says so and points at the releases
  page instead of downloading a file Android would reject.
- **Encrypted backups.** Export the database and its key into one passphrase-encrypted file through the
  system file picker; restore it into a fresh install. Without the passphrase the file is useless, and
  the passphrase cannot be recovered.
- **Diagnostics.** Export a zip of start-up logs, device details and the last start error — never codes,
  keys or database contents.
- **Hidden one-time codes.** Setup and reset codes stay hidden until the owner confirms with the device
  PIN, pattern or biometrics, are re-hidden after a minute, and never appear in notifications or logs.
  The screen is `FLAG_SECURE`, so codes do not leak into screenshots or the Recents thumbnail.
- **Keystore-wrapped data key.** The SQLite encryption key is wrapped by a non-exportable Android
  Keystore key and handed to the gateway in its process environment, so no plaintext key sits on disk.

Phone differences from the desktop app: no Electron tray, installers, automatic desktop-style updates,
PC agent/CLI installation, or native image resizing. There is no LAN listener unless you turn it on,
and no listener at boot unless you opt in. Android apps share localhost, so keep API-key
authentication on (don't enable Ollama's optional open-loopback mode). Clearing app data or uninstalling
removes the database **and** its key.

## Preview signing

Public previews use a **one-time signing certificate and a version-specific application ID**, so a newer
preview installs **beside** the old one and cannot read its data. Keep the old install until you have
exported/imported your provider keys and checked the new one, run only one gateway at a time, and protect
any plaintext key export. `SHA256SUMS.txt` is published beside the APKs, and the stable desktop
release/feed stays separate.

Builders who want **in-place updates** sign with their own durable key and a stable ID: set
`ANDROID_SIGNING_MODE=durable ANDROID_PACKAGE_ID=…` and point `APK_KEYSTORE`/`APK_ALIAS`/`APK_PASSWORD`
at that keystore. CI does the same when these repository secrets exist:

| Secret | Contents |
| --- | --- |
| `ANDROID_KEYSTORE_B64` | base64 of a PKCS12 keystore holding the durable key |
| `ANDROID_KEYSTORE_PASSWORD` | its password |
| `ANDROID_KEY_ALIAS` | key alias inside the keystore |

Optionally set the repository variable `ANDROID_PACKAGE_ID` (default
`io.github.zelvior.ossllmapi.android`). Without the secret the workflow falls back to
`android/scripts/preview-key.sh`, and the release is a normal version-locked preview. Never commit a
keystore; the CI copy is decoded into `RUNNER_TEMP` and deleted after signing.

## Build it yourself

On Linux x86_64: JDK 17+, Node 22, Python 3, `curl`, `zip`/`unzip`, `readelf`, Android SDK platform 35,
build-tools 35.0.0 and NDK 27.3.13750724. `ANDROID_HOME` must name that SDK. From the repository root:

```sh
npm ci --ignore-scripts
npm run build -w client -- --mode android --outDir ../android/build/dashboard --emptyOutDir
node android/scripts/bundle.mjs
python3 android/tests/host.py
# Use your OWN private keystore; reuse the same identity/key on later builds to keep app data.
# Set APK_KEYSTORE, APK_ALIAS and APK_PASSWORD in your environment, not in Git.
ANDROID_PACKAGE_ID=io.github.zelvior.ossllmapi.android android/scripts/package.sh
```

`ANDROID_ABIS` limits or extends the CPU list (default `armeabi-v7a arm64-v8a x86_64`), and
`ANDROID_SIGNING_MODE=durable` refuses to build a stable ID with a throwaway key. APKs land in
`android/build/apks/`. For a throwaway local test only, `source android/scripts/preview-key.sh` first.
Never distribute its keystore.

The tagged workflow runs the same signed APKs it publishes through installation, launch, hidden-code
behaviour, dashboard rendering, first-run security, authenticated models, a chat routed to a controlled
upstream, stop/restart persistence, password reset and LAN mode. `armeabi-v7a` is exercised on an
Android 11 system image through its ARM native bridge; `x86_64` runs natively on Android 14, which also
covers the newer foreground-service rules. Neither is a physical Android Go test, and `arm64-v8a` is
covered by packaging assertions (ELF class, ABI, manifest, signature) rather than a device run.

Runtime: the **full**, not lite, [nodejs-mobile v24.22.1-0 community build](https://github.com/fogtape/nodejs-mobile/releases/tag/v24.22.1-0).
`version.json` pins the archive digest. `libnode.so` and NDK libc++ are packaged as native libraries and
stripped before signing; the gateway uses built-in `node:sqlite`, not a desktop npm addon. Runtime and
application license notices are in `assets/licenses` in the APK.
