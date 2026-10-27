"""Whether a green revision is already contained in the project's base.

The answer comes only from the local tracking ref in the project's shared
``.git`` and its reflog; the dashboard never fetches.  Without a recent
reading a revision outside the base is reported as stale, never as "not
integrated".
"""

import os
import re
import subprocess
import threading
from datetime import datetime, timezone
from pathlib import Path

GIT_TIMEOUT = 2
MAX_AGE_SECONDS = 24 * 60 * 60
_SHA = re.compile(r"[0-9a-f]{40}\Z")
_REFLOG = re.compile(r"^([0-9a-f]{40}) ([0-9a-f]{40}) .*> (\d+) [+-]\d{4}\t(.*)$")
_MAX_CACHE = 4096
_cache = {}
_cache_lock = threading.Lock()


def _git(common_dir, *args):
    try:
        return subprocess.run(
            ["git", "--git-dir", str(common_dir), *args],
            text=True, capture_output=True, timeout=GIT_TIMEOUT,
            env={**os.environ, "GIT_OPTIONAL_LOCKS": "0"},
        )
    except (OSError, subprocess.TimeoutExpired):
        return None


def _short_name(full_ref, base_ref):
    for prefix in ("refs/remotes/", "refs/heads/"):
        if full_ref.startswith(prefix):
            name = full_ref[len(prefix):]
            return name.split("/", 1)[1] if prefix == "refs/remotes/" and "/" in name else name
    return base_ref


def _last_update(common_dir, full_ref, tip):
    try:
        lines = (Path(common_dir) / "logs" / full_ref).read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError):
        return None, None
    match = _REFLOG.match(lines[-1]) if lines else None
    if match is None or match.group(2) != tip:
        return None, None
    moment = datetime.fromtimestamp(int(match.group(3)), tz=timezone.utc)
    return moment.isoformat().replace("+00:00", "Z"), match.group(4).strip()[:160] or None


def read_base(project):
    """Resolve the base tip and when the local tracking ref last moved."""
    config = getattr(project, "config", None)
    base_ref = getattr(config, "base_ref", None) or "HEAD"
    reading = {"baseRef": base_ref, "baseName": base_ref, "readAt": None, "via": None,
               "tip": None, "commonDir": None, "reason": None}
    common = getattr(project, "git_common_dir", None)
    if common is None or not Path(common).is_dir():
        reading["reason"] = "Sem o .git local do projeto."
        return reading
    reading["commonDir"] = str(Path(common).resolve())
    named = _git(common, "rev-parse", "--symbolic-full-name", base_ref)
    full_ref = named.stdout.strip() if named is not None and named.returncode == 0 else ""
    resolved = _git(common, "rev-parse", "--verify", "--quiet", base_ref + "^{commit}")
    tip = resolved.stdout.strip() if resolved is not None and resolved.returncode == 0 else ""
    if not full_ref or not _SHA.fullmatch(tip):
        reading["reason"] = "Sem a ref local de %s." % base_ref
        return reading
    reading["baseName"] = _short_name(full_ref, base_ref)
    reading["tip"] = tip
    reading["readAt"], reading["via"] = _last_update(common, full_ref, tip)
    return reading


def _contains(common_dir, tip, sha):
    # The base only moves forward, so a contained revision stays contained when
    # the tip advances; only "outside" and "unknown" are tied to one tip.
    contained_key = (common_dir, None, sha)
    key = (common_dir, tip, sha)
    with _cache_lock:
        if contained_key in _cache:
            return True
        if key in _cache:
            return _cache[key]
    result = _git(common_dir, "merge-base", "--is-ancestor", sha, tip)
    answer = None if result is None else {0: True, 1: False}.get(result.returncode)
    with _cache_lock:
        if len(_cache) >= _MAX_CACHE:
            _cache.clear()
        _cache[contained_key if answer else key] = answer
    return answer


def _is_old(read_at, now):
    if read_at is None:
        return True
    moment = datetime.fromisoformat(read_at.replace("Z", "+00:00"))
    return (now - moment).total_seconds() > MAX_AGE_SECONDS


def integration_for(sha, reading, now=None):
    public = {key: reading[key] for key in ("baseRef", "baseName", "readAt", "via")}
    if reading["tip"] is None:
        return {"state": "unknown", **public, "reason": reading["reason"]}
    if not isinstance(sha, str) or not _SHA.fullmatch(sha):
        return {"state": "unknown", **public, "reason": "Revisão sem SHA completo."}
    contained = _contains(reading["commonDir"], reading["tip"], sha)
    if contained is None:
        return {"state": "unknown", **public, "reason": "Revisão ausente do .git local."}
    if contained:
        return {"state": "integrated", **public, "reason": None}
    if _is_old(reading["readAt"], now or datetime.now(timezone.utc)):
        return {"state": "stale", **public,
                "reason": "A ref local de %s não tem leitura das últimas 24 horas." % reading["baseRef"]}
    return {"state": "not-integrated", **public, "reason": None}


def annotate_integration(payload, projects, now=None):
    """Add ``integration`` to every machine and Git green in a greens payload."""
    by_id = {project.project_id: project for project in projects}
    readings = {}

    def reading_for(project_id):
        if project_id not in readings:
            project = by_id.get(project_id)
            readings[project_id] = read_base(project) if project is not None else None
        return readings[project_id]

    rows = [entry.get("lastGreenCanonical") and (entry["projectId"], entry["lastGreenCanonical"])
            for entry in payload.get("presets") or [] if isinstance(entry, dict)]
    rows += [(green.get("projectId"), green) for green in payload.get("greens") or []
             if isinstance(green, dict)]
    for item in rows:
        if not item:
            continue
        project_id, green = item
        reading = reading_for(project_id)
        if reading is not None:
            green["integration"] = integration_for(green.get("headSha"), reading, now)
    return payload
