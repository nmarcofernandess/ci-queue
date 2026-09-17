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

    def test_drops_contradictory_reason_and_ignores_unhashable_enums(self):
        job = {
            "id": "job-3",
            "status": "passed",
            "progress": {
                "schema": 1,
                "updatedAt": "2026-09-17T00:00:00.000Z",
                "nodes": [
                    {
                        "id": "both",
                        "parentId": None,
                        "kind": "gate",
                        "label": "Both",
                        "status": "passed",
                        "durationMs": 40,
                        "durationSource": "emitter",
                        "durationUnavailableReason": "missing-end",
                    },
                    {
                        "id": "bad-source",
                        "parentId": None,
                        "kind": "gate",
                        "label": "List source",
                        "status": "passed",
                        "durationMs": 10,
                        "durationSource": ["collector"],
                    },
                    {
                        "id": "bad-reason",
                        "parentId": None,
                        "kind": "gate",
                        "label": "Dict reason",
                        "status": "failed",
                        "durationUnavailableReason": {"x": 1},
                    },
                    {
                        "id": "open",
                        "parentId": None,
                        "kind": "gate",
                        "label": "Open",
                        "status": "running",
                        "durationUnavailableReason": "missing-end",
                    },
                ],
            },
        }
        summary = progress_summary(job)["progressSummary"]
        self.assertTrue(summary["available"])
        by_id = {node["id"]: node for node in summary["nodes"]}
        self.assertEqual(by_id["both"]["durationMs"], 40)
        self.assertEqual(by_id["both"]["durationSource"], "emitter")
        self.assertNotIn("durationUnavailableReason", by_id["both"])
        self.assertEqual(by_id["bad-source"]["durationMs"], 10)
        self.assertNotIn("durationSource", by_id["bad-source"])
        self.assertNotIn("durationUnavailableReason", by_id["bad-reason"])
        self.assertEqual(by_id["open"]["durationUnavailableReason"], "missing-end")

    def test_invalid_status_type_does_not_typeerror(self):
        job = {
            "id": "job-4",
            "status": "passed",
            "progress": {
                "schema": 1,
                "updatedAt": None,
                "nodes": [
                    {
                        "id": "bad-status",
                        "parentId": None,
                        "kind": "gate",
                        "label": "Bad",
                        "status": ["passed"],
                    }
                ],
            },
        }
        summary = progress_summary(job)["progressSummary"]
        self.assertFalse(summary["available"])
        self.assertEqual(summary["reason"], "invalid-hierarchy")


    def test_history_file_roundtrip_tuple_parity(self):
        """Same duration tuple from on-disk history through progress_summary (E4/R06 slice)."""
        import json
        from pathlib import Path
        import tempfile
        from backend.ci_queue_api.records import invalidate_history_cache, lookup_job, progress_summary

        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name)
        history = root / "history"
        history.mkdir(parents=True)
        job = {
            "id": "20260917123000-bbbbbbbb",
            "projectId": "example",
            "preset": "smoke",
            "status": "passed",
            "createdAt": "2026-09-17T12:30:00Z",
            "finishedAt": "2026-09-17T12:30:01Z",
            "exitCode": 0,
            "cwd": str(root),
            "branch": "main",
            "headSha": "b" * 40,
            "command": "node",
            "logPath": str(root / "log.txt"),
            "progress": {
                "schema": 1,
                "updatedAt": "2026-09-17T12:30:01Z",
                "nodes": [
                    {
                        "id": "g1",
                        "label": "Gate",
                        "status": "passed",
                        "kind": "gate",
                        "durationMs": 123,
                        "durationSource": "emitter",
                    },
                    {
                        "id": "artifacts",
                        "label": "Artefatos",
                        "status": "passed",
                        "kind": "artifact",
                        "durationMs": 5,
                        "durationSource": "collector",
                    },
                ],
            },
        }
        (history / f"{job['id']}.json").write_text(json.dumps(job), encoding="utf-8")
        invalidate_history_cache()
        found = lookup_job(str(root), job["id"], project_id="example")
        projected = progress_summary(found)["progressSummary"]
        self.assertTrue(projected["available"])
        by_id = {n["id"]: n for n in projected["nodes"]}
        self.assertEqual(
            (by_id["g1"]["durationMs"], by_id["g1"]["durationSource"]),
            (123, "emitter"),
        )
        self.assertEqual(
            (by_id["artifacts"]["durationMs"], by_id["artifacts"]["durationSource"]),
            (5, "collector"),
        )



if __name__ == "__main__":
    unittest.main()
