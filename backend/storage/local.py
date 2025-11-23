from __future__ import annotations

from pathlib import Path

from backend.storage.protocols import FileStorageGateway


class LocalFileStorageError(Exception):
    """Raised when local file storage operations fail."""


class LocalFileStorage(FileStorageGateway):
    """Simple filesystem storage implementation."""

    def __init__(self, root: Path) -> None:
        self._root = root
        self._root.mkdir(parents=True, exist_ok=True)

    def save_bytes(self, data: bytes, destination: Path) -> Path:
        target = self._resolve(destination)
        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            target.write_bytes(data)
        except OSError as exc:
            raise LocalFileStorageError(f"Unable to write file to {target}") from exc
        return target

    def exists(self, path: Path) -> bool:
        return self._resolve(path).exists()

    def _resolve(self, path: Path) -> Path:
        if path.is_absolute():
            return path
        return (self._root / path).resolve()

