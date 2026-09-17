"""Analysis of retained terminal jobs, never machine telemetry."""

import math
import statistics

from .config import PRESET_NAME, PROJECT_ID
from .history import canonical_green
from .records import TERMINAL, parse_instant, read_history


def _duration(job):
    value = job.get("durationMs")
    return value if type(value) in (int, float) and math.isfinite(value) and value >= 0 and parse_instant(job.get("startedAt")) else None


def _bounds(from_time, to_time):
    lower = parse_instant(from_time) if from_time else None
    upper = parse_instant(to_time) if to_time else None
    if (from_time and lower is None) or (to_time and upper is None) or (lower and upper and lower >= upper):
        raise ValueError("intervalo inválido")
    return lower, upper


def _project_terminals(state_root, project_id, from_time, to_time, preset=""):
    lower, upper = _bounds(from_time, to_time)
    rows = []
    unknown = 0
    for job in read_history(state_root):
        if job.get("projectId") != project_id:
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
    return rows, unknown


def parse_namespaced_preset(value):
    if not isinstance(value, str) or ":" not in value:
        return None
    project_id, preset = value.split(":", 1)
    if not PROJECT_ID.fullmatch(project_id) or not PRESET_NAME.fullmatch(preset):
        return None
    return project_id, preset


def namespaced_preset_key(project_id, preset):
    return "%s:%s" % (project_id, preset)


def _attributed_terminals(state_root, from_time, to_time):
    lower, upper = _bounds(from_time, to_time)
    rows = []
    for job in read_history(state_root):
        if not job.get("projectId") or job.get("status") not in TERMINAL:
            continue
        finished = parse_instant(job.get("finishedAt"))
        if finished is None:
            continue
        if (lower and finished < lower) or (upper and finished >= upper):
            continue
        rows.append(job)
    return rows


def _registry_analysis_catalog(state_root):
    from .projects import RegistryError, read_registry, resolve_config_for_entry

    names = {}
    declared = {}
    try:
        registry = read_registry(state_root)
    except (RegistryError, OSError):
        return names, declared
    for entry in (registry.get("projects") or {}).values():
        if not isinstance(entry, dict) or entry.get("archivedAt"):
            continue
        project_id = entry.get("id")
        if not isinstance(project_id, str) or not project_id:
            continue
        names[project_id] = entry.get("displayName") or project_id
        config = resolve_config_for_entry(entry)
        declared[project_id] = list(getattr(config, "presets", {}) or {}) if config is not None else []
    return names, declared


def read_results_all(state_root, from_time="", to_time=""):
    rows = _attributed_terminals(state_root, from_time, to_time)
    groups = {}
    observed_names = {}
    for job in rows:
        project_id = job["projectId"]
        if job.get("projectName"):
            observed_names[project_id] = job["projectName"]
        name = job.get("preset") or "Não informado"
        group = groups.setdefault((project_id, name), {
            "preset": name,
            "projectId": project_id,
            "passed": 0,
            "failed": 0,
            "cancelled": 0,
            "interrupted": 0,
        })
        status = job.get("status")
        if status in group:
            group[status] += 1
    names, declared = _registry_analysis_catalog(state_root)
    presets = []
    for (project_id, name), group in groups.items():
        group["total"] = sum(group[key] for key in ("passed", "failed", "cancelled", "interrupted"))
        group["projectName"] = names.get(project_id) or observed_names.get(project_id) or project_id
        presets.append(group)
    presets.sort(key=lambda group: (group["projectName"], group["preset"], group["projectId"]))
    duration_presets = []
    for project_id, recipes in declared.items():
        label_name = names.get(project_id) or project_id
        for recipe in recipes:
            duration_presets.append({
                "key": namespaced_preset_key(project_id, recipe),
                "label": "%s · %s" % (label_name, recipe),
                "projectId": project_id,
                "preset": recipe,
            })
    duration_presets.sort(key=lambda item: (item["label"], item["key"]))
    return {
        "schemaVersion": 2,
        "metric": "results",
        "from": from_time or None,
        "to": to_time or None,
        "presets": presets,
        "sampleCount": sum(item["total"] for item in presets),
        "durationPresets": duration_presets,
    }


def read_duration_all(state_root, preset, from_time="", to_time=""):
    parsed = parse_namespaced_preset(preset)
    if parsed is None:
        raise ValueError("Em Todos, a duração exige projectId:preset")
    project_id, name = parsed
    from .project_context import load_registry, require_capability, resolve_project

    project = resolve_project(project_id, load_registry(state_root))
    require_capability(project, "duration")
    return read_analysis(state_root, project.config, from_time, to_time, name, "duration")


def read_results(state_root, config, from_time="", to_time=""):
    rows, _unknown = _project_terminals(state_root, config.project_id, from_time, to_time)
    groups = {}
    for job in rows:
        name = job.get("preset") or "Não informado"
        group = groups.setdefault(name, {
            "preset": name, "passed": 0, "failed": 0, "cancelled": 0, "interrupted": 0,
        })
        status = job.get("status")
        if status in group:
            group[status] += 1
    presets = []
    for group in groups.values():
        group["total"] = sum(group[key] for key in ("passed", "failed", "cancelled", "interrupted"))
        presets.append(group)
    presets.sort(key=lambda group: group["preset"])
    return {
        "schemaVersion": 2,
        "metric": "results",
        "projectId": config.project_id,
        "from": from_time or None,
        "to": to_time or None,
        "presets": presets,
        "sampleCount": sum(item["total"] for item in presets),
    }


def read_analysis(state_root, config, from_time="", to_time="", preset="", metric=""):
    if metric == "results":
        return read_results(state_root, config, from_time, to_time)
    if metric not in {"", "duration"}:
        raise ValueError("metric inválida")
    rows, unknown = _project_terminals(state_root, config.project_id, from_time, to_time, preset)
    if preset and preset not in getattr(config, "presets", {}):
        raise ValueError("preset não declarado")

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
