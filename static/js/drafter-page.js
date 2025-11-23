(() => {
    let geometryViewer = null;
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
                                    bearing: 180.0
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
                                    bearing: 90.0
                                },
                                {
                                    segmentType: "arc",
                                    start: { x: 7413.632974, y: 2514.485365 },
                                    end: { x: 7463.632974, y: 2564.485365 },
                                    center: { x: 7413.632974, y: 2564.485365 },
                                    radius: 50.0,
                                    rotation: "cw",
                                    delta: 90.0,
                                    length: 78.539816
                                },
                                {
                                    segmentType: "line",
                                    start: { x: 7463.632974, y: 2564.485365 },
                                    end: { x: 7463.632974, y: 2611.042655 },
                                    length: 46.55729,
                                    bearing: 0.0
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
        if (!container || typeof GeometryViewer === "undefined") {
            return;
        }

        const rect = container.getBoundingClientRect();
        geometryViewer = new GeometryViewer("geometry-viewer", {
            width: rect.width || 800,
            height: rect.height || 600,
            backgroundColor: "#ffffff",
            padding: 20
        });

        window.addEventListener("resize", () => {
            if (!geometryViewer) {
                return;
            }
            const newRect = container.getBoundingClientRect();
            geometryViewer.resize(newRect.width, newRect.height);
        });
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
                    alert("Viewer is not initialized yet.");
                    return;
                }
                try {
                    const jsonData = JSON.parse(textarea.value);
                    geometryViewer.loadData(jsonData);
                } catch (error) {
                    alert(`Invalid JSON: ${(error && error.message) || error}`);
                    console.error("JSON parsing error:", error);
                }
            });
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
                showMessage(status, "Please select a document before uploading.", true);
                return;
            }
            showMessage(status, `Uploading "${file.name}"...`, false);

            const formData = new FormData();
            formData.append("document", file);

            try {
                const response = await fetch("/api/upload-document", {
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
                const warnings = Array.isArray(storedInfo?.warnings) ? storedInfo.warnings : [];
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

    function handleSelectedFile(file, statusElement) {
        const allowedTypes = [
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/tiff"
        ];
        if (!allowedTypes.includes(file.type)) {
            showMessage(statusElement, "Unsupported file type. Please select a PDF or raster image.", true);
            return;
        }
        const sizeInMb = (file.size / (1024 * 1024)).toFixed(2);
        showMessage(statusElement, `Selected "${file.name}" (${sizeInMb} MB).`, false);
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

                if (xValue === null || Number.isNaN(xValue) || yValue === null || Number.isNaN(yValue)) {
                    showMessage(basePointStatus, "Base point values are invalid. Please enter numeric coordinates.", true);
                    return;
                }

                showMessage(basePointStatus, `Base point set to X: ${xValue.toFixed(2)}, Y: ${yValue.toFixed(2)}.`, false);
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
                referenceLineButton.textContent = referenceLineActive ? "Deactivate Reference Line" : "Activate Reference Line";

                if (referenceLineActive) {
                    showMessage(referenceLineStatus, "Reference line inputs are active. Provide distance, quadrant, and bearing.", false);
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
                    alert("There is nothing to undo yet.");
                    return;
                }
                const lastAction = actionHistory.pop();
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
                alert(`${label} export will be available soon.`);
            });
        });
    }

    function setupToolBlockToggles() {
        const toolBlocks = Array.from(document.querySelectorAll(".tool-block"));
        if (toolBlocks.length === 0) {
            return;
        }

        let expandedBlock = toolBlocks.find((block) => !block.classList.contains("collapsed")) || null;

        const expandBlock = (block) => {
            block.classList.remove("collapsed");
            const toggle = block.querySelector(".tool-block-toggle");
            if (toggle) {
                toggle.setAttribute("aria-expanded", "true");
                if (toggle.dataset.expandedTitle) {
                    toggle.setAttribute("title", toggle.dataset.expandedTitle);
                }
            }
            expandedBlock = block;
        };

        const collapseBlock = (block) => {
            if (!block.classList.contains("collapsed")) {
                block.classList.add("collapsed");
            }
            const toggle = block.querySelector(".tool-block-toggle");
            if (toggle) {
                toggle.setAttribute("aria-expanded", "false");
                if (toggle.dataset.collapsedTitle) {
                    toggle.setAttribute("title", toggle.dataset.collapsedTitle);
                }
            }
            if (expandedBlock === block) {
                expandedBlock = null;
            }
        };

        const setBlockState = (block, shouldExpand) => {
            if (shouldExpand) {
                toolBlocks.forEach((otherBlock) => {
                    if (otherBlock !== block) {
                        collapseBlock(otherBlock);
                    }
                });
                expandBlock(block);
            } else {
                collapseBlock(block);
            }
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
                const willExpand = block.classList.contains("collapsed");
                setBlockState(block, willExpand);
            });

            header.addEventListener("click", (event) => {
                if (event.target.closest(".tool-block-toggle")) {
                    return;
                }
                const willExpand = block.classList.contains("collapsed");
                setBlockState(block, willExpand);
            });
        });

        if (expandedBlock) {
            setBlockState(expandedBlock, true);
        } else if (toolBlocks.length > 0) {
            setBlockState(toolBlocks[0], true);
        }
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
                const width = Number.isFinite(metadata?.imageWidth) ? Number(metadata.imageWidth) : null;
                const height = Number.isFinite(metadata?.imageHeight) ? Number(metadata.imageHeight) : null;
                const size = width !== null && height !== null ? { width, height } : null;
                const boundaryBox = metadata?.boundaryBox || null;

                geometryViewer.setRasterSource(currentRasterObjectUrl, {
                    boundaryBox,
                    size
                });
            }
        } catch (error) {
            console.error("Failed to display raster preview:", error);
            if (statusElement) {
                showMessage(statusElement, "Raster preview is unavailable. Check server logs for details.", true);
            }
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        initializeGeometryViewer();
        setupGeometryControls();
        setupUploadControls();
        setupAlignmentControls();
        setupExportControls();
        setupToolBlockToggles();
    });

    window.loadGeometryData = function loadGeometryData(jsonData) {
        if (!geometryViewer) {
            console.error("Geometry viewer is not initialized.");
            return;
        }
        geometryViewer.loadData(jsonData);
    };
})();


