from flask import Blueprint

alignment_bp = Blueprint("alignment", __name__)

from backend.api.alignment import routes
