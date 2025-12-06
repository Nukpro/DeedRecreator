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
        
        # result is now a Site object
        from backend.domain.vectors import Site
        if isinstance(result, Site):
            site = result
        else:
            # Backward compatibility: result is dict, load as Site
            site = geometry_service.load_current_geometry(session_id, as_site=True)
        
        # Get the last added point
        points = site.points
        last_point = points[-1].to_frontend_json() if points else None
        
        return jsonify({
            "success": True,
            "version": site.version,
            "point": last_point
        }), 200
    except (ValueError, TypeError) as e:
        return jsonify({"success": False, "message": f"Invalid coordinates: {e}"}), 400
    except SessionNotFoundError as e:
        return jsonify({"success": False, "message": str(e)}), 404
    except GeometryError as e:
        return jsonify({"success": False, "message": str(e)}), 400
    except Exception as e:
        current_app.logger.error(f"Error adding point: {e}", exc_info=True)
        import traceback
        current_app.logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"success": False, "message": f"Internal server error: {str(e)}"}), 500


@geometry_bp.get("/api/geometry/<int:session_id>")
def get_geometry(session_id: int):
    """Get current geometry state for a session."""
    try:
        geometry_service = get_geometry_service()
        site = geometry_service.load_current_geometry(session_id, as_site=True)
        
        # Ensure session_id is set for proper frontend JSON conversion
        if site.session_id is None:
            site.session_id = session_id
        
        # Convert to frontend JSON format
        frontend_json = site.to_frontend_json()
        
        # Ensure we have points and segments arrays even if empty
        if 'points' not in frontend_json:
            frontend_json['points'] = []
        if 'segments' not in frontend_json:
            frontend_json['segments'] = []
        
        return jsonify(frontend_json), 200
    except SessionNotFoundError as e:
        return jsonify({"message": str(e)}), 404
    except GeometryError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.error(f"Error loading geometry: {e}", exc_info=True)
        import traceback
        current_app.logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"message": f"Internal server error: {str(e)}"}), 500


@geometry_bp.post("/api/geometry/<int:session_id>/save")
def save_geometry(session_id: int):
    """Save geometry data (full state)."""
    try:
        data = request.json or {}
        
        geometry_service = get_geometry_service()
        action = data.get("action", "modify")
        
        # Convert frontend JSON to Site object if needed
        from backend.domain.vectors import Site
        if isinstance(data, dict) and ('collections' in data or 'points' in data or 'segments' in data):
            # Frontend format - convert to Site
            data['sessionId'] = session_id
            site = Site.from_frontend_json(data)
            result = geometry_service.save_geometry(session_id, site, action)
        else:
            # Storage format or backward compatibility
            result = geometry_service.save_geometry(session_id, data, action)
        
        # Get version from result
        from backend.domain.vectors import Site
        if isinstance(result, Site):
            site = result
        else:
            site = geometry_service.load_current_geometry(session_id, as_site=True)
        
        return jsonify({
            "success": True,
            "version": site.version
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
        
        # result is now a Site object
        from backend.domain.vectors import Site
        if isinstance(result, Site):
            site = result
        else:
            site = geometry_service.load_current_geometry(session_id, as_site=True)
        
        current_app.logger.info(f"Point {point_id} updated successfully, new version: {site.version}")
        
        return jsonify({
            "success": True,
            "version": site.version
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
        segment_type = data.get("segmentType", "line")
        result = geometry_service.add_segment(
            session_id, start_x, start_y, end_x, end_y, attributes, segment_type=segment_type
        )
        
        # result is now a Site object
        from backend.domain.vectors import Site
        if isinstance(result, Site):
            site = result
        else:
            site = geometry_service.load_current_geometry(session_id, as_site=True)
        
        # Get the last added segment
        segments = site.get_all_segments()
        last_segment = segments[-1].to_frontend_json() if segments else None
        
        return jsonify({
            "success": True,
            "version": site.version,
            "segment": last_segment
        }), 200
    except (ValueError, TypeError) as e:
        return jsonify({"success": False, "message": f"Invalid coordinates: {e}"}), 400
    except SessionNotFoundError as e:
        return jsonify({"success": False, "message": str(e)}), 404
    except GeometryError as e:
        return jsonify({"success": False, "message": str(e)}), 400
    except Exception as e:
        current_app.logger.error(f"Error adding segment: {e}", exc_info=True)
        import traceback
        current_app.logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"success": False, "message": f"Internal server error: {str(e)}"}), 500


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
        
        # result is now a Site object
        from backend.domain.vectors import Site
        if isinstance(result, Site):
            site = result
        else:
            site = geometry_service.load_current_geometry(session_id, as_site=True)
        
        current_app.logger.info(f"Segment {segment_id} updated successfully, new version: {site.version}")
        
        return jsonify({
            "success": True,
            "version": site.version
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


@geometry_bp.put("/api/geometry/<int:session_id>/segment/<segment_id>/recalculate")
def recalculate_segment(session_id: int, segment_id: str):
    """Recalculate a line segment using bearing and distance."""
    try:
        data = request.json or {}
        current_app.logger.info(f"Recalculating segment {segment_id} in session {session_id} with data: {data}")
        
        # Extract and validate required parameters
        quadrant = data.get("quadrant")
        bearing = data.get("bearing")
        distance = data.get("distance")
        blocked_point = data.get("blockedPoint", "start_pt")
        
        # Validate required fields
        if quadrant is None:
            return jsonify({"success": False, "message": "quadrant is required"}), 400
        if bearing is None:
            return jsonify({"success": False, "message": "bearing is required"}), 400
        if distance is None:
            return jsonify({"success": False, "message": "distance is required"}), 400
        
        # Validate quadrant
        if quadrant not in ["NE", "NW", "SW", "SE"]:
            return jsonify({"success": False, "message": f"Invalid quadrant: {quadrant}. Must be NE, NW, SW, or SE"}), 400
        
        # Validate bearing range (0-90)
        try:
            bearing_float = float(bearing)
            if bearing_float < 0 or bearing_float > 90:
                return jsonify({"success": False, "message": f"Bearing must be in range 0-90 degrees, got {bearing_float}"}), 400
        except (ValueError, TypeError):
            return jsonify({"success": False, "message": f"Invalid bearing: {bearing}"}), 400
        
        # Validate distance (> 0)
        try:
            distance_float = float(distance)
            if distance_float <= 0:
                return jsonify({"success": False, "message": f"Distance must be greater than 0, got {distance_float}"}), 400
        except (ValueError, TypeError):
            return jsonify({"success": False, "message": f"Invalid distance: {distance}"}), 400
        
        # Validate blocked_point
        if blocked_point not in ["start_pt", "end_pt"]:
            return jsonify({"success": False, "message": f"blockedPoint must be 'start_pt' or 'end_pt', got {blocked_point}"}), 400
        
        geometry_service = get_geometry_service()
        
        # Load current geometry
        site = geometry_service.load_current_geometry(session_id, as_site=True)
        
        # Find segment
        segment = site.get_segment_by_id(segment_id)
        if not segment:
            return jsonify({"success": False, "message": f"Segment with id {segment_id} not found"}), 404
        
        # Check if it's a LineSegment
        from backend.domain.vectors import LineSegment
        if not isinstance(segment, LineSegment):
            return jsonify({"success": False, "message": f"Segment {segment_id} is not a line segment"}), 400
        
        # Call the recalculation method
        segment.recalculate_by_bearing_and_distance(
            quadrant=quadrant,
            bearing=bearing_float,
            distance=distance_float,
            blocked_point=blocked_point
        )
        
        # Save with versioning
        result = geometry_service.save_geometry(session_id, site, action="recalculate_segment")
        
        # result is now a Site object
        from backend.domain.vectors import Site
        if isinstance(result, Site):
            site = result
        else:
            site = geometry_service.load_current_geometry(session_id, as_site=True)
        
        current_app.logger.info(f"Segment {segment_id} recalculated successfully, new version: {site.version}")
        
        return jsonify({
            "success": True,
            "version": site.version
        }), 200
    except ValueError as e:
        return jsonify({"success": False, "message": str(e)}), 400
    except SessionNotFoundError as e:
        return jsonify({"success": False, "message": str(e)}), 404
    except GeometryNotFoundError as e:
        return jsonify({"success": False, "message": str(e)}), 404
    except GeometryError as e:
        return jsonify({"success": False, "message": str(e)}), 400
    except Exception as e:
        current_app.logger.error(f"Error recalculating segment: {e}", exc_info=True)
        error_msg = f"Internal server error: {str(e)}"
        current_app.logger.error(f"Error type: {type(e).__name__}")
        return jsonify({"success": False, "message": error_msg}), 500


@geometry_bp.post("/api/geometry/<int:session_id>/undo")
def undo_action(session_id: int):
    """Undo last action."""
    try:
        geometry_service = get_geometry_service()
        result = geometry_service.undo(session_id, as_site=False)
        
        # result is JSON dict
        version = result.get("version", 0) if isinstance(result, dict) else result.version
        
        return jsonify({
            "success": True,
            "version": version
        }), 200
    except GeometryError as e:
        return jsonify({"success": False, "message": str(e)}), 400
    except GeometryNotFoundError as e:
        return jsonify({"success": False, "message": str(e)}), 404
    except Exception as e:
        current_app.logger.error(f"Error undoing action: {e}", exc_info=True)
        return jsonify({"success": False, "message": "Internal server error"}), 500


@geometry_bp.delete("/api/geometry/<int:session_id>/<object_type>/<object_id>")
def delete_object(session_id: int, object_type: str, object_id: str):
    """Delete an object (point, segment, parcel, layer) from the geometry."""
    try:
        geometry_service = get_geometry_service()
        result = geometry_service.delete_object(session_id, object_type, object_id)
        
        # result is a Site object
        from backend.domain.vectors import Site
        if isinstance(result, Site):
            site = result
        else:
            site = geometry_service.load_current_geometry(session_id, as_site=True)
        
        current_app.logger.info(f"Object {object_type}/{object_id} deleted successfully, new version: {site.version}")
        
        return jsonify({
            "success": True,
            "version": site.version
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
        current_app.logger.error(f"Error deleting object: {e}", exc_info=True)
        return jsonify({"success": False, "message": "Internal server error"}), 500
