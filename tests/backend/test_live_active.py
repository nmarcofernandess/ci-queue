import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from ci_queue_api.records import status_snapshot_all


class LiveActiveTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / "history").mkdir()
        (self.root / "jobs").mkdir()
        (self.root / "progress").mkdir()
        (self.root / "state").mkdir()

    def test_live_active_is_structural_and_bounded(self):
        job = {
            "id": "job-live-1",
            "projectId": "alpha",
            "projectName": "Alpha",
            "status": "running",
            "preset": "e2e",
            "branch": "dev",
            "headSha": "abc",
            "createdAt": "2026-09-20T12:00:00Z",
            "flags": {"progressEnabled": True},
        }
        progress = {
            "nodes": [
                {"id": "e2e", "label": "E2E", "status": "running", "kind": "stage"},
                {
                    "id": "playwright",
                    "parentId": "e2e",
                    "label": "Playwright",
                    "status": "running",
                    "kind": "stage",
                    "detail": {
                        "kind": "cases",
                        "completed": 3,
                        "total": 7,
                        "passed": 3,
                        "failed": 0,
                        "running": 0,
                        "pending": 4,
                        "skipped": 0,
                    },
                },
                {
                    "id": "case-a",
                    "parentId": "playwright",
                    "label": "deve salvar favorito",
                    "status": "running",
                    "kind": "case",
                },
                {
                    "id": "case-b",
                    "parentId": "playwright",
                    "label": "outro",
                    "status": "running",
                    "kind": "case",
                },
            ]
        }
        (self.root / "running.json").write_text(json.dumps(job))
        (self.root / "progress" / "job-live-1.json").write_text(json.dumps(progress))

        payload = status_snapshot_all(self.root, view="live")
        summary = payload["running"]["progressSummary"]
        self.assertTrue(summary["available"])
        self.assertIn("roots", summary)
        self.assertIn("active", summary)
        self.assertNotIn("nodes", summary)
        kinds = {node["kind"] for node in summary["active"]}
        self.assertTrue(kinds <= {"stage", "group", "suite"})
        self.assertFalse(any(node["kind"] == "case" for node in summary["active"]))
        self.assertTrue(any(node["id"] == "playwright" for node in summary["active"]))


if __name__ == "__main__":
    unittest.main()
