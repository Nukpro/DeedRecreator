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

    // Focus first input
    const firstInput = this.element.querySelector("input, select");
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 0);
    }

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
        <button class="property-editor__close" type="button" aria-label="Close">×</button>
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
    const quadrant = segment.quadrant || "NE";
    const bearing = segment.bearing || "0*00'00.00\"";
    const distance = segment.distance || "0.0000";
    const layer = segment.layer || "";
    const startX = segment.startX !== undefined ? segment.startX.toFixed(4) : "0.0000";
    const startY = segment.startY !== undefined ? segment.startY.toFixed(4) : "0.0000";
    const endX = segment.endX !== undefined ? segment.endX.toFixed(4) : "0.0000";
    const endY = segment.endY !== undefined ? segment.endY.toFixed(4) : "0.0000";

    return `
      <div class="property-editor__header">
        <h3>Edit Segment</h3>
        <button class="property-editor__close" type="button" aria-label="Close">×</button>
      </div>
      <div class="property-editor__body">
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
          <input type="text" id="segment-bearing" value="${bearing}" placeholder="D*MM'SS.SS&quot;">
        </div>
        <div class="property-editor__field">
          <label for="segment-distance">Distance (feet):</label>
          <input type="number" id="segment-distance" value="${distance}" step="0.0001">
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
      const startXInput = element.querySelector("#segment-start-x");
      const startYInput = element.querySelector("#segment-start-y");
      const endXInput = element.querySelector("#segment-end-x");
      const endYInput = element.querySelector("#segment-end-y");
      const quadrantInput = element.querySelector("#segment-quadrant");
      const bearingInput = element.querySelector("#segment-bearing");
      const distanceInput = element.querySelector("#segment-distance");
      const layerInput = element.querySelector("#segment-layer");
      
      if (!startXInput || !startYInput || !endXInput || !endYInput || !quadrantInput || !bearingInput || !distanceInput || !layerInput) {
        console.error("Input fields not found for segment");
        return null;
      }
      
      const startXValue = startXInput.value.trim();
      const startYValue = startYInput.value.trim();
      const endXValue = endXInput.value.trim();
      const endYValue = endYInput.value.trim();
      const quadrantValue = quadrantInput.value.trim();
      const bearingValue = bearingInput.value.trim();
      const distanceValue = distanceInput.value.trim();
      const layerValue = layerInput.value.trim();
      
      // Parse coordinates
      if (startXValue === "" || startYValue === "" || endXValue === "" || endYValue === "") {
        console.error("Coordinates cannot be empty");
        return null;
      }
      
      const startX = parseFloat(startXValue);
      const startY = parseFloat(startYValue);
      const endX = parseFloat(endXValue);
      const endY = parseFloat(endYValue);
      const distance = parseFloat(distanceValue);
      
      if (isNaN(startX) || isNaN(startY) || isNaN(endX) || isNaN(endY)) {
        console.error("Invalid coordinates");
        return null;
      }
      
      if (isNaN(distance) || distance < 0) {
        console.error("Invalid distance");
        return null;
      }
      
      const values = {
        type: "segment",
        id: currentObject.id,
        startX: startX,
        startY: startY,
        endX: endX,
        endY: endY,
        quadrant: quadrantValue,
        bearing: bearingValue,
        distance: distance,
        layer: layerValue
      };
      
      console.log("Final parsed values for segment:", values);
      return values;
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

    // Enter key to save
    const inputs = this.element.querySelectorAll("input");
    inputs.forEach((input) => {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (onSaveCallback) {
            const values = this.getValues();
            if (values) {
              onSaveCallback(values);
            }
          }
          this.hide();
        } else if (e.key === "Escape") {
          e.preventDefault();
          if (onCancelCallback) {
            onCancelCallback();
          }
          this.hide();
        }
      });
    });
  }
}

