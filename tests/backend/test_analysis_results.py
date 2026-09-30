"""Results aggregates use a per-preset four-state denominator."""

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from ci_queue_api.analysis import (
    parse_namespaced_preset,
    read_analysis,
    read_duration_all,
    read_results,
    read_results_all,
)
from ci_queue_api.config import load_project_config
from ci_queue_api.history import build_preset_history
from ci_queue_api.records import invalidate_history_cache, read_executions

FIXTURE = json.loads(
    (ROOT / "docs/superpowers/plans/2026-09-15-ci-queue-analysis-project-lifecycle"
     / "fixtures/analysis-cases.json").read_text(encoding="utf-8")
)


class AnalysisResultsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.state = self.root / "state-root"
        (self.state / "history").mkdir(parents=True)
        config_path = self.root / "ci-queue.json"
        config_path.write_text(json.dumps({
            "schemaVersion": 1,
            "project": {"id": "alpha", "name": "Alpha"},
            "presets": {"smoketest": {"argv": ["node", "--version"]}},
        }), encoding="utf-8")
        self.config = load_project_config(config_path)
        self.other_path = self.root / "beta.json"
        self.other_path.write_text(json.dumps({
            "schemaVersion": 1,
            "project": {"id": "beta", "name": "Beta"},
            "presets": {"smoketest": {"argv": ["node", "--version"]}},
        }), encoding="utf-8")
        self.other = load_project_config(self.other_path)
        invalidate_history_cache()
        self.addCleanup(invalidate_history_cache)

    def _job(self, ident, project_id, preset, status, finished_at, **extra):
        payload = {
            "id": ident,
            "projectId": project_id,
            "preset": preset,
            "status": status,
            "finishedAt": finished_at,
            "startedAt": extra.get("startedAt", "2026-09-13T10:00:00Z"),
            "durationMs": extra.get("durationMs", 1000),
            "argv": ["node", "--version"],
            "headSha": extra.get("headSha", "a" * 40),
            "branch": "main",
            "exitCode": 0 if status == "passed" else 1,
        }
        (self.state / "history" / (ident + ".json")).write_text(
            json.dumps(payload), encoding="utf-8"
        )

    def _expand_sample(self):
        index = 0
        for row in FIXTURE["rankingSample"]:
            for status in ("passed", "failed", "cancelled", "interrupted"):
                for _ in range(row[status]):
                    self._job(
                        "a-%s-%s" % (row["preset"], index),
                        "alpha",
                        row["preset"],
                        status,
                        "2026-09-13T10:%02d:%02dZ" % (index % 60, index % 60),
                    )
                    index += 1

    def test_results_keep_counts_and_ignore_undeclared_names(self):
        self._expand_sample()
        self._job("retired", "alpha", "retired-preset", "passed", "2026-09-13T11:00:00Z")
        payload = read_results(self.state, self.config, "2026-09-13T00:00:00Z", "2026-09-14T00:00:00Z")
        self.assertEqual(payload["schemaVersion"], 2)
        self.assertEqual(payload["metric"], "results")
        by_name = {row["preset"]: row for row in payload["presets"]}
        self.assertEqual(by_name["smoketest"]["total"], 1000)
        self.assertEqual(by_name["teste-pequeno"], {
            "preset": "teste-pequeno", "passed": 1, "failed": 1,
            "cancelled": 0, "interrupted": 0, "total": 2,
        })
        self.assertEqual(by_name["retired-preset"]["total"], 1)
        self.assertEqual(payload["sampleCount"], sum(row["total"] for row in payload["presets"]))
        self.assertGreater(payload["sampleCount"], 200)
        self.assertNotIn("points", payload["presets"][0])
        self.assertNotIn("passRate", payload["presets"][0])

    def test_same_preset_name_stays_in_its_project(self):
        self._job("a1", "alpha", "smoketest", "passed", "2026-09-13T10:00:00Z")
        self._job("b1", "beta", "smoketest", "failed", "2026-09-13T10:00:00Z")
        alpha = read_results(self.state, self.config)
        beta = read_results(self.state, self.other)
        self.assertEqual(alpha["presets"], [{
            "preset": "smoketest", "passed": 1, "failed": 0,
            "cancelled": 0, "interrupted": 0, "total": 1,
        }])
        self.assertEqual(beta["presets"], [{
            "preset": "smoketest", "passed": 0, "failed": 1,
            "cancelled": 0, "interrupted": 0, "total": 1,
        }])

    def test_duration_still_rejects_historical_undeclared_preset(self):
        self._job("old", "alpha", "retired-preset", "passed", "2026-09-13T10:00:00Z")
        with self.assertRaises(ValueError):
            read_analysis(self.state, self.config, preset="retired-preset", metric="duration")
        payload = read_analysis(self.state, self.config, metric="results")
        self.assertEqual(payload["presets"][0]["preset"], "retired-preset")

    def test_legacy_path_still_keeps_all_retained_rows(self):
        for index in range(230):
            self._job("p%03d" % index, "alpha", "smoketest", "passed",
                      "2026-09-13T10:%02d:00Z" % (index % 60))
        legacy = read_analysis(self.state, self.config, "2026-09-13T00:00:00Z", "2026-09-14T00:00:00Z")
        self.assertEqual(legacy["schemaVersion"], 1)
        self.assertEqual(legacy["total"], 230)
        results = read_analysis(
            self.state, self.config, "2026-09-13T00:00:00Z", "2026-09-14T00:00:00Z", metric="results",
        )
        self.assertEqual(results["sampleCount"], 230)

    def test_results_all_keeps_homonymous_presets_apart(self):
        self._job("a1", "alpha", "check", "passed", "2026-09-13T10:00:00Z")
        self._job("b1", "beta", "check", "passed", "2026-09-13T10:00:00Z")
        self._job("none", None, "check", "passed", "2026-09-13T10:00:00Z")
        payload = read_results_all(self.state)
        keys = {(row["projectId"], row["preset"]) for row in payload["presets"]}
        self.assertEqual(keys, {("alpha", "check"), ("beta", "check")})
        self.assertEqual(len(payload["presets"]), 2)
        self.assertEqual(payload["sampleCount"], 2)

    def test_duration_all_rejects_a_bare_preset(self):
        self.assertIsNone(parse_namespaced_preset("check"))
        self.assertEqual(parse_namespaced_preset("alpha:check"), ("alpha", "check"))
        with self.assertRaises(ValueError):
            read_duration_all(self.state, "check")

    def test_invalid_record_fields_preserve_good_results_history_and_coverage(self):
        self._job("good-a", "alpha", "smoketest", "passed", "2026-09-13T10:00:00Z")
        self._job("good-b", "beta", "smoketest", "failed", "2026-09-13T10:00:00Z")
        self._job("legacy", None, "smoketest", "passed", "2026-09-13T10:00:00Z")
        good_path = self.state / "history" / "good-a.json"
        original = good_path.read_bytes()
        bad_path = self.state / "history" / "bad.json"
        for field in ("projectId", "source", "id", "preset", "status", "projectName"):
            for value in (["alpha"], {"value": "alpha"}, 17, True, ""):
                with self.subTest(field=field, value=value):
                    bad = json.loads(original)
                    bad["id"] = "bad"
                    bad[field] = value
                    bad_path.write_text(json.dumps(bad))
                    invalidate_history_cache()
                    alpha = read_results(self.state, self.config)
                    all_results = read_results_all(self.state)
                    self.assertEqual(alpha["sampleCount"], 1)
                    self.assertEqual(all_results["sampleCount"], 2)
                    self.assertEqual(alpha["coverage"], {"unattributedRecords": 1, "corruptRecords": 1})
                    self.assertEqual(all_results["coverage"], alpha["coverage"])
                    for project, scope, expected in (("alpha", "terminal", {"good-a"}),
                                                     ("", "all", {"good-a", "good-b"}),
                                                     ("", "legacy", {"legacy"})):
                        page = read_executions(self.state, project, scope=scope)
                        self.assertEqual({job["id"] for job in page["jobs"]}, expected)
                        self.assertEqual(page["coverage"], alpha["coverage"])
                    duration = read_analysis(self.state, self.config, preset="smoketest")
                    self.assertEqual(duration["total"], 1)
                    greens = build_preset_history(self.state, self.config)
                    self.assertEqual(greens["coverage"], alpha["coverage"])
                    self.assertEqual(greens["presets"][0]["lastGreenCanonical"]["ticketId"], "good-a")
                    self.assertEqual(good_path.read_bytes(), original)
                    self.assertEqual(json.loads(bad_path.read_text()), bad)


if __name__ == "__main__":
    unittest.main()
