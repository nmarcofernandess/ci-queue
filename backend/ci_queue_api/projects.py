"""Local project registry, restricted Git probe and lifecycle mutations."""

import fcntl
import hashlib
import json
import os
import subprocess
import tempfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from .config import PROJECT_ID, ConfigError, load_project_config
from .records import read_history


class RevisionConflict(ValueError):
    pass


class RegistryError(ValueError):
    pass


GIT_BUDGET_S = 8.0
DISPLAY_NAME_LIMIT = 160
SCHEMA_VERSION = 1
STRIP_GIT = (
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_COMMON_DIR",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
)
ALLOWED = {
    "register": {
        "action", "expectedRevision", "identitySource", "repositoryPath",
        "configPath", "existingProjectId", "displayName", "signature",
    },
    "rename": {"action", "expectedRevision", "projectId", "displayName"},
    "archive": {"action", "expectedRevision", "projectId"},
    "restore": {"action", "expectedRevision", "projectId"},
    "relocate": {
        "action", "expectedRevision", "projectId", "repositoryPath",
        "configPath", "signature",
    },
    "link-config": {
        "action", "expectedRevision", "projectId", "configPath", "signature",
    },
    "unlink-config": {"action", "expectedRevision", "projectId"},
}


def _now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _registry_path(state_root):
    return Path(state_root) / "state" / "projects.json"


def _empty():
    return {
        "schemaVersion": SCHEMA_VERSION,
        "revision": 0,
        "bootstrapProjectId": None,
        "projects": {},
    }


def _write_atomic(path, document):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix="projects-", suffix=".json", dir=str(path.parent))
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(document, stream, ensure_ascii=False, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        os.chmod(path, 0o600)
    except BaseException:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


def _read_document(path):
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return _empty()
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise RegistryError("cadastro de projetos ilegível; arquivo preservado") from error
    if (not isinstance(document, dict)
            or document.get("schemaVersion") != SCHEMA_VERSION
            or type(document.get("revision")) is not int
            or document["revision"] < 0
            or not isinstance(document.get("projects"), dict)):
        raise RegistryError("cadastro de projetos inválido; arquivo preservado")
    bootstrap = document.get("bootstrapProjectId")
    if bootstrap is not None and (not isinstance(bootstrap, str) or not PROJECT_ID.fullmatch(bootstrap)):
        raise RegistryError("cadastro de projetos inválido; arquivo preservado")
    return document


def read_registry(state_root):
    return _read_document(_registry_path(state_root))


def _lock(state_root):
    directory = Path(state_root) / "state"
    directory.mkdir(parents=True, exist_ok=True)
    return (directory / "projects.lock").open("a+", encoding="utf-8")


def _normalize_path(raw, label):
    if raw is None:
        return None
    if not isinstance(raw, str) or not raw.strip():
        raise ValueError("%s inválido" % label)
    value = raw.strip()
    if "\x00" in value or "\n" in value or "\r" in value:
        raise ValueError("%s inválido" % label)
    if "://" in value or value.startswith("//"):
        raise ValueError("%s não pode ser URL" % label)
    path = Path(os.path.expanduser(value))
    if not path.is_absolute():
        raise ValueError("%s deve ser absoluto" % label)
    return path


def _display_name(raw, fallback):
    value = fallback if raw is None else raw
    if not isinstance(value, str):
        raise ValueError("nome de exibição inválido")
    value = value.strip()
    if not value or len(value) > DISPLAY_NAME_LIMIT:
        raise ValueError("nome de exibição inválido")
    return value


def _file_sha(path):
    if path is None or not Path(path).is_file():
        return None
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def _git_env():
    env = os.environ.copy()
    for key in STRIP_GIT:
        env.pop(key, None)
    env["GIT_OPTIONAL_LOCKS"] = "0"
    env["GIT_TERMINAL_PROMPT"] = "0"
    return env


def _run_git(folder, args, started):
    remaining = GIT_BUDGET_S - (time.monotonic() - started)
    if remaining <= 0:
        raise TimeoutError("inspeção Git excedeu 8s")
    try:
        completed = subprocess.run(
            ["git", "-C", str(folder), *args],
            check=False,
            capture_output=True,
            text=True,
            timeout=remaining,
            env=_git_env(),
        )
    except subprocess.TimeoutExpired as error:
        raise TimeoutError("inspeção Git excedeu 8s") from error
    if completed.returncode != 0:
        raise ValueError("pasta não é um repositório Git")
    return completed.stdout.strip()


def inspect_git(folder):
    started = time.monotonic()
    toplevel = Path(_run_git(folder, ["rev-parse", "--show-toplevel"], started)).resolve()
    try:
        common_raw = _run_git(folder, ["rev-parse", "--path-format=absolute", "--git-common-dir"], started)
        common = Path(common_raw)
        if not common.is_absolute():
            raise ValueError("common-dir relativo")
    except ValueError:
        common_raw = _run_git(folder, ["rev-parse", "--git-common-dir"], started)
        common = Path(common_raw)
        if not common.is_absolute():
            common = folder / common
    bare = _run_git(folder, ["rev-parse", "--is-bare-repository"], started) == "true"
    return {
        "repositoryPath": toplevel,
        "gitCommonDir": common.resolve(),
        "bare": bare,
    }


def _run_git_dir(git_dir, args, started):
    remaining = GIT_BUDGET_S - (time.monotonic() - started)
    if remaining <= 0:
        raise TimeoutError("inspeção Git excedeu 8s")
    try:
        completed = subprocess.run(
            ["git", "--git-dir", str(git_dir), *args],
            check=False,
            capture_output=True,
            text=True,
            timeout=remaining,
            env=_git_env(),
        )
    except subprocess.TimeoutExpired as error:
        raise TimeoutError("inspeção Git excedeu 8s") from error
    if completed.returncode != 0:
        raise ValueError("common-dir Git ilegível")
    return completed.stdout


def list_worktree_paths(common_dir):
    if common_dir is None:
        return []
    common = Path(common_dir)
    if not common.exists():
        return []
    started = time.monotonic()
    raw = _run_git_dir(common, ["worktree", "list", "--porcelain", "-z"], started)
    paths = []
    for record in raw.split("\0\0"):
        for item in record.split("\0"):
            if item.startswith("worktree "):
                paths.append(Path(item.split(" ", 1)[1]).resolve())
    return paths


def preferred_checkout(common_dir, fallback=None):
    living = [path for path in list_worktree_paths(common_dir) if path.exists()]
    if living:
        return living[0]
    if fallback is None:
        return None
    path = Path(fallback)
    return path.resolve() if path.exists() else None


def persist_repository_path(common_dir, inspected):
    preferred = preferred_checkout(common_dir, inspected)
    if preferred is not None:
        return preferred
    return Path(inspected).resolve() if inspected else None


def resolve_repository(entry):
    registered = Path(entry["repositoryPath"]).resolve() if entry.get("repositoryPath") else None
    common = Path(entry["gitCommonDir"]).resolve() if entry.get("gitCommonDir") else None
    try:
        living = [path for path in list_worktree_paths(common) if path.exists()]
    except (ValueError, TimeoutError, OSError):
        living = []
    if registered is not None and registered.exists():
        effective = registered
    elif living:
        effective = living[0]
    else:
        effective = None
    return {
        "registered": str(registered) if registered else None,
        "gitCommonDir": str(common) if common else None,
        "effective": effective,
        "available": effective is not None and effective.exists(),
    }


def resolve_config_for_entry(entry):
    expected = entry.get("id")
    registered = entry.get("configPath")
    if registered and Path(registered).is_file():
        try:
            config = load_project_config(registered)
        except (ConfigError, OSError):
            config = None
        else:
            if expected is None or config.project_id == expected:
                return config
    try:
        trees = list_worktree_paths(entry.get("gitCommonDir"))
    except (ValueError, TimeoutError, OSError):
        trees = []
    for tree in trees:
        candidate = tree / "ci-queue.json"
        if not candidate.is_file():
            continue
        try:
            config = load_project_config(candidate)
        except (ConfigError, OSError):
            continue
        if expected is None or config.project_id == expected:
            return config
    return None


def _heal_entry(entry):
    current = dict(entry)
    changed = False
    preferred = preferred_checkout(current.get("gitCommonDir"), current.get("repositoryPath"))
    stored = current.get("repositoryPath")
    if preferred is not None and (stored is None or Path(stored).resolve() != preferred):
        current["repositoryPath"] = str(preferred)
        changed = True
    config = resolve_config_for_entry(current)
    stored_cfg = current.get("configPath")
    if config is not None and (stored_cfg is None or not Path(stored_cfg).is_file()):
        current["configPath"] = str(config.path)
        changed = True
    return current, changed


def observed_project_ids(state_root):
    found = set()
    for job in read_history(state_root):
        ident = job.get("projectId")
        if isinstance(ident, str) and ident:
            found.add(ident)
    return found


def _signature(repository_path, git_common_dir, config_path):
    return {
        "repositoryPath": str(repository_path) if repository_path else None,
        "gitCommonDir": str(git_common_dir) if git_common_dir else None,
        "configSha256": _file_sha(config_path),
    }


def _config_preview(config_path, expected_id=None):
    if config_path is None or not Path(config_path).is_file():
        return {
            "configPath": None,
            "bindingState": "unlinked",
            "projectId": None,
            "displayName": None,
            "presets": [],
            "repositoryPath": None,
            "error": None,
        }
    try:
        config = load_project_config(config_path)
    except ConfigError as error:
        return {
            "configPath": str(Path(config_path).resolve()),
            "bindingState": "invalid",
            "projectId": None,
            "displayName": None,
            "presets": [],
            "repositoryPath": None,
            "error": str(error),
        }
    if expected_id and config.project_id != expected_id:
        mismatch = True
    else:
        mismatch = False
    return {
        "configPath": str(config.path),
        "bindingState": "linked",
        "projectId": config.project_id,
        "displayName": config.project_name,
        "presets": sorted(config.presets),
        "repositoryPath": str(config.repository_path) if config.repository_path else None,
        "error": "config-id-mismatch" if mismatch else None,
        "config": config,
    }


def _conflicts(document, git_common_dir, project_id, config_repo_common, config_id_mismatch):
    conflicts = []
    if config_id_mismatch:
        conflicts.append({
            "code": "config-id-mismatch",
            "message": "A configuração declara um project.id diferente da identidade escolhida.",
        })
    if config_repo_common is not None and git_common_dir is not None and config_repo_common != git_common_dir:
        conflicts.append({
            "code": "config-repository-mismatch",
            "message": "repository.path da configuração não pertence ao repositório escolhido.",
        })
    if git_common_dir is not None:
        for entry in document["projects"].values():
            bound = entry.get("gitCommonDir")
            if bound and Path(bound) == git_common_dir:
                conflicts.append({
                    "code": "git-common-dir-bound",
                    "message": "Este Git já está vinculado a um cadastro.",
                    "projectId": entry["id"],
                })
                break
    if project_id and project_id in document["projects"]:
        entry = document["projects"][project_id]
        bound = entry.get("gitCommonDir")
        if git_common_dir is not None and bound and Path(bound) != git_common_dir:
            conflicts.append({
                "code": "project-id-bound",
                "message": "Este project.id já tem outro clone cadastrado.",
                "projectId": project_id,
            })
    return conflicts


def _inspect_optional_repo(path):
    if path is None:
        return None
    if not path.exists():
        raise ValueError("pasta ausente")
    inspected = inspect_git(path)
    if inspected["bare"]:
        raise ValueError("repositório bare não pode ser cadastrado por pasta")
    return inspected


def probe_project(state_root, body):
    if not isinstance(body, dict):
        raise ValueError("corpo da inspeção inválido")
    document = read_registry(state_root)
    repo_path = _normalize_path(body.get("repositoryPath"), "repositoryPath")
    config_path = _normalize_path(body.get("configPath"), "configPath")
    existing_id = body.get("existingProjectId")
    if existing_id is not None and (not isinstance(existing_id, str) or not PROJECT_ID.fullmatch(existing_id)):
        raise ValueError("existingProjectId inválido")
    inspected = _inspect_optional_repo(repo_path)
    if inspected is None and config_path is None and existing_id is None:
        raise ValueError("informe uma pasta, uma configuração ou uma identidade observada")
    default_config = None
    if inspected is not None and config_path is None:
        candidate = inspected["repositoryPath"] / "ci-queue.json"
        if candidate.is_file():
            default_config = candidate
    config = _config_preview(config_path or default_config, existing_id)
    config_repo_common = None
    if config.get("repositoryPath"):
        try:
            config_repo_common = inspect_git(Path(config["repositoryPath"]))["gitCommonDir"]
        except (ValueError, TimeoutError, OSError):
            config_repo_common = Path(config["repositoryPath"]).resolve()
    project_id = existing_id or config.get("projectId")
    git_common = inspected["gitCommonDir"] if inspected else None
    conflicts = _conflicts(document, git_common, project_id, config_repo_common, bool(config.get("error") == "config-id-mismatch"))
    signature = _signature(
        inspected["repositoryPath"] if inspected else None,
        git_common,
        Path(config["configPath"]) if config["configPath"] else None,
    )
    return {
        "repositoryPath": str(inspected["repositoryPath"]) if inspected else None,
        "gitCommonDir": str(git_common) if git_common else None,
        "bare": bool(inspected and inspected["bare"]),
        "configPath": config["configPath"],
        "bindingState": config["bindingState"],
        "projectId": project_id,
        "displayName": config.get("displayName") or (inspected["repositoryPath"].name if inspected else existing_id),
        "presets": config["presets"],
        "catalogValid": config["bindingState"] == "linked",
        "conflicts": conflicts,
        "signature": signature,
    }


def _require_signature(preview, expected):
    if expected is None:
        raise ValueError("assinatura da inspeção obrigatória")
    if preview["signature"] != expected:
        raise RevisionConflict("A pasta ou a configuração mudou depois da inspeção. Confira novamente.")


def _require_clean(preview, allow_project_id=None):
    for item in preview["conflicts"]:
        if item["code"] in {"git-common-dir-bound", "project-id-bound"} and item.get("projectId") == allow_project_id:
            continue
        if item["code"] in {
            "git-common-dir-bound",
            "project-id-bound",
            "config-repository-mismatch",
            "config-id-mismatch",
        }:
            raise RevisionConflict(item["message"])


def _touch(document, entry, now):
    entry["revision"] = int(entry.get("revision") or 0) + 1
    entry["updatedAt"] = now
    document["revision"] += 1
    document["projects"][entry["id"]] = entry
    return document


def _entry(project_id, display_name, repository_path, git_common_dir, config_path, now):
    return {
        "id": project_id,
        "displayName": display_name,
        "repositoryPath": str(repository_path) if repository_path else None,
        "gitCommonDir": str(git_common_dir) if git_common_dir else None,
        "configPath": str(config_path) if config_path else None,
        "archivedAt": None,
        "revision": 0,
        "createdAt": now,
        "updatedAt": now,
    }


def _get_entry(document, project_id):
    if not isinstance(project_id, str) or project_id not in document["projects"]:
        raise LookupError("projeto não encontrado")
    return dict(document["projects"][project_id])


def _register(document, state_root, body, now):
    source = body.get("identitySource")
    if source not in {"config", "observed", "new"}:
        raise ValueError("origem de identidade inválida")
    repo_path = body.get("repositoryPath")
    if source == "observed" and not repo_path and not body.get("configPath"):
        project_id = body.get("existingProjectId")
        if not isinstance(project_id, str) or project_id not in observed_project_ids(state_root):
            raise ValueError("identidade observada inexistente")
        if project_id in document["projects"]:
            return document
        name = _display_name(body.get("displayName"), project_id)
        entry = _entry(project_id, name, None, None, None, now)
        return _touch(document, entry, now)
    preview = probe_project(state_root, {
        "repositoryPath": repo_path,
        "configPath": body.get("configPath"),
        "existingProjectId": body.get("existingProjectId"),
    })
    _require_signature(preview, body.get("signature"))
    if source == "config":
        if preview["bindingState"] != "linked" or not preview["projectId"]:
            raise ValueError("configuração de receitas obrigatória")
        project_id = preview["projectId"]
        name = _display_name(body.get("displayName"), preview["displayName"])
        _require_clean(preview, allow_project_id=project_id)
    elif source == "observed":
        project_id = body.get("existingProjectId")
        if not isinstance(project_id, str) or project_id not in observed_project_ids(state_root):
            raise ValueError("identidade observada inexistente")
        if preview["projectId"] and preview["projectId"] != project_id:
            raise ValueError("A configuração declara um project.id diferente da identidade escolhida.")
        name = _display_name(body.get("displayName"), preview["displayName"] or project_id)
        _require_clean(preview, allow_project_id=project_id)
    else:
        _require_clean(preview)
        if preview["bindingState"] == "linked":
            raise ValueError("pasta com config deve usar identitySource=config")
        project_id = "proj-" + uuid.uuid4().hex
        name = _display_name(body.get("displayName"), preview["displayName"] or project_id)
    existing = document["projects"].get(project_id)
    persisted = persist_repository_path(preview["gitCommonDir"], preview["repositoryPath"])
    if existing and existing.get("gitCommonDir") == preview["gitCommonDir"]:
        entry = dict(existing)
        next_path = str(persisted) if persisted else existing.get("repositoryPath")
        next_config = preview["configPath"] or existing.get("configPath")
        if (entry.get("repositoryPath") == next_path
                and entry.get("configPath") == next_config
                and entry.get("displayName") == name):
            return document
        entry["repositoryPath"] = next_path
        entry["gitCommonDir"] = preview["gitCommonDir"]
        if preview["configPath"]:
            entry["configPath"] = preview["configPath"]
        entry["displayName"] = name
        return _touch(document, entry, now)
    if existing:
        raise RevisionConflict("Este project.id já tem outro clone cadastrado.")
    entry = _entry(
        project_id,
        name,
        persisted,
        preview["gitCommonDir"],
        preview["configPath"],
        now,
    )
    return _touch(document, entry, now)


def _relocate(document, state_root, body, now):
    entry = _get_entry(document, body.get("projectId"))
    preview = probe_project(state_root, {
        "repositoryPath": body.get("repositoryPath"),
        "configPath": body.get("configPath"),
        "existingProjectId": entry["id"],
    })
    _require_signature(preview, body.get("signature"))
    _require_clean(preview, allow_project_id=entry["id"])
    persisted = persist_repository_path(preview["gitCommonDir"], preview["repositoryPath"])
    entry["repositoryPath"] = str(persisted) if persisted else preview["repositoryPath"]
    entry["gitCommonDir"] = preview["gitCommonDir"]
    if body.get("configPath") is not None or preview["configPath"]:
        if preview["bindingState"] == "linked" and preview["projectId"] != entry["id"]:
            raise ValueError("A configuração declara um project.id diferente da identidade escolhida.")
        entry["configPath"] = preview["configPath"]
    return _touch(document, entry, now)


def _link_config(document, state_root, body, now):
    entry = _get_entry(document, body.get("projectId"))
    preview = probe_project(state_root, {
        "repositoryPath": entry.get("repositoryPath") or body.get("repositoryPath"),
        "configPath": body.get("configPath"),
        "existingProjectId": entry["id"],
    })
    _require_signature(preview, body.get("signature"))
    if preview["bindingState"] != "linked":
        raise ValueError("configuração de receitas inválida")
    if preview["projectId"] != entry["id"]:
        raise ValueError("A configuração declara um project.id diferente da identidade escolhida.")
    _require_clean(preview, allow_project_id=entry["id"])
    entry["configPath"] = preview["configPath"]
    if preview["repositoryPath"] or preview["gitCommonDir"]:
        persisted = persist_repository_path(preview["gitCommonDir"], preview["repositoryPath"])
        entry["repositoryPath"] = str(persisted) if persisted else preview["repositoryPath"]
        entry["gitCommonDir"] = preview["gitCommonDir"]
    return _touch(document, entry, now)


def mutate_registry(state_root, body):
    if not isinstance(body, dict) or body.get("action") not in ALLOWED:
        raise ValueError("ação de projeto inválida")
    extra = set(body) - ALLOWED[body["action"]]
    if extra:
        raise ValueError("campos não permitidos: %s" % ", ".join(sorted(extra)))
    if type(body.get("expectedRevision")) is not int:
        raise ValueError("revisão obrigatória")
    path = _registry_path(state_root)
    with _lock(state_root) as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        document = _read_document(path)
        if body["expectedRevision"] != document["revision"]:
            raise RevisionConflict("O cadastro foi editado em outra aba. Reabra antes de salvar.")
        now = _now()
        action = body["action"]
        before = json.dumps(document, sort_keys=True)
        if action == "register":
            document = _register(document, state_root, body, now)
        elif action == "rename":
            entry = _get_entry(document, body.get("projectId"))
            entry["displayName"] = _display_name(body.get("displayName"), None)
            document = _touch(document, entry, now)
        elif action == "archive":
            entry = _get_entry(document, body.get("projectId"))
            if entry.get("archivedAt") is None:
                entry["archivedAt"] = now
                document = _touch(document, entry, now)
        elif action == "restore":
            entry = _get_entry(document, body.get("projectId"))
            if entry.get("archivedAt") is not None:
                entry["archivedAt"] = None
                document = _touch(document, entry, now)
        elif action == "relocate":
            document = _relocate(document, state_root, body, now)
        elif action == "link-config":
            document = _link_config(document, state_root, body, now)
        else:
            entry = _get_entry(document, body.get("projectId"))
            entry["configPath"] = None
            document = _touch(document, entry, now)
        if json.dumps(document, sort_keys=True) != before:
            _write_atomic(path, document)
        return read_registry(state_root)


def bootstrap_registry(state_root, config_path):
    config = load_project_config(config_path)
    path = _registry_path(state_root)
    with _lock(state_root) as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        document = _read_document(path)
        existing = document["projects"].get(config.project_id)
        if existing:
            healed, changed = _heal_entry(existing)
            if document.get("bootstrapProjectId") is None:
                document["bootstrapProjectId"] = config.project_id
                changed = True
            if changed:
                document = _touch(document, healed, _now())
                _write_atomic(path, document)
            return read_registry(state_root)
        now = _now()
        git_common = None
        repo_path = config.repository_path
        if repo_path and repo_path.exists():
            try:
                inspected = inspect_git(repo_path)
                if not inspected["bare"]:
                    git_common = inspected["gitCommonDir"]
                    repo_path = persist_repository_path(git_common, inspected["repositoryPath"])
            except (ValueError, TimeoutError, OSError):
                git_common = None
        entry = _entry(config.project_id, config.project_name, repo_path, git_common, config.path, now)
        document["bootstrapProjectId"] = document.get("bootstrapProjectId") or config.project_id
        _touch(document, entry, now)
        _write_atomic(path, document)
        return read_registry(state_root)
