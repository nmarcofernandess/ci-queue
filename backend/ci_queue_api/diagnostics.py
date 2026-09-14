"""Bounded log export and ticket-scoped diagnostic payloads."""

import re
from pathlib import Path

from .records import lookup_job, validate_job_id


MAX_EXPORT_BYTES = 8 * 1024 * 1024
LOG_SLICE_LIMIT = 512 * 1024
SECRET = re.compile(r"(?i)(token|secret|password|authorization|api[_-]?key)\s*([:=])\s*([^\n]+)")


def _redact(value):
    return SECRET.sub(lambda item: "%s%s[REDACTED]" % (item.group(1), item.group(2)), value)


def _path(state_root, job_id):
    return Path(state_root) / "logs" / (job_id + ".log")


def _read(path, offset, length):
    try:
        size = path.stat().st_size
        with path.open("rb") as stream:
            start = min(offset, size)
            stream.seek(start)
            raw = stream.read(length)
    except FileNotFoundError:
        return "", 0, offset, False, "log não encontrado"
    except OSError as error:
        return "", 0, offset, False, "log indisponível: %s" % error
    end = start + len(raw)
    return _redact(raw.decode("utf-8", errors="replace")), size, end, end >= size, None


def read_log_slice(state_root, config, job_id, offset=0, length=LOG_SLICE_LIMIT):
    validate_job_id(job_id)
    if not isinstance(offset, int) or offset < 0 or not isinstance(length, int) or not 0 < length <= MAX_EXPORT_BYTES:
        raise ValueError("intervalo de leitura inválido")
    if lookup_job(state_root, job_id, config.project_id) is None:
        return {"schemaVersion": 1, "jobId": job_id, "content": "", "offset": offset,
                "nextOffset": offset, "sourceBytes": 0, "complete": False, "error": "ticket não encontrado"}
    content, source, next_offset, complete, error = _read(_path(state_root, job_id), offset, length)
    return {"schemaVersion": 1, "jobId": job_id, "content": content, "offset": offset,
            "nextOffset": next_offset, "sourceBytes": source, "complete": complete, "error": error}


def read_log_export(state_root, config, job_id):
    validate_job_id(job_id)
    if lookup_job(state_root, job_id, config.project_id) is None:
        return {"schemaVersion": 1, "jobId": job_id, "content": "",
                "coverage": {"available": False, "reason": "ticket não encontrado"}}
    path = _path(state_root, job_id)
    try:
        size = path.stat().st_size
        with path.open("rb") as stream:
            if size <= MAX_EXPORT_BYTES:
                raw = stream.read()
                mode = "complete"
            else:
                marker = b"\n\n[... trecho intermediario omitido ...]\n\n"
                budget = MAX_EXPORT_BYTES - len(marker)
                head = stream.read(budget // 2)
                stream.seek(-(budget - len(head)), 2)
                raw = head + marker + stream.read(budget - len(head))
                mode = "head-and-tail"
    except FileNotFoundError:
        return {"schemaVersion": 1, "jobId": job_id, "content": "",
                "coverage": {"available": False, "reason": "log não encontrado"}}
    except OSError as error:
        return {"schemaVersion": 1, "jobId": job_id, "content": "",
                "coverage": {"available": False, "reason": "log indisponível: %s" % error}}
    content = _redact(raw.decode("utf-8", errors="replace"))
    return {"schemaVersion": 1, "jobId": job_id, "content": content,
            "coverage": {"available": True, "sourceBytes": size, "capturedBytes": len(raw),
                         "complete": size <= MAX_EXPORT_BYTES, "preserved": mode}}


def read_diagnostic(state_root, config, job_id):
    validate_job_id(job_id)
    job = lookup_job(state_root, job_id, config.project_id)
    if job is None:
        return {"schemaVersion": 1, "jobId": job_id, "available": False, "reason": "ticket não encontrado"}
    export = read_log_export(state_root, config, job_id)
    progress = job.get("progress") or job.get("progressSummary")
    observations = job.get("processObservations") or ([] if not isinstance(job.get("processObservation"), dict) else [job["processObservation"]])
    return {
        "schemaVersion": 1,
        "jobId": job_id,
        "available": True,
        "ticket": {key: job.get(key) for key in ("id", "preset", "status", "exitCode", "failureReason", "headSha", "branch", "durationMs")},
        "progress": progress,
        "resources": {"observations": observations, "coverage": "unavailable" if not observations else "reported"},
        "coverage": {"ticket": "complete", "logs": export.get("coverage"),
                     "progress": "complete" if progress else "unavailable"},
    }
