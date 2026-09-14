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
    }
