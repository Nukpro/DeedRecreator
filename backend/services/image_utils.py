from __future__ import annotations

import io
import json
import math
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Final, Optional, Tuple, TYPE_CHECKING

try:
    from PIL import Image  # type: ignore[import]
except ImportError:  # pragma: no cover
    Image = None  # type: ignore[assignment]

if TYPE_CHECKING:
    from PIL import Image as PILImage

DEFAULT_PNG_COLORS: Final[int] = 256


def encode_png(image: "PILImage.Image", dpi: int) -> bytes:
    """
    Encode a PIL image as PNG applying palette quantisation and compression tweaks.
    """
    if Image is None:
        raise RuntimeError("Pillow is required to encode PNG images.")

    processed = image

    if processed.mode not in ("RGB", "L"):
        processed = processed.convert("RGB")
    if processed.mode == "RGB":
        processed = processed.quantize(
            colors=DEFAULT_PNG_COLORS,
            method=Image.MEDIANCUT,  # type: ignore[attr-defined]
            dither=Image.Dither.NONE,
        )

    buffer = io.BytesIO()
    processed.save(
        buffer,
        format="PNG",
        optimize=True,
        compress_level=9,
        dpi=(dpi, dpi),
        bits=8,
    )
    return buffer.getvalue()


def default_boundary_box(width: int, height: int) -> Dict[str, float]:
    """Create default boundary box for image dimensions."""
    return {
        "minX": 0.0,
        "minY": 0.0,
        "maxX": float(width),
        "maxY": float(height),
    }


def image_coords_to_world_coords(
    image_x: float,
    image_y: float,
    boundary_box: Dict[str, float],
    image_width: int,
    image_height: int,
) -> Tuple[float, float]:
    """
    Convert image pixel coordinates to world coordinates.

    Image coords: (0,0) at top-left, Y increases downward
    World coords: (minX, minY) at bottom-left, Y increases upward

    Formula:
    world_x = boundary_box["minX"] + (image_x / image_width) * (boundary_box["maxX"] - boundary_box["minX"])
    world_y = boundary_box["maxY"] - (image_y / image_height) * (boundary_box["maxY"] - boundary_box["minY"])
    """
    world_x = boundary_box["minX"] + (image_x / image_width) * (
        boundary_box["maxX"] - boundary_box["minX"]
    )
    world_y = boundary_box["maxY"] - (image_y / image_height) * (
        boundary_box["maxY"] - boundary_box["minY"]
    )
    return (world_x, world_y)


def world_coords_to_image_coords(
    world_x: float,
    world_y: float,
    boundary_box: Dict[str, float],
    image_width: int,
    image_height: int,
) -> Tuple[float, float]:
    """
    Convert world coordinates to image pixel coordinates.

    Inverse of image_coords_to_world_coords.

    Formula:
    image_x = ((world_x - boundary_box["minX"]) / (boundary_box["maxX"] - boundary_box["minX"])) * image_width
    image_y = ((boundary_box["maxY"] - world_y) / (boundary_box["maxY"] - boundary_box["minY"])) * image_height
    """
    if boundary_box["maxX"] == boundary_box["minX"]:
        image_x = 0.0
    else:
        image_x = (
            (world_x - boundary_box["minX"])
            / (boundary_box["maxX"] - boundary_box["minX"])
        ) * image_width

    if boundary_box["maxY"] == boundary_box["minY"]:
        image_y = 0.0
    else:
        image_y = (
            (boundary_box["maxY"] - world_y)
            / (boundary_box["maxY"] - boundary_box["minY"])
        ) * image_height

    return (image_x, image_y)


def calculate_rotation_from_reference_line(
    start_pt_image: Tuple[float, float],
    end_pt_image: Tuple[float, float],
    stated_distance: float,
    stated_quadrant: str,
    stated_bearing: float,
    boundary_box: Dict[str, float],
    image_width: int,
    image_height: int,
) -> Dict[str, Any]:
    """
    Calculate rotation angle and center from reference line.

    Returns:
    {
        "angle": <float>,  // degrees
        "center": {"x": <float>, "y": <float>}  // world coordinates
    }
    """
    # 1. Calculate image line angle (in image coordinates, Y increases down)
    dx_image = end_pt_image[0] - start_pt_image[0]
    dy_image = end_pt_image[1] - start_pt_image[1]

    # Image angle: 0° = right, 90° = down, 180° = left, 270° = up
    image_angle_rad = math.atan2(dy_image, dx_image)
    image_angle_deg = math.degrees(image_angle_rad)

    # Convert to mathematical angle (0° = East, counterclockwise)
    # Image: 0° = right, 90° = down
    # Math: 0° = right, 90° = up
    # So: math_angle = -image_angle (or 360 - image_angle)
    math_angle = -image_angle_deg
    if math_angle < 0:
        math_angle += 360

    # Convert to azimuth (North=0°, clockwise)
    # Math: 0° = East, 90° = North
    # Azimuth: 0° = North, 90° = East
    # Formula: azimuth = (90 - math_angle) % 360
    image_azimuth = (90 - math_angle) % 360
    if image_azimuth < 0:
        image_azimuth += 360

    # 2. Convert stated bearing to target azimuth
    # Quadrant + bearing (0-90°) -> azimuth (0-360°)
    quadrant_offsets = {
        "NE": 0,  # 0-90°
        "SE": 90,  # 90-180°
        "SW": 180,  # 180-270°
        "NW": 270,  # 270-360°
    }

    base_azimuth = quadrant_offsets.get(stated_quadrant, 0)
    if stated_quadrant == "NE":
        target_azimuth = base_azimuth + stated_bearing
    elif stated_quadrant == "SE":
        target_azimuth = base_azimuth + (90 - stated_bearing)
    elif stated_quadrant == "SW":
        target_azimuth = base_azimuth + stated_bearing
    elif stated_quadrant == "NW":
        target_azimuth = base_azimuth + (90 - stated_bearing)
    else:
        target_azimuth = base_azimuth

    # Normalize to 0-360
    target_azimuth = target_azimuth % 360
    if target_azimuth < 0:
        target_azimuth += 360

    # 3. Calculate rotation angle
    rotation_angle = target_azimuth - image_azimuth

    # Normalize to -180 to +180 for shortest rotation
    if rotation_angle > 180:
        rotation_angle -= 360
    elif rotation_angle < -180:
        rotation_angle += 360

    # 4. Determine rotation center (use midpoint of reference line in world coords)
    midpoint_image_x = (start_pt_image[0] + end_pt_image[0]) / 2
    midpoint_image_y = (start_pt_image[1] + end_pt_image[1]) / 2

    center_world_x, center_world_y = image_coords_to_world_coords(
        midpoint_image_x, midpoint_image_y, boundary_box, image_width, image_height
    )

    return {
        "angle": rotation_angle,
        "center": {"x": center_world_x, "y": center_world_y},
    }


def calculate_rotated_boundary_box(
    original_boundary_box: Dict[str, float],
    rotation_angle: float,
    rotation_center: Dict[str, float],
) -> Dict[str, float]:
    """
    Calculate new boundary box after rotation.

    Algorithm:
    1. Get four corners of original boundary box in world coordinates
    2. Rotate each corner around rotation_center
    3. Find min/max of rotated corners
    4. Return new boundary box
    """
    # Get corners in world coordinates
    corners = [
        (original_boundary_box["minX"], original_boundary_box["minY"]),
        (original_boundary_box["maxX"], original_boundary_box["minY"]),
        (original_boundary_box["maxX"], original_boundary_box["maxY"]),
        (original_boundary_box["minX"], original_boundary_box["maxY"]),
    ]

    # Rotate each corner
    angle_rad = math.radians(rotation_angle)
    cos_a = math.cos(angle_rad)
    sin_a = math.sin(angle_rad)
    cx = rotation_center["x"]
    cy = rotation_center["y"]

    rotated_corners = []
    for x, y in corners:
        # Translate to origin
        dx = x - cx
        dy = y - cy
        # Rotate
        rx = dx * cos_a - dy * sin_a
        ry = dx * sin_a + dy * cos_a
        # Translate back
        rotated_corners.append((rx + cx, ry + cy))

    # Find bounds
    xs = [x for x, y in rotated_corners]
    ys = [y for x, y in rotated_corners]

    return {
        "minX": min(xs),
        "minY": min(ys),
        "maxX": max(xs),
        "maxY": max(ys),
    }


def recalculate_alignment(
    alignment_data: Dict[str, Any],
    base_point: Optional[Dict[str, Any]],
    reference_line: Optional[Dict[str, Any]],
    image_width: int,
    image_height: int,
) -> Dict[str, Any]:
    """
    Recalculate alignment.json from base_point and reference_line.

    Steps:
    1. Update base_point if provided
    2. If reference_line provided:
       - Calculate rotation from reference_line
       - Update rotation angle and center
    3. Update boundary_box if rotation changed
    4. Update updated_at timestamp
    5. Return updated alignment data
    """
    # Create a copy to avoid modifying the original
    updated_data = alignment_data.copy()

    # Preserve image_size and scale_factor if they exist
    if "image_size" not in updated_data:
        updated_data["image_size"] = {
            "width": float(image_width),
            "height": float(image_height),
        }
    if "scale_factor" not in updated_data:
        updated_data["scale_factor"] = 1.0

    # 1. Update base_point if provided
    if base_point is not None:
        updated_data["base_point"] = base_point

    # 2. If reference_line provided, calculate rotation
    if reference_line is not None:
        updated_data["reference_line"] = reference_line

        # Calculate rotation from reference line
        rotation_result = calculate_rotation_from_reference_line(
            tuple(reference_line["start_pt_image_coords"]),
            tuple(reference_line["end_pt_image_coords"]),
            reference_line["stated_distance"],
            reference_line["stated_quadrant"],
            reference_line["stated_bearing"],
            updated_data["boundary_box"],
            image_width,
            image_height,
        )

        # Update rotation
        old_angle = updated_data.get("rotation", {}).get("angle", 0.0)
        new_angle = rotation_result["angle"]

        updated_data["rotation"] = {
            "angle": new_angle,
            "center": rotation_result["center"],
        }

        # 3. Update boundary_box if rotation changed
        if abs(old_angle - new_angle) > 0.001:  # Only if rotation actually changed
            updated_data["boundary_box"] = calculate_rotated_boundary_box(
                updated_data["boundary_box"],
                new_angle,
                rotation_result["center"],
            )

    # 4. Update updated_at timestamp
    updated_data["updated_at"] = datetime.now().isoformat()

    return updated_data


def save_alignment_json(alignment_data: Dict[str, Any], file_path: Path) -> None:
    """Save alignment data to JSON file."""
    file_path.parent.mkdir(parents=True, exist_ok=True)
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(alignment_data, f, indent=2, ensure_ascii=False)


def load_alignment_json(file_path: Path) -> Dict[str, Any]:
    """
    Load alignment data from JSON file.
    
    Raises FileNotFoundError if file doesn't exist.
    Alignment.json should only be created when image is uploaded (in document_service.py).
    """
    if not file_path.exists():
        raise FileNotFoundError(f"Alignment file not found: {file_path}")

    # Load from file
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)


def validate_alignment_json(data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """
    Validate alignment JSON structure.
    Returns: (is_valid, error_message)
    """
    required_fields = ["version", "image_filename", "boundary_box", "rotation"]

    for field in required_fields:
        if field not in data:
            return False, f"Missing required field: {field}"

    # Validate boundary_box
    bbox = data["boundary_box"]
    if not all(k in bbox for k in ["minX", "minY", "maxX", "maxY"]):
        return False, "Invalid boundary_box structure"

    if bbox["minX"] >= bbox["maxX"] or bbox["minY"] >= bbox["maxY"]:
        return False, "Invalid boundary_box values (min >= max)"

    # Validate rotation
    rot = data["rotation"]
    if not isinstance(rot.get("angle"), (int, float)):
        return False, "rotation.angle must be a number"

    if "center" not in rot or not isinstance(rot["center"], dict):
        return False, "rotation.center must be an object"

    if not all(k in rot["center"] for k in ["x", "y"]):
        return False, "rotation.center must have x and y"

    # Validate base_point if present
    if data.get("base_point") is not None:
        bp = data["base_point"]
        if not all(k in bp for k in ["image_coords", "world_coords"]):
            return False, "base_point must have image_coords and world_coords"

        if len(bp["image_coords"]) != 2 or len(bp["world_coords"]) != 2:
            return False, "base_point coordinates must be arrays of length 2"

    # Validate image_size if present (optional for backward compatibility)
    if "image_size" in data:
        img_size = data["image_size"]
        if not isinstance(img_size, dict):
            return False, "image_size must be an object"
        if not all(k in img_size for k in ["width", "height"]):
            return False, "image_size must have width and height"
        if not isinstance(img_size.get("width"), (int, float)) or not isinstance(
            img_size.get("height"), (int, float)
        ):
            return False, "image_size width and height must be numbers"

    # Validate scale_factor if present (optional for backward compatibility)
    if "scale_factor" in data:
        if not isinstance(data["scale_factor"], (int, float)):
            return False, "scale_factor must be a number"

    return True, None

