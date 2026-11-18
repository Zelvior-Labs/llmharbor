#!/usr/bin/env bash
# Source this in CI only. Ephemeral key lives outside the checkout/artifacts.
# A new version-specific preview ID can coexist with the previous signed APK.
export APK_KEYSTORE="$(mktemp -d "${RUNNER_TEMP:-/tmp}/apk-sign.XXXXXXXX")/preview.p12"
export APK_PASSWORD="$(openssl rand -hex 32)" APK_ALIAS=preview
keytool -genkeypair -keystore "$APK_KEYSTORE" -storetype PKCS12 -storepass:env APK_PASSWORD \
  -keypass:env APK_PASSWORD -alias "$APK_ALIAS" -keyalg RSA -keysize 3072 -validity 7300 \
  -dname 'CN=OSSLLMAPI Android Preview'
