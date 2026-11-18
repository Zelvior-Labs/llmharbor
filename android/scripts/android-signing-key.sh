#!/usr/bin/env bash
# Create, inspect and rotate the durable Android signing key.
#
#   ./android/scripts/android-signing-key.sh init [--out durable.p12] [--alias ossllmapi]
#   ./android/scripts/android-signing-key.sh show durable.p12
#
# `init` prints the four values the build workflow reads (ANDROID_KEYSTORE_B64,
# ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD). Store them
# as repository secrets and every later APK installs over the previous one.
# The password is generated locally; nothing is uploaded by this script.
set -Eeuo pipefail

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
}

random_password() {
  # 32 chars from the alphanumeric alphabet: easy to paste, still ~190 bits.
  LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32
}

need_keytool() {
  command -v keytool >/dev/null || {
    echo "keytool not found. Install a JDK (e.g. 'apt install openjdk-17-jdk-headless')." >&2
    exit 1
  }
}

cmd_init() {
  local out="durable.p12" alias="ossllmapi" dname="CN=OSSLLMAPI, O=OSSLLMAPI, C=PK"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --out) out=${2:?--out needs a path}; shift 2 ;;
      --alias) alias=${2:?--alias needs a name}; shift 2 ;;
      --dname) dname=${2:?--dname needs a value}; shift 2 ;;
      -h|--help) usage; return 0 ;;
      *) echo "unknown option: $1" >&2; return 2 ;;
    esac
  done
  [[ -e "$out" ]] && { echo "$out already exists; refusing to overwrite a signing key." >&2; return 1; }
  need_keytool

  local password=${ANDROID_KEYSTORE_PASSWORD:-$(random_password)}
  ( umask 077
    keytool -genkeypair -v \
      -keystore "$out" -storetype PKCS12 \
      -alias "$alias" -keyalg RSA -keysize 4096 -validity 10950 \
      -storepass "$password" -keypass "$password" -dname "$dname" >/dev/null 2>&1
  )
  chmod 600 "$out"

  local b64 fingerprint
  b64=$(base64 --wrap=0 < "$out")
  # Same value the launcher shows under Updates, so an install can be checked
  # against the key that is about to sign the next release.
  fingerprint=$(keytool -list -v -keystore "$out" -storepass "$password" 2>/dev/null \
    | sed -n 's/^[[:space:]]*SHA256: //p' | head -1)
  cat <<EOF
Signing key written to $out (mode 600). Keep an offline copy: without this
file you cannot ship an update that installs over the current APKs.

Add these as repository secrets, then re-run the Android workflow:

  ANDROID_KEYSTORE_B64=$b64
  ANDROID_KEYSTORE_PASSWORD=$password
  ANDROID_KEY_ALIAS=$alias
  ANDROID_KEY_PASSWORD=$password

Or with the GitHub CLI:

  gh secret set ANDROID_KEYSTORE_B64 --body "\$(base64 --wrap=0 < $out)"
  gh secret set ANDROID_KEYSTORE_PASSWORD --body '$password'
  gh secret set ANDROID_KEY_ALIAS --body '$alias'
  gh secret set ANDROID_KEY_PASSWORD --body '$password'

Certificate SHA-256: ${fingerprint:-unavailable}

The password is printed once here and is not stored anywhere else.
EOF
}

cmd_show() {
  local file=${1:?show needs a keystore path}
  [[ -s "$file" ]] || { echo "no keystore at $file" >&2; return 1; }
  need_keytool
  local storepass=${ANDROID_KEYSTORE_PASSWORD:-}
  local args=(-list -v -keystore "$file")
  [[ -n "$storepass" ]] && args+=(-storepass "$storepass")
  keytool "${args[@]}" 2>/dev/null | sed -n 's/^[[:space:]]*\(Alias name\|Valid from\|SHA256:\)/\1/p'
  echo
  echo "Base64 (feed to ANDROID_KEYSTORE_B64):"
  base64 --wrap=0 < "$file"; echo
}

main() {
  local cmd=${1:-}
  shift || true
  case "$cmd" in
    init) cmd_init "$@" ;;
    show) cmd_show "$@" ;;
    -h|--help|help|"") usage ;;
    *) echo "unknown command: $cmd" >&2; usage; return 2 ;;
  esac
}

main "$@"
