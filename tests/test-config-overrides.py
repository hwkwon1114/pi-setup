"""Offline private-config fixtures: temporary directories only, no credentials/network."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('sync_config', ROOT / 'bin/sync-settings.py')
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


class ConfigTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='pi config ')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.config = self.root / 'repo/config'
        self.agent = self.root / 'agent'
        self.config.mkdir(parents=True)
        self.agent.mkdir()
        for name in sync.FILES:
            sync.save(self.config / name, {})
        sync.save(self.config / 'settings.json', {'theme': 'light', 'subagents': {'model': 'shared'}, 'packages': ['portable']})

    def run_sync(self, **kw):
        sync.sync(self.config, self.agent, **kw)

    def read(self, name='settings.json'):
        return sync.load(self.agent / name)

    def test_nested_arrays_deletions_and_os_paths(self):
        for shell in ['/bin/zsh', '/bin/bash', r'C:\Program Files\Git\bin\bash.exe']:
            sync.save(self.agent / 'local-config/settings.json', {'shellPath': shell, 'packages': ['local'], 'subagents': {'threads': 4}, 'theme': None})
            self.run_sync()
            self.assertEqual(self.read(), {'shellPath': shell, 'packages': ['local'], 'subagents': {'model': 'shared', 'threads': 4}})

    def test_shared_updates_local_wins_and_machine_keys(self):
        self.run_sync()
        live = self.read(); live['deviceId'] = 'fixture-device'
        sync.save(self.agent / 'settings.json', live)
        sync.save(self.agent / 'local-config/settings.json', {'shellPath': '/local/bash'})
        sync.save(self.config / 'settings.json', {'theme': 'dark', 'deviceId': 'never-shared'})
        self.run_sync()
        self.assertEqual(self.read(), {'theme': 'dark', 'shellPath': '/local/bash', 'deviceId': 'fixture-device'})

    def test_conflict_no_partial_writes_and_explicit_capture(self):
        self.run_sync()
        sync.save(self.config / 'settings.json', {'theme': 'new', 'newDefault': 42})
        sync.save(self.agent / 'mcp.json', {'mcpServers': {'local': {'command': '/private/tool'}}})
        before = (self.agent / 'settings.json').read_bytes()
        with self.assertRaises(ValueError): self.run_sync()
        self.assertEqual((self.agent / 'settings.json').read_bytes(), before)
        self.run_sync(capture=True)
        self.assertEqual(self.read()['newDefault'], 42)
        self.assertEqual(sync.load(self.agent / 'local-config/mcp.json'), self.read('mcp.json'))

    def test_capture_preserves_new_shared_defaults_and_nested_ui_edits(self):
        self.run_sync()
        live = self.read(); live['subagents']['threads'] = 3
        sync.save(self.agent / 'settings.json', live)
        base = sync.load(self.config / 'settings.json'); base['subagents']['model'] = 'new-shared'
        sync.save(self.config / 'settings.json', base)
        self.run_sync(capture=True)
        self.assertEqual(self.read()['subagents'], {'model': 'new-shared', 'threads': 3})
        self.assertEqual(sync.load(self.agent / 'local-config/settings.json'), {'subagents': {'threads': 3}})

    def test_symlink_detached_shared_file_unchanged(self):
        target = self.agent / 'settings.json'
        try: target.symlink_to(self.config / 'settings.json')
        except OSError: self.skipTest('symlinks unavailable')
        before = (self.config / 'settings.json').read_bytes()
        self.run_sync()
        self.assertFalse(target.is_symlink())
        self.assertEqual((self.config / 'settings.json').read_bytes(), before)
        self.assertTrue(list((self.agent / 'backups').glob('config-*/settings.json')))

    def test_check_and_malformed_override_do_not_write(self):
        self.run_sync(check=True)
        self.assertFalse((self.agent / 'settings.json').exists())
        sync.save(self.agent / 'local-config/mcp.json', {})
        (self.agent / 'local-config/mcp.json').write_text('[]')
        with self.assertRaises(ValueError): self.run_sync()
        self.assertFalse((self.agent / 'settings.json').exists())

    def test_fresh_migration_refuses_unknown_existing_settings(self):
        sync.save(self.agent / 'settings.json', {'shellPath': '/private/bash'})
        with self.assertRaises(ValueError): self.run_sync()
        self.run_sync(capture=True)
        self.assertEqual(self.read(), {'shellPath': '/private/bash'})
        self.assertNotIn('shellPath', sync.load(self.config / 'settings.json'))

    def test_export_never_copies_json_or_local_overrides(self):
        # Exercise real export in an isolated checkout, without replacing live resources.
        import shutil, subprocess, os
        repo = self.root / 'export-repo'
        shutil.copytree(ROOT / 'bin', repo / 'bin')
        shutil.copytree(self.config, repo / 'config')
        sync.save(self.agent / 'settings.json', {'shellPath': 'PRIVATE_SENTINEL'})
        sync.save(self.agent / 'mcp.json', {'env': {'key': 'PRIVATE_SENTINEL'}})
        before = {p.name: p.read_bytes() for p in (repo / 'config').iterdir()}
        subprocess.run(['bash', str(repo / 'bin/export.sh')], env={**os.environ, 'PI_CODING_AGENT_DIR': str(self.agent)}, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.assertEqual(before, {p.name: p.read_bytes() for p in (repo / 'config').iterdir()})


if __name__ == '__main__': unittest.main()
