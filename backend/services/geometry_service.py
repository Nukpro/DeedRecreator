"""
Re-export of GeometryService and exceptions from backend.geometry.

This module exists for backward compatibility. Prefer:
  from backend.geometry import GeometryService, GeometryError, GeometryNotFoundError
"""

from backend.geometry import (
    GeometryService,
    GeometryError,
    GeometryNotFoundError,
)

__all__ = [
    "GeometryService",
    "GeometryError",
    "GeometryNotFoundError",
]
