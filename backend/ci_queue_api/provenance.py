"""Release provenance exposed by the loopback dashboard.

The installer validates every distributed file before activation. API startup
also binds its component stamps and served UI to that pinned manifest. The
public build endpoint exposes only a bounded statement without local paths.
"""

import hashlib
import json
from pathlib import Path


def _read_release_manifest(manifest_path, expected_digest=None):
    """Keep the public statement and private inventory bound to the same bytes."""
    if manifest_path is None:
        return None, None
    path = Path(manifest_path)
    try:
        raw = path.read_bytes()
        manifest = json.loads(raw.decode("utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return {"state": "unreadable"}, None
    if not isinstance(manifest, dict) or manifest.get("schemaVersion") != 1 or manifest.get("product") != "ci-queue":
        return {"state": "invalid"}, None
    version = manifest.get("version")
    revision = manifest.get("revision")
    created_at = manifest.get("createdAt")
    if not all(isinstance(value, str) and value for value in (version, revision, created_at)):
        return {"state": "invalid"}, None
    digest = hashlib.sha256(raw).hexdigest()
    state = "matched" if expected_digest and digest == expected_digest else "unverified"
    if expected_digest and digest != expected_digest:
        state = "mismatch"
    return {
        "state": state,
        "schemaVersion": 1,
        "product": "ci-queue",
        "version": version,
        "revision": revision,
        "createdAt": created_at,
        **({"protocol": manifest["protocol"]} if "protocol" in manifest else {}),
    }, manifest


def release_provenance(manifest_path, expected_digest=None):
    """Expose only the bounded statement, never the private file inventory."""
    statement, _ = _read_release_manifest(manifest_path, expected_digest)
    return statement


def assert_installed_distribution(manifest_path, expected_digest, ui_root=None):
    """An installed API may only load its own distribution and compiled UI."""
    if manifest_path is None:
        return
    path = Path(manifest_path).resolve()
    root = path.parent
    statement, manifest = _read_release_manifest(path, expected_digest)
    protocol = statement.get("protocol", {}) if statement else {}
    required = {"terminal-finalization-v1", "no-artifact-snapshots-v1", "recoverable-finalization-v1"}
    if (statement.get("state") != "matched" or protocol.get("apiVersion") != 1
            or protocol.get("ticketSchemaVersion") != 4
            or not required.issubset(protocol.get("capabilities", []))
            or Path(__file__).resolve().parents[1] != root / "backend"
            or (ui_root is not None and Path(ui_root).resolve() != root / "ui" / "dist")):
        raise ValueError("migração: API/UI e distribuição instalada devem usar a mesma revisão e protocolo")
    for component, directory in (("api", root / "backend"), ("ui", root / "ui" / "dist")):
        try:
            build_name = "build-provenance/" + component + ".json"
            build_path = root / build_name
            if build_path.is_symlink() or not build_path.is_file():
                raise ValueError("stamp não é arquivo regular")
            build_bytes = build_path.read_bytes()
            pinned = next((item for item in manifest["files"] if item["path"] == build_name), None)
            if (pinned is None or pinned["bytes"] != len(build_bytes)
                    or pinned["sha256"] != hashlib.sha256(build_bytes).hexdigest()):
                raise ValueError("stamp não pertence ao manifest pinado")
            build = json.loads(build_bytes.decode("utf-8"))
            if (build.get("schemaVersion") != 1 or build.get("component") != component
                    or build.get("revision") != statement["revision"] or build.get("protocol") != protocol):
                raise ValueError("build incompatível")
            files = [file for file in directory.rglob("*") if file.is_file()
                     and "__pycache__" not in file.parts and file.suffix not in (".pyc", ".pyo")]
            actual = {str(file.relative_to(root)): (file.stat().st_size, hashlib.sha256(file.read_bytes()).hexdigest()) for file in files}
            expected = {item["path"]: (item["bytes"], item["sha256"]) for item in build["files"]}
            if any(file.is_symlink() for file in directory.rglob("*")) or actual != expected:
                raise ValueError("build alterado")
        except (OSError, UnicodeError, json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
            raise ValueError("migração: build API/UI divergente da distribuição instalada") from error
