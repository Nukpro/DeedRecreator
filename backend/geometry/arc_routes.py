"""
API routes for arc segment operations.

Arc helpers:
- from-three-points: create/update arc by three points on the arc
- by-tan-radius-rotation: create arc by tangent, radius, rotation and length/delta
"""

from typing import cast

from flask import request, jsonify, current_app

from backend.geometry import geometry_bp
from backend.app.container import get_geometry_service
from backend.geometry.service import GeometryError, GeometryNotFoundError
from backend.geometry.arc import ArcSegment
from backend.geometry.vectors import Site
from backend.services.site_session_service import SiteSessionNotFoundError


def register_arc_routes(bp):
    """Register arc routes on the given blueprint."""

    @bp.post("/api/geometry/<int:site_session_id>/arc/from-three-points")
    def add_arc_from_three_points(site_session_id: int):
        """Create an arc from three points (pt1, pt2 on arc, pt3)."""
        try:
            data = request.json or {}
            pt1 = data.get("pt1")
            pt2 = data.get("pt2")
            pt3 = data.get("pt3")
            attributes = data.get("attributes")
            if not pt1 or not pt2 or not pt3:
                return jsonify({"success": False, "message": "pt1, pt2, and pt3 are required"}), 400
            try:
                arc = ArcSegment.create_from_three_points(
                    pt1={"x": float(pt1.get("x", 0)), "y": float(pt1.get("y", 0))},
                    pt2={"x": float(pt2.get("x", 0)), "y": float(pt2.get("y", 0))},
                    pt3={"x": float(pt3.get("x", 0)), "y": float(pt3.get("y", 0))},
                    attributes=attributes or {},
                )
            except ValueError as e:
                return jsonify({"success": False, "message": str(e)}), 400
            geometry_service = get_geometry_service()
            site = geometry_service.add_arc(site_session_id, arc, attributes)
            segments = site.get_all_segments()
            last_segment = segments[-1].to_frontend_json() if segments else None
            return jsonify({
                "success": True,
                "version": site.version,
                "arc": last_segment,
            }), 200
        except SiteSessionNotFoundError as e:
            return jsonify({"success": False, "message": str(e)}), 404
        except GeometryError as e:
            return jsonify({"success": False, "message": str(e)}), 400
        except Exception as e:
            current_app.logger.error(f"Error adding arc from three points: {e}", exc_info=True)
            return jsonify({"success": False, "message": f"Internal server error: {str(e)}"}), 500

    @bp.put("/api/geometry/<int:site_session_id>/arc/<segment_id>/from-three-points")
    def update_arc_from_three_points(site_session_id: int, segment_id: str):
        """
        Update an existing arc by redefining it through three points.

        The three points (pt1, pt2, pt3) lie on the arc; pt1 is the new start,
        pt3 is the new end, and pt2 is a point on the arc between them.
        The existing arc's ID, layer and attributes are preserved.
        """
        try:
            data = request.json or {}
            pt1 = data.get("pt1")
            pt2 = data.get("pt2")
            pt3 = data.get("pt3")
            new_attributes = data.get("attributes") or {}

            if not pt1 or not pt2 or not pt3:
                return jsonify({"success": False, "message": "pt1, pt2, and pt3 are required"}), 400

            geometry_service = get_geometry_service()
            site = cast(Site, geometry_service.load_current_geometry(site_session_id, as_site=True))

            segment = site.get_segment_by_id(segment_id)
            if not segment:
                return jsonify({"success": False, "message": f"Segment with id {segment_id} not found"}), 404

            if not isinstance(segment, ArcSegment):
                return jsonify({
                    "success": False,
                    "message": f"Segment {segment_id} is not an arc segment",
                }), 400

            # Preserve layer and merge attributes from the existing arc and request body
            merged_attributes = segment.attributes
            merged_attributes.update(new_attributes)

            try:
                new_arc = ArcSegment.create_from_three_points(
                    pt1={"x": float(pt1.get("x", 0)), "y": float(pt1.get("y", 0))},
                    pt2={"x": float(pt2.get("x", 0)), "y": float(pt2.get("y", 0))},
                    pt3={"x": float(pt3.get("x", 0)), "y": float(pt3.get("y", 0))},
                    layer=segment.layer,
                    attributes=merged_attributes,
                )
            except ValueError as e:
                return jsonify({"success": False, "message": str(e)}), 400

            # Keep the same ID so frontend references remain valid
            new_arc.id = segment.id

            # Replace the old arc segment inside its geometry container
            replaced = False
            for layer in site.geometry_layers:
                for parcel in layer.parcels:
                    if parcel.geometry and parcel.geometry.get_segment(segment_id):
                        parcel.geometry.remove_segment(segment_id)
                        parcel.geometry.add_segment(new_arc)
                        replaced = True
                        break
                if replaced:
                    break

            if not replaced:
                return jsonify({
                    "success": False,
                    "message": f"Failed to replace arc segment {segment_id} in geometry",
                }), 500

            result = geometry_service.save_geometry(
                site_session_id, site, action="update_arc_from_three_points"
            )
            if isinstance(result, Site):
                site = result
            else:
                site = cast(Site, geometry_service.load_current_geometry(site_session_id, as_site=True))

            # Find the updated arc for frontend payload
            updated_arc_json = None
            for seg in site.get_all_segments():
                if seg.id == segment_id:
                    updated_arc_json = seg.to_frontend_json()
                    break

            return jsonify({
                "success": True,
                "version": site.version,
                "arc": updated_arc_json,
            }), 200
        except SiteSessionNotFoundError as e:
            return jsonify({"success": False, "message": str(e)}), 404
        except GeometryError as e:
            return jsonify({"success": False, "message": str(e)}), 400
        except GeometryNotFoundError as e:
            return jsonify({"success": False, "message": str(e)}), 404
        except Exception as e:
            current_app.logger.error(f"Error updating arc from three points: {e}", exc_info=True)
            return jsonify({"success": False, "message": f"Internal server error: {str(e)}"}), 500

    @bp.post("/api/geometry/<int:site_session_id>/arc/by-tan-radius-rotation")
    def add_arc_by_tan_radius_rotation(site_session_id: int):
        """
        Create an arc from start point, tangent at start, radius and rotation.
        Body: pt1 {x, y}, tang (degrees), radius, rotation ("cw"|"ccw"),
        exactly one of length or delta, optional attributes.
        """
        try:
            data = request.json or {}
            pt1 = data.get("pt1")
            tang = data.get("tang")
            radius = data.get("radius")
            rotation = data.get("rotation")
            length = data.get("length")
            delta = data.get("delta")
            attributes = data.get("attributes")
            if not pt1 or tang is None or radius is None or rotation is None:
                return jsonify({
                    "success": False,
                    "message": "pt1, tang, radius, and rotation are required",
                }), 400
            if (length is not None and delta is not None) or (length is None and delta is None):
                return jsonify({
                    "success": False,
                    "message": "Exactly one of 'length' or 'delta' must be provided",
                }), 400
            if rotation not in ("cw", "ccw"):
                return jsonify({
                    "success": False,
                    "message": "rotation must be 'cw' or 'ccw'",
                }), 400
            try:
                arc = ArcSegment.create_by_tan_radius_rotation_and_length_or_delta(
                    pt1={"x": float(pt1.get("x", 0)), "y": float(pt1.get("y", 0))},
                    tang=float(tang),
                    radius=float(radius),
                    rotation=rotation,
                    length=float(length) if length is not None else None,
                    delta=float(delta) if delta is not None else None,
                    attributes=attributes or {},
                )
            except ValueError as e:
                return jsonify({"success": False, "message": str(e)}), 400
            geometry_service = get_geometry_service()
            site = geometry_service.add_arc(site_session_id, arc, attributes)
            segments = site.get_all_segments()
            last_segment = segments[-1].to_frontend_json() if segments else None
            return jsonify({
                "success": True,
                "version": site.version,
                "arc": last_segment,
            }), 200
        except SiteSessionNotFoundError as e:
            return jsonify({"success": False, "message": str(e)}), 404
        except GeometryError as e:
            return jsonify({"success": False, "message": str(e)}), 400
        except Exception as e:
            current_app.logger.error(
                f"Error adding arc by tan/radius/rotation: {e}", exc_info=True
            )
            return jsonify({"success": False, "message": f"Internal server error: {str(e)}"}), 500

