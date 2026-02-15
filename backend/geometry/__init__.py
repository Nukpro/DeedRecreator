"""
Geometry module: domain models (vectors), service, and API routes.
"""

from flask import Blueprint

from backend.geometry.service import GeometryService, GeometryError, GeometryNotFoundError

geometry_bp = Blueprint("geometry", __name__)

# Routes are registered when app calls: import backend.geometry.routes
# (in _register_blueprints) to avoid pulling app/container at import time.

__all__ = [
    "geometry_bp",
    "GeometryService",
    "GeometryError",
    "GeometryNotFoundError",
]
