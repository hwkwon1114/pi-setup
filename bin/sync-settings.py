#!/usr/bin/env python3
"""Compose portable defaults with private machine overrides (Python 3, no dependencies).

sync-settings.py CONFIG_DIR AGENT_DIR [--capture-local] [--check]
Private overrides: AGENT_DIR/local-config/{settings,models,mcp}.json
Generated files: AGENT_DIR/{settings,models,mcp}.json
JSON Merge Patch: objects merge, arrays replace, null deletes. No interpolation.
Unrecorded live edits refuse sync; --capture-local explicitly saves them locally.
"""
import argparse
import copy
import json
import os
from pathlib import Path
import tempfile

FILES = ('settings.json', 'models.json', 'mcp.json')
MACHINE_KEYS = ('deviceId', 'lastChangelogVersion')


def load(path, default=None):
    if not path.exists():
        return copy.deepcopy(default)
    with path.open(encoding='utf-8') as f:
        obj = json.load(f)
    if not isinstance(obj, dict):
        raise ValueError(f'Expected JSON object: {path.name}')
    return obj


def merge(base, patch):
    result = copy.deepcopy(base) if isinstance(base, dict) else {}
    for key, value in patch.items():
        if value is None:
            result.pop(key, None)
        elif isinstance(value, dict):
            result[key] = merge(result.get(key), value)
        else:
            result[key] = copy.deepcopy(value)
    return result


def difference(base, desired):
    patch = {key: None for key in base if key not in desired}
    for key, value in desired.items():
        if key not in base or base[key] != value:
            patch[key] = difference(base.get(key, {}), value) if isinstance(value, dict) and isinstance(base.get(key, {}), dict) else copy.deepcopy(value)
    return patch


def shared(obj, name):
    return {k: v for k, v in obj.items() if name != 'settings.json' or k not in MACHINE_KEYS}


def save(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix='.' + path.name, dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(obj, f, indent=2, ensure_ascii=False)
            f.write('\n')
        # Replace the symlink itself; never write through to the shared checkout.
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def sync(config, agent, capture=False, check=False):
    local = agent / 'local-config'
    state_path = local / '.last-applied.json'
    state = load(state_path, {})
    plans = []
    # Validate ALL inputs and live edits before writing anything. Never print values.
    for name in FILES:
        base = shared(load(config / name, {}), name)
        patch = load(local / name, {})
        live = load(agent / name)
        expected = state.get(name)
        desired = merge(base, patch)
        if live is not None:
            clean = shared(live, name)
            previous = shared(expected, name) if expected is not None else shared(desired, name)
            if clean != previous:
                if not capture:
                    raise ValueError(f'{name}: unrecorded local edits; use --capture-local to keep them locally (no files changed)')
                # Apply only edits since the last rendering, not the entire old
                # configuration: unrelated newer shared defaults must still flow.
                edits = difference(previous, clean)
                desired = merge(desired, edits)
                patch = difference(base, desired)
            for key in MACHINE_KEYS if name == 'settings.json' else ():
                if key in live:
                    desired[key] = live[key]
        plans.append((name, patch, live, desired))
    if check:
        print('Configuration inputs valid; no files changed')
        return
    backups = None
    for name, patch, live, desired in plans:
        target = agent / name
        if live != desired or target.is_symlink():
            if live is not None:
                if backups is None:
                    root = agent / 'backups'
                    root.mkdir(parents=True, exist_ok=True)
                    backups = Path(tempfile.mkdtemp(prefix='config-', dir=root))
                save(backups / name, live)
            save(target, desired)
        if capture and patch != load(local / name, {}):
            save(local / name, patch)
        state[name] = desired
    save(state_path, state)
    print('Settings, models and MCP composed; private overrides preserved')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('config', type=Path)
    parser.add_argument('agent', type=Path)
    parser.add_argument('--capture-local', action='store_true')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    try:
        sync(args.config, args.agent, args.capture_local, args.check)
    except (ValueError, OSError) as exc:
        # JSON decoding errors include positions, not configuration contents.
        print(f'Configuration sync refused: {exc}', file=__import__('sys').stderr)
        return 3
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
