"""
Re-export of geometry domain models from backend.geometry.vectors.

This module exists for backward compatibility. Prefer:
  from backend.geometry.vectors import ...
or:
  from backend.domain import ...
"""

from backend.geometry.vectors import (
    azimuth_to_bearing,
    bearing_to_azimuth,
    GeometryObject,
    Point,
    Segment,
    LineSegment,
    ArcSegment,
    Geometry,
    Parcel,
    GeometryLayer,
    Site,
)

__all__ = [
    "azimuth_to_bearing",
    "bearing_to_azimuth",
    "GeometryObject",
    "Point",
    "Segment",
    "LineSegment",
    "ArcSegment",
    "Geometry",
    "Parcel",
    "GeometryLayer",
    "Site",
]
