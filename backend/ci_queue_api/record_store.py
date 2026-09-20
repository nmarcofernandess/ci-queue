"""Incremental, rebuildable snapshots for JSON record directories.

The filesystem remains authoritative.  A store only avoids reopening unchanged
record bodies; directory metadata is inspected on every refresh so additions,
replacement and removal are visible without a watcher or background service.
"""

from __future__ import annotations

import hashlib
import json
import os
import threading
from dataclasses import dataclass
from pathlib import Path


class SnapshotError(ValueError):
    pass


@dataclass(frozen=True)
class Fingerprint:
    device: int
    inode: int
    size: int
    mtime_ns: int
    ctime_ns: int
    mode: int


@dataclass(frozen=True)
class Entry:
    fingerprint: Fingerprint
    digest: str
    value: dict | None
    error: str | None
    is_transient: bool = False


@dataclass(frozen=True)
class Snapshot:
    root: str
    generation: int
    rows: tuple
    digests: tuple
    errors: tuple


class FrozenDict(dict):
    def __setitem__(self, key, value):
        raise TypeError(f"'{type(self).__name__}' object does not support item assignment")

    def __delitem__(self, key):
        raise TypeError(f"'{type(self).__name__}' object does not support item deletion")

    def clear(self):
        raise TypeError(f"'{type(self).__name__}' object does not support mutation")

    def pop(self, *args, **kwargs):
        raise TypeError(f"'{type(self).__name__}' object does not support mutation")

    def popitem(self):
        raise TypeError(f"'{type(self).__name__}' object does not support mutation")

    def setdefault(self, *args, **kwargs):
        raise TypeError(f"'{type(self).__name__}' object does not support mutation")

    def update(self, *args, **kwargs):
        raise TypeError(f"'{type(self).__name__}' object does not support mutation")


class FrozenList(list):
    def __setitem__(self, index, value):
        raise TypeError(f"'{type(self).__name__}' object does not support item assignment")

    def __delitem__(self, index):
        raise TypeError(f"'{type(self).__name__}' object does not support item deletion")

    def append(self, value):
        raise TypeError(f"'{type(self).__name__}' object does not support mutation")

    def extend(self, values):
        raise TypeError(f"'{type(self).__name__}' object does not support mutation")

    def insert(self, index, value):
        raise TypeError(f"'{type(self).__name__}' object does not support mutation")

    def remove(self, value):
        raise TypeError(f"'{type(self).__name__}' object does not support mutation")

    def pop(self, *args):
        raise TypeError(f"'{type(self).__name__}' object does not support mutation")

    def clear(self):
        raise TypeError(f"'{type(self).__name__}' object does not support mutation")

    def sort(self, *args, **kwargs):
        raise TypeError(f"'{type(self).__name__}' object does not support mutation")

    def reverse(self):
        raise TypeError(f"'{type(self).__name__}' object does not support mutation")


def _freeze(value):
    if isinstance(value, dict):
        return FrozenDict({k: _freeze(v) for k, v in value.items()})
    if isinstance(value, list):
        return FrozenList(_freeze(item) for item in value)
    return value


def _fingerprint(info):
    return Fingerprint(info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns,
                       info.st_ctime_ns, info.st_mode)


class RecordStore:
    def __init__(self, directory):
        self.directory = Path(directory)
        self._entries = {}
        self._generation = 0
        self._snapshot = Snapshot(str(self.directory), 0, (), (), ())
        self._lock = threading.Lock()

    def _scan(self):
        if not self.directory.exists():
            return {}
        try:
            entries = {}
            with os.scandir(self.directory) as stream:
                for entry in stream:
                    if not entry.name.endswith(".json"):
                        continue
                    try:
                        if not entry.is_file(follow_symlinks=False):
                            continue
                        entries[entry.name] = _fingerprint(entry.stat(follow_symlinks=False))
                    except (FileNotFoundError, ProcessLookupError):
                        continue
                    except OSError:
                        continue
            return entries
        except FileNotFoundError:
            return {}
        except OSError as error:
            raise SnapshotError("diretório de registros indisponível") from error

    def _read(self, name, expected):
        path = self.directory / name
        for _attempt in range(2):
            try:
                before = _fingerprint(path.stat())
                if before != expected:
                    expected = before
                with open(path, "rb") as stream:
                    body = stream.read()
                    opened = _fingerprint(os.fstat(stream.fileno()))
                after = _fingerprint(path.stat())
            except FileNotFoundError:
                return None
            except OSError as error:
                return Entry(expected, "", None, "registro ilegível: %s" % name, is_transient=True)
            if before == opened == after:
                digest = hashlib.sha256(body).hexdigest()
                try:
                    raw_value = json.loads(body.decode("utf-8"))
                    if not isinstance(raw_value, dict):
                        raise ValueError
                except (UnicodeError, json.JSONDecodeError, ValueError):
                    return Entry(after, digest, None, "registro inválido: %s" % name, is_transient=False)
                return Entry(after, digest, _freeze(raw_value), None, is_transient=False)
            expected = after
        return Entry(expected, "", None, "registro instável: %s" % name, is_transient=True)

    def snapshot(self, strict=False):
        with self._lock:
            observed = self._scan()
            changed = set(observed) != set(self._entries)
            next_entries = {}
            for name in sorted(observed):
                previous = self._entries.get(name)
                if previous is not None and previous.fingerprint == observed[name] and not previous.is_transient:
                    next_entries[name] = previous
                    continue
                changed = True
                entry = self._read(name, observed[name])
                if entry is not None:
                    next_entries[name] = entry
            if changed:
                self._entries = next_entries
                self._generation += 1
                self._snapshot = Snapshot(
                    str(self.directory), self._generation,
                    tuple(entry.value for entry in next_entries.values() if entry.value is not None),
                    tuple((name, entry.digest) for name, entry in next_entries.items()),
                    tuple(entry.error for entry in next_entries.values() if entry.error),
                )
            if strict and self._snapshot.errors:
                raise SnapshotError(self._snapshot.errors[0])
            return self._snapshot


_stores = {}
_stores_lock = threading.Lock()


def store_for(directory):
    key = str(Path(directory).resolve())
    with _stores_lock:
        store = _stores.get(key)
        if store is None:
            store = RecordStore(key)
            _stores[key] = store
        return store


def clear_stores():
    with _stores_lock:
        _stores.clear()
