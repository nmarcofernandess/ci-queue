"""Project Meta plus read-only validation recommendations."""

import fcntl
import json
import os
import re
import tempfile
from pathlib import Path

from .config import PRESET_NAME
from .history import canonical_green
from .records import history_key, read_history
from .validation_advisories import (
    read_pending_advisories,
    read_pending_advisories_snapshot,
    read_validation_plan,
)


class RevisionConflict(ValueError):
    pass


_SHA = re.compile(r"(?:[0-9a-f]{40}|[0-9a-f]{64})\Z")


def _path(state_root):
    return Path(state_root) / "state" / "dashboard.json"


def _empty():
    return {"revision": 0, "meta": None}


def _read(path):
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {"schemaVersion": 1, "projects": {}}
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ValueError("estado do dashboard ilegível; arquivo preservado") from error
    if not isinstance(document, dict) or document.get("schemaVersion") != 1 or not isinstance(document.get("projects"), dict):
        raise ValueError("estado do dashboard inválido; arquivo preservado")
    return document


def _project_state(document, project_id):
    state = document["projects"].get(project_id, _empty())
    if not isinstance(state, dict) or type(state.get("revision")) is not int or state["revision"] < 0:
        raise ValueError("estado do projeto inválido; arquivo preservado")
    meta = state.get("meta")
    if meta is not None and (
            not isinstance(meta, dict)
            or not all(isinstance(meta.get(key), str) for key in ("name", "description"))
            or not isinstance(meta.get("presets"), list)
            or not all(isinstance(item, str) for item in meta["presets"])):
        raise ValueError("meta do dashboard inválida; arquivo preservado")
    return {
        "revision": state["revision"],
        "meta": None if meta is None else {
            "name": meta["name"],
            "description": meta["description"],
            "presets": list(meta["presets"]),
        },
    }


def _write_atomic(path, document):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix="dashboard-", suffix=".json", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(document, stream, ensure_ascii=False, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


def _text(value, label, limit, allow_empty=False):
    if not isinstance(value, str) or len(value) > limit or (not allow_empty and not value.strip()):
        raise ValueError("%s inválido" % label)
    return value.strip()


def _meta(raw, config):
    if not isinstance(raw, dict):
        raise ValueError("meta inválida")
    name = _text(raw.get("name"), "nome da meta", 160)
    description = _text(raw.get("description", ""), "descrição da meta", 10_000, allow_empty=True)
    presets = raw.get("presets")
    if not isinstance(presets, list):
        raise ValueError("requisitos da meta inválidos")
    normalized = [item.strip() for item in presets if isinstance(item, str)]
    if (not normalized or len(normalized) != len(presets)
            or any(not PRESET_NAME.fullmatch(item) for item in normalized)):
        raise ValueError("a meta precisa de ao menos uma receita válida")
    if len(normalized) != len(set(normalized)) or len(normalized) > 128:
        raise ValueError("requisitos da meta duplicados ou excessivos")
    return {"name": name, "description": description, "presets": normalized}


def _decorated(state, state_root, config, project_id=None, *, catalog=None,
               history=None, plan=None, plan_error=None):
    ident = project_id or (config.project_id if config is not None else None)
    if config is None:
        pending, pending_error = (
            read_pending_advisories_snapshot(
                state_root, None, ident, plan,
                history if history is not None else [], plan_error,
            ) if plan is not None else read_pending_advisories(state_root, None, project_id=ident)
        )
        result = {
            **state,
            "projectId": ident,
            "presets": [],
            "catalog": catalog or "unlinked",
            "pending": pending,
            "pendingError": pending_error,
        }
        meta = state.get("meta")
        if meta:
            result["meta"] = {
                **meta, "checks": None, "candidateSha": None,
                "catalog": catalog or "unlinked",
            }
        return result
    result = {
        **state,
        "projectId": config.project_id,
        "presets": sorted(config.presets),
        "catalog": catalog or "linked",
    }
    pending, pending_error = (
        read_pending_advisories_snapshot(
            state_root, config, ident, plan,
            history if history is not None else [], plan_error,
        ) if plan is not None else read_pending_advisories(state_root, config)
    )
    result["pending"] = pending
    result["pendingError"] = pending_error
    meta = state.get("meta")
    if not meta:
        return result
    source_history = history if history is not None else read_history(state_root)
    jobs = sorted((job for job in source_history
                   if job.get("projectId") == config.project_id),
                  key=history_key, reverse=True)
    checks = []
    for preset in meta["presets"]:
        recipe = config.presets.get(preset)
        if recipe is None:
            checks.append({
                "preset": preset,
                "status": "recipe-missing",
                "ticketId": None,
                "headSha": None,
                "finishedAt": None,
            })
            continue
        green = next((job for job in jobs if job.get("preset") == preset and canonical_green(job, recipe)), None)
        checks.append({
            "preset": preset,
            "status": "passed" if green else "pending",
            "ticketId": green.get("id") if green else None,
            "headSha": green.get("headSha") if green else None,
            "finishedAt": history_key(green) if green else None,
        })
    heads = {item["headSha"] for item in checks
             if item["status"] == "passed"
             and isinstance(item["headSha"], str)
             and _SHA.fullmatch(item["headSha"])}
    candidate_sha = (next(iter(heads)) if checks
                     and all(item["status"] == "passed" for item in checks)
                     and all(isinstance(item["headSha"], str)
                             and _SHA.fullmatch(item["headSha"])
                             for item in checks)
                     and len(heads) == 1 else None)
    result["meta"] = {**meta, "checks": checks, "candidateSha": candidate_sha}
    return result


def read_dashboard_state(state_root, config, project_id=None):
    ident = project_id or (config.project_id if config is not None else None)
    if not ident:
        raise ValueError("projeto obrigatório")
    state = _project_state(_read(_path(state_root)), ident)
    return _decorated(state, state_root, config, ident)


def read_dashboard_state_all(state_root, projects):
    """Aggregate factual Meta and Pendências for active project snapshots."""
    document = _read(_path(state_root))
    plan, plan_error = read_validation_plan(state_root)
    history = read_history(state_root)
    rows = []
    project_errors = []
    ordered = sorted(projects, key=lambda project: (project.display_name.casefold(), project.project_id))
    for project in ordered:
        try:
            state = _project_state(document, project.project_id)
            rows.append({
                **_decorated(
                    state,
                    state_root,
                    project.config,
                    project.project_id,
                    catalog=project.binding_state,
                    history=history,
                    plan=plan,
                    plan_error=plan_error,
                ),
                "catalog": project.binding_state,
                "projectName": project.display_name,
            })
        except (OSError, ValueError) as error:
            project_errors.append({
                "projectId": project.project_id,
                "projectName": project.display_name,
                "error": str(error),
            })
    return {
        "schemaVersion": 2,
        "projects": rows,
        "projectErrors": project_errors,
    }


def write_dashboard_state(state_root, config, body):
    if config is None:
        raise ValueError("catálogo não vinculado")
    if not isinstance(body, dict) or type(body.get("revision")) is not int:
        raise ValueError("revisão obrigatória")
    path = _path(state_root)
    path.parent.mkdir(parents=True, exist_ok=True)
    lock_path = path.parent / "dashboard.lock"
    with lock_path.open("a+", encoding="utf-8") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        document = _read(path)
        state = _project_state(document, config.project_id)
        if body["revision"] != state["revision"]:
            raise RevisionConflict("O painel foi editado em outra aba. Reabra antes de salvar.")
        action = body.get("action")
        if action == "save-meta":
            state["meta"] = _meta(body.get("meta"), config)
        elif action == "remove-meta":
            state["meta"] = None
        else:
            raise ValueError("ação do dashboard inválida")
        state["revision"] += 1
        document["projects"][config.project_id] = state
        _write_atomic(path, document)
    return _decorated(state, state_root, config)
