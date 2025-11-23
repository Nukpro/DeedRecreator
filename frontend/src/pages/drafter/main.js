import GeometryViewer from "../../components/geometry-viewer.js";
import PropertyEditor from "../../components/property-editor.js";
import "../../styles/geometry-viewer.css";
import "../../styles/property-editor.css";
import "./style.css";

console.log("=== DRAFTER MODULE LOADING ===");

let geometryViewer = null;
let propertyEditor = null;
let referenceLineActive = false;
const actionHistory = [];
let currentRasterObjectUrl = null;

const sampleData = {
  metadata: {
    source: "LandXML",
    project: "Site",
    units: {
      distance: "foot",
      area: "squareFoot",
      angle: "decimal degrees"
    }
  },
  collections: [
    {
      id: "parcels",
      title: "Parcels",
      features: [
        {
          id: "parcel-basic-1",
          name: "Basic : 1",
          featureType: "parcel",
          geometry: {
            type: "Polygon",
            isClosed: true,
            segments: [
              {
                segmentType: "line",
                start: { x: 7412.229908, y: 2736.843767 },
                end: { x: 7401.119714, y: 2784.79241 },
                length: 49.218988,
                bearing: 346.954201
              },
              {
                segmentType: "line",
                start: { x: 7401.119714, y: 2784.79241 },
                end: { x: 7326.577204, y: 2793.485871 },
                length: 75.047731,
                bearing: 276.652025
              },
              {
                segmentType: "line",
                start: { x: 7326.577204, y: 2793.485871 },
                end: { x: 7326.577204, y: 2728.238201 },
                length: 65.24767,
                bearing: 180
              },
              {
                segmentType: "line",
                start: { x: 7326.577204, y: 2728.238201 },
                end: { x: 7412.229908, y: 2736.843767 },
                length: 86.083921,
                bearing: 84.26272
              }
            ]
          },
          attributes: {
            area: 4533.132753,
            description: ""
          },
          style: {
            stroke: "#3366ff",
            width: 1,
            fill: "rgba(51,102,255,0.2)"
          }
        },
        {
          id: "parcel-property-1",
          name: "Property : 1",
          featureType: "parcel",
          geometry: {
            type: "Polygon",
            isClosed: true,
            segments: [
              {
                segmentType: "line",
                start: { x: 7310.357352, y: 2667.812527 },
                end: { x: 7335.094869, y: 2514.485365 },
                length: 155.309895,
                bearing: 170.834984
              },
              {
                segmentType: "line",
                start: { x: 7335.094869, y: 2514.485365 },
                end: { x: 7413.632974, y: 2514.485365 },
                length: 78.538106,
                bearing: 90
              },
              {
                segmentType: "arc",
                start: { x: 7413.632974, y: 2514.485365 },
                end: { x: 7463.632974, y: 2564.485365 },
                center: { x: 7413.632974, y: 2564.485365 },
                radius: 50,
                rotation: "cw",
                delta: 90,
                length: 78.539816
              },
              {
                segmentType: "line",
                start: { x: 7463.632974, y: 2564.485365 },
                end: { x: 7463.632974, y: 2611.042655 },
                length: 46.55729,
                bearing: 0
              },
              {
                segmentType: "line",
                start: { x: 7463.632974, y: 2611.042655 },
                end: { x: 7310.357352, y: 2667.812527 },
                length: 163.451016,
                bearing: 290.323506
              }
            ]
          },
          attributes: {
            area: 16717.626216,
            description: ""
          },
          style: {
            stroke: "#33aa55",
            width: 1.5,
            fill: "rgba(51,170,85,0.18)"
          }
        }
      ]
    },
    {
      id: "alignments",
      title: "Alignments",
      features: [
        {
          id: "alignment-1",
          name: "Alignment - (1)",
          featureType: "centerline",
          geometry: {
            type: "LineString",
            isClosed: false,
            segments: [
              {
                segmentType: "line",
                start: { x: 7269.040669, y: 2722.457478 },
                end: { x: 7450.893718, y: 2740.728338 },
                length: 182.768585,
                bearing: 84.26272
              }
            ]
          },
          attributes: {
            speedLimit: 60,
            stationStart: 0
          }
        }
      ]
    }
  ]
};

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
    padding: 20
  });

  // Initialize property editor
  propertyEditor = new PropertyEditor(container);

  // Setup object click handler
  geometryViewer.onObjectClick = (object, position) => {
    console.log("Object clicked:", object, position);
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
  const getSessionId = () => {
    if (window.sessionData && window.sessionData.id) {
      return window.sessionData.id;
    }
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get("session_id");
    return sessionId ? parseInt(sessionId, 10) : null;
  };

  const sessionId = getSessionId();
  if (!sessionId) {
    console.error("No session ID available");
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
        url: `/api/geometry/${sessionId}/point/${values.id}`,
        method: "PUT",
        data: updateData 
      });

      const response = await fetch(`/api/geometry/${sessionId}/point/${values.id}`, {
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
            const reloadResponse = await fetch(`/api/geometry/${sessionId}`);
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

  const sampleButtons = [
    document.getElementById("load-sample-data"),
    document.getElementById("load-sample")
  ];
  sampleButtons.forEach((button) => {
    if (!button) {
      return;
    }
    button.addEventListener("click", () => {
      if (!geometryViewer) {
        // eslint-disable-next-line no-alert
        alert("Viewer is not initialized yet.");
        return;
      }
      geometryViewer.loadData(sampleData);
      const textarea = document.getElementById("json-input");
      if (textarea) {
        textarea.value = JSON.stringify(sampleData, null, 2);
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

    // Get session_id from window.sessionData or URL parameters
    let sessionId = null;
    if (window.sessionData && window.sessionData.id) {
      sessionId = window.sessionData.id;
    } else {
      // Fallback: extract session_id from current page URL
      const urlParams = new URLSearchParams(window.location.search);
      const urlSessionId = urlParams.get("session_id");
      if (urlSessionId) {
        sessionId = parseInt(urlSessionId, 10);
      }
    }

    // Check if session_id is available
    if (!sessionId) {
      showMessage(
        status,
        "Session ID is required. Please open drafter with a session (e.g., /drafter?session_id=1).",
        true
      );
      return;
    }

    // Add session_id to URL and FormData
    const uploadUrl = `/api/upload-document?session_id=${sessionId}`;
    formData.append("session_id", sessionId);

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

function setupAlignmentControls() {
  const applyBasePointButton = document.getElementById("apply-base-point");
  const basePointStatus = document.getElementById("base-point-status");

  if (applyBasePointButton) {
    applyBasePointButton.addEventListener("click", () => {
      const xInput = document.getElementById("base-point-x");
      const yInput = document.getElementById("base-point-y");
      const xValue = xInput ? Number(xInput.value) : null;
      const yValue = yInput ? Number(yInput.value) : null;

      if (
        xValue === null ||
        Number.isNaN(xValue) ||
        yValue === null ||
        Number.isNaN(yValue)
      ) {
        showMessage(
          basePointStatus,
          "Base point values are invalid. Please enter numeric coordinates.",
          true
        );
        return;
      }

      showMessage(
        basePointStatus,
        `Base point set to X: ${xValue.toFixed(2)}, Y: ${yValue.toFixed(2)}.`,
        false
      );
      recordAction(`Base point updated to (${xValue}, ${yValue}).`);
    });
  }

  const referenceLineButton = document.getElementById("toggle-reference-line");
  const referenceLineInputs = document.getElementById("reference-line-inputs");
  const referenceLineStatus = document.getElementById("reference-line-status");

  if (referenceLineButton && referenceLineInputs) {
    referenceLineButton.addEventListener("click", () => {
      referenceLineActive = !referenceLineActive;
      referenceLineInputs.classList.toggle("active", referenceLineActive);
      referenceLineButton.textContent = referenceLineActive
        ? "Deactivate Reference Line"
        : "Activate Reference Line";

      if (referenceLineActive) {
        showMessage(
          referenceLineStatus,
          "Reference line inputs are active. Provide distance, quadrant, and bearing.",
          false
        );
        recordAction("Reference line activated.");
      } else {
        showMessage(referenceLineStatus, "Reference line inputs hidden.", false);
        recordAction("Reference line deactivated.");
      }
    });
  }

  const undoButton = document.getElementById("undo-action");
  if (undoButton) {
    undoButton.addEventListener("click", () => {
      if (actionHistory.length === 0) {
        // eslint-disable-next-line no-alert
        alert("There is nothing to undo yet.");
        return;
      }
      const lastAction = actionHistory.pop();
      // eslint-disable-next-line no-alert
      alert(`Undo placeholder: ${lastAction.description}`);
    });
  }
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
  
  // Get session ID
  const getSessionId = () => {
    if (window.sessionData && window.sessionData.id) {
      return window.sessionData.id;
    }
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get("session_id");
    return sessionId ? parseInt(sessionId, 10) : null;
  };
  
  // Load current geometry from server
  const loadGeometry = async (preserveView = false) => {
    const sessionId = getSessionId();
    if (!sessionId) {
      console.warn("No session ID available");
      return null;
    }
    
    try {
      const response = await fetch(`/api/geometry/${sessionId}`);
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
    const sessionId = getSessionId();
    if (!sessionId) {
      console.error("No session ID available");
      return;
    }
    
    try {
      const response = await fetch(`/api/geometry/${sessionId}/point`, {
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
            const reloadResponse = await fetch(`/api/geometry/${sessionId}`);
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
  
  // Update button states
  const updateButtonStates = (activeMode) => {
    console.log(`updateButtonStates called with activeMode: ${activeMode}`);
    drawingButtons.forEach((button) => {
      const mode = button.dataset.mode;
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
  
  // Handle mode change
  const setMode = (mode) => {
    console.log(`setMode called with: ${mode}`);
    currentMode = mode;
    updateButtonStates(mode);
    
    if (geometryViewer) {
      if (mode === "points") {
        console.log("Setting geometryViewer to points mode");
        geometryViewer.setDrawingMode("points", handlePointClick);
      } else if (mode === "cursor" || mode === null) {
        console.log("Setting geometryViewer to cursor mode (null)");
        geometryViewer.setDrawingMode(null);
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
    const sessionId = getSessionId();
    if (!sessionId) {
      console.error("No session ID available");
      return;
    }
    
    try {
      const response = await fetch(`/api/geometry/${sessionId}/undo`, {
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
  
  // Add click handlers to buttons
  drawingButtons.forEach((button) => {
    const mode = button.dataset.mode;
    console.log(`Adding click handler to button: ${mode}`);
    
    button.addEventListener("click", (event) => {
      console.log(`Button clicked: ${mode}, currentMode: ${currentMode}`);
      event.preventDefault();
      event.stopPropagation();
      
      if (mode === "undo") {
        handleUndo();
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
    if (getSessionId() && geometryViewer) {
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

function initializeDrafterPage() {
  console.log("initializeDrafterPage called");
  console.log("setupDrawingControls function available:", typeof setupDrawingControls);
  
  initializeGeometryViewer();
  setupGeometryControls();
  setupUploadControls();
  setupAlignmentControls();
  setupExportControls();
  setupToolBlockToggles();
  
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
  if (window.sessionData && window.sessionData.paths) {
    console.log("Checking for processed_drawing_url:", {
      hasPaths: !!window.sessionData.paths,
      hasUrl: !!window.sessionData.paths.processed_drawing_url,
      url: window.sessionData.paths.processed_drawing_url
    });
    
    if (window.sessionData.paths.processed_drawing_url) {
      const imageUrl = window.sessionData.paths.processed_drawing_url;
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

