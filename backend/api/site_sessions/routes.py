from __future__ import annotations

from flask import Blueprint, current_app, jsonify, request

from backend.app.container import get_site_session_service
from backend.services.site_session_service import (
    SiteSessionError,
    SiteSessionNotFoundError,
)

site_sessions_bp = Blueprint("site_sessions", __name__)


@site_sessions_bp.post("/api/site_sessions")
def create_site_session():
    """Create a new site session."""
    data = request.get_json() or {}
    site_session_name = data.get("site_session_name", "New Site Session")
    user_comment = data.get("user_comment")

    service = get_site_session_service()
    try:
        site_session = service.create_site_session(
            site_session_name=site_session_name, user_comment=user_comment
        )
        return (
            jsonify(
                {
                    "message": "Site session created successfully.",
                    "site_session": site_session,
                }
            ),
            201,
        )
    except SiteSessionError as exc:
        return jsonify({"message": str(exc)}), 500


@site_sessions_bp.put("/api/site_sessions/<int:site_session_id>")
def update_site_session(site_session_id: int):
    """Update site session data."""
    data = request.get_json() or {}

    geometry_storage = data.get("geometry_storage")
    processed_drawing = data.get("processed_drawing")
    site_session_name = data.get("site_session_name")
    user_comment = data.get("user_comment")

    service = get_site_session_service()
    try:
        site_session = service.update_site_session(
            site_session_id=site_session_id,
            geometry_storage=geometry_storage,
            processed_drawing=processed_drawing,
            site_session_name=site_session_name,
            user_comment=user_comment,
        )
        return (
            jsonify(
                {
                    "message": "Site session updated successfully.",
                    "site_session": site_session,
                }
            ),
            200,
        )
    except SiteSessionNotFoundError as exc:
        return jsonify({"message": str(exc)}), 404
    except SiteSessionError as exc:
        return jsonify({"message": str(exc)}), 500


@site_sessions_bp.post("/api/site_sessions/<int:site_session_id>/activate")
def activate_site_session(site_session_id: int):
    """Activate a site session and return paths for drafter."""
    service = get_site_session_service()
    try:
        site_session_data = service.activate_site_session(site_session_id)
        return (
            jsonify(
                {
                    "message": "Site session activated successfully.",
                    "site_session": site_session_data,
                }
            ),
            200,
        )
    except SiteSessionNotFoundError as exc:
        return jsonify({"message": str(exc)}), 404
    except SiteSessionError as exc:
        return jsonify({"message": str(exc)}), 500


@site_sessions_bp.get("/api/site_sessions/<int:site_session_id>")
def get_site_session(site_session_id: int):
    """Get site session by ID."""
    service = get_site_session_service()
    try:
        site_session = service.get_site_session(site_session_id)
        return jsonify({"site_session": site_session}), 200
    except SiteSessionNotFoundError as exc:
        return jsonify({"message": str(exc)}), 404
    except SiteSessionError as exc:
        return jsonify({"message": str(exc)}), 500


@site_sessions_bp.get("/api/site_sessions")
def list_site_sessions():
    """List all site sessions."""
    service = get_site_session_service()
    try:
        site_sessions = service.list_site_sessions()
        return jsonify({"site_sessions": site_sessions}), 200
    except SiteSessionError as exc:
        return jsonify({"message": str(exc)}), 500
