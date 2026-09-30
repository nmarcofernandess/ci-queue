"""Validated readers for execution observations (direct runs).

Does not import records.py — avoids cycles. Projections are job-shaped dicts
for the human history surface only; never tickets for worker/proof readers.
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from .record_store import SnapshotError, store_for

OBS_ID = re.compile(r"obs-[a-f0-9]{64}\Z")
SHA40 = re.compile(r"[a-f0-9]{40}\Z")
SHA64 = re.compile(r"[a-f0-9]{64}\Z")
ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}\Z")
TERMINAL = frozenset(("passed", "failed", "cancelled", "interrupted"))
INPUT_KEYS = frozenset((
    "schemaVersion", "kind", "executionId", "projectId", "projectName", "recipe",
    "executor", "status", "startedAt", "finishedAt", "durationMs", "exitCode",
    "cwd", "branch", "headSha", "baseSha", "runtime", "evidenceSha256", "failureReason",
))
STORED_EXTRA = frozenset(("id", "importedAt", "payloadSha256"))


class ObservationError(ValueError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def _require_string(value, field, maximum):
    if not isinstance(value, str) or not value or len(value) > maximum:
        raise ObservationError("OBSERVATION_UNREADABLE", "%s inválido" % field)
    if any(ord(ch) < 32 for ch in value):
        raise ObservationError("OBSERVATION_UNREADABLE", "%s contém controle" % field)
    return value


def _parse_iso(value, field):
    raw = _require_string(value, field, 64)
    try:
        normalized = raw.replace("Z", "+00:00")
        instant = datetime.fromisoformat(normalized)
    except ValueError as error:
        raise ObservationError("OBSERVATION_UNREADABLE", "%s não é ISO" % field) from error
    if instant.tzinfo is None:
        raise ObservationError("OBSERVATION_UNREADABLE", "%s sem timezone" % field)
    utc = instant.astimezone(timezone.utc)
    # Match JavaScript Date#toISOString() (always includes milliseconds).
    return utc.strftime("%Y-%m-%dT%H:%M:%S.") + f"{int(utc.microsecond / 1000):03d}Z"


def _payload_sha256(input_obj):
    ordered = {
        "schemaVersion": input_obj["schemaVersion"],
        "kind": input_obj["kind"],
        "executionId": input_obj["executionId"],
        "projectId": input_obj["projectId"],
        "projectName": input_obj["projectName"],
        "recipe": input_obj["recipe"],
        "executor": input_obj["executor"],
        "status": input_obj["status"],
        "startedAt": input_obj["startedAt"],
        "finishedAt": input_obj["finishedAt"],
        "durationMs": input_obj["durationMs"],
        "exitCode": input_obj["exitCode"],
        "cwd": input_obj["cwd"],
        "branch": input_obj["branch"],
        "headSha": input_obj["headSha"],
    }
    if "baseSha" in input_obj:
        ordered["baseSha"] = input_obj["baseSha"]
    runtime = {
        "platform": input_obj["runtime"]["platform"],
        "arch": input_obj["runtime"]["arch"],
    }
    if "node" in input_obj["runtime"]:
        runtime["node"] = input_obj["runtime"]["node"]
    ordered["runtime"] = runtime
    ordered["evidenceSha256"] = input_obj["evidenceSha256"]
    if "failureReason" in input_obj:
        ordered["failureReason"] = input_obj["failureReason"]
    encoded = json.dumps(ordered, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _observation_id(project_id, execution_id):
    digest = hashlib.sha256()
    digest.update(project_id.encode("utf-8"))
    digest.update(b"\0")
    digest.update(execution_id.encode("utf-8"))
    return "obs-" + digest.hexdigest()


def parse_stored_observation(value):
    if not isinstance(value, dict):
        raise ObservationError("OBSERVATION_UNREADABLE", "documento inválido")
    obs_id = value.get("id")
    imported_at = value.get("importedAt")
    payload_sha = value.get("payloadSha256")
    if not isinstance(obs_id, str) or not OBS_ID.match(obs_id):
        raise ObservationError("OBSERVATION_UNREADABLE", "id inválido")
    _parse_iso(imported_at, "importedAt")
    if not isinstance(payload_sha, str) or not SHA64.match(payload_sha):
        raise ObservationError("OBSERVATION_UNREADABLE", "payloadSha256 inválido")

    raw = {key: entry for key, entry in value.items() if key not in STORED_EXTRA}
    for key in raw:
        if key not in INPUT_KEYS:
            raise ObservationError("OBSERVATION_UNREADABLE", "campo desconhecido: %s" % key)

    if raw.get("schemaVersion") != 1 or raw.get("kind") != "ci-execution-observation":
        raise ObservationError("OBSERVATION_UNREADABLE", "schema/kind inválido")
    if raw.get("executor") != "direct":
        raise ObservationError("OBSERVATION_UNREADABLE", "executor inválido")
    status = raw.get("status")
    if status not in TERMINAL:
        raise ObservationError("OBSERVATION_UNREADABLE", "status inválido")

    execution_id = _require_string(raw.get("executionId"), "executionId", 128)
    project_id = _require_string(raw.get("projectId"), "projectId", 128)
    if not ID.match(execution_id) or not ID.match(project_id):
        raise ObservationError("OBSERVATION_UNREADABLE", "id de projeto/execução inválido")

    started_at = _parse_iso(raw.get("startedAt"), "startedAt")
    finished_at = _parse_iso(raw.get("finishedAt"), "finishedAt")
    started_ms = int(datetime.fromisoformat(started_at.replace("Z", "+00:00")).timestamp() * 1000)
    finished_ms = int(datetime.fromisoformat(finished_at.replace("Z", "+00:00")).timestamp() * 1000)
    if finished_ms < started_ms:
        raise ObservationError("OBSERVATION_UNREADABLE", "finishedAt anterior")
    duration = raw.get("durationMs")
    if type(duration) is not int or duration < 0 or duration != finished_ms - started_ms:
        raise ObservationError("OBSERVATION_UNREADABLE", "durationMs inválido")

    exit_code = raw.get("exitCode")
    if exit_code is None:
        if status in {"passed", "failed"}:
            raise ObservationError("OBSERVATION_UNREADABLE", "exitCode null incompatível")
    elif type(exit_code) is not int or exit_code < 0 or exit_code > 2147483647:
        raise ObservationError("OBSERVATION_UNREADABLE", "exitCode inválido")
    elif status == "passed" and exit_code != 0:
        raise ObservationError("OBSERVATION_UNREADABLE", "passed exige exit 0")
    elif status == "failed" and exit_code == 0:
        raise ObservationError("OBSERVATION_UNREADABLE", "failed rejeita exit 0")

    runtime = raw.get("runtime")
    if not isinstance(runtime, dict):
        raise ObservationError("OBSERVATION_UNREADABLE", "runtime inválido")
    for key in runtime:
        if key not in {"platform", "arch", "node"}:
            raise ObservationError("OBSERVATION_UNREADABLE", "runtime.%s" % key)
    runtime_out = {
        "platform": _require_string(runtime.get("platform"), "runtime.platform", 128),
        "arch": _require_string(runtime.get("arch"), "runtime.arch", 128),
    }
    if "node" in runtime:
        runtime_out["node"] = _require_string(runtime.get("node"), "runtime.node", 128)

    evidence = _require_string(raw.get("evidenceSha256"), "evidenceSha256", 64)
    if not SHA64.match(evidence):
        raise ObservationError("OBSERVATION_UNREADABLE", "evidenceSha256 inválido")
    head = _require_string(raw.get("headSha"), "headSha", 40)
    if not SHA40.match(head):
        raise ObservationError("OBSERVATION_UNREADABLE", "headSha inválido")

    input_obj = {
        "schemaVersion": 1,
        "kind": "ci-execution-observation",
        "executionId": execution_id,
        "projectId": project_id,
        "projectName": _require_string(raw.get("projectName"), "projectName", 256),
        "recipe": _require_string(raw.get("recipe"), "recipe", 128),
        "executor": "direct",
        "status": status,
        "startedAt": started_at,
        "finishedAt": finished_at,
        "durationMs": duration,
        "exitCode": exit_code,
        "cwd": _require_string(raw.get("cwd"), "cwd", 4096),
        "branch": _require_string(raw.get("branch"), "branch", 512),
        "headSha": head,
        "runtime": runtime_out,
        "evidenceSha256": evidence,
    }
    if "baseSha" in raw:
        base = _require_string(raw.get("baseSha"), "baseSha", 40)
        if not SHA40.match(base):
            raise ObservationError("OBSERVATION_UNREADABLE", "baseSha inválido")
        input_obj["baseSha"] = base
    if "failureReason" in raw:
        input_obj["failureReason"] = _require_string(raw.get("failureReason"), "failureReason", 512)

    expected_id = _observation_id(project_id, execution_id)
    if obs_id != expected_id:
        raise ObservationError("OBSERVATION_UNREADABLE", "id não corresponde")
    expected_hash = _payload_sha256(input_obj)
    if payload_sha != expected_hash:
        raise ObservationError("OBSERVATION_UNREADABLE", "payloadSha256 não corresponde")

    return {**input_obj, "id": obs_id, "importedAt": imported_at, "payloadSha256": payload_sha}


def to_observed_job(stored):
    """Public job-shaped projection for History /api surfaces."""
    return {
        "id": stored["id"],
        "recordKind": "observed-execution",
        "executor": "direct",
        "executionId": stored["executionId"],
        "projectId": stored["projectId"],
        "projectName": stored["projectName"],
        "preset": stored["recipe"],
        "status": stored["status"],
        "startedAt": stored["startedAt"],
        "finishedAt": stored["finishedAt"],
        "createdAt": stored["startedAt"],
        "durationMs": stored["durationMs"],
        "exitCode": stored["exitCode"],
        "cwd": stored["cwd"],
        "branch": stored["branch"],
        "headSha": stored["headSha"],
        "failureReason": stored.get("failureReason"),
        "progressEnabled": False,
        "logAvailability": "not-collected",
    }


def read_observed_executions(state_root, strict=False):
    """Return validated observation projections; never reads worktrees."""
    directory = Path(state_root) / "observations"
    try:
        snapshot = store_for(directory).snapshot(strict=strict)
    except SnapshotError as error:
        if strict:
            raise ObservationError("OBSERVATION_UNREADABLE", str(error)) from error
        return [], 0
    rows = []
    invalid = 0
    for row in snapshot.rows:
        try:
            stored = parse_stored_observation(row)
            rows.append(to_observed_job(stored))
        except ObservationError:
            invalid += 1
            if strict:
                raise
    return rows, invalid + len(snapshot.errors)


def lookup_observed_execution(state_root, execution_id):
    """Resolve obs-<hash> from observations/ only."""
    if not isinstance(execution_id, str) or not OBS_ID.match(execution_id):
        return None
    path = Path(state_root) / "observations" / (execution_id + ".json")
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return None
    try:
        return to_observed_job(parse_stored_observation(raw))
    except ObservationError:
        return None


def observed_history_revision(state_root):
    snapshot = store_for(Path(state_root) / "observations").snapshot()
    raw = repr((snapshot.generation, snapshot.digests, snapshot.errors)).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:24]


def observation_log_unavailable(job_id):
    return {
        "available": False,
        "reason": "execution-output-not-collected",
        "error": "Esta execução direta não anexou log bruto ao histórico.",
        "jobId": job_id,
        "coverage": {"available": False, "reason": "execution-output-not-collected"},
    }


def observation_diagnostic_unavailable(job_id):
    return {
        "schemaVersion": 1,
        "jobId": job_id,
        "available": False,
        "reason": "execution-output-not-collected",
        "error": "Esta execução direta não anexou log bruto ao histórico.",
    }
