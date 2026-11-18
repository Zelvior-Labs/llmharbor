#!/usr/bin/env python3
"""Fast development check; this does not substitute for APK installation/launch."""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from api import Smoke, upstream

entry = Path('android/build/assets/gateway/gateway.mjs').resolve()
smoke = Smoke(31415)
with tempfile.TemporaryDirectory() as tmp:
    for attempt in (1, 2):
        proc = subprocess.Popen(['node', str(entry), tmp], cwd=tmp, stdout=subprocess.DEVNULL)
        try:
            for _ in range(100):
                assert proc.poll() is None, 'packaged gateway exited'
                with socket.socket(socket.AF_UNIX) as s:
                    try: s.connect(os.path.join(tmp, 'control.sock'))
                    except (ConnectionRefusedError, FileNotFoundError): time.sleep(.1); continue
                    state = json.loads(s.makefile().readline()); break
            else: raise TimeoutError('private control socket')
            if attempt == 1: key = smoke.setup(state['setup'], upstream())
            else:
                assert not state['setup']; smoke.chat(key)
        finally:
            proc.terminate(); proc.wait(timeout=12)
print('Bundle passed: setup protection, dashboard, provider routing and encrypted-key persistence.')
