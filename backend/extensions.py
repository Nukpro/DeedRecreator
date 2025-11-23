from __future__ import annotations

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def init_extensions(app) -> None:
    """Initialize Flask extensions."""
    db.init_app(app)

