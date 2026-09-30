import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from ci_queue_api.records import read_executions, status_snapshot_all


class ReadProjectionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / "history").mkdir()
        (self.root / "jobs").mkdir()
        (self.root / "state").mkdir()
        for index in range(60):
            job = {
                "id": "job-%03d" % index,
                "projectId": "alpha",
                "status": "passed",
                "finishedAt": "2026-09-18T12:%02d:00Z" % (index % 60),
                "argv": ["secret"],
                "progress": {"nodes": [{"id": "root", "label": "Root", "status": "passed", "retryCount": 1}]},
                "flags": {"progressEnabled": True},
            }
            (self.root / "history" / (job["id"] + ".json")).write_text(json.dumps(job))

    def test_summary_pages_before_projecting_and_omits_private_or_tree_data(self):
        page = read_executions(self.root, "", scope="all", view="summary",
                               snapshot_before="2099-01-01T00:00:00Z")
        self.assertEqual(page["projection"], "summary")
        self.assertEqual(len(page["jobs"]), 50)
        self.assertTrue(page["hasMore"])
        self.assertTrue(all(job["hasRetries"] for job in page["jobs"]))
        self.assertTrue(all("progressSummary" not in job and "argv" not in job for job in page["jobs"]))

    def test_live_status_has_revision_without_terminal_history(self):
        payload = status_snapshot_all(self.root, view="live")
        self.assertEqual(payload["projection"], "live")
        self.assertNotIn("history", payload)
        self.assertNotIn("lastFailed", payload)
        self.assertEqual(len(payload["historyRevision"]), 24)

    def test_A09_has_retries_detected_in_descendant_nodes_and_preserved_in_projections(self):
        from ci_queue_api.records import public_job, public_job_summary, progress_summary
        job_with_nested_retry = {
            "id": "job-nested-retry",
            "projectId": "alpha",
            "status": "passed",
            "progress": {
                "nodes": [
                    {"id": "suite", "label": "Suite", "status": "passed", "retryCount": 0},
                    {"id": "case-1", "label": "Case 1", "parentId": "suite", "status": "passed", "retryCount": 2},
                ]
            },
        }
        summarized = progress_summary(job_with_nested_retry)
        pj = public_job(summarized)
        self.assertTrue(pj["hasRetries"])
        self.assertIn("progressSummary", pj)

        pjs = public_job_summary(summarized)
        self.assertTrue(pjs["hasRetries"])
        self.assertNotIn("progressSummary", pjs)

        # In live status when this job is running
        (self.root / "running.json").write_text(json.dumps(summarized))
        live_payload = status_snapshot_all(self.root, view="live")
        running = live_payload["running"]
        self.assertTrue(running["hasRetries"])
        self.assertNotIn("nodes", running["progressSummary"])


if __name__ == "__main__":
    unittest.main()
