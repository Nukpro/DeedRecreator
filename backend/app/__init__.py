from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from flask import Flask

from backend.config import resolve_config
from backend.extensions import init_extensions
from backend.app.container import register_services


def create_app(config_name: str | None = None) -> Flask:
    """Application factory."""
    project_root = Path(__file__).resolve().parents[2]
    app = Flask(
        __name__,
        instance_relative_config=True,
        instance_path=str(project_root / "instance"),
        static_folder=str(project_root / "static"),
        template_folder=str(project_root / "templates"),
    )

    config_class = resolve_config(config_name or os.getenv("FLASK_ENV"))
    app.config.from_object(config_class)
    _ensure_instance_subdirs(app)

    init_extensions(app)
    register_services(app)
    _register_blueprints(app)
    return app


def _register_blueprints(app: Flask) -> None:
    from backend.api.pages.routes import pages_bp
    from backend.api.uploads.routes import uploads_bp
    from backend.api.sessions.routes import sessions_bp

    app.register_blueprint(pages_bp)
    app.register_blueprint(uploads_bp)
    app.register_blueprint(sessions_bp)


def _ensure_instance_subdirs(app: Flask) -> None:
    """Ensure instance directory exists. Upload directories are now created per-session."""
    instance_path = Path(app.instance_path)
    instance_path.mkdir(parents=True, exist_ok=True)
    # Sessions directory will be created by SessionService when needed
    sessions_dir = instance_path / "sessions_id_"
    sessions_dir.mkdir(parents=True, exist_ok=True)

