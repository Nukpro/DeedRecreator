from flask import Blueprint

geometry_bp = Blueprint("geometry", __name__)

from backend.api.geometry import routes

