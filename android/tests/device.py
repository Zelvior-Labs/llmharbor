#!/usr/bin/env python3
"""Install a *release* APK and exercise its launcher and real API on the booted emulator."""
import os
import re
import subprocess
import tempfile
import time
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from api import Smoke, upstream

apk_dir = Path(os.environ.get('APK_DIR', 'android/build/apks'))
abi = os.environ.get('ABI', 'armeabi-v7a')
arch = {'armeabi-v7a': 'arm', 'arm64-v8a': 'arm64', 'x86_64': 'x64'}[abi]
expected_sdk = os.environ.get('EXPECTED_SDK', '30')
pkg = (apk_dir / 'package-id').read_text().strip()
activity = f'{pkg}/io.github.zelvior.ossllmapi.mobile.MainActivity'


def adb(*args):
    return subprocess.check_output(['adb', *map(str, args)], text=True, timeout=60).strip()


def nodes():
    adb('shell', 'uiautomator', 'dump', '/data/local/tmp/ossllmapi-ui.xml')
    return list(ET.fromstring(adb('shell', 'cat', '/data/local/tmp/ossllmapi-ui.xml')).iter('node'))


def view(pattern, enabled=True, timeout=65):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        for node in nodes():
            match = re.fullmatch(pattern, node.get('text', ''))
            if match and node.get('enabled') == str(enabled).lower():
                return match, node.get('bounds')
        time.sleep(.4)
    raise TimeoutError(f'Launcher did not show expected state: {pattern}')


def tap(label):
    _, bounds = view(re.escape(label))
    left, top, right, bottom = map(int, re.findall(r'\d+', bounds))
    adb('shell', 'input', 'tap', (left + right) // 2, (top + bottom) // 2)


def never_shown(prefix, seconds=3):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if any((node.get('text') or '').startswith(prefix) for node in nodes()):
            return False
        time.sleep(.3)
    return True


def run():
    assert adb('shell', 'getprop', 'ro.build.version.sdk') == expected_sdk, 'wrong emulator API level'
    abis = adb('shell', 'getprop', 'ro.product.cpu.abilist')
    print(f'API {expected_sdk} emulator ABIs:', abis, flush=True)
    assert abi in abis.split(','), f'This system image cannot execute {abi}'
    apk, = sorted(apk_dir.glob(f'*-android-{abi}.apk'))
    assert 'Success' in adb('install', '--abi', abi, apk)
    if int(expected_sdk) >= 33:
        # Avoid the runtime notification prompt covering the launcher UI.
        subprocess.run(['adb', 'shell', 'pm', 'grant', pkg, 'android.permission.POST_NOTIFICATIONS'],
                       capture_output=True, text=True, timeout=30)
    adb('shell', 'am', 'start', '-W', '-n', activity)

    tap('Start gateway')
    running = r'Gateway running · ' + arch + r' · Node (24\.[0-9.]+) · port (\d+)'
    match, _ = view(running)
    port = int(match.group(2))
    print(f'Gateway reports port {port}', flush=True)

    # One-time codes are hidden until the owner asks for them.
    view('Show setup/reset code')
    assert never_shown('Setup code:'), 'setup code was visible without asking'
    tap('Show setup/reset code')
    code = view(r'Setup code: ([A-Z2-9]{10})')[0].group(1)
    view('Open dashboard')
    view('LAN access is off: this phone only.')
    view('Check for updates')
    view('Export encrypted backup')

    adb('forward', f'tcp:{port}', f'tcp:{port}')
    # The upstream is a fixture on the runner. The router, SQLite and encrypted keys are on Android.
    adb('reverse', 'tcp:38887', f'tcp:{upstream()}')
    smoke = Smoke(port)
    with tempfile.TemporaryDirectory() as profile:
        page = subprocess.run(['google-chrome', '--headless', '--disable-gpu', '--no-sandbox',
                               '--disable-dev-shm-usage', '--window-size=392,800',
                               f'--user-data-dir={profile}', '--virtual-time-budget=8000',
                               '--dump-dom', smoke.base + '/'],
                              capture_output=True, text=True, timeout=60, check=True)
        assert 'id="auth-setup-code"' in page.stdout, 'React first-use dashboard did not render from APK'

    key = smoke.setup(code, 38887)
    tap('Stop gateway')
    view('Gateway stopped')
    assert not adb('shell', f'pidof {pkg}:gateway || true'), 'Gateway process survived Stop'

    tap('Start gateway')
    match, _ = view(running)
    port = int(match.group(2))
    adb('forward', f'tcp:{port}', f'tcp:{port}')
    smoke = Smoke(port)
    view('Open dashboard')
    assert not smoke.req('/api/auth/status')['needsSetup']
    smoke.chat(key)  # Same API key; same provider decrypted from SQLite after a fresh launch.

    smoke.req('/api/auth/forgot-password', {})
    tap('Show setup/reset code')
    reset = view(r'Reset code: ([A-Z2-9]{10})')[0].group(1)
    assert smoke.req('/api/auth/reset-password', {'resetCode': reset, 'newPassword': 'changed-for-smoke'})['token']

    # LAN is opt-in and turns a phone into a gateway for other devices on the same network.
    tap('Allow other devices on my Wi-Fi (LAN)')
    match, _ = view(r'LAN dashboard: (http://[0-9.]+:(\d+)/)')
    lan_port = int(match.group(2))
    assert lan_port >= 31415, 'LAN dashboard must use the loopback API port range'
    adb('forward', f'tcp:{lan_port}', f'tcp:{lan_port}')
    with urllib.request.urlopen(f'http://127.0.0.1:{lan_port}/', timeout=20) as page:
        assert b'OSSLLMAPI' in page.read(), 'dashboard not served with LAN enabled'

    tap('Stop gateway')
    view('Gateway stopped')
    print(f'Verified signed {abi} APK on API {expected_sdk}: launch, hidden codes, dashboard, setup guard, '
          'models, chat, stop/restart, private reset code and LAN mode.')


try:
    run()
except Exception as error:
    print(f'::error::Android smoke ({abi}, API {expected_sdk}): {type(error).__name__}: {error}', flush=True)
    # Diagnostics from Android, not the launcher UI (which contains one-time codes).
    subprocess.run(['adb', 'logcat', '-d', '-t', '1600', 'AndroidRuntime:E', 'linker:E', 'libc:F',
                    'DEBUG:F', 'OSSLLMAPI:E', 'ActivityManager:E', '*:S'])
    raise
finally:
    subprocess.run(['adb', 'shell', 'rm', '-f', '/data/local/tmp/ossllmapi-ui.xml'])
