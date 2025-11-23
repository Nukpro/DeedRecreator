from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from flask import Blueprint, current_app, redirect, render_template, request, url_for

from backend.app.container import get_session_service
from backend.services.session_service import SessionError, SessionNotFoundError

pages_bp = Blueprint("pages", __name__)


def load_sessions() -> list[dict]:
    """Load sessions from JSON file using Flask instance_path."""
    try:
        instance_path = Path(current_app.instance_path)
        sessions_file = instance_path / "sessions.json"
        
        if not sessions_file.exists():
            return []
        
        with open(sessions_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("sessions", [])
    except (RuntimeError, json.JSONDecodeError, IOError):
        # Outside application context or file read error, return empty list
        return []


@pages_bp.get("/")
def index():
    sessions = load_sessions()
    return render_template("index.html", current_year=datetime.now().year, sessions=sessions)


@pages_bp.get("/home")
def go_home():
    return redirect(url_for("pages.index"))


@pages_bp.get("/create-session")
def create_session():
    """Create a new session and redirect to drafter with session parameters."""
    service = get_session_service()
    try:
        # Create a new session with default name
        session = service.create_session(session_name="New Session")
        # Redirect to drafter with the new session_id
        return redirect(url_for("pages.drafter", session_id=session["id"]))
    except SessionError as exc:
        # If session creation fails, redirect to index with error message
        # In a production app, you might want to use flash messages here
        return redirect(url_for("pages.index"))


@pages_bp.get("/drafter")
def drafter():
    """Render drafter page, optionally with active session data."""
    session_id = request.args.get("session_id", type=int)
    session_data = None
    
    if session_id:
        try:
            service = get_session_service()
            session_data = service.activate_session(session_id)
            
            # Add URL for processed_drawing if it exists
            if session_data.get("processed_drawing"):
                # Extract filename from relative path (e.g., "processed_drawing/filename.png" -> "filename.png")
                processed_path = Path(session_data["processed_drawing"])
                filename = processed_path.name
                
                # Add URL to paths
                if "paths" not in session_data:
                    session_data["paths"] = {}
                
                try:
                    processed_drawing_url = url_for(
                        "uploads.serve_uploaded_file",
                        session_id=session_id,
                        filename=filename,
                    )
                    session_data["paths"]["processed_drawing_url"] = processed_drawing_url
                    current_app.logger.info(
                        f"Added processed_drawing_url for session {session_id}: {processed_drawing_url} (filename: {filename}, processed_drawing: {session_data.get('processed_drawing')})"
                    )
                except Exception as e:
                    current_app.logger.error(
                        f"Failed to generate URL for processed_drawing in session {session_id}: {e}",
                        exc_info=True
                    )
        except SessionNotFoundError:
            # If session not found, continue without session data
            pass
    
    return render_template(
        "drafter.html",
        current_year=datetime.now().year,
        session_data=session_data,
    )

