"""
Arc segment domain model and factory methods.

Arc creation is via create_from_three_points only.
"""

from __future__ import annotations

import math
import uuid
from typing import Dict, Any, Optional, Literal

from backend.geometry.vectors import Segment


class ArcSegment(Segment):
    """Represents an arc segment."""

    def __init__(
        self,
        start: Dict[str, float],
        end: Dict[str, float],
        center: Dict[str, float],
        radius: float,
        rotation: str = "cw",
        delta: Optional[float] = None,
        **kwargs,
    ):
        super().__init__("arc", start, end, **kwargs)
        self.__center = {"x": float(center["x"]), "y": float(center["y"])}
        self.__radius = float(radius)
        if rotation not in ["cw", "ccw"]:
            raise ValueError(f"Invalid rotation: {rotation}. Must be 'cw' or 'ccw'")
        self.__rotation = rotation
        self.__delta = float(delta) if delta is not None else None

    @property
    def center(self) -> Dict[str, float]:
        """Get center point coordinates."""
        return self.__center.copy()

    @center.setter
    def center(self, value: Dict[str, float]) -> None:
        """Set center point coordinates."""
        self.__center = {"x": float(value["x"]), "y": float(value["y"])}

    @property
    def radius(self) -> float:
        """Get arc radius."""
        return self.__radius

    @radius.setter
    def radius(self, value: float) -> None:
        """Set arc radius."""
        self.__radius = float(value)

    @property
    def rotation(self) -> str:
        """Get rotation direction ('cw' or 'ccw')."""
        return self.__rotation

    @rotation.setter
    def rotation(self, value: str) -> None:
        """Set rotation direction ('cw' or 'ccw')."""
        if value not in ["cw", "ccw"]:
            raise ValueError(f"Invalid rotation: {value}. Must be 'cw' or 'ccw'")
        self.__rotation = value

    @property
    def delta(self) -> Optional[float]:
        """Get arc delta angle in degrees."""
        return self.__delta

    @delta.setter
    def delta(self, value: Optional[float]) -> None:
        """Set arc delta angle in degrees."""
        self.__delta = float(value) if value is not None else None

    def to_storage_json(self) -> Dict[str, Any]:
        """Convert to storage JSON format."""
        result = super().to_storage_json()
        result["center"] = self.__center.copy()
        result["radius"] = self.__radius
        result["rot"] = self.__rotation  # Storage uses 'rot'
        if self.__delta is not None:
            result["delta"] = self.__delta
        return result

    def to_frontend_json(self) -> Dict[str, Any]:
        """Convert to frontend JSON format."""
        result = super().to_storage_json()
        result["center"] = self.__center.copy()
        result["radius"] = self.__radius
        result["rotation"] = self.__rotation  # Frontend uses 'rotation'
        if self.__delta is not None:
            result["delta"] = self.__delta
        return result

    @classmethod
    def from_storage_json(cls, data: Dict[str, Any]) -> "ArcSegment":
        """Create ArcSegment from storage JSON."""
        rotation = data.get("rot") or data.get("rotation", "cw")
        return cls(
            id=data.get("id", str(uuid.uuid4())),
            start=data.get("start", {"x": 0.0, "y": 0.0}),
            end=data.get("end", {"x": 0.0, "y": 0.0}),
            center=data.get("center", {"x": 0.0, "y": 0.0}),
            radius=data.get("radius", 0.0),
            rotation=rotation,
            delta=data.get("delta"),
            length=data.get("length", 0.0),
            layer=data.get("layer", ""),
            attributes=data.get("attributes", {}),
        )

    @classmethod
    def from_frontend_json(cls, data: Dict[str, Any]) -> "ArcSegment":
        """Create ArcSegment from frontend JSON."""
        return cls.from_storage_json(data)

    @staticmethod
    def create_from_three_points(
        pt1: Dict[str, float],
        pt2: Dict[str, float],
        pt3: Dict[str, float],
        **kwargs: Any,
    ) -> "ArcSegment":
        """
        Create an arc through three points (pt1, pt2 on arc, pt3).
        Start of arc is pt1, end is pt3; pt2 is the middle point on the arc (not the center).
        """
        x1, y1 = float(pt1["x"]), float(pt1["y"])
        x2, y2 = float(pt2["x"]), float(pt2["y"])
        x3, y3 = float(pt3["x"]), float(pt3["y"])
        if (x1, y1) == (x2, y2) or (x2, y2) == (x3, y3) or (x1, y1) == (x3, y3):
            raise ValueError("All three points must be distinct")
        m1x, m1y = (x1 + x2) / 2.0, (y1 + y2) / 2.0
        v1x, v1y = y1 - y2, x2 - x1
        m2x, m2y = (x2 + x3) / 2.0, (y2 + y3) / 2.0
        v2x, v2y = y2 - y3, x3 - x2
        denom = v1x * v2y - v1y * v2x
        if abs(denom) < 1e-12:
            raise ValueError("Points are collinear; cannot define a unique circle")
        t = ((m2x - m1x) * v2y - (m2y - m1y) * v2x) / denom
        cx = m1x + t * v1x
        cy = m1y + t * v1y
        radius = math.sqrt((x1 - cx) ** 2 + (y1 - cy) ** 2)
        if not math.isfinite(radius) or radius <= 0:
            raise ValueError("Calculated radius is not finite or is <= 0")
        a1 = math.atan2(x1 - cx, y1 - cy)
        a2 = math.atan2(x2 - cx, y2 - cy)
        a3 = math.atan2(x3 - cx, y3 - cy)

        def norm(a: float) -> float:
            a = a % (2.0 * math.pi)
            if a < 0:
                a += 2.0 * math.pi
            return a

        a1, a2, a3 = norm(a1), norm(a2), norm(a3)
        d_cw_span = (a3 - a1 + 2.0 * math.pi) % (2.0 * math.pi)
        d_ccw_span = (a1 - a3 + 2.0 * math.pi) % (2.0 * math.pi)
        a2_from_pt1_cw = (a2 - a1 + 2.0 * math.pi) % (2.0 * math.pi)
        if 0 < a2_from_pt1_cw <= d_cw_span:
            rotation = "cw"
            delta_rad = d_cw_span
        else:
            rotation = "ccw"
            delta_rad = d_ccw_span
        delta_deg = math.degrees(delta_rad)
        length = radius * delta_rad
        return ArcSegment(
            start={"x": x1, "y": y1},
            end={"x": x3, "y": y3},
            center={"x": cx, "y": cy},
            radius=radius,
            rotation=rotation,
            delta=delta_deg,
            length=length,
            **kwargs,
        )

    @staticmethod
    def create_by_tan_radius_rotation_and_length_or_delta(
        pt1: Dict[str, float],
        tang: float,
        radius: float,
        rotation: Literal["cw", "ccw"],
        *,
        length: Optional[float] = None,
        delta: Optional[float] = None,
        **kwargs: Any,
    ) -> "ArcSegment":
        """
        Create an arc from start point, tangent at start, radius and rotation.

        pt1 — start point; tang — tangent azimuth at start (degrees, North=0, clockwise);
        radius — arc radius; rotation — "cw" or "ccw". Exactly one of length or delta
        must be provided (length in world units, delta in degrees).
        """
        if length is not None and delta is None:
            length_val = float(length)
            delta_deg = (180 * length_val) / (math.pi * radius)
        elif delta is not None:
            delta_deg = float(delta)
            length_val = delta_deg * math.pi * radius / 180
        else:
            raise ValueError("Exactly one of 'length' or 'delta' must be provided")
        x1, y1 = float(pt1["x"]), float(pt1["y"])

        if rotation == "cw":
            radius_azimuth = tang + 90
        else:
            radius_azimuth = tang - 90

        radius_azimuth = radius_azimuth % 360
        if radius_azimuth < 0:
            radius_azimuth += 360

        cx = x1 + radius * math.sin(math.radians(radius_azimuth))
        cy = y1 + radius * math.cos(math.radians(radius_azimuth))

        if rotation == "cw":
            azimuth_to_end_point = radius_azimuth - 180 + delta_deg
        else:
            azimuth_to_end_point = radius_azimuth - 180 - delta_deg

        azimuth_to_end_point = azimuth_to_end_point % 360
        if azimuth_to_end_point < 0:
            azimuth_to_end_point += 360

        x3 = cx + radius * math.sin(math.radians(azimuth_to_end_point))
        y3 = cy + radius * math.cos(math.radians(azimuth_to_end_point))

        return ArcSegment(
            start={"x": x1, "y": y1},
            end={"x": x3, "y": y3},
            center={"x": cx, "y": cy},
            radius=radius,
            rotation=rotation,
            delta=delta_deg,
            length=length_val,
            **kwargs,
        )