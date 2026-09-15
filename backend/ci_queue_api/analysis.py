"""Analysis of retained terminal jobs, never machine telemetry."""

import math
import statistics

from .history import canonical_green
from .records import TERMINAL, parse_instant, read_history


def _duration(job):
    value = job.get("durationMs")
    return value if type(value) in (int, float) and math.isfinite(value) and value >= 0 and parse_instant(job.get("startedAt")) else None


def read_analysis(state_root, config, from_time="", to_time="", preset=""):
    lower = parse_instant(from_time) if from_time else None
    upper = parse_instant(to_time) if to_time else None
    if (from_time and lower is None) or (to_time and upper is None) or (lower and upper and lower >= upper):
        raise ValueError("intervalo inválido")
    if preset and preset not in config.presets:
        # An unknown recipe must not look like an empty duration series for an
        # arbitrary similarly named historical job.
        raise ValueError("preset não declarado")

    rows = []
    unknown = 0
    for job in read_history(state_root):
        if job.get("projectId") != config.project_id:
            if job.get("projectId") is None:
                unknown += 1
            continue
        if job.get("status") not in TERMINAL or (preset and job.get("preset") != preset):
            continue
        finished = parse_instant(job.get("finishedAt"))
        if finished is None:
            continue
        if (lower and finished < lower) or (upper and finished >= upper):
            continue
        rows.append(job)
    rows.sort(key=lambda job: (str(job.get("finishedAt") or ""), str(job.get("id") or "")), reverse=True)
    groups = {}
    for job in rows:
        name = job.get("preset") or "Não informado"
        group = groups.setdefault(name, {
            "preset": name, "passed": 0, "failed": 0, "cancelled": 0, "interrupted": 0,
            "points": [], "_durations": [], "failedDurationMs": 0,
            "failedDurationCount": 0, "failedDurationMissing": 0,
        })
        group[job["status"]] += 1
        measured = _duration(job)
        if job["status"] in ("failed", "interrupted"):
            if measured is None:
                group["failedDurationMissing"] += 1
            else:
                group["failedDurationMs"] += measured
                group["failedDurationCount"] += 1
        if measured is not None and canonical_green(job, config.presets.get(name)):
            group["_durations"].append(measured)
            group["points"].append({"id": job.get("id"), "at": job.get("finishedAt"), "durationMs": measured})
    presets = []
    for group in groups.values():
        durations = group.pop("_durations")
        group["total"] = sum(group[key] for key in ("passed", "failed", "cancelled", "interrupted"))
        group["passRate"] = (group["passed"] / (group["passed"] + group["failed"])
                             if group["passed"] + group["failed"] else None)
        group["duration"] = {
            "count": len(durations),
            "medianMs": statistics.median(durations) if durations else None,
            "minMs": min(durations) if durations else None,
            "maxMs": max(durations) if durations else None,
        }
        group["points"].reverse()
        presets.append(group)
    presets.sort(key=lambda group: group["preset"])
    return {
        "schemaVersion": 1,
        "projectId": config.project_id,
        "from": from_time or None,
        "to": to_time or None,
        "preset": preset or None,
        "total": len(rows),
        "presets": presets,
        "coverage": {"unattributedRecords": unknown},
    }
