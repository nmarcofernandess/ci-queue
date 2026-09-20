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

from .record_store import SnapshotError, clear_stores, store_for


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
    if cached:
        try:
            snapshot = store_for(directory).snapshot(strict=strict)
        except SnapshotError as error:
            raise RecordError(str(error)) from error
        return list(snapshot.rows)
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
    clear_stores()
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


def attribute_legacy(job, ledger):
    if not isinstance(job, dict) or job.get("projectId"):
        return job
    assignments = ledger.get("assignments") if isinstance(ledger, dict) and ledger.get("schemaVersion") == 1 else None
    entry = assignments.get(job.get("id")) if isinstance(assignments, dict) else None
    if (isinstance(entry, dict) and (not entry.get("headSha") or entry["headSha"] == job.get("headSha")) and isinstance(entry.get("projectId"), str) and entry["projectId"]
            and isinstance(entry.get("evidence"), str) and entry["evidence"]):
        return {**job, "projectId": entry["projectId"]}
    return job


def read_history(state_root, strict=False):
    ledger = read_json(Path(state_root) / "state" / "legacy-projects.json")
    return [attribute_legacy(row, ledger) for row in read_json_directory(Path(state_root) / "history", strict=strict, cached=True)]


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
        status = node.get("status") if isinstance(node, dict) else None
        if (not isinstance(node, dict) or not isinstance(node.get("id"), str)
                or not isinstance(node.get("label"), str) or node["id"] in known
                or not isinstance(status, str) or status not in allowed):
            return {**job, "progressSummary": {"schemaVersion": 1, "available": False, "reason": "invalid-hierarchy"}}
        parent = node.get("parentId")
        if parent is not None and not isinstance(parent, str):
            return {**job, "progressSummary": {"schemaVersion": 1, "available": False, "reason": "invalid-hierarchy"}}
        known[node["id"]] = node
    for node in known.values():
        visited = set()
        cursor = node
        while cursor.get("parentId") in known:
            if cursor["id"] in visited or len(visited) >= 128:
                return {**job, "progressSummary": {"schemaVersion": 1, "available": False, "reason": "invalid-hierarchy"}}
            visited.add(cursor["id"])
            cursor = known[cursor["parentId"]]
    roots = []
    for node in known.values():
        if node.get("parentId") not in known:
            roots.append(node)
    def public(node):
        result = {key: node[key] for key in ("id", "label", "status")}
        for key in ("parentId", "kind", "detail"):
            if isinstance(node.get(key), str):
                result[key] = node[key]
        detail = node.get("detail")
        count_keys = ("completed", "total", "passed", "failed", "running", "pending", "skipped")
        detail_kind = detail.get("kind") if isinstance(detail, dict) else None
        if (isinstance(detail, dict) and isinstance(detail_kind, str)
                and detail_kind in {"gates", "suites", "cases", "artifacts", "items"}
                and all(type(detail.get(key)) is int and 0 <= detail[key] <= 9007199254740991 for key in count_keys)
                and detail["passed"] + detail["failed"] + detail["skipped"] == detail["completed"]
                and detail["completed"] + detail["running"] + detail["pending"] == detail["total"]):
            result["detail"] = {key: detail[key] for key in ("kind", *count_keys)}
        value = node.get("durationMs")
        has_valid_duration = type(value) is int and 0 <= value <= 9007199254740991
        if has_valid_duration:
            result["durationMs"] = value
        source = node.get("durationSource")
        # Source only beside a valid duration; require str before set membership (R03).
        if has_valid_duration and isinstance(source, str) and source in {"emitter", "collector"}:
            result["durationSource"] = source
        reason = node.get("durationUnavailableReason")
        # Reason only in the absence of a valid number; drop contradictory pairs.
        if (not has_valid_duration and isinstance(reason, str)
                and reason in {"missing-start", "collector-restarted", "clock-invalid", "missing-end"}):
            result["durationUnavailableReason"] = reason
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
    flags = job.get("flags")
    result["progressEnabled"] = isinstance(flags, dict) and flags.get("progressEnabled") is True
    if "progressSummary" in job:
        result["progressSummary"] = job["progressSummary"]
    progress = job.get("progressSummary")
    nodes = progress.get("nodes") if isinstance(progress, dict) else None
    if isinstance(nodes, list):
        result["hasRetries"] = any(
            type(node.get("retryCount")) is int and node["retryCount"] > 0
            for node in nodes if isinstance(node, dict)
        )
    elif "hasRetries" in job:
        result["hasRetries"] = bool(job["hasRetries"])
    return result


def public_job_summary(job):
    """Browser-safe list projection without the recursive progress tree."""
    result = public_job(job)
    if not isinstance(result, dict):
        return result
    result.pop("progressSummary", None)
    return result


def _history_revision(state_root):
    snapshot = store_for(Path(state_root) / "history").snapshot()
    ledger = Path(state_root) / "state" / "legacy-projects.json"
    try:
        info = ledger.stat()
        ledger_version = (info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)
    except OSError:
        ledger_version = None
    raw = repr((snapshot.generation, snapshot.digests, snapshot.errors, ledger_version)).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:24]


def lookup_job(state_root, job_id, project_id=None, unassigned=False):
    """Resolve a ticket by id. Filter belongs on list endpoints, not detail."""
    if unassigned and project_id:
        raise RecordError("projectId e context=unassigned são mutuamente exclusivos")
    job_id = validate_job_id(job_id)
    root = Path(state_root)
    candidates = [
        read_json(root / "history" / (job_id + ".json")),
        read_json(root / "running.json"),
        read_json(root / "jobs" / (job_id + ".json")),
    ]
    ledger = read_json(root / "state" / "legacy-projects.json")
    for candidate in candidates:
        candidate = attribute_legacy(candidate, ledger)
        if isinstance(candidate, dict) and candidate.get("id") == job_id:
            progress = read_progress(root, job_id) if candidate.get("status") == "running" else None
            return progress_summary(candidate, progress)
    return None


def _living(state_root):
    """Machine occupancy: one running ticket and the queued remainder."""
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
    return history, running, queued


def _public_running(state_root, running):
    payload = public_job(running)
    if not isinstance(payload, dict):
        return payload
    from .history import duration_reference_for_running
    reference = duration_reference_for_running(state_root, running)
    if reference is not None:
        payload["durationReference"] = reference
    return payload


def _status_body(state_root, project, history_rows, running, queued, other_occupancy, view="default"):
    last_failed = next((row for row in history_rows if row.get("status") in {"failed", "interrupted"}), None)
    payload = {
        "schemaVersion": 1,
        "project": project,
        "serverTime": iso_now(),
        "running": _public_running(state_root, running),
        "queued": [public_job(row) for row in queued],
        "history": [public_job(row) for row in history_rows[:50]],
        "lastFailed": public_job(last_failed),
        "globalOccupancy": bool(running or queued),
        "otherProjectOccupancy": other_occupancy,
    }
    if view == "live":
        payload["projection"] = "live"
        payload["historyRevision"] = _history_revision(state_root)
        payload.pop("history", None)
        payload.pop("lastFailed", None)
        payload["queued"] = [public_job_summary(row) for row in queued]
        if isinstance(payload.get("running"), dict):
            summary = payload["running"].get("progressSummary")
            if isinstance(summary, dict):
                payload["running"]["progressSummary"] = {
                    key: summary[key] for key in ("schemaVersion", "available", "reason", "roots") if key in summary
                }
    return payload


def status_snapshot(state_root, project_id, project_name, view="default"):
    """Global occupancy plus project-scoped terminal history."""
    history, running, queued = _living(state_root)
    project_history = ([] if view == "live" else
                       [progress_summary(row) for row in history if project_record(row, project_id)])
    other_running = bool(running) and not project_record(running, project_id)
    other_queued = any(not project_record(row, project_id) for row in queued)
    return _status_body(
        state_root,
        {"id": project_id, "name": project_name},
        project_history,
        running,
        queued,
        bool(other_running or other_queued), view,
    )


def status_snapshot_unassigned(state_root, view="default"):
    history, running, queued = _living(state_root)
    unassigned = ([] if view == "live" else [progress_summary(row) for row in history
                  if row.get("status") in TERMINAL and not row.get("projectId")])
    occupied = bool(running or queued)
    return _status_body(state_root, None, unassigned, running, queued, occupied, view)


def status_snapshot_all(state_root, view="default"):
    history, running, queued = _living(state_root)
    attributed = ([] if view == "live" else [progress_summary(row) for row in history
                  if row.get("status") in TERMINAL and row.get("projectId")])
    occupied = bool(running or queued)
    return _status_body(state_root, None, attributed, running, queued, occupied, view)


def _matches_query(job, query):
    if not query:
        return True
    needle = query.casefold()
    fields = ("preset", "branch", "headSha", "id", "cwd", "command", "projectName")
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


def read_executions(state_root, project_id, q="", result="all", scope="terminal", from_time="", to_time="", snapshot_before="", cursor="", offset=0, view="default"):
    if result not in {"all", *TERMINAL}:
        raise RecordError("result inválido")
    if scope not in {"terminal", "legacy", "all"}:
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
        unassigned = not row.get("projectId")
        if unassigned:
            unknown += 1
        if scope == "legacy":
            if not unassigned:
                continue
        elif scope == "all":
            if unassigned:
                continue
        elif row.get("projectId") != project_id:
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
        rows.append(row)
    rows.sort(key=lambda row: (str(row.get("finishedAt") or ""), str(row.get("id") or "")), reverse=True)
    if cursor_value:
        rows = [row for row in rows if (str(row.get("finishedAt") or ""), str(row.get("id") or "")) < cursor_value]
        offset = 0
    page = rows[offset:offset + PAGE_SIZE]
    projected = [progress_summary(row) for row in page]
    corrupt_count = len(store_for(Path(state_root) / "history").snapshot().errors)
    return {
        "schemaVersion": 1,
        **({"projection": "summary"} if view == "summary" else {}),
        "jobs": [public_job_summary(row) if view == "summary" else public_job(row) for row in projected],
        "hasMore": len(rows) > offset + PAGE_SIZE,
        "snapshotBefore": snapshot,
        "nextCursor": _cursor_for(page[-1]) if page and len(rows) > offset + PAGE_SIZE else None,
        "coverage": {"unattributedRecords": unknown, "corruptRecords": corrupt_count},
    }
