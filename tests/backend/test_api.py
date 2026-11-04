"""Small isolated contract tests for the product-owned Python API."""

import json
import hashlib
import subprocess
import sys
import tempfile
import threading
import unittest
from dataclasses import replace
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest import mock
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from ci_queue_api.analysis import read_analysis
from ci_queue_api.config import ConfigError, load_project_config
from ci_queue_api.dashboard_state import (
    RevisionConflict,
    read_dashboard_state,
    read_dashboard_state_all,
    write_dashboard_state,
)
from ci_queue_api.diagnostics import MAX_EXPORT_BYTES, read_diagnostic, read_log_export, read_log_slice
from ci_queue_api.history import build_preset_history, read_remote_slots
from ci_queue_api.records import (
    RecordError,
    invalidate_history_cache,
    lookup_job,
    read_executions,
    status_snapshot,
    status_snapshot_all,
    status_snapshot_unassigned,
    progress_summary,
)
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

    def remote_payload(self, **overrides):
        payload = {
            "schema": 1,
            "preset": "smoke",
            "projectId": "example",
            "projectIdSource": "ticket",
            "headSha": "a" * 40,
            "baseSha": "b" * 40,
            "branch": "main",
            "ticketId": "remote-ticket",
            "finishedAt": "2026-09-13T10:01:01Z",
            "durationMs": 60000,
            "exitCode": 0,
            "ancestorOfBase": True,
            "publishedAt": "2026-09-13T10:01:10Z",
            "aggregatorSchema": 1,
        }
        payload.update(overrides)
        return payload

    def remote_slot(self, payload=None, **overrides):
        payload = payload or self.remote_payload()
        slot = {
            "preset": payload["preset"],
            "state": "publicado",
            "ref": "refs/ci/last-green/" + payload["preset"],
            "objectSha": "c" * 40,
            "commitSha": payload["headSha"],
            "annotated": True,
            "payload": payload,
            "publishedAt": payload["publishedAt"],
            "ageDays": 0,
        }
        slot.update(overrides)
        return slot

    def remote_report(self, slots, **overrides):
        report = {
            "slotSchema": 1,
            "generatedAt": "2026-09-13T10:01:20Z",
            "remote": "origin",
            "namespace": "refs/ci/last-green",
            "source": "local-mirror",
            "reachable": True,
            "catalog": {"resolved": True, "declaredCount": 2, "projectId": "example"},
            "slots": slots,
            "totals": {"slots": len(slots), "declaredWithoutSlot": 0, "orphan": 0, "unreadable": 0},
        }
        report.update(overrides)
        return report

    def write_remote_mirror(self, value):
        path = self.root / "remote-slots.json"
        path.write_text(json.dumps(value), encoding="utf-8")
        return path


class TicketIdentityTests(Fixture):
    def test_admitted_ids_resolve_ticket_logs_and_diagnostic(self):
        for ident in ("A", "ticket.2026_retry-1", "Z" + "._-" * 42 + "9"):
            with self.subTest(ident=ident):
                job = self.job(ident)
                content = "output for " + ident + "\n"
                (self.state / "logs" / (ident + ".log")).write_text(content, encoding="utf-8")
                for source in ("history", "jobs", "running"):
                    with self.subTest(source=source):
                        path = (self.state / "running.json" if source == "running" else
                                self.state / source / (ident + ".json"))
                        path.write_text(json.dumps(job), encoding="utf-8")
                        self.assertEqual(lookup_job(self.state, ident)["id"], ident)
                        self.assertEqual(read_log_slice(self.state, self.config, ident)["content"], content)
                        self.assertEqual(read_log_export(self.state, self.config, ident)["content"], content)
                        diagnostic = read_diagnostic(self.state, self.config, ident)
                        self.assertTrue(diagnostic["available"])
                        self.assertEqual(diagnostic["ticket"]["id"], ident)
                        path.unlink()

    def test_invalid_ids_are_rejected_by_ticket_log_and_diagnostic_readers(self):
        readers = (
            lambda ident: lookup_job(self.state, ident),
            lambda ident: read_log_slice(self.state, self.config, ident),
            lambda ident: read_log_export(self.state, self.config, ident),
            lambda ident: read_diagnostic(self.state, self.config, ident),
        )
        for ident in (None, 42, "", ".hidden", "_hidden", "-hidden", "a" * 129,
                      "../escape", "ticket/../escape", "/absolute", "..\\escape",
                      "%2e%2e", "with space", "with\nnewline", "ação"):
            for index, reader in enumerate(readers):
                with self.subTest(ident=ident, reader=index):
                    with self.assertRaisesRegex(RecordError, "jobId inválido"):
                        reader(ident)


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
        self.assertNotIn("problems", result)
        self.assertNotIn("problemTotal", result)

    def test_analysis_keeps_statistics_without_duplicating_failed_jobs(self):
        for index in range(51):
            self.job("failed-%03d" % index, status="failed", exitCode=1,
                     finishedAt="2026-09-13T10:%02d:00Z" % (index % 60))

        first = read_analysis(self.state, self.config,
                              "2026-09-13T00:00:00Z", "2026-09-14T00:00:00Z")
        row = next(item for item in first["presets"] if item["preset"] == "smoke")
        self.assertEqual(row["failed"], 51)
        self.assertNotIn("problems", first)
        self.assertNotIn("nextOffset", first)

    def test_status_keeps_global_occupancy_but_project_history_scoped(self):
        self.job("old")
        (self.state / "running.json").write_text(json.dumps({
            "id": "other-running", "projectId": "other", "preset": "test", "status": "running"
        }), encoding="utf-8")
        (self.state / "jobs" / "other-queued.json").write_text(json.dumps({
            "id": "other-queued", "projectId": "other", "preset": "test", "status": "queued"
        }), encoding="utf-8")
        payload = status_snapshot(self.state, "example", "Example project")
        self.assertTrue(payload["globalOccupancy"])
        self.assertEqual(payload["running"]["id"], "other-running")
        self.assertEqual([item["id"] for item in payload["queued"]], ["other-queued"])
        self.assertEqual([item["id"] for item in payload["history"]], ["old"])
        self.assertNotIn("durationReference", payload["running"])

    def test_unassigned_status_keeps_global_living(self):
        self.job("owned")
        self.job("orphan", projectId=None)
        (self.state / "running.json").write_text(json.dumps({
            "id": "live", "projectId": "example", "preset": "smoke", "status": "running"
        }), encoding="utf-8")
        payload = status_snapshot_unassigned(self.state)
        self.assertIsNone(payload["project"])
        self.assertEqual(payload["running"]["id"], "live")
        self.assertEqual([item["id"] for item in payload["history"]], ["orphan"])

    def test_all_status_excludes_orphans(self):
        self.job("owned")
        self.job("orphan", projectId=None)
        payload = status_snapshot_all(self.state)
        self.assertIsNone(payload["project"])
        self.assertIsNone(payload["running"])
        self.assertEqual([item["id"] for item in payload["history"]], ["owned"])

    def test_running_duration_reference_uses_ticket_catalog(self):
        (self.state / "state").mkdir(exist_ok=True)
        (self.state / "state" / "projects.json").write_text(json.dumps({
            "schemaVersion": 1,
            "revision": 1,
            "bootstrapProjectId": "example",
            "projects": {
                "example": {
                    "id": "example",
                    "displayName": "Example project",
                    "configPath": str(self.config_path),
                    "revision": 1,
                }
            },
        }), encoding="utf-8")
        self.job("green", durationMs=60000)
        (self.state / "running.json").write_text(json.dumps({
            "id": "live", "projectId": "example", "preset": "smoke", "status": "running"
        }), encoding="utf-8")
        payload = status_snapshot(self.state, "other", "Other")
        reference = payload["running"]["durationReference"]
        self.assertEqual(payload["running"]["id"], "live")
        self.assertEqual(reference["meanMs"], 60000)
        self.assertEqual(reference["sampleCount"], 1)
        self.assertEqual(reference["window"], "latest-green-canonical")
        self.assertEqual([item["id"] for item in payload["history"]], [])

    def test_running_duration_reference_omitted_without_catalog(self):
        (self.state / "state").mkdir(exist_ok=True)
        (self.state / "state" / "projects.json").write_text(json.dumps({
            "schemaVersion": 1,
            "revision": 1,
            "bootstrapProjectId": "example",
            "projects": {
                "example": {
                    "id": "example",
                    "displayName": "Example project",
                    "configPath": str(self.root / "missing-ci-queue.json"),
                    "revision": 1,
                }
            },
        }), encoding="utf-8")
        self.job("green")
        (self.state / "running.json").write_text(json.dumps({
            "id": "live", "projectId": "example", "preset": "smoke", "status": "running"
        }), encoding="utf-8")
        payload = status_snapshot(self.state, "example", "Example project")
        self.assertEqual(payload["running"]["id"], "live")
        self.assertNotIn("durationReference", payload["running"])

    def test_executions_all_excludes_orphans_and_matches_project_name(self):
        self.job("owned", projectName="Example project")
        self.job("orphan", projectId=None)
        self.job("foreign", projectId="other", projectName="Other lane")
        page = read_executions(self.state, "", scope="all", snapshot_before="2026-09-14T00:00:00Z")
        self.assertEqual({item["id"] for item in page["jobs"]}, {"owned", "foreign"})
        named = read_executions(
            self.state, "", scope="all", q="Example", snapshot_before="2026-09-14T00:00:00Z",
        )
        self.assertEqual([item["id"] for item in named["jobs"]], ["owned"])

    def test_status_preserves_the_recursive_progress_contract(self):
        (self.state / "running.json").write_text(json.dumps({
            "id": "running", "projectId": "example", "preset": "full", "status": "running"
        }), encoding="utf-8")
        (self.state / "progress" / "running.json").write_text(json.dumps({
            "nodes": [
                {"id": "static", "label": "Static", "status": "passed", "kind": "stage", "durationMs": 1000},
                {"id": "gates", "parentId": "static", "label": "Gates", "status": "passed", "kind": "group"},
                {"id": "typecheck", "parentId": "gates", "label": "typecheck", "status": "passed", "retryCount": 1},
                {"id": "jest", "label": "Jest", "status": "running", "kind": "stage", "detail": "14 de 20"},
                {"id": "kindless", "label": "Kindless", "status": "running", "detail": "should stay out"},
            ]
        }), encoding="utf-8")

        summary = status_snapshot(self.state, "example", "Example project")["running"]["progressSummary"]
        self.assertEqual([node["id"] for node in summary["roots"]], ["static", "jest", "kindless"])
        self.assertEqual([node["id"] for node in summary["active"]], ["jest"])
        self.assertEqual(summary["active"][0]["detail"], "14 de 20")
        child = next(node for node in summary["nodes"] if node["id"] == "typecheck")
        self.assertEqual(child["parentId"], "gates")
        self.assertEqual(child["retryCount"], 1)

    def test_progress_counts_are_allowlisted_and_consistent(self):
        detail = {"kind": "cases", "completed": 1, "total": 3, "passed": 1,
                  "failed": 0, "skipped": 0, "running": 1, "pending": 1}
        node = {"id": "test", "label": "Test", "status": "running", "detail": {**detail, "secret": "excluded"}}
        summary = progress_summary({"status": "running", "progress": {"nodes": [node]}})["progressSummary"]
        self.assertEqual(summary["nodes"][0]["detail"], detail)
        node["detail"]["completed"] = 99
        summary = progress_summary({"progress": {"nodes": [node]}})["progressSummary"]
        self.assertNotIn("detail", summary["nodes"][0])

    def test_progress_cycle_is_unavailable_instead_of_recursive(self):
        nodes = [{"id": "a", "parentId": "b", "label": "A", "status": "passed"},
                 {"id": "b", "parentId": "a", "label": "B", "status": "passed"}]
        self.assertFalse(progress_summary({"progress": {"nodes": nodes}})["progressSummary"]["available"])

    def test_legacy_is_assigned_explicitly_or_visible_without_rewriting(self):
        self.job("assigned", projectId=None)
        self.job("unassigned", projectId=None)
        original = (self.state / "history" / "assigned.json").read_bytes()
        (self.state / "state").mkdir()
        (self.state / "state" / "legacy-projects.json").write_text(json.dumps({"schemaVersion": 1,
            "assignments": {"assigned": {"projectId": "example", "evidence": "verified commit"}}}))
        page = read_executions(self.state, "example")
        self.assertEqual([job["id"] for job in page["jobs"]], ["assigned"])
        self.assertEqual(page["coverage"]["unattributedRecords"], 1)
        self.assertEqual([job["id"] for job in read_executions(self.state, "example", scope="legacy")["jobs"]], ["unassigned"])
        self.assertEqual((self.state / "history" / "assigned.json").read_bytes(), original)

    def test_operator_declared_ledger_does_not_rewrite_or_override_other_project(self):
        self.job("dietflow", projectId=None, headSha="abc123")
        self.job("foreign", projectId=None, headSha="def456")
        original = (self.state / "history" / "dietflow.json").read_bytes()
        (self.state / "state").mkdir()
        (self.state / "state" / "legacy-projects.json").write_text(json.dumps({
            "schemaVersion": 1,
            "assignments": {
                "dietflow": {
                    "projectId": "da61d8ae-19f9-4dce-bafb-02271a6f1601",
                    "headSha": "abc123",
                    "evidence": "operator-declared-legacy-dietflow-2026-09-16",
                },
                "foreign": {
                    "projectId": "other-project",
                    "headSha": "def456",
                    "evidence": "git commit already bound",
                },
            },
        }))
        dietflow = read_executions(self.state, "da61d8ae-19f9-4dce-bafb-02271a6f1601")
        self.assertEqual([job["id"] for job in dietflow["jobs"]], ["dietflow"])
        self.assertEqual(dietflow["coverage"]["unattributedRecords"], 0)
        self.assertEqual(lookup_job(self.state, "dietflow")["id"], "dietflow")
        self.assertEqual([job["id"] for job in read_executions(self.state, "other-project")["jobs"]], ["foreign"])
        self.assertEqual((self.state / "history" / "dietflow.json").read_bytes(), original)

    def test_cli_and_http_share_history_status_and_log_facts(self):
        job = self.job("shared", logPath=str(self.state / "logs" / "shared.log"))
        (self.state / "logs" / "shared.log").write_text("test output\n")
        def cli(*args):
            result = subprocess.run(["node", str(ROOT / "dist" / "cli.js"), *args, "--state", str(self.state), "--json"], capture_output=True, text=True, check=True)
            return json.loads(result.stdout)["result"]
        api_job = read_executions(self.state, "example")["jobs"][0]
        cli_job = cli("history", "--project", "example")["jobs"][0]
        for key in ("id", "projectId", "status", "preset", "headSha", "startedAt", "finishedAt", "durationMs"):
            self.assertEqual(cli_job[key], api_job[key])
        self.assertEqual(cli("status")["latest"]["id"], status_snapshot(self.state, "example", "Example")["history"][0]["id"])
        self.assertEqual(cli("logs", "shared")["content"], read_log_export(self.state, self.config, "shared")["content"])
        cli_green = cli("preset-history", "--preset", "smoke", "--config", str(self.config_path))["presets"][0]["lastGreenCanonical"]
        api_green = next(row for row in build_preset_history(self.state, self.config)["presets"] if row["preset"] == "smoke")["lastGreenCanonical"]
        for key in ("ticketId", "status", "headSha", "branch", "finishedAt", "durationMs"):
            self.assertEqual(cli_green[key], api_green[key])


class RemoteGreensTests(Fixture):
    def test_all_greens_preserve_valid_project_when_history_identity_is_malformed(self):
        from ci_queue_api import history
        self.job("remote-ticket")
        mirror = self.write_remote_mirror(self.remote_report([self.remote_slot()]))
        config = replace(self.config, remote_slots_path=mirror)
        project = SimpleNamespace(project_id="example", display_name="Example",
                                  config=config, binding_state="linked")
        (self.state / "state").mkdir()
        (self.state / "state" / "legacy-projects.json").write_text(json.dumps({
            "schemaVersion": 1,
            "assignments": {"broken": {"projectId": "example", "evidence": "legacy evidence"}},
        }))
        for identity in ([], {}, [1], {"bad": 1}, "", 42, False, "invalid id"):
            with self.subTest(identity=identity):
                self.job("broken", projectId=identity)
                machine = history.build_preset_history_all(self.state, [project])
                self.assertEqual(machine["totals"]["tickets"], 1)
                self.assertEqual(machine["coverage"]["corruptRecords"], 1)
                self.assertEqual(machine["coverage"]["unattributedRecords"], 0)
                self.assertEqual(machine["presets"][0]["lastGreenCanonical"]["ticketId"], "remote-ticket")
                remote = history.read_remote_slots_all(self.state, [project])
                self.assertEqual([(green["projectId"], green["ticketId"], green["jobAvailable"])
                                  for green in remote["greens"]], [("example", "remote-ticket", True)])
                self.assertTrue(remote["projects"][0]["source"]["available"])

    def test_all_remote_greens_preserve_partial_coverage_and_use_one_snapshot(self):
        from ci_queue_api import history
        self.job("remote-ticket")
        mirror = self.write_remote_mirror(self.remote_report([self.remote_slot()]))
        alpha = replace(self.config, remote_slots_path=mirror)
        beta = replace(self.config, project_id="beta", remote_slots_path=self.root / "absent")
        projects = [SimpleNamespace(project_id=config.project_id,
                    display_name=config.project_name, config=config, binding_state="linked")
                    for config in (alpha, beta)]
        store = history.store_for(self.state / "history")
        with mock.patch.object(store, "snapshot", wraps=store.snapshot) as snapshots:
            result = history.read_remote_slots_all(self.state, projects)
        self.assertEqual(snapshots.call_count, 1)
        self.assertEqual([(green["projectId"], green["jobAvailable"]) for green in result["greens"]],
                         [("example", True)])
        by_project = {row["projectId"]: row for row in result["projects"]}
        self.assertTrue(by_project["example"]["source"]["available"])
        self.assertEqual(by_project["beta"]["source"]["reason"]["code"], "mirror-unavailable")
        beta = replace(beta, remote_slots_path=mirror)
        projects[1].config = beta
        result = history.read_remote_slots_all(self.state, projects)
        self.assertEqual(result["projects"][1]["source"]["reason"]["code"], "project-mismatch")
        self.assertEqual(len(result["greens"]), 1)
        projects[1].config = None
        projects[1].binding_state = "invalid"
        partial = history.read_remote_slots_all(self.state, projects)
        self.assertEqual(len(partial["greens"]), 1)
        self.assertEqual(partial["projectErrors"][0]["projectId"], "beta")
        self.assertIsNone(partial["projects"][1]["source"])
        with mock.patch.object(store, "snapshot", wraps=store.snapshot) as snapshots:
            machine = history.build_preset_history_all(self.state, projects)
        self.assertEqual(snapshots.call_count, 1)
        self.assertEqual(machine["presets"][0]["lastGreenCanonical"]["ticketId"], "remote-ticket")
        self.assertEqual(machine["projectErrors"][0]["projectId"], "beta")
        mirror.write_text(json.dumps(self.remote_report([self.remote_slot(
            self.remote_payload(exitCode=1))])))
        result = history.read_remote_slots_all(self.state, projects)
        self.assertEqual(result["greens"], [])
        self.assertEqual(result["projects"][0]["coverage"]["invalidPayloads"][0]["reason"],
                         "payload-exit-not-green")

    def test_normalizes_a_verified_git_green_with_provenance_and_local_drawer_state(self):
        self.job("remote-ticket")
        mirror = self.write_remote_mirror(self.remote_report([self.remote_slot()]))

        response = read_remote_slots(mirror, self.config, self.state,
                                     now=datetime(2026, 9, 13, 11, 0, tzinfo=timezone.utc))

        self.assertEqual(response["schemaVersion"], 2)
        self.assertNotIn("report", response)
        self.assertEqual(response["source"], {
            "kind": "git",
            "available": True,
            "stale": False,
            "remote": "origin",
            "namespace": "refs/ci/last-green",
            "readAt": "2026-09-13T10:01:20Z",
            "refreshedAt": None,
            "reason": None,
        })
        self.assertEqual(response["coverage"], {
            "declaredPresets": 2,
            "greenPresets": 1,
            "withoutTagPresets": ["full"],
            "invalidPayloads": [],
        })
        self.assertEqual(response["greens"], [{
            "origin": "git",
            "preset": "smoke",
            "projectId": "example",
            "ticketId": "remote-ticket",
            "jobAvailable": True,
            "status": "passed",
            "headSha": "a" * 40,
            "commitSha": "a" * 40,
            "baseSha": "b" * 40,
            "branch": "main",
            "finishedAt": "2026-09-13T10:01:01Z",
            "publishedAt": "2026-09-13T10:01:10Z",
            "durationMs": 60000,
            "ref": "refs/ci/last-green/smoke",
        }])

    def test_an_old_reading_is_stale_but_stays_available(self):
        self.job("remote-ticket")
        mirror = self.write_remote_mirror(self.remote_report([self.remote_slot()]))
        read_at = datetime(2026, 9, 13, 10, 1, 20, tzinfo=timezone.utc)

        within_a_day = read_remote_slots(mirror, self.config, self.state,
                                         now=read_at.replace(day=14, hour=10, minute=0))
        after_a_day = read_remote_slots(mirror, self.config, self.state,
                                        now=read_at.replace(day=14, hour=10, minute=2))

        self.assertFalse(within_a_day["source"]["stale"])
        self.assertTrue(after_a_day["source"]["stale"])
        self.assertTrue(after_a_day["source"]["available"])
        self.assertIsNone(after_a_day["source"]["reason"])
        self.assertEqual(after_a_day["source"]["readAt"], "2026-09-13T10:01:20Z")
        self.assertEqual(after_a_day["greens"][0]["ticketId"], "remote-ticket")

        undated = self.write_remote_mirror(self.remote_report([self.remote_slot()], generatedAt=None))
        self.assertTrue(read_remote_slots(undated, self.config, self.state, now=read_at)["source"]["stale"])

    def test_distinguishes_a_readable_empty_mirror_from_an_unreadable_one(self):
        empty = self.write_remote_mirror(self.remote_report([]))
        readable = read_remote_slots(empty, self.config, self.state)
        self.assertTrue(readable["source"]["available"])
        self.assertIsNone(readable["source"]["reason"])
        self.assertEqual(readable["coverage"]["withoutTagPresets"], ["full", "smoke"])
        self.assertEqual(readable["coverage"]["invalidPayloads"], [])

        empty.write_text("not json", encoding="utf-8")
        unreadable = read_remote_slots(empty, self.config, self.state)
        self.assertFalse(unreadable["source"]["available"])
        self.assertEqual(unreadable["source"]["reason"]["code"], "mirror-unreadable")
        self.assertEqual(unreadable["greens"], [])
        self.assertEqual(unreadable["coverage"]["withoutTagPresets"], [])

    def test_never_projects_a_green_when_the_slot_does_not_prove_canonical_success(self):
        cases = []
        failed_payload = self.remote_payload(exitCode=1)
        cases.append((self.remote_slot(failed_payload), "payload-exit-not-green"))
        unproven_payload = self.remote_payload(ancestorOfBase=False)
        cases.append((self.remote_slot(unproven_payload), "payload-ancestor-not-proven"))
        mismatched_commit = self.remote_slot()
        mismatched_commit["commitSha"] = "c" * 40
        cases.append((mismatched_commit, "slot-commit-mismatch"))

        for slot, reason in cases:
            with self.subTest(reason=reason):
                mirror = self.write_remote_mirror(self.remote_report([slot]))
                response = read_remote_slots(mirror, self.config, self.state)
                self.assertFalse(response["source"]["available"])
                self.assertEqual(response["source"]["reason"]["code"], "payload-unreadable")
                self.assertEqual(response["greens"], [])
                self.assertEqual(response["coverage"]["withoutTagPresets"], ["full"])
                self.assertEqual(response["coverage"]["invalidPayloads"], [{"preset": "smoke", "reason": reason}])

    def test_rejects_a_mirror_that_asserts_another_project_identity(self):
        report = self.remote_report([self.remote_slot()], projectId="other")
        mirror = self.write_remote_mirror(report)

        response = read_remote_slots(mirror, self.config, self.state)

        self.assertFalse(response["source"]["available"])
        self.assertEqual(response["source"]["reason"]["code"], "project-mismatch")
        self.assertEqual(response["greens"], [])

    def test_preserves_a_verified_stale_green_without_claiming_the_mirror_is_available(self):
        mirror = self.write_remote_mirror({
            "ok": False,
            "stale": True,
            "error": "Git indisponível.",
            "readAt": "2026-09-13T10:02:00Z",
            "report": self.remote_report([self.remote_slot()]),
        })

        response = read_remote_slots(mirror, self.config, self.state)

        self.assertFalse(response["source"]["available"])
        self.assertTrue(response["source"]["stale"])
        self.assertEqual(response["source"]["reason"], {
            "code": "mirror-unavailable",
            "message": "Git indisponível.",
        })
        self.assertEqual(response["greens"][0]["ticketId"], "remote-ticket")
        self.assertFalse(response["greens"][0]["jobAvailable"])


class StateAndDiagnosticTests(Fixture):
    def test_dashboard_all_reads_shared_snapshots_once_including_remote_ticket_lookup(self):
        alpha_mirror = self.root / "remote-alpha.json"
        alpha_mirror.write_text(json.dumps(self.remote_report(
            [], catalog={"resolved": True, "declaredCount": 2, "projectId": "example"},
        )), encoding="utf-8")
        beta_mirror = self.root / "remote-beta.json"
        beta_mirror.write_text(json.dumps(self.remote_report(
            [], catalog={"resolved": True, "declaredCount": 2, "projectId": "beta"},
        )), encoding="utf-8")
        alpha = replace(self.config, remote_slots_path=alpha_mirror)
        beta = replace(self.config, project_id="beta", project_name="Beta",
                       remote_slots_path=beta_mirror)
        projects = [
            SimpleNamespace(project_id="example", display_name="Example", config=alpha,
                            binding_state="linked", registered_repository_path=self.root,
                            registered_config_path=self.config_path),
            SimpleNamespace(project_id="beta", display_name="Beta", config=beta,
                            binding_state="linked", registered_repository_path=self.root,
                            registered_config_path=self.config_path),
        ]
        from ci_queue_api import dashboard_state, history

        with mock.patch("ci_queue_api.dashboard_state._read", wraps=dashboard_state._read) as dashboard_reads:
            with mock.patch("ci_queue_api.dashboard_state.read_validation_plan",
                            wraps=dashboard_state.read_validation_plan) as plan_reads:
                with mock.patch("ci_queue_api.dashboard_state.read_history",
                                wraps=dashboard_state.read_history) as history_reads:
                    with mock.patch("ci_queue_api.history.read_history",
                                    wraps=history.read_history) as remote_history_reads:
                        result = read_dashboard_state_all(self.state, projects)

        self.assertEqual({item["projectId"] for item in result["projects"]}, {"example", "beta"})
        self.assertEqual(dashboard_reads.call_count, 1)
        self.assertEqual(plan_reads.call_count, 1)
        self.assertEqual(history_reads.call_count, 1)
        self.assertEqual(remote_history_reads.call_count, 0)

    def test_meta_uses_latest_greens_and_pending_is_read_only(self):
        state = write_dashboard_state(self.state, self.config, {
            "revision": 0, "action": "save-meta",
            "meta": {"name": "Meta main", "description": "",
                     "presets": ["smoke", "future"]},
        })
        self.assertEqual(state["revision"], 1)
        self.assertEqual([item["status"] for item in state["meta"]["checks"]], ["pending", "recipe-missing"])
        self.assertIsNone(state["meta"]["candidateSha"])
        self.assertEqual(state["pending"], [])
        with self.assertRaises(ValueError):
            write_dashboard_state(self.state, self.config, {
                "revision": 1, "action": "save-note",
                "note": {"title": "Lembrar", "text": "manual"},
            })
        with self.assertRaises(RevisionConflict):
            write_dashboard_state(self.state, self.config, {"revision": 0, "action": "remove-meta"})

        self.job("smoke-green", finishedAt="2026-09-13T11:00:00Z")
        current = read_dashboard_state(self.state, self.config)
        self.assertEqual(current["meta"]["checks"][0]["ticketId"], "smoke-green")
        self.assertEqual(current["meta"]["checks"][0]["headSha"], "a" * 40)

    def test_meta_derives_a_candidate_only_when_all_latest_greens_share_a_sha(self):
        self.job("smoke-green", finishedAt="2026-09-13T11:00:00Z")
        self.job("full-green", preset="full", argv=["npm", "run", "full"],
                 finishedAt="2026-09-13T11:01:00Z")
        state = write_dashboard_state(self.state, self.config, {
            "revision": 0, "action": "save-meta",
            "meta": {"name": "Meta main", "description": "", "presets": ["smoke", "full"]},
        })
        self.assertEqual(state["meta"]["candidateSha"], "a" * 40)

        self.job("new-full-green", preset="full", argv=["npm", "run", "full"],
                 headSha="b" * 40, finishedAt="2026-09-13T12:00:00Z")
        state = read_dashboard_state(self.state, self.config)
        self.assertIsNone(state["meta"]["candidateSha"])
        self.assertEqual([item["status"] for item in state["meta"]["checks"]], ["passed", "passed"])

        self.job("unknown-smoke-green", headSha="unknown",
                 finishedAt="2026-09-13T13:00:00Z")
        state = read_dashboard_state(self.state, self.config)
        self.assertIsNone(state["meta"]["candidateSha"])

    def test_meta_requires_at_least_one_valid_recipe_name(self):
        with self.assertRaises(ValueError):
            write_dashboard_state(self.state, self.config, {
                "revision": 0, "action": "save-meta",
                "meta": {"name": "Meta main", "description": "", "presets": []},
            })
        with self.assertRaises(ValueError):
            write_dashboard_state(self.state, self.config, {
                "revision": 0, "action": "save-meta",
                "meta": {"name": "Meta main", "description": "", "presets": ["Nome inválido"]},
            })

    def test_pending_advisory_disappears_after_a_later_exact_green(self):
        (self.state / "state").mkdir(parents=True, exist_ok=True)
        (self.state / "state" / "validation-plan.json").write_text(json.dumps({
            "schemaVersion": 1,
            "pending": [{
                "projectId": "example",
                "preset": "full",
                "argv": ["npm", "run", "full"],
                "requirements": [{
                    "sha": "a" * 40,
                    "reason": "Mudança de runtime recomenda Full.",
                    "pr": 42,
                    "createdAt": "2026-09-13T10:30:00Z",
                }],
            }],
            "candidates": [],
        }), encoding="utf-8")
        state = read_dashboard_state(self.state, self.config)
        self.assertEqual(state["pending"][0]["pr"], 42)
        self.assertEqual(state["pending"][0]["preset"], "full")

        self.job("legacy-bad-time", preset="full", argv=["npm", "run", "full"],
                 status="failed", exitCode=1, finishedAt="invalid")
        state = read_dashboard_state(self.state, self.config)
        self.assertEqual(len(state["pending"]), 1)
        self.assertIsNone(state["pendingError"])

        self.job("full-green", preset="full", argv=["npm", "run", "full"],
                 finishedAt="2026-09-13T11:00:00Z")
        self.assertEqual(read_dashboard_state(self.state, self.config)["pending"], [])

    def test_pending_advisory_is_also_resolved_by_a_verified_git_green(self):
        (self.state / "state").mkdir(parents=True, exist_ok=True)
        (self.state / "state" / "validation-plan.json").write_text(json.dumps({
            "schemaVersion": 1,
            "pending": [{
                "projectId": "example",
                "preset": "full",
                "argv": ["npm", "run", "full"],
                "requirements": [{
                    "sha": "a" * 40,
                    "reason": "Mudança de runtime recomenda Full.",
                    "pr": 42,
                    "createdAt": "2026-09-13T10:30:00Z",
                }],
            }],
            "candidates": [],
        }), encoding="utf-8")
        payload = self.remote_payload(
            preset="full",
            ticketId="remote-full",
            finishedAt="2026-09-13T11:00:00Z",
        )
        mirror = self.write_remote_mirror(self.remote_report([self.remote_slot(payload)]))
        config = replace(self.config, remote_slots_path=mirror)

        self.assertEqual(read_dashboard_state(self.state, config)["pending"], [])

    def test_log_is_scoped_redacted_and_bounded(self):
        self.job("private")
        (self.state / "logs" / "private.log").write_text("token=super-secret\nall good\n", encoding="utf-8")
        with mock.patch("ci_queue_api.diagnostics.read_log_export", side_effect=AssertionError("diagnostic must not export logs")):
            diagnostic = read_diagnostic(self.state, self.config, "private")
        self.assertTrue(diagnostic["available"])
        self.assertEqual(diagnostic["coverage"]["logs"]["capturedBytes"], 0)
        self.assertEqual(diagnostic["coverage"]["logs"]["preserved"], "metadata")
        exported = read_log_export(self.state, self.config, "private")
        self.assertIn("[REDACTED]", exported["content"])
        self.assertNotIn("super-secret", exported["content"])
        self.job("foreign", projectId="other")
        (self.state / "logs" / "foreign.log").write_text("secret=x", encoding="utf-8")
        self.assertTrue(read_diagnostic(self.state, self.config, "foreign")["available"])
        exported_foreign = read_log_export(self.state, self.config, "foreign")
        self.assertIn("[REDACTED]", exported_foreign["content"])
        self.assertNotIn("secret=x", exported_foreign["content"])

    def test_diagnostic_keeps_facts_without_classifying_log_text(self):
        self.job(
            "failed",
            status="failed",
            exitCode=1,
            failureReason="processo terminou com código 1",
            processObservations=[{"capture": "end", "state": "exited"}],
        )
        (self.state / "logs" / "failed.log").write_text(
            "ENOSPC\nout of memory\nSIGSEGV\njest worker exited unexpectedly\n",
            encoding="utf-8",
        )

        diagnostic = read_diagnostic(self.state, self.config, "failed")

        self.assertTrue(diagnostic["available"])
        self.assertEqual(
            diagnostic["ticket"],
            {
                "id": "failed",
                "preset": "smoke",
                "status": "failed",
                "exitCode": 1,
                "failureReason": "processo terminou com código 1",
                "headSha": "a" * 40,
                "branch": "main",
                "durationMs": 60000,
            },
        )
        self.assertNotIn("incidents", diagnostic)
        self.assertEqual(
            diagnostic["resources"],
            {
                "observations": [{"capture": "end", "state": "exited"}],
                "coverage": "reported",
            },
        )
        self.assertTrue(diagnostic["coverage"]["logs"]["available"])

    def test_incremental_log_preserves_unicode_and_redacts_across_cursors(self):
        self.job("cursor")
        (self.state / "logs" / "cursor.log").write_text("áé\ntoken=secret-long-value\ndone\n")
        offset = 0
        content = ""
        for _ in range(20):
            part = read_log_slice(self.state, self.config, "cursor", offset, 12)
            content += part["content"]
            self.assertGreaterEqual(part["nextOffset"], offset)
            offset = part["nextOffset"]
            if part["complete"]:
                break
        self.assertIn("áé", content)
        self.assertIn("done", content)
        self.assertNotIn("secret-long-value", content)
        self.assertNotIn("long-value", content)

    def test_export_declares_truncation_for_a_large_log(self):
        self.job("large")
        (self.state / "logs" / "large.log").write_bytes(b"a" * (MAX_EXPORT_BYTES + 16))
        exported = read_log_export(self.state, self.config, "large")
        self.assertFalse(exported["coverage"]["complete"])
        self.assertEqual(exported["coverage"]["preserved"], "head-and-tail")
        self.assertLessEqual(exported["coverage"]["capturedBytes"], MAX_EXPORT_BYTES)


class WorktreeTests(Fixture):
    def test_inventory_uses_explicit_repository_and_schedules_sizes(self):
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
        self.assertIn(report["worktrees"][0]["size"]["state"], {"measuring", "ready"})
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
        body = json.dumps({
            "revision": 0,
            "action": "save-meta",
            "meta": {"name": "Meta main", "description": "", "presets": ["smoke"]},
        }).encode()
        with self.assertRaises(HTTPError) as rejected:
            self.request("/api/dashboard-state", body, {"Content-Type": "application/json"})
        self.assertEqual(rejected.exception.code, 403)
        headers = {"Content-Type": "application/json", "X-CI-CSRF": "csrf-test", "Origin": self.base}
        with self.request("/api/dashboard-state", body, headers) as response:
            state = json.loads(response.read())
        self.assertEqual(state["meta"]["name"], "Meta main")
        self.assertNotIn("notes", state)

    def test_remote_slots_never_fetches_from_the_browser(self):
        with self.assertRaises(HTTPError) as rejected:
            self.request("/api/remote-slots?refresh=1")
        self.assertEqual(rejected.exception.code, 400)

    def test_remote_slots_exposes_the_normalized_git_contract(self):
        self.job("remote-ticket")
        self.write_remote_mirror(self.remote_report([self.remote_slot()]))
        self.config_path.write_text(json.dumps({
            "schemaVersion": 1,
            "project": {"id": "example", "name": "Example project"},
            "presets": {
                "smoke": {"argv": ["npm", "run", "smoke"]},
                "full": {"argv": ["npm", "run", "full"]},
            },
            "remoteSlotsPath": "remote-slots.json",
        }), encoding="utf-8")
        config = load_project_config(self.config_path)
        server = create_server(ApiContext(config, self.state, None, "csrf-test"), port=0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with urlopen("http://127.0.0.1:%s/api/remote-slots" % server.server_address[1], timeout=3) as response:
                payload = json.loads(response.read())
            self.assertEqual(payload["schemaVersion"], 2)
            self.assertTrue(payload["source"]["available"])
            self.assertTrue(payload["greens"][0]["jobAvailable"])
            self.assertEqual(payload["greens"][0]["origin"], "git")
        finally:
            server.shutdown()
            thread.join(1)
            server.server_close()

    def test_unknown_api_is_not_a_spa_route(self):
        with self.assertRaises(HTTPError) as rejected:
            self.request("/api/not-a-route")
        self.assertEqual(rejected.exception.code, 404)

    def test_build_provenance_is_never_inferred_from_checkout(self):
        with self.request("/build.json") as response:
            absent = json.loads(response.read())
        self.assertIsNone(absent["manifest"])

        manifest_path = self.root / "manifest.json"
        raw = json.dumps({
            "schemaVersion": 1, "product": "ci-queue", "version": "0.1.0",
            "revision": "a" * 40, "createdAt": "2026-09-13T12:00:00Z", "files": [],
        }).encode("utf-8")
        manifest_path.write_bytes(raw)
        expected = hashlib.sha256(raw).hexdigest()
        provenance_server = create_server(
            ApiContext(self.config, self.state, None, "csrf-test", manifest_path, expected), port=0)
        provenance_thread = threading.Thread(target=provenance_server.serve_forever, daemon=True)
        provenance_thread.start()
        provenance_base = "http://127.0.0.1:%s" % provenance_server.server_address[1]
        try:
            with urlopen(provenance_base + "/build.json", timeout=3) as response:
                provenanced = json.loads(response.read())
            self.assertEqual(provenanced["manifest"]["state"], "matched")
            self.assertEqual(provenanced["manifest"]["revision"], "a" * 40)
            manifest_path.write_text("{}", encoding="utf-8")
            with urlopen(provenance_base + "/build.json", timeout=3) as response:
                tampered = json.loads(response.read())
            self.assertEqual(tampered["manifest"]["state"], "invalid")
        finally:
            provenance_server.shutdown()
            provenance_thread.join(1)
            provenance_server.server_close()


if __name__ == "__main__":
    unittest.main()
