"""The machine card has one honest fact: current disk capacity."""

import shutil
from datetime import datetime, timezone
from pathlib import Path


def read_machine(state_root):
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    try:
        disk = shutil.disk_usage(Path(state_root))
    except OSError:
        return {"schemaVersion": 1, "observedAt": now, "disk": None,
                "error": "Não foi possível consultar o disco desta instalação."}
    return {"schemaVersion": 1, "observedAt": now,
            "disk": {"totalBytes": disk.total, "usedBytes": disk.used, "freeBytes": disk.free},
            "error": None}
