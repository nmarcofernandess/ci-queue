"""Registry local de projetos: persistência, probe Git e lifecycle."""

import hashlib
import json
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from ci_queue_api.config import ConfigError, load_project_config
from ci_queue_api.projects import (
    RevisionConflict,
    RegistryError,
    bootstrap_registry,
    mutate_registry,
    probe_project,
    read_registry,
    resolve_config_for_entry,
    resolve_repository,
)
from ci_queue_api.records import invalidate_history_cache


def _sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


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


def _write_config(repo, project_id="alpha", name="Alpha", **extra):
    payload = {
        "schemaVersion": 1,
        "project": {"id": project_id, "name": name},
        "repository": {"path": str(repo)},
        "presets": {"smoke": {"argv": ["node", "--version"]}},
    }
    payload.update(extra)
    path = repo / "ci-queue.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


class ProjectRegistryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.state = self.root / "state-root"
        for directory in ("history", "jobs", "logs", "progress", "state"):
            (self.state / directory).mkdir(parents=True, exist_ok=True)
        invalidate_history_cache()
        self.addCleanup(invalidate_history_cache)

    def _history(self, ident, project_id="observed"):
        payload = {
            "id": ident,
            "projectId": project_id,
            "preset": "smoke",
            "status": "passed",
            "finishedAt": "2026-09-13T10:01:01Z",
        }
        path = self.state / "history" / (ident + ".json")
        path.write_text(json.dumps(payload), encoding="utf-8")
        return path

    def test_missing_registry_is_empty_and_does_not_create_files(self):
        document = read_registry(self.state)
        self.assertEqual(document["schemaVersion"], 1)
        self.assertEqual(document["revision"], 0)
        self.assertEqual(document["projects"], {})
        self.assertIsNone(document["bootstrapProjectId"])
        self.assertFalse((self.state / "state" / "projects.json").exists())

    def test_registration_is_idempotent_and_keeps_external_files(self):
        repo = _init_repo(self.root / "repo")
        config = _write_config(repo)
        before = config.read_bytes()
        first = bootstrap_registry(self.state, config)
        second = bootstrap_registry(self.state, config)
        self.assertEqual(first, second)
        self.assertEqual(list(first["projects"]), ["alpha"])
        self.assertEqual(first["bootstrapProjectId"], "alpha")
        self.assertEqual(config.read_bytes(), before)
        mode = stat.S_IMODE((self.state / "state" / "projects.json").stat().st_mode)
        self.assertEqual(mode, 0o600)

    def test_registration_survives_reread_without_rewrite(self):
        repo = _init_repo(self.root / "repo")
        config = _write_config(repo)
        bootstrap_registry(self.state, config)
        path = self.state / "state" / "projects.json"
        before = path.read_bytes()
        document = read_registry(self.state)
        self.assertEqual(list(document["projects"]), ["alpha"])
        self.assertEqual(path.read_bytes(), before)

    def test_invalid_first_bootstrap_does_not_invent_a_project(self):
        repo = _init_repo(self.root / "broken")
        config = repo / "ci-queue.json"
        config.write_text(json.dumps({"schemaVersion": 1, "presets": {}}), encoding="utf-8")
        with self.assertRaises(ConfigError):
            bootstrap_registry(self.state, config)
        self.assertFalse((self.state / "state" / "projects.json").exists())
        self.assertEqual(read_registry(self.state)["projects"], {})

    def test_rename_keeps_id_and_second_bootstrap_keeps_alias(self):
        repo = _init_repo(self.root / "repo")
        config = _write_config(repo)
        bootstrap_registry(self.state, config)
        renamed = mutate_registry(self.state, {
            "action": "rename",
            "expectedRevision": 1,
            "projectId": "alpha",
            "displayName": "Alpha local",
        })
        self.assertEqual(renamed["projects"]["alpha"]["id"], "alpha")
        self.assertEqual(renamed["projects"]["alpha"]["displayName"], "Alpha local")
        again = bootstrap_registry(self.state, config)
        self.assertEqual(again["projects"]["alpha"]["displayName"], "Alpha local")
        self.assertEqual(again["revision"], renamed["revision"])

    def test_archive_and_restore_keep_the_same_id(self):
        repo = _init_repo(self.root / "repo")
        config = _write_config(repo)
        bootstrap_registry(self.state, config)
        archived = mutate_registry(self.state, {
            "action": "archive",
            "expectedRevision": 1,
            "projectId": "alpha",
        })
        self.assertIsNotNone(archived["projects"]["alpha"]["archivedAt"])
        restored = mutate_registry(self.state, {
            "action": "restore",
            "expectedRevision": archived["revision"],
            "projectId": "alpha",
        })
        self.assertIsNone(restored["projects"]["alpha"]["archivedAt"])
        self.assertEqual(restored["projects"]["alpha"]["id"], "alpha")

    def test_folder_without_config_does_not_write_ci_queue_json(self):
        repo = _init_repo(self.root / "plain")
        preview = probe_project(self.state, {"repositoryPath": str(repo)})
        self.assertIsNone(preview["configPath"])
        self.assertEqual(preview["bindingState"], "unlinked")
        created = mutate_registry(self.state, {
            "action": "register",
            "expectedRevision": 0,
            "identitySource": "new",
            "repositoryPath": str(repo),
            "signature": preview["signature"],
        })
        project_id = next(iter(created["projects"]))
        self.assertTrue(project_id.startswith("proj-"))
        self.assertIsNone(created["projects"][project_id]["configPath"])
        self.assertFalse((repo / "ci-queue.json").exists())
        with self.assertRaises(ConfigError):
            load_project_config(self.root / "missing-ci-queue.json")
        source = (ROOT / "src" / "contracts" / "config.ts").read_text(encoding="utf-8")
        self.assertIn('campo "presets" não pode estar vazio', source)
        completed = subprocess.run(
            ["npx", "tsx", "-e",
             "import { parseQueueConfig } from './src/contracts/config.ts';"
             "try { parseQueueConfig({schemaVersion:1,project:{id:'x',name:'X'},presets:{}}, '/tmp');"
             " process.exit(2) } catch (error) {"
             " process.exit(String(error).includes('vazio') ? 0 : 3) }"],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)

    def test_observed_identity_requires_records_and_does_not_rewrite_them(self):
        ticket = self._history("ticket-1", "observed-one")
        log = self.state / "logs" / "ticket-1.log"
        log.write_bytes(b"log-bytes")
        ledger = self.state / "state" / "legacy-projects.json"
        ledger.write_text(json.dumps({"schemaVersion": 1, "assignments": {}}), encoding="utf-8")
        meta = self.state / "state" / "dashboard.json"
        meta.write_text(json.dumps({"schemaVersion": 1, "projects": {}}), encoding="utf-8")
        before = {
            "ticket": ticket.read_bytes(),
            "log": log.read_bytes(),
            "ledger": ledger.read_bytes(),
            "meta": meta.read_bytes(),
        }
        with self.assertRaises(ValueError):
            mutate_registry(self.state, {
                "action": "register",
                "expectedRevision": 0,
                "identitySource": "observed",
                "existingProjectId": "invented",
            })
        created = mutate_registry(self.state, {
            "action": "register",
            "expectedRevision": 0,
            "identitySource": "observed",
            "existingProjectId": "observed-one",
            "displayName": "Observado",
        })
        self.assertEqual(created["projects"]["observed-one"]["id"], "observed-one")
        self.assertIsNone(created["projects"]["observed-one"]["repositoryPath"])
        self.assertEqual(ticket.read_bytes(), before["ticket"])
        self.assertEqual(log.read_bytes(), before["log"])
        self.assertEqual(ledger.read_bytes(), before["ledger"])
        self.assertEqual(meta.read_bytes(), before["meta"])

    def test_probe_normalizes_spaces_symlink_and_subdir(self):
        repo = _init_repo(self.root / "repo with spaces")
        nested = repo / "src"
        nested.mkdir()
        alias = self.root / "alias-link"
        alias.symlink_to(repo)
        spaced = probe_project(self.state, {"repositoryPath": str(nested)})
        linked = probe_project(self.state, {"repositoryPath": str(alias)})
        self.assertEqual(Path(spaced["repositoryPath"]), repo.resolve())
        self.assertEqual(Path(spaced["gitCommonDir"]), Path(linked["gitCommonDir"]))
        self.assertFalse(spaced["bare"])

    def test_probe_rejects_missing_url_and_bare(self):
        with self.assertRaises(ValueError):
            probe_project(self.state, {"repositoryPath": str(self.root / "missing")})
        with self.assertRaises(ValueError):
            probe_project(self.state, {"repositoryPath": "https://example.com/repo.git"})
        bare = self.root / "bare.git"
        subprocess.run(["git", "init", "--bare", str(bare)], check=True, capture_output=True)
        with self.assertRaises(ValueError):
            probe_project(self.state, {"repositoryPath": str(bare)})

    def test_probe_timeout_is_bounded(self):
        repo = _init_repo(self.root / "slow")
        with mock.patch("ci_queue_api.projects.subprocess.run", side_effect=subprocess.TimeoutExpired("git", 8)):
            with self.assertRaises(TimeoutError):
                probe_project(self.state, {"repositoryPath": str(repo)})

    def test_register_rejects_stale_preview_signature(self):
        repo = _init_repo(self.root / "repo")
        config = _write_config(repo)
        preview = probe_project(self.state, {"repositoryPath": str(repo)})
        config.write_text(json.dumps({
            "schemaVersion": 1,
            "project": {"id": "alpha", "name": "Changed"},
            "repository": {"path": str(repo)},
            "presets": {"smoke": {"argv": ["node", "--version"]}, "full": {"argv": ["true"]}},
        }), encoding="utf-8")
        with self.assertRaises(RevisionConflict):
            mutate_registry(self.state, {
                "action": "register",
                "expectedRevision": 0,
                "identitySource": "config",
                "repositoryPath": str(repo),
                "signature": preview["signature"],
            })

    def test_second_worktree_does_not_create_another_project(self):
        repo = _init_repo(self.root / "main-repo")
        _write_config(repo)
        linked = self.root / "linked"
        subprocess.run(["git", "-C", str(repo), "worktree", "add", str(linked)],
                       check=True, capture_output=True)
        first = probe_project(self.state, {"repositoryPath": str(repo)})
        created = mutate_registry(self.state, {
            "action": "register",
            "expectedRevision": 0,
            "identitySource": "config",
            "repositoryPath": str(repo),
            "signature": first["signature"],
        })
        second = probe_project(self.state, {"repositoryPath": str(linked)})
        self.assertEqual(second["conflicts"][0]["code"], "git-common-dir-bound")
        with self.assertRaises(RevisionConflict):
            mutate_registry(self.state, {
                "action": "register",
                "expectedRevision": created["revision"],
                "identitySource": "new",
                "repositoryPath": str(linked),
                "signature": second["signature"],
            })
        self.assertEqual(list(read_registry(self.state)["projects"]), ["alpha"])

    def test_same_id_other_clone_is_an_explicit_conflict(self):
        first_repo = _init_repo(self.root / "clone-a")
        second_repo = _init_repo(self.root / "clone-b")
        _write_config(first_repo)
        _write_config(second_repo)
        preview = probe_project(self.state, {"repositoryPath": str(first_repo)})
        created = mutate_registry(self.state, {
            "action": "register",
            "expectedRevision": 0,
            "identitySource": "config",
            "repositoryPath": str(first_repo),
            "signature": preview["signature"],
        })
        other = probe_project(self.state, {"repositoryPath": str(second_repo)})
        self.assertEqual(other["conflicts"][0]["code"], "project-id-bound")
        with self.assertRaises(RevisionConflict):
            mutate_registry(self.state, {
                "action": "register",
                "expectedRevision": created["revision"],
                "identitySource": "config",
                "repositoryPath": str(second_repo),
                "signature": other["signature"],
            })

    def test_relocate_and_divergent_config_path(self):
        old = _init_repo(self.root / "old")
        new = _init_repo(self.root / "new")
        config = _write_config(old)
        preview = probe_project(self.state, {"repositoryPath": str(old)})
        created = mutate_registry(self.state, {
            "action": "register",
            "expectedRevision": 0,
            "identitySource": "config",
            "repositoryPath": str(old),
            "signature": preview["signature"],
        })
        moved = probe_project(self.state, {
            "repositoryPath": str(new),
            "configPath": str(config),
        })
        self.assertTrue(any(item["code"] == "config-repository-mismatch" for item in moved["conflicts"]))
        with self.assertRaises(RevisionConflict):
            mutate_registry(self.state, {
                "action": "relocate",
                "expectedRevision": created["revision"],
                "projectId": "alpha",
                "repositoryPath": str(new),
                "configPath": str(config),
                "signature": moved["signature"],
            })
        unlinked = mutate_registry(self.state, {
            "action": "unlink-config",
            "expectedRevision": created["revision"],
            "projectId": "alpha",
        })
        self.assertIsNone(unlinked["projects"]["alpha"]["configPath"])
        fresh = probe_project(self.state, {"repositoryPath": str(new)})
        relocated = mutate_registry(self.state, {
            "action": "relocate",
            "expectedRevision": unlinked["revision"],
            "projectId": "alpha",
            "repositoryPath": str(new),
            "signature": fresh["signature"],
        })
        self.assertEqual(Path(relocated["projects"]["alpha"]["repositoryPath"]), new.resolve())

    def test_config_id_mismatch_is_rejected(self):
        repo = _init_repo(self.root / "repo")
        _write_config(repo, project_id="beta", name="Beta")
        preview = probe_project(self.state, {
            "repositoryPath": str(repo),
            "existingProjectId": "alpha",
        })
        self.assertTrue(any(item["code"] == "config-id-mismatch" for item in preview["conflicts"]))
        with self.assertRaises(ValueError):
            mutate_registry(self.state, {
                "action": "register",
                "expectedRevision": 0,
                "identitySource": "observed",
                "existingProjectId": "alpha",
                "repositoryPath": str(repo),
                "signature": preview["signature"],
            })

    def test_corrupt_registry_preserves_bytes(self):
        path = self.state / "state" / "projects.json"
        path.write_bytes(b"{not-json")
        digest = _sha256(path)
        with self.assertRaises(RegistryError):
            read_registry(self.state)
        self.assertEqual(_sha256(path), digest)
        path.write_text(json.dumps({
            "schemaVersion": 99,
            "revision": 1,
            "bootstrapProjectId": None,
            "projects": {},
        }), encoding="utf-8")
        digest = _sha256(path)
        with self.assertRaises(RegistryError):
            read_registry(self.state)
        self.assertEqual(_sha256(path), digest)

    def test_revision_conflict_does_not_apply_partially(self):
        repo = _init_repo(self.root / "repo")
        config = _write_config(repo)
        first = bootstrap_registry(self.state, config)
        with self.assertRaises(RevisionConflict):
            mutate_registry(self.state, {
                "action": "rename",
                "expectedRevision": 0,
                "projectId": "alpha",
                "displayName": "Nao",
            })
        current = read_registry(self.state)
        self.assertEqual(current, first)
        self.assertEqual(current["projects"]["alpha"]["displayName"], "Alpha")

    def test_bootstrap_from_linked_worktree_on_dev_persists_main_checkout(self):
        main = _init_repo(self.root / "durable")
        subprocess.run(["git", "-C", str(main), "branch", "-M", "dev"], check=True, capture_output=True)
        heads = subprocess.run(
            ["git", "-C", str(main), "for-each-ref", "--format=%(refname:short)", "refs/heads"],
            check=True, capture_output=True, text=True,
        ).stdout.split()
        self.assertEqual(heads, ["dev"])
        linked = self.root / "lane"
        subprocess.run(["git", "-C", str(main), "worktree", "add", "-b", "codex/lane", str(linked)],
                       check=True, capture_output=True)
        config = _write_config(linked)
        document = bootstrap_registry(self.state, config)
        entry = document["projects"]["alpha"]
        self.assertEqual(Path(entry["repositoryPath"]), main.resolve())
        self.assertEqual(Path(entry["gitCommonDir"]), (main / ".git").resolve())
        self.assertEqual(Path(entry["configPath"]), config.resolve())

    def test_bootstrap_heal_converges_linked_path_to_main_worktree(self):
        main = _init_repo(self.root / "durable")
        subprocess.run(["git", "-C", str(main), "branch", "-M", "dev"], check=True, capture_output=True)
        linked = self.root / "lane"
        subprocess.run(["git", "-C", str(main), "worktree", "add", str(linked)],
                       check=True, capture_output=True)
        config = _write_config(linked)
        first = bootstrap_registry(self.state, config)
        path = self.state / "state" / "projects.json"
        document = json.loads(path.read_text(encoding="utf-8"))
        document["projects"]["alpha"]["repositoryPath"] = str(linked.resolve())
        path.write_text(json.dumps(document, sort_keys=True) + "\n", encoding="utf-8")
        second = bootstrap_registry(self.state, config)
        self.assertEqual(Path(second["projects"]["alpha"]["repositoryPath"]), main.resolve())
        self.assertGreater(second["revision"], first["revision"])

    def test_reregister_updates_dead_locator_to_main_worktree(self):
        main = _init_repo(self.root / "durable")
        subprocess.run(["git", "-C", str(main), "branch", "-M", "dev"], check=True, capture_output=True)
        linked = self.root / "lane"
        subprocess.run(["git", "-C", str(main), "worktree", "add", str(linked)],
                       check=True, capture_output=True)
        config = _write_config(linked)
        created = bootstrap_registry(self.state, config)
        path = self.state / "state" / "projects.json"
        document = json.loads(path.read_text(encoding="utf-8"))
        document["projects"]["alpha"]["repositoryPath"] = str(self.root / "gone")
        path.write_text(json.dumps(document, sort_keys=True) + "\n", encoding="utf-8")
        preview = probe_project(self.state, {"repositoryPath": str(linked)})
        mutate_registry(self.state, {
            "action": "register",
            "expectedRevision": created["revision"],
            "identitySource": "config",
            "repositoryPath": str(linked),
            "signature": preview["signature"],
        })
        entry = read_registry(self.state)["projects"]["alpha"]
        self.assertEqual(Path(entry["repositoryPath"]), main.resolve())

    def test_dead_registered_path_resolves_through_common_dir(self):
        main = _init_repo(self.root / "durable")
        subprocess.run(["git", "-C", str(main), "branch", "-M", "dev"], check=True, capture_output=True)
        linked = self.root / "lane"
        subprocess.run(["git", "-C", str(main), "worktree", "add", str(linked)],
                       check=True, capture_output=True)
        config = _write_config(linked)
        bootstrap_registry(self.state, config)
        entry = dict(read_registry(self.state)["projects"]["alpha"])
        entry["repositoryPath"] = str(self.root / "gone")
        entry["configPath"] = str(self.root / "missing-ci-queue.json")
        locators = resolve_repository(entry)
        self.assertTrue(locators["available"])
        self.assertEqual(locators["effective"], main.resolve())
        loaded = resolve_config_for_entry(entry)
        self.assertEqual(loaded.project_id, "alpha")
        self.assertEqual(loaded.path.resolve(), config.resolve())


if __name__ == "__main__":
    unittest.main()
