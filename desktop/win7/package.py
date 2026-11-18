"""Assemble a portable Win7 desktop ZIP. Python is a build tool, not a runtime dependency."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
from zipfile import ZIP_DEFLATED, ZipFile

HERE = Path(__file__).resolve().parent
DESKTOP = HERE.parent
OUT = DESKTOP / 'dist-electron' / 'windows7'
PIN = json.loads((HERE / 'runtime.json').read_text())
VERSION = json.loads((DESKTOP / 'package.json').read_text())['version'] + f"-preview.{PIN['preview']}"


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def check_executable(path, arch):
    # A modern x86 PE is still x86. Check the minimum subsystem in the actual
    # image as well as its machine type; neither is a substitute for an OS test.
    with path.open('rb') as f:
        f.seek(0x3c)
        pe, = struct.unpack('<I', f.read(4))
        f.seek(pe)
        signature, machine = struct.unpack('<4sH', f.read(6))
        f.seek(pe + 24 + 48)  # IMAGE_OPTIONAL_HEADER.MajorSubsystemVersion
        subsystem = struct.unpack('<HH', f.read(4))
    if signature != b'PE\0\0' or machine != {'x86': 0x14c, 'x64': 0x8664}[arch] or subsystem > (6, 1):
        raise ValueError(f'Wrong PE target for Windows 7 {arch}: machine={machine:#x}, subsystem={subsystem}')
    print(f'{arch} PE subsystem {subsystem[0]}.{subsystem[1]}')


def package(arch, runtime_zip=None):
    cpu = 'ia32' if arch == 'x86' else 'x64'
    name = f'OSSLLMAPI-{VERSION}-windows7-{arch}'
    electron = PIN['electron']
    with tempfile.TemporaryDirectory(prefix='ossllmapi-win7-') as tmp:
        tmp = Path(tmp)
        if not runtime_zip:
            asset = f'electron-v{electron}-win32-{cpu}.zip'
            url = f"https://github.com/{PIN['repository']}/releases/download/v{electron}/{asset}"
            runtime_zip = tmp / asset
            subprocess.run(['curl', '--fail', '--location', '--retry', '3', '--output', runtime_zip, url], check=True)
        # Never extract an unverified runtime or fall back to stock Electron.
        if sha256(runtime_zip) != PIN['sha256'][cpu]:
            raise ValueError(f'Wrong SHA-256 for Electron-Legacy {electron} {cpu}')
        stage = tmp / name
        with ZipFile(runtime_zip) as vendor:
            vendor.extractall(stage)
        check_executable(stage / 'electron.exe', arch)
        # Leave the PE, DLLs, Chromium resources and vendor licenses intact.
        (stage / 'electron.exe').rename(stage / 'OSSLLMAPI.exe')
        (stage / 'resources' / 'default_app.asar').unlink()
        app = stage / 'resources' / 'app'
        build = app / 'build'
        build.mkdir(parents=True)
        (app / 'package.json').write_text(json.dumps({
            'name': 'ossllmapi-win7', 'productName': 'OSSLLMAPI', 'version': VERSION,
            'type': 'module', 'main': 'build/main.mjs',
        }))
        for file in ('main.mjs', 'server.mjs'):
            shutil.copyfile(OUT / 'build' / file, build / file)
        for file in ('preload.cjs', 'preload-popover.cjs'):
            shutil.copyfile(DESKTOP / 'build' / file, build / file)
        (app / 'assets').mkdir()
        shutil.copyfile(DESKTOP / 'assets' / 'tray.ico', app / 'assets' / 'tray.ico')
        shutil.copytree(DESKTOP / 'renderer', app / 'renderer')
        if not (OUT / 'client' / 'index.html').is_file():
            raise ValueError('Build the win7 dashboard first; see desktop/win7/README.md')
        shutil.copytree(OUT / 'client', stage / 'resources' / 'client-dist')
        shutil.copyfile(DESKTOP.parent / 'LICENSE', stage / 'LICENSE.OSSLLMAPI.txt')
        shutil.copyfile(HERE / 'LICENSE.electron-legacy.txt', stage / 'LICENSE.electron-legacy.txt')
        (stage / 'README-Windows7.txt').write_bytes((HERE / 'README.md').read_text(encoding='utf-8').replace('\n', '\r\n').encode('utf-8-sig'))

        # One top-level folder also makes third-party unzip tools safe to use
        # directly in Downloads. Never copy node_modules or installer helpers.
        archive = OUT / (name + '.zip')
        with ZipFile(tmp / archive.name, 'w', ZIP_DEFLATED) as out:
            for file in sorted(stage.rglob('*')):
                if file.is_file():
                    out.write(file, file.relative_to(tmp))
        shutil.move(tmp / archive.name, archive)
        print(archive)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--version', action='version', version=VERSION)
    parser.add_argument('arch', choices=['x86', 'x64'])
    parser.add_argument('--runtime-zip', type=Path, help='Use a local copy of the pinned GitHub asset (same hash check)')
    args = parser.parse_args()
    package(args.arch, args.runtime_zip)
