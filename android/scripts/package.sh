#!/usr/bin/env bash
# Linux/Android SDK build; no Gradle, emulator libraries or host node_modules in the APK.
set -euo pipefail
cd "$(dirname "$0")/../.."
preview=$(node -p 'require("./android/version.json").preview')
base=$(node -p 'require("./desktop/package.json").version')
version=$base-preview.$preview
if [[ ${1:-} == --version ]]; then echo "$version"; exit 0; fi
IFS=. read -r major minor patch <<< "$base"
(( preview > 0 && preview < 100 && minor < 100 && patch < 1000 ))
code=$(( ((major * 100 + minor) * 1000 + patch) * 100 + preview ))
# One-shot preview signers MUST NOT occupy the durable release package ID.
pkg=${ANDROID_PACKAGE_ID:-io.github.zelvior.ossllmapi.mobile.p$code}
abi=armeabi-v7a
out=$PWD/android/build
work=$out/package
sdk=${ANDROID_HOME:?Set ANDROID_HOME to the Android SDK}
tools=$sdk/build-tools/35.0.0
ndk=$sdk/ndk/27.3.13750724
tc=$ndk/toolchains/llvm/prebuilt/linux-x86_64
jar=$sdk/platforms/android-35/android.jar
native=$work/lib/$abi
rm -rf "$work"; mkdir -p "$native" "$work"/{gen,classes,dex} "$out/cache" "$out/apks"
test -s "$out/assets/gateway/dashboard/index.html"; test -s "$out/assets/gateway/gateway.mjs"
meta=./android/version.json
runtime=$(node -p "require('$meta').runtime")
repo=https://github.com/fogtape/nodejs-mobile
archive="nodejs-mobile-android-$runtime.zip"
fetch_verified() {
  local file=$1 sha=$2 url=$3
  if ! [[ -f $file ]] || ! printf '%s  %s\n' "$sha" "$file" | sha256sum --check --status; then
    curl -fsSL --retry 3 --retry-all-errors --max-time 240 "$url" -o "$file.part"
    printf '%s  %s\n' "$sha" "$file.part" | sha256sum --check
    mv "$file.part" "$file"
  fi
}
fetch_verified "$out/cache/$archive" "$(node -p "require('$meta').archiveSha256")" "$repo/releases/download/v$runtime/$archive"
unzip -p "$out/cache/$archive" "bin/$abi/libnode.so" > "$native/libnode.so"
mkdir -p "$out/assets/licenses"
licenses=$out/assets/licenses
raw=https://raw.githubusercontent.com/fogtape/nodejs-mobile
recipe=d4aedf536d035bf4eeab7a7a6e18b73d154d0ea5
fetch_verified "$licenses/Node.txt" "$(node -p "require('$meta').licenseSha256")" "$raw/v$runtime/LICENSE"
fetch_verified "$licenses/NodeMobile.txt" 66233b87054d6bca9b0c2f23b027bb2caf1ebd961a6f981616d098dade33af34 "$raw/$recipe/LICENSE"
fetch_verified "$licenses/NodeMobile-NOTICE.txt" 8d4d85eeb410ddd9017344e11447ce30639961f4848a58df75e7aee8fa55133c "$raw/$recipe/NOTICE.md"
cp LICENSE "$licenses/OSSLLMAPI.txt"; cp "$ndk/NOTICE" "$licenses/Android-NDK.txt"
for font in geist geist-mono; do cp "node_modules/@fontsource-variable/$font/LICENSE" "$licenses/$font.txt"; done
cp "$tc/sysroot/usr/lib/arm-linux-androideabi/libc++_shared.so" "$native/"
"$tc/bin/armv7a-linux-androideabi30-clang++" -shared -fPIC -Os -fvisibility=hidden -Wl,-z,defs \
  android/native/gateway.cpp -L"$native" -lnode -o "$native/libgateway.so"
for so in "$native"/*.so; do
  "$tc/bin/llvm-strip" --strip-unneeded "$so"
  readelf -h "$so" > "$work/elf-header"
  grep -q 'Class:.*ELF32$' "$work/elf-header"; grep -q 'Machine:.*ARM$' "$work/elf-header"
done
"$tools/aapt2" compile --dir android/res -o "$work/resources.zip"
"$tools/aapt2" link -I "$jar" --manifest android/AndroidManifest.xml --min-sdk-version 30 --target-sdk-version 30 \
  --version-code "$code" --version-name "$version" --rename-manifest-package "$pkg" \
  --custom-package io.github.zelvior.ossllmapi.mobile --java "$work/gen" \
  -A "$out/assets" -o "$work/base.apk" "$work/resources.zip"
mapfile -t sources < <(find android/java "$work/gen" -name '*.java')
javac -encoding UTF-8 --release 8 -classpath "$jar" -d "$work/classes" "${sources[@]}"
jar cf "$work/classes.jar" -C "$work/classes" .
"$tools/d8" --min-api 30 --release --lib "$jar" --output "$work/dex" "$work/classes.jar"
cp "$work/dex/classes.dex" "$work/"
(cd "$work" && zip -q -9 base.apk classes.dex lib/armeabi-v7a/*.so)
"$tools/zipalign" -f 4 "$work/base.apk" "$work/aligned.apk"
apk="$out/apks/OSSLLMAPI-$version-android-$abi.apk"
"$tools/apksigner" sign --ks "${APK_KEYSTORE:?Set APK_KEYSTORE to a private signing keystore}" \
  --ks-key-alias "${APK_ALIAS:?Set APK_ALIAS}" --ks-pass env:APK_PASSWORD --key-pass env:APK_PASSWORD \
  --v4-signing-enabled false --out "$apk" "$work/aligned.apk"
"$tools/zipalign" -c 4 "$apk"
"$tools/apksigner" verify --verbose --print-certs "$apk" | tee "$work/signature.txt"
grep -Fq 'Verified using v2 scheme (APK Signature Scheme v2): true' "$work/signature.txt"
"$tools/aapt" dump badging "$apk" > "$work/badging.txt"
grep -F "package: name='$pkg'" "$work/badging.txt"; grep -Fx "sdkVersion:'30'" "$work/badging.txt"
grep -Fx "native-code: 'armeabi-v7a'" "$work/badging.txt"; ! grep -Fqx application-debuggable "$work/badging.txt" || exit 1
printf '%s\n' "$pkg" > "$work/package-id"
