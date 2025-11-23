from __future__ import annotations

import io
import uuid
from pathlib import Path
from typing import Dict, Final, Optional, Tuple

from flask import current_app
from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename

from backend.domain.documents import StoredDocument
from backend.services.image_utils import encode_png
from backend.services.pdf_converter import (
    PDFConversionError,
    PNG_EXPORT_DPI,
    pdf_to_png,
)
from backend.storage import LocalFileStorage, LocalFileStorageError
from backend.storage.protocols import FileStorageGateway

try:
    from PIL import Image  # type: ignore
except ImportError:  # pragma: no cover
    Image = None  # type: ignore[assignment]


_ALLOWED_EXTENSIONS: Final[set[str]] = {"pdf", "png", "jpg", "jpeg", "tif", "tiff"}


class DocumentStorageError(Exception):
    """Base exception raised for document storage issues."""


class UnsupportedDocumentError(DocumentStorageError):
    """Raised when an uploaded document cannot be processed."""


class DocumentService:
    """Handle persistence of uploaded documents."""

    def __init__(self, storage: FileStorageGateway, upload_root: Path) -> None:
        self._storage = storage
        resolved_root = upload_root if upload_root.is_absolute() else upload_root.resolve()
        self._upload_root = resolved_root
        # Don't create directory here - it will be created per-session when needed

    @classmethod
    def from_app_config(cls) -> "DocumentService":
        upload_dir = Path(current_app.config["UPLOAD_DIR"]).resolve()
        storage = LocalFileStorage(upload_dir)
        return cls(storage=storage, upload_root=upload_dir)

    def save_document(
        self, 
        file_storage: FileStorage, 
        session_upload_dir: Optional[Path] = None,
        session_processed_dir: Optional[Path] = None,
    ) -> StoredDocument:
        """
        Save document to storage.
        
        If session directories are provided, files are saved to session directories:
        - Original file goes to session_upload_dir
        - Processed PNG goes to session_processed_dir
        Otherwise, files are saved to default upload_root.
        """
        if not file_storage or not file_storage.filename:
            raise UnsupportedDocumentError("No document was provided.")

        original_filename = secure_filename(file_storage.filename)
        extension = self._extract_extension(original_filename)

        if extension not in _ALLOWED_EXTENSIONS:
            raise UnsupportedDocumentError("Unsupported document type.")

        base_name = uuid.uuid4().hex
        original_stored_filename = f"{base_name}.{extension}"
        
        # Determine upload and processed directories
        # Session directories are now required
        if not session_upload_dir or not session_processed_dir:
            raise DocumentStorageError("Session directories are required. session_id must be provided.")
        
        upload_dir = session_upload_dir
        processed_dir = session_processed_dir
        # Ensure directories are absolute paths
        upload_dir = upload_dir.resolve()
        processed_dir = processed_dir.resolve()
        
        # Ensure directories exist
        upload_dir.mkdir(parents=True, exist_ok=True)
        processed_dir.mkdir(parents=True, exist_ok=True)
        
        original_path = upload_dir / original_stored_filename
        target_filename = f"{base_name}.png"
        target_path = processed_dir / target_filename
        
        # Debug logging
        try:
            from flask import current_app
            current_app.logger.debug(f"Saving document - upload_dir: {upload_dir}, processed_dir: {processed_dir}")
            current_app.logger.debug(f"Original path: {original_path}, target path: {target_path}")
        except Exception:
            pass  # If not in Flask context, skip logging

        content = file_storage.read()
        if not content:
            raise DocumentStorageError("Uploaded file is empty.")

        self._write_bytes(content, original_path)

        warnings: list[str] = []
        image_width: Optional[int] = None
        image_height: Optional[int] = None
        boundary_box: Optional[dict[str, float]] = None

        if extension == "png":
            # For PNG files, save original to uploads and copy to processed_drawing
            if upload_dir != processed_dir:
                # Save original to uploads and copy to processed_drawing
                self._write_bytes(content, target_path)
            else:
                # Same directory: use same file for both
                target_path = original_path
                target_filename = original_stored_filename
            was_converted = False
            image_width, image_height = self._extract_image_dimensions(content)
        elif extension == "pdf":
            conversion = self._convert_pdf(content)
            self._write_bytes(conversion.png_bytes, target_path)
            was_converted = True
            image_width = conversion.pixel_width
            image_height = conversion.pixel_height
            boundary_box = self._bbox_tuple_to_mapping(conversion.page_bbox)

            if conversion.had_multiple_pages:
                warnings.append(
                    "PDF contains multiple pages. Only the first page was converted to PNG."
                )
        else:
            converted_bytes = self._convert_image_to_png(content)
            self._write_bytes(converted_bytes, target_path)
            was_converted = True
            image_width, image_height = self._extract_image_dimensions(converted_bytes)

        if image_width is None or image_height is None:
            image_width, image_height = self._extract_image_dimensions(
                target_path.read_bytes()
            )

        if boundary_box is None and image_width is not None and image_height is not None:
            boundary_box = self._default_boundary_box(image_width, image_height)

        # Calculate relative paths
        # Return paths relative to session directory
        session_root = session_upload_dir.parent  # Go up from uploads/ to session directory
        original_relative = original_path.relative_to(session_root).as_posix()
        stored_relative = target_path.relative_to(session_root).as_posix()

        return StoredDocument(
            original_filename=original_filename,
            original_stored_filename=original_stored_filename,
            stored_filename=target_filename,
            original_stored_relative_path=original_relative,
            stored_relative_path=stored_relative,
            was_converted=was_converted,
            warnings=warnings,
            image_width=image_width,
            image_height=image_height,
            boundary_box=boundary_box,
        )

    def _write_bytes(self, data: bytes, path: Path) -> None:
        try:
            self._storage.save_bytes(data, path)
        except LocalFileStorageError as exc:
            raise DocumentStorageError("Failed to write uploaded file.") from exc

    @staticmethod
    def _extract_extension(filename: str) -> str:
        if "." not in filename:
            return ""
        return filename.rsplit(".", 1)[1].lower()

    @staticmethod
    def _as_relative_path(path: Path) -> str:
        absolute_path = path.resolve()
        try:
            relative_path = absolute_path.relative_to(Path.cwd())
        except ValueError:
            relative_path = absolute_path
        return relative_path.as_posix()

    @staticmethod
    def _extract_image_dimensions(
        raw_data: bytes,
    ) -> Tuple[Optional[int], Optional[int]]:
        if Image is None:
            return None, None

        try:
            with Image.open(io.BytesIO(raw_data)) as image:
                return image.width, image.height
        except (OSError, ValueError):
            return None, None

    @staticmethod
    def _convert_image_to_png(raw_bytes: bytes) -> bytes:
        if Image is None:
            raise DocumentStorageError("Pillow is required to convert documents to PNG.")

        try:
            with Image.open(io.BytesIO(raw_bytes)) as image:
                return encode_png(image, PNG_EXPORT_DPI)
        except (OSError, ValueError) as error:
            raise DocumentStorageError("Failed to convert document to PNG.") from error

    @staticmethod
    def _convert_pdf(raw_bytes: bytes):
        try:
            return pdf_to_png(raw_bytes)
        except PDFConversionError as error:
            raise DocumentStorageError(str(error)) from error

    @staticmethod
    def _bbox_tuple_to_mapping(bbox: Tuple[float, float, float, float]) -> Dict[str, float]:
        left, bottom, right, top = bbox
        return {
            "minX": float(left),
            "minY": float(bottom),
            "maxX": float(right),
            "maxY": float(top),
        }

    @staticmethod
    def _default_boundary_box(width: int, height: int) -> Dict[str, float]:
        return {
            "minX": 0.0,
            "minY": 0.0,
            "maxX": float(width),
            "maxY": float(height),
        }

