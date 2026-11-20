#!/usr/bin/env bash
# Linux/Android SDK build; no Gradle, emulator libraries or host node_modules in the APK.
set -Eeuo pipefail
trap 'echo "::error file=android/scripts/package.sh,line=$LINENO::Package step failed: $BASH_COMMAND" >&2' ERR
cd "$(dirname "$0")/../.."
preview=$(node -p 'require("./android/version.json").preview')
base=$(node -p 'require("./desktop/package.json").version')
version=$base-preview.$preview
if [[ ${1:-} == --version ]]; then echo "$version"; exit 0; fi
IFS=. read -r major minor patch <<< "$base"
(( preview > 0 && preview < 100 && minor < 100 && patch < 1000 ))
code=$(( ((major * 100 + minor) * 1000 + patch) * 100 + preview ))
mode=${ANDROID_SIGNING_MODE:-preview}
if [[ $mode == durable ]]; then
  # A durable key may only ever carry the stable public ID: users must be able
  # to install later builds over this one.
  : "${ANDROID_PACKAGE_ID:?Durable signing needs ANDROID_PACKAGE_ID}"
  pkg=$ANDROID_PACKAGE_ID
else
  # One-shot preview signers MUST NOT occupy the durable release package ID.
  pkg=${ANDROID_PACKAGE_ID:-io.github.zelvior.llmharbor.mobile.p$code}
fi
abis=${ANDROID_ABIS:-"armeabi-v7a arm64-v8a x86_64"}
out=$PWD/android/build
work=$out/package
sdk=${ANDROID_HOME:?Set ANDROID_HOME to the Android SDK}
tools=$sdk/build-tools/35.0.0
ndk=$sdk/ndk/27.3.13750724
tc=$ndk/toolchains/llvm/prebuilt/linux-x86_64
jar=$sdk/platforms/android-35/android.jar
rm -rf "$work"; mkdir -p "$work"/{gen,classes,dex,native} "$out/cache" "$out/apks"
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
mkdir -p "$out/assets/licenses"
licenses=$out/assets/licenses
raw=https://raw.githubusercontent.com/fogtape/nodejs-mobile
recipe=d4aedf536d035bf4eeab7a7a6e18b73d154d0ea5
fetch_verified "$licenses/Node.txt" "$(node -p "require('$meta').licenseSha256")" "$raw/v$runtime/LICENSE"
fetch_verified "$licenses/NodeMobile.txt" 66233b87054d6bca9b0c2f23b027bb2caf1ebd961a6f981616d098dade33af34 "$raw/$recipe/LICENSE"
fetch_verified "$licenses/NodeMobile-NOTICE.txt" 8d4d85eeb410ddd9017344e11447ce30639961f4848a58df75e7aee8fa55133c "$raw/$recipe/NOTICE.md"
cp LICENSE "$licenses/LLMHarbor.txt"; cp "$ndk/NOTICE" "$licenses/Android-NDK.txt"
for font in geist geist-mono; do cp "node_modules/@fontsource-variable/$font/LICENSE" "$licenses/$font.txt"; done

# Resources, Java and DEX are identical for every ABI; only native libraries differ.
"$tools/aapt2" compile --dir android/res -o "$work/resources.zip"
"$tools/aapt2" link -I "$jar" --manifest android/AndroidManifest.xml --min-sdk-version 26 --target-sdk-version 35 \
  --version-code "$code" --version-name "$version" --rename-manifest-package "$pkg" \
  --custom-package io.github.zelvior.llmharbor.mobile --java "$work/gen" \
  -A "$out/assets" -o "$work/base-unsigned.apk" "$work/resources.zip"
mapfile -t sources < <(find android/java "$work/gen" -name '*.java')
javac -encoding UTF-8 --release 8 -classpath "$jar" -d "$work/classes" "${sources[@]}"
jar cf "$work/classes.jar" -C "$work/classes" .
"$tools/d8" --min-api 30 --release --lib "$jar" --output "$work/dex" "$work/classes.jar"
cp "$work/dex/classes.dex" "$work/"

for abi in $abis; do
  case $abi in
    armeabi-v7a) cc=armv7a-linux-androideabi30-clang++; libcxx=arm-linux-androideabi; elf32=1; machine=ARM ;;
    arm64-v8a)   cc=aarch64-linux-android30-clang++;      libcxx=aarch64-linux-android; elf32=0; machine=AArch64 ;;
    x86_64)      cc=x86_64-linux-android30-clang++;       libcxx=x86_64-linux-android;  elf32=0; machine=X86-64 ;;
    *) echo "::error file=android/scripts/package.sh::Unsupported ABI $abi"; exit 1 ;;
  esac
  native=$work/native/$abi
  rm -rf "$native"; mkdir -p "$native"
  unzip -p "$out/cache/$archive" "bin/$abi/libnode.so" > "$native/libnode.so"
  test -s "$native/libnode.so"
  cp "$tc/sysroot/usr/lib/$libcxx/libc++_shared.so" "$native/"
  "$tc/bin/$cc" -shared -fPIC -Os -fvisibility=hidden -Wl,-z,defs \
    android/native/gateway.cpp -L"$native" -lnode -o "$native/libgateway.so"
  for so in "$native"/*.so; do
    "$tc/bin/llvm-strip" --strip-unneeded "$so"
    readelf -h "$so" > "$work/elf-header"
    if (( elf32 )); then grep -q 'Class:.*ELF32$' "$work/elf-header"; else grep -q 'Class:.*ELF64$' "$work/elf-header"; fi
    grep -q "Machine:.*$machine\$" "$work/elf-header"
  done
  stage=$work/stage-$abi
  rm -rf "$stage"; mkdir -p "$stage/lib/$abi"
  cp "$work/base-unsigned.apk" "$stage/base.apk"
  cp "$work/classes.dex" "$stage/"
  cp "$native"/*.so "$stage/lib/$abi/"
  (cd "$stage" && zip -q -9 base.apk classes.dex lib/"$abi"/*.so)
  "$tools/zipalign" -f 4 "$stage/base.apk" "$stage/aligned.apk"
  apk="$out/apks/LLMHarbor-$version-android-$abi.apk"
  "$tools/apksigner" sign --ks "${APK_KEYSTORE:?Set APK_KEYSTORE to a private signing keystore}" \
    --ks-key-alias "${APK_ALIAS:?Set APK_ALIAS}" --ks-pass env:APK_PASSWORD --key-pass env:APK_PASSWORD \
    --v4-signing-enabled false --out "$apk" "$stage/aligned.apk"
  "$tools/zipalign" -c 4 "$apk"
  "$tools/apksigner" verify --verbose --print-certs "$apk" | tee "$work/signature-$abi.txt"
  # Android 11 verifies v3 first and does not re-verify v2 after a valid v3 signature.
  grep -Fq 'Verified using v3 scheme (APK Signature Scheme v3): true' "$work/signature-$abi.txt"
  grep -Fq 'Number of signers: 1' "$work/signature-$abi.txt"
  "$tools/aapt" dump badging "$apk" > "$work/badging-$abi.txt"
  grep -F "package: name='$pkg' versionCode='$code' versionName='$version'" "$work/badging-$abi.txt"
  grep -Fx "sdkVersion:'26'" "$work/badging-$abi.txt"
  grep -Fx "targetSdkVersion:'35'" "$work/badging-$abi.txt"
  grep -Fx "native-code: '$abi'" "$work/badging-$abi.txt"
  grep -F "uses-permission: name='android.permission.REQUEST_INSTALL_PACKAGES'" "$work/badging-$abi.txt"
  ! grep -Fqx application-debuggable "$work/badging-$abi.txt"
  echo "$abi  $(sha256sum "$apk" | cut -d' ' -f1)" >> "$work/built.txt"
done
printf '%s\n' "$pkg" > "$work/package-id"
printf '%s\n' "$mode" > "$work/signing-mode"
cat "$work/built.txt"
