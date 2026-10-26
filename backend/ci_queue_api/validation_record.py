"""Read the consumer's opt-in Git record. Never writes, executes or resolves it."""

import hashlib
import json
import re
from datetime import datetime
from pathlib import Path, PurePosixPath


_SHA = re.compile(r"(?:[a-f0-9]{40}|[a-f0-9]{64})\Z")
_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}\Z")
_PRESET = re.compile(r"[a-z0-9][a-z0-9-]{0,63}\Z")


def _text(value, limit=2000):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ValueError("texto inválido no registro de validações")
    return value


def _timestamp(value):
    _text(value)
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError("data inválida no registro de validações") from error
    if parsed.tzinfo is None:
        raise ValueError("data sem fuso no registro de validações")


def requirement_fingerprint(item):
    fields = [item[key] for key in ("id", "preset", "headSha", "scope", "reason", "createdAt")]
    fields.append(item.get("pr"))
    return hashlib.sha256(json.dumps(fields, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest()


def _pending(raw, project_id):
    if (not isinstance(raw, dict) or raw.get("kind") != "ci-queue-validations"
            or type(raw.get("schemaVersion")) is not int or raw["schemaVersion"] != 1
            or raw.get("projectId") != project_id or not isinstance(raw.get("requirements"), list)):
        raise ValueError("registro de validações inválido")
    result = []
    ids = set()
    for item in raw["requirements"]:
        if not isinstance(item, dict):
            raise ValueError("validação inválida")
        ident = _text(item.get("id"), 128)
        preset = _text(item.get("preset"), 64)
        head = _text(item.get("headSha"), 64)
        if not _ID.fullmatch(ident) or ident in ids or not _PRESET.fullmatch(preset) or not _SHA.fullmatch(head):
            raise ValueError("identidade de validação inválida ou duplicada")
        ids.add(ident)
        scope = _text(item.get("scope"))
        reason = _text(item.get("reason"), 500)
        _timestamp(item.get("createdAt"))
        pr = item.get("pr")
        if "pr" in item and (type(pr) is not int or pr <= 0 or pr > 9007199254740991):
            raise ValueError("PR inválida no registro de validações")
        resolution = item.get("resolution")
        if "resolution" in item:
            if (not isinstance(resolution, dict)
                    or not re.fullmatch(r"[a-f0-9]{64}", _text(resolution.get("fingerprint"), 64))
                    or not _SHA.fullmatch(_text(resolution.get("headSha"), 64))):
                raise ValueError("fechamento de validação inválido")
            _text(resolution.get("scope"))
            _text(resolution.get("evidence"))
            _timestamp(resolution.get("createdAt"))
            if (resolution["fingerprint"] == requirement_fingerprint(item)
                    and resolution["scope"] == scope):
                continue
        result.append({
            "id": ident, "preset": preset, "headSha": head,
            "reason": "%s · Escopo: %s" % (reason, scope),
            "pr": pr, "createdAt": item["createdAt"],
            "latestTicketId": None, "latestStatus": None,
        })
    return sorted(result, key=lambda item: item["createdAt"], reverse=True)


def read_consumer_validations(config, project=None):
    """Return (pending, error, source), with None pending only for no opt-in.

    Project registry's original paths deliberately bypass the fallback used by
    other views. Missing/invalid input affects observability, never admission.
    """
    if project is not None:
        root = project.registered_repository_path
        catalog = project.registered_config_path
        ident = project.project_id
    else:
        root = (config.repository_path or config.path.parent) if config is not None else None
        catalog = config.path if config is not None else None
        ident = config.project_id if config is not None else None
    source = {"status": "unconfigured", "path": None}
    if root is None or catalog is None:
        return None, None, source
    if not Path(root).is_dir() or not Path(catalog).is_file():
        return [], "principal ou catálogo cadastrado indisponível; nenhuma outra worktree foi usada", {**source, "status": "unavailable"}
    try:
        catalog_raw = json.loads(Path(catalog).read_text(encoding="utf-8"))
        if not isinstance(catalog_raw, dict):
            raise ValueError("catálogo da principal inválido")
        relative = catalog_raw.get("validationRecord")
        if relative is None:
            return None, None, source
        if catalog_raw.get("project", {}).get("id", catalog_raw.get("projectId")) != ident:
            raise ValueError("identidade do catálogo da principal divergente")
        if (not isinstance(relative, str) or not relative.strip() or "\\" in relative
                or any(char in relative for char in "\0\r\n")
                or PurePosixPath(relative).is_absolute() or ".." in PurePosixPath(relative).parts):
            raise ValueError("validationRecord deve ser path relativo dentro do consumidor")
        root = Path(root).resolve()
        path = (root / relative).resolve()
        if path == root or root not in path.parents:
            raise ValueError("validationRecord fora do consumidor")
        source["path"] = str(path)
        if not path.exists():
            return [], "registro de validações ausente: %s" % relative, {**source, "status": "missing"}
        pending = _pending(json.loads(path.read_text(encoding="utf-8")), ident)
        return pending, None, {**source, "status": "ready"}
    except (OSError, UnicodeError, ValueError, RuntimeError, AttributeError) as error:
        return [], "registro de validações inválido; arquivo preservado: %s" % error, {**source, "status": "invalid"}
