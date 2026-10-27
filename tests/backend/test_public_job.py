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

    def test_invalid_source_is_unknown_in_public_and_ticket_projections(self):
        from ci_queue_api.records import ticket_history_projection
        for source in ([], {}, 17, True, ""):
            with self.subTest(source=source):
                job = {"id": "bad-source", "source": source}
                self.assertNotIn("executor", public_job(job))
                self.assertEqual(ticket_history_projection(job)["executor"], "unknown")


class PublicJobPause(unittest.TestCase):
    def test_projects_the_last_window_and_keeps_frozen_pids_local(self):
        projected = public_job({
            "id": "t4",
            "status": "running",
            "pause": {
                "schemaVersion": 1,
                "state": "paused",
                "pausedMsTotal": 1500,
                "frozen": [{"pid": 4242, "startedAt": "Mon Oct 26 22:15:47 2026"}],
                "windows": [
                    {"pausedAt": "2026-10-26T10:00:00Z", "source": "manual", "reason": "primeira", "resumedAt": "2026-10-26T10:00:01.500Z", "resumedBy": "manual"},
                    {"pausedAt": "2026-10-26T10:05:00Z", "source": "auto", "reason": "disco abaixo de 2.0 GiB"},
                ],
            },
        })
        self.assertEqual(projected["pause"], {
            "state": "paused",
            "pausedMsTotal": 1500,
            "windows": 2,
            "pausedAt": "2026-10-26T10:05:00Z",
            "reason": "disco abaixo de 2.0 GiB",
            "source": "auto",
        })
        self.assertNotIn("frozen", projected["pause"])

    def test_ignores_an_unreadable_pause(self):
        for pause in (None, [], {"state": "stopped"}, "paused"):
            with self.subTest(pause=pause):
                self.assertNotIn("pause", public_job({"id": "t5", "pause": pause}))


if __name__ == "__main__":
    unittest.main()
