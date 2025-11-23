from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass(frozen=True)
class StoredDocument:
    """Metadata returned after persisting an uploaded document."""

    original_filename: str
    original_stored_filename: str
    stored_filename: str
    original_stored_relative_path: str
    stored_relative_path: str
    was_converted: bool
    warnings: List[str]
    image_width: Optional[int]
    image_height: Optional[int]
    boundary_box: Optional[Dict[str, float]]

