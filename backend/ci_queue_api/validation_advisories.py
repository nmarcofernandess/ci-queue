"""Read non-blocking validation recommendations recorded by CI Queue clients."""

import json
import re
import subprocess
from datetime import datetime
from pathlib import Path

from .history import canonical_green, read_remote_slots
from .records import history_key, read_history


_SHA = re.compile(r"(?:[0-9a-f]{40}|[0-9a-f]{64})\Z")


def _timestamp(value):
    if not isinstance(value, str):
        raise ValueError("data da pendência inválida")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (OverflowError, ValueError) as error:
        raise ValueError("data da pendência inválida") from error
    if parsed.tzinfo is None:
        raise ValueError("data da pendência precisa declarar fuso")
    return parsed


def _job_timestamp(job):
    """Malformed legacy history is not allowed to hide valid advisories."""
    try:
        return _timestamp(history_key(job))
    except ValueError:
        return None


def _plan(state_root):
    path = Path(state_root) / "state" / "validation-plan.json"
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return []
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ValueError("pendências automáticas ilegíveis; arquivo preservado") from error
    if (not isinstance(raw, dict) or raw.get("schemaVersion") != 1
            or not isinstance(raw.get("pending"), list)):
        raise ValueError("pendências automáticas inválidas; arquivo preservado")
    return raw["pending"]


def _covers(repository_path, required_sha, green_sha, cache):
    if required_sha == green_sha:
        return True
    if repository_path is None:
        return False
    key = (required_sha, green_sha)
    if key in cache:
        return cache[key]
    try:
        result = subprocess.run(
            ["git", "-C", str(repository_path), "merge-base", "--is-ancestor",
             required_sha, green_sha],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=2,
        )
        cache[key] = result.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        cache[key] = False
    return cache[key]


def _documents_for(plan, project_id):
    result = []
    for entry in plan:
        if not isinstance(entry, dict) or entry.get("projectId") != project_id:
            continue
        preset = entry.get("preset")
        requirements = entry.get("requirements")
        if not isinstance(preset, str) or not isinstance(requirements, list):
            continue
        for requirement in requirements:
            if not isinstance(requirement, dict):
                continue
            sha = requirement.get("sha")
            reason = requirement.get("reason")
            created_at = requirement.get("createdAt")
            pr = requirement.get("pr")
            identity = str(pr) if pr is not None else sha
            result.append({
                "id": "%s:%s" % (preset, identity),
                "preset": preset,
                "headSha": sha,
                "reason": reason.strip() if isinstance(reason, str) else "",
                "pr": pr,
                "createdAt": created_at,
                "latestTicketId": None,
                "latestStatus": None,
            })
    result.sort(key=lambda item: item["createdAt"] or "", reverse=True)
    return result


def read_pending_advisories(state_root, config, project_id=None):
    """Return only unresolved, project-scoped advisory requirements.

    A later canonical green resolves a recommendation when it ran the current
    recipe and its Git revision contains the requested revision. Failure to
    read Git never guesses that an advisory was resolved.
    """
    ident = project_id or (config.project_id if config is not None else None)
    try:
        plan = _plan(state_root)
    except ValueError as error:
        return [], str(error)
    if config is None:
        return _documents_for(plan, ident), None

    jobs = [job for job in read_history(state_root)
            if job.get("projectId") == ident]
    jobs.sort(key=history_key, reverse=True)
    remote = read_remote_slots(config.remote_slots_path, config, state_root)
    remote_greens = remote.get("greens") if isinstance(remote, dict) else []
    if not isinstance(remote_greens, list):
        remote_greens = []
    ancestry = {}
    result = []
    try:
        for entry in plan:
            if not isinstance(entry, dict) or entry.get("projectId") != ident:
                continue
            preset = entry.get("preset")
            requirements = entry.get("requirements")
            if not isinstance(preset, str) or not preset or not isinstance(requirements, list):
                raise ValueError("pendência automática inválida; arquivo preservado")
            recipe = config.presets.get(preset)
            preset_jobs = [job for job in jobs if job.get("preset") == preset]
            timed_jobs = [(job, _job_timestamp(job)) for job in preset_jobs]
            greens = [(job, observed_at) for job, observed_at in timed_jobs
                      if canonical_green(job, recipe)]
            git_greens = [green for green in remote_greens
                          if isinstance(green, dict) and green.get("preset") == preset]
            for requirement in requirements:
                if not isinstance(requirement, dict):
                    raise ValueError("requisito automático inválido; arquivo preservado")
                sha = requirement.get("sha")
                reason = requirement.get("reason")
                created_at = requirement.get("createdAt")
                pr = requirement.get("pr")
                if (not isinstance(sha, str) or not _SHA.fullmatch(sha)
                        or not isinstance(reason, str) or not reason.strip()
                        or len(reason) > 500
                        or (pr is not None and (type(pr) is not int or pr <= 0))):
                    raise ValueError("requisito automático inválido; arquivo preservado")
                created = _timestamp(created_at)
                eligible_greens = [job for job, observed_at in greens
                                   if observed_at is not None and observed_at > created]
                resolved = next((job for job in eligible_greens
                                 if isinstance(job.get("headSha"), str)
                                 and _covers(config.repository_path, sha, job["headSha"], ancestry)), None)
                if not resolved:
                    resolved = next((green for green in git_greens
                                     if _timestamp(green.get("finishedAt")) > created
                                     and isinstance(green.get("headSha"), str)
                                     and _covers(config.repository_path, sha, green["headSha"], ancestry)), None)
                if resolved:
                    continue
                latest = next((job for job, observed_at in timed_jobs
                               if observed_at is not None and observed_at > created), None)
                identity = str(pr) if pr is not None else sha
                result.append({
                    "id": "%s:%s" % (preset, identity),
                    "preset": preset,
                    "headSha": sha,
                    "reason": reason.strip(),
                    "pr": pr,
                    "createdAt": created_at,
                    "latestTicketId": latest.get("id") if latest else None,
                    "latestStatus": latest.get("status") if latest else None,
                })
    except ValueError as error:
        return [], str(error)
    result.sort(key=lambda item: item["createdAt"], reverse=True)
    return result, None
