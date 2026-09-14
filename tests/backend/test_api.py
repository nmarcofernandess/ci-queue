"""Small isolated contract tests for the product-owned Python API."""

import json
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from ci_queue_api.analysis import read_analysis
from ci_queue_api.config import ConfigError, load_project_config
from ci_queue_api.dashboard_state import RevisionConflict, read_dashboard_state, write_dashboard_state
from ci_queue_api.diagnostics import MAX_EXPORT_BYTES, read_diagnostic, read_log_export
from ci_queue_api.history import build_preset_history
from ci_queue_api.records import invalidate_history_cache, read_executions, status_snapshot
from ci_queue_api.server import ApiContext, create_server
from ci_queue_api.worktrees import list_worktrees, worktree_view


class Fixture(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.state = self.root / "state-root"
        for directory in ("history", "jobs", "logs", "progress"):
            (self.state / directory).mkdir(parents=True, exist_ok=True)
        self.config_path = self.root / "ci-queue.json"
        self.config_path.write_text(json.dumps({
            "schemaVersion": 1,
            "project": {"id": "example", "name": "Example project"},
            "presets": {
                "smoke": {"argv": ["npm", "run", "smoke"]},
                "full": {"argv": ["npm", "run", "full"]},
            },
        }), encoding="utf-8")
        self.config = load_project_config(self.config_path)
        invalidate_history_cache()
        self.addCleanup(invalidate_history_cache)

    def job(self, ident, **overrides):
        base = {
            "id": ident,
            "projectId": "example",
            "projectName": "Example project",
            "preset": "smoke",
            "argv": ["npm", "run", "smoke"],
            "extraArgs": [],
            "status": "passed",
            "exitCode": 0,
            "createdAt": "2026-09-13T10:00:00Z",
            "startedAt": "2026-09-13T10:00:01Z",
            "finishedAt": "2026-09-13T10:01:01Z",
            "durationMs": 60000,
            "branch": "main",
            "headSha": "a" * 40,
        }
        base.update(overrides)
        (self.state / "history" / (ident + ".json")).write_text(json.dumps(base), encoding="utf-8")
        return base


class ConfigTests(Fixture):
    def test_state_root_is_not_required_or_read_from_project_config(self):
        self.assertEqual(self.config.project_id, "example")
        self.assertEqual(self.config.presets["smoke"]["argv"], ["npm", "run", "smoke"])
        self.assertFalse(hasattr(self.config, "state_root"))
        public = self.config.public()
        self.assertNotIn("stateRoot", public)
        self.assertNotIn("path", public["repository"])

    def test_rejects_missing_identity_or_recipe(self):
        self.config_path.write_text(json.dumps({"schemaVersion": 1, "presets": {}}), encoding="utf-8")
        with self.assertRaises(ConfigError):
            load_project_config(self.config_path)
        self.config_path.write_text(json.dumps({"project": {"id": "ok", "name": "ok"}, "presets": {"bad": {"argv": []}}}), encoding="utf-8")
        with self.assertRaises(ConfigError):
            load_project_config(self.config_path)


class HistoryAndAnalysisTests(Fixture):
    def test_project_isolation_canonical_green_and_terminal_cursor(self):
        self.job("green", finishedAt="2026-09-13T10:01:01Z")
        self.job("custom", finishedAt="2026-09-13T10:02:01Z", extraArgs=["--filter=x"])
        self.job("foreign", projectId="other", finishedAt="2026-09-13T10:03:01Z")
        self.job("legacy", projectId=None, finishedAt="2026-09-13T10:04:01Z")
        history = build_preset_history(self.state, self.config)
        smoke = next(item for item in history["presets"] if item["preset"] == "smoke")
        self.assertEqual(smoke["lastGreenCanonical"]["ticketId"], "green")
        self.assertEqual(smoke["lastRun"]["ticketId"], "custom")
        self.assertEqual(history["coverage"]["unattributedRecords"], 1)
        first = read_executions(self.state, "example", snapshot_before="2026-09-14T00:00:00Z")
        self.assertEqual([item["id"] for item in first["jobs"]], ["custom", "green"])
        self.assertFalse(first["hasMore"])
        self.assertNotIn("argv", first["jobs"][0])

    def test_analysis_keeps_all_retained_rows_and_reports_failure_time(self):
        for index in range(230):
            self.job("p%03d" % index, finishedAt="2026-09-13T10:%02d:00Z" % (index % 60))
        self.job("failed", status="failed", exitCode=1, durationMs=30000)
        self.job("interrupted", status="interrupted", exitCode=None, durationMs=None)
        result = read_analysis(self.state, self.config, "2026-09-13T00:00:00Z", "2026-09-14T00:00:00Z")
        row = next(item for item in result["presets"] if item["preset"] == "smoke")
        self.assertEqual(result["total"], 232)
        self.assertEqual(row["passed"], 230)
        self.assertEqual(row["duration"]["count"], 230)
        self.assertEqual(row["failedDurationMs"], 30000)
        self.assertEqual(row["failedDurationMissing"], 1)
        self.assertEqual(result["problemTotal"], 2)

    def test_status_keeps_global_occupancy_but_project_history_scoped(self):
        self.job("old")
        (self.state / "running.json").write_text(json.dumps({
            "id": "other-running", "projectId": "other", "preset": "test", "status": "running"
        }), encoding="utf-8")
        payload = status_snapshot(self.state, "example", "Example project")
        self.assertTrue(payload["globalOccupancy"])
        self.assertEqual(payload["running"]["projectId"], "other")
        self.assertEqual([item["id"] for item in payload["history"]], ["old"])


class StateAndDiagnosticTests(Fixture):
    def test_meta_notes_revision_and_no_approval_ledger(self):
        state = write_dashboard_state(self.state, self.config, {
            "revision": 0, "action": "save-meta",
            "meta": {"name": "Meta main", "description": "", "headSha": "a" * 40,
                     "presets": ["smoke", "future"]},
        })
        self.assertEqual(state["revision"], 1)
        self.assertEqual([item["status"] for item in state["meta"]["checks"]], ["pending", "recipe-missing"])
        state = write_dashboard_state(self.state, self.config, {
            "revision": 1, "action": "save-note", "note": {"title": "Lembrar", "text": "manual"},
        })
        self.assertEqual(len(state["notes"]), 1)
        self.assertFalse((self.state / "state" / "validation-plan.json").exists())
        with self.assertRaises(RevisionConflict):
            write_dashboard_state(self.state, self.config, {"revision": 1, "action": "remove-meta"})
        self.assertEqual(read_dashboard_state(self.state, self.config)["notes"][0]["title"], "Lembrar")

    def test_log_is_scoped_redacted_and_bounded(self):
        self.job("private")
        (self.state / "logs" / "private.log").write_text("token=super-secret\nall good\n", encoding="utf-8")
        diagnostic = read_diagnostic(self.state, self.config, "private")
        self.assertTrue(diagnostic["available"])
        exported = read_log_export(self.state, self.config, "private")
        self.assertIn("[REDACTED]", exported["content"])
        self.assertNotIn("super-secret", exported["content"])
        self.job("foreign", projectId="other")
        (self.state / "logs" / "foreign.log").write_text("secret=x", encoding="utf-8")
        self.assertFalse(read_diagnostic(self.state, self.config, "foreign")["available"])

    def test_export_declares_truncation_for_a_large_log(self):
        self.job("large")
        (self.state / "logs" / "large.log").write_bytes(b"a" * (MAX_EXPORT_BYTES + 16))
        exported = read_log_export(self.state, self.config, "large")
        self.assertFalse(exported["coverage"]["complete"])
        self.assertEqual(exported["coverage"]["preserved"], "head-and-tail")
        self.assertLessEqual(exported["coverage"]["capturedBytes"], MAX_EXPORT_BYTES)


class WorktreeTests(Fixture):
    def test_inventory_uses_explicit_repository_and_measures_only_detail(self):
        repo = self.root / "repo"
        subprocess.run(["git", "init", str(repo)], check=True, capture_output=True)
        subprocess.run(["git", "-C", str(repo), "config", "user.name", "test"], check=True)
        subprocess.run(["git", "-C", str(repo), "config", "user.email", "test@example.invalid"], check=True)
        (repo / "readme.txt").write_text("x", encoding="utf-8")
        subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
        subprocess.run(["git", "-C", str(repo), "commit", "-m", "initial"], check=True, capture_output=True)
        self.config_path.write_text(json.dumps({
            "schemaVersion": 1, "project": {"id": "example", "name": "Example project"},
            "repository": {"path": "repo", "baseRef": "HEAD"},
            "presets": {"smoke": {"argv": ["npm", "run", "smoke"]}},
        }), encoding="utf-8")
        config = load_project_config(self.config_path)
        report = list_worktrees(config)
        self.assertEqual(len(report["worktrees"]), 1)
        self.assertEqual(report["worktrees"][0]["size"]["state"], "unmeasured")
        detail = worktree_view(config, report["worktrees"][0]["id"])
        self.assertIn(detail["size"]["state"], {"measuring", "ready"})


class HttpContractTests(Fixture):
    def setUp(self):
        super().setUp()
        self.server = create_server(ApiContext(self.config, self.state, None, "csrf-test"), port=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.thread.join, 1)
        self.base = "http://127.0.0.1:%s" % self.server.server_address[1]

    def request(self, path, data=None, headers=None):
        request = Request(self.base + path, data=data, headers=headers or {}, method="POST" if data is not None else "GET")
        return urlopen(request, timeout=3)

    def test_http_exposes_api_and_requires_real_mutation_session(self):
        with self.request("/api/config") as response:
            config = json.loads(response.read())
        self.assertEqual(config["project"]["id"], "example")
        body = json.dumps({"revision": 0, "action": "save-note", "note": {"title": "a", "text": "b"}}).encode()
        with self.assertRaises(HTTPError) as rejected:
            self.request("/api/dashboard-state", body, {"Content-Type": "application/json"})
        self.assertEqual(rejected.exception.code, 403)
        headers = {"Content-Type": "application/json", "X-CI-CSRF": "csrf-test", "Origin": self.base}
        with self.request("/api/dashboard-state", body, headers) as response:
            state = json.loads(response.read())
        self.assertEqual(state["notes"][0]["title"], "a")

    def test_remote_slots_never_fetches_from_the_browser(self):
        with self.assertRaises(HTTPError) as rejected:
            self.request("/api/remote-slots?refresh=1")
        self.assertEqual(rejected.exception.code, 400)

    def test_unknown_api_is_not_a_spa_route(self):
        with self.assertRaises(HTTPError) as rejected:
            self.request("/api/not-a-route")
        self.assertEqual(rejected.exception.code, 404)


if __name__ == "__main__":
    unittest.main()
