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

    def test_pick_returns_posix_path_and_treats_cancel_as_cancel(self):
        runner = Mock(return_value=SimpleNamespace(returncode=0, stdout='/Users/me/repo/\n', stderr=''))
        with patch.object(native_actions, 'pick_available', return_value=True):
            self.assertEqual(
                native_actions.pick_local_path('directory', runner=runner)['path'],
                '/Users/me/repo',
            )
            runner.assert_called_once()
            self.assertEqual(runner.call_args.args[0][0], '/usr/bin/osascript')
            cancelled = Mock(return_value=SimpleNamespace(returncode=1, stdout='', stderr='User canceled.\n'))
            with self.assertRaises(native_actions.PickCancelled):
                native_actions.pick_local_path('directory', runner=cancelled)

    def test_A12_single_flight_coalesces_concurrent_misses(self):
        import threading
        import time

        source = SimpleNamespace(
            repository_path="/fake/repo",
            base_ref="main",
            git_common_dir=None,
            entry_revision=1,
        )
        discover_calls = 0
        started = threading.Event()
        proceed = threading.Event()

        def slow_discover(src):
            nonlocal discover_calls
            discover_calls += 1
            started.set()
            proceed.wait(timeout=2.0)
            return [{"id": "wt-1", "path": "/fake/repo", "headSha": "abc"}]

        with patch.object(worktrees, '_inventories', {}), patch.object(worktrees, '_in_flight_inventories', {}):
            with patch.object(worktrees, 'discover', side_effect=slow_discover), patch.object(worktrees, '_git', return_value=""):
                results = []

                def worker():
                    results.append(worktrees.list_worktrees(source))

                t1 = threading.Thread(target=worker)
                t2 = threading.Thread(target=worker)
                t1.start()
                started.wait(timeout=2.0)
                t2.start()
                time.sleep(0.05)
                proceed.set()
                t1.join()
                t2.join()

                self.assertEqual(discover_calls, 1)
                self.assertEqual(len(results), 2)
                self.assertEqual(results[0]["worktrees"][0]["id"], "wt-1")
                self.assertEqual(results[1]["worktrees"][0]["id"], "wt-1")

    def test_A12_obsolete_revisions_evicted(self):
        with patch.object(worktrees, '_inventories', {}), patch.object(worktrees, '_in_flight_inventories', {}):
            with patch.object(worktrees, 'discover', return_value=[]), patch.object(worktrees, '_git', return_value=""):
                for rev in range(1, 302):
                    src = SimpleNamespace(
                        repository_path="/fake/repo",
                        base_ref="main",
                        git_common_dir=None,
                        entry_revision=rev,
                    )
                    worktrees.list_worktrees(src)

                # Exactly 1 revision must be retained for this repo, not 301
                repo_keys = [k for k in worktrees._inventories if k[0] == "/fake/repo"]
                self.assertEqual(len(repo_keys), 1)
                self.assertEqual(repo_keys[0][3], 301)
