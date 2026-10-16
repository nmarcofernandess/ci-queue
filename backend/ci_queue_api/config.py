"""Configuration owned by the CI Queue product boundary.

``ci-queue.json`` identifies a consumer project and its declared recipes.  It
does *not* carry the machine's mutable queue root; the installer/server passes
that root explicitly.  Keeping those two facts apart prevents a repository
from accidentally versioning paths or records belonging to one operator.
"""

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


PROJECT_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}\Z")
PRESET_NAME = re.compile(r"[a-z0-9][a-z0-9-]{0,63}\Z")


class ConfigError(ValueError):
    """The consumer configuration is absent or cannot safely be used."""


@dataclass(frozen=True)
class ProjectConfig:
    path: Path
    project_id: str
    project_name: str
    repository_path: Optional[Path]
    base_ref: str
    presets: dict
    artifacts: tuple
    remote_slots_path: Optional[Path]

    def public(self):
        """Return fields a browser may use without exposing arbitrary config."""
        return {
            "schemaVersion": 1,
            "project": {"id": self.project_id, "name": self.project_name},
            "repository": {"baseRef": self.base_ref},
            "presets": sorted(self.presets),
            "artifacts": list(self.artifacts),
        }


def _read_json(path):
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise ConfigError("ci-queue.json não encontrado") from error
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ConfigError("ci-queue.json ilegível") from error
    if not isinstance(value, dict):
        raise ConfigError("ci-queue.json deve conter um objeto")
    return value


def _resolve(raw, base, label):
    if not isinstance(raw, str) or not raw.strip():
        raise ConfigError("%s inválido" % label)
    value = Path(os.path.expandvars(os.path.expanduser(raw)))
    return value if value.is_absolute() else (base / value).resolve()


def _valid_argv(value):
    return (
        isinstance(value, list)
        and len(value) >= 1
        and all(isinstance(item, str) and item for item in value)
    )


def load_project_config(path):
    """Read schema v1 plus the documented flat aliases during transition.

    The writer/CLI only produces the nested/top-level v1 shape.  Aliases let a
    previously installed consumer be inspected during the cutover without
    introducing a dependency on its old source tree.
    """
    config_path = Path(path).expanduser().resolve()
    payload = _read_json(config_path)
    version = payload.get("schemaVersion", 1)
    if version != 1:
        raise ConfigError("schemaVersion de ci-queue.json não é suportado")

    project = payload.get("project") if isinstance(payload.get("project"), dict) else {}
    project_id = project.get("id", payload.get("projectId"))
    project_name = project.get("name", payload.get("projectName", project_id))
    if not isinstance(project_id, str) or not PROJECT_ID.fullmatch(project_id):
        raise ConfigError("project.id inválido")
    if not isinstance(project_name, str) or not project_name.strip() or len(project_name) > 160:
        raise ConfigError("project.name inválido")

    repository = payload.get("repository") if isinstance(payload.get("repository"), dict) else {}
    repo_raw = repository.get("path")
    repository_path = _resolve(repo_raw, config_path.parent, "repository.path") if repo_raw else None
    base_ref = repository.get("baseRef", "origin/main")
    if not isinstance(base_ref, str) or not base_ref.strip() or len(base_ref) > 512:
        raise ConfigError("repository.baseRef inválido")

    presets = payload.get("presets")
    if not isinstance(presets, dict):
        presets = project.get("presets")
    if not isinstance(presets, dict):
        raise ConfigError("presets obrigatório")
    normalized = {}
    for name, definition in presets.items():
        if not isinstance(name, str) or not PRESET_NAME.fullmatch(name):
            raise ConfigError("nome de preset inválido")
        if not isinstance(definition, dict) or not _valid_argv(definition.get("argv")):
            raise ConfigError("argv inválido para preset %s" % name)
        copied = {key: value for key, value in definition.items() if key in {
            "argv", "executionTimeoutMs", "requireCleanTree", "fetchBase",
            "requireGitStability", "pinHeadSha", "finalization", "finalizationDigest",
        }}
        copied["argv"] = list(definition["argv"])
        normalized[name] = copied

    artifacts = payload.get("artifacts", [])
    if not isinstance(artifacts, list) or not all(isinstance(item, str) and item for item in artifacts):
        raise ConfigError("artifacts inválido")
    remote_slots_raw = payload.get("remoteSlotsPath")
    remote_slots_path = (_resolve(remote_slots_raw, config_path.parent, "remoteSlotsPath")
                         if remote_slots_raw else None)
    return ProjectConfig(
        path=config_path,
        project_id=project_id,
        project_name=project_name.strip(),
        repository_path=repository_path,
        base_ref=base_ref.strip(),
        presets=normalized,
        artifacts=tuple(artifacts),
        remote_slots_path=remote_slots_path,
    )
