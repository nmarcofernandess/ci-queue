import unittest
from backend.ci_queue_api.records import progress_summary


class ProgressTimingProjectionTest(unittest.TestCase):
    def test_projects_emitter_collector_and_unavailable(self):
        job = {
            "id": "job-1",
            "status": "failed",
            "progress": {
                "schema": 1,
                "updatedAt": "2026-09-17T00:00:00.000Z",
                "nodes": [
                    {
                        "id": "e0",
                        "parentId": None,
                        "kind": "gate",
                        "label": "Zero",
                        "status": "passed",
                        "durationMs": 0,
                        "durationSource": "emitter",
                    },
                    {
                        "id": "c1",
                        "parentId": None,
                        "kind": "gate",
                        "label": "Obs",
                        "status": "passed",
                        "durationMs": 1500,
                        "durationSource": "collector",
                    },
                    {
                        "id": "m1",
                        "parentId": None,
                        "kind": "gate",
                        "label": "Miss",
                        "status": "failed",
                        "durationUnavailableReason": "missing-start",
                    },
                    {
                        "id": "legacy",
                        "parentId": None,
                        "kind": "gate",
                        "label": "Legacy",
                        "status": "passed",
                        "durationMs": 1200,
                    },
                ],
            },
        }
        summary = progress_summary(job)["progressSummary"]
        self.assertTrue(summary["available"])
        by_id = {node["id"]: node for node in summary["nodes"]}
        self.assertEqual(by_id["e0"]["durationMs"], 0)
        self.assertEqual(by_id["e0"]["durationSource"], "emitter")
        self.assertEqual(by_id["c1"]["durationSource"], "collector")
        self.assertEqual(by_id["m1"]["durationUnavailableReason"], "missing-start")
        self.assertNotIn("durationSource", by_id["legacy"])
        self.assertEqual(by_id["legacy"]["durationMs"], 1200)

    def test_rejects_invalid_duration_source(self):
        job = {
            "id": "job-2",
            "status": "passed",
            "progress": {
                "schema": 1,
                "updatedAt": None,
                "nodes": [
                    {
                        "id": "bad",
                        "parentId": None,
                        "kind": "gate",
                        "label": "Bad",
                        "status": "passed",
                        "durationMs": 10,
                        "durationSource": "profiler",
                    }
                ],
            },
        }
        node = progress_summary(job)["progressSummary"]["nodes"][0]
        self.assertEqual(node["durationMs"], 10)
        self.assertNotIn("durationSource", node)


if __name__ == "__main__":
    unittest.main()
