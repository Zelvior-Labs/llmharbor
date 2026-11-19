#!/usr/bin/env bash
# The OSLLMAPI installer moved to https://ossllmapi.co/install.sh
# This shim keeps old `curl ... github.io ... | bash` one-liners working.
set -euo pipefail
exec bash -c "$(curl -fsSL https://ossllmapi.co/install.sh)"
