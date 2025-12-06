"""
Domain models for vector geometry objects.

This module provides classes for representing geometry objects with proper
encapsulation and methods for converting to storage and frontend JSON formats.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional, Union, TYPE_CHECKING
from datetime import datetime
import uuid
import math

if TYPE_CHECKING:
    from backend.services.geometry_service import GeometryService


# ============================================================================
# Utility functions for azimuth and bearing conversion
# ============================================================================

def azimuth_to_bearing(azimuth: float) -> Dict[str, Any]:
    """
    Convert azimuth (decimal degrees, 0-360, North=0°, clockwise) to bearing.
    
    Args:
        azimuth: Azimuth in decimal degrees (0-360), where 0° is North, clockwise
        
    Returns:
        Dictionary with 'quadrant' (str) and 'bearing' (float, 0-90)
        
    Examples:
        - azimuth 0° (North) → {"quadrant": "NE", "bearing": 0.0}
        - azimuth 45° (NE) → {"quadrant": "NE", "bearing": 45.0}
        - azimuth 90° (East) → {"quadrant": "NE", "bearing": 90.0}
        - azimuth 135° (SE) → {"quadrant": "SE", "bearing": 45.0}
        - azimuth 180° (South) → {"quadrant": "SE", "bearing": 0.0}
        - azimuth 225° (SW) → {"quadrant": "SW", "bearing": 45.0}
        - azimuth 270° (West) → {"quadrant": "SW", "bearing": 0.0}
        - azimuth 315° (NW) → {"quadrant": "NW", "bearing": 45.0}
    """
    # Normalize azimuth to 0-360 range
    azimuth = azimuth % 360
    
    # Determine quadrant and calculate bearing
    if 0 <= azimuth < 90:
        # NE quadrant: Axis N is 0°, axis E is 90°
        quadrant = "NE"
        bearing = azimuth
    elif 90 <= azimuth < 180:
        # SE quadrant: Axis S is 0°, axis E is 90°
        quadrant = "SE"
        bearing = 180 - azimuth
    elif 180 <= azimuth < 270:
        # SW quadrant: Axis S is 0°, axis W is 90°
        quadrant = "SW"
        bearing = azimuth - 180
    elif 270 <= azimuth < 360:
        # NW quadrant: Axis N is 0°, axis W is 90°
        quadrant = "NW"
        bearing = 360 - azimuth
    else:
        # Should not happen due to modulo, but handle edge case
        quadrant = "NE"
        bearing = 0.0
    
    return {"quadrant": quadrant, "bearing": bearing}


def bearing_to_azimuth(quadrant: str, bearing: float) -> float:
    """
    Convert bearing (quadrant + angle) to azimuth (decimal degrees).
    
    Args:
        quadrant: Quadrant string ("NE", "NW", "SW", or "SE")
        bearing: Bearing angle in decimal degrees (0-90)
        
    Returns:
        Azimuth in decimal degrees (0-360), where 0° is North, clockwise
        
    Raises:
        ValueError: If quadrant is invalid or bearing is out of range (0-90)
    """
    if bearing < 0 or bearing > 90:
        raise ValueError(f"Bearing must be in range 0-90 degrees, got {bearing}")
    
    quadrant = quadrant.upper()
    
    if quadrant == "NE":
        # Axis N is 0°, axis E is 90°
        azimuth = bearing
    elif quadrant == "SE":
        # Axis S is 0°, axis E is 90°
        azimuth = 180 - bearing
    elif quadrant == "SW":
        # Axis S is 0°, axis W is 90°
        azimuth = 180 + bearing
    elif quadrant == "NW":
        # Axis N is 0°, axis W is 90°
        azimuth = 360 - bearing
    else:
        raise ValueError(f"Invalid quadrant: {quadrant}. Must be NE, NW, SW, or SE")
    
    # Normalize to 0-360 range
    azimuth = azimuth % 360
    
    return azimuth


class GeometryObject(ABC):
    """
    Base class for all geometry objects.
    
    Provides encapsulation of properties and methods for JSON serialization
    for both storage and frontend formats.
    """
    
    def __init__(self, **kwargs):
        """Initialize geometry object with properties."""
        # Common properties stored privately
        self.__id = kwargs.get('id', str(uuid.uuid4()))
        self.__attributes = kwargs.get('attributes', {})
        self.__metadata = kwargs.get('metadata', {})
    
    # ID property
    @property
    def id(self) -> str:
        """Get object ID."""
        return self.__id
    
    @id.setter
    def id(self, value: str) -> None:
        """Set object ID."""
        if not isinstance(value, str):
            raise TypeError("ID must be a string")
        self.__id = value
    
    # Attributes property
    @property
    def attributes(self) -> Dict[str, Any]:
        """Get attributes dictionary."""
        return self.__attributes.copy()
    
    @attributes.setter
    def attributes(self, value: Dict[str, Any]) -> None:
        """Set attributes dictionary."""
        if not isinstance(value, dict):
            raise TypeError("Attributes must be a dictionary")
        self.__attributes = value.copy()
    
    def get_attribute(self, key: str, default: Any = None) -> Any:
        """Get a specific attribute value."""
        return self.__attributes.get(key, default)
    
    def set_attribute(self, key: str, value: Any) -> None:
        """Set a specific attribute value."""
        self.__attributes[key] = value
    
    def remove_attribute(self, key: str) -> None:
        """Remove a specific attribute."""
        self.__attributes.pop(key, None)
    
    # Metadata property
    @property
    def metadata(self) -> Dict[str, Any]:
        """Get metadata dictionary."""
        return self.__metadata.copy()
    
    @metadata.setter
    def metadata(self, value: Dict[str, Any]) -> None:
        """Set metadata dictionary."""
        if not isinstance(value, dict):
            raise TypeError("Metadata must be a dictionary")
        self.__metadata = value.copy()
    
    @abstractmethod
    def to_storage_json(self) -> Dict[str, Any]:
        """
        Convert object to JSON format for storage.
        
        This format is optimized for backend storage and may include
        additional internal fields not needed by the frontend.
        """
        pass
    
    @abstractmethod
    def to_frontend_json(self) -> Dict[str, Any]:
        """
        Convert object to JSON format for frontend.
        
        This format is optimized for frontend consumption and may include
        presentation-specific fields like styles.
        """
        pass
    
    @classmethod
    @abstractmethod
    def from_storage_json(cls, data: Dict[str, Any]) -> 'GeometryObject':
        """Create object from storage JSON format."""
        pass
    
    @classmethod
    @abstractmethod
    def from_frontend_json(cls, data: Dict[str, Any]) -> 'GeometryObject':
        """Create object from frontend JSON format."""
        pass
    
    @abstractmethod
    def delete(self, session_id: int, geometry_service: 'GeometryService', site: 'Site') -> 'Site':
        """
        Delete this object and trigger re-save of files and updates to instance and frontend.
        
        Args:
            session_id: Session ID
            geometry_service: Geometry service instance for saving
            site: Site object containing this object
            
        Returns:
            Updated Site object after deletion
        """
        pass


class Point(GeometryObject):
    """Represents a point in 2D space."""
    
    def __init__(self, x: float = 0.0, y: float = 0.0, **kwargs):
        super().__init__(**kwargs)
        self.__x = float(x)
        self.__y = float(y)
        self.__layer = kwargs.get('layer', '')
    
    @property
    def x(self) -> float:
        """Get X coordinate."""
        return self.__x
    
    @x.setter
    def x(self, value: float) -> None:
        """Set X coordinate."""
        self.__x = float(value)
    
    @property
    def y(self) -> float:
        """Get Y coordinate."""
        return self.__y
    
    @y.setter
    def y(self, value: float) -> None:
        """Set Y coordinate."""
        self.__y = float(value)
    
    @property
    def layer(self) -> str:
        """Get layer name."""
        return self.__layer
    
    @layer.setter
    def layer(self, value: str) -> None:
        """Set layer name."""
        self.__layer = str(value)
    
    def to_storage_json(self) -> Dict[str, Any]:
        """Convert to storage JSON format."""
        return {
            'id': self.id,
            'x': self.__x,
            'y': self.__y,
            'layer': self.__layer,
            'attributes': self.attributes
        }
    
    def to_frontend_json(self) -> Dict[str, Any]:
        """Convert to frontend JSON format."""
        return {
            'id': self.id,
            'x': self.__x,
            'y': self.__y,
            'layer': self.__layer,
            'attributes': self.attributes
        }
    
    @classmethod
    def from_storage_json(cls, data: Dict[str, Any]) -> 'Point':
        """Create Point from storage JSON."""
        return cls(
            id=data.get('id', str(uuid.uuid4())),
            x=data.get('x', 0.0),
            y=data.get('y', 0.0),
            layer=data.get('layer', ''),
            attributes=data.get('attributes', {})
        )
    
    @classmethod
    def from_frontend_json(cls, data: Dict[str, Any]) -> 'Point':
        """Create Point from frontend JSON."""
        return cls.from_storage_json(data)
    
    def delete(self, session_id: int, geometry_service: 'GeometryService', site: 'Site') -> 'Site':
        """Delete this point and trigger re-save."""
        if not site.remove_point(self.id):
            raise ValueError(f"Point with id {self.id} not found in site")
        # Save with versioning
        result = geometry_service.save_geometry(session_id, site, action="delete_point")
        if isinstance(result, Site):
            return result
        else:
            return geometry_service.load_current_geometry(session_id, as_site=True)


class Segment(GeometryObject):
    """Base class for geometry segments (line or arc)."""
    
    def __init__(self, segment_type: str, start: Dict[str, float], end: Dict[str, float], **kwargs):
        super().__init__(**kwargs)
        if segment_type not in ['line', 'arc']:
            raise ValueError(f"Invalid segment type: {segment_type}. Must be 'line' or 'arc'")
        self.__segment_type = segment_type
        self.__start = {'x': float(start['x']), 'y': float(start['y'])}
        self.__end = {'x': float(end['x']), 'y': float(end['y'])}
        self.__layer = kwargs.get('layer', '')
        self.__length = kwargs.get('length', 0.0)
    
    @property
    def segment_type(self) -> str:
        """Get segment type ('line' or 'arc')."""
        return self.__segment_type
    
    @property
    def start(self) -> Dict[str, float]:
        """Get start point coordinates."""
        return self.__start.copy()
    
    @start.setter
    def start(self, value: Dict[str, float]) -> None:
        """Set start point coordinates."""
        self.__start = {'x': float(value['x']), 'y': float(value['y'])}
    
    @property
    def end(self) -> Dict[str, float]:
        """Get end point coordinates."""
        return self.__end.copy()
    
    @end.setter
    def end(self, value: Dict[str, float]) -> None:
        """Set end point coordinates."""
        self.__end = {'x': float(value['x']), 'y': float(value['y'])}
    
    @property
    def layer(self) -> str:
        """Get layer name."""
        return self.__layer
    
    @layer.setter
    def layer(self, value: str) -> None:
        """Set layer name."""
        self.__layer = str(value)
    
    @property
    def length(self) -> float:
        """Get segment length."""
        return self.__length
    
    @length.setter
    def length(self, value: float) -> None:
        """Set segment length."""
        self.__length = float(value)
    
    def to_storage_json(self) -> Dict[str, Any]:
        """Convert to storage JSON format."""
        result = {
            'id': self.id,
            'segmentType': self.__segment_type,
            'start': self.__start.copy(),
            'end': self.__end.copy(),
            'length': self.__length,
            'layer': self.__layer,
            'attributes': self.attributes
        }
        return result
    
    def to_frontend_json(self) -> Dict[str, Any]:
        """Convert to frontend JSON format."""
        return self.to_storage_json()
    
    @classmethod
    def from_storage_json(cls, data: Dict[str, Any]) -> 'Segment':
        """Create Segment from storage JSON."""
        segment_type = data.get('segmentType', 'line')
        if segment_type == 'line':
            return LineSegment.from_storage_json(data)
        elif segment_type == 'arc':
            return ArcSegment.from_storage_json(data)
        else:
            raise ValueError(f"Unknown segment type: {segment_type}")
    
    @classmethod
    def from_frontend_json(cls, data: Dict[str, Any]) -> 'Segment':
        """Create Segment from frontend JSON."""
        return cls.from_storage_json(data)
    
    def delete(self, session_id: int, geometry_service: 'GeometryService', site: 'Site') -> 'Site':
        """Delete this segment and trigger re-save."""
        # Find and remove segment from geometry
        removed = False
        for layer in site.geometry_layers:
            for parcel in layer.parcels:
                if parcel.geometry:
                    if parcel.geometry.remove_segment(self.id):
                        removed = True
                        break
            if removed:
                break
        
        if not removed:
            raise ValueError(f"Segment with id {self.id} not found in site")
        
        # Save with versioning
        result = geometry_service.save_geometry(session_id, site, action="delete_segment")
        if isinstance(result, Site):
            return result
        else:
            return geometry_service.load_current_geometry(session_id, as_site=True)


class LineSegment(Segment):
    """Represents a line segment."""
    
    def __init__(self, start: Dict[str, float], end: Dict[str, float], 
                 bearing: float = 0.0, **kwargs):
        super().__init__('line', start, end, **kwargs)
        # Store as azimuth (direction to North 0°, clockwise up to 360°)
        # Keep 'bearing' parameter name for backward compatibility
        self.__azimuth = float(bearing) % 360
    
    @property
    def azimuth(self) -> float:
        """Get azimuth in degrees (direction to North 0°, clockwise up to 360°)."""
        return self.__azimuth
    
    @azimuth.setter
    def azimuth(self, value: float) -> None:
        """Set azimuth in degrees (direction to North 0°, clockwise up to 360°)."""
        self.__azimuth = float(value) % 360
    
    @property
    def bearing(self) -> float:
        """Get bearing (azimuth) in degrees. Kept for backward compatibility."""
        return self.__azimuth
    
    @bearing.setter
    def bearing(self, value: float) -> None:
        """Set bearing (azimuth) in degrees. Kept for backward compatibility."""
        self.__azimuth = float(value) % 360
    
    def recalculate_by_bearing_and_distance(
        self,
        quadrant: str,
        bearing: float,
        distance: float,
        blocked_point: str = "start_pt"
    ) -> None:
        """
        Recalculate line segment position using bearing and distance.
        
        Args:
            quadrant: Quadrant string ("NE", "NW", "SW", or "SE")
            bearing: Bearing angle in decimal degrees (0-90)
            distance: Distance in coordinate units (must be > 0)
            blocked_point: Which point to keep fixed ("start_pt" or "end_pt"), default "start_pt"
            
        Raises:
            ValueError: If bearing is out of range (0-90), distance <= 0, or quadrant is invalid
        """
        # Validate bearing range
        if bearing < 0 or bearing > 90:
            raise ValueError(f"Bearing must be in range 0-90 degrees, got {bearing}")
        
        # Validate distance
        if distance <= 0:
            raise ValueError(f"Distance must be greater than 0, got {distance}")
        
        # Validate blocked_point
        if blocked_point not in ["start_pt", "end_pt"]:
            raise ValueError(f"blocked_point must be 'start_pt' or 'end_pt', got {blocked_point}")
        
        # Convert bearing to azimuth using utility function
        azimuth = bearing_to_azimuth(quadrant, bearing)
        
        # Convert azimuth to radians for calculation
        azimuth_rad = math.radians(azimuth)
        
        # Calculate the new point position
        # Azimuth: 0° = North (positive Y), 90° = East (positive X), clockwise
        dx = distance * math.sin(azimuth_rad)  # East component
        dy = distance * math.cos(azimuth_rad)  # North component
        
        # Determine which point is blocked and calculate the other
        # Use properties to access coordinates (avoids name mangling issues)
        current_start = self.start
        current_end = self.end
        
        if blocked_point == "start_pt":
            # Keep start point, calculate new end point
            new_end_x = current_start['x'] + dx
            new_end_y = current_start['y'] + dy
            # Validate calculated coordinates are finite
            if not (math.isfinite(new_end_x) and math.isfinite(new_end_y)):
                raise ValueError(f"Calculated end point coordinates are not finite: ({new_end_x}, {new_end_y})")
            self.end = {'x': new_end_x, 'y': new_end_y}
        else:
            # Keep end point, calculate new start point
            new_start_x = current_end['x'] - dx
            new_start_y = current_end['y'] - dy
            # Validate calculated coordinates are finite
            if not (math.isfinite(new_start_x) and math.isfinite(new_start_y)):
                raise ValueError(f"Calculated start point coordinates are not finite: ({new_start_x}, {new_start_y})")
            self.start = {'x': new_start_x, 'y': new_start_y}
        
        # Recalculate length and azimuth using updated coordinates
        updated_start = self.start
        updated_end = self.end
        dx_new = updated_end['x'] - updated_start['x']
        dy_new = updated_end['y'] - updated_start['y']
        self.length = float((dx_new ** 2 + dy_new ** 2) ** 0.5)
        
        # Recalculate azimuth from new coordinates
        # atan2 gives angle from East, convert to azimuth (from North, clockwise)
        angle_rad = math.atan2(dy_new, dx_new)
        angle_deg = math.degrees(angle_rad)
        # Convert from mathematical angle (0°=East) to azimuth (0°=North, clockwise)
        # Mathematical: 0°=East, 90°=North, 180°=West, 270°=South
        # Azimuth: 0°=North, 90°=East, 180°=South, 270°=West
        # Formula: azimuth = (90 - angle_deg) % 360
        # Python's % operator always returns a value in [0, 360) for positive modulus
        azimuth = (90 - angle_deg) % 360
        self.__azimuth = azimuth
    
    def to_storage_json(self) -> Dict[str, Any]:
        """Convert to storage JSON format."""
        result = super().to_storage_json()
        # Store as 'bearing' for backward compatibility with existing data
        result['bearing'] = self.__azimuth
        return result
    
    def to_frontend_json(self) -> Dict[str, Any]:
        """Convert to frontend JSON format."""
        return self.to_storage_json()
    
    @classmethod
    def from_storage_json(cls, data: Dict[str, Any]) -> 'LineSegment':
        """Create LineSegment from storage JSON."""
        return cls(
            id=data.get('id', str(uuid.uuid4())),
            start=data.get('start', {'x': 0.0, 'y': 0.0}),
            end=data.get('end', {'x': 0.0, 'y': 0.0}),
            bearing=data.get('bearing', 0.0),  # Will be stored as azimuth internally
            length=data.get('length', 0.0),
            layer=data.get('layer', ''),
            attributes=data.get('attributes', {})
        )
    
    @classmethod
    def from_frontend_json(cls, data: Dict[str, Any]) -> 'LineSegment':
        """Create LineSegment from frontend JSON."""
        return cls.from_storage_json(data)


class ArcSegment(Segment):
    """Represents an arc segment."""
    
    def __init__(self, start: Dict[str, float], end: Dict[str, float],
                 center: Dict[str, float], radius: float,
                 rotation: str = 'cw', delta: Optional[float] = None, **kwargs):
        super().__init__('arc', start, end, **kwargs)
        self.__center = {'x': float(center['x']), 'y': float(center['y'])}
        self.__radius = float(radius)
        if rotation not in ['cw', 'ccw']:
            raise ValueError(f"Invalid rotation: {rotation}. Must be 'cw' or 'ccw'")
        self.__rotation = rotation
        self.__delta = float(delta) if delta is not None else None
    
    @property
    def center(self) -> Dict[str, float]:
        """Get center point coordinates."""
        return self.__center.copy()
    
    @center.setter
    def center(self, value: Dict[str, float]) -> None:
        """Set center point coordinates."""
        self.__center = {'x': float(value['x']), 'y': float(value['y'])}
    
    @property
    def radius(self) -> float:
        """Get arc radius."""
        return self.__radius
    
    @radius.setter
    def radius(self, value: float) -> None:
        """Set arc radius."""
        self.__radius = float(value)
    
    @property
    def rotation(self) -> str:
        """Get rotation direction ('cw' or 'ccw')."""
        return self.__rotation
    
    @rotation.setter
    def rotation(self, value: str) -> None:
        """Set rotation direction ('cw' or 'ccw')."""
        if value not in ['cw', 'ccw']:
            raise ValueError(f"Invalid rotation: {value}. Must be 'cw' or 'ccw'")
        self.__rotation = value
    
    @property
    def delta(self) -> Optional[float]:
        """Get arc delta angle in degrees."""
        return self.__delta
    
    @delta.setter
    def delta(self, value: Optional[float]) -> None:
        """Set arc delta angle in degrees."""
        self.__delta = float(value) if value is not None else None
    
    def to_storage_json(self) -> Dict[str, Any]:
        """Convert to storage JSON format."""
        result = super().to_storage_json()
        result['center'] = self.__center.copy()
        result['radius'] = self.__radius
        result['rot'] = self.__rotation  # Storage uses 'rot'
        if self.__delta is not None:
            result['delta'] = self.__delta
        return result
    
    def to_frontend_json(self) -> Dict[str, Any]:
        """Convert to frontend JSON format."""
        result = super().to_storage_json()
        result['center'] = self.__center.copy()
        result['radius'] = self.__radius
        result['rotation'] = self.__rotation  # Frontend uses 'rotation'
        if self.__delta is not None:
            result['delta'] = self.__delta
        return result
    
    @classmethod
    def from_storage_json(cls, data: Dict[str, Any]) -> 'ArcSegment':
        """Create ArcSegment from storage JSON."""
        # Handle both 'rot' and 'rotation' keys
        rotation = data.get('rot') or data.get('rotation', 'cw')
        return cls(
            id=data.get('id', str(uuid.uuid4())),
            start=data.get('start', {'x': 0.0, 'y': 0.0}),
            end=data.get('end', {'x': 0.0, 'y': 0.0}),
            center=data.get('center', {'x': 0.0, 'y': 0.0}),
            radius=data.get('radius', 0.0),
            rotation=rotation,
            delta=data.get('delta'),
            length=data.get('length', 0.0),
            layer=data.get('layer', ''),
            attributes=data.get('attributes', {})
        )
    
    @classmethod
    def from_frontend_json(cls, data: Dict[str, Any]) -> 'ArcSegment':
        """Create ArcSegment from frontend JSON."""
        return cls.from_storage_json(data)


class Geometry(GeometryObject):
    """Represents a geometry object containing segments."""
    
    def __init__(self, geometry_type: str = 'Polygon', is_closed: bool = True, **kwargs):
        super().__init__(**kwargs)
        self.__type = geometry_type
        self.__is_closed = is_closed
        self.__segments: List[Segment] = []
    
    @property
    def type(self) -> str:
        """Get geometry type (e.g., 'Polygon', 'LineString')."""
        return self.__type
    
    @type.setter
    def type(self, value: str) -> None:
        """Set geometry type."""
        self.__type = str(value)
    
    @property
    def is_closed(self) -> bool:
        """Check if geometry is closed."""
        return self.__is_closed
    
    @is_closed.setter
    def is_closed(self, value: bool) -> None:
        """Set if geometry is closed."""
        self.__is_closed = bool(value)
    
    @property
    def segments(self) -> List[Segment]:
        """Get list of segments (read-only copy)."""
        return self.__segments.copy()
    
    def add_segment(self, segment: Segment) -> None:
        """Add a segment to the geometry."""
        if not isinstance(segment, Segment):
            raise TypeError("segment must be an instance of Segment")
        self.__segments.append(segment)
    
    def remove_segment(self, segment_id: str) -> bool:
        """Remove a segment by ID. Returns True if removed."""
        for i, seg in enumerate(self.__segments):
            if seg.id == segment_id:
                self.__segments.pop(i)
                return True
        return False
    
    def get_segment(self, segment_id: str) -> Optional[Segment]:
        """Get a segment by ID."""
        for seg in self.__segments:
            if seg.id == segment_id:
                return seg
        return None
    
    def to_storage_json(self) -> Dict[str, Any]:
        """Convert to storage JSON format."""
        return {
            'type': self.__type,
            'isClosed': self.__is_closed,
            'segments': [seg.to_storage_json() for seg in self.__segments],
            'attributes': self.attributes
        }
    
    def to_frontend_json(self) -> Dict[str, Any]:
        """Convert to frontend JSON format."""
        return {
            'type': self.__type,
            'isClosed': self.__is_closed,
            'segments': [seg.to_frontend_json() for seg in self.__segments],
            'attributes': self.attributes
        }
    
    @classmethod
    def from_storage_json(cls, data: Dict[str, Any]) -> 'Geometry':
        """Create Geometry from storage JSON."""
        geometry = cls(
            id=data.get('id', str(uuid.uuid4())),
            geometry_type=data.get('type', 'Polygon'),
            is_closed=data.get('isClosed', True),
            attributes=data.get('attributes', {})
        )
        for seg_data in data.get('segments', []):
            segment = Segment.from_storage_json(seg_data)
            geometry.add_segment(segment)
        return geometry
    
    @classmethod
    def from_frontend_json(cls, data: Dict[str, Any]) -> 'Geometry':
        """Create Geometry from frontend JSON."""
        return cls.from_storage_json(data)
    
    def delete(self, session_id: int, geometry_service: 'GeometryService', site: 'Site') -> 'Site':
        """Delete this geometry and trigger re-save."""
        # Find and remove geometry from parcel
        removed = False
        for layer in site.geometry_layers:
            for parcel in layer.parcels:
                if parcel.geometry and parcel.geometry.id == self.id:
                    parcel.geometry = None
                    removed = True
                    break
            if removed:
                break
        
        if not removed:
            raise ValueError(f"Geometry with id {self.id} not found in site")
        
        # Save with versioning
        result = geometry_service.save_geometry(session_id, site, action="delete_geometry")
        if isinstance(result, Site):
            return result
        else:
            return geometry_service.load_current_geometry(session_id, as_site=True)


class Parcel(GeometryObject):
    """Represents a parcel (property/feature)."""
    
    def __init__(self, name: str, feature_type: str = 'parcel', **kwargs):
        super().__init__(**kwargs)
        self.__name = name
        self.__feature_type = feature_type
        self.__number = kwargs.get('number', 0)
        self.__area = kwargs.get('area', 0.0)
        self.__geometry: Optional[Geometry] = kwargs.get('geometry')
        self.__style = kwargs.get('style', {})
    
    @property
    def name(self) -> str:
        """Get parcel name."""
        return self.__name
    
    @name.setter
    def name(self, value: str) -> None:
        """Set parcel name."""
        self.__name = str(value)
    
    @property
    def feature_type(self) -> str:
        """Get feature type (e.g., 'parcel', 'centerline')."""
        return self.__feature_type
    
    @feature_type.setter
    def feature_type(self, value: str) -> None:
        """Set feature type."""
        self.__feature_type = str(value)
    
    @property
    def number(self) -> int:
        """Get parcel number."""
        return self.__number
    
    @number.setter
    def number(self, value: int) -> None:
        """Set parcel number."""
        self.__number = int(value)
    
    @property
    def area(self) -> float:
        """Get parcel area."""
        return self.__area
    
    @area.setter
    def area(self, value: float) -> None:
        """Set parcel area."""
        self.__area = float(value)
    
    @property
    def geometry(self) -> Optional[Geometry]:
        """Get geometry object."""
        return self.__geometry
    
    @geometry.setter
    def geometry(self, value: Optional[Geometry]) -> None:
        """Set geometry object."""
        if value is not None and not isinstance(value, Geometry):
            raise TypeError("geometry must be an instance of Geometry or None")
        self.__geometry = value
    
    @property
    def style(self) -> Dict[str, Any]:
        """Get style dictionary (for frontend display)."""
        return self.__style.copy()
    
    @style.setter
    def style(self, value: Dict[str, Any]) -> None:
        """Set style dictionary."""
        if not isinstance(value, dict):
            raise TypeError("style must be a dictionary")
        self.__style = value.copy()
    
    def to_storage_json(self) -> Dict[str, Any]:
        """Convert to storage JSON format (without style)."""
        result = {
            'id': self.id,
            'number': self.__number,
            'name': self.__name,
            'area': self.__area,
            'attributes': self.attributes
        }
        if self.__geometry:
            result['geometry'] = self.__geometry.to_storage_json()
        return result
    
    def to_frontend_json(self) -> Dict[str, Any]:
        """Convert to frontend JSON format (with style)."""
        result = {
            'id': self.id,
            'name': self.__name,
            'featureType': self.__feature_type,
            'attributes': self.attributes,
            'style': self.__style.copy()
        }
        if self.__geometry:
            result['geometry'] = self.__geometry.to_frontend_json()
        return result
    
    @classmethod
    def from_storage_json(cls, data: Dict[str, Any]) -> 'Parcel':
        """Create Parcel from storage JSON."""
        geometry = None
        if 'geometry' in data:
            geometry = Geometry.from_storage_json(data['geometry'])
        
        return cls(
            id=data.get('id', str(uuid.uuid4())),
            name=data.get('name', ''),
            number=data.get('number', 0),
            area=data.get('area', 0.0),
            geometry=geometry,
            attributes=data.get('attributes', {})
        )
    
    @classmethod
    def from_frontend_json(cls, data: Dict[str, Any]) -> 'Parcel':
        """Create Parcel from frontend JSON."""
        geometry = None
        if 'geometry' in data:
            geometry = Geometry.from_frontend_json(data['geometry'])
        
        return cls(
            id=data.get('id', str(uuid.uuid4())),
            name=data.get('name', ''),
            feature_type=data.get('featureType', 'parcel'),
            area=data.get('attributes', {}).get('area', 0.0),
            geometry=geometry,
            style=data.get('style', {}),
            attributes=data.get('attributes', {})
        )
    
    def delete(self, session_id: int, geometry_service: 'GeometryService', site: 'Site') -> 'Site':
        """Delete this parcel and trigger re-save."""
        # Find and remove parcel from layer
        removed = False
        for layer in site.geometry_layers:
            if layer.remove_parcel(self.id):
                removed = True
                break
        
        if not removed:
            raise ValueError(f"Parcel with id {self.id} not found in site")
        
        # Save with versioning
        result = geometry_service.save_geometry(session_id, site, action="delete_parcel")
        if isinstance(result, Site):
            return result
        else:
            return geometry_service.load_current_geometry(session_id, as_site=True)


class GeometryLayer(GeometryObject):
    """Represents a geometry layer (collection of parcels/features)."""
    
    def __init__(self, layer_type: str = 'Boundary', name: str = '', **kwargs):
        super().__init__(**kwargs)
        self.__layer_type = layer_type
        self.__name = name
        self.__title = kwargs.get('title', name)
        self.__visible = kwargs.get('visible', True)
        self.__parcels: List[Parcel] = []
    
    @property
    def layer_type(self) -> str:
        """Get layer type (e.g., 'Boundary', 'LOT', 'Easement')."""
        return self.__layer_type
    
    @layer_type.setter
    def layer_type(self, value: str) -> None:
        """Set layer type."""
        self.__layer_type = str(value)
    
    @property
    def name(self) -> str:
        """Get layer name."""
        return self.__name
    
    @name.setter
    def name(self, value: str) -> None:
        """Set layer name."""
        self.__name = str(value)
    
    @property
    def title(self) -> str:
        """Get layer title (for frontend display)."""
        return self.__title
    
    @title.setter
    def title(self, value: str) -> None:
        """Set layer title."""
        self.__title = str(value)
    
    @property
    def visible(self) -> bool:
        """Check if layer is visible."""
        return self.__visible
    
    @visible.setter
    def visible(self, value: bool) -> None:
        """Set layer visibility."""
        self.__visible = bool(value)
    
    @property
    def parcels(self) -> List[Parcel]:
        """Get list of parcels (read-only copy)."""
        return self.__parcels.copy()
    
    def add_parcel(self, parcel: Parcel) -> None:
        """Add a parcel to the layer."""
        if not isinstance(parcel, Parcel):
            raise TypeError("parcel must be an instance of Parcel")
        self.__parcels.append(parcel)
    
    def remove_parcel(self, parcel_id: str) -> bool:
        """Remove a parcel by ID. Returns True if removed."""
        for i, parcel in enumerate(self.__parcels):
            if parcel.id == parcel_id:
                self.__parcels.pop(i)
                return True
        return False
    
    def get_parcel(self, parcel_id: str) -> Optional[Parcel]:
        """Get a parcel by ID."""
        for parcel in self.__parcels:
            if parcel.id == parcel_id:
                return parcel
        return None
    
    def to_storage_json(self) -> Dict[str, Any]:
        """Convert to storage JSON format."""
        return {
            'geometryLayerId': self.id,
            'geometryLayerType': self.__layer_type,
            'name': self.__name,
            'visible': self.__visible,
            'parcels': [parcel.to_storage_json() for parcel in self.__parcels],
            'attributes': self.attributes
        }
    
    def to_frontend_json(self) -> Dict[str, Any]:
        """Convert to frontend JSON format."""
        return {
            'id': self.id,
            'title': self.__title,
            'features': [parcel.to_frontend_json() for parcel in self.__parcels],
            'attributes': self.attributes
        }
    
    @classmethod
    def from_storage_json(cls, data: Dict[str, Any]) -> 'GeometryLayer':
        """Create GeometryLayer from storage JSON."""
        layer = cls(
            id=data.get('geometryLayerId', str(uuid.uuid4())),
            layer_type=data.get('geometryLayerType', 'Boundary'),
            name=data.get('name', ''),
            visible=data.get('visible', True),
            attributes=data.get('attributes', {})
        )
        for parcel_data in data.get('parcels', []):
            parcel = Parcel.from_storage_json(parcel_data)
            layer.add_parcel(parcel)
        return layer
    
    @classmethod
    def from_frontend_json(cls, data: Dict[str, Any]) -> 'GeometryLayer':
        """Create GeometryLayer from frontend JSON."""
        layer = cls(
            id=data.get('id', str(uuid.uuid4())),
            layer_type=data.get('layerType', 'Boundary'),
            name=data.get('name', ''),
            title=data.get('title', ''),
            visible=data.get('visible', True),
            attributes=data.get('attributes', {})
        )
        for feature_data in data.get('features', []):
            parcel = Parcel.from_frontend_json(feature_data)
            layer.add_parcel(parcel)
        return layer
    
    def delete(self, session_id: int, geometry_service: 'GeometryService', site: 'Site') -> 'Site':
        """Delete this geometry layer and trigger re-save."""
        if not site.remove_geometry_layer(self.id):
            raise ValueError(f"GeometryLayer with id {self.id} not found in site")
        
        # Save with versioning
        result = geometry_service.save_geometry(session_id, site, action="delete_geometry_layer")
        if isinstance(result, Site):
            return result
        else:
            return geometry_service.load_current_geometry(session_id, as_site=True)


class Site(GeometryObject):
    """Represents a site containing geometry layers."""
    
    def __init__(self, project_id: str = '', site_id: Optional[str] = None, name: str = '', **kwargs):
        super().__init__(**kwargs)
        self.__project_id = project_id
        if site_id:
            self.id = site_id
        self.__name = name
        self.__version = kwargs.get('version', 0)
        self.__history = kwargs.get('history', {
            'currentVersion': 0,
            'previousVersionFile': None
        })
        self.__geometry_layers: List[GeometryLayer] = []
        self.__metadata = kwargs.get('metadata', {})
        # For session-based geometry: store points and segments directly
        self.__points: List[Point] = []
        self.__session_id = kwargs.get('sessionId')
    
    @property
    def project_id(self) -> str:
        """Get project ID."""
        return self.__project_id
    
    @project_id.setter
    def project_id(self, value: str) -> None:
        """Set project ID."""
        self.__project_id = str(value)
    
    @property
    def site_id(self) -> str:
        """Get site ID (alias for id)."""
        return self.id
    
    @site_id.setter
    def site_id(self, value: str) -> None:
        """Set site ID (alias for id)."""
        self.id = value
    
    @property
    def name(self) -> str:
        """Get site name."""
        return self.__name
    
    @name.setter
    def name(self, value: str) -> None:
        """Set site name."""
        self.__name = str(value)
    
    @property
    def version(self) -> int:
        """Get current version number."""
        return self.__version
    
    @version.setter
    def version(self, value: int) -> None:
        """Set version number."""
        self.__version = int(value)
    
    @property
    def history(self) -> Dict[str, Any]:
        """Get history dictionary."""
        return self.__history.copy()
    
    @history.setter
    def history(self, value: Dict[str, Any]) -> None:
        """Set history dictionary."""
        self.__history = value.copy()
    
    @property
    def geometry_layers(self) -> List[GeometryLayer]:
        """Get list of geometry layers (read-only copy)."""
        return self.__geometry_layers.copy()
    
    def add_geometry_layer(self, layer: GeometryLayer) -> None:
        """Add a geometry layer to the site."""
        if not isinstance(layer, GeometryLayer):
            raise TypeError("layer must be an instance of GeometryLayer")
        self.__geometry_layers.append(layer)
    
    def remove_geometry_layer(self, layer_id: str) -> bool:
        """Remove a geometry layer by ID. Returns True if removed."""
        for i, layer in enumerate(self.__geometry_layers):
            if layer.id == layer_id:
                self.__geometry_layers.pop(i)
                return True
        return False
    
    def get_geometry_layer(self, layer_id: str) -> Optional[GeometryLayer]:
        """Get a geometry layer by ID."""
        for layer in self.__geometry_layers:
            if layer.id == layer_id:
                return layer
        return None
    
    # Session-based geometry support (for backward compatibility)
    @property
    def session_id(self) -> Optional[int]:
        """Get session ID (for session-based geometry)."""
        return self.__session_id
    
    @session_id.setter
    def session_id(self, value: Optional[int]) -> None:
        """Set session ID."""
        self.__session_id = value
    
    @property
    def points(self) -> List[Point]:
        """Get list of points (for session-based geometry)."""
        return self.__points.copy()
    
    def add_point(self, point: Point) -> None:
        """Add a point to the site (for session-based geometry)."""
        if not isinstance(point, Point):
            raise TypeError("point must be an instance of Point")
        self.__points.append(point)
    
    def remove_point(self, point_id: str) -> bool:
        """Remove a point by ID. Returns True if removed."""
        for i, point in enumerate(self.__points):
            if point.id == point_id:
                self.__points.pop(i)
                return True
        return False
    
    def get_point(self, point_id: str) -> Optional[Point]:
        """Get a point by ID."""
        for point in self.__points:
            if point.id == point_id:
                return point
        return None
    
    def get_all_segments(self) -> List[Segment]:
        """Get all segments from all geometry layers and session-based segments."""
        segments = []
        # Get segments from geometry layers
        for layer in self.__geometry_layers:
            for parcel in layer.parcels:
                if parcel.geometry:
                    segments.extend(parcel.geometry.segments)
        return segments
    
    def get_segment_by_id(self, segment_id: str) -> Optional[Segment]:
        """Find a segment by ID across all geometry layers."""
        for layer in self.__geometry_layers:
            for parcel in layer.parcels:
                if parcel.geometry:
                    segment = parcel.geometry.get_segment(segment_id)
                    if segment:
                        return segment
        return None
    
    def to_storage_json(self) -> Dict[str, Any]:
        """Convert to storage JSON format."""
        result = {
            'projectId': self.__project_id,
            'siteId': self.id,
            'name': self.__name,
            'version': self.__version,
            'history': self.__history.copy(),
            'geometryLayers': [layer.to_storage_json() for layer in self.__geometry_layers],
            'metadata': self.__metadata,
            'attributes': self.attributes
        }
        # Include session-based points and segments for backward compatibility
        if self.__session_id is not None:
            result['sessionId'] = self.__session_id
            result['points'] = [point.to_storage_json() for point in self.__points]
            # Extract segments from geometry layers for session-based format
            segments = []
            for layer in self.__geometry_layers:
                for parcel in layer.parcels:
                    if parcel.geometry:
                        segments.extend([seg.to_storage_json() for seg in parcel.geometry.segments])
            result['segments'] = segments
        return result
    
    def to_frontend_json(self) -> Dict[str, Any]:
        """Convert to frontend JSON format."""
        result = {
            'metadata': self.__metadata if self.__metadata else {},
            'collections': [layer.to_frontend_json() for layer in self.__geometry_layers],
            'attributes': self.attributes
        }
        # For session-based geometry, include points and segments at top level for backward compatibility
        # Always include points and segments arrays for session-based geometry
        result['points'] = [point.to_frontend_json() for point in self.__points]
        # Extract segments from geometry layers
        segments = []
        for layer in self.__geometry_layers:
            for parcel in layer.parcels:
                if parcel.geometry:
                    segments.extend([seg.to_frontend_json() for seg in parcel.geometry.segments])
        result['segments'] = segments
        return result
    
    @classmethod
    def from_storage_json(cls, data: Dict[str, Any]) -> 'Site':
        """Create Site from storage JSON."""
        site = cls(
            project_id=data.get('projectId', ''),
            site_id=data.get('siteId', str(uuid.uuid4())),
            name=data.get('name', ''),
            version=data.get('version', 0),
            history=data.get('history', {
                'currentVersion': 0,
                'previousVersionFile': None
            }),
            metadata=data.get('metadata', {}),
            attributes=data.get('attributes', {}),
            sessionId=data.get('sessionId')
        )
        
        # Load geometry layers
        for layer_data in data.get('geometryLayers', []):
            layer = GeometryLayer.from_storage_json(layer_data)
            site.add_geometry_layer(layer)
        
        # Load session-based points (for backward compatibility)
        if 'points' in data and data['points']:
            for point_data in data['points']:
                point = Point.from_storage_json(point_data)
                site.add_point(point)
        
        # Handle session-based segments: if segments exist at top level,
        # add them to default layer (create if needed)
        if 'segments' in data and data['segments']:
            # Get or create default layer
            default_layer = None
            for layer in site.geometry_layers:
                if layer.name == 'Default Layer' or (not site.geometry_layers and layer.layer_type == 'Boundary'):
                    default_layer = layer
                    break
            
            if not default_layer:
                # Create default geometry layer for session-based segments
                default_layer = GeometryLayer(
                    layer_type='Boundary',
                    name='Default Layer',
                    id=str(uuid.uuid4())
                )
                site.add_geometry_layer(default_layer)
            
            # Get or create default parcel
            default_parcel = None
            if default_layer.parcels:
                default_parcel = default_layer.parcels[0]
            else:
                default_parcel = Parcel(
                    name='Default Parcel',
                    feature_type='parcel',
                    id=str(uuid.uuid4())
                )
                default_layer.add_parcel(default_parcel)
            
            # Get or create geometry
            if not default_parcel.geometry:
                geometry = Geometry(geometry_type='LineString', is_closed=False)
                default_parcel.geometry = geometry
            else:
                geometry = default_parcel.geometry
            
            # Add segments to geometry (only if not already present)
            existing_segment_ids = {seg.id for seg in geometry.segments}
            for segment_data in data['segments']:
                segment = Segment.from_storage_json(segment_data)
                if segment.id not in existing_segment_ids:
                    geometry.add_segment(segment)
        
        return site
    
    @classmethod
    def from_frontend_json(cls, data: Dict[str, Any]) -> 'Site':
        """Create Site from frontend JSON."""
        site = cls(
            project_id=data.get('projectId', ''),
            site_id=data.get('siteId', str(uuid.uuid4())),
            name=data.get('metadata', {}).get('project', ''),
            metadata=data.get('metadata', {}),
            attributes=data.get('attributes', {}),
            sessionId=data.get('sessionId')
        )
        
        # Load collections (new format)
        for collection_data in data.get('collections', []):
            layer = GeometryLayer.from_frontend_json(collection_data)
            site.add_geometry_layer(layer)
        
        # Handle old format with points and segments at top level
        if 'points' in data and data['points']:
            for point_data in data['points']:
                point = Point.from_frontend_json(point_data)
                site.add_point(point)
        
        # Handle old format with segments at top level
        if 'segments' in data and data['segments'] and not site.geometry_layers:
            # Create default geometry layer for session-based segments
            default_layer = GeometryLayer(
                layer_type='Boundary',
                name='Default Layer',
                id=str(uuid.uuid4())
            )
            
            # Create default parcel
            default_parcel = Parcel(
                name='Default Parcel',
                feature_type='parcel',
                id=str(uuid.uuid4())
            )
            
            # Create geometry and add segments
            geometry = Geometry(geometry_type='LineString', is_closed=False)
            for segment_data in data['segments']:
                segment = Segment.from_frontend_json(segment_data)
                geometry.add_segment(segment)
            
            default_parcel.geometry = geometry
            default_layer.add_parcel(default_parcel)
            site.add_geometry_layer(default_layer)
        
        return site
    
    def delete(self, session_id: int, geometry_service: 'GeometryService', site: 'Site') -> 'Site':
        """
        Delete this site (clear all data) and trigger re-save.
        
        Note: Since Site is the root container, this method clears all geometry data
        but keeps the Site structure intact. The 'site' parameter should be 'self'.
        """
        # Use self since this is the Site object itself
        # Clear all geometry data by removing all layers and points
        layer_ids = [layer.id for layer in self.geometry_layers]
        for layer_id in layer_ids:
            self.remove_geometry_layer(layer_id)
        
        point_ids = [point.id for point in self.points]
        for point_id in point_ids:
            self.remove_point(point_id)
        
        # Save with versioning
        result = geometry_service.save_geometry(session_id, self, action="delete_site")
        if isinstance(result, Site):
            return result
        else:
            return geometry_service.load_current_geometry(session_id, as_site=True)

