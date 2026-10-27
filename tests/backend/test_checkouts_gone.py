"""What the dashboard still answers after a project's checkouts are deleted.

Deleting lanes is supported: the registry resolves the project through the
shared ``.git`` of the main clone. Deleting the main clone too is a known
limit: history, status and tickets stay readable, but greens need the catalog
and answer 409 ``CATALOG_UNLINKED``.
"""

import json
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "tests" / "backend"))

from ci_queue_api.config import load_project_config
from ci_queue_api.projects import bootstrap_registry, mutate_registry, probe_project, read_registry
from ci_queue_api.records import invalidate_history_cache
from ci_queue_api.server import ApiContext, create_server
from test_project_scope import _config, _init_repo

SHA = "b" * 40


class CheckoutsGoneTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.state = self.root / "state-root"
        for directory in ("history", "jobs", "logs", "progress", "state"):
            (self.state / directory).mkdir(parents=True, exist_ok=True)
        self.repo_a = _init_repo(self.root / "repo-a")
        self.config_a = _config(self.repo_a, "alpha", "Alpha")
        bootstrap_registry(self.state, self.config_a)
        self.main_b = _init_repo(self.root / "repo-b")
        _config(self.main_b, "beta", "Beta")
        subprocess.run(["git", "-C", str(self.main_b), "add", "ci-queue.json"],
                       check=True, capture_output=True)
        subprocess.run(["git", "-C", str(self.main_b), "commit", "-m", "catalog"],
                       check=True, capture_output=True)
        self.lane_b = self.root / "repo-b-lane"
        subprocess.run(["git", "-C", str(self.main_b), "worktree", "add", "-q", str(self.lane_b)],
                       check=True, capture_output=True)
        preview = probe_project(self.state, {"repositoryPath": str(self.lane_b)})
        mutate_registry(self.state, {
            "action": "register",
            "expectedRevision": read_registry(self.state)["revision"],
            "identitySource": "config",
            "repositoryPath": str(self.lane_b),
            "signature": preview["signature"],
        })
        entry = read_registry(self.state)["projects"]["beta"]
        self.assertEqual(Path(entry["configPath"]).resolve(), (self.lane_b / "ci-queue.json").resolve())
        payload = {
            "id": "beta-smoke",
            "projectId": "beta",
            "projectName": "Beta",
            "preset": "smoke",
            "status": "passed",
            "exitCode": 0,
            "finishedAt": "2026-10-26T10:01:01Z",
            "argv": ["node", "--version"],
            "headSha": SHA,
        }
        (self.state / "history" / "beta-smoke.json").write_text(json.dumps(payload), encoding="utf-8")
        (self.state / "logs" / "beta-smoke.log").write_bytes(b"UNIQUE_BETA_LOG")
        self.server = None
        self._start()
        self.addCleanup(self._stop)
        self.addCleanup(invalidate_history_cache)

    def _start(self):
        invalidate_history_cache()
        config = load_project_config(self.config_a)
        self.server = create_server(ApiContext(config, self.state, None, "csrf-test"), port=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = "http://127.0.0.1:%s" % self.server.server_address[1]

    def _stop(self):
        if self.server is None:
            return
        self.server.shutdown()
        self.thread.join(1)
        self.server.server_close()
        self.server = None

    def _restart(self):
        self._stop()
        self._start()

    def _json(self, path):
        with urlopen(self.base + path, timeout=3) as response:
            return json.loads(response.read())

    def _denied(self, path):
        with self.assertRaises(HTTPError) as denied:
            urlopen(self.base + path, timeout=3)
        self.assertEqual(denied.exception.code, 409)
        return json.loads(denied.exception.read())

    def _beta_listing(self):
        return next(item for item in self._json("/api/projects")["projects"] if item["id"] == "beta")

    def _assert_records_readable(self):
        history = self._json("/api/executions?projectId=beta")
        self.assertEqual([job["id"] for job in history["jobs"]], ["beta-smoke"])
        self.assertEqual(self._json("/api/status?projectId=beta")["context"]["projectId"], "beta")
        self.assertEqual(self._json("/api/job?projectId=beta&jobId=beta-smoke")["id"], "beta-smoke")
        log = self._json("/api/log?projectId=beta&jobId=beta-smoke")
        self.assertIn("UNIQUE_BETA_LOG", json.dumps(log))

    def test_deleting_the_registered_lane_keeps_every_reading(self):
        shutil.rmtree(self.lane_b)
        self._restart()
        listing = self._beta_listing()
        self.assertTrue(listing["repositoryAvailable"])
        self.assertEqual(Path(listing["resolvedRepositoryPath"]), self.main_b.resolve())
        self._assert_records_readable()
        greens = self._json("/api/preset-history?projectId=beta")
        smoke = next(row for row in greens["presets"] if row["preset"] == "smoke")
        self.assertEqual(smoke["lastGreenCanonical"]["ticketId"], "beta-smoke")
        self.assertEqual(self._json("/api/remote-slots?projectId=beta")["context"]["projectId"], "beta")

    def test_deleting_the_main_clone_keeps_records_and_denies_greens(self):
        shutil.rmtree(self.lane_b)
        shutil.rmtree(self.main_b)
        self._restart()
        self.assertFalse(self._beta_listing()["repositoryAvailable"])
        self._assert_records_readable()
        for endpoint in ("preset-history", "remote-slots"):
            self.assertEqual(self._denied("/api/%s?projectId=beta" % endpoint)["code"], "CATALOG_UNLINKED")
        everyone = self._json("/api/preset-history?context=all")
        self.assertEqual({row["projectId"] for row in everyone["presets"]}, {"alpha"})
        self.assertEqual([item["projectId"] for item in everyone["projectErrors"]], ["beta"])


if __name__ == "__main__":
    unittest.main()
