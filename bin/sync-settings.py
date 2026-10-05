#!/usr/bin/env python3
"""Apply the repo's config/settings.json to a pi agent home.

settings.json cannot be a symlink: pi rewrites it in place with machine-local
bookkeeping (deviceId, lastChangelogVersion), which would dirty the repo.
This script copies the shared settings instead, keeping those machine keys.

  sync-settings.py REPO_SETTINGS LIVE_SETTINGS [--base FILE] [--force]

Without --force, live settings are replaced only when they hold no local
edits: they must equal --base (the previous repo version) or be absent.
Exit codes: 0 synced/unchanged, 3 skipped because of local edits.
"""
import json, os, shutil, sys, time

MACHINE_KEYS = ("deviceId", "lastChangelogVersion")


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def shared(settings):
    return {k: v for k, v in settings.items() if k not in MACHINE_KEYS}


def main(argv):
    args, base, force = [], None, False
    it = iter(argv)
    for a in it:
        if a == "--force":
            force = True
        elif a == "--base":
            base = next(it)
        else:
            args.append(a)
    if len(args) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    repo_path, live_path = args
    new = shared(load(repo_path))
    live = load(live_path) if os.path.exists(live_path) else None

    if live is not None and shared(live) == new:
        print("= settings.json (in sync)")
        return 0
    if live is not None and not force:
        prev = shared(load(base)) if base and os.path.exists(base) else None
        if shared(live) != prev:
            changed = sorted(set(shared(live)) ^ set(new) |
                             {k for k in new if k in live and live[k] != new[k]})
            print("! settings.json has local edits; not overwritten "
                  f"(differing keys: {', '.join(changed) or 'formatting'}).\n"
                  "  Export them (bin/export.sh) and commit, or apply the repo "
                  "version with: bin/sync-settings.sh --force", file=sys.stderr)
            return 3

    out = dict(new)
    for k in MACHINE_KEYS:
        if live and k in live:
            out[k] = live[k]
    if live is not None:
        bdir = os.path.join(os.path.dirname(live_path), "backups")
        os.makedirs(bdir, exist_ok=True)
        shutil.copy2(live_path, os.path.join(
            bdir, time.strftime("settings-%Y%m%d-%H%M%S.json")))
    tmp = live_path + ".sync-tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(json.dumps(out, indent=2) + "\n")
    os.replace(tmp, live_path)
    print("+ settings.json (synced from repo; machine keys kept)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
