"""'Integrado em <base>' read from the local tracking ref, without network."""

import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "tests" / "backend"))

from ci_queue_api.config import load_project_config
from ci_queue_api.integration import annotate_integration, integration_for, read_base
from ci_queue_api.projects import bootstrap_registry
from ci_queue_api.records import invalidate_history_cache
from ci_queue_api.server import ApiContext, create_server
from test_project_scope import _config, _init_repo

FETCHED = datetime(2026, 10, 26, 14, 33, 22, tzinfo=timezone.utc)


def _git(repo, *args, env=None):
    return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True,
                          text=True, env={**os.environ, **(env or {})}).stdout.strip()


def _commit(repo, message):
    _git(repo, "commit", "--allow-empty", "-m", message)
    return _git(repo, "rev-parse", "HEAD")


class IntegrationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.repo = _init_repo(self.root / "repo")
        self.merged = _commit(self.repo, "merged")
        _git(self.repo, "update-ref", "--create-reflog", "-m", "fetch --prune origin dev: fast-forward",
             "refs/remotes/origin/dev", self.merged,
             env={"GIT_COMMITTER_DATE": "%d +0000" % int(FETCHED.timestamp())})
        self.pending = _commit(self.repo, "pending")
        self.common = Path(_git(self.repo, "rev-parse", "--path-format=absolute", "--git-common-dir"))
        self.project = SimpleNamespace(project_id="alpha", git_common_dir=self.common,
                                       config=SimpleNamespace(base_ref="origin/dev"))

    def test_base_reading_names_the_tracking_ref_and_when_it_moved(self):
        reading = read_base(self.project)
        self.assertEqual(reading["tip"], self.merged)
        self.assertEqual(reading["baseName"], "dev")
        self.assertEqual(reading["readAt"], "2026-10-26T14:33:22Z")
        self.assertEqual(reading["via"], "fetch --prune origin dev: fast-forward")

    def test_states_follow_ancestry_and_the_age_of_the_reading(self):
        reading = read_base(self.project)
        soon = FETCHED.replace(hour=20)
        later = FETCHED.replace(day=28)
        self.assertEqual(integration_for(self.merged, reading, later)["state"], "integrated")
        self.assertEqual(integration_for(self.pending, reading, soon)["state"], "not-integrated")
        stale = integration_for(self.pending, reading, later)
        self.assertEqual(stale["state"], "stale")
        self.assertIn("24 horas", stale["reason"])
        self.assertEqual(integration_for("c" * 40, reading, soon)["state"], "unknown")
        self.assertEqual(integration_for("abc", reading, soon)["state"], "unknown")

    def test_without_the_git_dir_or_the_ref_the_answer_is_unknown(self):
        missing = SimpleNamespace(project_id="alpha", git_common_dir=self.root / "gone",
                                  config=SimpleNamespace(base_ref="origin/dev"))
        self.assertEqual(integration_for(self.merged, read_base(missing))["reason"],
                         "Sem o .git local do projeto.")
        other = SimpleNamespace(project_id="alpha", git_common_dir=self.common,
                                config=SimpleNamespace(base_ref="origin/main"))
        self.assertEqual(integration_for(self.merged, read_base(other))["reason"],
                         "Sem a ref local de origin/main.")

    def test_annotates_machine_and_git_greens_of_each_project(self):
        payload = {
            "presets": [{"projectId": "alpha", "lastGreenCanonical": {"headSha": self.merged}},
                        {"projectId": "alpha", "lastGreenCanonical": None},
                        {"projectId": "beta", "lastGreenCanonical": {"headSha": self.merged}}],
            "greens": [{"projectId": "alpha", "headSha": self.pending}],
        }
        annotate_integration(payload, [self.project], now=FETCHED.replace(hour=20))
        self.assertEqual(payload["presets"][0]["lastGreenCanonical"]["integration"]["state"], "integrated")
        self.assertIsNone(payload["presets"][1]["lastGreenCanonical"])
        self.assertNotIn("integration", payload["presets"][2]["lastGreenCanonical"])
        self.assertEqual(payload["greens"][0]["integration"]["state"], "not-integrated")

    def test_preset_history_api_carries_the_integration(self):
        state = self.root / "state-root"
        for directory in ("history", "jobs", "logs", "progress", "state"):
            (state / directory).mkdir(parents=True, exist_ok=True)
        repo = _init_repo(self.root / "project")
        config = _config(repo, "alpha", "Alpha")
        payload = json.loads(config.read_text())
        payload["repository"]["baseRef"] = "origin/dev"
        config.write_text(json.dumps(payload))
        head = _git(repo, "rev-parse", "HEAD")
        _git(repo, "update-ref", "--create-reflog", "-m", "fetch", "refs/remotes/origin/dev", head)
        bootstrap_registry(state, config)
        (state / "history" / "green.json").write_text(json.dumps({
            "id": "green", "projectId": "alpha", "preset": "smoke", "status": "passed",
            "exitCode": 0, "finishedAt": "2026-10-26T10:01:01Z", "argv": ["node", "--version"],
            "headSha": head,
        }), encoding="utf-8")
        invalidate_history_cache()
        self.addCleanup(invalidate_history_cache)
        server = create_server(ApiContext(load_project_config(config), state, None, "csrf-test"), port=0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            base = "http://127.0.0.1:%s" % server.server_address[1]
            with urlopen(base + "/api/preset-history?projectId=alpha", timeout=3) as response:
                rows = json.loads(response.read())["presets"]
            with urlopen(base + "/api/preset-history?context=all", timeout=3) as response:
                everyone = json.loads(response.read())["presets"]
        finally:
            server.shutdown()
            thread.join(1)
            server.server_close()
        for listing in (rows, everyone):
            green = next(row for row in listing if row["preset"] == "smoke")["lastGreenCanonical"]
            self.assertEqual(green["integration"]["state"], "integrated")
            self.assertEqual(green["integration"]["baseName"], "dev")


if __name__ == "__main__":
    unittest.main()
