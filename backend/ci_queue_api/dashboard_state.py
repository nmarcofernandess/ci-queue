"""Manual project Meta and Notes; intentionally separate from CI approval debt."""

import fcntl
import json
import os
import re
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

from .history import canonical_green
from .records import history_key, read_history


class RevisionConflict(ValueError):
    pass


SHA = re.compile(r"(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})\Z")


def _now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _path(state_root):
    return Path(state_root) / "state" / "dashboard.json"


def _empty():
    return {"revision": 0, "meta": None, "notes": []}


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
    notes = state.get("notes")
    if not isinstance(notes, list) or any(
            not isinstance(note, dict)
            or not all(isinstance(note.get(key), str) for key in ("id", "title", "text", "createdAt", "updatedAt"))
            for note in notes):
        raise ValueError("notas do dashboard inválidas; arquivo preservado")
    meta = state.get("meta")
    if meta is not None and (
            not isinstance(meta, dict)
            or not all(isinstance(meta.get(key), str) for key in ("name", "description", "headSha"))
            or not isinstance(meta.get("presets"), list)
            or not all(isinstance(item, str) for item in meta["presets"])):
        raise ValueError("meta do dashboard inválida; arquivo preservado")
    return {"revision": state["revision"], "meta": meta, "notes": notes}


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
    head_sha = _text(raw.get("headSha"), "SHA alvo", 64)
    if not SHA.fullmatch(head_sha):
        raise ValueError("SHA alvo inválido")
    presets = raw.get("presets")
    if not isinstance(presets, list) or not all(isinstance(item, str) and item for item in presets):
        raise ValueError("requisitos da meta inválidos")
    if len(presets) != len(set(presets)) or len(presets) > 128:
        raise ValueError("requisitos da meta duplicados ou excessivos")
    return {"name": name, "description": description, "headSha": head_sha.lower(), "presets": list(presets)}


def _note(raw, previous=None):
    if not isinstance(raw, dict):
        raise ValueError("nota inválida")
    now = _now()
    return {
        "id": previous["id"] if previous else str(uuid.uuid4()),
        "title": _text(raw.get("title"), "título da nota", 160),
        "text": _text(raw.get("text"), "texto da nota", 20_000, allow_empty=True),
        "createdAt": previous["createdAt"] if previous else now,
        "updatedAt": now,
    }


def _decorated(state, state_root, config):
    result = {**state, "projectId": config.project_id, "presets": sorted(config.presets)}
    meta = state.get("meta")
    if not meta:
        return result
    jobs = sorted((job for job in read_history(state_root)
                   if job.get("projectId") == config.project_id and job.get("headSha") == meta["headSha"]),
                  key=history_key, reverse=True)
    checks = []
    for preset in meta["presets"]:
        recipe = config.presets.get(preset)
        if recipe is None:
            checks.append({"preset": preset, "status": "recipe-missing", "ticketId": None})
            continue
        green = next((job for job in jobs if job.get("preset") == preset and canonical_green(job, recipe)), None)
        checks.append({"preset": preset, "status": "passed" if green else "pending",
                       "ticketId": green.get("id") if green else None})
    result["meta"] = {**meta, "checks": checks}
    return result


def read_dashboard_state(state_root, config):
    state = _project_state(_read(_path(state_root)), config.project_id)
    return _decorated(state, state_root, config)


def write_dashboard_state(state_root, config, body):
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
        elif action == "save-note":
            state["notes"] = [*state["notes"], _note(body.get("note"))]
        elif action == "update-note":
            note_id = body.get("id")
            previous = next((item for item in state["notes"] if item.get("id") == note_id), None)
            if previous is None:
                raise LookupError("nota não encontrada")
            state["notes"] = [_note(body.get("note"), previous) if item.get("id") == note_id else item for item in state["notes"]]
        elif action == "remove-note":
            note_id = body.get("id")
            if not isinstance(note_id, str) or not any(item.get("id") == note_id for item in state["notes"]):
                raise LookupError("nota não encontrada")
            state["notes"] = [item for item in state["notes"] if item.get("id") != note_id]
        else:
            raise ValueError("ação do dashboard inválida")
        state["revision"] += 1
        document["projects"][config.project_id] = state
        _write_atomic(path, document)
    return _decorated(state, state_root, config)
