"""Isolated size-cache and native-action boundaries; no host scans or windows."""
import queue
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
from ci_queue_api import worktrees, native_actions


class WorktreeContracts(unittest.TestCase):
    def test_timeout_preserves_last_size_without_duplicate_measurement(self):
        with tempfile.TemporaryDirectory() as directory:
            path = str(Path(directory).resolve())
            requests = queue.Queue()
            with patch.object(worktrees, '_sizes', {}), patch.object(worktrees, '_pending', set()), patch.object(worktrees, '_requests', requests), patch.object(worktrees, '_worker', object()):
                with patch.object(worktrees.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout='2048\tpath\n')):
                    worktrees._measure(path)
                self.assertEqual(worktrees.schedule_size(path)['bytes'], 2097152)
                self.assertEqual(requests.qsize(), 0)
                worktrees._sizes[path]['monotonic'] -= 61
                first = worktrees.schedule_size(path)
                second = worktrees.schedule_size(path)
                self.assertEqual(first['bytes'], 2097152)
                self.assertEqual(second['state'], 'measuring')
                self.assertEqual(requests.qsize(), 1)
                with patch.object(worktrees.subprocess, 'run', side_effect=subprocess.TimeoutExpired('du', 60)):
                    worktrees._measure(path)
                report = worktrees._size_report(path)
                self.assertEqual(report['bytes'], 2097152)
                self.assertIsNotNone(report['error'])
                self.assertNotIn(path, worktrees._pending)

    def test_native_open_resolves_inventory_and_rejects_unknown_or_removed_path(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            config = SimpleNamespace(project_id='example')
            runner = Mock(return_value=SimpleNamespace(returncode=0))
            inventory = [{'id': 'known', 'path': str(path)}]
            with patch.object(native_actions, 'available', return_value=True), patch.object(worktrees, 'discover', return_value=inventory):
                result = native_actions.reveal(path, config, 'worktree', 'known', runner=runner)
                self.assertTrue(result['ok'])
                self.assertEqual(runner.call_args.args[0], ['/usr/bin/open', str(path.resolve())])
                runner.reset_mock()
                with self.assertRaises(LookupError):
                    native_actions.reveal(path, config, 'worktree', '../unknown', runner=runner)
                runner.assert_not_called()
                inventory[0]['path'] = str(path / 'removed')
                with self.assertRaises(LookupError):
                    native_actions.reveal(path, config, 'worktree', 'known', runner=runner)
                runner.assert_not_called()

    def test_native_failure_does_not_report_success(self):
        runner = Mock(return_value=SimpleNamespace(returncode=1))
        with patch.object(native_actions, 'available', return_value=True), patch.object(native_actions, 'resolve_worktree', return_value=Path('/example')):
            with self.assertRaises(RuntimeError):
                native_actions.reveal(Path('/state'), object(), 'worktree', 'known', runner=runner)
