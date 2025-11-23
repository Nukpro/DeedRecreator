from __future__ import annotations

from flask import request, jsonify, current_app

from backend.api.geometry import geometry_bp
from backend.app.container import get_session_service, get_geometry_service
from backend.services.geometry_service import GeometryError, GeometryNotFoundError
from backend.services.session_service import SessionNotFoundError


@geometry_bp.post("/api/geometry/<int:session_id>/point")
def add_point(session_id: int):
    """Add a point to the geometry."""
    try:
        data = request.json or {}
        x = float(data.get("x", 0))
        y = float(data.get("y", 0))
        attributes = data.get("attributes")
        
        geometry_service = get_geometry_service()
        result = geometry_service.add_point(session_id, x, y, attributes)
        
        return jsonify({
            "success": True,
            "version": result["version"],
            "point": result["points"][-1] if result.get("points") else None
        }), 200
    except (ValueError, TypeError) as e:
        return jsonify({"success": False, "message": f"Invalid coordinates: {e}"}), 400
    except SessionNotFoundError as e:
        return jsonify({"success": False, "message": str(e)}), 404
    except GeometryError as e:
        return jsonify({"success": False, "message": str(e)}), 400
    except Exception as e:
        current_app.logger.error(f"Error adding point: {e}", exc_info=True)
        return jsonify({"success": False, "message": "Internal server error"}), 500


@geometry_bp.get("/api/geometry/<int:session_id>")
def get_geometry(session_id: int):
    """Get current geometry state for a session."""
    try:
        geometry_service = get_geometry_service()
        geometry = geometry_service.load_current_geometry(session_id)
        
        return jsonify(geometry), 200
    except SessionNotFoundError as e:
        return jsonify({"message": str(e)}), 404
    except GeometryError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.error(f"Error loading geometry: {e}", exc_info=True)
        return jsonify({"message": "Internal server error"}), 500


@geometry_bp.post("/api/geometry/<int:session_id>/save")
def save_geometry(session_id: int):
    """Save geometry data (full state)."""
    try:
        data = request.json or {}
        
        geometry_service = get_geometry_service()
        action = data.get("action", "modify")
        result = geometry_service.save_geometry(session_id, data, action)
        
        return jsonify({
            "success": True,
            "version": result["version"]
        }), 200
    except SessionNotFoundError as e:
        return jsonify({"success": False, "message": str(e)}), 404
    except GeometryError as e:
        return jsonify({"success": False, "message": str(e)}), 400
    except Exception as e:
        current_app.logger.error(f"Error saving geometry: {e}", exc_info=True)
        return jsonify({"success": False, "message": "Internal server error"}), 500


@geometry_bp.put("/api/geometry/<int:session_id>/point/<point_id>")
def update_point(session_id: int, point_id: str):
    """Update a point in the geometry."""
    try:
        data = request.json or {}
        current_app.logger.info(f"Updating point {point_id} in session {session_id} with data: {data}")
        
        x = data.get("x")
        y = data.get("y")
        layer = data.get("layer")
        attributes = data.get("attributes")
        
        # Validate that at least one field is provided
        if x is None and y is None and layer is None and attributes is None:
            return jsonify({"success": False, "message": "At least one field must be provided"}), 400
        
        geometry_service = get_geometry_service()
        
        # Convert x and y to float if they are not None
        x_float = None
        y_float = None
        if x is not None:
            try:
                x_float = float(x)
            except (ValueError, TypeError):
                return jsonify({"success": False, "message": f"Invalid x coordinate: {x}"}), 400
        
        if y is not None:
            try:
                y_float = float(y)
            except (ValueError, TypeError):
                return jsonify({"success": False, "message": f"Invalid y coordinate: {y}"}), 400
        
        result = geometry_service.update_point(
            session_id,
            point_id,
            x=x_float,
            y=y_float,
            layer=layer,
            attributes=attributes
        )
        
        current_app.logger.info(f"Point {point_id} updated successfully, new version: {result['version']}")
        
        return jsonify({
            "success": True,
            "version": result["version"]
        }), 200
    except (ValueError, TypeError) as e:
        return jsonify({"success": False, "message": f"Invalid data: {e}"}), 400
    except SessionNotFoundError as e:
        return jsonify({"success": False, "message": str(e)}), 404
    except GeometryNotFoundError as e:
        return jsonify({"success": False, "message": str(e)}), 404
    except GeometryError as e:
        return jsonify({"success": False, "message": str(e)}), 400
    except Exception as e:
        current_app.logger.error(f"Error updating point: {e}", exc_info=True)
        return jsonify({"success": False, "message": "Internal server error"}), 500


@geometry_bp.post("/api/geometry/<int:session_id>/segment")
def add_segment(session_id: int):
    """Add a line segment to the geometry."""
    try:
        data = request.json or {}
        start_x = float(data.get("startX", 0))
        start_y = float(data.get("startY", 0))
        end_x = float(data.get("endX", 0))
        end_y = float(data.get("endY", 0))
        attributes = data.get("attributes")
        
        geometry_service = get_geometry_service()
        result = geometry_service.add_segment(
            session_id, start_x, start_y, end_x, end_y, attributes
        )
        
        return jsonify({
            "success": True,
            "version": result["version"],
            "segment": result["segments"][-1] if result.get("segments") else None
        }), 200
    except (ValueError, TypeError) as e:
        return jsonify({"success": False, "message": f"Invalid coordinates: {e}"}), 400
    except SessionNotFoundError as e:
        return jsonify({"success": False, "message": str(e)}), 404
    except GeometryError as e:
        return jsonify({"success": False, "message": str(e)}), 400
    except Exception as e:
        current_app.logger.error(f"Error adding segment: {e}", exc_info=True)
        return jsonify({"success": False, "message": "Internal server error"}), 500


@geometry_bp.put("/api/geometry/<int:session_id>/segment/<segment_id>")
def update_segment(session_id: int, segment_id: str):
    """Update a segment in the geometry."""
    try:
        data = request.json or {}
        current_app.logger.info(f"Updating segment {segment_id} in session {session_id} with data: {data}")
        
        start_x = data.get("startX")
        start_y = data.get("startY")
        end_x = data.get("endX")
        end_y = data.get("endY")
        layer = data.get("layer")
        attributes = data.get("attributes")
        
        # Validate that coordinates are provided
        if start_x is None or start_y is None or end_x is None or end_y is None:
            return jsonify({"success": False, "message": "All coordinates must be provided"}), 400
        
        geometry_service = get_geometry_service()
        
        # Convert to float
        try:
            start_x_float = float(start_x)
            start_y_float = float(start_y)
            end_x_float = float(end_x)
            end_y_float = float(end_y)
        except (ValueError, TypeError) as e:
            return jsonify({"success": False, "message": f"Invalid coordinates: {e}"}), 400
        
        result = geometry_service.update_segment(
            session_id,
            segment_id,
            start_x=start_x_float,
            start_y=start_y_float,
            end_x=end_x_float,
            end_y=end_y_float,
            layer=layer,
            attributes=attributes
        )
        
        current_app.logger.info(f"Segment {segment_id} updated successfully, new version: {result['version']}")
        
        return jsonify({
            "success": True,
            "version": result["version"]
        }), 200
    except (ValueError, TypeError) as e:
        return jsonify({"success": False, "message": f"Invalid data: {e}"}), 400
    except SessionNotFoundError as e:
        return jsonify({"success": False, "message": str(e)}), 404
    except GeometryNotFoundError as e:
        return jsonify({"success": False, "message": str(e)}), 404
    except GeometryError as e:
        return jsonify({"success": False, "message": str(e)}), 400
    except Exception as e:
        current_app.logger.error(f"Error updating segment: {e}", exc_info=True)
        return jsonify({"success": False, "message": "Internal server error"}), 500


@geometry_bp.post("/api/geometry/<int:session_id>/undo")
def undo_action(session_id: int):
    """Undo last action."""
    try:
        geometry_service = get_geometry_service()
        result = geometry_service.undo(session_id)
        
        return jsonify({
            "success": True,
            "version": result["version"]
        }), 200
    except GeometryError as e:
        return jsonify({"success": False, "message": str(e)}), 400
    except GeometryNotFoundError as e:
        return jsonify({"success": False, "message": str(e)}), 404
    except Exception as e:
        current_app.logger.error(f"Error undoing action: {e}", exc_info=True)
        return jsonify({"success": False, "message": "Internal server error"}), 500

