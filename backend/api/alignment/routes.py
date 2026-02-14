from __future__ import annotations

from pathlib import Path

from flask import current_app, jsonify, request

from backend.api.alignment import alignment_bp
from backend.app.container import get_session_service
from backend.services.image_utils import (
    load_alignment_json,
    recalculate_alignment,
    save_alignment_json,
    validate_alignment_json,
)
from backend.services.session_service import SessionNotFoundError


def _get_alignment_file_path(session_id: int, image_filename: str) -> Path:
    """Get path to alignment.json file for a session and image."""
    try:
        session_service = get_session_service()
        session = session_service.get_session(session_id)

        instance_path = Path(current_app.instance_path).resolve()
        catalog_name = session["storage_catalog_name"]
        sessions_dir = instance_path / "sessions_id_"
        session_dir = sessions_dir / catalog_name
        processed_dir = session_dir / "processed_drawing"

        # Remove extension from image_filename if present
        image_name = Path(image_filename).stem
        alignment_path = processed_dir / f"{image_name}.alignment.json"

        return alignment_path
    except SessionNotFoundError:
        raise
    except Exception as e:
        current_app.logger.error(f"Error getting alignment file path: {e}", exc_info=True)
        raise


@alignment_bp.get("/api/alignment/<int:session_id>/<path:image_filename>")
def get_alignment(session_id: int, image_filename: str):
    """Load alignment.json for specified image."""
    try:
        alignment_path = _get_alignment_file_path(session_id, image_filename)
        alignment_data = load_alignment_json(alignment_path)

        return jsonify(alignment_data), 200
    except SessionNotFoundError:
        return jsonify({"message": f"Session {session_id} not found"}), 404
    except FileNotFoundError:
        return jsonify({"message": f"Alignment file not found for image {image_filename}"}), 404
    except Exception as e:
        current_app.logger.error(
            f"Error loading alignment for session {session_id}, image {image_filename}: {e}",
            exc_info=True,
        )
        return jsonify({"message": "Internal server error"}), 500


@alignment_bp.put("/api/alignment/<int:session_id>/<path:image_filename>")
def update_alignment(session_id: int, image_filename: str):
    """Update alignment.json with rotation data (partial update)."""
    try:
        alignment_path = _get_alignment_file_path(session_id, image_filename)

        # Load existing alignment data (must exist)
        try:
            alignment_data = load_alignment_json(alignment_path)
        except FileNotFoundError:
            return jsonify({"message": f"Alignment file not found for image {image_filename}. Please upload image first."}), 404

        # Get rotation data from request body
        if not request.is_json:
            return jsonify({"message": "Request must be JSON"}), 400

        request_data = request.get_json()
        if "rotation" not in request_data:
            return jsonify({"message": "rotation field is required"}), 400

        rotation_data = request_data["rotation"]
        if not isinstance(rotation_data, dict):
            return jsonify({"message": "rotation must be an object"}), 400

        if "angle" not in rotation_data or "center" not in rotation_data:
            return jsonify({"message": "rotation must have angle and center"}), 400

        # Update rotation in alignment data
        alignment_data["rotation"] = {
            "angle": float(rotation_data["angle"]),
            "center": {
                "x": float(rotation_data["center"]["x"]),
                "y": float(rotation_data["center"]["y"]),
            },
        }

        # Update timestamp
        from datetime import datetime

        alignment_data["updated_at"] = datetime.now().isoformat()

        # Validate updated alignment data
        is_valid, error_message = validate_alignment_json(alignment_data)
        if not is_valid:
            return jsonify({"message": f"Validation failed: {error_message}"}), 400

        # Save updated alignment
        save_alignment_json(alignment_data, alignment_path)

        return jsonify(alignment_data), 200
    except SessionNotFoundError:
        return jsonify({"message": f"Session {session_id} not found"}), 404
    except FileNotFoundError:
        return jsonify({"message": f"Alignment file not found for image {image_filename}. Please upload image first."}), 404
    except Exception as e:
        current_app.logger.error(
            f"Error updating alignment for session {session_id}, image {image_filename}: {e}",
            exc_info=True,
        )
        return jsonify({"message": "Internal server error"}), 500


@alignment_bp.post("/api/alignment/<int:session_id>/<path:image_filename>/recalculate")
def recalculate_alignment_endpoint(session_id: int, image_filename: str):
    """Recalculate alignment based on base_point and reference_line."""
    try:
        alignment_path = _get_alignment_file_path(session_id, image_filename)

        # Load existing alignment data (must exist)
        try:
            alignment_data = load_alignment_json(alignment_path)
        except FileNotFoundError:
            return jsonify({"message": f"Alignment file not found for image {image_filename}. Please upload image first."}), 404

        # Get request data
        if not request.is_json:
            return jsonify({"message": "Request must be JSON"}), 400

        request_data = request.get_json()
        base_point = request_data.get("base_point")
        reference_line = request_data.get("reference_line")

        # Get image dimensions from alignment data or try to load from image file
        image_width = 1000  # Default
        image_height = 1000  # Default

        # Try to get from alignment_data.image_size first
        if "image_size" in alignment_data and isinstance(alignment_data["image_size"], dict):
            image_width = int(alignment_data["image_size"].get("width", 1000))
            image_height = int(alignment_data["image_size"].get("height", 1000))
        else:
            # Fallback: try to load from image file
            try:
                from PIL import Image

                image_file_path = alignment_path.parent / alignment_data["image_filename"]
                if image_file_path.exists():
                    with Image.open(image_file_path) as img:
                        image_width = img.width
                        image_height = img.height
            except Exception:
                # Use default if can't load image
                pass

        # Recalculate alignment
        updated_alignment = recalculate_alignment(
            alignment_data,
            base_point,
            reference_line,
            image_width,
            image_height,
        )

        # Validate updated alignment
        is_valid, error_message = validate_alignment_json(updated_alignment)
        if not is_valid:
            return jsonify({"message": f"Validation failed: {error_message}"}), 400

        # Save updated alignment
        save_alignment_json(updated_alignment, alignment_path)

        return jsonify(updated_alignment), 200
    except SessionNotFoundError:
        return jsonify({"message": f"Session {session_id} not found"}), 404
    except FileNotFoundError:
        return jsonify({"message": f"Alignment file not found for image {image_filename}. Please upload image first."}), 404
    except Exception as e:
        current_app.logger.error(
            f"Error recalculating alignment for session {session_id}, image {image_filename}: {e}",
            exc_info=True,
        )
        return jsonify({"message": "Internal server error"}), 500
