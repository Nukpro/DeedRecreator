from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from flask import current_app


class SiteSessionError(Exception):
    """Base exception raised for site session management issues."""


class SiteSessionNotFoundError(SiteSessionError):
    """Raised when a site session is not found."""


class SiteSessionService:
    """Handle site session management: creation, updates, and activation."""

    def __init__(self, site_sessions_file: Path, site_sessions_dir: Path) -> None:
        self._site_sessions_file = site_sessions_file
        self._site_sessions_dir = site_sessions_dir
        self._site_sessions_dir.mkdir(parents=True, exist_ok=True)

    @classmethod
    def from_app_config(cls) -> "SiteSessionService":
        """Create SiteSessionService from Flask app configuration."""
        instance_path = Path(current_app.instance_path)
        site_sessions_file = instance_path / "site_sessions.json"
        site_sessions_dir = instance_path / "site_sessions_id_"
        return cls(site_sessions_file=site_sessions_file, site_sessions_dir=site_sessions_dir)

    def create_site_session(
        self, site_session_name: str, user_comment: Optional[str] = None
    ) -> dict:
        """
        Create a new site session with directory structure.

        Returns the created site session data.
        """
        data = self._load_site_sessions_data()

        site_session_uuid = uuid.uuid4().hex
        catalog_name = f"site_session_{site_session_uuid}"

        site_session_dir = self._site_sessions_dir / catalog_name
        (site_session_dir / "geom_tmp").mkdir(parents=True, exist_ok=True)
        (site_session_dir / "geometry_storage").mkdir(parents=True, exist_ok=True)
        (site_session_dir / "processed_drawing").mkdir(parents=True, exist_ok=True)
        (site_session_dir / "uploads").mkdir(parents=True, exist_ok=True)

        now = datetime.now(timezone.utc).isoformat()
        new_site_session = {
            "id": data["next_id"],
            "site_session_name": site_session_name,
            "creation_time": now,
            "update_time": now,
            "site_session_status": "stage",
            "storage_catalog_name": catalog_name,
            "processed_drawing": None,
            "geometry_storage": None,
            "user_comment": user_comment or "",
        }

        data["site_sessions"].append(new_site_session)
        data["next_id"] += 1

        self._save_site_sessions_data(data)

        return new_site_session

    def update_site_session(
        self,
        site_session_id: int,
        geometry_storage: Optional[str] = None,
        processed_drawing: Optional[str] = None,
        site_session_name: Optional[str] = None,
        user_comment: Optional[str] = None,
    ) -> dict:
        """
        Update site session data.

        Updates paths to geometry_storage and processed_drawing, and update_time.
        """
        data = self._load_site_sessions_data()

        site_session = self._find_site_session_by_id(
            data["site_sessions"], site_session_id
        )
        if not site_session:
            raise SiteSessionNotFoundError(
                f"Site session with id {site_session_id} not found."
            )

        if geometry_storage is not None:
            site_session["geometry_storage"] = geometry_storage
        if processed_drawing is not None:
            site_session["processed_drawing"] = processed_drawing
        if site_session_name is not None:
            site_session["site_session_name"] = site_session_name
        if user_comment is not None:
            site_session["user_comment"] = user_comment

        site_session["update_time"] = datetime.now(timezone.utc).isoformat()

        self._save_site_sessions_data(data)

        return site_session

    def activate_site_session(self, site_session_id: int) -> dict:
        """
        Activate a site session and return paths for drafter.

        Returns site session data with paths to processed_drawing and geometry_storage.
        """
        data = self._load_site_sessions_data()

        site_session = self._find_site_session_by_id(
            data["site_sessions"], site_session_id
        )
        if not site_session:
            raise SiteSessionNotFoundError(
                f"Site session with id {site_session_id} not found."
            )

        site_session["site_session_status"] = "active"
        site_session["update_time"] = datetime.now(timezone.utc).isoformat()

        self._save_site_sessions_data(data)

        catalog_name = site_session["storage_catalog_name"]
        site_session_dir = self._site_sessions_dir / catalog_name

        result = {
            **site_session,
            "paths": {
                "processed_drawing": (
                    str(site_session_dir / site_session["processed_drawing"])
                    if site_session.get("processed_drawing")
                    else None
                ),
                "geometry_storage": (
                    str(site_session_dir / site_session["geometry_storage"])
                    if site_session.get("geometry_storage")
                    else None
                ),
                "site_session_dir": str(site_session_dir),
            },
        }

        return result

    def get_site_session(self, site_session_id: int) -> dict:
        """Get site session by ID."""
        data = self._load_site_sessions_data()
        site_session = self._find_site_session_by_id(
            data["site_sessions"], site_session_id
        )
        if not site_session:
            raise SiteSessionNotFoundError(
                f"Site session with id {site_session_id} not found."
            )
        return site_session

    def list_site_sessions(self) -> list[dict]:
        """List all site sessions."""
        data = self._load_site_sessions_data()
        return data["site_sessions"]

    def _load_site_sessions_data(self) -> dict:
        """Load site sessions data from JSON file."""
        if not self._site_sessions_file.exists():
            return {"site_sessions": [], "next_id": 1}

        try:
            with open(
                self._site_sessions_file, "r", encoding="utf-8"
            ) as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            raise SiteSessionError(
                f"Failed to load site sessions: {e}"
            ) from e

    def _save_site_sessions_data(self, data: dict) -> None:
        """Save site sessions data to JSON file."""
        try:
            self._site_sessions_file.parent.mkdir(parents=True, exist_ok=True)
            with open(
                self._site_sessions_file, "w", encoding="utf-8"
            ) as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except IOError as e:
            raise SiteSessionError(
                f"Failed to save site sessions: {e}"
            ) from e

    @staticmethod
    def _find_site_session_by_id(
        site_sessions: list[dict], site_session_id: int
    ) -> Optional[dict]:
        """Find site session by ID in site sessions list."""
        for site_session in site_sessions:
            if site_session.get("id") == site_session_id:
                return site_session
        return None
