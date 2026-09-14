"""Project-scoped history, canonical greens and local Git publication mirror."""

import json
import math
import statistics
from datetime import datetime, timezone
from pathlib import Path

from .records import history_key, read_history, read_json


def _run_ref(job):
    return {
        "ticketId": job.get("id"),
        "startedAt": job.get("startedAt"),
        "createdAt": job.get("createdAt"),
        "finishedAt": history_key(job) or None,
        "status": job.get("status"),
        "headSha": job.get("headSha"),
        "branch": job.get("branch"),
        "custom": is_custom_run(job),
        "durationMs": job.get("durationMs"),
    }


def is_custom_run(job):
    extra = job.get("extraArgs")
    return bool(job.get("custom")) or (isinstance(extra, list) and bool(extra))


def canonical_green(job, recipe):
    """A green that is comparable to the currently declared recipe.

    Passing a different argv or any extra arguments is useful history, but it
    cannot certify the declared recipe and therefore never replaces its last
    canonical green.
    """
    return (
        isinstance(recipe, dict)
        and job.get("status") == "passed"
        and type(job.get("exitCode")) is int
        and job.get("exitCode") == 0
        and not is_custom_run(job)
        and job.get("argv") == recipe.get("argv")
    )


def _valid_duration(value):
    return type(value) in (int, float) and math.isfinite(value) and value >= 0


def build_preset_history(state_root, config):
    buckets = {}
    for preset, recipe in config.presets.items():
        buckets[preset] = {
            "projectId": config.project_id,
            "projectName": config.project_name,
            "preset": preset,
            "declared": True,
            "runCount": 0,
            "canonicalRunCount": 0,
            "customRunCount": 0,
            "lastGreenCanonical": None,
            "lastRun": None,
            "lastFailure": None,
            "durationReference": None,
            "_durations": [],
        }
    unattributed = 0
    for job in read_history(state_root):
        if job.get("projectId") != config.project_id:
            if job.get("projectId") is None:
                unattributed += 1
            continue
        preset = job.get("preset")
        if not isinstance(preset, str) or not preset:
            continue
        entry = buckets.setdefault(preset, {
            "projectId": config.project_id,
            "projectName": config.project_name,
            "preset": preset,
            "declared": False,
            "runCount": 0,
            "canonicalRunCount": 0,
            "customRunCount": 0,
            "lastGreenCanonical": None,
            "lastRun": None,
            "lastFailure": None,
            "durationReference": None,
            "_durations": [],
        })
        key = history_key(job)
        entry["runCount"] += 1
        if is_custom_run(job):
            entry["customRunCount"] += 1
        if entry["lastRun"] is None or key > entry["lastRun"]["_key"]:
            entry["lastRun"] = {**_run_ref(job), "_key": key}
        if canonical_green(job, config.presets.get(preset)):
            entry["canonicalRunCount"] += 1
            if entry["lastGreenCanonical"] is None or key > entry["lastGreenCanonical"]["_key"]:
                entry["lastGreenCanonical"] = {**_run_ref(job), "_key": key}
            if _valid_duration(job.get("durationMs")):
                entry["_durations"].append((key, job["durationMs"]))
        if job.get("status") in ("failed", "interrupted"):
            if entry["lastFailure"] is None or key > entry["lastFailure"]["_key"]:
                entry["lastFailure"] = {**_run_ref(job), "failureReason": job.get("failureReason"), "_key": key}
    values = []
    for entry in buckets.values():
        samples = sorted(entry.pop("_durations"), reverse=True)[:10]
        if samples:
            durations = [item[1] for item in samples]
            entry["durationReference"] = {
                "medianMs": statistics.median(durations),
                "meanMs": statistics.fmean(durations),
                "sampleCount": len(durations),
                "window": "latest-green-canonical",
            }
        for key in ("lastRun", "lastGreenCanonical", "lastFailure"):
            if entry[key] is not None:
                entry[key].pop("_key", None)
        values.append(entry)
    values.sort(key=lambda item: item["preset"])
    values.sort(key=lambda item: (item["lastGreenCanonical"] or {}).get("finishedAt") or "", reverse=True)
    return {
        "schemaVersion": 1,
        "catalog": {"resolved": True, "projectId": config.project_id, "declaredCount": len(config.presets)},
        "presets": values,
        "totals": {"tickets": sum(item["runCount"] for item in values), "presets": len(values)},
        "coverage": {"unattributedRecords": unattributed},
    }


def read_remote_slots(path, config):
    """Read a configured local mirror only; this API never performs Git fetch.

    The installer/CLI is responsible for publication.  If no mirror is
    configured, return an explicit unavailable envelope rather than confusing
    it with an empty list of green runs.
    """
    if path is None:
        return {"schemaVersion": 1, "ok": False, "stale": False, "report": None,
                "error": "Nenhum espelho Git configurado para este projeto."}
    report = read_json(path)
    if report is None:
        return {"schemaVersion": 1, "ok": False, "stale": False, "report": None,
                "error": "Espelho Git indisponível."}
    # A mirror can be a complete report or just its payload.  It is only
    # accepted when the identity matches; equal preset names are not identity.
    report_project = report.get("projectId")
    if report_project not in (None, config.project_id):
        return {"schemaVersion": 1, "ok": False, "stale": False, "report": None,
                "error": "Espelho Git pertence a outro projeto."}
    return {"schemaVersion": 1, "ok": True, "stale": bool(report.get("stale")),
            "readAt": report.get("readAt"), "refreshedAt": report.get("refreshedAt"),
            "report": report, "error": report.get("error")}
