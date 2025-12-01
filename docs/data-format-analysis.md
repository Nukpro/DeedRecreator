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

### Frontend Format (to_frontend_json)
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

## Incompatibilities Identified

1. **Points storage**: Current format has `points` at top level, but `Site` doesn't have a direct way to store standalone points
2. **Segments storage**: Current format has `segments` at top level, but `Site` stores segments inside Geometry → Parcel → GeometryLayer
3. **Session ID**: Current format uses `sessionId`, but `Site` uses `projectId` and `siteId`
4. **Version/History**: Both formats support versioning, but structure is slightly different
5. **Frontend format mismatch**: Current API returns simple structure, but frontend sampleData uses collections format

## Solution Strategy

1. **Create adapter methods** in GeometryService to convert between formats
2. **Store points and segments** in a default GeometryLayer for session-based geometry
3. **Maintain backward compatibility** during migration
4. **Use Site class** internally, convert to/from JSON at boundaries

