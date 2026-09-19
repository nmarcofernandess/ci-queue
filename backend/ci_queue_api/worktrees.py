"""Read-only Git worktree inventory with serial, coalesced size measurement."""

import hashlib
import os
import queue
import subprocess
import threading
import time
import copy
from datetime import datetime, timezone
from pathlib import Path


GIT_TIMEOUT = 5
SIZE_CACHE_SECONDS = 60
_sizes = {}
_pending = set()
_lock = threading.Lock()
_requests = queue.Queue()
_worker = None
_inventories = {}
_inventory_lock = threading.Lock()
INVENTORY_CACHE_SECONDS = 60


def _now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _git(cwd, *args, timeout=GIT_TIMEOUT):
    if timeout is None or timeout <= 0:
        return None
    try:
        result = subprocess.run(["git", "-C", str(cwd), *args], text=True, capture_output=True,
                                timeout=timeout, env={**os.environ, "GIT_OPTIONAL_LOCKS": "0"})
    except (OSError, subprocess.TimeoutExpired):
        return None
    return result.stdout if result.returncode == 0 else None


def _remaining(deadline, maximum=GIT_TIMEOUT):
    remaining = deadline - time.monotonic()
    return min(remaining, maximum) if remaining > 0 else None


def worktree_id(path):
    return hashlib.sha256(os.path.abspath(str(path)).encode("utf-8")).hexdigest()[:24]


def _source(source):
    repository_path = getattr(source, "repository_path", None)
    base_ref = getattr(source, "base_ref", None) or "HEAD"
    return repository_path, base_ref


def discover(source):
    repository_path, _base_ref = _source(source)
    if repository_path is None:
        return None
    raw = _git(repository_path, "worktree", "list", "--porcelain", "-z")
    if raw is None:
        return None
    rows = []
    for record in raw.split("\0\0"):
        fields = {}
        for item in record.split("\0"):
            if not item:
                continue
            parts = item.split(" ", 1)
            fields[parts[0]] = parts[1] if len(parts) == 2 else True
        if "worktree" not in fields:
            continue
        path = fields["worktree"]
        rows.append({
            "id": worktree_id(path),
            "path": path,
            "branch": str(fields.get("branch", "detached")).removeprefix("refs/heads/"),
            "headSha": fields.get("HEAD"),
            "locked": bool(fields.get("locked", False)),
        })
    return rows


def _changed_count(raw):
    if raw is None:
        return None
    values = [item for item in raw.split("\0") if item]
    return len(values)


def _size_report(path):
    key = str(Path(path).resolve())
    with _lock:
        cached = _sizes.get(key)
    if cached:
        return {"bytes": cached["bytes"], "state": "ready", "error": cached["error"], "observedAt": cached["observedAt"]}
    return {"bytes": None, "state": "unmeasured", "error": None, "observedAt": None}


def _measure(path):
    key = str(Path(path).resolve())
    try:
        # du is the portable tool already present on supported macOS/Linux
        # modes. Measurements are serialized to avoid competing disk scans.
        result = subprocess.run(["du", "-sk", key], text=True, capture_output=True, timeout=60)
        if result.returncode != 0:
            raise OSError("du indisponível")
        kib = int(result.stdout.split()[0])
        value, error = kib * 1024, None
    except (OSError, ValueError, IndexError, subprocess.TimeoutExpired):
        with _lock:
            previous = _sizes.get(key)
        value = previous.get("bytes") if previous else None
        error = "Não foi possível atualizar o tamanho da worktree."
    with _lock:
        _sizes[key] = {"bytes": value, "error": error, "observedAt": _now(), "monotonic": time.monotonic()}
        _pending.discard(key)


def _run_measurements():
    while True:
        path = _requests.get()
        try:
            _measure(path)
        finally:
            _requests.task_done()


def schedule_size(path):
    global _worker
    key = str(Path(path).resolve())
    with _lock:
        cached = _sizes.get(key)
        stale = not cached or time.monotonic() - cached["monotonic"] >= SIZE_CACHE_SECONDS
        if stale and key not in _pending:
            _pending.add(key)
            _requests.put(key)
        pending = key in _pending
        if _worker is None:
            _worker = threading.Thread(target=_run_measurements, name="ci-queue-worktree-size", daemon=True)
            _worker.start()
    report = _size_report(key)
    return {**report, "state": "measuring" if pending else report["state"]}


def list_worktrees_all(state_root):
    """Aggregate living worktrees from active registry projects. One failure stays local."""
    from .project_context import resolve_project
    from .projects import RegistryError, read_registry

    try:
        registry = read_registry(state_root)
    except (RegistryError, OSError):
        return {
            "schemaVersion": 1,
            "observedAt": _now(),
            "baseRef": "HEAD",
            "baseSha": None,
            "worktrees": [],
            "error": "Cadastro de projetos indisponível.",
            "projectErrors": [],
        }
    entries = [
        entry
        for entry in (registry.get("projects") or {}).values()
        if isinstance(entry, dict) and not entry.get("archivedAt")
    ]
    entries.sort(key=lambda item: (str(item.get("displayName") or ""), str(item.get("id") or "")))
    rows = []
    project_errors = []
    for entry in entries:
        project_id = entry.get("id")
        project_name = entry.get("displayName") or project_id
        if not isinstance(project_id, str) or not project_id:
            continue
        try:
            project = resolve_project(project_id, registry)
            payload = list_worktrees(project)
        except Exception as error:
            project_errors.append({
                "projectId": project_id,
                "projectName": project_name,
                "error": str(error),
            })
            continue
        project_error = payload.get("error")
        if project_error:
            project_errors.append({
                "projectId": project_id,
                "projectName": project.display_name,
                "error": project_error,
            })
        for row in payload.get("worktrees") or []:
            tagged = {
                **row,
                "projectId": project.project_id,
                "projectName": project.display_name,
            }
            if project_error and not tagged.get("error"):
                tagged["error"] = project_error
            rows.append(tagged)
    return {
        "schemaVersion": 1,
        "observedAt": _now(),
        "baseRef": "HEAD",
        "baseSha": None,
        "worktrees": rows,
        "error": None if rows else (project_errors[0]["error"] if project_errors else None),
        "projectErrors": project_errors,
    }


def _inventory_key(source):
    repository_path, base_ref = _source(source)
    common = getattr(source, "git_common_dir", None)
    revision = getattr(source, "entry_revision", None)
    return (str(repository_path), str(common), str(base_ref), revision)


def list_worktrees(source):
    cache_key = _inventory_key(source)
    with _inventory_lock:
        cached = _inventories.get(cache_key)
        if cached and time.monotonic() - cached[0] < INVENTORY_CACHE_SECONDS:
            return copy.deepcopy(cached[1])
    repository_path, base_ref = _source(source)
    rows = discover(source)
    if rows is None:
        return {"schemaVersion": 1, "observedAt": _now(), "baseRef": base_ref,
                "baseSha": None, "worktrees": [], "error": "Worktrees indisponíveis para este projeto."}
    deadline = time.monotonic() + 12
    base = _git(repository_path, "rev-parse", "--verify", base_ref, timeout=_remaining(deadline))
    base_sha = base.strip() if base else None
    for row in rows:
        status = _git(row["path"], "status", "--porcelain=v1", "-z", "--untracked-files=normal", timeout=_remaining(deadline))
        changed = _changed_count(status)
        counts = _git(repository_path, "rev-list", "--left-right", "--count", "%s...%s" % (base_ref, row.get("headSha") or ""), timeout=_remaining(deadline)) if base_sha and row.get("headSha") else None
        behind = ahead = None
        if counts:
            try:
                behind, ahead = [int(item) for item in counts.split()]
            except (TypeError, ValueError):
                pass
        timed_out = _remaining(deadline) is None
        row.update({"dirty": bool(changed) if changed is not None else None,
                    "changedEntries": changed, "ahead": ahead, "behind": behind,
                    "gitObservedAt": _now(), "size": schedule_size(row["path"]),
                    "error": "Orçamento de leitura das worktrees esgotado." if timed_out else None})
    payload = {"schemaVersion": 1, "observedAt": _now(), "baseRef": base_ref,
               "baseSha": base_sha, "worktrees": rows, "error": None}
    with _inventory_lock:
        _inventories[cache_key] = (time.monotonic(), copy.deepcopy(payload))
    return payload


def worktree_view(source, identifier):
    _repository_path, base_ref = _source(source)
    rows = discover(source)
    if rows is None:
        raise LookupError("Inventário de worktrees indisponível.")
    row = next((item for item in rows if item["id"] == identifier), None)
    if row is None:
        raise LookupError("Worktree não encontrada.")
    status = _git(row["path"], "status", "--porcelain=v1", "-z", "--untracked-files=normal")
    changed = _changed_count(status)
    counts = _git(_repository_path, "rev-list", "--left-right", "--count", "%s...%s" % (base_ref, row.get("headSha") or ""))
    behind = ahead = None
    if counts:
        try:
            behind, ahead = [int(item) for item in counts.split()]
        except (TypeError, ValueError):
            pass
    return {**row, "dirty": bool(changed) if changed is not None else None,
            "changedEntries": changed, "ahead": ahead, "behind": behind,
            "size": schedule_size(row["path"])}


def resolve_worktree(config, identifier):
    rows = discover(config) or []
    row = next((item for item in rows if item["id"] == identifier), None)
    if row is None:
        raise LookupError("worktree não encontrada no inventário")
    raw = Path(row["path"])
    try:
        resolved = raw.resolve()
    except OSError as error:
        raise LookupError("worktree indisponível") from error
    if raw.is_symlink() or not resolved.is_dir():
        raise LookupError("worktree indisponível")
    return resolved
