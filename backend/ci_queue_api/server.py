"""Loopback HTTP bridge for CI Queue records and the compiled dashboard."""

import argparse
import json
import mimetypes
import os
import secrets
import sys
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Optional
from urllib.parse import parse_qs, urlparse

from .analysis import read_analysis
from .config import ConfigError, load_project_config
from .dashboard_state import RevisionConflict as DashboardConflict, read_dashboard_state, write_dashboard_state
from .diagnostics import read_log_export, read_log_slice, read_diagnostic
from .history import build_preset_history, read_remote_slots
from .machine import read_machine
from .native_actions import (
    TARGETS,
    PickCancelled,
    available as native_available,
    pick_available,
    pick_local_path,
    reveal,
)
from .project_context import (
    CapabilityDenied,
    ProjectRequired,
    load_registry,
    require_capability,
    resolve_project,
    scope_from_query,
    summarize_projects,
    with_context,
)
from .projects import (
    RegistryError,
    RevisionConflict as ProjectConflict,
    bootstrap_registry,
    mutate_registry,
    probe_project,
)
from .provenance import release_provenance
from .records import (
    RecordError,
    iso_now,
    lookup_job,
    public_job,
    read_executions,
    status_snapshot,
    status_snapshot_unassigned,
)
from .worktrees import list_worktrees, worktree_view


LOOPBACK = {"127.0.0.1", "::1", "localhost"}
MAX_REQUEST_BYTES = 64 * 1024
PROJECT_PATHS = {"/api/projects", "/api/project-probe", "/api/project-pick"}
NO_CORS = {"/api/projects", "/api/project-probe", "/api/project-pick"}


@dataclass
class ApiContext:
    config: object
    state_root: Path
    ui_root: Optional[Path]
    csrf_token: str
    manifest_path: Optional[Path] = None
    manifest_sha256: Optional[str] = None
    bootstrap_error: Optional[str] = None


class _UnassignedConfig:
    project_id = None
    project_name = None
    presets = {}
    remote_slots_path = None
    repository_path = None
    base_ref = "HEAD"

    def public(self):
        return {"schemaVersion": 1, "project": None, "presets": []}


def _is_loopback(host):
    return host in LOOPBACK


def _host_name(value):
    try:
        return urlparse("http://" + value).hostname
    except ValueError:
        return None


def _integer(value, label, default=0):
    if value is None:
        return default
    if not isinstance(value, str) or not value.isdigit():
        raise ValueError("%s inválido" % label)
    return int(value)


def _bootstrap_id(context):
    if context.config is not None:
        return context.config.project_id
    try:
        return read_registry_id(context.state_root)
    except RegistryError:
        return None


def read_registry_id(state_root):
    from .projects import read_registry
    return read_registry(state_root).get("bootstrapProjectId")


def create_handler(context):
    class Handler(BaseHTTPRequestHandler):
        api_context = context

        def log_message(self, format, *args):
            return

        def end_headers(self):
            path = urlparse(self.path).path
            if self.command == "GET" and path.startswith("/api/") and path not in NO_CORS:
                self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            super().end_headers()

        def send_payload(self, status, payload):
            body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def error(self, status, message, code=None):
            payload = {"error": message}
            if code:
                payload["code"] = code
            self.send_payload(status, payload)

        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-CI-CSRF")
            self.end_headers()

        def _guard_project_endpoint(self):
            if self.headers.get("Sec-Fetch-Site") == "cross-site":
                raise PermissionError("origem cruzada não permitida")
            if not _is_loopback(self.client_address[0]):
                raise PermissionError("ação permitida apenas em loopback")
            host = self.headers.get("Host", "")
            origin = self.headers.get("Origin")
            if origin and (origin != "http://" + host or not _is_loopback(_host_name(host))):
                raise PermissionError("Origin não corresponde ao dashboard")

        def _mutating_request(self):
            if not _is_loopback(self.client_address[0]):
                raise PermissionError("ação permitida apenas em loopback")
            host = self.headers.get("Host", "")
            expected = "http://" + host
            origin = self.headers.get("Origin")
            if not origin or origin != expected or not _is_loopback(_host_name(host)):
                raise PermissionError("Origin não corresponde ao dashboard")
            if self.headers.get("X-CI-CSRF") != self.api_context.csrf_token:
                raise PermissionError("token CSRF inválido")
            if urlparse(self.path).path in PROJECT_PATHS:
                self._guard_project_endpoint()
            content_type = (self.headers.get("Content-Type") or "").split(";", 1)[0].lower().strip()
            if content_type != "application/json":
                raise TypeError("Content-Type deve ser application/json")
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError as error:
                raise ValueError("Content-Length inválido") from error
            if not 0 < length <= MAX_REQUEST_BYTES:
                raise ValueError("corpo da requisição excede o limite")
            try:
                value = json.loads(self.rfile.read(length).decode("utf-8"))
            except (UnicodeError, json.JSONDecodeError) as error:
                raise ValueError("JSON inválido") from error
            if not isinstance(value, dict):
                raise ValueError("corpo da requisição inválido")
            return value

        def _scope(self, query):
            bootstrap = self.api_context.config.project_id if self.api_context.config is not None else _bootstrap_id(self.api_context)
            return scope_from_query(query, bootstrap)

        def _resolved(self, scope):
            if scope.kind != "project":
                return None
            registry = load_registry(self.api_context.state_root)
            return resolve_project(scope.project_id, registry, self.api_context.config)

        def _handle_http_error(self, error):
            if isinstance(error, ProjectRequired):
                self.error(409, str(error), error.code)
            elif isinstance(error, CapabilityDenied):
                self.error(409, str(error), error.code)
            elif isinstance(error, (DashboardConflict, ProjectConflict)):
                self.error(409, str(error), "CONFLICT")
            elif isinstance(error, PickCancelled):
                self.error(409, str(error), "CANCELLED")
            elif isinstance(error, RegistryError):
                self.error(503, str(error), "REGISTRY_UNREADABLE")
            elif isinstance(error, LookupError):
                self.error(404, str(error))
            elif isinstance(error, PermissionError):
                self.error(403, str(error))
            elif isinstance(error, TypeError):
                self.error(415, str(error))
            elif isinstance(error, (ConfigError, RecordError, ValueError, OSError, RuntimeError)):
                self.error(400, str(error))
            else:
                raise error

        def do_POST(self):
            path = urlparse(self.path).path
            if path not in {"/api/dashboard-state", "/api/reveal", "/api/projects", "/api/project-probe", "/api/project-pick"}:
                self.error(404, "endpoint não encontrado")
                return
            try:
                body = self._mutating_request()
                query = parse_qs(urlparse(self.path).query, keep_blank_values=True)
                if path == "/api/project-pick":
                    result = pick_local_path(body.get("kind"))
                elif path == "/api/project-probe":
                    result = probe_project(self.api_context.state_root, body)
                elif path == "/api/projects":
                    mutate_registry(self.api_context.state_root, body)
                    result = summarize_projects(self.api_context.state_root)
                elif path == "/api/dashboard-state":
                    scope = self._scope(query)
                    project = require_capability(self._resolved(scope), "meta-mutate")
                    result = with_context(
                        write_dashboard_state(self.api_context.state_root, project.config, body),
                        scope,
                        project.entry_revision,
                    )
                else:
                    if body.get("action") != "reveal":
                        raise ValueError("ação não permitida")
                    scope = self._scope(query)
                    project = require_capability(self._resolved(scope), "reveal-worktree")
                    result = reveal(self.api_context.state_root, project, body.get("entity"), body.get("id"),
                                    body.get("target", "directory"))
            except Exception as error:
                try:
                    self._handle_http_error(error)
                except Exception:
                    self.error(400, str(error))
                return
            self.send_payload(200, result)

        def _serve_static(self, path):
            root = self.api_context.ui_root
            if root is None:
                self.error(503, "Painel não compilado. Instale uma distribuição completa do CI Queue.")
                return True
            target = (root / ("index.html" if path in {"/", "/dashboard"} else path.lstrip("/"))).resolve()
            try:
                target.relative_to(root.resolve())
            except ValueError:
                self.error(404, "arquivo não encontrado")
                return True
            if not target.is_file():
                if "." not in target.name:
                    target = root / "index.html"
                if not target.is_file():
                    self.error(404, "arquivo não encontrado")
                    return True
            body = target.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(str(target))[0] or "application/octet-stream")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return True

        def do_GET(self):
            parsed = urlparse(self.path)
            query = parse_qs(parsed.query, keep_blank_values=True)
            try:
                if parsed.path == "/health":
                    payload = {"ok": True, "apiVersion": 1, "serverTime": iso_now(),
                               "resourceHistoryCollection": False}
                    if self.api_context.config is not None:
                        payload["projectId"] = self.api_context.config.project_id
                    if self.api_context.bootstrap_error:
                        payload["bootstrapError"] = self.api_context.bootstrap_error
                    self.send_payload(200, payload)
                    return
                if parsed.path == "/build.json":
                    manifest = release_provenance(self.api_context.manifest_path,
                                                  self.api_context.manifest_sha256)
                    payload = {"apiVersion": 1, "manifest": manifest, "serverTime": iso_now()}
                    if self.api_context.config is not None:
                        payload["projectId"] = self.api_context.config.project_id
                    self.send_payload(200, payload)
                    return
                if parsed.path == "/api/session":
                    if not _is_loopback(self.client_address[0]) or not _is_loopback(_host_name(self.headers.get("Host", ""))):
                        self.error(403, "sessão permitida apenas em loopback")
                    else:
                        self.send_payload(200, {"csrfToken": self.api_context.csrf_token,
                                                "canReveal": native_available(),
                                                "canPick": pick_available(),
                                                "revealTargets": sorted(TARGETS),
                                                "clipboardLimitBytes": 512000})
                    return
                if parsed.path == "/api/machine":
                    self.send_payload(200, read_machine(self.api_context.state_root))
                    return
                if parsed.path == "/api/projects":
                    self._guard_project_endpoint()
                    include = query.get("includeObserved", ["0"])[0] in {"1", "true"}
                    self.send_payload(200, summarize_projects(self.api_context.state_root, include))
                    return
                if not parsed.path.startswith("/api/"):
                    self._serve_static(parsed.path)
                    return
                scope = self._scope(query)
                if scope.kind == "unassigned":
                    self._serve_unassigned(parsed.path, query, scope)
                    return
                project = self._resolved(scope)
                self._serve_project(parsed.path, query, scope, project)
                return
            except Exception as error:
                try:
                    self._handle_http_error(error)
                    return
                except Exception:
                    self.error(400, str(error))
                    return

        def _serve_unassigned(self, path, query, scope):
            anon = _UnassignedConfig()
            if path == "/api/status":
                self.send_payload(200, with_context(status_snapshot_unassigned(self.api_context.state_root), scope))
                return
            if path == "/api/executions":
                payload = read_executions(
                    self.api_context.state_root, "",
                    q=query.get("q", [""])[0], result=query.get("result", ["all"])[0],
                    scope="legacy", from_time=query.get("from", [""])[0],
                    to_time=query.get("to", [""])[0], snapshot_before=query.get("snapshotBefore", [""])[0],
                    cursor=query.get("cursor", [""])[0], offset=_integer(query.get("offset", ["0"])[0], "offset"),
                )
                self.send_payload(200, with_context(payload, scope))
                return
            if path == "/api/job":
                job = lookup_job(self.api_context.state_root, query.get("jobId", [""])[0], unassigned=True)
                if job is None:
                    self.error(404, "ticket não encontrado neste arquivo")
                else:
                    self.send_payload(200, with_context(public_job(job), scope))
                return
            if path == "/api/log":
                if lookup_job(self.api_context.state_root, query.get("jobId", [""])[0], unassigned=True) is None:
                    self.error(404, "ticket não encontrado neste arquivo")
                    return
                self.send_payload(200, with_context(read_log_slice(
                    self.api_context.state_root, anon, query.get("jobId", [""])[0],
                    _integer(query.get("offset", ["0"])[0], "offset"),
                    _integer(query.get("length", [str(512 * 1024)])[0], "length"),
                    unassigned=True,
                ), scope))
                return
            if path == "/api/log/export":
                if lookup_job(self.api_context.state_root, query.get("jobId", [""])[0], unassigned=True) is None:
                    self.error(404, "ticket não encontrado neste arquivo")
                    return
                self.send_payload(200, with_context(read_log_export(
                    self.api_context.state_root, anon, query.get("jobId", [""])[0], unassigned=True,
                ), scope))
                return
            if path == "/api/diagnostic":
                payload = read_diagnostic(self.api_context.state_root, anon, query.get("jobId", [""])[0], unassigned=True)
                self.send_payload(200 if payload.get("available") else 404, with_context(payload, scope))
                return
            if path in {"/api/worktrees", "/api/preset-history", "/api/remote-slots", "/api/analysis",
                        "/api/dashboard-state", "/api/config"}:
                raise CapabilityDenied("esta view exige um projeto", "PROJECT_REQUIRED")
            if path.startswith("/api/"):
                self.error(404, "endpoint não encontrado")
                return
            self._serve_static(path)

        def _serve_project(self, path, query, scope, project):
            config = project.config if project.config is not None else _UnassignedConfig()
            revision = project.entry_revision
            if path == "/api/config":
                if project.config is None:
                    self.send_payload(200, with_context({
                        "schemaVersion": 1,
                        "apiVersion": 1,
                        "project": {"id": project.project_id, "name": project.display_name},
                        "presets": [],
                        "catalog": project.binding_state,
                        "nativeReveal": {"available": native_available(), "targets": sorted(TARGETS)},
                    }, scope, revision))
                    return
                self.send_payload(200, with_context({
                    **project.config.public(),
                    "apiVersion": 1,
                    "catalog": project.binding_state,
                    "nativeReveal": {"available": native_available(), "targets": sorted(TARGETS)},
                }, scope, revision))
                return
            if path == "/api/status":
                self.send_payload(200, with_context(status_snapshot(
                    self.api_context.state_root, project.project_id, project.display_name,
                ), scope, revision))
                return
            if path == "/api/executions":
                payload = read_executions(
                    self.api_context.state_root, project.project_id,
                    q=query.get("q", [""])[0], result=query.get("result", ["all"])[0],
                    scope=query.get("scope", ["terminal"])[0], from_time=query.get("from", [""])[0],
                    to_time=query.get("to", [""])[0], snapshot_before=query.get("snapshotBefore", [""])[0],
                    cursor=query.get("cursor", [""])[0], offset=_integer(query.get("offset", ["0"])[0], "offset"),
                )
                self.send_payload(200, with_context(payload, scope, revision))
                return
            if path == "/api/preset-history":
                require_capability(project, "greens")
                self.send_payload(200, with_context(build_preset_history(self.api_context.state_root, project.config), scope, revision))
                return
            if path == "/api/remote-slots":
                require_capability(project, "greens")
                if query.get("refresh", ["0"])[0] not in {"", "0"}:
                    raise ValueError("esta API não atualiza Git; use a publicação explícita da CLI")
                self.send_payload(200, with_context(read_remote_slots(
                    project.config.remote_slots_path, project.config, self.api_context.state_root,
                ), scope, revision))
                return
            if path == "/api/analysis":
                metric = query.get("metric", [""])[0]
                if metric == "duration":
                    require_capability(project, "duration")
                source = project.config
                if source is None:
                    source = type("AnalysisSource", (), {
                        "project_id": project.project_id,
                        "presets": {},
                    })()
                self.send_payload(200, with_context(read_analysis(
                    self.api_context.state_root, source,
                    query.get("from", [""])[0], query.get("to", [""])[0],
                    query.get("preset", [""])[0],
                    metric,
                ), scope, revision))
                return
            if path == "/api/worktrees":
                require_capability(project, "worktrees")
                self.send_payload(200, with_context(list_worktrees(project), scope, revision))
                return
            if path == "/api/worktree-view":
                require_capability(project, "worktrees")
                self.send_payload(200, with_context(worktree_view(project, query.get("id", [""])[0]), scope, revision))
                return
            if path == "/api/dashboard-state":
                self.send_payload(200, with_context(
                    read_dashboard_state(self.api_context.state_root, project.config, project.project_id),
                    scope,
                    revision,
                ))
                return
            if path == "/api/job":
                job = lookup_job(self.api_context.state_root, query.get("jobId", [""])[0], project.project_id)
                if job is None:
                    self.error(404, "ticket não encontrado neste projeto")
                else:
                    self.send_payload(200, with_context(public_job(job), scope, revision))
                return
            if path == "/api/log":
                if lookup_job(self.api_context.state_root, query.get("jobId", [""])[0], project.project_id) is None:
                    self.error(404, "ticket não encontrado neste projeto")
                    return
                self.send_payload(200, with_context(read_log_slice(
                    self.api_context.state_root, config, query.get("jobId", [""])[0],
                    _integer(query.get("offset", ["0"])[0], "offset"),
                    _integer(query.get("length", [str(512 * 1024)])[0], "length"),
                ), scope, revision))
                return
            if path == "/api/log/export":
                if lookup_job(self.api_context.state_root, query.get("jobId", [""])[0], project.project_id) is None:
                    self.error(404, "ticket não encontrado neste projeto")
                    return
                self.send_payload(200, with_context(read_log_export(
                    self.api_context.state_root, config, query.get("jobId", [""])[0],
                ), scope, revision))
                return
            if path == "/api/diagnostic":
                payload = read_diagnostic(self.api_context.state_root, config, query.get("jobId", [""])[0])
                self.send_payload(200 if payload.get("available") else 404, with_context(payload, scope, revision))
                return
            if path.startswith("/api/"):
                self.error(404, "endpoint não encontrado")
                return
            self._serve_static(path)

    return Handler


def create_server(context, host="127.0.0.1", port=8765):
    if not _is_loopback(host) and os.environ.get("CI_QUEUE_ALLOW_PUBLIC") != "1":
        raise ValueError("bind inseguro: use loopback ou CI_QUEUE_ALLOW_PUBLIC=1 conscientemente")
    return ThreadingHTTPServer((host, port), create_handler(context))


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Serve o dashboard CI Queue em loopback.")
    parser.add_argument("--config", required=False, help="caminho para ci-queue.json do projeto; opcional")
    parser.add_argument("--state", default=os.environ.get("CI_QUEUE_STATE_DIR"),
                        help="raiz mutável de registros; ou CI_QUEUE_STATE_DIR")
    parser.add_argument("--ui", help="diretório compilado da UI; opcional para API isolada")
    parser.add_argument("--manifest", default=os.environ.get("CI_QUEUE_MANIFEST_PATH"),
                        help="manifest.json da distribuição instalada; nunca inferido de checkout")
    parser.add_argument("--manifest-sha256", default=os.environ.get("CI_QUEUE_MANIFEST_SHA256"),
                        help="SHA-256 do manifest registrado pela instalação")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    if not args.state:
        raise SystemExit("--state ou CI_QUEUE_STATE_DIR é obrigatório")
    state_root = Path(args.state).expanduser().resolve()
    ui_root = Path(args.ui).expanduser().resolve() if args.ui else None
    config = None
    bootstrap_error = None
    if args.config:
        try:
            config = load_project_config(args.config)
            bootstrap_registry(state_root, args.config)
        except ConfigError as error:
            bootstrap_error = str(error)
    context = ApiContext(config=config, state_root=state_root, ui_root=ui_root,
                         csrf_token=secrets.token_urlsafe(32),
                         manifest_path=Path(args.manifest).expanduser().resolve() if args.manifest else None,
                         manifest_sha256=args.manifest_sha256,
                         bootstrap_error=bootstrap_error)
    try:
        server = create_server(context, args.host, args.port)
    except ValueError as error:
        raise SystemExit(str(error)) from error
    label = config.project_name if config is not None else "shell local"
    print("CI Queue API em http://%s:%s para %s" % (args.host, args.port, label), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
