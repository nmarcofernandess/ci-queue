"""Release provenance exposed by the loopback dashboard.

The installer validates every distributed file before it activates a release.
At runtime the API only needs a small, non-path-bearing statement of which
manifest it was started with.  Comparing the manifest digest passed by the
installer makes a later edited manifest visible instead of silently treating
it as the installed release.
"""

import hashlib
import json
from pathlib import Path


def release_provenance(manifest_path, expected_digest=None):
    """Return a public, bounded release statement or an explicit absence.

    This deliberately does not expose the manifest's file list or any local
    paths.  ``manifestDigest`` means the manifest file matched the value
    recorded when the installer created the service envelope; full asset
    verification remains an installation-time operation.
    """
    if manifest_path is None:
        return None
    path = Path(manifest_path)
    try:
        raw = path.read_bytes()
        manifest = json.loads(raw.decode("utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return {"state": "unreadable"}
    if not isinstance(manifest, dict) or manifest.get("schemaVersion") != 1 or manifest.get("product") != "ci-queue":
        return {"state": "invalid"}
    version = manifest.get("version")
    revision = manifest.get("revision")
    created_at = manifest.get("createdAt")
    if not all(isinstance(value, str) and value for value in (version, revision, created_at)):
        return {"state": "invalid"}
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
    }


def assert_installed_distribution(manifest_path, expected_digest, ui_root=None):
    """An installed API may only load its own distribution and compiled UI."""
    if manifest_path is None:
        return
    path = Path(manifest_path).resolve()
    root = path.parent
    statement = release_provenance(path, expected_digest)
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
            build = json.loads((root / "build-provenance" / (component + ".json")).read_text(encoding="utf-8"))
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
