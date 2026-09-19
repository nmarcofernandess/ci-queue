"""Public job projection: derived progressEnabled, unpublished flags."""

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from ci_queue_api.records import public_job


class PublicJobProgressEnabled(unittest.TestCase):
    def test_derives_progress_enabled_and_hides_flags(self):
        job = {
            "id": "t1",
            "preset": "check",
            "status": "passed",
            "argv": ["npm", "run", "check"],
            "flags": {"progressEnabled": True, "requireCleanTree": True},
        }
        projected = public_job(job)
        self.assertTrue(projected["progressEnabled"])
        self.assertNotIn("flags", projected)
        self.assertNotIn("argv", projected)

    def test_flags_progress_enabled_false_yields_public_false(self):
        projected = public_job({
            "id": "t2",
            "preset": "check",
            "flags": {"progressEnabled": False},
        })
        self.assertFalse(projected["progressEnabled"])
        self.assertNotIn("flags", projected)

    def test_missing_flags_yields_public_false(self):
        projected = public_job({"id": "t3", "preset": "check"})
        self.assertFalse(projected["progressEnabled"])
        self.assertNotIn("flags", projected)
        self.assertNotIn("argv", projected)


if __name__ == "__main__":
    unittest.main()
