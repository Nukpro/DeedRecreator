/**
 * Geometry Viewer Component.
 * Responsible for rendering parcel geometries and raster overlays.
 */

export default class GeometryViewer {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`Container with id "${containerId}" not found`);
    }

    this.options = {
      width: options.width || 800,
      height: options.height || 600,
      backgroundColor: options.backgroundColor || "#ffffff",
      padding: options.padding || 20,
      minScale: typeof options.minScale === "number" ? options.minScale : 0.05,
      maxScale: typeof options.maxScale === "number" ? options.maxScale : 20,
      zoomIntensity:
        typeof options.zoomIntensity === "number" ? options.zoomIntensity : 0.0015,
      ...options
    };

    this.rasterImage = null;
    this.rasterSize = null;
    this.rasterBounds = null;
    this.canvas = null;
    this.ctx = null;
    this.data = null;
    this.bounds = null;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.isPanning = false;
    this.lastPanPoint = { x: 0, y: 0 };
    this.coordDisplay = null;
    
    // Drawing mode state
    this.drawingMode = null; // "points", "segments", "arcs", "polygon-select", etc.
    this.onPointClick = null; // Callback for point clicks
    this.onSegmentClick = null; // Callback for segment clicks (two points)
    this.onObjectClick = null; // Callback for object clicks (cursor mode)
    this.onPolygonSelect = null; // Callback for polygon selection completion
    this.segmentStartPoint = null; // First point for segment drawing
    this.currentMousePosition = null; // Current mouse position in world coordinates (for preview line)
    this.selectedObject = null; // Currently selected object (point, segment, etc.)
    this.hoveredObject = null; // Currently hovered object (point, segment, etc.)
    this.polygonSelectPoints = []; // Points for polygon selection
    this.selectedObjects = null; // Array of selected objects (from SelectionSet)

    this.init();
  }

  init() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.options.width;
    this.canvas.height = this.options.height;
    this.canvas.style.cursor = "grab";
    this.ctx = this.canvas.getContext("2d");

    this.container.innerHTML = "";
    this.container.appendChild(this.canvas);

    this.coordDisplay = document.createElement("div");
    this.coordDisplay.className = "geometry-viewer-info";
    this.coordDisplay.textContent = "X: —  Y: —";
    this.container.appendChild(this.coordDisplay);

    this.canvas.addEventListener("mousedown", this.onMouseDown.bind(this));
    this.canvas.addEventListener("mousemove", this.onMouseMove.bind(this));
    this.canvas.addEventListener("mouseup", this.onMouseUp.bind(this));
    this.canvas.addEventListener("mouseleave", this.onMouseLeave.bind(this));
    this.canvas.addEventListener("wheel", this.onWheel.bind(this), {
      passive: false
    });

    this.canvas.addEventListener("touchstart", this.onTouchStart.bind(this));
    this.canvas.addEventListener("touchmove", this.onTouchMove.bind(this), {
      passive: false
    });
    this.canvas.addEventListener("touchend", this.onTouchEnd.bind(this));
  }

  loadData(jsonData, preserveView = false) {
    this.data = jsonData;
    // Clear selection and hover when loading new data
    this.selectedObject = null;
    this.hoveredObject = null;
    if (preserveView) {
      // Update bounds and render without changing view
      this.calculateBounds();
    } else {
      this.recalculateScene();
    }
    // Always render after loading data to ensure updates are visible
    this.render();
  }

  calculateBounds() {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    const includePoint = (x, y) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    };

    if (this.rasterBounds) {
      includePoint(this.rasterBounds.minX, this.rasterBounds.minY);
      includePoint(this.rasterBounds.maxX, this.rasterBounds.maxY);
    }

    if (this.data && this.data.collections) {
      this.data.collections.forEach((collection) => {
        if (collection.features) {
          collection.features.forEach((feature) => {
            if (feature.geometry && feature.geometry.segments) {
              feature.geometry.segments.forEach((segment) => {
                if (segment.segmentType === "line") {
                  if (segment.start) {
                    includePoint(segment.start.x, segment.start.y);
                  }
                  if (segment.end) {
                    includePoint(segment.end.x, segment.end.y);
                  }
                } else if (segment.segmentType === "arc") {
                  if (segment.start) {
                    includePoint(segment.start.x, segment.start.y);
                  }
                  if (segment.end) {
                    includePoint(segment.end.x, segment.end.y);
                  }
                  if (segment.center && segment.radius) {
                    includePoint(
                      segment.center.x - segment.radius,
                      segment.center.y - segment.radius
                    );
                    includePoint(
                      segment.center.x + segment.radius,
                      segment.center.y + segment.radius
                    );
                  }
                }
              });
            }
          });
        }
      });
    }

    if (minX !== Number.POSITIVE_INFINITY && maxX !== Number.NEGATIVE_INFINITY) {
      this.bounds = { minX, minY, maxX, maxY };
    } else {
      this.bounds = null;
    }
  }

  clampScale(value) {
    return Math.min(this.options.maxScale, Math.max(this.options.minScale, value));
  }

  fitToView() {
    if (!this.bounds) {
      return;
    }

    const width = this.bounds.maxX - this.bounds.minX;
    const height = this.bounds.maxY - this.bounds.minY;
    const drawableWidth = Math.max(1, this.canvas.width - this.options.padding * 2);
    const drawableHeight = Math.max(1, this.canvas.height - this.options.padding * 2);

    const scaleX = width === 0 ? Number.POSITIVE_INFINITY : drawableWidth / width;
    const scaleY = height === 0 ? Number.POSITIVE_INFINITY : drawableHeight / height;

    const candidates = [scaleX, scaleY].filter(
      (value) => Number.isFinite(value) && value > 0
    );
    let targetScale = candidates.length > 0 ? Math.min(...candidates) : 1;
    targetScale *= 0.9;
    if (!Number.isFinite(targetScale) || targetScale <= 0) {
      targetScale = 1;
    }

    this.scale = this.clampScale(targetScale);

    const centerX = (this.bounds.minX + this.bounds.maxX) / 2;
    const centerY = (this.bounds.minY + this.bounds.maxY) / 2;

    this.offsetX = this.canvas.width / 2 - centerX * this.scale;
    this.offsetY = this.canvas.height / 2 + centerY * this.scale;
  }

  worldToCanvas(x, y) {
    return {
      x: x * this.scale + this.offsetX,
      y: -y * this.scale + this.offsetY
    };
  }

  canvasToWorld(x, y) {
    return {
      x: (x - this.offsetX) / this.scale,
      y: (this.offsetY - y) / this.scale
    };
  }

  updateCoordDisplay(canvasX, canvasY) {
    if (!this.coordDisplay) {
      return;
    }

    const world = this.canvasToWorld(canvasX, canvasY);
    if (!Number.isFinite(world.x) || !Number.isFinite(world.y)) {
      this.coordDisplay.textContent = "X: —  Y: —";
      return;
    }

    this.coordDisplay.textContent = `X: ${world.x.toFixed(3)}  Y: ${world.y.toFixed(
      3
    )}`;
  }

  resetCoordDisplay() {
    if (this.coordDisplay) {
      this.coordDisplay.textContent = "X: —  Y: —";
    }
  }

  render() {
    this.ctx.fillStyle = this.options.backgroundColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.rasterImage && this.rasterBounds && this.bounds) {
      const { minX, minY, maxX, maxY } = this.rasterBounds;
      const bottomLeft = this.worldToCanvas(minX, minY);
      const topRight = this.worldToCanvas(maxX, maxY);
      const drawWidth = topRight.x - bottomLeft.x;
      const drawHeight = bottomLeft.y - topRight.y;
      if (Number.isFinite(drawWidth) && Number.isFinite(drawHeight)) {
        this.ctx.drawImage(
          this.rasterImage,
          bottomLeft.x,
          topRight.y,
          drawWidth,
          drawHeight
        );
      }
    }

    // Render segments if they exist in data (preferred for session-based geometry)
    // Only render collections if segments are not present (for backward compatibility)
    if (this.data && this.data.segments && Array.isArray(this.data.segments) && this.data.segments.length > 0) {
      // Render segments directly - skip collections to avoid duplicate rendering
    } else if (this.data && this.data.collections) {
      // Render collections only if segments are not present
      this.data.collections.forEach((collection) => {
        if (collection.features) {
          collection.features.forEach((feature) => {
            this.renderFeature(feature);
          });
        }
      });
    }
    
    // Render segments if they exist in data
    if (this.data && this.data.segments && Array.isArray(this.data.segments)) {
      this.data.segments.forEach((segment) => {
        if (segment.segmentType === "line" && segment.start && segment.end) {
          // Create segment object for state checking - must match structure used in selection
          const segmentObject = {
            type: "segment",
            id: segment.id,
            startX: segment.start.x,
            startY: segment.start.y,
            endX: segment.end.x,
            endY: segment.end.y
          };
          const state = this.getObjectState(segmentObject);
          const style = this.getSegmentStyle(state, segment.attributes?.color || "#0000ff");
          
          const startCanvas = this.worldToCanvas(segment.start.x, segment.start.y);
          const endCanvas = this.worldToCanvas(segment.end.x, segment.end.y);
          
          // For selected state, draw yellow outline first
          if (state === 'selected') {
            this.ctx.beginPath();
            this.ctx.moveTo(startCanvas.x, startCanvas.y);
            this.ctx.lineTo(endCanvas.x, endCanvas.y);
            this.ctx.strokeStyle = "#ffff00"; // Yellow outline
            this.ctx.lineWidth = style.lineWidth + 4; // Thicker outline for visibility
            this.ctx.stroke();
          }
          
          // Draw main line
          this.ctx.beginPath();
          this.ctx.moveTo(startCanvas.x, startCanvas.y);
          this.ctx.lineTo(endCanvas.x, endCanvas.y);
          this.ctx.strokeStyle = style.color;
          this.ctx.lineWidth = style.lineWidth;
          this.ctx.stroke();
        }
      });
    }
    
    // Render points if they exist in data
    if (this.data && this.data.points && Array.isArray(this.data.points)) {
      this.data.points.forEach((point) => {
        if (point.x !== undefined && point.y !== undefined) {
          const pointObject = {
            type: "point",
            id: point.id,
            x: point.x,
            y: point.y
          };
          const state = this.getObjectState(pointObject);
          const style = this.getPointStyle(state);
          this.renderPoint(point.x, point.y, style);
        }
      });
    }
    
    // Render preview line when drawing segments (from first point to current mouse position)
    if (this.drawingMode === "segments" && this.segmentStartPoint && this.currentMousePosition) {
      const startCanvas = this.worldToCanvas(this.segmentStartPoint.x, this.segmentStartPoint.y);
      const endCanvas = this.worldToCanvas(this.currentMousePosition.x, this.currentMousePosition.y);
      
      this.ctx.beginPath();
      this.ctx.moveTo(startCanvas.x, startCanvas.y);
      this.ctx.lineTo(endCanvas.x, endCanvas.y);
      this.ctx.strokeStyle = "#0000ff"; // Blue color for preview line
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([5, 5]); // Dashed line for preview
      this.ctx.stroke();
      this.ctx.setLineDash([]); // Reset line dash
    }
    
    // Render polygon selection preview
    if (this.drawingMode === "polygon-select" && this.polygonSelectPoints.length > 0) {
      this.ctx.beginPath();
      
      // Draw polygon outline
      for (let i = 0; i < this.polygonSelectPoints.length; i++) {
        const point = this.polygonSelectPoints[i];
        const canvasPos = this.worldToCanvas(point.x, point.y);
        if (i === 0) {
          this.ctx.moveTo(canvasPos.x, canvasPos.y);
        } else {
          this.ctx.lineTo(canvasPos.x, canvasPos.y);
        }
      }
      
      // Draw line to current mouse position if available
      if (this.currentMousePosition) {
        const currentCanvas = this.worldToCanvas(this.currentMousePosition.x, this.currentMousePosition.y);
        this.ctx.lineTo(currentCanvas.x, currentCanvas.y);
      }
      
      // Close polygon if we have at least 3 points
      if (this.polygonSelectPoints.length >= 3) {
        const firstPoint = this.polygonSelectPoints[0];
        const firstCanvas = this.worldToCanvas(firstPoint.x, firstPoint.y);
        if (!this.currentMousePosition) {
          this.ctx.lineTo(firstCanvas.x, firstCanvas.y);
        }
      }
      
      // Draw polygon fill
      this.ctx.fillStyle = "rgba(0, 100, 255, 0.2)"; // Light blue fill
      this.ctx.fill();
      
      // Draw polygon outline
      this.ctx.strokeStyle = "#0064ff"; // Blue outline
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([5, 5]); // Dashed line
      this.ctx.stroke();
      this.ctx.setLineDash([]); // Reset line dash
      
      // Draw polygon points
      this.polygonSelectPoints.forEach((point) => {
        const canvasPos = this.worldToCanvas(point.x, point.y);
        this.ctx.fillStyle = "#0064ff";
        this.ctx.beginPath();
        this.ctx.arc(canvasPos.x, canvasPos.y, 4, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Draw point outline
        this.ctx.strokeStyle = "#ffffff";
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
      });
    }
  }

  renderFeature(feature) {
    if (!feature.geometry || !feature.geometry.segments) {
      return;
    }

    const style = feature.style || this.getDefaultStyle(feature.featureType);
    const isClosed = feature.geometry.isClosed || false;

    this.ctx.beginPath();

    let firstPoint = null;
    let lastPoint = null;

    feature.geometry.segments.forEach((segment, index) => {
      if (segment.segmentType === "line") {
        const start = this.worldToCanvas(segment.start.x, segment.start.y);
        const end = this.worldToCanvas(segment.end.x, segment.end.y);

        // Start a new path for each segment to avoid connecting them
        if (index === 0) {
          this.ctx.moveTo(start.x, start.y);
          firstPoint = start;
        } else {
          // Check if this segment's start connects to the previous segment's end
          const prevSegment = feature.geometry.segments[index - 1];
          const prevEnd = this.worldToCanvas(prevSegment.end.x, prevSegment.end.y);
          const tolerance = 0.1; // Small tolerance for floating point comparison
          const dx = Math.abs(start.x - prevEnd.x);
          const dy = Math.abs(start.y - prevEnd.y);
          
          if (dx < tolerance && dy < tolerance) {
            // Segments are connected, continue the path
            this.ctx.lineTo(start.x, start.y);
          } else {
            // Segments are not connected, start a new path
            this.ctx.moveTo(start.x, start.y);
          }
        }
        this.ctx.lineTo(end.x, end.y);
        lastPoint = end;
      } else if (segment.segmentType === "arc") {
        const start = this.worldToCanvas(segment.start.x, segment.start.y);
        const end = this.worldToCanvas(segment.end.x, segment.end.y);
        const center = this.worldToCanvas(segment.center.x, segment.center.y);
        const radius = segment.radius * this.scale;

        if (index === 0) {
          this.ctx.moveTo(start.x, start.y);
          firstPoint = start;
        } else {
          // Check if this segment's start connects to the previous segment's end
          const prevSegment = feature.geometry.segments[index - 1];
          const prevEnd = this.worldToCanvas(prevSegment.end.x, prevSegment.end.y);
          const tolerance = 0.1; // Small tolerance for floating point comparison
          const dx = Math.abs(start.x - prevEnd.x);
          const dy = Math.abs(start.y - prevEnd.y);
          
          if (dx < tolerance && dy < tolerance) {
            // Segments are connected, continue the path
            this.ctx.lineTo(start.x, start.y);
          } else {
            // Segments are not connected, start a new path
            this.ctx.moveTo(start.x, start.y);
          }
        }

        const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
        const endAngle = Math.atan2(end.y - center.y, end.x - center.x);

        let counterclockwise = false;
        if (segment.rotation === "cw") {
          counterclockwise = true;
        } else if (segment.rotation === "ccw") {
          counterclockwise = false;
        } else {
          const delta = segment.delta || 0;
          counterclockwise = delta < 0;
        }

        let normalizedStartAngle = startAngle;
        let normalizedEndAngle = endAngle;

        if (counterclockwise) {
          if (normalizedEndAngle > normalizedStartAngle) {
            normalizedEndAngle -= 2 * Math.PI;
          }
        } else if (normalizedEndAngle < normalizedStartAngle) {
          normalizedEndAngle += 2 * Math.PI;
        }

        this.ctx.arc(
          center.x,
          center.y,
          radius,
          normalizedStartAngle,
          normalizedEndAngle,
          counterclockwise
        );
        lastPoint = end;
      }
    });

    if (isClosed && firstPoint && lastPoint) {
      this.ctx.closePath();
    }

    if (isClosed && style.fill) {
      this.ctx.fillStyle = style.fill;
      this.ctx.fill();
    }

    this.ctx.strokeStyle = style.stroke || "#000000";
    this.ctx.lineWidth = style.width || 1;
    this.ctx.stroke();
  }

  getDefaultStyle(featureType) {
    const styles = {
      centerline: { stroke: "#ff8800", width: 2, fill: null },
      parcel: { stroke: "#3366ff", width: 1, fill: "rgba(51,102,255,0.2)" },
      alignment: { stroke: "#00aa00", width: 1.5, fill: null },
      default: { stroke: "#000000", width: 1, fill: null }
    };
    return styles[featureType] || styles.default;
  }

  onMouseDown(event) {
    const rect = this.canvas.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;
    const worldPoint = this.canvasToWorld(canvasX, canvasY);
    
    // If in drawing mode, handle click for drawing
    if (this.drawingMode === "points" && this.onPointClick) {
      event.preventDefault();
      event.stopPropagation();
      this.onPointClick(worldPoint.x, worldPoint.y, canvasX, canvasY);
      return;
    }
    
    // If in segments mode, handle two-point selection
    if (this.drawingMode === "segments") {
      console.log("onMouseDown: segments mode detected, onSegmentClick:", typeof this.onSegmentClick, !!this.onSegmentClick);
      if (this.onSegmentClick) {
        event.preventDefault();
        event.stopPropagation();
        
        if (!this.segmentStartPoint) {
          // First point - store it
          this.segmentStartPoint = { x: worldPoint.x, y: worldPoint.y };
          console.log("Segment start point selected:", this.segmentStartPoint);
        } else {
          // Second point - create segment
          const endPoint = { x: worldPoint.x, y: worldPoint.y };
          console.log("Segment end point selected:", endPoint);
          this.onSegmentClick(
            this.segmentStartPoint.x,
            this.segmentStartPoint.y,
            endPoint.x,
            endPoint.y,
            canvasX,
            canvasY
          );
          // Reset for next segment (this clears the preview line)
          this.segmentStartPoint = null;
          this.currentMousePosition = null;
        }
        return;
      } else {
        console.warn("onMouseDown: segments mode but onSegmentClick is not set!");
      }
    }
    
    // If in polygon-select mode, handle polygon point selection
    if (this.drawingMode === "polygon-select") {
      event.preventDefault();
      event.stopPropagation();
      
      // Check if double-click to finish polygon
      if (event.detail === 2) {
        if (this.polygonSelectPoints.length >= 3 && this.onPolygonSelect) {
          // Complete polygon selection
          this.onPolygonSelect(this.polygonSelectPoints);
          this.polygonSelectPoints = [];
          this.currentMousePosition = null;
          this.render();
        }
        return;
      }
      
      // Add point to polygon
      this.polygonSelectPoints.push({ x: worldPoint.x, y: worldPoint.y });
      console.log("Polygon point added:", worldPoint, "Total points:", this.polygonSelectPoints.length);
      this.render();
      return;
    }
    
    // If in cursor mode, check for object clicks
    if (this.drawingMode === null && this.onObjectClick) {
      const clickedObject = this.findObjectAtPoint(worldPoint.x, worldPoint.y, canvasX, canvasY);
      if (clickedObject) {
        event.preventDefault();
        event.stopPropagation();
        // Store selected object
        this.selectedObject = clickedObject;
        // Re-render to show selected state
        this.render();
        this.onObjectClick(clickedObject, { x: event.clientX, y: event.clientY });
        return;
      } else {
        // Clear selection if clicking on empty space
        this.selectedObject = null;
        // Re-render to clear selected state
        this.render();
      }
    }
    
    // Otherwise, handle panning
    this.isPanning = true;
    this.canvas.style.cursor = "grabbing";
    this.lastPanPoint = {
      x: canvasX,
      y: canvasY
    };
    this.updateCoordDisplay(canvasX, canvasY);
  }

  findObjectAtPoint(worldX, worldY, canvasX, canvasY) {
    const clickTolerance = 8; // pixels
    
    // Check points first
    if (this.data && this.data.points && Array.isArray(this.data.points)) {
      for (const point of this.data.points) {
        if (point.x !== undefined && point.y !== undefined) {
          const pointCanvasPos = this.worldToCanvas(point.x, point.y);
          const distance = Math.sqrt(
            Math.pow(canvasX - pointCanvasPos.x, 2) + 
            Math.pow(canvasY - pointCanvasPos.y, 2)
          );
          
          if (distance <= clickTolerance) {
            return {
              type: "point",
              id: point.id,
              x: point.x,
              y: point.y,
              layer: point.layer || "",
              ...point
            };
          }
        }
      }
    }
    
    // Check segments
    if (this.data && this.data.segments && Array.isArray(this.data.segments)) {
      for (const segment of this.data.segments) {
        if (segment.segmentType === "line" && segment.start && segment.end) {
          const startCanvas = this.worldToCanvas(segment.start.x, segment.start.y);
          const endCanvas = this.worldToCanvas(segment.end.x, segment.end.y);
          
          // Calculate distance from point to line segment
          const A = canvasX - startCanvas.x;
          const B = canvasY - startCanvas.y;
          const C = endCanvas.x - startCanvas.x;
          const D = endCanvas.y - startCanvas.y;
          
          const dot = A * C + B * D;
          const lenSq = C * C + D * D;
          let param = -1;
          if (lenSq !== 0) {
            param = dot / lenSq;
          }
          
          let xx, yy;
          if (param < 0) {
            xx = startCanvas.x;
            yy = startCanvas.y;
          } else if (param > 1) {
            xx = endCanvas.x;
            yy = endCanvas.y;
          } else {
            xx = startCanvas.x + param * C;
            yy = startCanvas.y + param * D;
          }
          
          const dx = canvasX - xx;
          const dy = canvasY - yy;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance <= clickTolerance) {
            return {
              type: "segment",
              id: segment.id,
              startX: segment.start.x,
              startY: segment.start.y,
              endX: segment.end.x,
              endY: segment.end.y,
              layer: segment.layer || "",
              ...segment
            };
          }
        }
      }
    }
    
    return null;
  }

  onMouseMove(event) {
    const rect = this.canvas.getBoundingClientRect();
    const currentX = event.clientX - rect.left;
    const currentY = event.clientY - rect.top;
    const worldPoint = this.canvasToWorld(currentX, currentY);

    this.updateCoordDisplay(currentX, currentY);

    if (this.isPanning) {
      this.offsetX += currentX - this.lastPanPoint.x;
      this.offsetY += currentY - this.lastPanPoint.y;

      this.lastPanPoint = { x: currentX, y: currentY };
      this.render();
    } else {
      // Update hovered object when in cursor mode
      let newHoveredObject = null;
      if (this.drawingMode === null) {
        newHoveredObject = this.findObjectAtPoint(worldPoint.x, worldPoint.y, currentX, currentY);
      }
      
      // Only re-render if hover state changed
      if (this.objectsEqual(this.hoveredObject, newHoveredObject) === false) {
        this.hoveredObject = newHoveredObject;
        this.render();
      }
      
      // Update current mouse position for preview line
      if (this.drawingMode === "segments" && this.segmentStartPoint) {
        this.currentMousePosition = { x: worldPoint.x, y: worldPoint.y };
        // Re-render to show preview line
        this.render();
      } else if (this.drawingMode === "polygon-select" && this.polygonSelectPoints.length > 0) {
        // Update current mouse position for polygon preview
        this.currentMousePosition = { x: worldPoint.x, y: worldPoint.y };
        // Re-render to show polygon preview
        this.render();
      } else {
        this.currentMousePosition = null;
      }
      
      if (this.drawingMode === "points" || this.drawingMode === "segments" || this.drawingMode === "polygon-select") {
        // Ensure crosshair cursor is maintained when not panning in drawing modes
        this.canvas.style.cursor = "crosshair";
      } else if (this.hoveredObject) {
        // Show pointer cursor when hovering over an object
        this.canvas.style.cursor = "pointer";
      } else {
        this.canvas.style.cursor = "grab";
      }
    }
  }
  
  // Helper function to compare objects for equality
  objectsEqual(obj1, obj2) {
    if (obj1 === obj2) return true;
    if (!obj1 || !obj2) return false;
    if (obj1.type !== obj2.type) return false;
    if (obj1.id !== obj2.id) return false;
    return true;
  }
  
  // Get object state: 'inactive', 'hovered', or 'selected'
  getObjectState(object) {
    if (!object) return 'inactive';
    
    // Check single selected object
    if (this.selectedObject && this.objectsEqual(object, this.selectedObject)) {
      return 'selected';
    }
    
    // Check multiple selected objects (from SelectionSet)
    if (this.selectedObjects && Array.isArray(this.selectedObjects)) {
      const isSelected = this.selectedObjects.some(selectedObj => 
        this.objectsEqual(object, selectedObj)
      );
      if (isSelected) {
        return 'selected';
      }
    }
    
    // Check hovered object
    if (this.hoveredObject && this.objectsEqual(object, this.hoveredObject)) {
      return 'hovered';
    }
    
    return 'inactive';
  }
  
  // Get style for point based on state
  getPointStyle(state) {
    const styles = {
      inactive: {
        size: 4,
        color: "#ff0000",
        stroke: "#ffffff",
        strokeWidth: 1
      },
      hovered: {
        size: 6,
        color: "#ff6600",
        stroke: "#ffffff",
        strokeWidth: 2
      },
      selected: {
        size: 7,
        color: "#ff3300",
        stroke: "#ffff00",
        strokeWidth: 2.5
      }
    };
    return styles[state] || styles.inactive;
  }
  
  // Get style for segment based on state
  getSegmentStyle(state, defaultColor = "#0000ff") {
    const styles = {
      inactive: {
        color: defaultColor,
        lineWidth: 2
      },
      hovered: {
        color: "#0066ff",
        lineWidth: 3
      },
      selected: {
        color: "#0033ff",
        lineWidth: 4
      }
    };
    return styles[state] || styles.inactive;
  }

  onMouseUp() {
    this.isPanning = false;
    // Keep crosshair cursor if in drawing mode
    if (this.drawingMode === "points" || this.drawingMode === "segments") {
      this.canvas.style.cursor = "crosshair";
    } else {
      this.canvas.style.cursor = "grab";
    }
  }

  onMouseLeave() {
    this.isPanning = false;
    // Clear preview line when mouse leaves canvas
    this.currentMousePosition = null;
    // Clear hover state when mouse leaves canvas
    if (this.hoveredObject) {
      this.hoveredObject = null;
      this.render();
    }
    // Keep crosshair cursor if in drawing mode
    if (this.drawingMode === "points" || this.drawingMode === "segments") {
      this.canvas.style.cursor = "crosshair";
    } else {
      this.canvas.style.cursor = "grab";
    }
    this.resetCoordDisplay();
  }

  onWheel(event) {
    event.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const worldPoint = this.canvasToWorld(mouseX, mouseY);

    const zoomFactor = Math.exp(-event.deltaY * this.options.zoomIntensity);
    const newScale = this.clampScale(this.scale * zoomFactor);

    if (newScale === this.scale) {
      return;
    }

    this.scale = newScale;
    this.offsetX = mouseX - worldPoint.x * this.scale;
    this.offsetY = mouseY + worldPoint.y * this.scale;

    this.render();
  }

  onTouchStart(event) {
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      this.isPanning = true;
      const rect = this.canvas.getBoundingClientRect();
      this.lastPanPoint = {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
      };
      this.updateCoordDisplay(this.lastPanPoint.x, this.lastPanPoint.y);
    }
  }

  onTouchMove(event) {
    if (this.isPanning && event.touches.length === 1) {
      event.preventDefault();
      const touch = event.touches[0];
      const rect = this.canvas.getBoundingClientRect();
      const currentX = touch.clientX - rect.left;
      const currentY = touch.clientY - rect.top;

      this.updateCoordDisplay(currentX, currentY);

      this.offsetX += currentX - this.lastPanPoint.x;
      this.offsetY += currentY - this.lastPanPoint.y;

      this.lastPanPoint = { x: currentX, y: currentY };
      this.render();
    }
  }

  onTouchEnd() {
    this.isPanning = false;
    // Keep crosshair cursor if in drawing mode
    if (this.drawingMode === "points" || this.drawingMode === "segments") {
      this.canvas.style.cursor = "crosshair";
    } else {
      this.canvas.style.cursor = "grab";
    }
    this.resetCoordDisplay();
  }

  resize(width, height) {
    this.options.width = width;
    this.options.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.render();
    this.resetCoordDisplay();
  }

  setRasterSource(imageUrl, options = {}) {
    if (!imageUrl) {
      this.rasterImage = null;
      this.rasterSize = null;
      this.rasterBounds = null;
      this.recalculateScene();
      return;
    }

    const image = new Image();
    image.onload = () => {
      this.rasterImage = image;
      const providedSize = options.size;
      const parsedWidth =
        providedSize?.width !== undefined ? Number(providedSize.width) : Number.NaN;
      const parsedHeight =
        providedSize?.height !== undefined ? Number(providedSize.height) : Number.NaN;
      const hasProvidedSize =
        Number.isFinite(parsedWidth) && Number.isFinite(parsedHeight);
      const finalSize = hasProvidedSize
        ? { width: parsedWidth, height: parsedHeight }
        : { width: image.naturalWidth, height: image.naturalHeight };
      this.rasterSize = finalSize;

      const providedBounds = options.boundaryBox;
      const parsedBounds = providedBounds
        ? {
            minX: Number(providedBounds.minX),
            minY: Number(providedBounds.minY),
            maxX: Number(providedBounds.maxX),
            maxY: Number(providedBounds.maxY)
          }
        : null;
      const hasValidBounds =
        parsedBounds &&
        Number.isFinite(parsedBounds.minX) &&
        Number.isFinite(parsedBounds.minY) &&
        Number.isFinite(parsedBounds.maxX) &&
        Number.isFinite(parsedBounds.maxY);
      if (hasValidBounds) {
        this.rasterBounds = {
          minX: parsedBounds.minX,
          minY: parsedBounds.minY,
          maxX: parsedBounds.maxX,
          maxY: parsedBounds.maxY
        };
      } else {
        this.rasterBounds = {
          minX: 0,
          minY: 0,
          maxX: finalSize.width,
          maxY: finalSize.height
        };
      }
      this.recalculateScene();
    };
    image.onerror = () => {
      console.error("Failed to load raster image.", imageUrl);
      this.rasterImage = null;
      this.rasterSize = null;
      this.recalculateScene();
    };
    let resolvedUrl = imageUrl;
    try {
      if (!imageUrl.startsWith("blob:")) {
        resolvedUrl = new URL(imageUrl, window.location.origin).href;
      }
    } catch (error) {
      console.warn("Failed to resolve image URL, using raw value.", error);
    }

    if (resolvedUrl.startsWith("blob:")) {
      image.src = resolvedUrl;
    } else if (!resolvedUrl.includes("?")) {
      image.src = `${resolvedUrl}?t=${Date.now()}`;
    } else {
      image.src = `${resolvedUrl}&t=${Date.now()}`;
    }
  }

  recalculateScene() {
    this.calculateBounds();
    if (this.bounds) {
      this.fitToView();
    }
    this.render();
    this.resetCoordDisplay();
  }

  resetView() {
    this.fitToView();
    this.render();
    this.resetCoordDisplay();
  }

  setDrawingMode(mode, callback = null) {
    // Set drawing mode and callback for clicks
    this.drawingMode = mode;
    
    // Reset segment start point and preview when changing modes
    if (mode !== "segments") {
      this.segmentStartPoint = null;
    }
    if (mode !== "segments" && mode !== "polygon-select") {
      this.currentMousePosition = null;
    }
    
    // Reset polygon selection when changing modes
    if (mode !== "polygon-select") {
      this.polygonSelectPoints = [];
    }
    
    // Set appropriate callback based on mode
    if (mode === "points") {
      this.onPointClick = callback;
      this.onSegmentClick = null;
      this.onPolygonSelect = null;
    } else if (mode === "segments") {
      this.onPointClick = null;
      this.onSegmentClick = callback;
      this.onPolygonSelect = null;
      console.log("setDrawingMode: segments mode set, onSegmentClick:", typeof this.onSegmentClick, this.onSegmentClick);
    } else {
      this.onPointClick = null;
      this.onSegmentClick = null;
      if (mode !== "polygon-select") {
        this.onPolygonSelect = null;
      }
    }
    
    // Update cursor based on mode
    if (mode === "points" || mode === "segments" || mode === "polygon-select") {
      this.canvas.style.cursor = "crosshair";
    } else if (mode === null) {
      this.canvas.style.cursor = "grab";
    } else {
      this.canvas.style.cursor = "crosshair";
    }
    
    // Re-render to clear preview line if mode changed
    this.render();
  }
  
  setPolygonSelectMode(callback = null) {
    // Set polygon selection mode
    this.setDrawingMode("polygon-select");
    this.onPolygonSelect = callback;
    this.polygonSelectPoints = [];
    console.log("Polygon select mode activated");
  }

  renderPoint(x, y, style = {}) {
    // Render a point on the canvas
    const canvasPos = this.worldToCanvas(x, y);
    const pointSize = style.size || 4;
    const pointColor = style.color || "#ff0000";
    
    this.ctx.fillStyle = pointColor;
    this.ctx.beginPath();
    this.ctx.arc(canvasPos.x, canvasPos.y, pointSize, 0, 2 * Math.PI);
    this.ctx.fill();
    
    // Optional: draw a circle outline
    if (style.stroke) {
      this.ctx.strokeStyle = style.stroke;
      this.ctx.lineWidth = style.strokeWidth || 1;
      this.ctx.stroke();
    }
  }
}

