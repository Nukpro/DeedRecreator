from __future__ import annotations

import json
import math
import uuid
from pathlib import Path
from typing import Optional, Dict, Any, List, Union

from flask import current_app

from backend.services.session_service import SessionService, SessionNotFoundError
from backend.domain.vectors import (
    Site, Point, Segment, LineSegment, ArcSegment, Geometry, Parcel, GeometryLayer
)


class GeometryError(Exception):
    """Base exception raised for geometry management issues."""


class GeometryNotFoundError(GeometryError):
    """Raised when geometry data is not found."""


class GeometryService:
    """Handle geometry storage and versioning for sessions."""

    def __init__(self, session_service: SessionService) -> None:
        self._session_service = session_service
    
    # Helper methods for working with Site objects
    
    def _create_empty_site(self, session_id: int) -> Site:
        """Create an empty Site for a session."""
        return Site(
            project_id='',
            site_id=str(session_id),
            name=f'Session {session_id}',
            version=0,
            history={
                'currentVersion': 0,
                'previousVersionFile': None
            },
            sessionId=session_id
        )
    
    def _load_site_from_json(self, data: Dict[str, Any], session_id: int) -> Site:
        """Load Site object from storage JSON format."""
        # Ensure sessionId is set
        data['sessionId'] = session_id
        site = Site.from_storage_json(data)
        return site
    
    def _get_or_create_default_layer(self, site: Site) -> GeometryLayer:
        """Get or create default geometry layer for session-based geometry."""
        # Try to find existing default layer
        for layer in site.geometry_layers:
            if layer.name == 'Default Layer' or layer.layer_type == 'Boundary':
                return layer
        
        # Create new default layer
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
        
        # Create new default parcel
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
        
        # Create new default geometry
        geometry = Geometry(geometry_type='LineString', is_closed=False)
        parcel.geometry = geometry
        return geometry

    def get_geometry_path(self, session_id: int) -> Path:
        """Get path to geometry_tmp directory for a session."""
        session = self._session_service.get_session(session_id)
        catalog_name = session["storage_catalog_name"]
        instance_path = Path(current_app.instance_path)
        session_dir = instance_path / "sessions_id_" / catalog_name
        geom_tmp_dir = session_dir / "geom_tmp"
        geom_tmp_dir.mkdir(parents=True, exist_ok=True)
        return geom_tmp_dir

    def get_current_geometry_file(self, session_id: int) -> Path:
        """Get path to current geometry file."""
        geom_tmp_dir = self.get_geometry_path(session_id)
        return geom_tmp_dir / "current.json"

    def load_current_geometry(self, session_id: int, as_site: bool = False) -> Union[Dict[str, Any], Site]:
        """
        Load current geometry state for a session.
        
        Args:
            session_id: Session ID
            as_site: If True, return Site object; if False, return JSON dict (for backward compatibility)
        
        Returns:
            Site object if as_site=True, otherwise JSON dict
        """
        current_file = self.get_current_geometry_file(session_id)
        
        if not current_file.exists():
            # Return empty geometry structure
            if as_site:
                return self._create_empty_site(session_id)
            else:
                return {
                    "sessionId": session_id,
                    "version": 0,
                    "history": {
                        "currentVersion": 0,
                        "previousVersionFile": None
                    },
                    "points": [],
                    "segments": [],
                    "geometryLayers": []
                }
        
        try:
            with open(current_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            if as_site:
                return self._load_site_from_json(data, session_id)
            else:
                return data
        except (json.JSONDecodeError, IOError) as e:
            raise GeometryError(f"Failed to load geometry: {e}") from e

    def save_geometry(
        self,
        session_id: int,
        geometry_data: Union[Dict[str, Any], Site],
        action: str = "modify"
    ) -> Union[Dict[str, Any], Site]:
        """
        Save geometry with versioning.
        
        Creates a new version file in geom_tmp/ and updates current.json.
        Maintains history chain and cleans up old versions (max 20 files).
        
        Args:
            session_id: Session ID
            geometry_data: Either Site object or JSON dict (for backward compatibility)
            action: Action description
        
        Returns:
            Site object if geometry_data is Site, otherwise JSON dict
        """
        geom_tmp_dir = self.get_geometry_path(session_id)
        
        # Load current state
        current_site = self.load_current_geometry(session_id, as_site=True)
        current_version = current_site.version
        
        # Save current version to tmp/ before updating
        if current_version > 0:
            previous_version_file = f"version_{current_version}.json"
            version_file = geom_tmp_dir / previous_version_file
            with open(version_file, 'w', encoding='utf-8') as f:
                json.dump(current_site.to_storage_json(), f, indent=2, ensure_ascii=False)
        else:
            previous_version_file = None
        
        # Convert geometry_data to Site if needed
        if isinstance(geometry_data, Site):
            site = geometry_data
        else:
            # Backward compatibility: convert dict to Site
            geometry_data["sessionId"] = session_id
            site = self._load_site_from_json(geometry_data, session_id)
        
        # Ensure session_id is set
        if site.session_id is None:
            site.session_id = session_id
        
        # Update version and history
        new_version = current_version + 1
        site.version = new_version
        site.history = {
            "currentVersion": new_version,
            "previousVersionFile": previous_version_file
        }
        
        # Save new current.json
        current_file = self.get_current_geometry_file(session_id)
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
        
        # Cleanup old versions (keep max 20 files)
        self._cleanup_old_versions(geom_tmp_dir, max_versions=20)
        
        # Return in same format as input
        if isinstance(geometry_data, Site):
            return site
        else:
            return storage_json

    def add_point(
        self,
        session_id: int,
        x: float,
        y: float,
        attributes: Optional[Dict[str, Any]] = None
    ) -> Union[Dict[str, Any], Site]:
        """Add a point to the geometry."""
        try:
            site = self.load_current_geometry(session_id, as_site=True)
            
            # Ensure session_id is set
            if site.session_id is None:
                site.session_id = session_id
            
            # Create new point object
            point_attributes = attributes or {}
            new_point = Point(
                x=x,
                y=y,
                layer=point_attributes.get("layer", ""),
                attributes=point_attributes
            )
            
            # Add point to site
            site.add_point(new_point)
            
            # Save with versioning
            return self.save_geometry(session_id, site, action="add_point")
        except Exception as e:
            current_app.logger.error(f"Error in add_point: {e}", exc_info=True)
            raise

    def update_point(
        self,
        session_id: int,
        point_id: str,
        x: Optional[float] = None,
        y: Optional[float] = None,
        layer: Optional[str] = None,
        attributes: Optional[Dict[str, Any]] = None
    ) -> Union[Dict[str, Any], Site]:
        """Update a point in the geometry."""
        site = self.load_current_geometry(session_id, as_site=True)
        
        # Find point
        point = site.get_point(point_id)
        if not point:
            raise GeometryNotFoundError(f"Point with id {point_id} not found")
        
        # Update point properties
        if x is not None:
            point.x = float(x)
        if y is not None:
            point.y = float(y)
        if layer is not None:
            point.layer = str(layer)
        if attributes is not None:
            # Merge attributes
            current_attrs = point.attributes
            current_attrs.update(attributes)
            point.attributes = current_attrs
        
        # Save with versioning
        return self.save_geometry(session_id, site, action="update_point")

    def add_segment(
        self,
        session_id: int,
        start_x: float,
        start_y: float,
        end_x: float,
        end_y: float,
        attributes: Optional[Dict[str, Any]] = None,
        segment_type: str = "line"
    ) -> Union[Dict[str, Any], Site]:
        """Add a segment to the geometry."""
        try:
            site = self.load_current_geometry(session_id, as_site=True)
            
            # Ensure session_id is set
            if site.session_id is None:
                site.session_id = session_id
            
            # Calculate length
            dx = end_x - start_x
            dy = end_y - start_y
            length = (dx ** 2 + dy ** 2) ** 0.5
            
            # Calculate bearing for line segments
            bearing = math.degrees(math.atan2(dy, dx))
            if bearing < 0:
                bearing += 360
            
            # Get or create default layer and parcel
            default_layer = self._get_or_create_default_layer(site)
            default_parcel = self._get_or_create_default_parcel(default_layer)
            geometry = self._get_or_create_default_geometry(default_parcel)
            
            # Create segment object
            segment_attributes = attributes or {}
            start = {"x": float(start_x), "y": float(start_y)}
            end = {"x": float(end_x), "y": float(end_y)}
            
            if segment_type == "line":
                new_segment = LineSegment(
                    start=start,
                    end=end,
                    bearing=bearing,
                    length=float(length),
                    layer=segment_attributes.get("layer", ""),
                    attributes=segment_attributes
                )
            elif segment_type == "arc":
                # For arc, we need center, radius, rotation - use defaults if not provided
                center = segment_attributes.get("center", start)
                radius = segment_attributes.get("radius", length / 2)
                rotation = segment_attributes.get("rotation", "cw")
                delta = segment_attributes.get("delta")
                
                new_segment = ArcSegment(
                    start=start,
                    end=end,
                    center=center,
                    radius=float(radius),
                    rotation=rotation,
                    delta=delta,
                    length=float(length),
                    layer=segment_attributes.get("layer", ""),
                    attributes=segment_attributes
                )
            else:
                raise ValueError(f"Unknown segment type: {segment_type}")
            
            # Add segment to geometry
            geometry.add_segment(new_segment)
            
            # Save with versioning
            return self.save_geometry(session_id, site, action="add_segment")
        except Exception as e:
            current_app.logger.error(f"Error in add_segment: {e}", exc_info=True)
            raise

    def update_segment(
        self,
        session_id: int,
        segment_id: str,
        start_x: float,
        start_y: float,
        end_x: float,
        end_y: float,
        layer: Optional[str] = None,
        attributes: Optional[Dict[str, Any]] = None
    ) -> Union[Dict[str, Any], Site]:
        """Update a segment in the geometry."""
        site = self.load_current_geometry(session_id, as_site=True)
        
        # Find segment
        segment = site.get_segment_by_id(segment_id)
        if not segment:
            raise GeometryNotFoundError(f"Segment with id {segment_id} not found")
        
        # Update segment coordinates
        segment.start = {"x": float(start_x), "y": float(start_y)}
        segment.end = {"x": float(end_x), "y": float(end_y)}
        
        # Recalculate length
        dx = end_x - start_x
        dy = end_y - start_y
        segment.length = float((dx ** 2 + dy ** 2) ** 0.5)
        
        # Update bearing for line segments
        if isinstance(segment, LineSegment):
            import math
            bearing = math.degrees(math.atan2(dy, dx))
            if bearing < 0:
                bearing += 360
            segment.bearing = bearing
        
        # Update layer if provided
        if layer is not None:
            segment.layer = str(layer)
        
        # Update attributes if provided
        if attributes is not None:
            current_attrs = segment.attributes
            current_attrs.update(attributes)
            segment.attributes = current_attrs
        
        # Save with versioning
        return self.save_geometry(session_id, site, action="update_segment")

    def undo(self, session_id: int, as_site: bool = False) -> Union[Dict[str, Any], Site]:
        """Undo last action by loading previous version."""
        current_site = self.load_current_geometry(session_id, as_site=True)
        
        if not current_site.history or not current_site.history.get("previousVersionFile"):
            raise GeometryError("No actions to undo")
        
        previous_version_file = current_site.history["previousVersionFile"]
        geom_tmp_dir = self.get_geometry_path(session_id)
        version_file = geom_tmp_dir / previous_version_file
        
        if not version_file.exists():
            raise GeometryNotFoundError(f"Previous version file {previous_version_file} not found")
        
        # Load previous version
        with open(version_file, 'r', encoding='utf-8') as f:
            previous_data = json.load(f)
        
        # Convert to Site
        previous_site = self._load_site_from_json(previous_data, session_id)
        
        # Update version (decrement)
        previous_site.version = current_site.version - 1
        # History is already set in the previous version file
        
        # Save as current
        current_file = self.get_current_geometry_file(session_id)
        storage_json = previous_site.to_storage_json()
        with open(current_file, 'w', encoding='utf-8') as f:
            json.dump(storage_json, f, indent=2, ensure_ascii=False)
        
        # Return in requested format
        if as_site:
            return previous_site
        else:
            return storage_json

    def delete_object(
        self,
        session_id: int,
        object_type: str,
        object_id: str
    ) -> Union[Dict[str, Any], Site]:
        """
        Delete an object (point, segment, parcel, layer, etc.) from the geometry.
        
        Args:
            session_id: Session ID
            object_type: Type of object ('point', 'segment', 'parcel', 'layer', etc.)
            object_id: ID of the object to delete
            
        Returns:
            Site object after deletion
        """
        site = self.load_current_geometry(session_id, as_site=True)
        
        # Ensure session_id is set
        if site.session_id is None:
            site.session_id = session_id
        
        # Find and delete the object based on type
        from backend.domain.vectors import Point, Segment, Parcel, GeometryLayer
        
        if object_type == 'point':
            point = site.get_point(object_id)
            if not point:
                raise GeometryNotFoundError(f"Point with id {object_id} not found")
            return point.delete(session_id, self, site)
        
        elif object_type == 'segment':
            segment = site.get_segment_by_id(object_id)
            if not segment:
                raise GeometryNotFoundError(f"Segment with id {object_id} not found")
            return segment.delete(session_id, self, site)
        
        elif object_type == 'parcel':
            # Find parcel in layers
            parcel = None
            for layer in site.geometry_layers:
                parcel = layer.get_parcel(object_id)
                if parcel:
                    break
            if not parcel:
                raise GeometryNotFoundError(f"Parcel with id {object_id} not found")
            return parcel.delete(session_id, self, site)
        
        elif object_type == 'layer':
            layer = site.get_geometry_layer(object_id)
            if not layer:
                raise GeometryNotFoundError(f"GeometryLayer with id {object_id} not found")
            return layer.delete(session_id, self, site)
        
        else:
            raise ValueError(f"Unknown object type: {object_type}")
    
    def _cleanup_old_versions(self, geom_tmp_dir: Path, max_versions: int = 20) -> None:
        """Remove old version files, keeping only the most recent max_versions."""
        if not geom_tmp_dir.exists():
            return
        
        # Get all version files
        version_files = []
        for file in geom_tmp_dir.glob("version_*.json"):
            try:
                version_num = int(file.stem.split("_")[1])
                version_files.append((version_num, file))
            except (ValueError, IndexError):
                continue
        
        # Sort by version number
        version_files.sort(key=lambda x: x[0])
        
        # Remove oldest files if exceeding limit
        if len(version_files) > max_versions:
            files_to_delete = version_files[:-max_versions]
            for _, file in files_to_delete:
                try:
                    file.unlink()
                except OSError:
                    pass  # Ignore errors when deleting old files

