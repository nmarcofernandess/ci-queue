"""Consumer-owned informational records, with no implicit execution or closure."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from ci_queue_api.config import load_project_config
from ci_queue_api.dashboard_state import read_dashboard_state, read_dashboard_state_all
from ci_queue_api.project_context import resolve_project
from ci_queue_api.projects import bootstrap_registry, read_registry
from ci_queue_api.validation_record import read_consumer_validations, requirement_fingerprint


class ValidationRecordTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        self.state = self.root / "state"
        self.path = self.repo / "validations.json"
        self.catalog = self.repo / "ci-queue.json"
        self.config_raw = {
            "schemaVersion": 1, "project": {"id": "fixture", "name": "Fixture"},
            "repository": {"path": str(self.repo)},
            "presets": {"full": {"argv": ["must-never-be-executed"]}},
            "validationRecord": "validations.json",
        }
        self.catalog.write_text(json.dumps(self.config_raw))
        self.config = load_project_config(self.catalog)
        self.item = {
            "id": "sample", "preset": "full", "headSha": "a" * 40,
            "scope": "escopo ação", "reason": "Não solicitado.",
            "createdAt": "2026-10-26T09:00:00Z", "pr": 42,
        }
        self.record = {"kind": "ci-queue-validations", "schemaVersion": 1,
                       "projectId": "fixture", "requirements": [self.item]}

    def write(self):
        self.path.write_text(json.dumps(self.record, ensure_ascii=False), encoding="utf-8")

    def dashboard(self):
        return read_dashboard_state(self.state, self.config)

    def test_missing_empty_invalid_and_status_never_write(self):
        self.assertEqual(self.dashboard()["pendingSource"]["status"], "missing")
        self.assertFalse(self.path.exists())
        self.assertFalse(self.state.exists())
        self.record["requirements"] = []
        self.write()
        before = self.path.read_bytes()
        state = self.dashboard()
        self.assertEqual(state["pendingSource"]["status"], "ready")
        self.assertEqual(state["pending"], [])
        self.assertIsNone(state["pendingError"])
        self.assertEqual(self.path.read_bytes(), before)
        for malformed in ("{broken", "null", '{"kind":"ci-queue-validations","schemaVersion":1,"projectId":"wrong","requirements":[]}'):
            self.path.write_text(malformed)
            self.assertEqual(self.dashboard()["pendingSource"]["status"], "invalid")
            self.assertEqual(self.path.read_text(), malformed)
        self.assertFalse(self.state.exists())

    def test_opt_in_ignores_local_legacy_plan_history_and_greens(self):
        self.write()
        with mock.patch("ci_queue_api.dashboard_state.read_pending_advisories", side_effect=AssertionError("legacy source consulted")):
            state = self.dashboard()
        self.assertEqual([item["id"] for item in state["pending"]], ["sample"])
        self.assertIsNone(state["pending"][0]["latestTicketId"])
        self.assertFalse(self.state.exists())

    def test_old_resolution_cannot_hide_changed_revision_or_scope(self):
        digest = requirement_fingerprint(self.item)
        self.item["resolution"] = {"fingerprint": digest, "headSha": "a" * 40,
                                   "scope": self.item["scope"], "evidence": "ticket old",
                                   "createdAt": "2026-10-26T10:00:00Z"}
        self.write()
        self.assertEqual(self.dashboard()["pending"], [])
        self.item["headSha"] = "b" * 40
        self.write()
        self.assertEqual(len(self.dashboard()["pending"]), 1)
        self.item["headSha"] = "a" * 40
        self.item["scope"] = "nova seleção"
        self.write()
        self.assertEqual(len(self.dashboard()["pending"]), 1)

    def test_duplicate_reasons_and_same_pr_remain_separate(self):
        self.record["requirements"].append({**self.item, "id": "new", "headSha": "b" * 40})
        self.write()
        self.assertEqual(len(self.dashboard()["pending"]), 2)
        self.record["requirements"][1]["id"] = "sample"
        self.write()
        self.assertEqual(self.dashboard()["pendingSource"]["status"], "invalid")

    def test_node_and_python_use_the_same_fingerprint_and_closed_record(self):
        self.write()
        script = ROOT / "plugins/ci-queue/scripts/validation-record.mjs"
        listed = json.loads(subprocess.check_output(["node", str(script), "list", "--cwd", str(self.repo)]))
        digest = listed["result"]["pending"][0]["fingerprint"]
        self.assertEqual(digest, requirement_fingerprint(self.item))
        subprocess.run(["node", str(script), "resolve", "--cwd", str(self.repo),
                        "--id", "sample", "--expected", digest, "--head-sha", "a" * 40,
                        "--scope", self.item["scope"], "--evidence", "real ticket"], check=True, capture_output=True)
        self.assertEqual(self.dashboard()["pending"], [])

    def test_invalid_source_path_is_only_an_observability_error(self):
        for path in ("../escape.json", "/tmp/escape.json", {"command": "do not execute"}):
            self.config_raw["validationRecord"] = path
            self.catalog.write_text(json.dumps(self.config_raw))
            config = load_project_config(self.catalog)
            self.assertEqual(read_dashboard_state(self.state, config)["pendingSource"]["status"], "invalid")
            self.assertEqual(config.presets["full"]["argv"], ["must-never-be-executed"])

    def test_principal_source_survives_registry_fallback_and_restart(self):
        def git(*args):
            return subprocess.run(["git", "-C", str(self.repo), *args], check=True, capture_output=True)
        self.write()
        git("init", "-b", "main")
        git("config", "user.name", "Fixture")
        git("config", "user.email", "fixture@example.invalid")
        git("add", ".")
        git("commit", "-m", "initial")
        lane = self.root / "lane"
        git("worktree", "add", "-b", "lane", str(lane))
        lane_catalog = lane / "ci-queue.json"
        lane_catalog.write_text(json.dumps({**self.config_raw, "repository": {"path": str(lane)}}))
        (lane / "validations.json").write_text(json.dumps({**self.record, "requirements": []}))
        registry = bootstrap_registry(self.state, self.catalog)
        project = resolve_project("fixture", registry)
        self.assertEqual(len(read_dashboard_state(self.state, project.config, project=project)["pending"]), 1)
        self.assertEqual(len(read_dashboard_state_all(self.state, [project])["projects"][0]["pending"]), 1)
        # Catalog missing on principal; the legacy resolver can find the lane.
        self.catalog.rename(self.repo / "saved-catalog.json")
        registry = bootstrap_registry(self.state, lane_catalog)
        project = resolve_project("fixture", registry)
        self.assertIsNotNone(project.config)
        pending, error, source = read_consumer_validations(project.config, project)
        self.assertEqual(pending, [])
        self.assertEqual(source["status"], "unavailable")
        self.assertIn("nenhuma outra worktree", error)
        pinned = read_registry(self.state)["projects"]["fixture"]["validationSource"]
        self.assertEqual(Path(pinned["configPath"]).resolve(), self.catalog.resolve())
        self.assertEqual(json.loads((lane / "validations.json").read_text())["requirements"], [])


if __name__ == "__main__":
    unittest.main()
