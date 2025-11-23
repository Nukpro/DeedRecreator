from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from flask import current_app


class SessionError(Exception):
    """Base exception raised for session management issues."""


class SessionNotFoundError(SessionError):
    """Raised when a session is not found."""


class SessionService:
    """Handle session management: creation, updates, and activation."""

    def __init__(self, sessions_file: Path, sessions_dir: Path) -> None:
        self._sessions_file = sessions_file
        self._sessions_dir = sessions_dir
        self._sessions_dir.mkdir(parents=True, exist_ok=True)

    @classmethod
    def from_app_config(cls) -> "SessionService":
        """Create SessionService from Flask app configuration."""
        instance_path = Path(current_app.instance_path)
        sessions_file = instance_path / "sessions.json"
        sessions_dir = instance_path / "sessions_id_"
        return cls(sessions_file=sessions_file, sessions_dir=sessions_dir)

    def create_session(self, session_name: str, user_comment: Optional[str] = None) -> dict:
        """
        Create a new session with directory structure.
        
        Returns the created session data.
        """
        # Load existing sessions
        data = self._load_sessions_data()
        
        # Generate session ID and catalog name
        session_uuid = uuid.uuid4().hex
        catalog_name = f"session_{session_uuid}"
        
        # Create session directory structure
        session_dir = self._sessions_dir / catalog_name
        (session_dir / "geom_tmp").mkdir(parents=True, exist_ok=True)
        (session_dir / "geometry_storage").mkdir(parents=True, exist_ok=True)
        (session_dir / "processed_drawing").mkdir(parents=True, exist_ok=True)
        (session_dir / "uploads").mkdir(parents=True, exist_ok=True)
        
        # Create new session record
        now = datetime.now(timezone.utc).isoformat()
        new_session = {
            "id": data["next_id"],
            "session_name": session_name,
            "creation_time": now,
            "update_time": now,
            "session_status": "stage",
            "storage_catalog_name": catalog_name,
            "processed_drawing": None,
            "geometry_storage": None,
            "user_comment": user_comment or "",
        }
        
        data["sessions"].append(new_session)
        data["next_id"] += 1
        
        # Save updated sessions
        self._save_sessions_data(data)
        
        return new_session

    def update_session(
        self,
        session_id: int,
        geometry_storage: Optional[str] = None,
        processed_drawing: Optional[str] = None,
        session_name: Optional[str] = None,
        user_comment: Optional[str] = None,
    ) -> dict:
        """
        Update session data.
        
        Updates paths to geometry_storage and processed_drawing, and update_time.
        """
        data = self._load_sessions_data()
        
        session = self._find_session_by_id(data["sessions"], session_id)
        if not session:
            raise SessionNotFoundError(f"Session with id {session_id} not found.")
        
        # Update fields
        if geometry_storage is not None:
            session["geometry_storage"] = geometry_storage
        if processed_drawing is not None:
            session["processed_drawing"] = processed_drawing
        if session_name is not None:
            session["session_name"] = session_name
        if user_comment is not None:
            session["user_comment"] = user_comment
        
        session["update_time"] = datetime.now(timezone.utc).isoformat()
        
        # Save updated sessions
        self._save_sessions_data(data)
        
        return session

    def activate_session(self, session_id: int) -> dict:
        """
        Activate a session and return paths for drafter.
        
        Returns session data with paths to processed_drawing and geometry_storage.
        """
        data = self._load_sessions_data()
        
        session = self._find_session_by_id(data["sessions"], session_id)
        if not session:
            raise SessionNotFoundError(f"Session with id {session_id} not found.")
        
        # Update session status
        session["session_status"] = "active"
        session["update_time"] = datetime.now(timezone.utc).isoformat()
        
        # Save updated sessions
        self._save_sessions_data(data)
        
        # Build full paths for drafter
        catalog_name = session["storage_catalog_name"]
        session_dir = self._sessions_dir / catalog_name
        
        result = {
            **session,
            "paths": {
                "processed_drawing": (
                    str(session_dir / session["processed_drawing"])
                    if session.get("processed_drawing")
                    else None
                ),
                "geometry_storage": (
                    str(session_dir / session["geometry_storage"])
                    if session.get("geometry_storage")
                    else None
                ),
                "session_dir": str(session_dir),
            },
        }
        
        return result

    def get_session(self, session_id: int) -> dict:
        """Get session by ID."""
        data = self._load_sessions_data()
        session = self._find_session_by_id(data["sessions"], session_id)
        if not session:
            raise SessionNotFoundError(f"Session with id {session_id} not found.")
        return session

    def list_sessions(self) -> list[dict]:
        """List all sessions."""
        data = self._load_sessions_data()
        return data["sessions"]

    def _load_sessions_data(self) -> dict:
        """Load sessions data from JSON file."""
        if not self._sessions_file.exists():
            return {"sessions": [], "next_id": 1}
        
        try:
            with open(self._sessions_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            raise SessionError(f"Failed to load sessions: {e}") from e

    def _save_sessions_data(self, data: dict) -> None:
        """Save sessions data to JSON file."""
        try:
            self._sessions_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self._sessions_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except IOError as e:
            raise SessionError(f"Failed to save sessions: {e}") from e

    @staticmethod
    def _find_session_by_id(sessions: list[dict], session_id: int) -> Optional[dict]:
        """Find session by ID in sessions list."""
        for session in sessions:
            if session.get("id") == session_id:
                return session
        return None

