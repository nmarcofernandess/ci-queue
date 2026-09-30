#!/usr/bin/env python3
"""Reproducible S0 read-path baseline using synthetic state only.

The script intentionally measures the unmodified API/records implementation.
It never consults the operator state directory and writes only beneath --output.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import platform
import resource
import statistics
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from ci_queue_api.config import load_project_config
from ci_queue_api.projects import bootstrap_registry, mutate_registry, probe_project, read_registry
from ci_queue_api.records import invalidate_history_cache
from ci_queue_api.server import ApiContext, create_server

SEED = "ci-queue-etapa-3-s0-v1"
BASE_TS = 1_756_684_800


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    return ordered[max(0, math.ceil(len(ordered) * fraction) - 1)]


def summary(values: list[float]) -> dict:
    return {
        "n": len(values),
        "p50Ms": round(statistics.median(values), 3),
        "p95Ms": round(percentile(values, 0.95), 3),
        "worstMs": round(max(values), 3),
    }


def init_repo(path: Path, branch: str) -> Path:
    path.mkdir(parents=True)
    subprocess.run(["git", "init", "-b", branch, str(path)], check=True, capture_output=True)
    subprocess.run(["git", "-C", str(path), "config", "user.email", "s0@example.invalid"], check=True)
    subprocess.run(["git", "-C", str(path), "config", "user.name", "S0 Fixture"], check=True)
    (path / "fixture.txt").write_text("synthetic\n", encoding="utf-8")
    subprocess.run(["git", "-C", str(path), "add", "fixture.txt"], check=True)
    subprocess.run(["git", "-C", str(path), "commit", "-m", "fixture"], check=True, capture_output=True)
    return path


def tree_nodes(count: int, status: str) -> list[dict]:
    nodes = [{"id": "stage", "parentId": None, "kind": "stage", "status": status,
              "label": "Etapa sintetica", "durationMs": 180_000, "durationSource": "emitter"}]
    for index in range(1, count):
        nodes.append({"id": f"gate-{index}", "parentId": "stage", "kind": "gate",
                      "status": "passed", "label": f"Verificacao sintetica {index:04d}",
                      "durationMs": index * 20, "durationSource": "collector",
                      "retryCount": 1 if index == 2 else 0})
    return nodes


def write_dataset(root: Path, count: int, nodes_per_ticket: int, live: bool = False) -> dict:
    state = root / "state-root"
    for name in ("history", "jobs", "logs", "progress", "state"):
        (state / name).mkdir(parents=True, exist_ok=True)
    repos = []
    configs = []
    for ident, name, branch in (("alpha", "Projeto Alpha", "dev"), ("beta", "Projeto Beta", "main")):
        repo = init_repo(root / f"repo-{ident}", branch)
        config = repo / "ci-queue.json"
        config.write_text(json.dumps({"schemaVersion": 1, "project": {"id": ident, "name": name},
                                      "repository": {"path": str(repo)},
                                      "presets": {"check": {"argv": ["node", "--version"]}}}), encoding="utf-8")
        repos.append(repo)
        configs.append(config)
    bootstrap_registry(state, configs[0])
    preview = probe_project(state, {"repositoryPath": str(repos[1])})
    mutate_registry(state, {"action": "register", "expectedRevision": read_registry(state)["revision"],
                            "identitySource": "config", "repositoryPath": str(repos[1]),
                            "signature": preview["signature"]})
    body_hashes = {}
    for index in range(count):
        project = ("alpha", "beta")[index % 2] if index % 10 != 9 else None
        status = ("passed", "passed", "passed", "failed", "interrupted")[index % 5]
        stamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(BASE_TS + index * 61))
        job = {"id": f"fixture-{index:06d}", "projectId": project,
               "projectName": f"Projeto {project.title()}" if project else None,
               "preset": "check", "status": status, "exitCode": 0 if status == "passed" else 1,
               "branch": "dev", "headSha": f"{index:040x}", "commitSubject": "Dado sintetico",
               "createdAt": stamp, "startedAt": stamp, "finishedAt": stamp, "durationMs": 200_000,
               "cwd": f"/synthetic/{project or 'none'}", "argv": ["node", "--version"],
               "command": "node --version", "extraArgs": [], "flags": {"progressEnabled": True},
               "progress": {"schema": 1, "updatedAt": stamp, "nodes": tree_nodes(nodes_per_ticket, status)}}
        payload = json.dumps(job, ensure_ascii=False, separators=(",", ":")).encode()
        target = state / "history" / f"{job['id']}.json"
        target.write_bytes(payload)
        body_hashes[target.name] = hashlib.sha256(payload).hexdigest()
    if count:
        detail = json.loads((state / "history" / "fixture-000000.json").read_text())
        detail["progress"]["nodes"] = tree_nodes(4096, "passed")
        payload = json.dumps(detail, ensure_ascii=False, separators=(",", ":")).encode()
        (state / "history" / "fixture-000000.json").write_bytes(payload)
        body_hashes["fixture-000000.json"] = hashlib.sha256(payload).hexdigest()
    if live and count:
        for index in range(20):
            queued = {"id": f"queued-{index:03d}", "projectId": ("alpha", "beta")[index % 2],
                      "projectName": ("Projeto Alpha", "Projeto Beta")[index % 2], "preset": "check",
                      "status": "queued", "createdAt": "2026-09-01T00:00:00Z", "argv": ["node", "--version"]}
            (state / "jobs" / f"queued-{index:03d}.json").write_text(json.dumps(queued), encoding="utf-8")
    manifest = {"seed": SEED, "tickets": count, "nodesPerTicket": nodes_per_ticket,
                "detailNodes": 4096 if count else 0, "historyBytes": sum(p.stat().st_size for p in (state / "history").glob("*.json")),
                "historySha256": body_hashes}
    return {"state": state, "config": configs[0], "manifest": manifest}


def request(base: str, path: str) -> tuple[float, int]:
    start = time.perf_counter()
    with urlopen(base + path, timeout=30) as response:
        body = response.read()
    return (time.perf_counter() - start) * 1000, len(body)


def measure_case(name: str, count: int, nodes: int, warm: int, cold: int, raw: list[dict]) -> dict:
    with tempfile.TemporaryDirectory(prefix=f"ciq-s0-{name}-") as directory:
        fixture = write_dataset(Path(directory), count, nodes, live=name == "DLIVE")
        config = load_project_config(fixture["config"])
        context = ApiContext(config, fixture["state"], None, "s0-csrf")
        paths = {
            "projects": "/api/projects", "status-all": "/api/status?context=all",
            "executions-all": "/api/executions?context=all&snapshotBefore=2099-01-01T00:00:00Z",
            "analysis-alpha": "/api/analysis?projectId=alpha&from=2025-01-01T00:00:00Z&to=2099-01-01T00:00:00Z",
        }
        if count:
            paths["job-4096"] = "/api/job?jobId=fixture-000000&context=all"
        results = []
        server = create_server(context, port=0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{server.server_address[1]}"
        try:
            for label, path in paths.items():
                request(base, path); request(base, path)
                warm_values, sizes = [], []
                for sample in range(warm):
                    elapsed, size = request(base, path)
                    warm_values.append(elapsed); sizes.append(size)
                    raw.append({"dataset": name, "endpoint": label, "mode": "warm", "sample": sample + 1,
                                "durationMs": round(elapsed, 6), "bodyBytes": size})
                cold_values = []
                for sample in range(cold):
                    invalidate_history_cache()
                    elapsed, size = request(base, path)
                    cold_values.append(elapsed)
                    raw.append({"dataset": name, "endpoint": label, "mode": "application-cold", "sample": sample + 1,
                                "durationMs": round(elapsed, 6), "bodyBytes": size})
                results.append({"endpoint": label, "path": path, "warm": summary(warm_values),
                                "applicationCold": summary(cold_values), "bodyBytes": max(sizes)})
        finally:
            server.shutdown(); thread.join(); server.server_close(); invalidate_history_cache()
        return {"name": name, "manifest": fixture["manifest"], "endpoints": results}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--warm", type=int, default=100)
    parser.add_argument("--cold", type=int, default=30)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    raw: list[dict] = []
    cases = [("D0", 0, 16), ("D100", 100, 16), ("D1000", 1000, 16),
             ("D1000H", 1000, 128), ("D3000", 3000, 16), ("DLIVE", 1000, 128)]
    report = {"schemaVersion": 1, "seed": SEED, "gitHead": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
              "gitTree": subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], cwd=ROOT, text=True).strip(),
              "platform": platform.platform(), "python": sys.version.split()[0], "node": subprocess.check_output(["node", "--version"], text=True).strip(),
              "method": {"warmSamples": args.warm, "coldSamples": args.cold, "percentile": "nearest-rank", "osCachePurged": False,
                         "scope": "real Python HTTP server; compiled browser measured separately", "seed": SEED}, "datasets": []}
    for name, count, nodes in cases:
        report["datasets"].append(measure_case(name, count, nodes, args.warm, args.cold, raw))
        print(f"completed {name}", flush=True)
    report["processPeakRssBytes"] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    (args.output / "baseline-http.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    with (args.output / "baseline-http-raw.csv").open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=["dataset", "endpoint", "mode", "sample", "durationMs", "bodyBytes"])
        writer.writeheader(); writer.writerows(raw)
    manifests = {row["name"]: row["manifest"] for row in report["datasets"]}
    (args.output / "dataset-hashes.json").write_text(json.dumps(manifests, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
