#!/usr/bin/env bash
# Source in CI only, when a durable Android signing key is configured.
# The PKCS12 never enters the checkout or an artifact: it is decoded into
# RUNNER_TEMP and removed by the caller's trap.
: "${ANDROID_KEYSTORE_B64:?Set ANDROID_KEYSTORE_B64 to the base64 PKCS12}"
: "${ANDROID_KEYSTORE_PASSWORD:?Set ANDROID_KEYSTORE_PASSWORD}"
: "${ANDROID_KEY_ALIAS:?Set ANDROID_KEY_ALIAS}"
keydir=$(mktemp -d "${RUNNER_TEMP:-/tmp}/apk-durable.XXXXXXXX")
printf '%s' "$ANDROID_KEYSTORE_B64" | base64 --decode > "$keydir/durable.p12"
test -s "$keydir/durable.p12"
export APK_KEYSTORE="$keydir/durable.p12" APK_PASSWORD="$ANDROID_KEYSTORE_PASSWORD" APK_ALIAS="$ANDROID_KEY_ALIAS"
export APK_KEY_DIR="$keydir"
