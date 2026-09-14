"""Small local-only native actions resolved from IDs, never browser paths."""

import re
import subprocess
import sys
from pathlib import Path

from .records import lookup_job, validate_job_id
from .worktrees import resolve_worktree


TARGETS = {"directory": lambda path: ["/usr/bin/open", str(path)],
           "file": lambda path: ["/usr/bin/open", "-R", str(path)]}


def available():
    return sys.platform == "darwin" and Path("/usr/bin/open").is_file()


def _job_directory(state_root, config, identifier):
    job = lookup_job(state_root, identifier, config.project_id)
    if not job or not isinstance(job.get("cwd"), str):
        raise LookupError("ticket sem diretório de execução registrado")
    try:
        raw = Path(job["cwd"])
        candidate = raw.resolve()
    except OSError as error:
        raise LookupError("diretório do ticket indisponível") from error
    if raw.is_symlink() or not candidate.is_dir():
        raise LookupError("diretório do ticket indisponível")
    # Resolve every inventory root at action time, so a replaced symlink cannot
    # turn a previously valid ID into an arbitrary path.
    from .worktrees import discover
    for row in discover(config) or []:
        try:
            root = Path(row["path"]).resolve()
        except OSError:
            continue
        if candidate == root or root in candidate.parents:
            return candidate
    raise LookupError("diretório do ticket fora das worktrees permitidas")


def reveal(state_root, config, entity, identifier, target="directory", runner=subprocess.run):
    if not available():
        raise RuntimeError("Abertura nativa não é suportada nesta plataforma")
    if entity not in {"worktree", "job"}:
        raise ValueError("entidade não permitida")
    if target not in TARGETS:
        raise ValueError("alvo não permitido")
    if entity == "worktree":
        path = resolve_worktree(config, identifier)
    else:
        validate_job_id(identifier)
        path = _job_directory(state_root, config, identifier)
    result = runner(TARGETS[target](path), check=False, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError("o sistema não conseguiu abrir o caminho solicitado")
    return {"ok": True, "entity": entity, "id": identifier, "target": target, "path": str(path)}
