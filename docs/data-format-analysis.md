# Data Format Analysis

## Current Storage Format (GeometryService)

```json
{
  "sessionId": 123,
  "version": 5,
  "history": {
    "currentVersion": 5,
    "previousVersionFile": "version_4.json"
  },
  "points": [
    {
      "id": "uuid",
      "x": 100.0,
      "y": 200.0,
      "layer": "default",
      "attributes": {}
    }
  ],
  "segments": [
    {
      "id": "uuid",
      "segmentType": "line",
      "start": {"x": 100.0, "y": 200.0},
      "end": {"x": 200.0, "y": 300.0},
      "length": 141.42,
      "layer": "default",
      "attributes": {}
    }
  ],
  "geometryLayers": []
}
```

## Current Frontend Format (Expected)

### Format 1: Simple structure (current API)
```json
{
  "points": [...],
  "segments": [...],
  "geometryLayers": [...]
}
```

### Format 2: Collections structure (from sampleData)
```json
{
  "metadata": {
    "source": "LandXML",
    "project": "Site",
    "units": {
      "distance": "foot",
      "area": "squareFoot",
      "angle": "decimal degrees"
    }
  },
  "collections": [
    {
      "id": "parcels",
      "title": "Parcels",
      "features": [
        {
          "id": "parcel-1",
          "name": "Property : 1",
          "featureType": "parcel",
          "geometry": {
            "type": "Polygon",
            "isClosed": true,
            "segments": [...]
          },
          "attributes": {...},
          "style": {...}
        }
      ]
    }
  ]
}
```

## Site Class Format (vectors.py)

### Storage Format (to_storage_json)

**Base format (project-based):**
```json
{
  "projectId": "uuid",
  "siteId": "uuid",
  "name": "Site 1",
  "version": 1,
  "history": {
    "currentVersion": 1,
    "previousVersionFile": null
  },
  "geometryLayers": [
    {
      "geometryLayerId": "uuid",
      "geometryLayerType": "Boundary",
      "name": "Boundary Layer",
      "visible": true,
      "parcels": [
        {
          "id": "uuid",
          "number": 1,
          "name": "Property : 1",
          "area": 1000.0,
          "geometry": {
            "type": "Polygon",
            "isClosed": true,
            "segments": [...]
          },
          "attributes": {}
        }
      ],
      "attributes": {}
    }
  ],
  "metadata": {},
  "attributes": {}
}
```

**Session-based format (when `sessionId` is set):**
The `Site.to_storage_json()` method automatically includes backward compatibility fields when `sessionId` is present:
```json
{
  "projectId": "uuid",
  "siteId": "uuid",
  "name": "Site 1",
  "version": 1,
  "history": {...},
  "sessionId": 123,
  "points": [...],
  "segments": [...],
  "geometryLayers": [...],
  "metadata": {},
  "attributes": {}
}
```

**Note:** Points are stored in `Site.__points` list, and segments are extracted from geometry layers and included at the top level for backward compatibility with the legacy format.

### Frontend Format (to_frontend_json)

**Collections format (always included):**
```json
{
  "metadata": {...},
  "collections": [
    {
      "id": "uuid",
      "title": "Boundary Layer",
      "features": [
        {
          "id": "uuid",
          "name": "Property : 1",
          "featureType": "parcel",
          "geometry": {...},
          "attributes": {...},
          "style": {...}
        }
      ],
      "attributes": {}
    }
  ],
  "attributes": {}
}
```

**Backward compatibility (always included):**
The `Site.to_frontend_json()` method also includes top-level `points` and `segments` arrays for backward compatibility:
```json
{
  "metadata": {...},
  "collections": [...],
  "points": [...],
  "segments": [...],
  "attributes": {}
}
```

**Note:** The frontend (`geometry-viewer.js`) can handle both the collections format and the legacy top-level points/segments format, ensuring full backward compatibility.

## Incompatibilities Identified (RESOLVED)

### Original Issues (Now Implemented)

1. **Points storage** ✅ **RESOLVED**: 
   - `Site` class has a `__points` list and `add_point()` method
   - `to_storage_json()` includes `points` at top level when `sessionId` is set
   - Points are stored directly in `Site` for session-based geometry

2. **Segments storage** ✅ **RESOLVED**: 
   - Segments are stored in Geometry → Parcel → GeometryLayer hierarchy
   - `to_storage_json()` extracts segments from geometry layers and includes them at top level when `sessionId` is set
   - Backward compatibility maintained automatically

3. **Session ID** ✅ **RESOLVED**: 
   - `Site` supports both `sessionId` (for session-based) and `projectId`/`siteId` (for project-based)
   - `to_storage_json()` includes `sessionId` when set
   - Both formats coexist seamlessly

4. **Version/History** ✅ **RESOLVED**: 
   - Both formats use identical version/history structure
   - `Site` version and history fields match the legacy format exactly

5. **Frontend format mismatch** ✅ **RESOLVED**: 
   - `to_frontend_json()` returns both `collections` format AND top-level `points`/`segments`
   - Frontend (`geometry-viewer.js`) handles both formats
   - No breaking changes for existing frontend code

## Implementation Status

### ✅ Completed Solutions

1. **Adapter methods** ✅ **IMPLEMENTED**: 
   - `Site.to_storage_json()` and `Site.to_frontend_json()` handle format conversion
   - `GeometryService` uses `Site` objects internally and converts at boundaries
   - Both legacy dict format and Site object format are supported

2. **Points and segments storage** ✅ **IMPLEMENTED**: 
   - Points stored in `Site.__points` list (not in geometry layers)
   - Segments stored in default GeometryLayer → default Parcel → Geometry hierarchy
   - `GeometryService._get_or_create_default_layer()` ensures default layer exists
   - Top-level points/segments included in storage JSON for backward compatibility

3. **Backward compatibility** ✅ **IMPLEMENTED**: 
   - `Site.to_storage_json()` conditionally includes `sessionId`, `points`, and `segments` when `sessionId` is set
   - `Site.to_frontend_json()` always includes both `collections` and top-level `points`/`segments`
   - `Site.from_storage_json()` handles both old and new formats
   - Frontend can consume both formats

4. **Site class integration** ✅ **IMPLEMENTED**: 
   - `GeometryService` uses `Site` objects internally (`as_site=True` parameter)
   - All geometry operations work with `Site` objects
   - JSON conversion happens at API boundaries
   - Legacy dict format still supported for backward compatibility

### Current Architecture

- **Backend**: `GeometryService` → `Site` objects → JSON at boundaries
- **Storage**: Site objects serialize to JSON with backward compatibility fields
- **Frontend**: Receives hybrid format (collections + legacy points/segments)
- **Migration**: Complete - all legacy code paths supported

