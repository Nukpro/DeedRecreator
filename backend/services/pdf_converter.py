from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Final

try:  # pragma: no cover
    import pypdfium2 as pdfium  # type: ignore
except ImportError:  # pragma: no cover
    pdfium = None  # type: ignore[assignment]

try:
    from PIL import Image  # type: ignore
except ImportError:  # pragma: no cover
    Image = None  # type: ignore[assignment]

from backend.services.image_utils import encode_png

PNG_EXPORT_DPI: Final[int] = 300


class PDFConversionError(Exception):
    """Raised when a PDF image cannot be converted to PNG."""


@dataclass(frozen=True)
class PDFConversionResult:
    """Represents the outcome of a PDF to PNG conversion."""

    png_bytes: bytes
    had_multiple_pages: bool
    pixel_width: int
    pixel_height: int
    page_bbox: tuple[float, float, float, float]


def pdf_to_png(raw_bytes: bytes, dpi: int = PNG_EXPORT_DPI) -> PDFConversionResult:
    """Convert the first page of a PDF to PNG bytes."""
    if pdfium is not None:
        return _pdfium_to_png(raw_bytes, dpi)

    if Image is None:
        raise PDFConversionError(
            "Missing PDF renderer. Install pypdfium2 or ensure Pillow has PDF support."
        )

    try:
        with Image.open(io.BytesIO(raw_bytes)) as pdf_image:
            total_frames = getattr(pdf_image, "n_frames", 1)
            pdf_image.seek(0)
            pixel_width, pixel_height = pdf_image.size
            png_bytes = encode_png(pdf_image, dpi)
            width_points = float(pixel_width) * 72.0 / float(dpi)
            height_points = float(pixel_height) * 72.0 / float(dpi)
            page_bbox = (0.0, 0.0, width_points, height_points)

            return PDFConversionResult(
                png_bytes=png_bytes,
                had_multiple_pages=total_frames > 1,
                pixel_width=pixel_width,
                pixel_height=pixel_height,
                page_bbox=page_bbox,
            )
    except (OSError, ValueError) as exc:
        raise PDFConversionError(
            "Unable to convert PDF to PNG. Ensure Ghostscript is installed or add pypdfium2."
        ) from exc


def _pdfium_to_png(raw_bytes: bytes, dpi: int) -> PDFConversionResult:
    if pdfium is None:
        raise PDFConversionError("PDFium backend is not available.")

    try:
        with io.BytesIO(raw_bytes) as buffer:
            pdf = pdfium.PdfDocument(buffer)
            if len(pdf) == 0:
                raise PDFConversionError("Provided PDF has no pages.")

            page = pdf[0]
            scale = dpi / 72.0
            bitmap = page.render(scale=scale)
            pil_image = bitmap.to_pil()
            pixel_width, pixel_height = pil_image.size
            png_bytes = encode_png(pil_image, dpi)
            had_multiple_pages = len(pdf) > 1
            bbox = page.get_bbox()
            page_bbox = (
                float(getattr(bbox, "left", 0.0)),
                float(getattr(bbox, "bottom", 0.0)),
                float(getattr(bbox, "right", pixel_width)),
                float(getattr(bbox, "top", pixel_height)),
            )
            pil_image.close()
            bitmap.close()
            page.close()
            pdf.close()

            return PDFConversionResult(
                png_bytes=png_bytes,
                had_multiple_pages=had_multiple_pages,
                pixel_width=pixel_width,
                pixel_height=pixel_height,
                page_bbox=page_bbox,
            )
    except (pdfium.PdfiumError, ValueError) as exc:  # type: ignore[attr-defined]
        raise PDFConversionError("PDFium failed to rasterize the document.") from exc

