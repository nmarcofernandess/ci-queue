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
from .dashboard_state import RevisionConflict, read_dashboard_state, write_dashboard_state
from .diagnostics import read_diagnostic, read_log_export, read_log_slice
from .history import build_preset_history, read_remote_slots
from .machine import read_machine
from .native_actions import TARGETS, available as native_available, reveal
from .records import RecordError, iso_now, lookup_job, public_job, read_executions, status_snapshot
from .worktrees import list_worktrees, worktree_view


LOOPBACK = {"127.0.0.1", "::1", "localhost"}
MAX_REQUEST_BYTES = 64 * 1024


@dataclass
class ApiContext:
    config: object
    state_root: Path
    ui_root: Optional[Path]
    csrf_token: str


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


def create_handler(context):
    class Handler(BaseHTTPRequestHandler):
        api_context = context

        def log_message(self, format, *args):
            # The service manager owns process logs; keep successful browser
            # polling out of stderr while retaining normal HTTP semantics.
            return

        def end_headers(self):
            path = urlparse(self.path).path
            if self.command == "GET" and path.startswith("/api/"):
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

        def error(self, status, message):
            self.send_payload(status, {"error": message})

        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-CI-CSRF")
            self.end_headers()

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

        def do_POST(self):
            path = urlparse(self.path).path
            if path not in {"/api/dashboard-state", "/api/reveal"}:
                self.error(404, "endpoint não encontrado")
                return
            try:
                body = self._mutating_request()
                if path == "/api/dashboard-state":
                    result = write_dashboard_state(self.api_context.state_root, self.api_context.config, body)
                else:
                    if body.get("action") != "reveal":
                        raise ValueError("ação não permitida")
                    result = reveal(self.api_context.state_root, self.api_context.config,
                                    body.get("entity"), body.get("id"), body.get("target", "directory"))
            except RevisionConflict as error:
                self.error(409, str(error))
                return
            except LookupError as error:
                self.error(404, str(error))
                return
            except PermissionError as error:
                self.error(403, str(error))
                return
            except TypeError as error:
                self.error(415, str(error))
                return
            except (ValueError, RecordError, RuntimeError, OSError) as error:
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
                # SPA routes are intentionally served by index, while a
                # missing asset remains a 404 instead of HTML with wrong MIME.
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
                    self.send_payload(200, {"ok": True, "apiVersion": 1, "serverTime": iso_now(),
                                            "projectId": self.api_context.config.project_id,
                                            "resourceHistoryCollection": False})
                    return
                if parsed.path == "/build.json":
                    # Installation provenance is intentionally not guessed
                    # from a checkout.  The installer will later provide one
                    # atomic manifest; until then the absence is a fact.
                    self.send_payload(200, {"apiVersion": 1, "projectId": self.api_context.config.project_id,
                                            "version": os.environ.get("CI_QUEUE_VERSION"),
                                            "manifest": None, "serverTime": iso_now()})
                    return
                if parsed.path == "/api/session":
                    if not _is_loopback(self.client_address[0]) or not _is_loopback(_host_name(self.headers.get("Host", ""))):
                        self.error(403, "sessão permitida apenas em loopback")
                    else:
                        self.send_payload(200, {"csrfToken": self.api_context.csrf_token,
                                                "canReveal": native_available(), "revealTargets": sorted(TARGETS),
                                                "clipboardLimitBytes": 512000})
                    return
                if parsed.path == "/api/config":
                    self.send_payload(200, {**self.api_context.config.public(), "apiVersion": 1,
                                            "nativeReveal": {"available": native_available(), "targets": sorted(TARGETS)}})
                    return
                if parsed.path == "/api/status":
                    self.send_payload(200, status_snapshot(self.api_context.state_root,
                                                           self.api_context.config.project_id,
                                                           self.api_context.config.project_name))
                    return
                if parsed.path == "/api/executions":
                    payload = read_executions(
                        self.api_context.state_root, self.api_context.config.project_id,
                        q=query.get("q", [""])[0], result=query.get("result", ["all"])[0],
                        scope=query.get("scope", ["terminal"])[0], from_time=query.get("from", [""])[0],
                        to_time=query.get("to", [""])[0], snapshot_before=query.get("snapshotBefore", [""])[0],
                        cursor=query.get("cursor", [""])[0], offset=_integer(query.get("offset", ["0"])[0], "offset"),
                    )
                    self.send_payload(200, payload)
                    return
                if parsed.path == "/api/preset-history":
                    self.send_payload(200, build_preset_history(self.api_context.state_root, self.api_context.config))
                    return
                if parsed.path == "/api/remote-slots":
                    if query.get("refresh", ["0"])[0] not in {"", "0"}:
                        self.error(400, "esta API não atualiza Git; use a publicação explícita da CLI")
                    else:
                        self.send_payload(200, read_remote_slots(self.api_context.config.remote_slots_path, self.api_context.config))
                    return
                if parsed.path == "/api/analysis":
                    self.send_payload(200, read_analysis(self.api_context.state_root, self.api_context.config,
                                                         query.get("from", [""])[0], query.get("to", [""])[0],
                                                         query.get("preset", [""])[0],
                                                         _integer(query.get("offset", ["0"])[0], "offset")))
                    return
                if parsed.path == "/api/machine":
                    self.send_payload(200, read_machine(self.api_context.state_root))
                    return
                if parsed.path == "/api/worktrees":
                    self.send_payload(200, list_worktrees(self.api_context.config))
                    return
                if parsed.path == "/api/worktree-view":
                    self.send_payload(200, worktree_view(self.api_context.config, query.get("id", [""])[0]))
                    return
                if parsed.path == "/api/dashboard-state":
                    self.send_payload(200, read_dashboard_state(self.api_context.state_root, self.api_context.config))
                    return
                if parsed.path == "/api/job":
                    job = lookup_job(self.api_context.state_root, query.get("jobId", [""])[0], self.api_context.config.project_id)
                    if job is None:
                        self.error(404, "ticket não encontrado neste projeto")
                    else:
                        self.send_payload(200, public_job(job))
                    return
                if parsed.path == "/api/log":
                    self.send_payload(200, read_log_slice(self.api_context.state_root, self.api_context.config,
                                                          query.get("jobId", [""])[0],
                                                          _integer(query.get("offset", ["0"])[0], "offset"),
                                                          _integer(query.get("length", [str(512 * 1024)])[0], "length")))
                    return
                if parsed.path == "/api/log/export":
                    self.send_payload(200, read_log_export(self.api_context.state_root, self.api_context.config,
                                                           query.get("jobId", [""])[0]))
                    return
                if parsed.path == "/api/diagnostic":
                    payload = read_diagnostic(self.api_context.state_root, self.api_context.config,
                                              query.get("jobId", [""])[0])
                    self.send_payload(200 if payload.get("available") else 404, payload)
                    return
            except LookupError as error:
                self.error(404, str(error))
                return
            except (ConfigError, RecordError, ValueError, OSError) as error:
                self.error(400, str(error))
                return
            if parsed.path.startswith("/api/"):
                self.error(404, "endpoint não encontrado")
                return
            self._serve_static(parsed.path)

    return Handler


def create_server(context, host="127.0.0.1", port=8765):
    if not _is_loopback(host) and os.environ.get("CI_QUEUE_ALLOW_PUBLIC") != "1":
        raise ValueError("bind inseguro: use loopback ou CI_QUEUE_ALLOW_PUBLIC=1 conscientemente")
    return ThreadingHTTPServer((host, port), create_handler(context))


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Serve o dashboard CI Queue em loopback.")
    parser.add_argument("--config", required=True, help="caminho para ci-queue.json do projeto")
    parser.add_argument("--state", default=os.environ.get("CI_QUEUE_STATE_DIR"),
                        help="raiz mutável de registros; ou CI_QUEUE_STATE_DIR")
    parser.add_argument("--ui", help="diretório compilado da UI; opcional para API isolada")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    if not args.state:
        raise SystemExit("--state ou CI_QUEUE_STATE_DIR é obrigatório")
    try:
        config = load_project_config(args.config)
        state_root = Path(args.state).expanduser().resolve()
        ui_root = Path(args.ui).expanduser().resolve() if args.ui else None
        context = ApiContext(config=config, state_root=state_root, ui_root=ui_root,
                             csrf_token=secrets.token_urlsafe(32))
        server = create_server(context, args.host, args.port)
    except (ConfigError, ValueError) as error:
        raise SystemExit(str(error)) from error
    print("CI Queue API em http://%s:%s para %s" % (args.host, args.port, config.project_name), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
