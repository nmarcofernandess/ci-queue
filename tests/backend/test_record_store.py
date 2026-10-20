import json
import os
import tempfile
import unittest
import sys
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from ci_queue_api.record_store import RecordStore, SnapshotError


class RecordStoreTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        for index in range(3):
            (self.root / ("%s.json" % index)).write_text(json.dumps({"id": str(index)}))

    def test_hot_snapshot_opens_zero_bodies_and_delta_opens_one(self):
        store = RecordStore(self.root)
        store.snapshot()
        with patch("builtins.open", wraps=open) as opened:
            same = store.snapshot()
            self.assertEqual(opened.call_count, 0)
        (self.root / "1.json").write_text(json.dumps({"id": "changed"}))
        with patch("builtins.open", wraps=open) as opened:
            changed = store.snapshot()
            self.assertEqual(opened.call_count, 1)
        self.assertGreater(changed.generation, same.generation)

    def test_replacement_removal_and_corruption_change_generation(self):
        store = RecordStore(self.root)
        first = store.snapshot()
        (self.root / "0.json").unlink()
        (self.root / "2.json").write_text("{")
        second = store.snapshot()
        self.assertGreater(second.generation, first.generation)
        self.assertEqual(len(second.rows), 1)
        self.assertTrue(second.errors)
        with self.assertRaises(SnapshotError):
            store.snapshot(strict=True)

    def test_A05_transient_error_is_retried_and_recovered_without_metadata_change(self):
        store = RecordStore(self.root)
        first = store.snapshot()
        self.assertEqual(len(first.rows), 3)

        (self.root / "1.json").write_text(json.dumps({"id": "transient-update"}))
        real_open = open
        transient_active = True

        def failing_open(file, *args, **kwargs):
            if transient_active and "1.json" in str(file):
                raise OSError("transient disk error")
            return real_open(file, *args, **kwargs)

        with patch("builtins.open", side_effect=failing_open):
            second = store.snapshot()
            self.assertEqual(len(second.rows), 2)
            self.assertTrue(any("1.json" in err for err in second.errors))

        # Transient error has now resolved; 1.json was NOT modified on disk
        transient_active = False
        with patch("builtins.open", wraps=real_open) as open_spy:
            third = store.snapshot()
            # Only 1.json should be re-read; 0.json and 2.json must not be opened
            self.assertEqual(open_spy.call_count, 1)

        self.assertEqual(len(third.rows), 3)
        self.assertEqual(third.errors, ())
        self.assertGreater(third.generation, second.generation)

    def test_A06_entry_deletion_during_scandir_does_not_wipe_remaining_entries(self):
        store = RecordStore(self.root)
        real_scandir = os.scandir

        class MockDirEntry:
            def __init__(self, real, raise_on_stat=False):
                self._real = real
                self.name = real.name
                self.path = real.path
                self._raise = raise_on_stat

            def is_file(self, *args, **kwargs):
                return self._real.is_file(*args, **kwargs)

            def stat(self, *args, **kwargs):
                if self._raise:
                    raise FileNotFoundError("simulated race: file unlinked")
                return self._real.stat(*args, **kwargs)

        class MockScandirContext:
            def __init__(self, entries):
                self.entries = entries

            def __enter__(self):
                return iter(self.entries)

            def __exit__(self, *args):
                pass

        def racing_scandir(path):
            with real_scandir(path) as stream:
                real_entries = list(stream)
            return MockScandirContext([
                MockDirEntry(real_entries[0], raise_on_stat=True),
                MockDirEntry(real_entries[1]),
                MockDirEntry(real_entries[2]),
            ])

        with patch("os.scandir", side_effect=racing_scandir):
            snapshot = store.snapshot()
            # Must NOT be wiped to 0; remaining 2 entries must be preserved
            self.assertEqual(len(snapshot.rows), 2)

    def test_A07_snapshot_rows_are_deeply_immutable(self):
        (self.root / "nested.json").write_text(json.dumps({
            "id": "nested",
            "meta": {"author": "marco"},
            "tags": ["ci", "queue"],
            "progress": {"nodes": [{"id": "first"}]},
        }))
        store = RecordStore(self.root)
        snapshot = store.snapshot()
        row = next(r for r in snapshot.rows if r["id"] == "nested")

        with self.assertRaises(TypeError):
            row["id"] = "tampered"
        with self.assertRaises(TypeError):
            row["meta"]["author"] = "tampered"
        with self.assertRaises(TypeError):
            row["tags"].append("tampered")
        with self.assertRaises(TypeError):
            row["tags"][0] = "tampered"
        with self.assertRaises(TypeError):
            row |= {"status": "passed"}
        nodes = row["progress"]["nodes"]
        with self.assertRaises(TypeError):
            nodes += [{"id": "extra"}]
        with self.assertRaises(TypeError):
            nodes *= 2

        # Must be natively JSON serializable
        serialized = json.loads(json.dumps(row))
        self.assertEqual(serialized["id"], "nested")
        self.assertEqual(serialized["meta"]["author"], "marco")
        self.assertEqual(serialized["tags"], ["ci", "queue"])
        again = store.snapshot()
        self.assertEqual(again.generation, snapshot.generation)
        self.assertEqual(again.digests, snapshot.digests)

    def test_A06_stat_permission_error_is_coverage_not_silent_removal(self):
        import errno
        store = RecordStore(self.root)
        store.snapshot()
        real_scandir = os.scandir

        class MockDirEntry:
            def __init__(self, real):
                self._real = real
                self.name = real.name
                self.path = real.path

            def is_file(self, *args, **kwargs):
                return self._real.is_file(*args, **kwargs)

            def stat(self, *args, **kwargs):
                if self.name == "1.json":
                    raise PermissionError(errno.EACCES, "injected stat failure")
                return self._real.stat(*args, **kwargs)

        class MockScandirContext:
            def __init__(self, entries):
                self.entries = entries

            def __enter__(self):
                return iter(self.entries)

            def __exit__(self, *args):
                pass

        def failing_scandir(path):
            with real_scandir(path) as stream:
                real_entries = list(stream)
            return MockScandirContext([MockDirEntry(entry) for entry in real_entries])

        with patch("os.scandir", side_effect=failing_scandir):
            with self.assertRaises(SnapshotError):
                store.snapshot(strict=True)
            tolerant = store.snapshot()
            self.assertTrue(any("1.json" in err for err in tolerant.errors))
            ids = [row["id"] for row in tolerant.rows]
            self.assertNotIn("1", ids)
            self.assertIn("0", ids)
            self.assertIn("2", ids)
            self.assertEqual(len(list(self.root.glob("*.json"))), 3)

    def test_A08_read_executions_includes_corrupt_records_in_coverage(self):
        from ci_queue_api.records import read_executions
        state = self.root / "state_coverage"
        (state / "history").mkdir(parents=True)
        (state / "history" / "good.json").write_text(json.dumps({
            "id": "good",
            "projectId": "alpha",
            "status": "passed",
            "finishedAt": "2026-09-18T12:00:00Z",
        }))
        (state / "history" / "corrupted.json").write_text("{bad json syntax")
        page = read_executions(state, "alpha", snapshot_before="2099-01-01T00:00:00Z")
        self.assertEqual(len(page["jobs"]), 1)
        self.assertEqual(page["coverage"]["corruptRecords"], 1)
        self.assertEqual(page["coverage"]["unattributedRecords"], 0)


if __name__ == "__main__":
    unittest.main()


class SessionRuntimeProjectionTests(unittest.TestCase):
    def test_session_runtime_appears_after_job_terminal(self):
        from ci_queue_api.records import status_snapshot_all
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sessions = root / "runtime-sessions"
            sessions.mkdir(mode=0o700)
            record = sessions / "session-fixture.json"
            # A malformed private owner must remain visible and uncertain,
            # including when job occupancy has become empty.
            record.write_text(json.dumps({"token": "secret", "env": {"KEY": "private"}}))
            record.chmod(0o600)
            payload = status_snapshot_all(root)
            self.assertFalse(payload["globalOccupancy"])
            self.assertEqual(payload["sessionRuntimes"][0]["state"], "unknown")
            self.assertNotIn("secret", json.dumps(payload["sessionRuntimes"]))
            self.assertNotIn("private", json.dumps(payload["sessionRuntimes"]))
