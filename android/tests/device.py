#!/usr/bin/env python3
"""Install the *release* ARM APK, drive its launcher and exercise its real API on API 30."""
from pathlib import Path
import re
import subprocess
import tempfile
import time
import xml.etree.ElementTree as ET
from api import Smoke, upstream

build = Path('android/build')
pkg = (build / 'package/package-id').read_text().strip()
activity = f'{pkg}/io.github.zelvior.ossllmapi.mobile.MainActivity'


def adb(*args):
    return subprocess.check_output(['adb', *map(str, args)], text=True, timeout=45).strip()


def view(pattern, enabled=True, timeout=65):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        adb('shell', 'uiautomator', 'dump', '/data/local/tmp/ossllmapi-ui.xml')
        for node in ET.fromstring(adb('shell', 'cat', '/data/local/tmp/ossllmapi-ui.xml')).iter('node'):
            match = re.fullmatch(pattern, node.get('text', ''))
            if match and node.get('enabled') == str(enabled).lower():
                return match, node.get('bounds')
        time.sleep(.4)
    raise TimeoutError(f'Launcher did not show expected state: {pattern}')


def tap(label):
    _, bounds = view(label)
    left, top, right, bottom = map(int, re.findall(r'\d+', bounds))
    adb('shell', 'input', 'tap', (left + right) // 2, (top + bottom) // 2)


def run():
    assert adb('shell', 'getprop', 'ro.build.version.sdk') == '30'
    abis = adb('shell', 'getprop', 'ro.product.cpu.abilist'); print('API 30 emulator ABIs:', abis, flush=True)
    assert 'armeabi-v7a' in abis.split(','), 'This system image cannot execute the release ABI'
    apk, = (build / 'apks').glob('*.apk')
    assert 'Success' in adb('install', '--abi', 'armeabi-v7a', apk)
    adb('shell', 'am', 'start', '-W', '-n', activity)
    tap('Start gateway'); view(r'Gateway running · arm · Node 24\.22\.1')
    code = view(r'Setup code: ([A-Z2-9]{10})')[0].group(1)
    view('Open dashboard')
    adb('forward', 'tcp:31415', 'tcp:31415')
    # The upstream is a fixture on the runner. The router, SQLite and encrypted keys are on Android.
    adb('reverse', 'tcp:38887', f'tcp:{upstream()}')
    smoke = Smoke(31415)
    with tempfile.TemporaryDirectory() as profile:
        page = subprocess.run(['google-chrome', '--headless', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
                               '--window-size=392,800', f'--user-data-dir={profile}', '--virtual-time-budget=8000',
                               '--dump-dom', smoke.base + '/'], capture_output=True, text=True, timeout=60, check=True)
        assert 'id="auth-setup-code"' in page.stdout, 'React first-use dashboard did not render from APK'
    key = smoke.setup(code, 38887)
    tap('Stop gateway'); view('Gateway stopped')
    assert not adb('shell', f'pidof {pkg}:gateway || true'), 'Gateway process survived Stop'
    tap('Start gateway'); view(r'Gateway running · arm · Node 24\.22\.1'); view('Open dashboard')
    assert not smoke.req('/api/auth/status')['needsSetup']
    smoke.chat(key)  # Same API key; same provider decrypted from SQLite after a fresh launch.
    smoke.req('/api/auth/forgot-password', {})
    reset = view(r'Reset code: ([A-Z2-9]{10})')[0].group(1)
    assert smoke.req('/api/auth/reset-password', {'resetCode': reset, 'newPassword': 'changed-for-smoke'})['token']
    tap('Stop gateway'); view('Gateway stopped')
    print('Verified signed ARMv7 APK: native launch, dashboard, setup guard, models, chat, stop/restart, private reset code.')


try:
    run()
except Exception as error:
    print(f'::error::Android 11 smoke: {type(error).__name__}: {error}', flush=True)
    # Diagnostics from Android, not the launcher UI (which contains one-time codes).
    subprocess.run(['adb', 'logcat', '-d', '-t', '1600', 'AndroidRuntime:E', 'linker:E', 'libc:F', 'DEBUG:F', 'OSSLLMAPI:E', '*:S'])
    raise
finally:
    subprocess.run(['adb', 'shell', 'rm', '-f', '/data/local/tmp/ossllmapi-ui.xml'])
