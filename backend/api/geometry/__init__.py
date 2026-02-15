"""
Re-export of geometry blueprint from backend.geometry.

This module exists for backward compatibility. Prefer:
  from backend.geometry import geometry_bp
"""

from backend.geometry import geometry_bp

__all__ = ["geometry_bp"]