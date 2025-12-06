/**
 * Property Editor Component.
 * Floating window for editing object properties.
 */

export default class PropertyEditor {
  constructor(container) {
    this.container = container;
    this.element = null;
    this.currentObject = null;
    this.onSave = null;
    this.onCancel = null;
    this.ignoreNextClick = false; // Flag to ignore the click that opened the editor
    this.openedAt = null; // Timestamp when editor was opened
    this._documentKeyHandler = null; // Document-level keyboard handler
  }

  show(object, position, onSave, onCancel) {
    console.log("PropertyEditor.show called with:", { object, position, onSave: typeof onSave, onCancel: typeof onCancel });
    
    // Store object in a local variable to preserve it
    const objectToEdit = object;
    
    // Remove existing editor if any FIRST (hide() no longer clears callbacks)
    this.hide();
    
    // Set flag to ignore the next click (the one that opened the editor)
    this.ignoreNextClick = true;
    this.openedAt = Date.now();
    
    // Set callbacks and object AFTER hide()
    this.currentObject = objectToEdit;
    this.onSave = onSave;
    this.onCancel = onCancel;
    
    console.log("Callbacks and object set:", { 
      onSave: typeof this.onSave, 
      onCancel: typeof this.onCancel,
      currentObject: this.currentObject,
      objectToEdit: objectToEdit
    });

    // Create editor element
    this.element = document.createElement("div");
    this.element.className = "property-editor";
    this.element.style.position = "absolute";
    this.element.style.zIndex = "1000";

    // Create content based on object type
    const content = this.createContent(object);
    this.element.innerHTML = content;
    
    // Store object in data attribute as backup
    this.element.setAttribute("data-object", JSON.stringify(object));

    // Add to container first to get element dimensions
    this.container.appendChild(this.element);
    console.log("Property editor element added to DOM");

    // Calculate position to keep window within container bounds
    // Position is relative to viewport, need to convert to container coordinates
    const containerRect = this.container.getBoundingClientRect();
    const elementRect = this.element.getBoundingClientRect();
    const padding = 10; // Padding from edges

    // Convert viewport coordinates to container-relative coordinates
    let left = position.x - containerRect.left;
    let top = position.y - containerRect.top;

    // Adjust horizontal position
    if (left + elementRect.width > containerRect.width - padding) {
      left = containerRect.width - elementRect.width - padding;
    }
    if (left < padding) {
      left = padding;
    }

    // Adjust vertical position
    if (top + elementRect.height > containerRect.height - padding) {
      top = containerRect.height - elementRect.height - padding;
    }
    if (top < padding) {
      top = padding;
    }

    // Set final position (relative to container)
    this.element.style.left = `${left}px`;
    this.element.style.top = `${top}px`;

    // Attach event handlers (must be after element is in DOM)
    console.log("Attaching event handlers...");
    console.log("this.currentObject before attachEventHandlers:", this.currentObject);
    console.log("objectToEdit (from parameter):", objectToEdit);
    
    // Ensure currentObject is set before attaching handlers
    if (!this.currentObject && objectToEdit) {
      console.warn("this.currentObject is null, restoring from objectToEdit");
      this.currentObject = objectToEdit;
    }
    
    this.attachEventHandlers();
    console.log("Event handlers attached");
    console.log("this.currentObject after attachEventHandlers:", this.currentObject);

    // Do NOT auto-focus any field when properties window is opened (Task 2.1.1)
    // Removed auto-focus to prevent accidental data changes when buttons are pressed

    // Handle clicks outside to close (with delay to prevent immediate closing)
    setTimeout(() => {
      document.addEventListener("click", this.handleOutsideClick.bind(this), true);
    }, 100); // Small delay to prevent immediate closing
  }

  createContent(object) {
    if (object.type === "point") {
      return this.createPointEditor(object);
    }
    if (object.type === "segment") {
      return this.createSegmentEditor(object);
    }
    return "<div>Unknown object type</div>";
  }

  createPointEditor(point) {
    const x = point.x !== undefined ? point.x.toFixed(4) : "0.0000";
    const y = point.y !== undefined ? point.y.toFixed(4) : "0.0000";
    const layer = point.layer || "";

    return `
      <div class="property-editor__header">
        <h3>Edit Point</h3>
        <button class="property-editor__close" type="button" aria-label="Close">\u00D7</button>
      </div>
      <div class="property-editor__body">
        <div class="property-editor__field">
          <label for="point-x">X Coordinate:</label>
          <input type="number" id="point-x" value="${x}" step="0.0001">
        </div>
        <div class="property-editor__field">
          <label for="point-y">Y Coordinate:</label>
          <input type="number" id="point-y" value="${y}" step="0.0001">
        </div>
        <div class="property-editor__field">
          <label for="point-layer">Layer:</label>
          <input type="text" id="point-layer" value="${layer}" placeholder="Enter layer name">
        </div>
      </div>
      <div class="property-editor__footer">
        <button class="property-editor__btn property-editor__btn--save" type="button">Apply</button>
        <button class="property-editor__btn property-editor__btn--cancel" type="button">Cancel</button>
      </div>
    `;
  }

  createSegmentEditor(segment) {
    // Backend sends bearing field which is actually azimuth (0-360°)
    // Convert to bearing format (quadrant + 0-90°) if needed
    let quadrant = segment.quadrant || "NE";
    let bearingDecimal = 0;
    
    // Calculate distance from coordinates if not provided or if it's 0/undefined
    let distance = segment.distance;
    if (distance === undefined || distance === null || distance === 0 || distance === "0" || distance === "0.0000") {
      // Calculate from coordinates
      if (segment.startX !== undefined && segment.startY !== undefined && 
          segment.endX !== undefined && segment.endY !== undefined) {
        const dx = segment.endX - segment.startX;
        const dy = segment.endY - segment.startY;
        const calculatedDistance = Math.sqrt(dx * dx + dy * dy);
        distance = calculatedDistance.toFixed(4);
      } else {
        distance = "0.0000";
      }
    } else if (typeof distance === 'number') {
      distance = distance.toFixed(4);
    }
    
    // Helper function to calculate quadrant from coordinates
    const calculateQuadrantFromCoords = () => {
      if (segment.startX !== undefined && segment.startY !== undefined && 
          segment.endX !== undefined && segment.endY !== undefined) {
        const dx = segment.endX - segment.startX;
        const dy = segment.endY - segment.startY;
        // Calculate azimuth first, then convert to bearing
        let angle = Math.atan2(dy, dx);
        let degrees = angle * (180 / Math.PI);
        if (degrees < 0) degrees += 360;
        // Convert to azimuth (North=0°, clockwise)
        let azimuth = (90 - degrees) % 360;
        if (azimuth < 0) azimuth += 360;
        // Convert azimuth to bearing
        if (typeof window.azimuthToBearing === 'function') {
          const bearingData = window.azimuthToBearing(azimuth);
          return bearingData.quadrant;
        }
      }
      return null;
    };
    
    if (segment.bearing !== undefined && segment.bearing !== null) {
      if (typeof segment.bearing === 'number') {
        // Check if it's azimuth (0-360) or bearing (0-90)
        if (segment.bearing > 90) {
          // It's azimuth, convert to bearing
          if (typeof window.azimuthToBearing === 'function') {
            const bearingData = window.azimuthToBearing(segment.bearing);
            quadrant = bearingData.quadrant;
            bearingDecimal = bearingData.bearing;
          } else {
            // Fallback: calculate from coordinates
            const calculatedQuadrant = calculateQuadrantFromCoords();
            quadrant = calculatedQuadrant || segment.quadrant || "NE";
            bearingDecimal = segment.bearing % 90; // Rough conversion
          }
        } else {
          // It's already bearing (0-90°), including 0
          bearingDecimal = segment.bearing;
          // Always calculate quadrant from coordinates if not provided to ensure accuracy
          if (!segment.quadrant) {
            const calculatedQuadrant = calculateQuadrantFromCoords();
            quadrant = calculatedQuadrant || "NE";
          } else {
            quadrant = segment.quadrant;
          }
        }
      } else {
        // It's a string (DMS format), keep as is for display
        bearingDecimal = 0; // Will be handled by the input field
        // Calculate quadrant from coordinates
        const calculatedQuadrant = calculateQuadrantFromCoords();
        quadrant = calculatedQuadrant || segment.quadrant || "NE";
      }
    } else {
      // Bearing is undefined or null, calculate from coordinates
      if (segment.startX !== undefined && segment.startY !== undefined && 
          segment.endX !== undefined && segment.endY !== undefined) {
        const dx = segment.endX - segment.startX;
        const dy = segment.endY - segment.startY;
        // Calculate azimuth first, then convert to bearing
        let angle = Math.atan2(dy, dx);
        let degrees = angle * (180 / Math.PI);
        if (degrees < 0) degrees += 360;
        // Convert to azimuth (North=0°, clockwise)
        let azimuth = (90 - degrees) % 360;
        if (azimuth < 0) azimuth += 360;
        // Convert azimuth to bearing
        if (typeof window.azimuthToBearing === 'function') {
          const bearingData = window.azimuthToBearing(azimuth);
          quadrant = bearingData.quadrant;
          bearingDecimal = bearingData.bearing;
        } else {
          quadrant = segment.quadrant || "NE";
          bearingDecimal = 0;
        }
      }
    }
    
    // Convert bearing from decimal to DMS format for display (Task 2.3.7)
    let bearingDisplay = "0*00'00.00\"";
    if (typeof bearingDecimal === 'number' && bearingDecimal >= 0 && bearingDecimal <= 90) {
      // Use the conversion function from main.js (attached to window)
      if (typeof window.decimalToDMS === 'function') {
        bearingDisplay = window.decimalToDMS(bearingDecimal);
      } else if (typeof decimalToDMS === 'function') {
        bearingDisplay = decimalToDMS(bearingDecimal);
      } else {
        // Fallback if function not available
        bearingDisplay = `${bearingDecimal.toFixed(2)}*00'00.00"`;
      }
    } else if (typeof segment.bearing === 'string') {
      // Already in DMS format
      bearingDisplay = segment.bearing;
    }
    const layer = segment.layer || "";
    const startX = segment.startX !== undefined ? segment.startX.toFixed(4) : "0.0000";
    const startY = segment.startY !== undefined ? segment.startY.toFixed(4) : "0.0000";
    const endX = segment.endX !== undefined ? segment.endX.toFixed(4) : "0.0000";
    const endY = segment.endY !== undefined ? segment.endY.toFixed(4) : "0.0000";

    // Task 2.3.1-2.3.4: Create two collapsible blocks
    return `
      <div class="property-editor__header">
        <h3>Edit Segment</h3>
        <button class="property-editor__close" type="button" aria-label="Close">\u00D7</button>
      </div>
      <div class="property-editor__body">
        <!-- Task 2.3.3: First block - Bearings (Quadrant, bearing, distance) -->
        <div class="property-editor__block" data-block="bearings">
          <div class="property-editor__block-header">
            <button type="button" class="property-editor__block-toggle" aria-expanded="true">
              <span class="property-editor__block-title">Bearings</span>
              <span class="property-editor__block-icon">\u25BC</span>
            </button>
          </div>
          <div class="property-editor__block-content" style="display: block;">
            <div class="property-editor__field">
              <label for="segment-quadrant">Quadrant:</label>
              <select id="segment-quadrant">
                <option value="NE" ${quadrant === "NE" ? "selected" : ""}>NE</option>
                <option value="NW" ${quadrant === "NW" ? "selected" : ""}>NW</option>
                <option value="SW" ${quadrant === "SW" ? "selected" : ""}>SW</option>
                <option value="SE" ${quadrant === "SE" ? "selected" : ""}>SE</option>
              </select>
            </div>
            <div class="property-editor__field">
              <label for="segment-bearing">Bearing:</label>
              <input type="text" id="segment-bearing" value="${bearingDisplay}" placeholder="D*MM'SS.SS&quot;">
            </div>
            <div class="property-editor__field">
              <label for="segment-distance">Distance (feet):</label>
              <input type="number" id="segment-distance" value="${distance}" step="0.0001">
            </div>
          </div>
        </div>
        
        <!-- Task 2.3.4: Second block - Points (start point and end point X Y) -->
        <div class="property-editor__block" data-block="points">
          <div class="property-editor__block-header">
            <button type="button" class="property-editor__block-toggle" aria-expanded="false">
              <span class="property-editor__block-title">Points</span>
              <span class="property-editor__block-icon">\u25B6</span>
            </button>
          </div>
          <div class="property-editor__block-content" style="display: none;">
            <div class="property-editor__field">
              <label for="segment-start-x">Start X:</label>
              <input type="number" id="segment-start-x" value="${startX}" step="0.0001">
            </div>
            <div class="property-editor__field">
              <label for="segment-start-y">Start Y:</label>
              <input type="number" id="segment-start-y" value="${startY}" step="0.0001">
            </div>
            <div class="property-editor__field">
              <label for="segment-end-x">End X:</label>
              <input type="number" id="segment-end-x" value="${endX}" step="0.0001">
            </div>
            <div class="property-editor__field">
              <label for="segment-end-y">End Y:</label>
              <input type="number" id="segment-end-y" value="${endY}" step="0.0001">
            </div>
          </div>
        </div>
        
        <div class="property-editor__field">
          <label for="segment-layer">Layer:</label>
          <input type="text" id="segment-layer" value="${layer}" placeholder="Enter layer name">
        </div>
      </div>
      <div class="property-editor__footer">
        <button class="property-editor__btn property-editor__btn--save" type="button">Apply</button>
        <button class="property-editor__btn property-editor__btn--cancel" type="button">Cancel</button>
      </div>
    `;
  }

  handleOutsideClick(event) {
    if (!this.element) {
      return;
    }
    
    // Ignore clicks inside the editor
    if (this.element.contains(event.target)) {
      return;
    }
    
    // Ignore clicks on buttons inside the editor
    if (event.target.closest(".property-editor")) {
      return;
    }
    
    // Ignore the click that opened the editor (within 300ms of opening)
    if (this.ignoreNextClick || (this.openedAt && Date.now() - this.openedAt < 300)) {
      console.log("Ignoring click that opened the editor");
      this.ignoreNextClick = false;
      return;
    }
    
    // Don't close if clicking on canvas (it might be a selection or drawing action)
    if (event.target.tagName === "CANVAS") {
      return;
    }
    
    console.log("Outside click detected, closing editor");
    this.hide();
  }

  hide() {
    // Remove keyboard handlers before hiding
    this._removeKeyboardHandlers();
    this._removeDocumentKeyHandler();
    
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
    document.removeEventListener("click", this.handleOutsideClick.bind(this), true);
    // Don't clear currentObject and callbacks here - they are set in show() and needed for event handlers
    // this.currentObject = null;
    // this.onSave = null;
    // this.onCancel = null;
  }

  getValuesFromElement(element, currentObject) {
    if (!element) {
      console.error("Property editor element not found");
      return null;
    }

    if (!currentObject) {
      console.error("Current object not set");
      return null;
    }

    console.log("getValuesFromElement called for object type:", currentObject.type);

    if (currentObject.type === "point") {
      const xInput = element.querySelector("#point-x");
      const yInput = element.querySelector("#point-y");
      const layerInput = element.querySelector("#point-layer");
      
      console.log("Input fields found:", { 
        xInput: !!xInput, 
        yInput: !!yInput, 
        layerInput: !!layerInput,
        xValue: xInput ? xInput.value : "N/A",
        yValue: yInput ? yInput.value : "N/A",
        layerValue: layerInput ? layerInput.value : "N/A"
      });
      
      if (!xInput || !yInput || !layerInput) {
        console.error("Input fields not found:", { xInput: !!xInput, yInput: !!yInput, layerInput: !!layerInput });
        return null;
      }
      
      const xValue = xInput.value.trim();
      const yValue = yInput.value.trim();
      const layerValue = layerInput.value.trim();
      
      console.log("Raw input values:", { xValue, yValue, layerValue });
      
      // Parse coordinates - they should always be numbers
      if (xValue === "" || yValue === "") {
        console.error("X or Y coordinate is empty");
        return null;
      }
      
      const x = parseFloat(xValue);
      const y = parseFloat(yValue);
      
      console.log("Parsed coordinates:", { x, y, xIsNaN: isNaN(x), yIsNaN: isNaN(y) });
      
      if (isNaN(x)) {
        console.error("Invalid X coordinate:", xValue);
        return null;
      }
      if (isNaN(y)) {
        console.error("Invalid Y coordinate:", yValue);
        return null;
      }
      
      const values = {
        type: "point",
        id: currentObject.id,
        x: x,
        y: y,
        layer: layerValue
      };
      
      console.log("Final parsed values:", values);
      return values;
    }
    
    if (currentObject.type === "segment") {
      // Task 2.3.5-2.3.6: Determine which block is open
      const bearingsBlock = element.querySelector('[data-block="bearings"]');
      const pointsBlock = element.querySelector('[data-block="points"]');
      const bearingsExpanded = bearingsBlock && bearingsBlock.querySelector('.property-editor__block-toggle').getAttribute("aria-expanded") === "true";
      const pointsExpanded = pointsBlock && pointsBlock.querySelector('.property-editor__block-toggle').getAttribute("aria-expanded") === "true";
      
      const layerInput = element.querySelector("#segment-layer");
      const layerValue = layerInput ? layerInput.value.trim() : "";
      
      // Task 2.3.5: If bearings block is open
      if (bearingsExpanded) {
        const quadrantInput = element.querySelector("#segment-quadrant");
        const bearingInput = element.querySelector("#segment-bearing");
        const distanceInput = element.querySelector("#segment-distance");
        
        if (!quadrantInput || !bearingInput || !distanceInput) {
          console.error("Bearings block fields not found");
          return null;
        }
        
        const quadrantValue = quadrantInput.value.trim();
        const bearingValue = bearingInput.value.trim();
        const distanceValue = distanceInput.value.trim();
        
        // Task 2.3.7: Convert DMS to decimal degrees
        let bearingDecimal;
        try {
          // Check if dmsToDecimal function is available (from main.js, attached to window)
          if (typeof window.dmsToDecimal === 'function') {
            bearingDecimal = window.dmsToDecimal(bearingValue);
          } else if (typeof dmsToDecimal === 'function') {
            bearingDecimal = dmsToDecimal(bearingValue);
          } else {
            // Fallback: try to parse as decimal
            bearingDecimal = parseFloat(bearingValue);
            if (isNaN(bearingDecimal)) {
              throw new Error("Invalid bearing format");
            }
          }
        } catch (error) {
          console.error("Error converting bearing from DMS:", error);
          alert(`Invalid bearing format: ${error.message}. Expected format: D*MM'SS.SS"`);
          return null;
        }
        
        // Task 2.3.5: Validation
        if (bearingDecimal < 0 || bearingDecimal > 90) {
          alert("Bearing must be in range 0 to 90 degrees");
          return null;
        }
        
        const distance = parseFloat(distanceValue);
        if (isNaN(distance) || distance <= 0) {
          alert("Distance must be greater than 0");
          return null;
        }
        
        return {
          type: "segment",
          id: currentObject.id,
          activeBlock: "bearings",
          quadrant: quadrantValue,
          bearing: bearingDecimal, // Decimal degrees for backend
          distance: distance,
          layer: layerValue
        };
      }
      
      // Task 2.3.6: If points block is open
      if (pointsExpanded) {
        const startXInput = element.querySelector("#segment-start-x");
        const startYInput = element.querySelector("#segment-start-y");
        const endXInput = element.querySelector("#segment-end-x");
        const endYInput = element.querySelector("#segment-end-y");
        
        if (!startXInput || !startYInput || !endXInput || !endYInput) {
          console.error("Points block fields not found");
          return null;
        }
        
        const startXValue = startXInput.value.trim();
        const startYValue = startYInput.value.trim();
        const endXValue = endXInput.value.trim();
        const endYValue = endYInput.value.trim();
        
        if (startXValue === "" || startYValue === "" || endXValue === "" || endYValue === "") {
          console.error("Coordinates cannot be empty");
          return null;
        }
        
        const startX = parseFloat(startXValue);
        const startY = parseFloat(startYValue);
        const endX = parseFloat(endXValue);
        const endY = parseFloat(endYValue);
        
        if (isNaN(startX) || isNaN(startY) || isNaN(endX) || isNaN(endY)) {
          console.error("Invalid coordinates");
          return null;
        }
        
        return {
          type: "segment",
          id: currentObject.id,
          activeBlock: "points",
          startX: startX,
          startY: startY,
          endX: endX,
          endY: endY,
          layer: layerValue
        };
      }
      
      // Neither block is open - return error
      alert("Please open either the Bearings or Points block to make changes");
      return null;
    }

    console.error("Unknown object type:", currentObject.type);
    return null;
  }

  getValues() {
    return this.getValuesFromElement(this.element, this.currentObject);
  }

  attachEventHandlers() {
    if (!this.element) {
      console.error("Cannot attach event handlers: element is null");
      return;
    }

    // Check if currentObject is set
    if (!this.currentObject) {
      console.error("WARNING: this.currentObject is null when attaching event handlers!");
      console.error("This should not happen. Check if hide() is being called after show().");
      // Try to get object from the element's data attribute as fallback
      const objectData = this.element.getAttribute("data-object");
      if (objectData) {
        try {
          this.currentObject = JSON.parse(objectData);
          console.log("Recovered currentObject from data attribute:", this.currentObject);
        } catch (e) {
          console.error("Failed to parse object from data attribute:", e);
        }
      }
    }

    // Store callbacks and current object in variables to preserve them
    const onSaveCallback = this.onSave;
    const onCancelCallback = this.onCancel;
    const currentObject = this.currentObject;
    const element = this.element; // Store reference to element
    
    console.log("Looking for save button...");
    console.log("onSave callback stored:", typeof onSaveCallback, onSaveCallback);
    console.log("currentObject stored:", currentObject);
    
    if (!currentObject) {
      console.error("ERROR: Cannot attach event handlers - currentObject is still null!");
      return;
    }
    
    // Save button
    const saveBtn = this.element.querySelector(".property-editor__btn--save");
    console.log("Save button found:", !!saveBtn, saveBtn);
    
    if (saveBtn) {
      // Remove any existing listeners first
      const newSaveBtn = saveBtn.cloneNode(true);
      saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
      
      newSaveBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log("Save button clicked - event handler fired!");
        console.log("onSave callback:", typeof onSaveCallback, onSaveCallback);
        console.log("stored currentObject:", currentObject);
        console.log("this.currentObject:", this.currentObject);
        
        if (onSaveCallback) {
          console.log("Getting values from form...");
          // Use stored references instead of this
          const values = this.getValuesFromElement(element, currentObject);
          console.log("Values from form:", values);
          if (values) {
            console.log("Calling onSave with values:", values);
            // Don't hide immediately - let onSave handle it
            onSaveCallback(values);
          } else {
            console.error("Failed to get values from form - getValues() returned null");
            alert("Failed to get values from form. Please check your input.");
          }
        } else {
          console.error("onSave callback is not set!");
          this.hide();
        }
      });
      console.log("Save button event handler attached");
    } else {
      console.error("Save button not found in element!");
    }

    // Cancel button
    const cancelBtn = this.element.querySelector(".property-editor__btn--cancel");
    if (cancelBtn) {
      // Remove any existing listeners first
      const newCancelBtn = cancelBtn.cloneNode(true);
      cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
      
      newCancelBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log("Cancel button clicked");
        if (onCancelCallback) {
          onCancelCallback();
        }
        this.hide();
      });
    }

    // Close button
    const closeBtn = this.element.querySelector(".property-editor__close");
    if (closeBtn) {
      // Remove any existing listeners first
      const newCloseBtn = closeBtn.cloneNode(true);
      closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
      
      newCloseBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log("Close button clicked");
        if (onCancelCallback) {
          onCancelCallback();
        }
        this.hide();
      });
    }

    // Keyboard handlers for Enter and ESC (Tasks 2.1.2 and 2.1.3)
    // Handle Enter key to apply changes and close (Task 2.1.2)
    const handleEnterKey = (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // Only handle Enter if not in a textarea or if it's a simple Enter press
        const target = e.target;
        if (target.tagName !== "TEXTAREA" || (target.tagName === "TEXTAREA" && e.ctrlKey)) {
          e.preventDefault();
          e.stopPropagation();
          console.log("Enter key pressed - applying changes");
          if (onSaveCallback) {
            const values = this.getValuesFromElement(element, currentObject);
            if (values) {
              onSaveCallback(values);
            }
          }
          this.hide();
        }
      }
    };
    
    // Handle ESC key to close without changes (Task 2.1.3)
    const handleEscapeKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        console.log("ESC key pressed - closing without changes");
        if (onCancelCallback) {
          onCancelCallback();
        }
        this.hide();
      }
    };
    
    // Attach keyboard handlers to all inputs and the element itself
    const inputs = this.element.querySelectorAll("input, select, textarea");
    inputs.forEach((input) => {
      input.addEventListener("keydown", handleEnterKey);
      input.addEventListener("keydown", handleEscapeKey);
    });
    
    // Also attach to the element itself for when no input is focused
    this.element.addEventListener("keydown", handleEscapeKey);
    
    // Store handlers for cleanup
    this._keyboardHandlers = {
      handleEnterKey,
      handleEscapeKey,
      element: this.element,
      inputs: inputs
    };
    
    // Attach document-level keyboard handler for ESC and Enter when property window is open
    this._attachDocumentKeyHandler(onSaveCallback, onCancelCallback, element, currentObject);
    
    // Task 2.3.1-2.3.2: Attach collapsible block handlers
    this._attachBlockHandlers();
  }
  
  _attachDocumentKeyHandler(onSaveCallback, onCancelCallback, element, currentObject) {
    // Remove existing handler if any
    this._removeDocumentKeyHandler();
    
    // Create document-level handler for ESC and Enter
    this._documentKeyHandler = (e) => {
      // Only handle if property window is visible
      if (!this.element || !this.element.parentNode) {
        return;
      }
      
      const activeElement = document.activeElement;
      
      // Don't handle if user is typing in an input/textarea outside the property editor
      if (activeElement && 
          (activeElement.tagName === "INPUT" || 
           activeElement.tagName === "TEXTAREA" || 
           activeElement.isContentEditable) &&
          !this.element.contains(activeElement)) {
        return;
      }
      
      // Handle ESC key - close without changes (always works when property window is open)
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        console.log("ESC key pressed - closing property window without changes");
        if (onCancelCallback) {
          onCancelCallback();
        }
        this.hide();
        return;
      }
      
      // Handle Enter key - apply changes and close
      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // Don't handle Enter if user is in a textarea (unless Ctrl+Enter)
        if (activeElement && activeElement.tagName === "TEXTAREA" && !e.ctrlKey) {
          return;
        }
        
        // If user is in an input/select within the property editor, 
        // let the input-level handler deal with it (it fires in bubble phase after this)
        // We'll handle it here in capture phase to ensure it works
        if (activeElement && 
            (activeElement.tagName === "INPUT" || activeElement.tagName === "SELECT") &&
            this.element.contains(activeElement)) {
          e.preventDefault();
          e.stopPropagation();
          console.log("Enter key pressed - applying changes");
          if (onSaveCallback) {
            const values = this.getValuesFromElement(element, currentObject);
            if (values) {
              onSaveCallback(values);
            }
          }
          this.hide();
          return;
        }
        
        // If no input is focused but property window is open, apply changes
        if (!activeElement || 
            (activeElement.tagName !== "INPUT" && 
             activeElement.tagName !== "TEXTAREA" && 
             activeElement.tagName !== "SELECT" &&
             !activeElement.isContentEditable)) {
          e.preventDefault();
          e.stopPropagation();
          console.log("Enter key pressed - applying changes (no input focused)");
          if (onSaveCallback) {
            const values = this.getValuesFromElement(element, currentObject);
            if (values) {
              onSaveCallback(values);
            }
          }
          this.hide();
        }
      }
    };
    
    // Attach to document with capture phase to catch keys early
    document.addEventListener("keydown", this._documentKeyHandler, true);
  }
  
  _removeDocumentKeyHandler() {
    if (this._documentKeyHandler) {
      document.removeEventListener("keydown", this._documentKeyHandler, true);
      this._documentKeyHandler = null;
    }
  }
  
  _attachBlockHandlers() {
    if (!this.element) return;
    
    // Find all block toggles
    const blockToggles = this.element.querySelectorAll(".property-editor__block-toggle");
    
    blockToggles.forEach((toggle) => {
      toggle.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const block = toggle.closest(".property-editor__block");
        const content = block.querySelector(".property-editor__block-content");
        const isExpanded = toggle.getAttribute("aria-expanded") === "true";
        
        // Task 2.3.2: Only one block active at a time - minimize others
        if (isExpanded) {
          // Collapse this block
          toggle.setAttribute("aria-expanded", "false");
          content.style.display = "none";
          const icon = toggle.querySelector(".property-editor__block-icon");
          if (icon) icon.textContent = "\u25B6";
        } else {
          // Expand this block and collapse all others
          const allBlocks = this.element.querySelectorAll(".property-editor__block");
          allBlocks.forEach((otherBlock) => {
            const otherToggle = otherBlock.querySelector(".property-editor__block-toggle");
            const otherContent = otherBlock.querySelector(".property-editor__block-content");
            const otherIcon = otherToggle.querySelector(".property-editor__block-icon");
            
            if (otherBlock === block) {
              // Expand this block
              otherToggle.setAttribute("aria-expanded", "true");
              otherContent.style.display = "block";
              if (otherIcon) otherIcon.textContent = "\u25BC";
            } else {
              // Collapse other blocks
              otherToggle.setAttribute("aria-expanded", "false");
              otherContent.style.display = "none";
              if (otherIcon) otherIcon.textContent = "\u25B6";
            }
          });
        }
      });
    });
  }
  
  _removeKeyboardHandlers() {
    if (this._keyboardHandlers) {
      const { handleEnterKey, handleEscapeKey, element, inputs } = this._keyboardHandlers;
      inputs.forEach((input) => {
        input.removeEventListener("keydown", handleEnterKey);
        input.removeEventListener("keydown", handleEscapeKey);
      });
      if (element) {
        element.removeEventListener("keydown", handleEscapeKey);
      }
      this._keyboardHandlers = null;
    }
  }
}
