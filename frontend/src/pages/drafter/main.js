import GeometryViewer from "../../components/geometry-viewer.js";
import PropertyEditor from "../../components/property-editor.js";
import * as arcApi from "../../utils/arc-api.js";
import "../../styles/geometry-viewer.css";
import "../../styles/property-editor.css";
import "./style.css";

console.log("=== DRAFTER MODULE LOADING ===");

// Utility functions for calculating segment properties
function calculateQuadrant(dx, dy) {
  if (dx >= 0 && dy >= 0) return "NE";
  if (dx < 0 && dy >= 0) return "NW";
  if (dx < 0 && dy < 0) return "SW";
  if (dx >= 0 && dy < 0) return "SE";
  return "NE";
}

function calculateBearing(dx, dy) {
  // Calculate angle in radians from positive X axis (east)
  let angle = Math.atan2(dy, dx);
  
  // Convert to degrees (0-360, where 0 is east, 90 is north, 180 is west, 270 is south)
  let degrees = angle * (180 / Math.PI);
  
  // Normalize to 0-360 range
  if (degrees < 0) {
    degrees += 360;
  }
  
  // Convert from mathematical angle (0 = east, counterclockwise) to bearing (0 = north, clockwise)
  // Mathematical: 0° = East, 90° = North, 180° = West, 270° = South
  // Bearing: 0° = North, 90° = East, 180° = South, 270° = West
  // Formula: bearing = 90 - angle (then normalize to 0-360)
  degrees = 90 - degrees;
  if (degrees < 0) {
    degrees += 360;
  }
  
  // Convert to D*MM'SS.SS" format
  const d = Math.floor(degrees);
  const minutes = (degrees - d) * 60;
  const m = Math.floor(minutes);
  const seconds = (minutes - m) * 60;
  const s = seconds.toFixed(2);
  
  return `${d}*${String(m).padStart(2, '0')}'${String(s).padStart(5, '0')}"`;
}

function calculateDistanceFeet(dx, dy) {
  // Calculate distance in feet (assuming coordinates are already in feet)
  const distance = Math.sqrt(dx * dx + dy * dy);
  return parseFloat(distance.toFixed(4)); // Return as number, not string
}

// Task 2.3.7: DMS (Degrees Minutes Seconds) conversion functions
/**
 * Convert decimal degrees to DMS format (D*MM'SS.SS")
 * @param {number} decimalDegrees - Angle in decimal degrees (0-90 for bearing)
 * @returns {string} - Formatted string like "45*30'15.50""
 */
function decimalToDMS(decimalDegrees) {
  const d = Math.floor(decimalDegrees);
  const minutes = (decimalDegrees - d) * 60;
  const m = Math.floor(minutes);
  const seconds = (minutes - m) * 60;
  const s = seconds.toFixed(2);
  
  return `${d}*${String(m).padStart(2, '0')}'${String(s).padStart(5, '0')}"`;
}

/**
 * Convert DMS format (D*MM'SS.SS" or D°MM'SS.SS") to decimal degrees
 * @param {string} dmsString - DMS string like "45*30'15.50"" or "45°30'15.50""
 * @returns {number} - Decimal degrees (0-90 for bearing)
 */
function dmsToDecimal(dmsString) {
  if (!dmsString || typeof dmsString !== 'string') {
    throw new Error("Invalid DMS string");
  }
  
  // Remove whitespace
  dmsString = dmsString.trim();
  
  // Support both * and ° as degree separator
  const normalized = dmsString.replace(/°/g, '*');
  
  // Parse pattern: D*MM'SS.SS" or D*MM'SS"
  const pattern = /^(\d+)[*°](\d{1,2})['′](\d{1,2}(?:\.\d+)?)["″]?$/;
  const match = normalized.match(pattern);
  
  if (!match) {
    // Try to parse as just a decimal number
    const decimal = parseFloat(dmsString);
    if (!isNaN(decimal)) {
      return decimal;
    }
    throw new Error(`Invalid DMS format: ${dmsString}. Expected format: D*MM'SS.SS"`);
  }
  
  const degrees = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseFloat(match[3]);
  
  if (minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) {
    throw new Error(`Invalid DMS values: minutes=${minutes}, seconds=${seconds} (must be in range 0-59)`);
  }
  
  const decimal = degrees + (minutes / 60) + (seconds / 3600);
  return decimal;
}

/**
 * Convert azimuth (0-360°, North=0°, clockwise) to bearing (quadrant + 0-90°)
 * @param {number} azimuth - Azimuth in decimal degrees (0-360)
 * @returns {Object} - Object with {quadrant: string, bearing: number} where bearing is 0-90
 */
function azimuthToBearing(azimuth) {
  // Normalize azimuth to 0-360 range
  azimuth = azimuth % 360;
  if (azimuth < 0) azimuth += 360;
  
  let quadrant, bearing;
  
  if (0 <= azimuth && azimuth < 90) {
    // NE quadrant: Axis N is 0°, axis E is 90°
    quadrant = "NE";
    bearing = azimuth;
  } else if (90 <= azimuth && azimuth < 180) {
    // SE quadrant: Axis S is 0°, axis E is 90°
    quadrant = "SE";
    bearing = 180 - azimuth;
  } else if (180 <= azimuth && azimuth < 270) {
    // SW quadrant: Axis S is 0°, axis W is 90°
    quadrant = "SW";
    bearing = azimuth - 180;
  } else if (270 <= azimuth && azimuth < 360) {
    // NW quadrant: Axis N is 0°, axis W is 90°
    quadrant = "NW";
    bearing = 360 - azimuth;
  } else {
    // Should not happen, but handle edge case
    quadrant = "NE";
    bearing = 0.0;
  }
  
  return { quadrant, bearing };
}

// Make DMS conversion functions globally available for use in property-editor.js
window.decimalToDMS = decimalToDMS;
window.dmsToDecimal = dmsToDecimal;
window.azimuthToBearing = azimuthToBearing;

// SelectionSet class for managing multiple selected objects
class SelectionSet {
  constructor() {
    this.objects = []; // Array of { type: "point"|"segment", id: string, ... }
    this.createdAt = new Date();
  }
  
  /**
   * Add an object to the selection set
   * @param {Object} obj - Object with type and id properties
   */
  add(obj) {
    if (!obj || !obj.type || !obj.id) {
      console.warn("SelectionSet.add: Invalid object", obj);
      return;
    }
    
    // Check if object already exists
    const exists = this.objects.some(
      o => o.type === obj.type && o.id === obj.id
    );
    
    if (!exists) {
      this.objects.push(obj);
    }
  }
  
  /**
   * Add multiple objects to the selection set
   * @param {Array} objects - Array of objects with type and id properties
   */
  addMultiple(objects) {
    if (!Array.isArray(objects)) {
      console.warn("SelectionSet.addMultiple: Expected array", objects);
      return;
    }
    
    objects.forEach(obj => this.add(obj));
  }
  
  /**
   * Remove an object from the selection set
   * @param {string} type - Object type
   * @param {string} id - Object id
   */
  remove(type, id) {
    this.objects = this.objects.filter(
      o => !(o.type === type && o.id === id)
    );
  }
  
  /**
   * Clear all objects from the selection set
   */
  clear() {
    this.objects = [];
  }
  
  /**
   * Check if selection set is empty
   * @returns {boolean}
   */
  isEmpty() {
    return this.objects.length === 0;
  }
  
  /**
   * Get count of objects in selection set
   * @returns {number}
   */
  getCount() {
    return this.objects.length;
  }
  
  /**
   * Get all objects grouped by type
   * @returns {Object} Object with keys as types and values as arrays of objects
   */
  getByType() {
    const grouped = {};
    this.objects.forEach(obj => {
      if (!grouped[obj.type]) {
        grouped[obj.type] = [];
      }
      grouped[obj.type].push(obj);
    });
    return grouped;
  }
  
  /**
   * Get array of objects for deletion (with type and id)
   * @returns {Array} Array of { type, id } objects
   */
  getDeletionList() {
    return this.objects.map(obj => ({
      type: obj.type,
      id: obj.id
    }));
  }
}

let geometryViewer = null;
let propertyEditor = null;
let referenceLineActive = false;
let snapEnabled = false;
let currentSelectionSet = null; // Current SelectionSet instance
const actionHistory = [];
let currentRasterObjectUrl = null;

function recordAction(description) {
  actionHistory.push({
    description,
    timestamp: new Date()
  });
}

function showMessage(element, message, isError = false) {
  if (!element) {
    return;
  }
  element.textContent = message;
  element.classList.remove("hidden");
  element.style.color = isError ? "#dc2626" : "#2563eb";
}

function hideMessage(element) {
  if (!element) {
    return;
  }
  element.classList.add("hidden");
}

function initializeGeometryViewer() {
  const container = document.getElementById("geometry-viewer");
  if (!container) {
    return;
  }

  const rect = container.getBoundingClientRect();
  geometryViewer = new GeometryViewer("geometry-viewer", {
    width: rect.width || 800,
    height: rect.height || 600,
    backgroundColor: "#ffffff",
    padding: 20,
    snapEnabled: snapEnabled // Task 5.2.1.1: Pass snapEnabled in options
  });

  // Initialize property editor
  propertyEditor = new PropertyEditor(container);

  // Task 3.2.1: Setup callback to close property window when starting to edit line point
  geometryViewer.onLinePointEditStart = () => {
    if (propertyEditor) {
      propertyEditor.hide();
    }
  };
  
  // Task 4.1: Setup callback to close property window when starting to edit point
  geometryViewer.onPointEditStart = () => {
    if (propertyEditor) {
      propertyEditor.hide();
    }
  };
  
  // Task 4.5: Setup point update handler
  geometryViewer.onPointUpdate = async (pointId, newX, newY) => {
    console.log("Point update:", { pointId, newX, newY });
    
    const getSiteSessionId = () => {
      if (window.siteSessionData && window.siteSessionData.id) {
        return window.siteSessionData.id;
      }
      const urlParams = new URLSearchParams(window.location.search);
      const siteSessionId = urlParams.get("site_session_id");
      return siteSessionId ? parseInt(siteSessionId, 10) : null;
    };
    
    const siteSessionId = getSiteSessionId();
    if (!siteSessionId) {
      console.error("No site session ID available");
      return;
    }
    
    // Find the point to get current layer and attributes
    if (!geometryViewer || !geometryViewer.data || !geometryViewer.data.points) {
      console.error("Cannot find point data");
      return;
    }
    
    const point = geometryViewer.data.points.find(p => p.id === pointId);
    if (!point) {
      console.error("Point not found");
      return;
    }
    
    // Prepare update data - same API endpoint as property window
    const updateData = {
      x: newX,
      y: newY,
      layer: point.layer || ""
    };
    
    try {
      console.log("Sending point update request:", {
        url: `/api/geometry/${siteSessionId}/point/${pointId}`,
        method: "PUT",
        data: updateData
      });
      
      const response = await fetch(`/api/geometry/${siteSessionId}/point/${pointId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(updateData)
      });
      
      console.log("Update response status:", response.status, response.statusText);
      
      if (response.ok) {
        const result = await response.json();
        console.log("Point updated successfully:", result);
        
        // Reload geometry to show updated point
        if (geometryViewer) {
          try {
            console.log("Reloading geometry from server...");
            const reloadResponse = await fetch(`/api/geometry/${siteSessionId}`);
            if (reloadResponse.ok) {
              const data = await reloadResponse.json();
              geometryViewer.loadData(data, true);
              geometryViewer.render();
              
              // Close property editor if open
              if (propertyEditor) {
                propertyEditor.hide();
              }
            } else {
              const errorText = await reloadResponse.text();
              console.error("Failed to reload geometry:", reloadResponse.status, errorText);
            }
          } catch (error) {
            console.error("Error reloading geometry:", error);
          }
        }
      } else {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText || "Unknown error" };
        }
        console.error("Failed to update point:", response.status, errorData);
        alert(`Failed to update point: ${errorData.message || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error updating point:", error);
      alert("An error occurred while updating the point: " + error.message);
    }
  };
  
  // Task 3.2.5: Setup line point update handler
  geometryViewer.onLinePointUpdate = async (segmentId, pointType, newX, newY) => {
    console.log("Line point update:", { segmentId, pointType, newX, newY });
    
    const getSiteSessionId = () => {
      if (window.siteSessionData && window.siteSessionData.id) {
        return window.siteSessionData.id;
      }
      const urlParams = new URLSearchParams(window.location.search);
      const siteSessionId = urlParams.get("site_session_id");
      return siteSessionId ? parseInt(siteSessionId, 10) : null;
    };
    
    const siteSessionId = getSiteSessionId();
    if (!siteSessionId) {
      console.error("No site session ID available");
      return;
    }
    
    // Find the segment to get current coordinates
    if (!geometryViewer || !geometryViewer.data || !geometryViewer.data.segments) {
      console.error("Cannot find segment data");
      return;
    }
    
    const segment = geometryViewer.data.segments.find(s => s.id === segmentId);
    if (!segment || !segment.start || !segment.end) {
      console.error("Segment not found or invalid format");
      return;
    }
    
    // Prepare update data based on which point is being edited
    let updateData;
    if (pointType === "start") {
      updateData = {
        startX: newX,
        startY: newY,
        endX: segment.end.x,
        endY: segment.end.y,
        layer: segment.layer || ""
      };
    } else if (pointType === "end") {
      updateData = {
        startX: segment.start.x,
        startY: segment.start.y,
        endX: newX,
        endY: newY,
        layer: segment.layer || ""
      };
    } else {
      console.error("Invalid point type:", pointType);
      return;
    }
    
    try {
      console.log("Sending line point update request:", {
        url: `/api/geometry/${siteSessionId}/segment/${segmentId}`,
        method: "PUT",
        data: updateData
      });
      
      const response = await fetch(`/api/geometry/${siteSessionId}/segment/${segmentId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(updateData)
      });
      
      console.log("Update response status:", response.status, response.statusText);
      
      if (response.ok) {
        const result = await response.json();
        console.log("Line point updated successfully:", result);
        
        // Reload geometry to show updated segment
        if (geometryViewer) {
          try {
            console.log("Reloading geometry from server...");
            const reloadResponse = await fetch(`/api/geometry/${siteSessionId}`);
            if (reloadResponse.ok) {
              const data = await reloadResponse.json();
              geometryViewer.loadData(data, true);
              geometryViewer.render();
              
              // Close property editor if open
              if (propertyEditor) {
                propertyEditor.hide();
              }
            } else {
              const errorText = await reloadResponse.text();
              console.error("Failed to reload geometry:", reloadResponse.status, errorText);
            }
          } catch (error) {
            console.error("Error reloading geometry:", error);
          }
        }
      } else {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText || "Unknown error" };
        }
        console.error("Failed to update line point:", response.status, errorData);
        alert(`Failed to update line point: ${errorData.message || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error updating line point:", error);
      alert("An error occurred while updating the line point: " + error.message);
    }
  };

  geometryViewer.onArcPointEditStart = () => {
    if (propertyEditor) propertyEditor.hide();
  };

  geometryViewer.onArcPointUpdate = async (segmentId, pointType, newX, newY, originalSegment) => {
    const getSiteSessionId = () => {
      if (window.siteSessionData && window.siteSessionData.id) return window.siteSessionData.id;
      const urlParams = new URLSearchParams(window.location.search);
      const sid = urlParams.get("site_session_id");
      return sid ? parseInt(sid, 10) : null;
    };
    const siteSessionId = getSiteSessionId();
    if (!siteSessionId) { console.error("No site session ID"); return; }
    if (!originalSegment || !originalSegment.center) { console.error("No original segment"); return; }
    const cx = originalSegment.center.x, cy = originalSegment.center.y, r = originalSegment.radius;
    const rot = originalSegment.rotation || originalSegment.rot || "cw";
    const start = originalSegment.start || { x: originalSegment.startX, y: originalSegment.startY };
    const end = originalSegment.end || { x: originalSegment.endX, y: originalSegment.endY };
    const dx = start.x - cx, dy = start.y - cy;
    const a1 = Math.atan2(dx, dy);
    const deltaRad = (originalSegment.delta != null ? originalSegment.delta * Math.PI / 180 : 0);
    const midAngle = rot === "ccw" ? a1 + deltaRad / 2 : a1 - deltaRad / 2;
    const mid = { x: cx + r * Math.sin(midAngle), y: cy + r * Math.cos(midAngle) };
    let pt1, pt2, pt3;
    if (pointType === "center") {
      try {
        await arcApi.moveCenter(siteSessionId, segmentId, { x: newX, y: newY });
        const reloadResponse = await fetch(`/api/geometry/${siteSessionId}`);
        if (reloadResponse.ok) {
          const data = await reloadResponse.json();
          if (geometryViewer) { geometryViewer.loadData(data, true); geometryViewer.render(); }
          if (propertyEditor) propertyEditor.hide();
        }
      } catch (e) {
        console.error(e);
        alert(e.message || "Error moving arc center");
      }
      return;
    }
    if (pointType === "start") { pt1 = { x: newX, y: newY }; pt2 = mid; pt3 = end; }
    else if (pointType === "mid") { pt1 = start; pt2 = { x: newX, y: newY }; pt3 = end; }
    else { pt1 = start; pt2 = mid; pt3 = { x: newX, y: newY }; }
    try {
      await arcApi.updateFromThreePoints(siteSessionId, segmentId, pt1, pt2, pt3, { rotation: rot });
      const reloadResponse = await fetch(`/api/geometry/${siteSessionId}`);
      if (reloadResponse.ok) {
        const data = await reloadResponse.json();
        if (geometryViewer) { geometryViewer.loadData(data, true); geometryViewer.render(); }
        if (propertyEditor) propertyEditor.hide();
      }
    } catch (e) {
      console.error(e);
      alert(e.message || "Error updating arc");
    }
  };
  
  // Setup object click handler
  geometryViewer.onObjectClick = (object, position) => {
    console.log("Object clicked:", object, position);
    
    // Store selected object (already stored in geometryViewer.selectedObject by geometry-viewer)
    // But ensure it's set here as well for consistency
    geometryViewer.selectedObject = object;
    
    // If it's a segment, calculate properties if they're missing
    if (object.type === "segment") {
      // Always calculate distance from coordinates (it might be missing)
      const dx = object.endX - object.startX;
      const dy = object.endY - object.startY;
      const distance = calculateDistanceFeet(dx, dy);
      
      // Backend sends 'bearing' field which is actually azimuth (0-360°)
      // We need to convert it to bearing format (quadrant + 0-90°)
      if (object.bearing !== undefined && typeof object.bearing === 'number') {
        // Check if it's azimuth (0-360) or already bearing (0-90)
        if (object.bearing > 90) {
          // It's azimuth, convert to bearing
          const bearingData = azimuthToBearing(object.bearing);
          object.quadrant = bearingData.quadrant;
          object.bearing = bearingData.bearing; // Now it's 0-90° bearing
        } else {
          // It's already bearing (0-90°), but quadrant might be missing
          // Calculate quadrant from coordinates if not set
          if (!object.quadrant) {
            // Calculate azimuth from coordinates, then convert to bearing to get quadrant
            let angle = Math.atan2(dy, dx);
            let degrees = angle * (180 / Math.PI);
            if (degrees < 0) degrees += 360;
            // Convert to azimuth (North=0°, clockwise)
            let azimuth = (90 - degrees) % 360;
            if (azimuth < 0) azimuth += 360;
            // Convert azimuth to bearing to get correct quadrant
            const bearingData = azimuthToBearing(azimuth);
            object.quadrant = bearingData.quadrant;
            // Keep the existing bearing value (it's already correct)
          }
        }
        // Always set distance (it might be missing even if bearing exists)
        object.distance = distance;
      } else if (!object.quadrant || object.bearing === undefined || !object.distance) {
        // Calculate from coordinates if not provided
        object.quadrant = calculateQuadrant(dx, dy);
        // calculateBearing returns DMS string, but we need decimal for calculations
        // Calculate azimuth first, then convert to bearing
        let angle = Math.atan2(dy, dx);
        let degrees = angle * (180 / Math.PI);
        if (degrees < 0) degrees += 360;
        // Convert to azimuth (North=0°, clockwise)
        let azimuth = (90 - degrees) % 360;
        if (azimuth < 0) azimuth += 360;
        // Convert azimuth to bearing
        const bearingData = azimuthToBearing(azimuth);
        object.quadrant = bearingData.quadrant;
        object.bearing = bearingData.bearing; // 0-90° decimal
        object.distance = distance;
      }
    }
    
    propertyEditor.show(
      object,
      position,
      (values) => {
        // Save handler
        handleObjectUpdate(values);
      },
      () => {
        // Cancel handler
        console.log("Property editor cancelled");
        // Re-render to show selected state
        if (geometryViewer) {
          geometryViewer.render();
        }
      }
    );
  };

  window.addEventListener("resize", () => {
    if (!geometryViewer) {
      return;
    }
    const newRect = container.getBoundingClientRect();
    geometryViewer.resize(newRect.width, newRect.height);
  });
}

// Handle object update
async function handleObjectUpdate(values) {
  const getSiteSessionId = () => {
    if (window.siteSessionData && window.siteSessionData.id) {
      return window.siteSessionData.id;
    }
    const urlParams = new URLSearchParams(window.location.search);
    const siteSessionId = urlParams.get("site_session_id");
    return siteSessionId ? parseInt(siteSessionId, 10) : null;
  };

  const siteSessionId = getSiteSessionId();
  if (!siteSessionId) {
    console.error("No site session ID available");
    return;
  }

  if (values && values.type === "point") {
    try {
      // Prepare update data - always include all fields
      const updateData = {
        x: values.x,
        y: values.y,
        layer: values.layer || ""
      };

      console.log("handleObjectUpdate called with values:", values);
      console.log("Sending update request:", { 
        url: `/api/geometry/${siteSessionId}/point/${values.id}`,
        method: "PUT",
        data: updateData 
      });

      const response = await fetch(`/api/geometry/${siteSessionId}/point/${values.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(updateData)
      });

      console.log("Update response status:", response.status, response.statusText);

      if (response.ok) {
        const result = await response.json();
        console.log("Point updated successfully on server:", result);
        
        // Reload geometry to show updated point, but preserve view
        if (geometryViewer) {
          try {
            console.log("Reloading geometry from server...");
            const reloadResponse = await fetch(`/api/geometry/${siteSessionId}`);
            if (reloadResponse.ok) {
              const data = await reloadResponse.json();
              console.log("Geometry reloaded from server, points:", data.points);
              // Load data without changing view (preserve zoom and position)
              geometryViewer.loadData(data, true);
              console.log("Geometry loaded into viewer, data:", geometryViewer.data);
              // Force re-render to show updated point position
              geometryViewer.render();
              console.log("Render complete, changes should be visible now");
              
              // Close property editor after successful update
              if (propertyEditor) {
                propertyEditor.hide();
              }
            } else {
              const errorText = await reloadResponse.text();
              console.error("Failed to reload geometry:", reloadResponse.status, errorText);
            }
          } catch (error) {
            console.error("Error reloading geometry:", error);
          }
        } else {
          console.error("GeometryViewer is not available");
        }
      } else {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText || "Unknown error" };
        }
        console.error("Failed to update point:", response.status, errorData);
        alert(`Failed to update point: ${errorData.message || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error updating point:", error);
      alert("An error occurred while updating the point: " + error.message);
    }
  } else if (values && values.type === "segment") {
    try {
      console.log("handleObjectUpdate called with segment values:", values);
      
      let response;
      
      if (values.segmentType === "arc" && values.activeBlock === "arc-params" && values.center) {
        await arcApi.moveCenter(siteSessionId, values.id, values.center);
        response = { ok: true, json: async () => ({}) };
      } else if (values.segmentType === "arc" && values.activeBlock === "arc-points") {
        const updateData = {
          startX: values.startX,
          startY: values.startY,
          endX: values.endX,
          endY: values.endY,
          layer: values.layer || ""
        };
        await arcApi.updateSegment(siteSessionId, values.id, updateData);
        response = { ok: true, json: async () => ({}) };
      } else if (values.activeBlock === "bearings") {
        // Send request to recalculation endpoint (Task 1.2.3)
        const updateData = {
          quadrant: values.quadrant,
          bearing: values.bearing, // Already in decimal degrees
          distance: values.distance,
          blockedPoint: "start_pt" // Default, could be made configurable
        };
        
        console.log("Sending recalculation request:", { 
          url: `/api/geometry/${siteSessionId}/segment/${values.id}/recalculate`,
          method: "PUT",
          data: updateData 
        });
        
        response = await fetch(`/api/geometry/${siteSessionId}/segment/${values.id}/recalculate`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(updateData)
        });
      } 
      // Task 2.3.6: If points block is opened
      else if (values.activeBlock === "points") {
        // Send request to existing update endpoint
        const updateData = {
          startX: values.startX,
          startY: values.startY,
          endX: values.endX,
          endY: values.endY,
          layer: values.layer || ""
        };
        
        console.log("Sending update request:", { 
          url: `/api/geometry/${siteSessionId}/segment/${values.id}`,
          method: "PUT",
          data: updateData 
        });
        
        response = await fetch(`/api/geometry/${siteSessionId}/segment/${values.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(updateData)
        });
      } else {
        throw new Error("Unknown active block type");
      }

      console.log("Update response status:", response.status, response.statusText);

      if (response.ok) {
        const result = await response.json();
        console.log("Segment updated successfully on server:", result);
        
        // Reload geometry to show updated segment, but preserve view
        if (geometryViewer) {
          try {
            console.log("Reloading geometry from server...");
            const reloadResponse = await fetch(`/api/geometry/${siteSessionId}`);
            if (reloadResponse.ok) {
              const data = await reloadResponse.json();
              console.log("Geometry reloaded from server, segments:", data.segments);
              geometryViewer.loadData(data, true);
              console.log("Geometry loaded into viewer, rendering...");
              geometryViewer.render();
              console.log("Render complete, changes should be visible now");
              
              // Close property editor after successful update
              if (propertyEditor) {
                propertyEditor.hide();
              }
            } else {
              const errorText = await reloadResponse.text();
              console.error("Failed to reload geometry:", reloadResponse.status, errorText);
            }
          } catch (error) {
            console.error("Error reloading geometry:", error);
          }
        } else {
          console.error("GeometryViewer is not available");
        }
      } else {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { message: errorText || "Unknown error" };
        }
        console.error("Failed to update segment:", response.status, errorData);
        alert(`Failed to update segment: ${errorData.message || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error updating segment:", error);
      alert("An unexpected error occurred while updating the segment.");
    }
  } else {
    console.error("Invalid values for update:", values);
  }
}

function setupGeometryControls() {
  const fitToViewButtons = [
    document.getElementById("fit-to-view"),
    document.getElementById("control-fit-to-view")
  ];
  fitToViewButtons.forEach((button) => {
    if (!button) {
      return;
    }
    button.addEventListener("click", () => {
      if (geometryViewer) {
        geometryViewer.resetView();
      }
    });
  });

  const loadButton = document.getElementById("load-geojson");
  if (loadButton) {
    loadButton.addEventListener("click", () => {
      const textarea = document.getElementById("json-input");
      if (!textarea || !geometryViewer) {
        // eslint-disable-next-line no-alert
        alert("Viewer is not initialized yet.");
        return;
      }
      try {
        const jsonData = JSON.parse(textarea.value);
        geometryViewer.loadData(jsonData);
      } catch (error) {
        const message =
          (error && typeof error === "object" && "message" in error
            ? error.message
            : error) || "Invalid JSON";
        // eslint-disable-next-line no-alert
        alert(`Invalid JSON: ${message}`);
        console.error("JSON parsing error:", error);
      }
    });
  }
}

function handleSelectedFile(file, statusElement) {
  const allowedTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/tiff"
  ];
  if (!allowedTypes.includes(file.type)) {
    showMessage(
      statusElement,
      "Unsupported file type. Please select a PDF or raster image.",
      true
    );
    return;
  }
  const sizeInMb = (file.size / (1024 * 1024)).toFixed(2);
  showMessage(statusElement, `Selected "${file.name}" (${sizeInMb} MB).`, false);
}

// Extract filename from imageUrl
function extractImageFilename(imageUrl) {
  // Remove query parameters
  const urlWithoutParams = imageUrl.split('?')[0];
  
  // Extract filename from path
  const pathParts = urlWithoutParams.split('/');
  const filename = pathParts[pathParts.length - 1];
  
  // Remove extension for alignment.json filename
  const nameWithoutExt = filename.replace(/\.(png|jpg|jpeg)$/i, '');
  
  return {
    fullFilename: filename,
    nameWithoutExt: nameWithoutExt
  };
}

async function displayRasterPreview(imageUrl, statusElement, metadata = {}) {
  if (!imageUrl) {
    if (geometryViewer && typeof geometryViewer.setRasterSource === "function") {
      geometryViewer.setRasterSource(null);
    }
    return;
  }

  try {
    const response = await fetch(`${imageUrl}?t=${Date.now()}`, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch raster preview (status ${response.status})`);
    }

    const blob = await response.blob();
    if (currentRasterObjectUrl) {
      URL.revokeObjectURL(currentRasterObjectUrl);
    }
    currentRasterObjectUrl = URL.createObjectURL(blob);

    if (geometryViewer && typeof geometryViewer.setRasterSource === "function") {
      const width =
        Number.isFinite(metadata?.imageWidth) && metadata.imageWidth !== null
          ? Number(metadata.imageWidth)
          : null;
      const height =
        Number.isFinite(metadata?.imageHeight) && metadata.imageHeight !== null
          ? Number(metadata.imageHeight)
          : null;
      const size =
        width !== null && height !== null ? { width, height } : undefined;
      const boundaryBox = metadata?.boundaryBox || null;

      geometryViewer.setRasterSource(currentRasterObjectUrl, {
        boundaryBox,
        size
      });

      // Use alignment from class (initial payload or metadata), else fetch from API
      const preloadedAlignment =
        metadata?.alignment ??
        (window.siteSessionData?.paths?.alignment || null);

      if (preloadedAlignment && typeof geometryViewer.setImageAlignment === "function") {
        geometryViewer.setImageAlignment(preloadedAlignment);
      } else {
        try {
          const getSiteSessionId = () => {
            if (window.siteSessionData && window.siteSessionData.id) {
              return window.siteSessionData.id;
            }
            const urlParams = new URLSearchParams(window.location.search);
            const siteSessionId = urlParams.get("site_session_id");
            return siteSessionId ? parseInt(siteSessionId, 10) : null;
          };

          const siteSessionId = getSiteSessionId();
          if (siteSessionId) {
            const { nameWithoutExt } = extractImageFilename(imageUrl);
            const alignmentUrl = `/api/alignment/${siteSessionId}/${nameWithoutExt}.png`;

            const alignmentResponse = await fetch(alignmentUrl);
            if (alignmentResponse.ok) {
              const alignmentData = await alignmentResponse.json();
              if (geometryViewer && typeof geometryViewer.setImageAlignment === "function") {
                geometryViewer.setImageAlignment(alignmentData);
              }
            } else if (alignmentResponse.status === 404) {
              console.log("Alignment file not found, using defaults");
            } else {
              console.warn("Failed to load alignment:", alignmentResponse.status);
            }
          }
        } catch (alignmentError) {
          console.warn("Error loading alignment.json:", alignmentError);
        }
      }
    }
  } catch (error) {
    console.error("Failed to display raster preview:", error);
    if (statusElement) {
      showMessage(
        statusElement,
        "Raster preview is unavailable. Check server logs for details.",
        true
      );
    }
  }
}

function setupUploadControls() {
  const form = document.getElementById("upload-form");
  const dropzone = document.getElementById("upload-dropzone");
  const input = document.getElementById("document-input");
  const status = document.getElementById("upload-status");

  if (!form || !dropzone || !input) {
    return;
  }

  dropzone.addEventListener("click", () => {
    input.click();
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropzone.classList.remove("dragover");
    });
  });

  dropzone.addEventListener("drop", (event) => {
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) {
      return;
    }
    input.files = files;
    handleSelectedFile(files[0], status);
  });

  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) {
      hideMessage(status);
      return;
    }
    handleSelectedFile(file, status);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = input.files && input.files[0];
    if (!file) {
      showMessage(
        status,
        "Please select a document before uploading.",
        true
      );
      return;
    }
    showMessage(status, `Uploading "${file.name}"...`, false);

    const formData = new FormData();
    formData.append("document", file);

    // Get site_session_id from window.siteSessionData or URL parameters
    let siteSessionId = null;
    if (window.siteSessionData && window.siteSessionData.id) {
      siteSessionId = window.siteSessionData.id;
    } else {
      // Fallback: extract site_session_id from current page URL
      const urlParams = new URLSearchParams(window.location.search);
      const urlSessionId = urlParams.get("site_session_id");
      if (urlSessionId) {
        siteSessionId = parseInt(urlSessionId, 10);
      }
    }

    // Check if site_session_id is available
    if (!siteSessionId) {
      showMessage(
        status,
        "Site session ID is required. Please open drafter with a site session (e.g., /drafter?site_session_id=1).",
        true
      );
      return;
    }

    // Add site_session_id to URL and FormData
    const uploadUrl = `/api/upload-document?site_session_id=${siteSessionId}`;
    formData.append("site_session_id", siteSessionId);

    try {
      const response = await fetch(uploadUrl, {
        method: "POST",
        body: formData
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = payload?.message || "Upload failed. Please try again.";
        showMessage(status, message, true);
        return;
      }

      const storedInfo = payload?.payload;
      const storedPng = storedInfo?.storedFilename || "PNG file";
      const storedOriginal = storedInfo?.originalStoredFilename || "original file";
      const warnings = Array.isArray(storedInfo?.warnings)
        ? storedInfo.warnings
        : [];
      const imageUrl = storedInfo?.imageUrl;

      const successMessage =
        payload?.message ||
        `Upload complete. PNG copy: ${storedPng}. Original saved as: ${storedOriginal}.`;
      const warningMessage =
        warnings.length > 0 ? ` Warning: ${warnings.join(" ")}` : "";

      showMessage(status, `${successMessage}${warningMessage}`, false);

      if (imageUrl) {
        await displayRasterPreview(imageUrl, status, storedInfo);
      }
      recordAction(`Document "${file.name}" uploaded successfully.`);
      input.value = "";
    } catch (error) {
      console.error("Upload failed:", error);
      showMessage(status, "An unexpected error occurred during upload.", true);
    }
  });
}

function setupExportControls() {
  const exportButtons = [
    { element: document.getElementById("export-dxf"), label: "DXF" },
    { element: document.getElementById("export-xml"), label: "XML" }
  ];

  exportButtons.forEach(({ element, label }) => {
    if (!element) {
      return;
    }
    element.addEventListener("click", () => {
      // eslint-disable-next-line no-alert
      alert(`${label} export will be available soon.`);
    });
  });
}

function setupDrawingControls() {
  // Setup handlers for drawing control buttons
  console.log("setupDrawingControls called");
  
  const drawingControls = document.querySelector(".drawing-controls");
  if (!drawingControls) {
    console.warn("Drawing controls container not found. Retrying in 100ms...");
    setTimeout(setupDrawingControls, 100);
    return;
  }
  
  console.log("Drawing controls container found:", drawingControls);
  
  const drawingButtons = drawingControls.querySelectorAll(".drawing-btn");
  
  if (drawingButtons.length === 0) {
    console.warn("No drawing buttons found. Retrying in 100ms...");
    setTimeout(setupDrawingControls, 100);
    return;
  }
  
  console.log(`Found ${drawingButtons.length} drawing buttons:`, Array.from(drawingButtons).map(btn => ({
    mode: btn.dataset.mode,
    state: btn.dataset.state,
    hasActiveClass: btn.classList.contains("active")
  })));
  
  let currentMode = null; // No mode selected initially
  
  // Get site session ID
  const getSiteSessionId = () => {
    if (window.siteSessionData && window.siteSessionData.id) {
      return window.siteSessionData.id;
    }
    const urlParams = new URLSearchParams(window.location.search);
    const siteSessionId = urlParams.get("site_session_id");
    return siteSessionId ? parseInt(siteSessionId, 10) : null;
  };
  
  // Load current geometry from server
  const loadGeometry = async (preserveView = false) => {
    const siteSessionId = getSiteSessionId();
    if (!siteSessionId) {
      console.warn("No site session ID available");
      return null;
    }
    
    try {
      const response = await fetch(`/api/geometry/${siteSessionId}`);
      if (response.ok) {
        const data = await response.json();
        if (geometryViewer) {
          geometryViewer.loadData(data, preserveView);
        }
        return data;
      }
    } catch (error) {
      console.error("Failed to load geometry:", error);
    }
    return null;
  };
  
  // Save point to server
  const savePoint = async (x, y) => {
    const siteSessionId = getSiteSessionId();
    if (!siteSessionId) {
      console.error("No site session ID available");
      return;
    }
    
    try {
      const response = await fetch(`/api/geometry/${siteSessionId}/point`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ x, y })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log("Point saved:", result);
        // Reload geometry to show new point, but preserve current view
        if (geometryViewer) {
          try {
            const reloadResponse = await fetch(`/api/geometry/${siteSessionId}`);
            if (reloadResponse.ok) {
              const data = await reloadResponse.json();
              // Load data without changing view (preserve zoom and position)
              geometryViewer.loadData(data, true);
            }
          } catch (error) {
            console.error("Failed to reload geometry:", error);
          }
        }
      } else {
        const error = await response.json();
        console.error("Failed to save point:", error);
      }
    } catch (error) {
      console.error("Error saving point:", error);
    }
  };
  
  // Handle point click
  const handlePointClick = (x, y, canvasX, canvasY) => {
    console.log(`Point clicked at world coordinates: (${x.toFixed(3)}, ${y.toFixed(3)})`);
    savePoint(x, y);
  };
  
  // Save segment to server
  const saveSegment = async (startX, startY, endX, endY) => {
    const siteSessionId = getSiteSessionId();
    if (!siteSessionId) {
      console.error("No site session ID available");
      return;
    }
    
    try {
      const response = await fetch(`/api/geometry/${siteSessionId}/segment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          startX: startX,
          startY: startY,
          endX: endX,
          endY: endY
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log("Segment saved successfully:", result);
        
        // Reload geometry to show new segment, but preserve view
        const data = await loadGeometry(true);
        if (data && data.segments && data.segments.length > 0) {
          const newSegment = data.segments[data.segments.length - 1];
          
          // Calculate properties
          const dx = endX - startX;
          const dy = endY - startY;
          
          // Calculate azimuth from coordinates (same as backend does)
          let angle = Math.atan2(dy, dx);
          let degrees = angle * (180 / Math.PI);
          if (degrees < 0) degrees += 360;
          // Convert to azimuth (North=0°, clockwise)
          let azimuth = (90 - degrees) % 360;
          if (azimuth < 0) azimuth += 360;
          
          // Convert azimuth to bearing (quadrant + 0-90° decimal)
          const bearingData = azimuthToBearing(azimuth);
          const quadrant = bearingData.quadrant;
          const bearingDecimal = bearingData.bearing; // 0-90° decimal
          const distance = calculateDistanceFeet(dx, dy);
          
          // Open property editor with segment properties
          if (propertyEditor && geometryViewer) {
            const canvasPos = geometryViewer.worldToCanvas(endX, endY);
            const containerRect = document.getElementById("geometry-viewer").getBoundingClientRect();
            const position = {
              x: containerRect.left + canvasPos.x,
              y: containerRect.top + canvasPos.y
            };
            
            propertyEditor.show(
              {
                type: "segment",
                id: newSegment.id,
                startX: startX,
                startY: startY,
                endX: endX,
                endY: endY,
                quadrant: quadrant,
                bearing: bearingDecimal, // Decimal 0-90° (not DMS string)
                distance: distance,
                layer: newSegment.layer || ""
              },
              position,
              (values) => {
                // Save handler - segment properties are read-only for now
                console.log("Segment properties updated:", values);
              },
              () => {
                // Cancel handler
                console.log("Property editor cancelled");
              }
            );
          }
        }
      } else {
        const errorText = await response.text();
        console.error("Failed to save segment:", response.status, errorText);
      }
    } catch (error) {
      console.error("Error saving segment:", error);
    }
  };
  
  // Handle segment click (two points)
  const handleSegmentClick = (startX, startY, endX, endY, canvasX, canvasY) => {
    console.log(`Segment: start (${startX.toFixed(3)}, ${startY.toFixed(3)}), end (${endX.toFixed(3)}, ${endY.toFixed(3)})`);
    saveSegment(startX, startY, endX, endY);
  };

  // Arc by tangent & radius: one click → open params form; Apply → API
  const add_arc_by_tan_radius_rotation = (worldPoint, tangentOrNull) => {
    if (!propertyEditor || !geometryViewer) return;
    const siteSessionId = getSiteSessionId();
    if (!siteSessionId) {
      console.error("No site session ID available");
      return;
    }
    const canvasPos = geometryViewer.worldToCanvas(worldPoint.x, worldPoint.y);
    const containerEl = document.getElementById("geometry-viewer");
    const containerRect = containerEl ? containerEl.getBoundingClientRect() : { left: 0, top: 0 };
    const position = { x: containerRect.left + canvasPos.x, y: containerRect.top + canvasPos.y };

    propertyEditor.show(
      {
        type: "arc-tan-radius-params",
        pt1: { x: worldPoint.x, y: worldPoint.y },
        tang: tangentOrNull != null && !Number.isNaN(tangentOrNull) ? tangentOrNull : undefined,
        radius: "",
        rotation: "cw",
        length: "",
        delta: ""
      },
      position,
      async (values) => {
        if (values.type !== "arc-tan-radius-params") return;
        try {
          await arcApi.createByTanRadiusRotation(siteSessionId, {
            pt1: values.pt1,
            tang: values.tang,
            radius: values.radius,
            rotation: values.rotation,
            length: values.length,
            delta: values.delta
          });
          await loadGeometry();
          propertyEditor.hide();
        } catch (err) {
          console.error("Error creating arc by tan/radius:", err);
          alert(err.message || "Error creating arc");
        }
      },
      () => { propertyEditor.hide(); }
    );
  };

  // Task 6.1.5.2: Save arc from three points and open property editor
  const saveArcFromThreePoints = async (pt1, pt2, pt3) => {
    const siteSessionId = getSiteSessionId();
    if (!siteSessionId) {
      console.error("No site session ID available");
      return;
    }
    try {
      const result = await arcApi.createFromThreePoints(siteSessionId, pt1, pt2, pt3);
      const data = await loadGeometry(true);
      if (data && result.arc && propertyEditor && geometryViewer) {
        const canvasPos = geometryViewer.worldToCanvas(result.arc.end.x, result.arc.end.y);
        const containerRect = document.getElementById("geometry-viewer").getBoundingClientRect();
        propertyEditor.show(
          {
            type: "segment",
            id: result.arc.id,
            segmentType: "arc",
            startX: result.arc.start.x,
            startY: result.arc.start.y,
            endX: result.arc.end.x,
            endY: result.arc.end.y,
            center: result.arc.center,
            radius: result.arc.radius,
            rotation: result.arc.rotation || result.arc.rot,
            delta: result.arc.delta,
            length: result.arc.length,
            layer: result.arc.layer || ""
          },
          { x: containerRect.left + canvasPos.x, y: containerRect.top + canvasPos.y },
          (values) => handleObjectUpdate(values),
          () => {}
        );
      }
    } catch (error) {
      console.error("Error saving arc:", error);
      alert(error.message || "Error creating arc");
    }
  };

  // Update button states
  const updateButtonStates = (activeMode) => {
    console.log(`updateButtonStates called with activeMode: ${activeMode}`);
    drawingButtons.forEach((button) => {
      const mode = button.dataset.mode;
      // Skip toggle buttons that maintain their own state
      if (mode === "snap" || mode === "undo" || mode === "delete" || mode === "redo" || mode === "layers" || mode === "table" || mode === "arc-three-points" || mode === "arc-tangent" || mode === "arc-fillet") {
        return;
      }
      // Arc dropdown trigger is active when arc-by-three-points or arc-by-tangent mode is on
      if (mode === "arc-dropdown") {
        const isActive = activeMode === "arcs-three-points" || activeMode === "arcs-tan-radius";
        button.dataset.state = isActive ? "active" : "inactive";
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
        button.classList.toggle("active", isActive);
        return;
      }
      if (mode === activeMode) {
        console.log(`Activating button: ${mode}`);
        button.dataset.state = "active";
        button.setAttribute("aria-pressed", "true");
        button.classList.add("active");
        console.log(`Button ${mode} state after update:`, {
          datasetState: button.dataset.state,
          ariaPressed: button.getAttribute("aria-pressed"),
          hasActiveClass: button.classList.contains("active"),
          classList: Array.from(button.classList)
        });
      } else {
        button.dataset.state = "inactive";
        button.setAttribute("aria-pressed", "false");
        button.classList.remove("active");
      }
    });
  };
  
  // Handle polygon selection completion
  const handlePolygonSelect = (polygonPoints) => {
    console.log("Polygon selection completed with points:", polygonPoints);
    // Find all objects within the polygon
    if (!geometryViewer || !geometryViewer.data) {
      return;
    }
    
    const selectedObjects = [];
    
    // Check points
    if (geometryViewer.data.points) {
      geometryViewer.data.points.forEach((point) => {
        if (isPointInPolygon(point.x, point.y, polygonPoints)) {
          selectedObjects.push({ type: "point", ...point });
        }
      });
    }
    
    // Check segments
    if (geometryViewer.data.segments) {
      geometryViewer.data.segments.forEach((segment) => {
        // Handle both data formats: {startX, startY, endX, endY} and {start: {x, y}, end: {x, y}}
        let startX, startY, endX, endY;
        
        if (segment.start && segment.end) {
          // New format: {start: {x, y}, end: {x, y}}
          startX = segment.start.x;
          startY = segment.start.y;
          endX = segment.end.x;
          endY = segment.end.y;
        } else if (segment.startX !== undefined && segment.startY !== undefined) {
          // Old format: {startX, startY, endX, endY}
          startX = segment.startX;
          startY = segment.startY;
          endX = segment.endX;
          endY = segment.endY;
        } else {
          // Skip invalid segment
          return;
        }
        
        // Check if segment start or end point is in polygon, or if segment intersects polygon
        if (isPointInPolygon(startX, startY, polygonPoints) ||
            isPointInPolygon(endX, endY, polygonPoints) ||
            segmentIntersectsPolygon({ startX, startY, endX, endY }, polygonPoints)) {
          selectedObjects.push({ 
            type: "segment", 
            id: segment.id,
            startX, 
            startY, 
            endX, 
            endY,
            ...segment 
          });
        }
      });
    }
    
    console.log("Selected objects:", selectedObjects);
    recordAction(`Polygon selection: ${selectedObjects.length} object(s) selected.`);
    
    // Create or update SelectionSet with selected objects
    if (!currentSelectionSet) {
      currentSelectionSet = new SelectionSet();
    }
    currentSelectionSet.clear();
    currentSelectionSet.addMultiple(selectedObjects);
    
    console.log("SelectionSet created/updated:", currentSelectionSet);
    
    // Store selected objects in geometryViewer for rendering
    if (geometryViewer) {
      geometryViewer.selectedObjects = selectedObjects;
      // Force re-render to show selected objects
      geometryViewer.render();
    }
  };
  
  // Helper function to check if point is inside polygon
  const isPointInPolygon = (x, y, polygon) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;
      
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };
  
  // Helper function to check if segment intersects polygon
  const segmentIntersectsPolygon = (segment, polygon) => {
    // Check if segment intersects any edge of the polygon
    for (let i = 0; i < polygon.length; i++) {
      const j = (i + 1) % polygon.length;
      if (segmentsIntersect(
        segment.startX, segment.startY, segment.endX, segment.endY,
        polygon[i].x, polygon[i].y, polygon[j].x, polygon[j].y
      )) {
        return true;
      }
    }
    return false;
  };
  
  // Helper function to check if two segments intersect
  const segmentsIntersect = (x1, y1, x2, y2, x3, y3, x4, y4) => {
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (denom === 0) return false;
    
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  };

  // Handle mode change
  const setMode = (mode) => {
    console.log(`setMode called with: ${mode}`);
    currentMode = mode;
    updateButtonStates(mode);
    
    // Clear SelectionSet when switching to drawing modes (but keep it for cursor and polygon-select)
    if (mode !== "cursor" && mode !== "polygon-select" && mode !== null) {
      if (currentSelectionSet) {
        console.log("Clearing SelectionSet when switching to drawing mode");
        currentSelectionSet.clear();
      }
    }
    
    if (geometryViewer) {
      if (mode === "points") {
        console.log("Setting geometryViewer to points mode");
        geometryViewer.setDrawingMode("points", handlePointClick);
      } else if (mode === "segments") {
        console.log("Setting geometryViewer to segments mode");
        console.log("handleSegmentClick type:", typeof handleSegmentClick, handleSegmentClick);
        geometryViewer.setDrawingMode("segments", handleSegmentClick);
      } else if (mode === "arcs-three-points") {
        geometryViewer.setDrawingMode("arcs-three-points", saveArcFromThreePoints);
      } else if (mode === "arcs-tan-radius") {
        geometryViewer.setDrawingMode("arcs-tan-radius", add_arc_by_tan_radius_rotation);
      } else if (mode === "polygon-select") {
        console.log("Setting geometryViewer to polygon-select mode");
        // Create new SelectionSet when starting polygon selection
        currentSelectionSet = new SelectionSet();
        console.log("New SelectionSet created for polygon selection");
        
        // Set polygon select mode if geometryViewer supports it
        if (typeof geometryViewer.setPolygonSelectMode === "function") {
          geometryViewer.setPolygonSelectMode(handlePolygonSelect);
        } else {
          console.warn("Polygon select mode not yet implemented in geometryViewer");
          geometryViewer.setDrawingMode(null);
        }
      } else if (mode === "cursor" || mode === null) {
        console.log("Setting geometryViewer to cursor mode (null)");
        geometryViewer.setDrawingMode(null);
        // Keep SelectionSet when switching to cursor mode (user might want to delete selected objects)
      } else {
        // Other modes will be implemented later
        console.log("Setting geometryViewer to null (other mode)");
        geometryViewer.setDrawingMode(null);
      }
    } else {
      console.warn("geometryViewer is not available!");
    }
  };
  
  // Handle undo action
  const handleUndo = async () => {
    const siteSessionId = getSiteSessionId();
    if (!siteSessionId) {
      console.error("No site session ID available");
      return;
    }
    
    try {
      const response = await fetch(`/api/geometry/${siteSessionId}/undo`, {
        method: "POST"
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log("Undo successful:", result);
        // Reload geometry to show previous state
        await loadGeometry();
      } else {
        const error = await response.json();
        console.error("Failed to undo:", error);
        // eslint-disable-next-line no-alert
        alert(error.message || "Failed to undo action");
      }
    } catch (error) {
      console.error("Error undoing action:", error);
      // eslint-disable-next-line no-alert
      alert("An error occurred while undoing the action");
    }
  };
  
  // Handle delete action
  const handleDelete = async () => {
    const siteSessionId = getSiteSessionId();
    if (!siteSessionId) {
      console.error("No site session ID available");
      return;
    }
    
    // Check if we have a SelectionSet with objects
    console.log("handleDelete: currentSelectionSet:", currentSelectionSet);
    console.log("handleDelete: currentSelectionSet?.isEmpty():", currentSelectionSet?.isEmpty());
    
    if (currentSelectionSet && !currentSelectionSet.isEmpty()) {
      const deletionList = currentSelectionSet.getDeletionList();
      console.log(`Deleting ${deletionList.length} objects from SelectionSet:`, deletionList);
      
      if (deletionList.length === 0) {
        console.warn("SelectionSet is empty");
        return;
      }
      
      // Delete all objects from SelectionSet sequentially to avoid conflicts
      // Sort objects: delete segments first, then points (to avoid dependency issues)
      const sortedDeletionList = [...deletionList].sort((a, b) => {
        if (a.type === 'segment' && b.type === 'point') return -1;
        if (a.type === 'point' && b.type === 'segment') return 1;
        return 0;
      });
      
      const results = [];
      const failed = [];
      
      for (let i = 0; i < sortedDeletionList.length; i++) {
        const obj = sortedDeletionList[i];
        try {
          console.log(`Deleting ${i + 1}/${deletionList.length}: ${obj.type}/${obj.id}`);
          const response = await fetch(
            `/api/geometry/${siteSessionId}/${obj.type}/${obj.id}`,
            {
              method: "DELETE"
            }
          );
          
          let result;
          try {
            const responseText = await response.text();
            if (responseText) {
              try {
                result = JSON.parse(responseText);
              } catch (parseError) {
                console.error(`Failed to parse JSON response for ${obj.type}/${obj.id}:`, parseError, "Response text:", responseText);
                result = { 
                  success: false, 
                  message: `Invalid JSON response: ${responseText.substring(0, 100)}` 
                };
              }
            } else {
              result = { success: response.ok };
            }
          } catch (error) {
            console.error(`Failed to read response for ${obj.type}/${obj.id}:`, error);
            result = { 
              success: false, 
              message: `Failed to read response: ${error.message}` 
            };
          }
          
          // Check if deletion was successful
          // Backend returns {success: true} on success, or {success: false, message: "..."} on error
          // Also check HTTP status code
          if (response.ok && (result.success === true || result.success === undefined)) {
            results.push({ obj, success: true, result });
            console.log(`Successfully deleted ${obj.type}/${obj.id}`);
          } else {
            const errorMsg = result.message || result.error || `HTTP ${response.status} ${response.statusText}`;
            console.error(`Failed to delete ${obj.type}/${obj.id}:`, errorMsg, "Full response:", result);
            failed.push({ obj, error: errorMsg, result, status: response.status });
          }
          
          // Small delay between deletions to allow backend to process
          if (i < sortedDeletionList.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        } catch (error) {
          console.error(`Error deleting ${obj.type}/${obj.id}:`, error);
          failed.push({ obj, error: error.message || "Network error", exception: error });
          
          // Small delay even on error
          if (i < sortedDeletionList.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
      }
      
      // Report results
      const successCount = results.length;
      const failCount = failed.length;
      const totalCount = sortedDeletionList.length;
      
      if (failed.length > 0) {
        console.error(`Deletion completed: ${successCount} succeeded, ${failCount} failed out of ${totalCount} total`);
        console.error("Failed deletions:", failed);
        // Show detailed error information
        const errorDetails = failed.map(f => `${f.obj.type}/${f.obj.id}: ${f.error}`).join('\n');
        console.error("Error details:\n" + errorDetails);
        // eslint-disable-next-line no-alert
        alert(`Deleted ${successCount} object(s) successfully, but ${failCount} object(s) failed to delete.\n\nCheck console for details.`);
      } else {
        console.log(`Successfully deleted all ${totalCount} object(s)`);
        recordAction(`Deleted ${totalCount} object(s) from SelectionSet.`);
      }
      
      // Clear SelectionSet
      currentSelectionSet.clear();
      
      // Clear selectedObjects in geometryViewer
      if (geometryViewer) {
        geometryViewer.selectedObjects = null;
        geometryViewer.selectedObject = null;
      }
      
      // Close property editor if open
      if (propertyEditor) {
        propertyEditor.hide();
      }
      
      // Reload geometry to show updated state (only if at least one deletion succeeded)
      if (successCount > 0) {
        await loadGeometry(true);
      }
      
      return;
    }
    
    // Fallback to single object deletion (backward compatibility)
    if (!geometryViewer || !geometryViewer.selectedObject) {
      console.warn("No object selected for deletion");
      return;
    }
    
    const selectedObject = geometryViewer.selectedObject;
    
    try {
      const response = await fetch(
        `/api/geometry/${siteSessionId}/${selectedObject.type}/${selectedObject.id}`,
        {
          method: "DELETE"
        }
      );
      
      if (response.ok) {
        const result = await response.json();
        console.log("Delete successful:", result);
        
        // Clear selection
        geometryViewer.selectedObject = null;
        geometryViewer.selectedObjects = null;
        
        // Clear SelectionSet if it exists
        if (currentSelectionSet) {
          currentSelectionSet.clear();
        }
        
        // Close property editor if open
        if (propertyEditor) {
          propertyEditor.hide();
        }
        
        // Reload geometry to show updated state
        await loadGeometry(true);
      } else {
        const errorData = await response.json().catch(() => ({ message: "Unknown error" }));
        console.error("Failed to delete:", errorData);
        // eslint-disable-next-line no-alert
        alert(errorData.message || "Failed to delete object");
      }
    } catch (error) {
      console.error("Error deleting object:", error);
      // eslint-disable-next-line no-alert
      alert("An error occurred while deleting the object");
    }
  };
  
  // Arc dropdown: toggle and close on outside click
  const arcDropdown = drawingControls.querySelector("[data-arc-dropdown]");
  const closeArcDropdown = () => {
    if (!arcDropdown) return;
    arcDropdown.classList.remove("is-open");
    const trigger = arcDropdown.querySelector("[data-mode='arc-dropdown']");
    const menu = arcDropdown.querySelector(".drawing-controls__arc-menu");
    if (trigger) trigger.setAttribute("aria-expanded", "false");
    if (menu) menu.hidden = true;
  };
  if (arcDropdown) {
    document.addEventListener("click", (event) => {
      if (!arcDropdown.contains(event.target)) closeArcDropdown();
    });
  }

  // Add click handlers to buttons
  drawingButtons.forEach((button) => {
    const mode = button.dataset.mode;
    console.log(`Adding click handler to button: ${mode}`);
    
    button.addEventListener("click", (event) => {
      console.log(`Button clicked: ${mode}, currentMode: ${currentMode}`);
      event.preventDefault();
      event.stopPropagation();
      
      if (mode === "arc-dropdown") {
        const wrapper = button.closest("[data-arc-dropdown]");
        const menu = wrapper?.querySelector(".drawing-controls__arc-menu");
        const isOpen = wrapper?.classList.toggle("is-open");
        button.setAttribute("aria-expanded", isOpen ? "true" : "false");
        if (menu) menu.hidden = !isOpen;
        return;
      }
      if (mode === "arc-three-points") {
        closeArcDropdown();
        setMode("arcs-three-points");
        return;
      }
      if (mode === "arc-tangent") {
        closeArcDropdown();
        if (!snapEnabled) {
          snapEnabled = true;
          const snapBtn = Array.from(drawingButtons).find(b => b.dataset.mode === "snap");
          if (snapBtn) {
            snapBtn.dataset.state = "active";
            snapBtn.setAttribute("aria-pressed", "true");
            snapBtn.classList.add("active");
          }
          if (geometryViewer) {
            geometryViewer.setSnapEnabled(true);
          }
        }
        setMode("arcs-tan-radius");
        return;
      }
      if (mode === "arc-fillet") {
        closeArcDropdown();
        return;
      }
      
      if (mode === "undo") {
        handleUndo();
        return;
      }
      
      if (mode === "delete") {
        handleDelete();
        return;
      }
      
      if (mode === "snap") {
        // Toggle snap mode
        snapEnabled = !snapEnabled;
        button.dataset.state = snapEnabled ? "active" : "inactive";
        button.setAttribute("aria-pressed", snapEnabled ? "true" : "false");
        button.classList.toggle("active", snapEnabled);
        console.log(`Snap ${snapEnabled ? "enabled" : "disabled"}`);
        recordAction(`Snap ${snapEnabled ? "enabled" : "disabled"}.`);
        // Task 5.2.2.1.1: Call geometryViewer.setSnapEnabled() to update GeometryViewer state
        if (geometryViewer) {
          geometryViewer.setSnapEnabled(snapEnabled);
        }
        return;
      }
      
      if (mode === currentMode) {
        // Deactivate if clicking the same mode
        console.log("Deactivating mode");
        setMode(null);
      } else {
        console.log(`Activating mode: ${mode}`);
        setMode(mode);
      }
    });
  });
  
  // Handle keyboard shortcuts (Del key for delete, Enter for polygon completion)
  document.addEventListener("keydown", (event) => {
    // Check if Del or Delete key is pressed
    if (event.key === "Delete" || event.key === "Del" || (event.keyCode === 46)) {
      // Don't delete if user is typing in an input field
      const activeElement = document.activeElement;
      if (activeElement && (
        activeElement.tagName === "INPUT" ||
        activeElement.tagName === "TEXTAREA" ||
        activeElement.isContentEditable
      )) {
        return;
      }
      
      event.preventDefault();
      handleDelete();
    }
    
    // Check if Enter key is pressed for polygon selection completion
    if (event.key === "Enter" && currentMode === "polygon-select") {
      // Don't complete if user is typing in an input field
      const activeElement = document.activeElement;
      if (activeElement && (
        activeElement.tagName === "INPUT" ||
        activeElement.tagName === "TEXTAREA" ||
        activeElement.isContentEditable
      )) {
        return;
      }
      
      if (geometryViewer && geometryViewer.polygonSelectPoints && geometryViewer.polygonSelectPoints.length >= 3) {
        event.preventDefault();
        if (geometryViewer.onPolygonSelect) {
          geometryViewer.onPolygonSelect(geometryViewer.polygonSelectPoints);
          geometryViewer.polygonSelectPoints = [];
          geometryViewer.currentMousePosition = null;
          geometryViewer.render();
        }
      }
    }
    
    // Check if Escape key is pressed to cancel polygon selection
    if (event.key === "Escape" && currentMode === "polygon-select") {
      if (geometryViewer && geometryViewer.polygonSelectPoints && geometryViewer.polygonSelectPoints.length > 0) {
        event.preventDefault();
        geometryViewer.polygonSelectPoints = [];
        geometryViewer.currentMousePosition = null;
        geometryViewer.render();
        console.log("Polygon selection cancelled");
      }
    }
  });
  
  // Initialize cursor mode as active by default
  const cursorButton = Array.from(drawingButtons).find(btn => btn.dataset.mode === "cursor");
  if (cursorButton) {
    console.log("Setting initial cursor mode");
    setMode("cursor");
  } else {
    console.warn("Cursor button not found!");
  }
  
  // Load geometry on page load (after a short delay to ensure geometryViewer is ready)
  setTimeout(() => {
    if (getSiteSessionId() && geometryViewer) {
      loadGeometry();
    }
  }, 200);
}

function setupToolBlockToggles() {
  const toolBlocks = Array.from(document.querySelectorAll(".tool-block"));
  if (toolBlocks.length === 0) {
    return;
  }

  const shouldIgnoreClick = (target) =>
    Boolean(
      target.closest(
        ".tool-block-toggle, .tool-block-content button, .tool-block-content a, .tool-block-content input, .tool-block-content select, .tool-block-content textarea, .tool-block-content label, [data-prevent-toggle='true'], .info-icon, .info-tooltip"
      )
    );

  const updateBlockState = (block, shouldExpand) => {
    block.classList.toggle("collapsed", !shouldExpand);
    const toggle = block.querySelector(".tool-block-toggle");
    if (toggle) {
      toggle.setAttribute("aria-expanded", String(shouldExpand));
      const { collapsedTitle, expandedTitle } = toggle.dataset;
      if (shouldExpand && expandedTitle) {
        toggle.setAttribute("title", expandedTitle);
      } else if (!shouldExpand && collapsedTitle) {
        toggle.setAttribute("title", collapsedTitle);
      }
    }
  };
  const collapseOtherBlocks = (currentBlock) => {
    toolBlocks.forEach((block) => {
      if (block !== currentBlock && !block.classList.contains("collapsed")) {
        updateBlockState(block, false);
      }
    });
  };
  const toggleBlockState = (block) => {
    const willExpand = block.classList.contains("collapsed");
    if (willExpand) {
      collapseOtherBlocks(block);
    }
    updateBlockState(block, willExpand);
  };

  toolBlocks.forEach((block) => {
    const toggle = block.querySelector(".tool-block-toggle");
    const header = block.querySelector(".tool-block-header");
    if (!toggle || !header) {
      return;
    }

    const headerText = block.querySelector("h3")?.textContent || "";
    const sectionLabel = headerText.replace(/\s+/g, " ").trim() || "tools section";
    const collapsedTitle = `Expand ${sectionLabel}`;
    const expandedTitle = `Collapse ${sectionLabel}`;

    toggle.dataset.collapsedTitle = collapsedTitle;
    toggle.dataset.expandedTitle = expandedTitle;

    toggle.setAttribute("aria-label", `Toggle ${sectionLabel}`);

    const isInitiallyCollapsed = block.classList.contains("collapsed");
    toggle.setAttribute("aria-expanded", String(!isInitiallyCollapsed));
    toggle.setAttribute("title", isInitiallyCollapsed ? collapsedTitle : expandedTitle);

    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleBlockState(block);
    });

    header.addEventListener("click", (event) => {
      if (shouldIgnoreClick(event.target)) {
        return;
      }
      event.stopPropagation();
      toggleBlockState(block);
    });

    block.addEventListener("click", (event) => {
      if (!block.contains(event.target)) {
        return;
      }
      if (shouldIgnoreClick(event.target)) {
        return;
      }
      toggleBlockState(block);
    });
  });
}

function setupAlignmentControls() {
  // Wait for geometryViewer to be available
  if (!geometryViewer) {
    console.warn("GeometryViewer not available for alignment controls, will retry");
    setTimeout(() => {
      if (geometryViewer) {
        setupAlignmentControls();
      }
    }, 100);
    return;
  }

  // Initialize alignment overlay data storage
  if (!geometryViewer.alignmentOverlay) {
    geometryViewer.alignmentOverlay = {
      basePoint: null,
      referenceLine: null
    };
  }

  // Only override render once
  if (!geometryViewer._alignmentRenderOverridden) {
    // Store original render method
    const originalRender = geometryViewer.render.bind(geometryViewer);
    
    // Override render to include alignment overlays
    geometryViewer.render = function() {
      originalRender();
    
    // Render alignment base point (orange)
    if (this.alignmentOverlay && this.alignmentOverlay.basePoint) {
      const pointStyle = {
        size: 6,
        color: "#ff8800", // Orange
        stroke: "#ffffff",
        strokeWidth: 2
      };
      this.renderPoint(
        this.alignmentOverlay.basePoint.x,
        this.alignmentOverlay.basePoint.y,
        pointStyle
      );
    }
    
    // Render alignment reference line (orange)
    if (this.alignmentOverlay && this.alignmentOverlay.referenceLine) {
      const { start_pt, end_pt } = this.alignmentOverlay.referenceLine;
      const startCanvas = this.worldToCanvas(start_pt[0], start_pt[1]);
      const endCanvas = this.worldToCanvas(end_pt[0], end_pt[1]);
      
      this.ctx.beginPath();
      this.ctx.moveTo(startCanvas.x, startCanvas.y);
      this.ctx.lineTo(endCanvas.x, endCanvas.y);
      this.ctx.strokeStyle = "#ff8800"; // Orange
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
    }
    };
    
    geometryViewer._alignmentRenderOverridden = true;
  }

  // Select base point button handler
  const selectBasePointBtn = document.getElementById("select-base-point");
  if (selectBasePointBtn) {
    let basePointMode = false;
    
    selectBasePointBtn.addEventListener("click", () => {
      if (basePointMode) {
        // Cancel mode if already active
        basePointMode = false;
        geometryViewer.setDrawingMode(null);
        selectBasePointBtn.textContent = "Select base point";
        selectBasePointBtn.classList.remove("active");
        return;
      }

      // Enable base point selection mode
      basePointMode = true;
      selectBasePointBtn.textContent = "Cancel";
      selectBasePointBtn.classList.add("active");

      // Remove previous base point
      if (geometryViewer.alignmentOverlay.basePoint) {
        geometryViewer.alignmentOverlay.basePoint = null;
        geometryViewer.render();
      }

      // Set up point click handler
      const handleBasePointClick = (x, y, canvasX, canvasY) => {
        // Store base point
        geometryViewer.alignmentOverlay.basePoint = { x, y };
        
        // Update input fields
        const xInput = document.getElementById("base-point-x");
        const yInput = document.getElementById("base-point-y");
        if (xInput) xInput.value = x.toFixed(3);
        if (yInput) yInput.value = y.toFixed(3);

        // Exit mode
        basePointMode = false;
        geometryViewer.setDrawingMode(null);
        selectBasePointBtn.textContent = "Select base point";
        selectBasePointBtn.classList.remove("active");
        
        // Render to show the point
        geometryViewer.render();
      };

      geometryViewer.setDrawingMode("points", handleBasePointClick);
    });
  }

  // Draw reference line button handler
  const drawReferenceLineBtn = document.getElementById("draw-reference-line");
  if (drawReferenceLineBtn) {
    let referenceLineMode = false;
    let lineStartPoint = null;
    
    drawReferenceLineBtn.addEventListener("click", () => {
      if (referenceLineMode) {
        // Cancel mode if already active
        referenceLineMode = false;
        lineStartPoint = null;
        geometryViewer.setDrawingMode(null);
        drawReferenceLineBtn.textContent = "Draw reference line";
        drawReferenceLineBtn.classList.remove("active");
        return;
      }

      // Enable reference line drawing mode
      referenceLineMode = true;
      drawReferenceLineBtn.textContent = "Cancel";
      drawReferenceLineBtn.classList.add("active");

      // Remove previous reference line
      if (geometryViewer.alignmentOverlay.referenceLine) {
        geometryViewer.alignmentOverlay.referenceLine = null;
        geometryViewer.render();
      }

      // Set up segment click handler (two points make a line)
      const handleReferenceLineClick = (startX, startY, endX, endY, canvasX1, canvasY1, canvasX2, canvasY2) => {
        // Store reference line
        geometryViewer.alignmentOverlay.referenceLine = {
          start_pt: [startX, startY],
          end_pt: [endX, endY]
        };

        // Exit mode
        referenceLineMode = false;
        lineStartPoint = null;
        geometryViewer.setDrawingMode(null);
        drawReferenceLineBtn.textContent = "Draw reference line";
        drawReferenceLineBtn.classList.remove("active");
        
        // Render to show the line
        geometryViewer.render();
      };

      geometryViewer.setDrawingMode("segments", handleReferenceLineClick);
    });
  }

  // Apply button handler
  const applyBtn = document.getElementById("apply-point-reference");
  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      // Get form values
      const basePointXInput = document.getElementById("base-point-x");
      const basePointYInput = document.getElementById("base-point-y");
      const bearingSelect = document.getElementById("reference-bearing");
      const angleInput = document.getElementById("reference-angle");
      const distanceInput = document.getElementById("reference-distance");

      // Validation
      const errors = [];

      // Check base point
      if (!geometryViewer.alignmentOverlay.basePoint) {
        errors.push("Base point must be selected");
      }

      // Check coordinates from input fields
      const basePointX = basePointXInput ? parseFloat(basePointXInput.value) : NaN;
      const basePointY = basePointYInput ? parseFloat(basePointYInput.value) : NaN;
      if (isNaN(basePointX) || isNaN(basePointY)) {
        errors.push("Base point coordinates (X, Y) must be provided");
      }

      // Check reference line
      if (!geometryViewer.alignmentOverlay.referenceLine) {
        errors.push("Reference line must be drawn");
      }

      // Check bearing
      const bearing = bearingSelect ? bearingSelect.value : "";
      if (!bearing) {
        errors.push("Bearing must be selected");
      }

      // Check angle
      const angleText = angleInput ? angleInput.value.trim() : "";
      if (!angleText) {
        errors.push("Angle must be provided");
      }

      // Check distance
      const distance = distanceInput ? parseFloat(distanceInput.value) : NaN;
      if (isNaN(distance) || distance <= 0) {
        errors.push("Distance must be a positive number");
      }

      // If validation fails, show errors
      if (errors.length > 0) {
        alert("Validation errors:\n" + errors.join("\n"));
        return;
      }

      // Parse angle from format dd*mm'ss" to decimal degrees using existing validation function
      let angleDecimal = null;
      try {
        // Use the existing dmsToDecimal function which validates minutes and seconds are 0-59
        angleDecimal = dmsToDecimal(angleText);
      } catch (e) {
        alert(`Invalid angle format: ${e.message}\nAngle must be in format dd*mm'ss\" where minutes and seconds are 0-59 (e.g., 45*30'15\")`);
        return;
      }

      // Get base point image coordinates
      const basePointImg = geometryViewer.alignmentOverlay.basePoint;
      const referenceLine = geometryViewer.alignmentOverlay.referenceLine;

      // Build request object (matching user's specification)
      const requestData = {
        base_point: {
          image_coords: [basePointImg.x, basePointImg.y],
          world_coords: [basePointX, basePointY]
        },
        reference_line: {
          image_coords: {
            start_pt: referenceLine.start_pt,
            end_pt: referenceLine.end_pt
          },
          user_reference: {
            bearind: bearing, // Note: using "bearind" as specified by user
            angle: angleDecimal,
            distance: distance
          }
        }
      };

      // Log the request data (you can modify this to send to API)
      console.log("Alignment request data:", JSON.stringify(requestData, null, 2));
      
      // TODO: Send request to API endpoint
      // Example:
      // fetch('/api/alignment/apply', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(requestData)
      // }).then(...)

      alert("Alignment data prepared successfully!\nCheck console for request data.");
    });
  }
}

function setupSubboxToggles() {
  const alignmentBlock = document.getElementById("tool-alignment-block");
  if (!alignmentBlock) {
    return;
  }

  const subboxes = Array.from(alignmentBlock.querySelectorAll(".tool-subbox"));
  if (subboxes.length === 0) {
    return;
  }

  const shouldIgnoreClick = (target) =>
    Boolean(
      target.closest(
        ".tool-subbox-toggle, .tool-subbox-content button, .tool-subbox-content a, .tool-subbox-content input, .tool-subbox-content select, .tool-subbox-content textarea, .tool-subbox-content label, [data-prevent-toggle='true']"
      )
    );

  const updateSubboxState = (subbox, shouldExpand) => {
    subbox.classList.toggle("collapsed", !shouldExpand);
    const toggle = subbox.querySelector(".tool-subbox-toggle");
    if (toggle) {
      toggle.setAttribute("aria-expanded", String(shouldExpand));
      const { collapsedTitle, expandedTitle } = toggle.dataset;
      if (shouldExpand && expandedTitle) {
        toggle.setAttribute("title", expandedTitle);
      } else if (!shouldExpand && collapsedTitle) {
        toggle.setAttribute("title", collapsedTitle);
      }
    }
  };

  const collapseOtherSubboxes = (currentSubbox) => {
    subboxes.forEach((subbox) => {
      if (subbox !== currentSubbox && !subbox.classList.contains("collapsed")) {
        updateSubboxState(subbox, false);
      }
    });
  };

  const toggleSubboxState = (subbox) => {
    const willExpand = subbox.classList.contains("collapsed");
    if (willExpand) {
      collapseOtherSubboxes(subbox);
    }
    updateSubboxState(subbox, willExpand);
  };

  subboxes.forEach((subbox) => {
    const toggle = subbox.querySelector(".tool-subbox-toggle");
    const header = subbox.querySelector(".tool-subbox-header");
    if (!toggle || !header) {
      return;
    }

    const headerText = subbox.querySelector("h4")?.textContent || "";
    const sectionLabel = headerText.replace(/\s+/g, " ").trim() || "subbox";
    const collapsedTitle = `Expand ${sectionLabel}`;
    const expandedTitle = `Collapse ${sectionLabel}`;

    toggle.dataset.collapsedTitle = collapsedTitle;
    toggle.dataset.expandedTitle = expandedTitle;

    toggle.setAttribute("aria-label", `Toggle ${sectionLabel}`);

    const isInitiallyCollapsed = subbox.classList.contains("collapsed");
    toggle.setAttribute("aria-expanded", String(!isInitiallyCollapsed));
    toggle.setAttribute("title", isInitiallyCollapsed ? collapsedTitle : expandedTitle);

    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleSubboxState(subbox);
    });

    header.addEventListener("click", (event) => {
      if (shouldIgnoreClick(event.target)) {
        return;
      }
      event.stopPropagation();
      toggleSubboxState(subbox);
    });
  });
}

function initializeDrafterPage() {
  console.log("initializeDrafterPage called");
  console.log("setupDrawingControls function available:", typeof setupDrawingControls);
  
  initializeGeometryViewer();
  setupGeometryControls();
  setupUploadControls();
  setupAlignmentControls();
  setupExportControls();
  setupToolBlockToggles();
  setupSubboxToggles();
  
  // Setup drawing controls after a short delay to ensure DOM is ready
  console.log("Setting up drawing controls...");
  console.log("Drawing controls container exists:", !!document.querySelector(".drawing-controls"));
  
  // Try immediate setup first
  if (typeof setupDrawingControls === "function") {
    try {
      console.log("Calling setupDrawingControls...");
      setupDrawingControls();
    } catch (error) {
      console.error("Error in immediate setupDrawingControls:", error);
      // Retry after delay if immediate setup fails
      setTimeout(() => {
        console.log("Timeout callback executed, calling setupDrawingControls");
        try {
          setupDrawingControls();
        } catch (retryError) {
          console.error("Error in delayed setupDrawingControls:", retryError);
        }
      }, 100);
    }
  } else {
    console.error("setupDrawingControls is not a function! Type:", typeof setupDrawingControls);
    // Retry after delay
    setTimeout(() => {
      if (typeof setupDrawingControls === "function") {
        console.log("setupDrawingControls now available, calling...");
        setupDrawingControls();
      } else {
        console.error("setupDrawingControls still not available after delay");
      }
    }, 200);
  }
  
  // Load processed_drawing if available in session data
  if (window.siteSessionData && window.siteSessionData.paths) {
    console.log("Checking for processed_drawing_url:", {
      hasPaths: !!window.siteSessionData.paths,
      hasUrl: !!window.siteSessionData.paths.processed_drawing_url,
      url: window.siteSessionData.paths.processed_drawing_url
    });
    
    if (window.siteSessionData.paths.processed_drawing_url) {
      const imageUrl = window.siteSessionData.paths.processed_drawing_url;
      const statusElement = document.getElementById("upload-status");
      
      console.log("Loading processed drawing from URL:", imageUrl);
      
      // Wait for geometryViewer to be fully initialized
      const loadProcessedDrawing = () => {
        if (geometryViewer) {
          console.log("GeometryViewer ready, loading image...");
          displayRasterPreview(imageUrl, statusElement).catch((error) => {
            console.error("Failed to load processed drawing on session start:", error);
          });
        } else {
          // Retry after a short delay if geometryViewer is not ready
          setTimeout(loadProcessedDrawing, 50);
        }
      };
      
      setTimeout(loadProcessedDrawing, 100);
    } else {
      console.log("No processed_drawing_url found in session data");
    }
  }
}

console.log("=== DRAFTER SCRIPT LOADED ===");
console.log("Script loaded, document.readyState:", document.readyState);
console.log("setupDrawingControls function defined:", typeof setupDrawingControls);
console.log("initializeDrafterPage function defined:", typeof initializeDrafterPage);

// Force check if functions are hoisted
if (typeof setupDrawingControls === "undefined") {
  console.error("CRITICAL: setupDrawingControls is not defined!");
}
if (typeof initializeDrafterPage === "undefined") {
  console.error("CRITICAL: initializeDrafterPage is not defined!");
}

// Check if drawing controls exist in DOM
const checkDrawingControls = () => {
  const controls = document.querySelector(".drawing-controls");
  console.log("Drawing controls in DOM:", !!controls);
  if (controls) {
    const buttons = controls.querySelectorAll(".drawing-btn");
    console.log("Drawing buttons found:", buttons.length);
  }
};

// Check immediately
checkDrawingControls();

if (document.readyState === "loading") {
  console.log("Document still loading, waiting for DOMContentLoaded");
  document.addEventListener("DOMContentLoaded", () => {
    console.log("DOMContentLoaded event fired");
    checkDrawingControls();
    initializeDrafterPage();
  });
} else {
  console.log("Document already loaded, calling initializeDrafterPage immediately");
  // Wait a bit for DOM to be fully ready
  setTimeout(() => {
    checkDrawingControls();
    initializeDrafterPage();
  }, 10);
}

window.loadGeometryData = function loadGeometryData(jsonData) {
  if (!geometryViewer) {
    console.error("Geometry viewer is not initialized.");
    return;
  }
  geometryViewer.loadData(jsonData);
};

// Expose setupDrawingControls for debugging
window.setupDrawingControls = setupDrawingControls;
console.log("setupDrawingControls function exposed to window:", typeof window.setupDrawingControls);

