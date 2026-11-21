#!/usr/bin/env bash
# Turn the architecture-neutral Linux Legacy archive (built by
# `npm --prefix desktop run dist:linux:legacy`) into the release files:
#   LLMHarbor-<v>-linux-legacy-{x86,x64}-portable.tar.gz
#   LLMHarbor-<v>-linux-legacy-{x86,x64}.deb       (Architecture i386 / amd64)
#   LLMHarbor-<v>-linux-legacy-{x86,x64}.AppImage  (type 2, i686 / x86_64 runtime)
# All of them run the same server bundle with the system's Node.js 18+.
# Needs dpkg-deb, and APPIMAGETOOL plus APPIMAGE_RUNTIME_DIR (with runtime-i686
# and runtime-x86_64) for the AppImages.
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
version=$(node -p 'require("./desktop/package.json").version')
out=desktop/dist-electron/linux-legacy
src=$out/LLMHarbor-$version-linux-legacy.tar.gz
test -s "$src" || { echo "Missing $src; run npm --prefix desktop run dist:linux:legacy first" >&2; exit 1; }
: "${APPIMAGETOOL:?Set APPIMAGETOOL to an appimagetool binary}"
: "${APPIMAGE_RUNTIME_DIR:?Set APPIMAGE_RUNTIME_DIR to a directory with runtime-i686 and runtime-x86_64}"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
tar -xzf "$src" -C "$work"
app=$work/LLMHarbor-$version-linux-legacy
for file in start.mjs server.mjs llmharbor-legacy dashboard/index.html node_modules/node-sqlite3-wasm/package.json; do
  test -s "$app/$file"
done
chmod -R u=rwX,go=rX "$app"
chmod 755 "$app/llmharbor-legacy"
size=$(du -sk "$app" | cut -f1)
assets=desktop/linux-browser

for arch in x86 x64; do
  case $arch in
    x86) debarch=i386; aiarch=i686 ;;
    x64) debarch=amd64; aiarch=x86_64 ;;
  esac
  stem=LLMHarbor-$version-linux-legacy-$arch

  # Portable: the archive itself, named for the architecture people look for.
  cp "$src" "$out/$stem-portable.tar.gz"

  # Debian package. Node.js is only recommended, so a Node installed outside
  # the package manager (nvm, NodeSource tarball, ...) also satisfies it; the
  # launcher explains what to install when no suitable `node` is found.
  root=$work/deb-$arch
  mkdir -p "$root/DEBIAN" "$root/usr/lib" "$root/usr/bin" "$root/usr/share/applications" \
    "$root/usr/share/pixmaps" "$root/usr/share/doc/llmharbor-legacy"
  cp -a "$app" "$root/usr/lib/llmharbor-legacy"
  ln -s ../lib/llmharbor-legacy/llmharbor-legacy "$root/usr/bin/llmharbor-legacy"
  install -m 644 "$assets/llmharbor-legacy.desktop" "$root/usr/share/applications/llmharbor-legacy.desktop"
  install -m 644 desktop/assets/appicon_1024.png "$root/usr/share/pixmaps/llmharbor-legacy.png"
  install -m 644 LICENSE "$root/usr/share/doc/llmharbor-legacy/copyright"
  cat > "$root/DEBIAN/control" <<CONTROL
Package: llmharbor-legacy
Version: $version
Architecture: $debarch
Maintainer: Zelvior Labs <zelvior@proton.me>
Installed-Size: $size
Recommends: nodejs (>= 18)
Section: web
Priority: optional
Homepage: https://github.com/Zelvior-Labs/llmharbor
Description: LLMHarbor Legacy - local LLM API router with a browser dashboard
 LLMHarbor routes OpenAI-compatible requests across free LLM provider keys.
 This legacy edition runs the API server and browser dashboard with the
 system's Node.js 18 or newer. It bundles a pure-WebAssembly SQLite, so it
 needs no native addons, compiler or npm. Start it with llmharbor-legacy and
 open http://127.0.0.1:3001 in a browser.
CONTROL
  chmod -R u=rwX,go=rX "$root"
  chmod 755 "$root/usr/lib/llmharbor-legacy/llmharbor-legacy"
  # gzip members: dpkg on old distributions cannot read zstd or xz.
  dpkg-deb --root-owner-group -Zgzip --build "$root" "$out/$stem.deb"

  # AppImage: AppRun hands over to the launcher; the system Node runs it.
  appdir=$work/AppDir-$arch
  mkdir -p "$appdir/usr/lib"
  cp -a "$app" "$appdir/usr/lib/llmharbor-legacy"
  install -m 755 "$assets/AppRun" "$appdir/AppRun"
  install -m 644 "$assets/llmharbor-legacy.desktop" "$appdir/llmharbor-legacy.desktop"
  install -m 644 desktop/assets/appicon_1024.png "$appdir/llmharbor-legacy.png"
  ln -s llmharbor-legacy.png "$appdir/.DirIcon"
  ARCH=$aiarch APPIMAGE_EXTRACT_AND_RUN=1 "$APPIMAGETOOL" --no-appstream \
    --runtime-file "$APPIMAGE_RUNTIME_DIR/runtime-$aiarch" "$appdir" "$out/$stem.AppImage"
  chmod 755 "$out/$stem.AppImage"
done
rm -f "$src"
ls -l "$out"
