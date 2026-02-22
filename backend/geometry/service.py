from __future__ import annotations

import json
import math
import uuid
from pathlib import Path
from typing import Optional, Dict, Any, List, Union, cast

from flask import current_app

from backend.services.site_session_service import (
    SiteSessionService,
    SiteSessionNotFoundError,
)
from backend.geometry.vectors import (
    Site, Point, Segment, LineSegment, Geometry, Parcel, GeometryLayer
)
from backend.geometry.arc import ArcSegment


class GeometryError(Exception):
    """Base exception raised for geometry management issues."""


class GeometryNotFoundError(GeometryError):
    """Raised when geometry data is not found."""


class GeometryService:
    """Handle geometry storage and versioning for site sessions."""

    def __init__(self, site_session_service: SiteSessionService) -> None:
        self._site_session_service = site_session_service

    # Helper methods for working with Site objects

    def _create_empty_site(self, site_session_id: int) -> Site:
        """Create an empty Site for a site session."""
        return Site(
            project_id='',
            site_id=str(site_session_id),
            name=f'Site session {site_session_id}',
            version=0,
            history={
                'currentVersion': 0,
                'previousVersionFile': None
            },
            siteSessionId=site_session_id
        )

    def _load_site_from_json(
        self, data: Dict[str, Any], site_session_id: int
    ) -> Site:
        """Load Site object from storage JSON format."""
        data['siteSessionId'] = site_session_id
        site = Site.from_storage_json(data)
        return site

    def _get_or_create_default_layer(self, site: Site) -> GeometryLayer:
        """Get or create default geometry layer for session-based geometry."""
        for layer in site.geometry_layers:
            if layer.name == 'Default Layer' or layer.layer_type == 'Boundary':
                return layer
        default_layer = GeometryLayer(
            layer_type='Boundary',
            name='Default Layer',
            id=str(uuid.uuid4())
        )
        site.add_geometry_layer(default_layer)
        return default_layer

    def _get_or_create_default_parcel(self, layer: GeometryLayer) -> Parcel:
        """Get or create default parcel in a layer."""
        if layer.parcels:
            return layer.parcels[0]
        default_parcel = Parcel(
            name='Default Parcel',
            feature_type='parcel',
            id=str(uuid.uuid4())
        )
        layer.add_parcel(default_parcel)
        return default_parcel

    def _get_or_create_default_geometry(self, parcel: Parcel) -> Geometry:
        """Get or create default geometry in a parcel."""
        if parcel.geometry:
            return parcel.geometry
        geometry = Geometry(geometry_type='LineString', is_closed=False)
        parcel.geometry = geometry
        return geometry

    def get_geometry_path(self, site_session_id: int) -> Path:
        """Get path to geometry_tmp directory for a site session."""
        site_session = self._site_session_service.get_site_session(
            site_session_id
        )
        catalog_name = site_session["storage_catalog_name"]
        instance_path = Path(current_app.instance_path)
        site_session_dir = instance_path / "site_sessions_id_" / catalog_name
        geom_tmp_dir = site_session_dir / "geom_tmp"
        geom_tmp_dir.mkdir(parents=True, exist_ok=True)
        return geom_tmp_dir

    def get_current_geometry_file(self, site_session_id: int) -> Path:
        """Get path to current geometry file."""
        geom_tmp_dir = self.get_geometry_path(site_session_id)
        return geom_tmp_dir / "current.json"

    def load_current_geometry(
        self, site_session_id: int, as_site: bool = False
    ) -> Union[Dict[str, Any], Site]:
        """Load current geometry state for a site session."""
        current_file = self.get_current_geometry_file(site_session_id)
        if not current_file.exists():
            if as_site:
                return self._create_empty_site(site_session_id)
            return {
                "siteSessionId": site_session_id,
                "version": 0,
                "history": {"currentVersion": 0, "previousVersionFile": None},
                "points": [],
                "segments": [],
                "geometryLayers": []
            }
        try:
            with open(current_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            if as_site:
                return self._load_site_from_json(data, site_session_id)
            return data
        except (json.JSONDecodeError, IOError) as e:
            raise GeometryError(f"Failed to load geometry: {e}") from e

    def save_geometry(
        self,
        site_session_id: int,
        geometry_data: Union[Dict[str, Any], Site],
        action: str = "modify"
    ) -> Union[Dict[str, Any], Site]:
        """Save geometry with versioning."""
        geom_tmp_dir = self.get_geometry_path(site_session_id)
        current_site = cast(
            Site,
            self.load_current_geometry(site_session_id, as_site=True),
        )
        current_version = current_site.version
        if current_version > 0:
            previous_version_file = f"version_{current_version}.json"
            version_file = geom_tmp_dir / previous_version_file
            with open(version_file, 'w', encoding='utf-8') as f:
                json.dump(
                    current_site.to_storage_json(),
                    f,
                    indent=2,
                    ensure_ascii=False,
                )
        else:
            previous_version_file = None
        if isinstance(geometry_data, Site):
            site = geometry_data
        else:
            geometry_data["siteSessionId"] = site_session_id
            site = self._load_site_from_json(geometry_data, site_session_id)
        if site.site_session_id is None:
            site.site_session_id = site_session_id
        new_version = current_version + 1
        site.version = new_version
        site.history = {
            "currentVersion": new_version,
            "previousVersionFile": previous_version_file,
        }
        current_file = self.get_current_geometry_file(site_session_id)
        try:
            storage_json = site.to_storage_json()
        except Exception as e:
            current_app.logger.error(f"Error converting Site to storage JSON: {e}", exc_info=True)
            raise GeometryError(f"Failed to convert Site to JSON: {e}") from e
        try:
            with open(current_file, 'w', encoding='utf-8') as f:
                json.dump(storage_json, f, indent=2, ensure_ascii=False)
        except (IOError, OSError) as e:
            current_app.logger.error(f"Error writing geometry file: {e}", exc_info=True)
            raise GeometryError(f"Failed to save geometry file: {e}") from e
        self._cleanup_old_versions(geom_tmp_dir, max_versions=20)
        if isinstance(geometry_data, Site):
            return site
        return storage_json

    def add_point(
        self,
        site_session_id: int,
        x: float,
        y: float,
        attributes: Optional[Dict[str, Any]] = None
    ) -> Union[Dict[str, Any], Site]:
        """Add a point to the geometry."""
        try:
            site = cast(
                Site,
                self.load_current_geometry(site_session_id, as_site=True),
            )
            if site.site_session_id is None:
                site.site_session_id = site_session_id
            point_attributes = attributes or {}
            new_point = Point(
                x=x,
                y=y,
                layer=point_attributes.get("layer", ""),
                attributes=point_attributes,
            )
            site.add_point(new_point)
            return self.save_geometry(
                site_session_id, site, action="add_point"
            )
        except Exception as e:
            current_app.logger.error(f"Error in add_point: {e}", exc_info=True)
            raise

    def update_point(
        self,
        site_session_id: int,
        point_id: str,
        x: Optional[float] = None,
        y: Optional[float] = None,
        layer: Optional[str] = None,
        attributes: Optional[Dict[str, Any]] = None
    ) -> Union[Dict[str, Any], Site]:
        """Update a point in the geometry."""
        site = cast(
            Site,
            self.load_current_geometry(site_session_id, as_site=True),
        )
        point = site.get_point(point_id)
        if not point:
            raise GeometryNotFoundError(
                f"Point with id {point_id} not found"
            )
        if x is not None:
            point.x = float(x)
        if y is not None:
            point.y = float(y)
        if layer is not None:
            point.layer = str(layer)
        if attributes is not None:
            current_attrs = point.attributes
            current_attrs.update(attributes)
            point.attributes = current_attrs
        return self.save_geometry(
            site_session_id, site, action="update_point"
        )

    def add_segment(
        self,
        site_session_id: int,
        start_x: float,
        start_y: float,
        end_x: float,
        end_y: float,
        attributes: Optional[Dict[str, Any]] = None,
        segment_type: str = "line"
    ) -> Union[Dict[str, Any], Site]:
        """Add a segment to the geometry."""
        try:
            site = cast(
                Site,
                self.load_current_geometry(site_session_id, as_site=True),
            )
            if site.site_session_id is None:
                site.site_session_id = site_session_id
            dx = end_x - start_x
            dy = end_y - start_y
            length = (dx ** 2 + dy ** 2) ** 0.5
            angle_rad = math.atan2(dy, dx)
            angle_deg = math.degrees(angle_rad)
            azimuth = (90 - angle_deg) % 360
            default_layer = self._get_or_create_default_layer(site)
            default_parcel = self._get_or_create_default_parcel(default_layer)
            geometry = self._get_or_create_default_geometry(default_parcel)
            segment_attributes = attributes or {}
            start = {"x": float(start_x), "y": float(start_y)}
            end = {"x": float(end_x), "y": float(end_y)}
            if segment_type == "line":
                new_segment = LineSegment(
                    start=start, end=end, bearing=azimuth, length=float(length),
                    layer=segment_attributes.get("layer", ""), attributes=segment_attributes
                )
            elif segment_type == "arc":
                center = segment_attributes.get("center", start)
                radius = segment_attributes.get("radius", length / 2)
                rotation = segment_attributes.get("rotation", "cw")
                delta = segment_attributes.get("delta")
                new_segment = ArcSegment(
                    start=start, end=end, center=center, radius=float(radius),
                    rotation=rotation, delta=delta, length=float(length),
                    layer=segment_attributes.get("layer", ""), attributes=segment_attributes
                )
            else:
                raise ValueError(f"Unknown segment type: {segment_type}")
            geometry.add_segment(new_segment)
            return self.save_geometry(
                site_session_id, site, action="add_segment"
            )
        except Exception as e:
            current_app.logger.error(f"Error in add_segment: {e}", exc_info=True)
            raise

    def add_arc(
        self,
        site_session_id: int,
        arc_segment: ArcSegment,
        attributes: Optional[Dict[str, Any]] = None
    ) -> Site:
        """Add an arc segment to the geometry."""
        site = cast(
            Site,
            self.load_current_geometry(site_session_id, as_site=True),
        )
        if site.site_session_id is None:
            site.site_session_id = site_session_id
        default_layer = self._get_or_create_default_layer(site)
        default_parcel = self._get_or_create_default_parcel(default_layer)
        geometry = self._get_or_create_default_geometry(default_parcel)
        if attributes:
            arc_segment.attributes.update(attributes)
        geometry.add_segment(arc_segment)
        result = self.save_geometry(
            site_session_id, site, action="add_arc"
        )
        return cast(Site, result)

    def update_segment(
        self,
        site_session_id: int,
        segment_id: str,
        start_x: float,
        start_y: float,
        end_x: float,
        end_y: float,
        layer: Optional[str] = None,
        attributes: Optional[Dict[str, Any]] = None
    ) -> Union[Dict[str, Any], Site]:
        """Update a line segment in the geometry."""
        site = cast(
            Site,
            self.load_current_geometry(site_session_id, as_site=True),
        )
        segment = site.get_segment_by_id(segment_id)
        if not segment:
            raise GeometryNotFoundError(f"Segment with id {segment_id} not found")
        if isinstance(segment, ArcSegment):
            raise GeometryError("Arc segments cannot be updated. Delete and create a new arc instead.")
        segment.start = {"x": float(start_x), "y": float(start_y)}
        segment.end = {"x": float(end_x), "y": float(end_y)}
        dx = end_x - start_x
        dy = end_y - start_y
        segment.length = float((dx ** 2 + dy ** 2) ** 0.5)
        if isinstance(segment, LineSegment):
            angle_rad = math.atan2(dy, dx)
            angle_deg = math.degrees(angle_rad)
            segment.azimuth = (90 - angle_deg) % 360
        if layer is not None:
            segment.layer = str(layer)
        if attributes is not None:
            current_attrs = segment.attributes
            current_attrs.update(attributes)
            segment.attributes = current_attrs
        return self.save_geometry(
            site_session_id, site, action="update_segment"
        )

    def undo(
        self, site_session_id: int, as_site: bool = False
    ) -> Union[Dict[str, Any], Site]:
        """Undo last action by loading previous version."""
        current_site = cast(
            Site,
            self.load_current_geometry(site_session_id, as_site=True),
        )
        if not current_site.history or not current_site.history.get(
            "previousVersionFile"
        ):
            raise GeometryError("No actions to undo")
        previous_version_file = current_site.history["previousVersionFile"]
        geom_tmp_dir = self.get_geometry_path(site_session_id)
        version_file = geom_tmp_dir / previous_version_file
        if not version_file.exists():
            raise GeometryNotFoundError(
                f"Previous version file {previous_version_file} not found"
            )
        with open(version_file, 'r', encoding='utf-8') as f:
            previous_data = json.load(f)
        previous_site = self._load_site_from_json(
            previous_data, site_session_id
        )
        previous_site.version = current_site.version - 1
        current_file = self.get_current_geometry_file(site_session_id)
        storage_json = previous_site.to_storage_json()
        with open(current_file, 'w', encoding='utf-8') as f:
            json.dump(storage_json, f, indent=2, ensure_ascii=False)
        return previous_site if as_site else storage_json

    def delete_object(
        self,
        site_session_id: int,
        object_type: str,
        object_id: str
    ) -> Union[Dict[str, Any], Site]:
        """Delete an object (point, segment, parcel, layer) from the geometry."""
        site = cast(
            Site,
            self.load_current_geometry(site_session_id, as_site=True),
        )
        if site.site_session_id is None:
            site.site_session_id = site_session_id
        if object_type == 'point':
            point = site.get_point(object_id)
            if not point:
                raise GeometryNotFoundError(
                    f"Point with id {object_id} not found"
                )
            return point.delete(site_session_id, self, site)
        elif object_type == 'segment':
            segment = site.get_segment_by_id(object_id)
            if not segment:
                raise GeometryNotFoundError(
                    f"Segment with id {object_id} not found"
                )
            return segment.delete(site_session_id, self, site)
        elif object_type == 'parcel':
            parcel = None
            for layer in site.geometry_layers:
                parcel = layer.get_parcel(object_id)
                if parcel:
                    break
            if not parcel:
                raise GeometryNotFoundError(
                    f"Parcel with id {object_id} not found"
                )
            return parcel.delete(site_session_id, self, site)
        elif object_type == 'layer':
            layer = site.get_geometry_layer(object_id)
            if not layer:
                raise GeometryNotFoundError(
                    f"GeometryLayer with id {object_id} not found"
                )
            return layer.delete(site_session_id, self, site)
        else:
            raise ValueError(f"Unknown object type: {object_type}")

    def _cleanup_old_versions(self, geom_tmp_dir: Path, max_versions: int = 20) -> None:
        """Remove old version files, keeping only the most recent max_versions."""
        if not geom_tmp_dir.exists():
            return
        version_files = []
        for file in geom_tmp_dir.glob("version_*.json"):
            try:
                version_num = int(file.stem.split("_")[1])
                version_files.append((version_num, file))
            except (ValueError, IndexError):
                continue
        version_files.sort(key=lambda x: x[0])
        if len(version_files) > max_versions:
            for _, file in version_files[:-max_versions]:
                try:
                    file.unlink()
                except OSError:
                    pass
