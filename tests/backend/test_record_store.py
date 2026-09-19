import json
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


if __name__ == "__main__":
    unittest.main()
