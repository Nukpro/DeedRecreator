from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from flask import Blueprint, current_app, redirect, render_template, request, url_for

from backend.app.container import get_site_session_service
from backend.services.site_session_service import (
    SiteSessionError,
    SiteSessionNotFoundError,
)

pages_bp = Blueprint("pages", __name__)


def load_site_sessions() -> list[dict]:
    """Load site sessions from JSON file using Flask instance_path."""
    try:
        instance_path = Path(current_app.instance_path)
        site_sessions_file = instance_path / "site_sessions.json"

        if not site_sessions_file.exists():
            return []

        with open(site_sessions_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("site_sessions", [])
    except (RuntimeError, json.JSONDecodeError, IOError):
        return []


@pages_bp.get("/")
def index():
    site_sessions = load_site_sessions()
    return render_template(
        "index.html",
        current_year=datetime.now().year,
        site_sessions=site_sessions,
    )


@pages_bp.get("/create-session")
def create_session():
    """Create a new site session and redirect to drafter with site_session_id."""
    service = get_site_session_service()
    try:
        site_session = service.create_site_session(
            site_session_name="New Site Session"
        )
        return redirect(
            url_for("pages.drafter", site_session_id=site_session["id"])
        )
    except SiteSessionError as exc:
        return redirect(url_for("pages.index"))


@pages_bp.get("/drafter")
def drafter():
    """Render drafter page, optionally with active site session data."""
    site_session_id = request.args.get("site_session_id", type=int)
    site_session_data = None

    if site_session_id:
        try:
            service = get_site_session_service()
            site_session_data = service.activate_site_session(site_session_id)

            if site_session_data.get("processed_drawing"):
                processed_path = Path(site_session_data["processed_drawing"])
                filename = processed_path.name

                if "paths" not in site_session_data:
                    site_session_data["paths"] = {}

                try:
                    processed_drawing_url = url_for(
                        "uploads.serve_uploaded_file",
                        site_session_id=site_session_id,
                        filename=filename,
                    )
                    site_session_data["paths"][
                        "processed_drawing_url"
                    ] = processed_drawing_url
                    current_app.logger.info(
                        f"Added processed_drawing_url for site session {site_session_id}: {processed_drawing_url}"
                    )
                except Exception as e:
                    current_app.logger.error(
                        f"Failed to generate URL for processed_drawing in site session {site_session_id}: {e}",
                        exc_info=True,
                    )

            # Remove non-JSON-serializable ProcessedImage; deliver alignment to frontend from class
            processed_image = site_session_data.pop("processed_image", None)
            if processed_image is not None:
                try:
                    alignment_data = processed_image.load_alignment()
                    if "paths" not in site_session_data:
                        site_session_data["paths"] = {}
                    site_session_data["paths"]["alignment"] = alignment_data
                except FileNotFoundError:
                    pass
        except SiteSessionNotFoundError:
            pass

    return render_template(
        "drafter.html",
        current_year=datetime.now().year,
        site_session_data=site_session_data,
    )
