from __future__ import annotations

import io
from typing import Final

try:
    from PIL import Image  # type: ignore
except ImportError:  # pragma: no cover
    Image = None  # type: ignore[assignment]

DEFAULT_PNG_COLORS: Final[int] = 256


def encode_png(image: "Image.Image", dpi: int) -> bytes:
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
            method=Image.MEDIANCUT,
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

