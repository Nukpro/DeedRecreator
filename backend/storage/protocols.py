from __future__ import annotations

from pathlib import Path
from typing import Protocol


class FileStorageGateway(Protocol):
    """Interface for file storage implementations."""

    def save_bytes(self, data: bytes, destination: Path) -> Path:
        ...

    def exists(self, path: Path) -> bool:
        ...

