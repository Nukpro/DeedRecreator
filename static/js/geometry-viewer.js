/**
 * Geometry Viewer Component
 * Отображает линии, дуги и полигоны из JSON структуры
 */
class GeometryViewer {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Container with id "${containerId}" not found`);
        }

        this.options = {
            width: options.width || 800,
            height: options.height || 600,
            backgroundColor: options.backgroundColor || '#ffffff',
            padding: options.padding || 20,
            minScale: typeof options.minScale === 'number' ? options.minScale : 0.05,
            maxScale: typeof options.maxScale === 'number' ? options.maxScale : 20,
            zoomIntensity: typeof options.zoomIntensity === 'number' ? options.zoomIntensity : 0.0015,
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

        this.init();
    }

    init() {
        // Создаем canvas
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.options.width;
        this.canvas.height = this.options.height;
        this.canvas.style.cursor = 'grab';
        this.ctx = this.canvas.getContext('2d');

        // Добавляем canvas в контейнер
        this.container.innerHTML = '';
        this.container.appendChild(this.canvas);

        // Панель информации о координатах
        this.coordDisplay = document.createElement('div');
        this.coordDisplay.className = 'geometry-viewer-info';
        this.coordDisplay.textContent = 'X: —  Y: —';
        this.container.appendChild(this.coordDisplay);

        // Обработчики событий для панорамирования
        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', this.onMouseLeave.bind(this));
        this.canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });

        // Обработчики для touch событий (мобильные устройства)
        this.canvas.addEventListener('touchstart', this.onTouchStart.bind(this));
        this.canvas.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
        this.canvas.addEventListener('touchend', this.onTouchEnd.bind(this));
    }

    /**
     * Загружает и отображает JSON данные
     */
    loadData(jsonData) {
        this.data = jsonData;
        this.recalculateScene();
    }

    /**
     * Вычисляет границы всех объектов для масштабирования
     */
    calculateBounds() {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

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
            this.data.collections.forEach(collection => {
                if (collection.features) {
                    collection.features.forEach(feature => {
                        if (feature.geometry && feature.geometry.segments) {
                            feature.geometry.segments.forEach(segment => {
                                if (segment.segmentType === 'line') {
                                    if (segment.start) {
                                        includePoint(segment.start.x, segment.start.y);
                                    }
                                    if (segment.end) {
                                        includePoint(segment.end.x, segment.end.y);
                                    }
                                } else if (segment.segmentType === 'arc') {
                                    if (segment.start) {
                                        includePoint(segment.start.x, segment.start.y);
                                    }
                                    if (segment.end) {
                                        includePoint(segment.end.x, segment.end.y);
                                    }
                                    if (segment.center && segment.radius) {
                                        includePoint(segment.center.x - segment.radius, segment.center.y - segment.radius);
                                        includePoint(segment.center.x + segment.radius, segment.center.y + segment.radius);
                                    }
                                }
                            });
                        }
                    });
                }
            });
        }

        if (minX !== Infinity && maxX !== -Infinity) {
            this.bounds = { minX, minY, maxX, maxY };
        } else {
            this.bounds = null;
        }
    }

    clampScale(value) {
        return Math.min(this.options.maxScale, Math.max(this.options.minScale, value));
    }

    /**
     * Масштабирует вид так, чтобы все объекты поместились
     */
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

        const candidates = [scaleX, scaleY].filter(value => Number.isFinite(value) && value > 0);
        let targetScale = candidates.length > 0 ? Math.min(...candidates) : 1;
        targetScale = targetScale * 0.9; // небольшой отступ
        if (!Number.isFinite(targetScale) || targetScale <= 0) {
            targetScale = 1;
        }

        this.scale = this.clampScale(targetScale);

        const centerX = (this.bounds.minX + this.bounds.maxX) / 2;
        const centerY = (this.bounds.minY + this.bounds.maxY) / 2;

        this.offsetX = this.canvas.width / 2 - centerX * this.scale;
        this.offsetY = this.canvas.height / 2 + centerY * this.scale;
    }

    /**
     * Преобразует мировые координаты в координаты canvas
     */
    worldToCanvas(x, y) {
        return {
            x: x * this.scale + this.offsetX,
            y: -y * this.scale + this.offsetY
        };
    }

    /**
     * Преобразует координаты canvas в мировые координаты
     */
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
            this.coordDisplay.textContent = 'X: —  Y: —';
            return;
        }

        this.coordDisplay.textContent = `X: ${world.x.toFixed(3)}  Y: ${world.y.toFixed(3)}`;
    }

    resetCoordDisplay() {
        if (this.coordDisplay) {
            this.coordDisplay.textContent = 'X: —  Y: —';
        }
    }

    /**
     * Отрисовывает все объекты
     */
    render() {
        // Очищаем canvas
        this.ctx.fillStyle = this.options.backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Отрисовываем растровый фон
        if (this.rasterImage && this.rasterBounds && this.bounds) {
            const { minX, minY, maxX, maxY } = this.rasterBounds;
            const bottomLeft = this.worldToCanvas(minX, minY);
            const topRight = this.worldToCanvas(maxX, maxY);
            const drawWidth = topRight.x - bottomLeft.x;
            const drawHeight = bottomLeft.y - topRight.y;
            if (Number.isFinite(drawWidth) && Number.isFinite(drawHeight)) {
                this.ctx.drawImage(this.rasterImage, bottomLeft.x, topRight.y, drawWidth, drawHeight);
            }
        }

        // Отрисовываем каждую коллекцию
        if (this.data && this.data.collections) {
            this.data.collections.forEach(collection => {
                if (collection.features) {
                    collection.features.forEach(feature => {
                        this.renderFeature(feature);
                    });
                }
            });
        }
    }

    /**
     * Отрисовывает один объект (feature)
     */
    renderFeature(feature) {
        if (!feature.geometry || !feature.geometry.segments) {
            return;
        }

        const style = feature.style || this.getDefaultStyle(feature.featureType);
        const isClosed = feature.geometry.isClosed || false;

        // Начинаем путь
        this.ctx.beginPath();

        let firstPoint = null;
        let lastPoint = null;

        feature.geometry.segments.forEach((segment, index) => {
            if (segment.segmentType === 'line') {
                const start = this.worldToCanvas(segment.start.x, segment.start.y);
                const end = this.worldToCanvas(segment.end.x, segment.end.y);

                if (index === 0) {
                    this.ctx.moveTo(start.x, start.y);
                    firstPoint = start;
                } else {
                    this.ctx.lineTo(start.x, start.y);
                }
                this.ctx.lineTo(end.x, end.y);
                lastPoint = end;
            } else if (segment.segmentType === 'arc') {
                const start = this.worldToCanvas(segment.start.x, segment.start.y);
                const end = this.worldToCanvas(segment.end.x, segment.end.y);
                const center = this.worldToCanvas(segment.center.x, segment.center.y);
                const radius = segment.radius * this.scale;

                if (index === 0) {
                    this.ctx.moveTo(start.x, start.y);
                    firstPoint = start;
                } else {
                    this.ctx.lineTo(start.x, start.y);
                }

                // Рисуем дугу
                const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
                const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
                
                // Определяем направление дуги
                let counterclockwise = false;
                if (segment.rotation === 'cw') {
                    counterclockwise = true;
                } else if (segment.rotation === 'ccw') {
                    counterclockwise = false;
                } else {
                    // Автоматическое определение по углу delta
                    const delta = segment.delta || 0;
                    counterclockwise = delta < 0;
                }

                // Нормализуем углы для правильной отрисовки
                let normalizedStartAngle = startAngle;
                let normalizedEndAngle = endAngle;
                
                if (counterclockwise) {
                    // Для CW дуги нужно убедиться, что endAngle меньше startAngle
                    if (normalizedEndAngle > normalizedStartAngle) {
                        normalizedEndAngle -= 2 * Math.PI;
                    }
                } else {
                    // Для CCW дуги нужно убедиться, что endAngle больше startAngle
                    if (normalizedEndAngle < normalizedStartAngle) {
                        normalizedEndAngle += 2 * Math.PI;
                    }
                }

                this.ctx.arc(center.x, center.y, radius, normalizedStartAngle, normalizedEndAngle, counterclockwise);
                lastPoint = end;
            }
        });

        // Закрываем путь, если это полигон
        if (isClosed && firstPoint && lastPoint) {
            this.ctx.closePath();
        }

        // Применяем стили и рисуем
        if (isClosed && style.fill) {
            this.ctx.fillStyle = style.fill;
            this.ctx.fill();
        }

        this.ctx.strokeStyle = style.stroke || '#000000';
        this.ctx.lineWidth = style.width || 1;
        this.ctx.stroke();
    }

    /**
     * Возвращает стиль по умолчанию для типа объекта
     */
    getDefaultStyle(featureType) {
        const styles = {
            'centerline': { stroke: '#ff8800', width: 2, fill: null },
            'parcel': { stroke: '#3366ff', width: 1, fill: 'rgba(51,102,255,0.2)' },
            'alignment': { stroke: '#00aa00', width: 1.5, fill: null },
            'default': { stroke: '#000000', width: 1, fill: null }
        };
        return styles[featureType] || styles['default'];
    }

    // Обработчики событий для панорамирования
    onMouseDown(e) {
        this.isPanning = true;
        this.canvas.style.cursor = 'grabbing';
        const rect = this.canvas.getBoundingClientRect();
        this.lastPanPoint = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
        this.updateCoordDisplay(this.lastPanPoint.x, this.lastPanPoint.y);
    }

    onMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;

        this.updateCoordDisplay(currentX, currentY);

        if (this.isPanning) {
            this.offsetX += currentX - this.lastPanPoint.x;
            this.offsetY += currentY - this.lastPanPoint.y;

            this.lastPanPoint = { x: currentX, y: currentY };
            this.render();
        }
    }

    onMouseUp(e) {
        this.isPanning = false;
        this.canvas.style.cursor = 'grab';
    }

    onMouseLeave(e) {
        this.isPanning = false;
        this.canvas.style.cursor = 'grab';
        this.resetCoordDisplay();
    }

    onWheel(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const worldPoint = this.canvasToWorld(mouseX, mouseY);

        const zoomFactor = Math.exp(-e.deltaY * this.options.zoomIntensity);
        const newScale = this.clampScale(this.scale * zoomFactor);

        if (newScale === this.scale) {
            return;
        }

        this.scale = newScale;
        this.offsetX = mouseX - worldPoint.x * this.scale;
        this.offsetY = mouseY + worldPoint.y * this.scale;

        this.render();
    }

    // Обработчики для touch событий
    onTouchStart(e) {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            this.isPanning = true;
            const rect = this.canvas.getBoundingClientRect();
            this.lastPanPoint = {
                x: touch.clientX - rect.left,
                y: touch.clientY - rect.top
            };
            this.updateCoordDisplay(this.lastPanPoint.x, this.lastPanPoint.y);
        }
    }

    onTouchMove(e) {
        if (this.isPanning && e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];
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

    onTouchEnd(e) {
        this.isPanning = false;
        this.resetCoordDisplay();
    }

    /**
     * Обновляет размеры canvas
     */
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
            const parsedWidth = providedSize?.width !== undefined ? Number(providedSize.width) : NaN;
            const parsedHeight = providedSize?.height !== undefined ? Number(providedSize.height) : NaN;
            const hasProvidedSize = Number.isFinite(parsedWidth) && Number.isFinite(parsedHeight);
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

    /**
     * Сбрасывает вид (fit to view)
     */
    resetView() {
        this.fitToView();
        this.render();
        this.resetCoordDisplay();
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GeometryViewer;
}

