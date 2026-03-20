from __future__ import annotations

import io
import json
import math
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Final, Optional, Tuple, TYPE_CHECKING

from backend.services.coord_transform_matrix import CoordTransformMaatrix

try:
    from PIL import Image  # type: ignore[import]
except ImportError:  # pragma: no cover
    Image = None  # type: ignore[assignment]

if TYPE_CHECKING:
    from PIL import Image as PILImage

DEFAULT_PNG_COLORS: Final[int] = 256


class ProcessedImage:
    """
    Image and its processing: paths, alignment, coordinate transforms, encoding.
    Created at session activation with image path and alignment file path.
    """

    def __init__(
        self,
        image_path: Path,
        alignment_path: Optional[Path] = None,
    ) -> None:
        self._image_path = Path(image_path)
        self._alignment_path = Path(alignment_path) if alignment_path is not None else (
            self._image_path.parent / f"{self._image_path.stem}.alignment.json"
        )
        self._alignment_data: Optional[Dict[str, Any]] = None

    @property
    def image_path(self) -> Path:
        return self._image_path

    @property
    def alignment_path(self) -> Path:
        return self._alignment_path

    # --- Static helpers (used when no instance exists, e.g. document save) ---

    @staticmethod
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

    @staticmethod
    def default_boundary_box(width: int, height: int) -> Dict[str, float]:
        """Create default boundary box for image dimensions."""
        return {
            "minX": 0.0,
            "minY": 0.0,
            "maxX": float(width),
            "maxY": float(height),
        }

    @staticmethod
    def save_alignment_to_path(alignment_data: Dict[str, Any], file_path: Path) -> None:
        """Save alignment data to JSON file."""
        file_path.parent.mkdir(parents=True, exist_ok=True)
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(alignment_data, f, indent=2, ensure_ascii=False)

    # --- Matrix processing

    def create_matrix_from_client_request(self, **kwargs) -> None:
        self.align_matrix = CoordTransformMaatrix(**kwargs)

    def create_matrix_from_stored_coefs(self, **kwargs) -> None:
        self.align_matrix = CoordTransformMaatrix(**kwargs)
    
    
    # --- Alignment load/save/validate ---

    def load_alignment(self) -> Dict[str, Any]:
        """
        Load alignment data from the alignment file.
        Raises FileNotFoundError if file doesn't exist.
        """
        if not self._alignment_path.exists():
            raise FileNotFoundError(f"Alignment file not found: {self._alignment_path}")

        with open(self._alignment_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        self._alignment_data = data
        return data

    def save_alignment(self, alignment_data: Dict[str, Any]) -> None:
        """Save alignment data to the alignment file."""
        self._alignment_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self._alignment_path, "w", encoding="utf-8") as f:
            json.dump(alignment_data, f, indent=2, ensure_ascii=False)
        self._alignment_data = alignment_data

    def validate_alignment(self, data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
        """
        Validate alignment JSON structure.
        Returns: (is_valid, error_message)
        """
        required_fields = ["version", "image_filename", "boundary_box", "rotation"]

        for field in required_fields:
            if field not in data:
                return False, f"Missing required field: {field}"

        bbox = data["boundary_box"]
        if not all(k in bbox for k in ["minX", "minY", "maxX", "maxY"]):
            return False, "Invalid boundary_box structure"

        if bbox["minX"] >= bbox["maxX"] or bbox["minY"] >= bbox["maxY"]:
            return False, "Invalid boundary_box values (min >= max)"

        rot = data["rotation"]
        if not isinstance(rot.get("angle"), (int, float)):
            return False, "rotation.angle must be a number"

        if "center" not in rot or not isinstance(rot["center"], dict):
            return False, "rotation.center must be an object"

        if not all(k in rot["center"] for k in ["x", "y"]):
            return False, "rotation.center must have x and y"

        if data.get("base_point") is not None:
            bp = data["base_point"]
            if not all(k in bp for k in ["image_coords", "world_coords"]):
                return False, "base_point must have image_coords and world_coords"

            if len(bp["image_coords"]) != 2 or len(bp["world_coords"]) != 2:
                return False, "base_point coordinates must be arrays of length 2"

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

        if "scale_factor" in data:
            if not isinstance(data["scale_factor"], (int, float)):
                return False, "scale_factor must be a number"

        return True, None

    def _get_image_size(self) -> Tuple[int, int]:
        """Get (width, height) from alignment data or from image file."""
        if self._alignment_data and "image_size" in self._alignment_data:
            w = self._alignment_data["image_size"].get("width")
            h = self._alignment_data["image_size"].get("height")
            if w is not None and h is not None:
                return int(w), int(h)
        if self._image_path.exists() and Image is not None:
            with Image.open(self._image_path) as img:
                return img.width, img.height
        return 1000, 1000

    def _get_boundary_box(self) -> Dict[str, float]:
        """Get boundary box from alignment data or default from image size."""
        if self._alignment_data and "boundary_box" in self._alignment_data:
            return self._alignment_data["boundary_box"]
        width, height = self._get_image_size()
        return self.default_boundary_box(width, height)

    # --- Coordinate transforms ---

    def image_coords_to_world_coords(
        self,
        image_x: float,
        image_y: float,
        boundary_box: Optional[Dict[str, float]] = None,
        image_width: Optional[int] = None,
        image_height: Optional[int] = None,
    ) -> Tuple[float, float]:
        """
        Convert image pixel coordinates to world coordinates.
        Image coords: (0,0) at top-left, Y increases downward.
        World coords: (minX, minY) at bottom-left, Y increases upward.
        """
        bbox = boundary_box if boundary_box is not None else self._get_boundary_box()
        w = image_width if image_width is not None else self._get_image_size()[0]
        h = image_height if image_height is not None else self._get_image_size()[1]
        world_x = bbox["minX"] + (image_x / w) * (bbox["maxX"] - bbox["minX"])
        world_y = bbox["maxY"] - (image_y / h) * (bbox["maxY"] - bbox["minY"])
        return (world_x, world_y)

    def world_coords_to_image_coords(
        self,
        world_x: float,
        world_y: float,
        boundary_box: Optional[Dict[str, float]] = None,
        image_width: Optional[int] = None,
        image_height: Optional[int] = None,
    ) -> Tuple[float, float]:
        """
        Convert world coordinates to image pixel coordinates.
        Inverse of image_coords_to_world_coords.
        """
        bbox = boundary_box if boundary_box is not None else self._get_boundary_box()
        w = image_width if image_width is not None else self._get_image_size()[0]
        h = image_height if image_height is not None else self._get_image_size()[1]
        if bbox["maxX"] == bbox["minX"]:
            image_x = 0.0
        else:
            image_x = (
                (world_x - bbox["minX"])
                / (bbox["maxX"] - bbox["minX"])
            ) * w
        if bbox["maxY"] == bbox["minY"]:
            image_y = 0.0
        else:
            image_y = (
                (bbox["maxY"] - world_y)
                / (bbox["maxY"] - bbox["minY"])
            ) * h
        return (image_x, image_y)

    # --- Rotation / reference line ---

    def calculate_rotation_from_reference_line(
        self,
        start_pt_image: Tuple[float, float],
        end_pt_image: Tuple[float, float],
        stated_distance: float,
        stated_quadrant: str,
        stated_bearing: float,
        boundary_box: Optional[Dict[str, float]] = None,
        image_width: Optional[int] = None,
        image_height: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Calculate rotation angle and center from reference line.
        Returns: {"angle": <float>, "center": {"x": <float>, "y": <float>}} (world coords).
        """
        bbox = boundary_box if boundary_box is not None else self._get_boundary_box()
        w = image_width if image_width is not None else self._get_image_size()[0]
        h = image_height if image_height is not None else self._get_image_size()[1]

        dx_image = end_pt_image[0] - start_pt_image[0]
        dy_image = end_pt_image[1] - start_pt_image[1]

        image_angle_rad = math.atan2(dy_image, dx_image)
        image_angle_deg = math.degrees(image_angle_rad)

        math_angle = -image_angle_deg
        if math_angle < 0:
            math_angle += 360

        image_azimuth = (90 - math_angle) % 360
        if image_azimuth < 0:
            image_azimuth += 360

        quadrant_offsets = {
            "NE": 0,
            "SE": 90,
            "SW": 180,
            "NW": 270,
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

        target_azimuth = target_azimuth % 360
        if target_azimuth < 0:
            target_azimuth += 360

        rotation_angle = target_azimuth - image_azimuth
        if rotation_angle > 180:
            rotation_angle -= 360
        elif rotation_angle < -180:
            rotation_angle += 360

        midpoint_image_x = (start_pt_image[0] + end_pt_image[0]) / 2
        midpoint_image_y = (start_pt_image[1] + end_pt_image[1]) / 2

        center_world_x, center_world_y = self.image_coords_to_world_coords(
            midpoint_image_x, midpoint_image_y,
            boundary_box=bbox, image_width=w, image_height=h,
        )

        return {
            "angle": rotation_angle,
            "center": {"x": center_world_x, "y": center_world_y},
        }

    @staticmethod
    def calculate_rotated_boundary_box(
        original_boundary_box: Dict[str, float],
        rotation_angle: float,
        rotation_center: Dict[str, float],
    ) -> Dict[str, float]:
        """
        Calculate new boundary box after rotation.
        """
        corners = [
            (original_boundary_box["minX"], original_boundary_box["minY"]),
            (original_boundary_box["maxX"], original_boundary_box["minY"]),
            (original_boundary_box["maxX"], original_boundary_box["maxY"]),
            (original_boundary_box["minX"], original_boundary_box["maxY"]),
        ]

        angle_rad = math.radians(rotation_angle)
        cos_a = math.cos(angle_rad)
        sin_a = math.sin(angle_rad)
        cx = rotation_center["x"]
        cy = rotation_center["y"]

        rotated_corners = []
        for x, y in corners:
            dx = x - cx
            dy = y - cy
            rx = dx * cos_a - dy * sin_a
            ry = dx * sin_a + dy * cos_a
            rotated_corners.append((rx + cx, ry + cy))

        xs = [x for x, y in rotated_corners]
        ys = [y for x, y in rotated_corners]

        return {
            "minX": min(xs),
            "minY": min(ys),
            "maxX": max(xs),
            "maxY": max(ys),
        }

    def recalculate_alignment(
        self,
        alignment_data: Dict[str, Any],
        base_point: Optional[Dict[str, Any]],
        reference_line: Optional[Dict[str, Any]],
        image_width: Optional[int] = None,
        image_height: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Recalculate alignment from base_point and reference_line.
        Returns updated alignment data.
        """
        updated_data = alignment_data.copy()

        w = image_width if image_width is not None else self._get_image_size()[0]
        h = image_height if image_height is not None else self._get_image_size()[1]

        if "image_size" not in updated_data:
            updated_data["image_size"] = {"width": float(w), "height": float(h)}
        if "scale_factor" not in updated_data:
            updated_data["scale_factor"] = 1.0

        if base_point is not None:
            updated_data["base_point"] = base_point

        if reference_line is not None:
            updated_data["reference_line"] = reference_line

            rotation_result = self.calculate_rotation_from_reference_line(
                tuple(reference_line["start_pt_image_coords"]),
                tuple(reference_line["end_pt_image_coords"]),
                reference_line["stated_distance"],
                reference_line["stated_quadrant"],
                reference_line["stated_bearing"],
                updated_data["boundary_box"],
                w,
                h,
            )

            old_angle = updated_data.get("rotation", {}).get("angle", 0.0)
            new_angle = rotation_result["angle"]

            updated_data["rotation"] = {
                "angle": new_angle,
                "center": rotation_result["center"],
            }

            if abs(old_angle - new_angle) > 0.001:
                updated_data["boundary_box"] = self.calculate_rotated_boundary_box(
                    updated_data["boundary_box"],
                    new_angle,
                    rotation_result["center"],
                )

        updated_data["updated_at"] = datetime.now().isoformat()
        return updated_data

    def build_alignment(self) -> None:
        """Placeholder: build alignment from API / matrix (CoordTransformMatrix)."""
        pass

    def store_matrix(self) -> None:
        """Placeholder: persist matrix (e.g. to alignment or separate file)."""
        pass
