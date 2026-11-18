# OSSLLMAPI for Android · ARMv7 preview

A standalone APK for Android 11 (API 30) and later devices that accept **32-bit `armeabi-v7a`** apps. Both the gateway and the dashboard are bundled. No PC, Termux, Node installation, root access or first-run runtime download. The dashboard opens in your phone's browser so uploads, downloads and the clipboard work normally.

1. Download the **`.apk`** from the [Android releases](https://github.com/zelvior/ossllmapi/releases?q=android). Tap it, allow **Install unknown apps** for that browser/file manager if prompted, then tap **Install**. You can turn that permission off again afterward.
2. Open **OSSLLMAPI → Start gateway**. Wait for **Gateway running**, note the private **Setup code**, then tap **Open dashboard**. Use a current browser. Create a local account with that code; nothing is emailed. Password-reset codes are also shown in the app, never in the notification.
3. In **Keys**, add a provider key (or your own compatible endpoint). In the playground, choose a model and send a message. For another OpenAI-compatible app **on this phone**, use **`http://127.0.0.1:31415/v1`** and the **unified API key** from Keys, not the dashboard password or your upstream key. Cloud models still need connectivity; the APK is a router, not an offline LLM.
4. Keep the gateway notification while using it; return to the launcher or use the notification to stop it. Close the dashboard tab before stopping, and open it again **from the launcher**, not from a stale bookmark. If Go's memory manager stops the service, tap **Start gateway** again. Accounts, provider keys and settings survive a restart. If another app is using port 31415, stop it first. No LAN listener or automatic start at boot.

**Phone differences:** no Electron tray, desktop installers, PC agent/CLI installation or automatic updates. Image inputs pass through without native `sharp` resizing. On a low-memory device prefer smaller inputs and fewer parallel requests. Android apps share localhost: keep API-key authentication on (don't enable Ollama's optional open-loopback mode). Clearing app data or uninstalling removes the database **and** its encryption key.

**Preview signing:** each public preview version has its own application ID and one-time signing certificate. A later preview installs beside this one, **not** over its data. Keep the old install until you've exported/imported your provider keys and checked the new one. Only run one gateway at a time. Protect any plaintext key export. The SHA-256 file is published beside the APK; the stable desktop release/feed is separate.

## Build it yourself

On Linux x86_64: JDK 17+, Node 22, Python 3, `curl`, `zip`/`unzip`, `readelf`, Android SDK platform 35, build-tools 35.0.0 and NDK 27.3.13750724. `ANDROID_HOME` must name that SDK. From the repository root:

```sh
npm ci --ignore-scripts
npm run build -w client -- --mode android --outDir ../android/build/dashboard --emptyOutDir
node android/scripts/bundle.mjs
python3 android/tests/host.py
# Use your OWN private keystore; use the same identity/key on future builds to keep app data.
# Set APK_KEYSTORE, APK_ALIAS and APK_PASSWORD in your environment, not in Git.
ANDROID_PACKAGE_ID=io.github.zelvior.ossllmapi.mobile.personal android/scripts/package.sh
```

APK: `android/build/apks/`. For a throwaway local test only, `source android/scripts/preview-key.sh` first. Never distribute its keystore. The tag-only publisher runs the same APK it uploads through install, launch, React rendering, first-run security, authenticated models, a chat routed to a controlled upstream, restart/persistence and password reset on an API 30 emulator. The system image uses ARM translation; this is not a physical Android Go test.

Runtime: the **full**, not lite, [nodejs-mobile v24.22.1-0 community build](https://github.com/fogtape/nodejs-mobile/releases/tag/v24.22.1-0). `version.json` pins the archive digest. `libnode.so` and NDK libc++ are packaged as native libraries; the gateway uses built-in `node:sqlite`, not a desktop npm addon. Runtime and application license notices are in `assets/licenses` in the APK.
