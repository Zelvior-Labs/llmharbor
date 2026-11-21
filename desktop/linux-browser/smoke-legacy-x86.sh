#!/bin/sh
# Runs inside a 32-bit (linux/386) container with distro Node and no network.
# Exercises the portable folder and the AppImage as the unprivileged "nobody"
# user and, where dpkg exists, installs the i386 .deb and runs its launcher.
set -eu
node -e 'if (process.arch !== "ia32") throw Error("expected a 32-bit Node, got " + process.arch)'
echo "Node $(node -v) on $(uname -m)"
as_nobody() { su -s /bin/sh nobody -c "$1"; }
mkdir -p /tmp/portable
tar -xzf /downloads/*-linux-legacy-x86-portable.tar.gz -C /tmp/portable
chmod -R a+rX /tmp/portable
as_nobody "cd /tmp && node /smoke.mjs /tmp/portable/LLMHarbor-* ia32"
cp /downloads/*-linux-legacy-x86.AppImage /tmp/llmharbor-legacy-x86.AppImage
chmod 755 /tmp/llmharbor-legacy-x86.AppImage
as_nobody "cd /tmp && SMOKE_LAUNCHER=/tmp/llmharbor-legacy-x86.AppImage node /smoke.mjs - ia32"
if command -v dpkg >/dev/null 2>&1; then
  dpkg -i /downloads/*-linux-legacy-x86.deb
  dpkg-query -W -f='${Package} ${Version} ${Architecture}\n' llmharbor-legacy
  as_nobody "cd /tmp && SMOKE_LAUNCHER=/usr/bin/llmharbor-legacy node /smoke.mjs - ia32"
  dpkg -r llmharbor-legacy
  test ! -e /usr/lib/llmharbor-legacy
fi
echo "Linux Legacy x86 files passed"
