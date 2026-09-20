import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from ci_queue_api.execution_observations import parse_stored_observation, to_observed_job
from ci_queue_api.history import canonical_green
from ci_queue_api.records import (
    _history_revision,
    lookup_execution,
    public_job,
    read_execution_history,
    read_executions,
    read_history,
)


def _write_observation(root: Path, fixture: dict, imported_at="2026-09-20T10:00:00.000Z"):
    """Persist a store-shaped observation using the TS hash via subprocess once.

    For unit tests we embed a precomputed valid document matching the fixture.
    """
    from ci_queue_api.execution_observations import _observation_id, _payload_sha256, _parse_iso

    input_obj = {
        "schemaVersion": 1,
        "kind": "ci-execution-observation",
        "executionId": fixture["executionId"],
        "projectId": fixture["projectId"],
        "projectName": fixture["projectName"],
        "recipe": fixture["recipe"],
        "executor": "direct",
        "status": fixture["status"],
        "startedAt": _parse_iso(fixture["startedAt"], "startedAt"),
        "finishedAt": _parse_iso(fixture["finishedAt"], "finishedAt"),
        "durationMs": fixture["durationMs"],
        "exitCode": fixture["exitCode"],
        "cwd": fixture["cwd"],
        "branch": fixture["branch"],
        "headSha": fixture["headSha"],
        "runtime": dict(fixture["runtime"]),
        "evidenceSha256": fixture["evidenceSha256"],
    }
    if "failureReason" in fixture:
        input_obj["failureReason"] = fixture["failureReason"]
    stored = {
        **input_obj,
        "id": _observation_id(input_obj["projectId"], input_obj["executionId"]),
        "importedAt": imported_at,
        "payloadSha256": _payload_sha256(input_obj),
    }
    directory = root / "observations"
    directory.mkdir(parents=True, exist_ok=True)
    (directory / (stored["id"] + ".json")).write_text(json.dumps(stored, indent=2) + "\n")
    return stored


class ExecutionObservationBackendTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / "history").mkdir()
        (self.root / "jobs").mkdir()
        (self.root / "state").mkdir()
        self.fixture = json.loads(
            (ROOT / "tests" / "fixtures" / "execution-observation-v1.json").read_text()
        )
        self.ticket = {
            "id": "ticket-native-1",
            "projectId": "fixture-project",
            "projectName": "Projeto de teste",
            "status": "passed",
            "preset": "check",
            "finishedAt": "2026-09-20T08:00:00.000Z",
            "createdAt": "2026-09-20T07:59:00.000Z",
            "branch": "dev",
            "headSha": "cccccccccccccccccccccccccccccccccccccccc",
            "cwd": "/tmp",
            "argv": ["npm", "run", "check"],
            "source": "queue",
        }
        (self.root / "history" / (self.ticket["id"] + ".json")).write_text(json.dumps(self.ticket))

    def test_union_appears_in_executions_but_not_read_history(self):
        before = json.dumps(self.ticket, sort_keys=True)
        stored = _write_observation(self.root, self.fixture)
        native = read_history(self.root)
        self.assertEqual(len(native), 1)
        self.assertEqual(json.dumps(native[0], sort_keys=True), before)

        page = read_executions(
            self.root,
            "fixture-project",
            snapshot_before="2099-01-01T00:00:00Z",
        )
        kinds = sorted(job.get("recordKind") or "legacy" for job in page["jobs"])
        self.assertIn("observed-execution", kinds)
        self.assertTrue(any(job["id"] == stored["id"] for job in page["jobs"]))
        self.assertTrue(any(job["id"] == "ticket-native-1" for job in page["jobs"]))

    def test_history_revision_changes_when_observation_arrives(self):
        before = _history_revision(self.root)
        _write_observation(self.root, self.fixture)
        after = _history_revision(self.root)
        self.assertNotEqual(before, after)
        self.assertEqual(after, _history_revision(self.root))

    def test_lookup_execution_and_log_unavailable_shape(self):
        stored = _write_observation(self.root, self.fixture)
        found = lookup_execution(self.root, stored["id"])
        self.assertEqual(found["recordKind"], "observed-execution")
        self.assertEqual(found["executionId"], self.fixture["executionId"])
        projected = public_job(found)
        self.assertEqual(projected["logAvailability"], "not-collected")
        self.assertEqual(projected["executor"], "direct")

    def test_observation_does_not_affect_canonical_green_or_preset_history(self):
        recipe = type("Recipe", (), {"argv": ["npm", "run", "ci:local:full"]})()
        dirty = {
            **self.fixture,
            "executionId": "20260920090000-fullfake",
            "recipe": "full",
            "status": "passed",
            "exitCode": 0,
        }
        _write_observation(self.root, dirty)
        history = read_history(self.root)
        self.assertEqual(len(history), 1)
        self.assertFalse(any(canonical_green(row, recipe) for row in history))
        # Unified history may include the fake full observation, but proof readers use read_history.
        unified = read_execution_history(self.root)
        self.assertTrue(any(row.get("preset") == "full" for row in unified))
        self.assertFalse(any(row.get("preset") == "full" for row in history))

    def test_project_filter_hides_foreign_observation(self):
        _write_observation(self.root, self.fixture)
        page = read_executions(
            self.root,
            "other-project",
            snapshot_before="2099-01-01T00:00:00Z",
        )
        self.assertEqual(page["jobs"], [])
        unified = read_execution_history(self.root)
        self.assertTrue(any(row.get("recordKind") == "observed-execution" for row in unified))


if __name__ == "__main__":
    unittest.main()
