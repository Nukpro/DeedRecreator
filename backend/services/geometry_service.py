from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Optional, Dict, Any, List

from flask import current_app

from backend.services.session_service import SessionService, SessionNotFoundError


class GeometryError(Exception):
    """Base exception raised for geometry management issues."""


class GeometryNotFoundError(GeometryError):
    """Raised when geometry data is not found."""


class GeometryService:
    """Handle geometry storage and versioning for sessions."""

    def __init__(self, session_service: SessionService) -> None:
        self._session_service = session_service

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

    def load_current_geometry(self, session_id: int) -> Dict[str, Any]:
        """Load current geometry state for a session."""
        current_file = self.get_current_geometry_file(session_id)
        
        if not current_file.exists():
            # Return empty geometry structure
            return {
                "sessionId": session_id,
                "version": 0,
                "history": {
                    "currentVersion": 0,
                    "previousVersionFile": None
                },
                "points": [],
                "geometryLayers": []
            }
        
        try:
            with open(current_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            raise GeometryError(f"Failed to load geometry: {e}") from e

    def save_geometry(
        self,
        session_id: int,
        geometry_data: Dict[str, Any],
        action: str = "modify"
    ) -> Dict[str, Any]:
        """
        Save geometry with versioning.
        
        Creates a new version file in geom_tmp/ and updates current.json.
        Maintains history chain and cleans up old versions (max 20 files).
        """
        geom_tmp_dir = self.get_geometry_path(session_id)
        
        # Load current state
        current_geometry = self.load_current_geometry(session_id)
        current_version = current_geometry.get("version", 0)
        
        # Save current version to tmp/ before updating
        if current_version > 0:
            previous_version_file = f"version_{current_version}.json"
            version_file = geom_tmp_dir / previous_version_file
            with open(version_file, 'w', encoding='utf-8') as f:
                json.dump(current_geometry, f, indent=2, ensure_ascii=False)
        else:
            previous_version_file = None
        
        # Update geometry data
        new_version = current_version + 1
        geometry_data["sessionId"] = session_id
        geometry_data["version"] = new_version
        geometry_data["history"] = {
            "currentVersion": new_version,
            "previousVersionFile": previous_version_file
        }
        
        # Save new current.json
        current_file = self.get_current_geometry_file(session_id)
        with open(current_file, 'w', encoding='utf-8') as f:
            json.dump(geometry_data, f, indent=2, ensure_ascii=False)
        
        # Cleanup old versions (keep max 20 files)
        self._cleanup_old_versions(geom_tmp_dir, max_versions=20)
        
        return geometry_data

    def add_point(
        self,
        session_id: int,
        x: float,
        y: float,
        attributes: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Add a point to the geometry."""
        current_geometry = self.load_current_geometry(session_id)
        
        # Ensure points array exists
        if "points" not in current_geometry:
            current_geometry["points"] = []
        
        # Create new point
        point_id = str(uuid.uuid4())
        point_attributes = attributes or {}
        new_point = {
            "id": point_id,
            "x": x,
            "y": y,
            "layer": point_attributes.get("layer", ""),
            "attributes": point_attributes
        }
        
        current_geometry["points"].append(new_point)
        
        # Save with versioning
        return self.save_geometry(session_id, current_geometry, action="add_point")

    def update_point(
        self,
        session_id: int,
        point_id: str,
        x: Optional[float] = None,
        y: Optional[float] = None,
        layer: Optional[str] = None,
        attributes: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Update a point in the geometry."""
        current_geometry = self.load_current_geometry(session_id)
        
        if "points" not in current_geometry:
            raise GeometryError("No points found in geometry")
        
        # Find and update point
        point_found = False
        for point in current_geometry["points"]:
            if point.get("id") == point_id:
                point_found = True
                if x is not None:
                    point["x"] = float(x)
                if y is not None:
                    point["y"] = float(y)
                if layer is not None:
                    point["layer"] = str(layer)
                if attributes is not None:
                    point["attributes"] = {**point.get("attributes", {}), **attributes}
                break
        
        if not point_found:
            raise GeometryNotFoundError(f"Point with id {point_id} not found")
        
        # Save with versioning
        return self.save_geometry(session_id, current_geometry, action="update_point")

    def undo(self, session_id: int) -> Dict[str, Any]:
        """Undo last action by loading previous version."""
        current_geometry = self.load_current_geometry(session_id)
        
        if not current_geometry.get("history") or not current_geometry["history"].get("previousVersionFile"):
            raise GeometryError("No actions to undo")
        
        previous_version_file = current_geometry["history"]["previousVersionFile"]
        geom_tmp_dir = self.get_geometry_path(session_id)
        version_file = geom_tmp_dir / previous_version_file
        
        if not version_file.exists():
            raise GeometryNotFoundError(f"Previous version file {previous_version_file} not found")
        
        # Load previous version
        with open(version_file, 'r', encoding='utf-8') as f:
            previous_geometry = json.load(f)
        
        # Update version and history
        previous_geometry["version"] = current_geometry["version"] - 1
        # History is already set in the previous version file
        
        # Save as current
        current_file = self.get_current_geometry_file(session_id)
        with open(current_file, 'w', encoding='utf-8') as f:
            json.dump(previous_geometry, f, indent=2, ensure_ascii=False)
        
        return previous_geometry

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

