#!/usr/bin/env python3
"""Validate Android launcher translations without an Android build.

aapt2 accepts a translation whose positional arguments do not match the
default, and Android then throws IllegalFormatException the moment the string
is formatted — a crash on a screen the English build never reaches. This checks
the same things aapt2 does not: identical key sets and identical placeholders.
"""
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

RES = Path("android/res")
PLACEHOLDER = re.compile(r"%(?:\d+\$[sd]|[sd])")


def strings(path):
    root = ET.parse(path).getroot()
    return {node.get("name"): node.text or "" for node in root if node.tag == "string"}


def placeholders(value):
    return sorted(PLACEHOLDER.findall(value))


def main():
    default = strings(RES / "values/strings.xml")
    failures = []
    for directory in sorted(RES.glob("values-*")):
        file = directory / "strings.xml"
        if not file.is_file():
            failures.append(f"{directory.name}: missing strings.xml")
            continue
        translated = strings(file)
        for key, value in translated.items():
            if key not in default:
                failures.append(f"{directory.name}: unknown key {key}")
                continue
            if placeholders(value) != placeholders(default[key]):
                failures.append(
                    f"{directory.name}: {key} placeholders {placeholders(value)} "
                    f"!= {placeholders(default[key])}")
            if key in ("subtitle",) and value.count("\n") != default[key].count("\n"):
                failures.append(f"{directory.name}: {key} line break mismatch")
        missing = sorted(set(default) - set(translated))
        if missing:
            failures.append(f"{directory.name}: missing keys: {', '.join(missing)}")
    if failures:
        print("\n".join(f"::error file=android/res/values/strings.xml::{f}" for f in failures))
        return 1
    print(f"Launcher strings: {len(default)} keys across {len(list(RES.glob('values-*')))} locales")
    return 0


if __name__ == "__main__":
    sys.exit(main())
