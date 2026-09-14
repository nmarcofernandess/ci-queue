"""Read-only Git worktree inventory with lazy, serial size measurement."""

import hashlib
import os
import queue
import subprocess
import threading
import time
from datetime import datetime, timezone
from pathlib import Path


GIT_TIMEOUT = 5
SIZE_CACHE_SECONDS = 600
_sizes = {}
_pending = set()
_lock = threading.Lock()
_requests = queue.Queue()
_worker = None


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


def discover(config):
    if config.repository_path is None:
        return None
    raw = _git(config.repository_path, "worktree", "list", "--porcelain", "-z")
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
    if cached and time.monotonic() - cached["monotonic"] < SIZE_CACHE_SECONDS:
        return {"bytes": cached["bytes"], "state": "ready", "error": cached["error"], "observedAt": cached["observedAt"]}
    return {"bytes": None, "state": "unmeasured", "error": None, "observedAt": None}


def _measure(path):
    key = str(Path(path).resolve())
    try:
        # du is the portable tool already present on supported macOS/Linux
        # modes. Its result is measured only after the drawer asks for it.
        result = subprocess.run(["du", "-sk", key], text=True, capture_output=True, timeout=60)
        if result.returncode != 0:
            raise OSError("du indisponível")
        kib = int(result.stdout.split()[0])
        value, error = kib * 1024, None
    except (OSError, ValueError, IndexError, subprocess.TimeoutExpired):
        value, error = None, "Não foi possível medir o tamanho da worktree."
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
    report = _size_report(key)
    with _lock:
        if report["state"] == "unmeasured" and key not in _pending:
            _pending.add(key)
            _requests.put(key)
        pending = key in _pending
        if _worker is None:
            _worker = threading.Thread(target=_run_measurements, name="ci-queue-worktree-size", daemon=True)
            _worker.start()
    return {**report, "state": "measuring" if pending else report["state"]}


def list_worktrees(config):
    rows = discover(config)
    if rows is None:
        return {"schemaVersion": 1, "observedAt": _now(), "baseRef": config.base_ref,
                "baseSha": None, "worktrees": [], "error": "Worktrees indisponíveis para este projeto."}
    deadline = time.monotonic() + 12
    base = _git(config.repository_path, "rev-parse", "--verify", config.base_ref, timeout=_remaining(deadline))
    base_sha = base.strip() if base else None
    for row in rows:
        status = _git(row["path"], "status", "--porcelain=v1", "-z", "--untracked-files=normal", timeout=_remaining(deadline))
        changed = _changed_count(status)
        counts = _git(config.repository_path, "rev-list", "--left-right", "--count", "%s...%s" % (config.base_ref, row.get("headSha") or ""), timeout=_remaining(deadline)) if base_sha and row.get("headSha") else None
        behind = ahead = None
        if counts:
            try:
                behind, ahead = [int(item) for item in counts.split()]
            except (TypeError, ValueError):
                pass
        timed_out = _remaining(deadline) is None
        row.update({"dirty": bool(changed) if changed is not None else None,
                    "changedEntries": changed, "ahead": ahead, "behind": behind,
                    "gitObservedAt": _now(), "size": _size_report(row["path"]),
                    "error": "Orçamento de leitura das worktrees esgotado." if timed_out else None})
    return {"schemaVersion": 1, "observedAt": _now(), "baseRef": config.base_ref,
            "baseSha": base_sha, "worktrees": rows, "error": None}


def worktree_view(config, identifier):
    rows = discover(config)
    if rows is None:
        raise LookupError("Inventário de worktrees indisponível.")
    row = next((item for item in rows if item["id"] == identifier), None)
    if row is None:
        raise LookupError("Worktree não encontrada.")
    status = _git(row["path"], "status", "--porcelain=v1", "-z", "--untracked-files=normal")
    changed = _changed_count(status)
    counts = _git(config.repository_path, "rev-list", "--left-right", "--count", "%s...%s" % (config.base_ref, row.get("headSha") or ""))
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
