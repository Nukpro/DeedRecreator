from __future__ import annotations

from flask import Blueprint, current_app, jsonify, request

from backend.app.container import get_session_service
from backend.services.session_service import SessionError, SessionNotFoundError

sessions_bp = Blueprint("sessions", __name__)


@sessions_bp.post("/api/sessions")
def create_session():
    """Create a new session."""
    data = request.get_json() or {}
    session_name = data.get("session_name", "New Session")
    user_comment = data.get("user_comment")
    
    service = get_session_service()
    try:
        session = service.create_session(session_name=session_name, user_comment=user_comment)
        return jsonify({"message": "Session created successfully.", "session": session}), 201
    except SessionError as exc:
        return jsonify({"message": str(exc)}), 500


@sessions_bp.put("/api/sessions/<int:session_id>")
def update_session(session_id: int):
    """Update session data."""
    data = request.get_json() or {}
    
    geometry_storage = data.get("geometry_storage")
    processed_drawing = data.get("processed_drawing")
    session_name = data.get("session_name")
    user_comment = data.get("user_comment")
    
    service = get_session_service()
    try:
        session = service.update_session(
            session_id=session_id,
            geometry_storage=geometry_storage,
            processed_drawing=processed_drawing,
            session_name=session_name,
            user_comment=user_comment,
        )
        return jsonify({"message": "Session updated successfully.", "session": session}), 200
    except SessionNotFoundError as exc:
        return jsonify({"message": str(exc)}), 404
    except SessionError as exc:
        return jsonify({"message": str(exc)}), 500


@sessions_bp.post("/api/sessions/<int:session_id>/activate")
def activate_session(session_id: int):
    """Activate a session and return paths for drafter."""
    service = get_session_service()
    try:
        session_data = service.activate_session(session_id)
        return jsonify({
            "message": "Session activated successfully.",
            "session": session_data,
        }), 200
    except SessionNotFoundError as exc:
        return jsonify({"message": str(exc)}), 404
    except SessionError as exc:
        return jsonify({"message": str(exc)}), 500


@sessions_bp.get("/api/sessions/<int:session_id>")
def get_session(session_id: int):
    """Get session by ID."""
    service = get_session_service()
    try:
        session = service.get_session(session_id)
        return jsonify({"session": session}), 200
    except SessionNotFoundError as exc:
        return jsonify({"message": str(exc)}), 404
    except SessionError as exc:
        return jsonify({"message": str(exc)}), 500


@sessions_bp.get("/api/sessions")
def list_sessions():
    """List all sessions."""
    service = get_session_service()
    try:
        sessions = service.list_sessions()
        return jsonify({"sessions": sessions}), 200
    except SessionError as exc:
        return jsonify({"message": str(exc)}), 500

