#!/usr/bin/env python3
"""Fast development check; this does not substitute for APK installation/launch."""
import json
import os
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from api import Smoke, upstream

ENTRY = Path('android/build/assets/gateway/gateway.mjs').resolve()


def state(tmp, proc, timeout=20):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        assert proc.poll() is None, 'packaged gateway exited'
        with socket.socket(socket.AF_UNIX) as client:
            try:
                client.connect(os.path.join(tmp, 'control.sock'))
            except (ConnectionRefusedError, FileNotFoundError):
                time.sleep(.1)
                continue
            return json.loads(client.makefile().readline())
    raise TimeoutError('private control socket')


def run(tmp, *args, env=None):
    return subprocess.Popen(['node', str(ENTRY), tmp, *args], cwd=tmp, env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def fetch(url, host=None):
    headers = {} if host is None else {'Host': host}
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=15) as page:
            return page.status, page.read().decode()
    except urllib.error.HTTPError as err:
        return err.code, ''


# 1. First run: setup code gate, provider routing, encrypted key persistence.
with tempfile.TemporaryDirectory() as tmp:
    for attempt in (1, 2):
        proc = run(tmp)
        try:
            current = state(tmp, proc)
            smoke = Smoke(current['port'])
            if attempt == 1:
                assert current['setup'], 'first start must expose a setup code'
                assert not current['reset']
                key = smoke.setup(current['setup'], upstream())
            else:
                assert not current['setup'], 'a paired account must not get a second setup code'
                smoke.chat(key)
            assert (Path(tmp) / 'data' / '.encryption-key').is_file(), 'host fallback stores its own key'
            assert 'listening' in (Path(tmp) / 'logs' / 'gateway.log').read_text(), 'gateway log missing'
        finally:
            proc.terminate()
            proc.wait(timeout=15)

# 2. The APK path: the key arrives in the environment, so nothing is written at rest.
with tempfile.TemporaryDirectory() as tmp:
    proc = run(tmp, env={**os.environ, 'OSSLLMAPI_ENCRYPTION_KEY': 'ab' * 32})
    try:
        current = state(tmp, proc)
        assert not (Path(tmp) / 'data' / '.encryption-key').exists(), 'no plaintext key on disk'
        smoke = Smoke(current['port'])
        key = smoke.setup(current['setup'], upstream())
        smoke.chat(key)
    finally:
        proc.terminate()
        proc.wait(timeout=15)

# 3. A malformed key from the keystore is fatal rather than silently replaced.
with tempfile.TemporaryDirectory() as tmp:
    proc = run(tmp, env={**os.environ, 'OSSLLMAPI_ENCRYPTION_KEY': 'not-a-key'})
    assert proc.wait(timeout=20) != 0, 'a malformed keystore key must abort the gateway'

# 4. Port fallback when another app already owns 31415.
with tempfile.TemporaryDirectory() as tmp, socket.socket() as taken:
    taken.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    taken.bind(('127.0.0.1', 31415))
    taken.listen()
    proc = run(tmp)
    try:
        current = state(tmp, proc)
        assert current['port'] != 31415, 'the gateway must move off an occupied port'
        smoke = Smoke(current['port'])
        smoke.setup(current['setup'], upstream())
        assert fetch(f'http://127.0.0.1:{current["port"]}/', host='evil.example')[0] == 403, 'host guard'
    finally:
        proc.terminate()
        proc.wait(timeout=15)

# 5. LAN mode binds every interface and accepts its own address in the Host header.
with tempfile.TemporaryDirectory() as tmp:
    proc = run(tmp, 'lan')
    try:
        current = state(tmp, proc)
        smoke = Smoke(current['port'])
        smoke.setup(current['setup'], upstream())
        for url in current['lan']:
            status, body = fetch(url)
            assert status == 200 and 'OSSLLMAPI' in body, f'LAN dashboard failed for {url}'
        assert fetch(f'http://127.0.0.1:{current["port"]}/', host='evil.example')[0] == 403, 'LAN host guard'
    finally:
        proc.terminate()
        proc.wait(timeout=15)

# 6. Eco mode: the launcher snapshot exists, is non-secret and admits uncertainty.
with tempfile.TemporaryDirectory() as tmp:
    proc = run(tmp, 'local', 'eco')
    try:
        current = state(tmp, proc)
        smoke = Smoke(current['port'])
        key = smoke.setup(current['setup'], upstream())
        smoke.chat(key)
        status = Path(tmp) / 'status.json'
        deadline = time.monotonic() + 40
        while time.monotonic() < deadline:
            try:
                snapshot = json.loads(status.read_text())
            except (FileNotFoundError, json.JSONDecodeError):
                time.sleep(.2)
                continue
            # Snapshots refresh every 20 s; wait for one taken after the chat.
            if snapshot.get('requestsLastDay', 0) >= 1:
                break
            time.sleep(.5)
        else:
            raise AssertionError('gateway never published a status.json with the chat counted')
        assert snapshot['eco'] is True and snapshot['port'] == current['port']
        assert snapshot['startedAt'].endswith('Z') and snapshot['uptimeSec'] >= 0
        assert set(snapshot['keys']) == {'enabled', 'healthy', 'failing'}
        assert snapshot['keys']['enabled'] >= 1 and snapshot['providers'] >= 1
        assert not snapshot['allKeysFailing'], 'a never-checked key is not a failing key'
        raw = status.read_text()
        assert key not in raw, 'status.json leaked the unified API key'
        assert status.stat().st_mode & 0o077 == 0, 'status.json is world readable'
        assert '(battery saver)' in (Path(tmp) / 'logs' / 'gateway.log').read_text(), \
            'eco mode never reached the Node process'
    finally:
        proc.terminate()
        proc.wait(timeout=15)

print('Bundle passed: setup protection, keystore-supplied key, port fallback, LAN mode, host guard, '
      'provider routing, encrypted-key persistence and the eco-mode status snapshot.')
