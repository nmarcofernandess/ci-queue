"""Safe readers for the queue record protocol.

Readers are deliberately conservative: a project query only returns records
whose ``projectId`` exactly matches its configured identity.  A legacy record
without that identity remains readable through the raw global status where
appropriate, but it is never silently attributed to the current project.
"""

import base64
import hashlib
import json
import os
import re
import threading
from datetime import datetime, timezone
from pathlib import Path


JOB_ID = re.compile(r"[A-Za-z0-9-]{1,128}\Z")
TERMINAL = frozenset(("passed", "failed", "cancelled", "interrupted"))
ALL_STATUSES = frozenset(("queued", "running", *TERMINAL))
PAGE_SIZE = 50
PUBLIC_JOB_FIELDS = (
    "id", "projectId", "projectName", "preset", "status", "exitCode", "branch", "headSha",
    "createdAt", "startedAt", "finishedAt", "durationMs", "cwd", "failureReason",
    "cleanupBlockedReason", "commitSubject",
)


class RecordError(ValueError):
    pass


_history_cache = {"key": None, "value": []}
_history_lock = threading.Lock()


def iso_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def read_json(path, strict=False):
    try:
        value = json.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        if strict:
            raise RecordError("registro ilegível: %s" % Path(path).name) from error
        return None
    if not isinstance(value, dict):
        if strict:
            raise RecordError("registro inválido: %s" % Path(path).name)
        return None
    return value


def _signature(directory):
    try:
        values = []
        with os.scandir(directory) as entries:
            for entry in entries:
                if not entry.name.endswith(".json"):
                    continue
                info = entry.stat()
                with open(entry.path, "rb") as stream:
                    digest = hashlib.sha256(stream.read()).hexdigest()
                values.append((entry.name, info.st_mtime_ns, info.st_size, digest))
        return tuple(sorted(values))
    except FileNotFoundError:
        return ()
    except OSError:
        return None


def read_json_directory(directory, strict=False, cached=False):
    directory = Path(directory)
    signature = _signature(directory)
    if signature is None:
        if strict:
            raise RecordError("diretório de registros indisponível")
        return []
    cache_key = (str(directory.resolve()), signature, strict)
    if cached:
        with _history_lock:
            if _history_cache["key"] == cache_key:
                return _history_cache["value"]
    rows = []
    for name, _mtime, _size, _digest in signature:
        row = read_json(directory / name, strict=strict)
        if row is not None:
            rows.append(row)
    if cached:
        with _history_lock:
            _history_cache.update(key=cache_key, value=rows)
    return rows


def invalidate_history_cache():
    with _history_lock:
        _history_cache.update(key=None, value=[])


def history_key(job):
    return str(job.get("finishedAt") or job.get("startedAt") or job.get("createdAt") or "")


def execution_key(job):
    return (str(job.get("startedAt") or job.get("finishedAt") or job.get("createdAt") or ""), str(job.get("id") or ""))


def parse_instant(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(timezone.utc)


def validate_job_id(value):
    if not isinstance(value, str) or not JOB_ID.fullmatch(value):
        raise RecordError("jobId inválido")
    return value


def project_record(job, project_id):
    return isinstance(job, dict) and job.get("projectId") == project_id


def read_history(state_root, strict=False):
    return read_json_directory(Path(state_root) / "history", strict=strict, cached=True)


def read_queued(state_root, strict=False):
    return read_json_directory(Path(state_root) / "jobs", strict=strict)


def read_running(state_root, strict=False):
    return read_json(Path(state_root) / "running.json", strict=strict)


def read_progress(state_root, job_id):
    return read_json(Path(state_root) / "progress" / (job_id + ".json"))


def progress_summary(job, progress=None):
    """Project only a validated, bounded progress tree to the browser."""
    if not isinstance(job, dict):
        return job
    raw = progress if progress is not None else job.get("progress")
    nodes = raw.get("nodes") if isinstance(raw, dict) else None
    if not isinstance(nodes, list) or not nodes:
        return job
    if len(nodes) > 4096:
        return {**job, "progressSummary": {"schemaVersion": 1, "available": False, "reason": "invalid-hierarchy"}}
    allowed = {"pending", "running", "passed", "failed", "skipped"}
    known = {}
    for node in nodes:
        if (not isinstance(node, dict) or not isinstance(node.get("id"), str)
                or not isinstance(node.get("label"), str) or node["id"] in known
                or node.get("status") not in allowed):
            return {**job, "progressSummary": {"schemaVersion": 1, "available": False, "reason": "invalid-hierarchy"}}
        parent = node.get("parentId")
        if parent is not None and not isinstance(parent, str):
            return {**job, "progressSummary": {"schemaVersion": 1, "available": False, "reason": "invalid-hierarchy"}}
        known[node["id"]] = node
    roots = []
    for node in known.values():
        if node.get("parentId") not in known:
            roots.append(node)
    def public(node):
        result = {key: node[key] for key in ("id", "label", "status")}
        for key in ("parentId", "kind", "detail"):
            if isinstance(node.get(key), str):
                result[key] = node[key]
        value = node.get("durationMs")
        if type(value) is int and value >= 0:
            result["durationMs"] = value
        retry_count = node.get("retryCount")
        if type(retry_count) is int and retry_count >= 0:
            result["retryCount"] = retry_count
        return result
    active = [node for node in known.values() if node.get("status") == "running"] if job.get("status") == "running" else []
    return {**job, "progressSummary": {"schemaVersion": 1, "available": True,
                                         "nodes": [public(node) for node in known.values()],
                                         "roots": [public(node) for node in roots],
                                         "active": [public(node) for node in active]}}


def public_job(job):
    """A browser projection. Raw argv, environment and artifact paths stay local."""
    if not isinstance(job, dict):
        return job
    result = {key: job.get(key) for key in PUBLIC_JOB_FIELDS if key in job}
    if "progressSummary" in job:
        result["progressSummary"] = job["progressSummary"]
    return result


def lookup_job(state_root, job_id, project_id=None):
    job_id = validate_job_id(job_id)
    root = Path(state_root)
    candidates = [
        read_json(root / "history" / (job_id + ".json")),
        read_json(root / "running.json"),
        read_json(root / "jobs" / (job_id + ".json")),
    ]
    for candidate in candidates:
        if isinstance(candidate, dict) and candidate.get("id") == job_id:
            if project_id is not None and not project_record(candidate, project_id):
                return None
            progress = read_progress(root, job_id) if candidate.get("status") == "running" else None
            return progress_summary(candidate, progress)
    return None


def status_snapshot(state_root, project_id, project_name):
    """Global occupancy plus project-scoped terminal context, without duplicates."""
    root = Path(state_root)
    history = sorted(read_history(root), key=history_key, reverse=True)
    terminal_ids = {row.get("id") for row in history if row.get("status") in TERMINAL}
    running = read_running(root)
    if isinstance(running, dict) and running.get("id") in terminal_ids:
        running = None
    if isinstance(running, dict):
        running = progress_summary(running, read_progress(root, str(running.get("id") or "")))
    queued = []
    for row in sorted(read_queued(root), key=execution_key):
        if row.get("status") == "queued" and row.get("id") not in terminal_ids and (not running or row.get("id") != running.get("id")):
            queued.append(row)
    project_history = [progress_summary(row) for row in history if project_record(row, project_id)]
    last_failed = next((row for row in project_history if row.get("status") in {"failed", "interrupted"}), None)
    project_running = running if project_record(running, project_id) else None
    project_queued = [row for row in queued if project_record(row, project_id)]
    return {
        "schemaVersion": 1,
        "project": {"id": project_id, "name": project_name},
        "serverTime": iso_now(),
        "running": public_job(project_running),
        "queued": [public_job(row) for row in project_queued],
        "history": [public_job(row) for row in project_history[:50]],
        "lastFailed": public_job(last_failed),
        "globalOccupancy": bool(running or queued),
    }


def _matches_query(job, query):
    if not query:
        return True
    needle = query.casefold()
    fields = ("preset", "branch", "headSha", "id", "cwd", "command")
    values = [job.get(field) for field in fields]
    extra = job.get("extraArgs")
    if isinstance(extra, list):
        values.append(" ".join(value for value in extra if isinstance(value, str)))
    return any(needle in value.casefold() for value in values if isinstance(value, str))


def _cursor_for(job):
    payload = [job.get("finishedAt") or "", str(job.get("id") or "")]
    return base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")


def _cursor_value(value):
    if not isinstance(value, str) or len(value) > 2048:
        raise RecordError("cursor inválido")
    try:
        raw = base64.urlsafe_b64decode(value.encode("ascii"))
        parsed = json.loads(raw)
    except (ValueError, UnicodeError, json.JSONDecodeError):
        raise RecordError("cursor inválido")
    if not isinstance(parsed, list) or len(parsed) != 2 or not all(isinstance(item, str) for item in parsed):
        raise RecordError("cursor inválido")
    return (parsed[0], parsed[1])


def read_executions(state_root, project_id, q="", result="all", scope="terminal", from_time="", to_time="", snapshot_before="", cursor="", offset=0):
    if result not in {"all", *TERMINAL}:
        raise RecordError("result inválido")
    if scope != "terminal":
        raise RecordError("scope inválido")
    if not isinstance(q, str):
        raise RecordError("q inválido")
    if isinstance(offset, bool) or not isinstance(offset, int) or offset < 0:
        raise RecordError("offset inválido")
    lower = parse_instant(from_time) if from_time else None
    upper = parse_instant(to_time) if to_time else None
    if (from_time and lower is None) or (to_time and upper is None) or (lower and upper and lower >= upper):
        raise RecordError("intervalo inválido")
    snapshot = snapshot_before or iso_now()
    snapshot_instant = parse_instant(snapshot)
    if snapshot_instant is None:
        raise RecordError("snapshotBefore inválido")
    cursor_value = _cursor_value(cursor) if cursor else None
    rows = []
    unknown = 0
    for row in read_history(state_root):
        if row.get("projectId") != project_id:
            if row.get("projectId") is None:
                unknown += 1
            continue
        if row.get("status") not in TERMINAL or not _matches_query(row, q):
            continue
        instant = parse_instant(row.get("finishedAt"))
        if instant is None:
            continue
        if instant >= snapshot_instant or (lower and instant < lower) or (upper and instant >= upper):
            continue
        if result != "all" and row.get("status") != result:
            continue
        rows.append(progress_summary(row))
    rows.sort(key=lambda row: (str(row.get("finishedAt") or ""), str(row.get("id") or "")), reverse=True)
    if cursor_value:
        rows = [row for row in rows if (str(row.get("finishedAt") or ""), str(row.get("id") or "")) < cursor_value]
        offset = 0
    page = rows[offset:offset + PAGE_SIZE]
    return {
        "schemaVersion": 1,
        "jobs": [public_job(row) for row in page],
        "hasMore": len(rows) > offset + PAGE_SIZE,
        "snapshotBefore": snapshot,
        "nextCursor": _cursor_for(page[-1]) if page and len(rows) > offset + PAGE_SIZE else None,
        "coverage": {"unattributedRecords": unknown},
    }
