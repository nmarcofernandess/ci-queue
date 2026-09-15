"""Immutable per-request project scope. The server has no mutable current project."""

from dataclasses import dataclass
from pathlib import Path
from typing import Optional
from urllib.parse import parse_qs

from .config import PROJECT_ID, load_project_config, ConfigError
from .projects import observed_project_ids, read_registry, RegistryError


class ProjectRequired(ValueError):
    def __init__(self, message="PROJECT_REQUIRED"):
        super().__init__(message)
        self.code = "PROJECT_REQUIRED"


class CapabilityDenied(ValueError):
    def __init__(self, message, code="CAPABILITY_DENIED"):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class ReadScope:
    kind: str
    project_id: Optional[str] = None

    def key(self):
        return "project:%s" % self.project_id if self.kind == "project" else "unassigned"

    def echo(self):
        if self.kind == "unassigned":
            return {"kind": "unassigned"}
        return {"kind": "project", "projectId": self.project_id}


@dataclass(frozen=True)
class ResolvedProject:
    project_id: str
    display_name: str
    registry_revision: int
    entry_revision: int
    repository_path: Optional[Path]
    git_common_dir: Optional[Path]
    config: object
    binding_state: str
    archived: bool
    base_ref: str = "HEAD"

    @property
    def project_name(self):
        return self.display_name


def scope_from_query(query, bootstrap_project_id):
    if not isinstance(query, dict):
        query = parse_qs(query or "", keep_blank_values=True)
    project_id = (query.get("projectId") or [None])[0]
    context = (query.get("context") or [None])[0]
    legacy = (query.get("scope") or [None])[0]
    if project_id == "":
        project_id = None
    if project_id is not None and not PROJECT_ID.fullmatch(project_id):
        raise ValueError("projectId inválido")
    if project_id and context == "unassigned":
        raise ValueError("projectId e context=unassigned são mutuamente exclusivos")
    if context == "unassigned" or (legacy == "legacy" and not project_id):
        return ReadScope("unassigned")
    if project_id:
        return ReadScope("project", project_id)
    if bootstrap_project_id:
        return ReadScope("project", bootstrap_project_id)
    raise ProjectRequired()


def _binding(entry, config):
    if config is not None:
        return "linked"
    if entry and entry.get("configPath"):
        return "invalid"
    if entry and entry.get("repositoryPath"):
        return "unlinked"
    return "missing"


def _load_entry_config(entry):
    path = entry.get("configPath") if entry else None
    if not path:
        return None
    try:
        return load_project_config(path)
    except (ConfigError, OSError):
        return None


def resolve_project(project_id, registry, bootstrap_config=None):
    if not isinstance(project_id, str) or not PROJECT_ID.fullmatch(project_id):
        raise LookupError("projeto não encontrado")
    projects = registry.get("projects") if isinstance(registry, dict) else {}
    entry = projects.get(project_id) if isinstance(projects, dict) else None
    if entry is None and bootstrap_config is not None and bootstrap_config.project_id == project_id:
        return ResolvedProject(
            project_id=bootstrap_config.project_id,
            display_name=bootstrap_config.project_name,
            registry_revision=int(registry.get("revision") or 0) if isinstance(registry, dict) else 0,
            entry_revision=0,
            repository_path=bootstrap_config.repository_path,
            git_common_dir=None,
            config=bootstrap_config,
            binding_state="linked",
            archived=False,
            base_ref=bootstrap_config.base_ref,
        )
    if not isinstance(entry, dict):
        raise LookupError("projeto não encontrado")
    config = _load_entry_config(entry)
    if config is None and bootstrap_config is not None and bootstrap_config.project_id == project_id:
        config = bootstrap_config
    repo = Path(entry["repositoryPath"]) if entry.get("repositoryPath") else (config.repository_path if config else None)
    common = Path(entry["gitCommonDir"]) if entry.get("gitCommonDir") else None
    base_ref = config.base_ref if config else "HEAD"
    return ResolvedProject(
        project_id=entry["id"],
        display_name=entry.get("displayName") or entry["id"],
        registry_revision=int(registry.get("revision") or 0),
        entry_revision=int(entry.get("revision") or 0),
        repository_path=repo,
        git_common_dir=common,
        config=config,
        binding_state=_binding(entry, config),
        archived=bool(entry.get("archivedAt")),
        base_ref=base_ref,
    )


def load_registry(state_root):
    try:
        return read_registry(state_root)
    except RegistryError:
        raise


def require_capability(project, capability):
    if capability in {"history", "results", "job"}:
        return project
    if capability in {"worktrees", "reveal-worktree"}:
        if project.archived:
            raise CapabilityDenied("projeto arquivado", "PROJECT_ARCHIVED")
        if project.repository_path is None or not Path(project.repository_path).exists():
            raise CapabilityDenied("pasta do projeto indisponível", "REPOSITORY_UNAVAILABLE")
        return project
    if capability in {"catalog", "duration", "greens", "meta-mutate"}:
        if project.archived:
            raise CapabilityDenied("projeto arquivado", "PROJECT_ARCHIVED")
        if project.config is None:
            raise CapabilityDenied("catálogo não vinculado", "CATALOG_UNLINKED")
        return project
    raise CapabilityDenied("capacidade desconhecida")


def with_context(payload, scope, revision=None):
    if not isinstance(payload, dict):
        return payload
    result = dict(payload)
    result["context"] = scope.echo()
    if revision is not None:
        result["contextRevision"] = revision
    return result


def summarize_projects(state_root, include_observed=False):
    document = read_registry(state_root)
    items = []
    for entry in document["projects"].values():
        items.append({
            "id": entry["id"],
            "displayName": entry.get("displayName"),
            "repositoryPath": entry.get("repositoryPath"),
            "configPath": entry.get("configPath"),
            "archivedAt": entry.get("archivedAt"),
            "revision": entry.get("revision"),
            "bindingState": _binding(entry, _load_entry_config(entry)),
        })
    observed = []
    if include_observed:
        known = set(document["projects"])
        observed = sorted(ident for ident in observed_project_ids(state_root) if ident not in known)
    return {
        "schemaVersion": 1,
        "registryRevision": document["revision"],
        "bootstrapProjectId": document.get("bootstrapProjectId"),
        "projects": items,
        "observedUnregistered": observed,
    }
