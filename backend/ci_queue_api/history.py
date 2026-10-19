"""Project-scoped history, canonical greens and local Git publication mirror."""

import json
import math
import re
import statistics
from datetime import datetime, timezone
from pathlib import Path

from .completion import completion_for_job, public_completion, recipe_finalization_digest
from .record_store import store_for
from .records import history_key, read_history, read_history_with_coverage, read_json


REMOTE_SLOT_SCHEMA = 1
REMOTE_SLOT_NAMESPACE = "refs/ci/last-green"
_SHA = re.compile(r"[0-9a-f]{40}\Z")


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
        "completion": public_completion(job),
        **({"finalizationDigest": job["finalizationDigest"]} if job.get("finalizationDigest") else {}),
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
        and completion_for_job(job)["eligible"]
        and job.get("finalizationDigest") == recipe_finalization_digest(recipe)
        and job.get("status") == "passed"
        and type(job.get("exitCode")) is int
        and job.get("exitCode") == 0
        and not is_custom_run(job)
        and job.get("argv") == recipe.get("argv")
    )


def _valid_duration(value):
    if type(value) not in (int, float):
        return False
    try:
        return math.isfinite(value) and value >= 0
    except OverflowError:
        return False


def duration_reference_from_samples(samples):
    window = sorted(samples, reverse=True)[:10]
    if not window:
        return None
    durations = [item[1] for item in window]
    return {
        "medianMs": statistics.median(durations),
        "meanMs": statistics.fmean(durations),
        "sampleCount": len(durations),
        "window": "latest-green-canonical",
    }


def duration_reference_for_running(state_root, job):
    """Mean of the ticket's catalog, not the request filter. Absent when unknown."""
    if not isinstance(job, dict):
        return None
    project_id = job.get("projectId")
    preset = job.get("preset")
    if not isinstance(project_id, str) or not project_id or not isinstance(preset, str) or not preset:
        return None
    from .projects import RegistryError, read_registry, resolve_config_for_entry
    try:
        registry = read_registry(state_root)
    except (RegistryError, OSError):
        return None
    projects = registry.get("projects") if isinstance(registry, dict) else {}
    entry = projects.get(project_id) if isinstance(projects, dict) else None
    if not isinstance(entry, dict):
        return None
    config = resolve_config_for_entry(entry)
    recipe = config.presets.get(preset) if config is not None else None
    if not isinstance(recipe, dict):
        return None
    samples = []
    for row in read_history(state_root):
        if row.get("projectId") != project_id or row.get("preset") != preset:
            continue
        if canonical_green(row, recipe) and _valid_duration(row.get("durationMs")):
            samples.append((history_key(row), row["durationMs"]))
    return duration_reference_from_samples(samples)


def build_preset_history(state_root, config, *, jobs=None, corrupt_count=None):
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
    for job in read_history(state_root) if jobs is None else jobs:
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
        entry["durationReference"] = duration_reference_from_samples(entry.pop("_durations"))
        for key in ("lastRun", "lastGreenCanonical", "lastFailure"):
            if entry[key] is not None:
                entry[key].pop("_key", None)
        values.append(entry)
    values.sort(key=lambda item: item["preset"])
    values.sort(key=lambda item: (item["lastGreenCanonical"] or {}).get("finishedAt") or "", reverse=True)
    if corrupt_count is None:
        corrupt_count = read_history_with_coverage(state_root)[1]["corruptRecords"]
    return {
        "schemaVersion": 1,
        "catalog": {"resolved": True, "projectId": config.project_id, "declaredCount": len(config.presets)},
        "presets": values,
        "totals": {"tickets": sum(item["runCount"] for item in values), "presets": len(values)},
        "coverage": {"unattributedRecords": unattributed, "corruptRecords": corrupt_count},
    }


def _aggregate_history_snapshot(state_root):
    jobs, coverage = read_history_with_coverage(state_root)
    grouped = {}
    for job in jobs:
        project_id = job.get("projectId")
        grouped.setdefault(project_id, []).append(job)
    return grouped, coverage["corruptRecords"]


def _project_read_error(project, error):
    return {"projectId": project.project_id, "projectName": project.display_name,
            "error": str(error)}


def build_preset_history_all(state_root, projects):
    grouped, corrupt_count = _aggregate_history_snapshot(state_root)
    presets = []
    catalogs = []
    errors = []
    for project in projects:
        try:
            if project.config is None:
                raise ValueError("catálogo não vinculado: " + project.binding_state)
            payload = build_preset_history(state_root, project.config,
                jobs=grouped.get(project.project_id, []), corrupt_count=corrupt_count)
            presets.extend({**entry, "projectName": project.display_name} for entry in payload["presets"])
            catalogs.append({**payload["catalog"], "projectName": project.display_name})
        except (OSError, ValueError) as error:
            errors.append(_project_read_error(project, error))
    presets.sort(key=lambda entry: (entry["projectId"], entry["preset"]))
    presets.sort(key=lambda entry: (entry["lastGreenCanonical"] or {}).get("finishedAt") or "",
                 reverse=True)
    return {"schemaVersion": 2, "projects": catalogs, "presets": presets,
            "projectErrors": errors,
            "totals": {"tickets": sum(entry["runCount"] for entry in presets), "presets": len(presets)},
            "coverage": {"unattributedRecords": len(grouped.get(None, [])), "corruptRecords": corrupt_count}}


def read_remote_slots_all(state_root, projects):
    grouped, _ = _aggregate_history_snapshot(state_root)
    rows = []
    greens = []
    errors = []
    for project in projects:
        identity = {"projectId": project.project_id, "projectName": project.display_name,
                    "catalog": project.binding_state}
        try:
            if project.config is None:
                raise ValueError("catálogo não vinculado: " + project.binding_state)
            ids = {job.get("id") for job in grouped.get(project.project_id, []) if isinstance(job.get("id"), str)}
            payload = read_remote_slots(project.config.remote_slots_path, project.config,
                                        state_root, local_ticket_ids=ids,
                                        completed_jobs={job.get("id"): job for job in grouped.get(project.project_id, [])})
            rows.append({**identity, "source": payload["source"], "coverage": payload["coverage"]})
            greens.extend({**green, "projectName": project.display_name} for green in payload["greens"])
        except (OSError, ValueError) as error:
            rows.append({**identity, "source": None, "coverage": None})
            errors.append(_project_read_error(project, error))
    return {"schemaVersion": 2, "projects": rows, "greens": greens, "projectErrors": errors}


def _remote_reason(code, message):
    return {"code": code, "message": message}


def _valid_sha(value):
    return isinstance(value, str) and bool(_SHA.fullmatch(value))


def _valid_timestamp(value):
    if not isinstance(value, str) or not value:
        return False
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (OverflowError, ValueError):
        return False
    return parsed.tzinfo is not None


def _timestamp_or_none(value):
    return value if _valid_timestamp(value) else None


def _remote_response(config, available, stale=False, reason=None, remote=None,
                     read_at=None, refreshed_at=None, greens=None,
                     without_tag=None, invalid_payloads=None):
    """Build the browser contract for Git last-greens.

    ``greens`` is intentionally the only collection that represents runnable
    history rows.  Missing and invalid slots live in coverage, so a consumer
    cannot accidentally render an inferred green for a declared preset.
    """
    greens = greens or []
    without_tag = without_tag or []
    invalid_payloads = invalid_payloads or []
    return {
        "schemaVersion": 2,
        "source": {
            "kind": "git",
            "available": available,
            "stale": bool(stale),
            "remote": remote if isinstance(remote, str) and remote else None,
            "namespace": REMOTE_SLOT_NAMESPACE,
            "readAt": _timestamp_or_none(read_at),
            "refreshedAt": _timestamp_or_none(refreshed_at),
            "reason": reason,
        },
        "catalog": {
            "resolved": True,
            "projectId": config.project_id,
            "declaredCount": len(config.presets),
        },
        "greens": greens,
        "coverage": {
            "declaredPresets": len(config.presets),
            "greenPresets": len(greens),
            "withoutTagPresets": sorted(without_tag),
            "invalidPayloads": invalid_payloads,
        },
    }


def _mirror_report(raw):
    """Separate the old cache envelope from the real SlotReadReport payload."""
    if not isinstance(raw, dict):
        return None, False, False, None, None, None
    if "report" not in raw and "ok" not in raw:
        return raw, True, False, None, raw.get("generatedAt"), None
    ok = raw.get("ok")
    if type(ok) is not bool:
        return None, False, False, None, None, None
    return (
        raw.get("report"),
        ok,
        raw.get("stale") is True or not ok,
        raw.get("error") if isinstance(raw.get("error"), str) else None,
        raw.get("readAt"),
        raw.get("refreshedAt"),
    )


def _report_project_ids(report):
    identities = []
    if isinstance(report.get("projectId"), str):
        identities.append(report["projectId"])
    catalog = report.get("catalog")
    if isinstance(catalog, dict) and isinstance(catalog.get("projectId"), str):
        identities.append(catalog["projectId"])
    return identities


def _local_ticket_ids(state_root, project_id):
    if state_root is None:
        return set()
    return {
        job.get("id")
        for job in read_history(state_root)
        if job.get("projectId") == project_id and isinstance(job.get("id"), str)
    }


def _canonical_git_green(slot, config, local_ticket_ids, completed_jobs=None):
    """Return an API green only when the published tag proves every invariant.

    The slot writer already derives these fields from the canonical history
    aggregator.  A mirror remains an external file, though, so the bridge
    verifies the compatible schema, identity, success outcome and tag target
    before projecting it as a passed row.
    """
    payload = slot.get("payload")
    preset = slot.get("preset")
    if not isinstance(payload, dict):
        return None, "payload-missing"
    if slot.get("state") != "publicado" or slot.get("annotated") is not True:
        return None, "slot-not-published"
    if slot.get("ref") != "%s/%s" % (REMOTE_SLOT_NAMESPACE, preset):
        return None, "slot-ref-invalid"
    if type(payload.get("schema")) is not int or payload.get("schema") != REMOTE_SLOT_SCHEMA:
        return None, "payload-schema-unsupported"
    if payload.get("preset") != preset or preset not in config.presets:
        return None, "payload-preset-mismatch"
    if payload.get("projectId") != config.project_id:
        return None, "payload-project-mismatch"
    if payload.get("projectIdSource") not in ("ticket", "fallback"):
        return None, "payload-project-source-invalid"
    required_digest = recipe_finalization_digest(config.presets[preset])
    if required_digest is not None:
        job = (completed_jobs or {}).get(payload.get("ticketId"))
        if (payload.get("finalizationDigest") != required_digest or not job
                or not canonical_green(job, config.presets[preset])
                or job.get("headSha") != payload.get("headSha")):
            return None, "execution-incomplete"
    head_sha = payload.get("headSha")
    if not _valid_sha(head_sha):
        return None, "payload-head-invalid"
    if slot.get("commitSha") != head_sha:
        return None, "slot-commit-mismatch"
    base_sha = payload.get("baseSha")
    if base_sha is not None and not _valid_sha(base_sha):
        return None, "payload-base-invalid"
    ticket_id = payload.get("ticketId")
    if not isinstance(ticket_id, str) or not ticket_id:
        return None, "payload-ticket-invalid"
    branch = payload.get("branch")
    if not isinstance(branch, str) or not branch.strip():
        return None, "payload-branch-invalid"
    if not _valid_timestamp(payload.get("finishedAt")):
        return None, "payload-finished-at-invalid"
    duration_ms = payload.get("durationMs")
    if duration_ms is not None and not _valid_duration(duration_ms):
        return None, "payload-duration-invalid"
    if type(payload.get("exitCode")) is not int or payload.get("exitCode") != 0:
        return None, "payload-exit-not-green"
    if payload.get("ancestorOfBase") is not True:
        return None, "payload-ancestor-not-proven"
    if not _valid_timestamp(payload.get("publishedAt")):
        return None, "payload-published-at-invalid"
    if type(payload.get("aggregatorSchema")) is not int or payload.get("aggregatorSchema") != 1:
        return None, "payload-aggregator-schema-unsupported"
    return {
        "origin": "git",
        "preset": preset,
        "projectId": config.project_id,
        "ticketId": ticket_id,
        "jobAvailable": ticket_id in local_ticket_ids,
        "status": "passed",
        "headSha": head_sha,
        "commitSha": head_sha,
        "baseSha": base_sha,
        "branch": branch,
        "finishedAt": payload["finishedAt"],
        "publishedAt": payload["publishedAt"],
        "durationMs": duration_ms,
        "ref": slot["ref"],
    }, None


def read_remote_slots(path, config, state_root=None, *, local_ticket_ids=None, completed_jobs=None):
    """Read and normalize a local Git-slot mirror without fetching Git.

    The source format is the `SlotReadReport` emitted by the canonical
    `read-green --json` reader: annotated ``refs/ci/last-green/<preset>`` tags
    with schema-1 JSON payloads.  Older bridge cache envelopes are accepted,
    but their opaque ``report`` is never passed to the browser.
    """
    if path is None:
        return _remote_response(
            config, False,
            reason=_remote_reason("not-configured", "Nenhum espelho Git configurado para este projeto."),
        )
    raw = read_json(path)
    if raw is None:
        try:
            readable = Path(path).is_file()
        except OSError:
            readable = False
        return _remote_response(
            config, False,
            reason=_remote_reason(
                "mirror-unreadable" if readable else "mirror-unavailable",
                "Espelho Git ilegível." if readable else "Espelho Git indisponível.",
            ),
        )

    report, upstream_ok, stale, upstream_error, read_at, refreshed_at = _mirror_report(raw)
    if not isinstance(report, dict):
        return _remote_response(
            config, False, stale=stale,
            reason=_remote_reason("report-unreadable", upstream_error or "Espelho Git não contém um relatório entendível."),
            read_at=read_at, refreshed_at=refreshed_at,
        )
    if _timestamp_or_none(read_at) is None:
        read_at = report.get("generatedAt")
    remote = report.get("remote")
    if any(project_id != config.project_id for project_id in _report_project_ids(report)):
        return _remote_response(
            config, False, stale=stale, remote=remote,
            reason=_remote_reason("project-mismatch", "Espelho Git pertence a outro projeto."),
            read_at=read_at, refreshed_at=refreshed_at,
        )
    if (type(report.get("slotSchema")) is not int or report.get("slotSchema") != REMOTE_SLOT_SCHEMA
            or report.get("namespace") != REMOTE_SLOT_NAMESPACE):
        return _remote_response(
            config, False, stale=stale, remote=remote,
            reason=_remote_reason("report-unreadable", "Espelho Git usa um formato de slots não suportado."),
            read_at=read_at, refreshed_at=refreshed_at,
        )
    if report.get("reachable") is not True:
        return _remote_response(
            config, False, stale=True, remote=remote,
            reason=_remote_reason("git-unreachable", report.get("error") if isinstance(report.get("error"), str)
                                  else "Não foi possível ler os slots Git."),
            read_at=read_at, refreshed_at=refreshed_at,
        )
    slots = report.get("slots")
    if not isinstance(slots, list):
        return _remote_response(
            config, False, stale=stale, remote=remote,
            reason=_remote_reason("report-unreadable", "Espelho Git não contém uma lista de slots entendível."),
            read_at=read_at, refreshed_at=refreshed_at,
        )

    declared = set(config.presets)
    by_preset = {}
    invalid_payloads = []
    for slot in slots:
        if not isinstance(slot, dict):
            invalid_payloads.append({"preset": None, "reason": "slot-invalid"})
            continue
        preset = slot.get("preset")
        if not isinstance(preset, str):
            invalid_payloads.append({"preset": None, "reason": "slot-preset-invalid"})
            continue
        if preset in declared:
            by_preset.setdefault(preset, []).append(slot)

    if local_ticket_ids is None:
        local_ticket_ids = _local_ticket_ids(state_root, config.project_id)
    if completed_jobs is None:
        needs_completion = any(recipe_finalization_digest(recipe) is not None for recipe in config.presets.values())
        completed_jobs = ({job.get("id"): job for job in read_history(state_root)}
                          if state_root is not None and needs_completion else {})
    greens = []
    without_tag = []
    for preset in sorted(declared):
        entries = by_preset.get(preset, [])
        if not entries:
            without_tag.append(preset)
            continue
        if len(entries) != 1:
            invalid_payloads.append({"preset": preset, "reason": "duplicate-preset"})
            continue
        slot = entries[0]
        if slot.get("state") == "sem slot":
            without_tag.append(preset)
            continue
        green, problem = _canonical_git_green(slot, config, local_ticket_ids, completed_jobs)
        if problem:
            invalid_payloads.append({"preset": preset, "reason": problem})
        else:
            greens.append(green)

    greens.sort(key=lambda entry: (entry["preset"], entry["headSha"]))
    if not upstream_ok:
        return _remote_response(
            config, False, stale=True, remote=remote,
            reason=_remote_reason("mirror-unavailable", upstream_error or "Espelho Git está indisponível."),
            read_at=read_at, refreshed_at=refreshed_at, greens=greens,
            without_tag=without_tag, invalid_payloads=invalid_payloads,
        )
    if not greens and invalid_payloads:
        return _remote_response(
            config, False, stale=stale, remote=remote,
            reason=_remote_reason("payload-unreadable", "Nenhum slot Git provou um último verde canônico."),
            read_at=read_at, refreshed_at=refreshed_at,
            without_tag=without_tag, invalid_payloads=invalid_payloads,
        )
    return _remote_response(
        config, True, stale=stale, remote=remote,
        read_at=read_at, refreshed_at=refreshed_at, greens=greens,
        without_tag=without_tag, invalid_payloads=invalid_payloads,
    )
