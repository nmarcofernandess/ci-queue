"""Per-request project scope, concurrent reads and lifecycle HTTP guards."""

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

from ci_queue_api.project_context import ProjectRequired, scope_from_query
from ci_queue_api.projects import bootstrap_registry, mutate_registry, probe_project, read_registry
from ci_queue_api.records import invalidate_history_cache, lookup_job
from ci_queue_api.server import ApiContext, create_server
from ci_queue_api.config import load_project_config


def _init_repo(path):
    path.mkdir(parents=True, exist_ok=True)
    subprocess.run(["git", "init", str(path)], check=True, capture_output=True)
    subprocess.run(["git", "-C", str(path), "config", "user.email", "test@example.com"],
                   check=True, capture_output=True)
    subprocess.run(["git", "-C", str(path), "config", "user.name", "Test"],
                   check=True, capture_output=True)
    subprocess.run(["git", "-C", str(path), "commit", "--allow-empty", "-m", "init"],
                   check=True, capture_output=True)
    return path


def _config(repo, project_id, name):
    path = repo / "ci-queue.json"
    path.write_text(json.dumps({
        "schemaVersion": 1,
        "project": {"id": project_id, "name": name},
        "repository": {"path": str(repo)},
        "presets": {"smoke": {"argv": ["node", "--version"]}},
    }), encoding="utf-8")
    return path


class ScopeResolutionTests(unittest.TestCase):
    def test_query_rules(self):
        self.assertEqual(scope_from_query({"projectId": ["alpha"]}, None).project_id, "alpha")
        self.assertEqual(scope_from_query({"context": ["unassigned"]}, "alpha").kind, "unassigned")
        self.assertEqual(scope_from_query({"scope": ["legacy"]}, None).kind, "unassigned")
        self.assertEqual(scope_from_query({}, "boot").project_id, "boot")
        with self.assertRaises(ProjectRequired):
            scope_from_query({}, None)
        with self.assertRaises(ValueError):
            scope_from_query({"projectId": ["alpha"], "context": ["unassigned"]}, None)
        with self.assertRaises(ValueError):
            scope_from_query({"projectId": ["alpha"], "context": ["all"]}, None)
        self.assertEqual(scope_from_query({"projectId": ["legacy"]}, None).project_id, "legacy")
        self.assertEqual(scope_from_query({"projectId": ["all"]}, None).project_id, "all")
        self.assertEqual(scope_from_query({"context": ["all"]}, "boot").kind, "all")
        self.assertEqual(scope_from_query({"context": ["all"]}, "boot").echo(), {"kind": "all"})
        self.assertEqual(scope_from_query({"context": ["all"]}, "boot").key(), "all")

    def test_lookup_no_longer_leaks_unassigned_into_a_project(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory)
            (state / "history").mkdir()
            (state / "jobs").mkdir()
            ticket = {
                "id": "orphan",
                "projectId": None,
                "status": "passed",
                "preset": "smoke",
                "finishedAt": "2026-09-13T10:01:01Z",
            }
            (state / "history" / "orphan.json").write_text(json.dumps(ticket), encoding="utf-8")
            invalidate_history_cache()
            self.assertEqual(lookup_job(state, "orphan")["id"], "orphan")


class ProjectScopeHttpTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.state = self.root / "state-root"
        for directory in ("history", "jobs", "logs", "progress", "state"):
            (self.state / directory).mkdir(parents=True, exist_ok=True)
        self.repo_a = _init_repo(self.root / "repo-a")
        self.repo_b = _init_repo(self.root / "repo-b")
        self.config_a = _config(self.repo_a, "alpha", "Alpha")
        self.config_b = _config(self.repo_b, "beta", "Beta")
        bootstrap_registry(self.state, self.config_a)
        preview = probe_project(self.state, {"repositoryPath": str(self.repo_b)})
        mutate_registry(self.state, {
            "action": "register",
            "expectedRevision": read_registry(self.state)["revision"],
            "identitySource": "config",
            "repositoryPath": str(self.repo_b),
            "signature": preview["signature"],
        })
        self._write_job("job-a", "alpha", b"UNIQUE_ALPHA_LOG")
        self._write_job("job-b", "beta", b"UNIQUE_BETA_LOG")
        self._write_job("job-none", None, b"UNIQUE_ORPHAN_LOG")
        invalidate_history_cache()
        self.addCleanup(invalidate_history_cache)
        config = load_project_config(self.config_a)
        self.server = create_server(ApiContext(config, self.state, None, "csrf-test"), port=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.server.shutdown)
        self.addCleanup(self.thread.join, 1)
        self.addCleanup(self.server.server_close)
        self.base = "http://127.0.0.1:%s" % self.server.server_address[1]

    def _write_job(self, ident, project_id, log_bytes, finished="2026-09-13T10:01:01Z",
                   preset="smoke", **extra):
        payload = {
            "id": ident,
            "projectId": project_id,
            "projectName": {None: None, "alpha": "Alpha", "beta": "Beta"}.get(project_id),
            "preset": preset,
            "status": "passed",
            "finishedAt": finished,
            "argv": ["node", "--version"],
        }
        payload.update(extra)
        (self.state / "history" / (ident + ".json")).write_text(json.dumps(payload), encoding="utf-8")
        (self.state / "logs" / (ident + ".log")).write_bytes(log_bytes)

    def _get(self, path, headers=None):
        request = Request(self.base + path, headers=headers or {})
        return urlopen(request, timeout=3)

    def _post(self, path, body, headers=None):
        request = Request(self.base + path, data=json.dumps(body).encode(), method="POST",
                          headers=headers or {})
        return urlopen(request, timeout=3)

    def test_all_preset_history_keeps_recipes_and_same_sha_project_scoped(self):
        for path, argv in ((self.config_a, ["node", "alpha"]),
                           (self.config_b, ["node", "beta"])):
            config = json.loads(path.read_text())
            config["presets"] = {"full": {"argv": argv}}
            path.write_text(json.dumps(config))
        self._write_job("alpha-full", "alpha", b"", preset="full", exitCode=0,
                        argv=["node", "alpha"], headSha="a" * 40)
        self._write_job("beta-wrong", "beta", b"", preset="full", exitCode=0,
                        argv=["node", "alpha"], headSha="a" * 40)
        with self._get("/api/preset-history?context=all") as response:
            payload = json.loads(response.read())
        rows = {row["projectId"]: row for row in payload["presets"] if row["preset"] == "full"}
        self.assertEqual(payload["context"], {"kind": "all"})
        self.assertEqual(rows["alpha"]["lastGreenCanonical"]["ticketId"], "alpha-full")
        self.assertIsNone(rows["beta"]["lastGreenCanonical"])
        self._write_job("beta-full", "beta", b"", preset="full", exitCode=0,
                        argv=["node", "beta"], headSha="a" * 40)
        with self._get("/api/preset-history?context=all") as response:
            rows = json.loads(response.read())["presets"]
        self.assertEqual({(row["projectId"], row["lastGreenCanonical"]["headSha"])
                          for row in rows if row["preset"] == "full"}, {("alpha", "a" * 40), ("beta", "a" * 40)})
        self.config_b.write_text("invalid")
        with self._get("/api/preset-history?context=all") as response:
            partial = json.loads(response.read())
        self.assertEqual({row["projectId"] for row in partial["presets"]}, {"alpha"})
        self.assertEqual(partial["projectErrors"][0]["projectId"], "beta")

    def test_all_greens_reject_unassigned_and_remote_refresh(self):
        for endpoint in ("preset-history", "remote-slots"):
            with self.assertRaises(HTTPError) as error:
                self._get("/api/" + endpoint + "?context=unassigned")
            self.assertEqual(error.exception.code, 409)
        with self._get("/api/remote-slots?context=all") as response:
            payload = json.loads(response.read())
        self.assertEqual(payload["context"], {"kind": "all"})
        self.assertEqual({row["projectId"] for row in payload["projects"]}, {"alpha", "beta"})
        self.assertEqual(payload["greens"], [])
        with self.assertRaises(HTTPError) as error:
            self._get("/api/remote-slots?context=all&refresh=1")
        self.assertEqual(error.exception.code, 400)

    def test_parallel_reads_keep_alpha_and_beta_apart(self):
        results = {}
        errors = []

        def read_one(label, path):
            try:
                with self._get(path) as response:
                    results[label] = json.loads(response.read())
            except Exception as error:
                errors.append(error)

        workers = [
            threading.Thread(target=read_one, args=("a-status", "/api/status?projectId=alpha")),
            threading.Thread(target=read_one, args=("b-status", "/api/status?projectId=beta")),
            threading.Thread(target=read_one, args=("a-history", "/api/executions?projectId=alpha")),
            threading.Thread(target=read_one, args=("b-history", "/api/executions?projectId=beta")),
        ]
        for worker in workers:
            worker.start()
        for worker in workers:
            worker.join()
        self.assertEqual(errors, [])
        self.assertEqual(results["a-status"]["context"]["projectId"], "alpha")
        self.assertEqual(results["b-status"]["context"]["projectId"], "beta")
        self.assertEqual([job["id"] for job in results["a-history"]["jobs"]], ["job-a"])
        self.assertEqual([job["id"] for job in results["b-history"]["jobs"]], ["job-b"])

    def test_executions_cursor_from_alpha_does_not_leak_into_beta(self):
        for index in range(51):
            self._write_job(
                "job-a-%02d" % index,
                "alpha",
                b"UNIQUE_ALPHA_LOG",
                finished="2026-09-14T10:%02d:01Z" % (index % 60),
            )
        self._write_job("job-b", "beta", b"UNIQUE_BETA_LOG", finished="2026-08-01T10:01:01Z")
        invalidate_history_cache()
        with self._get("/api/executions?projectId=alpha") as response:
            page = json.loads(response.read())
        self.assertTrue(page["hasMore"])
        cursor = page["nextCursor"]
        with self._get("/api/executions?projectId=beta&cursor=%s" % cursor) as response:
            beta = json.loads(response.read())
        self.assertEqual([job["id"] for job in beta["jobs"]], ["job-b"])
        self.assertNotIn("job-a-00", [job["id"] for job in beta["jobs"]])

    def test_meta_saved_on_alpha_does_not_update_beta(self):
        headers = {
            "Content-Type": "application/json",
            "X-CI-CSRF": "csrf-test",
            "Origin": self.base,
        }
        with self._post("/api/dashboard-state?projectId=alpha", {
            "revision": 0,
            "action": "save-meta",
            "meta": {"name": "Alpha meta", "description": "only-a", "presets": ["smoke"]},
        }, headers) as response:
            written = json.loads(response.read())
        self.assertEqual(written["context"]["projectId"], "alpha")
        self.assertEqual(written["meta"]["name"], "Alpha meta")
        with self._get("/api/dashboard-state?projectId=beta") as response:
            beta = json.loads(response.read())
        self.assertEqual(beta["context"]["projectId"], "beta")
        self.assertIsNone(beta["meta"])
        with self._get("/api/dashboard-state?projectId=alpha") as response:
            alpha = json.loads(response.read())
        self.assertEqual(alpha["meta"]["name"], "Alpha meta")
        with self.assertRaises(HTTPError) as stale:
            self._post("/api/dashboard-state?projectId=alpha", {
                "revision": 0,
                "action": "save-meta",
                "meta": {"name": "Stale", "description": "", "presets": ["smoke"]},
            }, headers)
        self.assertEqual(stale.exception.code, 409)

    def test_dashboard_state_all_aggregates_active_projects_and_excludes_archived(self):
        config_c = _config(_init_repo(self.root / "repo-c"), "gamma", "Gamma")
        preview = probe_project(self.state, {"repositoryPath": str(config_c.parent)})
        mutate_registry(self.state, {
            "action": "register",
            "expectedRevision": read_registry(self.state)["revision"],
            "identitySource": "config",
            "repositoryPath": str(config_c.parent),
            "signature": preview["signature"],
        })
        mutate_registry(self.state, {
            "action": "archive",
            "expectedRevision": read_registry(self.state)["revision"],
            "projectId": "gamma",
        })
        (self.state / "state" / "dashboard.json").write_text(json.dumps({
            "schemaVersion": 1,
            "projects": {
                "alpha": {"revision": 1, "meta": {
                    "name": "Alpha goal", "description": "", "presets": ["smoke"],
                }},
                "beta": {"revision": 2, "meta": {
                    "name": "Beta goal", "description": "", "presets": ["smoke"],
                }},
                "gamma": {"revision": 3, "meta": {
                    "name": "Archived goal", "description": "", "presets": ["smoke"],
                }},
            },
        }), encoding="utf-8")
        (self.state / "state" / "validation-plan.json").write_text(json.dumps({
            "schemaVersion": 1,
            "pending": [
                {"projectId": "alpha", "preset": "smoke", "requirements": [{
                    "sha": "a" * 40, "reason": "Alpha pending", "createdAt": "2026-09-10T00:00:00Z",
                }]},
                {"projectId": "beta", "preset": "smoke", "requirements": [{
                    "sha": "b" * 40, "reason": "Beta pending", "createdAt": "2026-09-11T00:00:00Z",
                }]},
                {"projectId": "gamma", "preset": "smoke", "requirements": [{
                    "sha": "c" * 40, "reason": "Archived pending", "createdAt": "2026-09-12T00:00:00Z",
                }]},
            ],
        }), encoding="utf-8")

        with self._get("/api/dashboard-state?context=all") as response:
            payload = json.loads(response.read())

        self.assertEqual(payload["context"], {"kind": "all"})
        self.assertEqual({item["projectId"] for item in payload["projects"]}, {"alpha", "beta"})
        self.assertEqual({item["projectName"] for item in payload["projects"]}, {"Alpha", "Beta"})
        by_project = {item["projectId"]: item for item in payload["projects"]}
        self.assertEqual(by_project["alpha"]["catalog"], "linked")
        self.assertEqual(by_project["beta"]["catalog"], "linked")
        self.assertEqual(by_project["alpha"]["meta"]["name"], "Alpha goal")
        self.assertEqual(by_project["beta"]["meta"]["name"], "Beta goal")
        self.assertEqual(by_project["alpha"]["pending"][0]["reason"], "Alpha pending")
        self.assertEqual(by_project["beta"]["pending"][0]["reason"], "Beta pending")

    def test_dashboard_state_all_keeps_linked_project_when_another_catalog_is_unavailable(self):
        mutate_registry(self.state, {
            "action": "unlink-config",
            "expectedRevision": read_registry(self.state)["revision"],
            "projectId": "beta",
        })
        (self.state / "state" / "dashboard.json").write_text(json.dumps({
            "schemaVersion": 1,
            "projects": {
                "alpha": {"revision": 1, "meta": {
                    "name": "Alpha goal", "description": "", "presets": ["smoke"],
                }},
                "beta": {"revision": 2, "meta": {
                    "name": "Beta goal", "description": "", "presets": ["smoke"],
                }},
            },
        }), encoding="utf-8")

        with self._get("/api/dashboard-state?context=all") as response:
            payload = json.loads(response.read())

        by_project = {item["projectId"]: item for item in payload["projects"]}
        self.assertEqual(set(by_project), {"alpha", "beta"})
        self.assertEqual(by_project["alpha"]["meta"]["checks"][0]["status"], "pending")
        self.assertEqual(by_project["beta"]["catalog"], "unlinked")
        self.assertIsNone(by_project["beta"]["meta"]["checks"])
        self.assertEqual(payload["projectErrors"], [])

    def test_diagnostic_is_readable_without_catalog(self):
        mutate_registry(self.state, {
            "action": "unlink-config",
            "expectedRevision": read_registry(self.state)["revision"],
            "projectId": "beta",
        })
        with self._get("/api/diagnostic?projectId=beta&jobId=job-a") as response:
            foreign = json.loads(response.read())
        self.assertTrue(foreign["available"])
        self.assertEqual(foreign["ticket"]["id"], "job-a")
        with self._get("/api/diagnostic?projectId=beta&jobId=job-b") as response:
            payload = json.loads(response.read())
        self.assertTrue(payload["available"])
        self.assertEqual(payload["context"]["projectId"], "beta")

    def test_unlink_does_not_reuse_bootstrap_catalog(self):
        mutate_registry(self.state, {
            "action": "unlink-config",
            "expectedRevision": read_registry(self.state)["revision"],
            "projectId": "alpha",
        })
        with self.assertRaises(HTTPError) as denied:
            self._get("/api/preset-history?projectId=alpha")
        self.assertEqual(denied.exception.code, 409)
        body = json.loads(denied.exception.read())
        self.assertEqual(body["code"], "CATALOG_UNLINKED")

    def test_legacy_scope_does_not_override_explicit_project(self):
        with self._get("/api/executions?projectId=alpha&scope=legacy") as response:
            payload = json.loads(response.read())
        self.assertEqual(payload["context"]["projectId"], "alpha")
        self.assertEqual([job["id"] for job in payload["jobs"]], ["job-a"])
        self.assertNotIn("job-none", [job["id"] for job in payload["jobs"]])

    def test_project_id_and_context_all_are_http_400(self):
        with self.assertRaises(HTTPError) as rejected:
            self._get("/api/status?projectId=alpha&context=all")
        self.assertEqual(rejected.exception.code, 400)
        with self.assertRaises(HTTPError) as unassigned:
            self._get("/api/status?projectId=alpha&context=unassigned")
        self.assertEqual(unassigned.exception.code, 400)

    def test_cross_project_job_and_log_are_readable(self):
        for suffix in ("/api/job?projectId=beta&jobId=job-a",
                       "/api/job?context=all&jobId=job-a",
                       "/api/job?context=unassigned&jobId=job-a"):
            with self._get(suffix) as response:
                payload = json.loads(response.read())
            self.assertEqual(payload["id"], "job-a")
            self.assertEqual(payload["projectId"], "alpha")
        with self._get("/api/log?projectId=beta&jobId=job-a") as response:
            log = json.loads(response.read())
        self.assertIn("UNIQUE_ALPHA_LOG", log["content"])
        with self._get("/api/log/export?context=all&jobId=job-a") as response:
            exported = json.loads(response.read())
        self.assertIn("UNIQUE_ALPHA_LOG", exported["content"])
        with self._get("/api/diagnostic?context=unassigned&jobId=job-a") as response:
            diagnostic = json.loads(response.read())
        self.assertTrue(diagnostic["available"])

    def test_unassigned_file_is_explicit(self):
        with self._get("/api/executions?context=unassigned") as response:
            payload = json.loads(response.read())
        self.assertEqual(payload["context"]["kind"], "unassigned")
        self.assertEqual([job["id"] for job in payload["jobs"]], ["job-none"])
        with self._get("/api/job?context=unassigned&jobId=job-none") as response:
            job = json.loads(response.read())
        self.assertEqual(job["id"], "job-none")
        with self._get("/api/executions?projectId=alpha") as response:
            alpha = json.loads(response.read())
        self.assertEqual([job["id"] for job in alpha["jobs"]], ["job-a"])
        self.assertNotIn("job-none", [job["id"] for job in alpha["jobs"]])

    def test_status_living_is_global_and_history_follows_the_filter(self):
        (self.state / "running.json").write_text(json.dumps({
            "id": "live-beta", "projectId": "beta", "projectName": "Beta",
            "preset": "smoke", "status": "running",
        }), encoding="utf-8")
        with self._get("/api/status?projectId=alpha") as response:
            alpha = json.loads(response.read())
        self.assertEqual(alpha["running"]["id"], "live-beta")
        self.assertEqual(alpha["running"]["projectName"], "Beta")
        self.assertEqual([job["id"] for job in alpha["history"]], ["job-a"])
        with self._get("/api/status?context=unassigned") as response:
            unassigned = json.loads(response.read())
        self.assertEqual(unassigned["running"]["id"], "live-beta")
        self.assertEqual([job["id"] for job in unassigned["history"]], ["job-none"])
        with self._get("/api/status?context=all") as response:
            all_projects = json.loads(response.read())
        self.assertEqual(all_projects["running"]["id"], "live-beta")
        self.assertEqual({job["id"] for job in all_projects["history"]}, {"job-a", "job-b"})
        self.assertNotIn("job-none", [job["id"] for job in all_projects["history"]])
        with self._get("/api/executions?context=all") as response:
            executions = json.loads(response.read())
        self.assertEqual({job["id"] for job in executions["jobs"]}, {"job-a", "job-b"})
        with self._get("/api/executions?context=all&q=Alpha") as response:
            named = json.loads(response.read())
        self.assertEqual([job["id"] for job in named["jobs"]], ["job-a"])

    def test_get_does_not_write_registry(self):
        before = (self.state / "state" / "projects.json").read_bytes()
        with self._get("/api/projects") as response:
            payload = json.loads(response.read())
        self.assertEqual((self.state / "state" / "projects.json").read_bytes(), before)
        self.assertEqual({item["id"] for item in payload["projects"]}, {"alpha", "beta"})
        alpha = next(item for item in payload["projects"] if item["id"] == "alpha")
        self.assertTrue(alpha["repositoryAvailable"])
        self.assertEqual(Path(alpha["resolvedRepositoryPath"]), self.repo_a.resolve())

    def test_worktrees_survive_dead_registered_path(self):
        path = self.state / "state" / "projects.json"
        document = json.loads(path.read_text(encoding="utf-8"))
        document["projects"]["alpha"]["repositoryPath"] = str(self.root / "deleted-lane")
        path.write_text(json.dumps(document, sort_keys=True) + "\n", encoding="utf-8")
        with self._get("/api/worktrees?projectId=alpha") as response:
            payload = json.loads(response.read())
        self.assertIsNone(payload["error"])
        self.assertTrue(any(
            Path(item["path"]).resolve() == self.repo_a.resolve()
            for item in payload["worktrees"]
        ))
        with self._get("/api/projects") as response:
            listing = json.loads(response.read())
        alpha = next(item for item in listing["projects"] if item["id"] == "alpha")
        self.assertTrue(alpha["repositoryAvailable"])
        self.assertEqual(Path(alpha["resolvedRepositoryPath"]), self.repo_a.resolve())
        self.assertEqual(alpha["repositoryPath"], str(self.root / "deleted-lane"))

    def test_worktrees_all_tags_projects_and_keeps_a_partial_failure(self):
        with self._get("/api/worktrees?context=all") as response:
            payload = json.loads(response.read())
        names = {item["projectName"] for item in payload["worktrees"]}
        self.assertEqual(names, {"Alpha", "Beta"})
        self.assertTrue(all(item["projectId"] in {"alpha", "beta"} for item in payload["worktrees"]))
        self.assertIsNone(payload["error"])
        document = json.loads((self.state / "state" / "projects.json").read_text(encoding="utf-8"))
        document["projects"]["beta"]["repositoryPath"] = str(self.root / "missing-beta")
        document["projects"]["beta"]["gitCommonDir"] = str(self.root / "missing-beta.git")
        (self.state / "state" / "projects.json").write_text(json.dumps(document, sort_keys=True) + "\n", encoding="utf-8")
        with self._get("/api/worktrees?context=all") as response:
            surviving = json.loads(response.read())
        self.assertTrue(any(item["projectId"] == "alpha" for item in surviving["worktrees"]))
        self.assertFalse(any(item["projectId"] == "beta" for item in surviving["worktrees"]))
        self.assertTrue(any(item["projectId"] == "beta" for item in surviving["projectErrors"]))

    def test_worktree_view_all_requires_the_owner(self):
        with self.assertRaises(HTTPError) as missing:
            self._get("/api/worktree-view?context=all&id=unknown")
        self.assertEqual(missing.exception.code, 400)
        with self._get("/api/worktrees?projectId=alpha") as response:
            inventory = json.loads(response.read())
        owner_id = inventory["worktrees"][0]["id"]
        with self._get("/api/worktree-view?context=all&ownerProjectId=alpha&id=" + owner_id) as response:
            view = json.loads(response.read())
        self.assertEqual(view["id"], owner_id)
        self.assertEqual(view["context"]["kind"], "all")

    def test_analysis_all_namespaces_presets_and_isolates_duration(self):
        self._write_job("job-a-check", "alpha", b"UNIQUE_ALPHA_LOG", preset="check")
        self._write_job("job-b-check", "beta", b"UNIQUE_BETA_LOG", preset="check")
        self._write_job(
            "job-a-dur", "alpha", b"UNIQUE_ALPHA_LOG",
            startedAt="2026-09-13T10:00:00Z", durationMs=1000, exitCode=0,
        )
        self._write_job(
            "job-b-dur", "beta", b"UNIQUE_BETA_LOG",
            startedAt="2026-09-13T10:00:00Z", durationMs=5000, exitCode=0,
        )
        invalidate_history_cache()
        with self._get("/api/analysis?context=all&metric=results") as response:
            results = json.loads(response.read())
        self.assertEqual(results["context"]["kind"], "all")
        checks = {(row["projectId"], row["projectName"]) for row in results["presets"] if row["preset"] == "check"}
        self.assertEqual(checks, {("alpha", "Alpha"), ("beta", "Beta")})
        smokes = {(row["projectId"], row["preset"]) for row in results["presets"] if row["preset"] == "smoke"}
        self.assertEqual(smokes, {("alpha", "smoke"), ("beta", "smoke")})
        keys = {item["key"] for item in results["durationPresets"]}
        self.assertIn("alpha:smoke", keys)
        self.assertIn("beta:smoke", keys)
        with self.assertRaises(HTTPError) as bare:
            self._get("/api/analysis?context=all&metric=duration&preset=smoke")
        self.assertEqual(bare.exception.code, 400)
        with self._get("/api/analysis?context=all&metric=duration&preset=alpha:smoke") as response:
            alpha = json.loads(response.read())
        with self._get("/api/analysis?context=all&metric=duration&preset=beta:smoke") as response:
            beta = json.loads(response.read())
        self.assertEqual(alpha["projectId"], "alpha")
        self.assertEqual(beta["projectId"], "beta")
        self.assertEqual(alpha["presets"][0]["duration"]["minMs"], 1000)
        self.assertEqual(beta["presets"][0]["duration"]["minMs"], 5000)
        with self.assertRaises(HTTPError) as unassigned:
            self._get("/api/analysis?context=unassigned&metric=results")
        self.assertEqual(unassigned.exception.code, 409)
        body = json.loads(unassigned.exception.read())
        self.assertEqual(body["code"], "PROJECT_REQUIRED")

    def test_project_post_requires_csrf_and_origin(self):
        body = {"action": "rename", "expectedRevision": 1, "projectId": "alpha", "displayName": "Nope"}
        with self.assertRaises(HTTPError) as missing:
            self._post("/api/projects", body, {"Content-Type": "application/json"})
        self.assertEqual(missing.exception.code, 403)
        with self.assertRaises(HTTPError) as origin:
            self._post("/api/projects", body, {
                "Content-Type": "application/json",
                "X-CI-CSRF": "csrf-test",
                "Origin": "https://evil.example",
            })
        self.assertEqual(origin.exception.code, 403)
        with self.assertRaises(HTTPError) as host:
            request = Request(self.base + "/api/projects", data=json.dumps(body).encode(), method="POST",
                              headers={
                                  "Content-Type": "application/json",
                                  "X-CI-CSRF": "csrf-test",
                                  "Origin": self.base,
                                  "Host": "evil.example",
                              })
            urlopen(request, timeout=3)
        self.assertIn(host.exception.code, {400, 403})

    def test_failed_probe_of_a_does_not_break_b(self):
        headers = {
            "Content-Type": "application/json",
            "X-CI-CSRF": "csrf-test",
            "Origin": self.base,
        }
        with self.assertRaises(HTTPError):
            self._post("/api/project-probe", {"repositoryPath": str(self.root / "missing-a")}, headers)
        with self._get("/api/status?projectId=beta") as response:
            payload = json.loads(response.read())
        self.assertEqual(payload["context"]["projectId"], "beta")
        self.assertEqual(payload["project"]["id"], "beta")

    def test_health_survives_missing_registry_file(self):
        with self._get("/health") as response:
            payload = json.loads(response.read())
        self.assertTrue(payload["ok"])
        self.assertNotIn("history", payload)

    def test_project_pick_requires_csrf_and_does_not_run_on_get(self):
        with self.assertRaises(HTTPError) as missing:
            self._get("/api/project-pick")
        self.assertEqual(missing.exception.code, 404)
        with self.assertRaises(HTTPError) as forbidden:
            self._post("/api/project-pick", {"kind": "directory"}, {"Content-Type": "application/json"})
        self.assertEqual(forbidden.exception.code, 403)

    def test_project_pick_returns_host_path(self):
        headers = {
            "Content-Type": "application/json",
            "X-CI-CSRF": "csrf-test",
            "Origin": self.base,
        }
        from unittest.mock import patch
        with patch("ci_queue_api.server.pick_local_path", return_value={"path": "/tmp/picked", "kind": "directory"}):
            with self._post("/api/project-pick", {"kind": "directory"}, headers) as response:
                payload = json.loads(response.read())
        self.assertEqual(payload["path"], "/tmp/picked")

    def test_revision_conflict_on_rename(self):
        headers = {
            "Content-Type": "application/json",
            "X-CI-CSRF": "csrf-test",
            "Origin": self.base,
        }
        with self.assertRaises(HTTPError) as rejected:
            self._post("/api/projects", {
                "action": "rename",
                "expectedRevision": 0,
                "projectId": "alpha",
                "displayName": "Nope",
            }, headers)
        self.assertEqual(rejected.exception.code, 409)


if __name__ == "__main__":
    unittest.main()
