/**************************************************
 * main.js - Extended "Visio-like" Diagram Editor
 *           Now with GIF export using gif.js
 *           Now supporting image drag & drop
 **************************************************/

let exportingGif = false;
let exportDashOffset = 0; 

const canvas = document.getElementById("myCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
console.log("gifuct:", window.gifuct);
canvas.width = 1200;
canvas.height = 1200;

// --- ADD: Function to adjust canvas zoom to fit screen ---
function adjustCanvasZoom() {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    let scale = 1; // Default no scale

    // Calculate scale to fit width
    const scaleX = windowWidth / canvasWidth;
    // Calculate scale to fit height
    const scaleY = windowHeight / canvasHeight;

    // Use the smaller scale factor to fit both width and height
    scale = Math.min(scaleX, scaleY);

    // Apply the scale using CSS transform
    canvas.style.transformOrigin = '0 0'; // Scale from top-left corner
    canvas.style.transform = `scale(${scale})`;
}

// Call adjustCanvasZoom initially and on window resize
adjustCanvasZoom();
window.addEventListener('resize', adjustCanvasZoom);

// Toolbar buttons
const selectBtn = document.getElementById("toolSelect");
const rectBtn = document.getElementById("toolRect");
const arrowBtn = document.getElementById("toolArrow");
// --- ADD exportGifBtn ---
const exportGifBtn = document.getElementById("exportGifBtn");

// Inline text editor input
const shapeEditorInput = document.getElementById("shapeEditor");

// Diagram data
let shapes = [];    // array of Shape objects
let arrows = [];    // array of { fromId, toId }
let shapeCounter = 0;

// For arrow animation
let dashOffset = 0;

// Current tool mode: 'select', 'rect', or 'arrow'
let currentTool = "select";

// For dragging shapes
let draggingShape = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

// For drawing an arrow (click+drag from shape A to shape B)
let isDrawingLine = false;
let arrowStartShape = null; 
let arrowEndPos = { x: 0, y: 0 };

// --- ADD: Variable for arrow hover state ---
let hoveredArrow = null;

// --- ADD: Variables for arrow dragging ---
let isDraggingArrow = false;
let dragStartX = 0;
let dragStartY = 0;
let selectedWaypointIndex = -1;
let isDraggingWaypoint = false;
let isDraggingEndpoint = false;

// --- ADD: Variables to track selection and resizing state ---
let selectedShape = null;        // which shape (if any) is selected
let isResizing = false;          // are we currently resizing a shape?
let resizeHandleIndex = -1;      // which handle is being dragged?
const HANDLE_SIZE = 8;           // size of each resize handle

// --- ADD: Arrow selection variables ---
let selectedArrow = null;        // which arrow (if any) is selected
// ----- Adjust arrow handle size and hit thresholds -----
// Increase ARROW_HANDLE_SIZE to make waypoint handles larger and easier to hit.
const ARROW_HANDLE_SIZE = 10; // Previously 6

// Reference the context menu div
const contextMenu = document.getElementById("context-menu");

// Hide the menu on any left-click
document.addEventListener("click", () => {
  contextMenu.style.display = "none";
  hoveredArrow = null;
  canvas.style.cursor = "default";
});

// Right-click on the canvas
canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  // Determine the shape under the mouse using canvas coordinates
  const rect = canvas.getBoundingClientRect();
  // Calculate canvas coordinates for shape detection (taking transform into account)
  const scaleMatch = canvas.style.transform.match(/scale\((.*?)\)/);
  const scale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;
  const canvasX = (e.clientX - rect.left) / scale;
  const canvasY = (e.clientY - rect.top) / scale;
  
  const shape = findShapeUnderMouse(canvasX, canvasY);
  
  if (shape) {
    selectedShape = shape;
    // Position the context menu using the event's client coordinates
    contextMenu.style.left = e.clientX + "px";
    contextMenu.style.top = e.clientY + "px";
    contextMenu.style.display = "block";
  } else {
    contextMenu.style.display = "none";
  }
});

// Get references to newly added elements
const fontSizeSelect = document.getElementById("fontSizeSelect");
const fontFamilySelect = document.getElementById("fontFamilySelect");
const arrowColorPicker = document.getElementById("arrowColorPicker");
const fillColorPicker = document.getElementById("fillColorPicker");
// --- ADD: Line thickness picker ---
const lineThicknessPicker = document.getElementById("lineThicknessPicker");

// --- ADD: Variables for animated border ---
let isAnimatedBorderEnabled = false;
let animatedBorderShape = null;

// AnimatedGifShape: A class to handle animated GIF frames decoded via gifuct-js
class AnimatedGifShape {
  constructor(x, y, frames, speedMultiplier = 1) {
    this.id = shapeCounter++;
    this.x = x;
    this.y = y;
    this.frames = frames;
    this.speedMultiplier = speedMultiplier;
    this.currentFrameIndex = 0;
    this.lastFrameTime = performance.now();
    
    // Create a background canvas for proper frame compositing
    this.backgroundCanvas = document.createElement("canvas");
    this.backgroundCtx = this.backgroundCanvas.getContext("2d", {
      willReadFrequently: true,
      alpha: true
    });
    
    // Determine dimensions based on all frames
    this.width = Math.max(...frames.map(f => f.dims.width + f.dims.left));
    this.height = Math.max(...frames.map(f => f.dims.height + f.dims.top));
    
    this.backgroundCanvas.width = this.width;
    this.backgroundCanvas.height = this.height;
    
    this.preRenderFrames();
  }

  preRenderFrames() {
    this.imageFrames = this.frames.map((frame) => {
      const { dims, patch } = frame;
      const frameCanvas = document.createElement("canvas");
      frameCanvas.width = this.width;
      frameCanvas.height = this.height;
      const frameCtx = frameCanvas.getContext("2d", {
        willReadFrequently: true,
        alpha: true
      });
      
      // Disable image smoothing to keep pixels crisp
      frameCtx.imageSmoothingEnabled = false;
      
      // Create a temporary canvas for the patch
      const patchCanvas = document.createElement("canvas");
      patchCanvas.width = dims.width;
      patchCanvas.height = dims.height;
      const patchCtx = patchCanvas.getContext("2d");
      patchCtx.imageSmoothingEnabled = false;
      
      // Convert the patch Uint8ClampedArray into ImageData and paint it
      const imageData = new ImageData(new Uint8ClampedArray(patch), dims.width, dims.height);
      patchCtx.putImageData(imageData, 0, 0);
      
      // Draw the patch onto the frameCanvas at the correct position
      frameCtx.drawImage(patchCanvas, dims.left, dims.top);
      
      // Return an object with its canvas, dimensions, delay (adjusted with speedMultiplier)
      // and disposalType (defaulting to 2 for "restore to background")
      return {
        canvas: frameCanvas,
        dims: dims,
        delay: frame.delay ? (frame.delay / this.speedMultiplier) : 100,
        disposalType: frame.disposalType || 2
      };
    });
  }
  
  update() {
    const now = performance.now();
    const currentFrame = this.imageFrames[this.currentFrameIndex];
    const delayMs = currentFrame.delay || 100;
    
    if (now - this.lastFrameTime > delayMs) {
      // If the current frame has disposal type 2, clear that area in the background canvas
      if (currentFrame.disposalType === 2) {
        this.backgroundCtx.clearRect(
          currentFrame.dims.left,
          currentFrame.dims.top,
          currentFrame.dims.width,
          currentFrame.dims.height
        );
      }
      // Advance to the next frame with wrap-around
      this.currentFrameIndex = (this.currentFrameIndex + 1) % this.imageFrames.length;
      this.lastFrameTime = now;
    }
  }
  
  draw(ctx) {
    // Update the current frame based on elapsed time
    this.update();
    const frame = this.imageFrames[this.currentFrameIndex];
    
    ctx.save();
    // Disable smoothing on the main context too
    ctx.imageSmoothingEnabled = false;
    
    // Draw the background first
    ctx.drawImage(this.backgroundCanvas, this.x, this.y, this.width, this.height);
    // Then draw the current frame over the background
    ctx.drawImage(frame.canvas, this.x, this.y, this.width, this.height);
    
    // Depending on the disposal mode, update the background canvas
    if (frame.disposalType !== 2) {
      this.backgroundCtx.drawImage(frame.canvas, 0, 0);
    }
    
    ctx.restore();
  }
  
  containsPoint(px, py) {
    return (px >= this.x && px <= this.x + this.width &&
            py >= this.y && py <= this.y + this.height);
  }
  
  getCenter() {
    return {
      x: this.x + this.width / 2,
      y: this.y + this.height / 2
    };
  }
}

// Shape class
class Shape {
  constructor(x, y, w, h, text) {
    this.id = shapeCounter++;
    this.x = x;
    this.y = y;
    this.width = w;
    this.height = h;
    this.text = text;
    this.fontSize = 14;
    this.fontFamily = 'Arial';
    this.color = "#333";
    this.fillColor = "#e8f1fa";
    this.textColor = "#000";
    this.lineWidth = 2;
    this.isAnimated = false;
    this.opacity = 1;
  }

  draw(ctx) {
    ctx.save();
    
    // Set opacity & fill the shape
    ctx.globalAlpha = this.opacity;
    ctx.fillStyle = this.fillColor;
    ctx.fillRect(this.x, this.y, this.width, this.height);

    if (this.isAnimated) {
      ctx.setLineDash([6, 4]); // Use the same dash pattern
      
      // Determine effective dash offset:
      const effectiveDashOffset = exportingGif ? exportDashOffset : dashOffset;
      ctx.lineDashOffset = -(effectiveDashOffset % 10);
    } else {
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }
    
    // Stroke the border and draw text (if any)
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.lineWidth;
    ctx.strokeRect(this.x, this.y, this.width, this.height);
    
    ctx.fillStyle = this.textColor;
    ctx.font = `${this.fontSize}px ${this.fontFamily}`;
    const metrics = ctx.measureText(this.text);
    const textX = this.x + (this.width - metrics.width) / 2;
    const textY = this.y + this.height / 2 + (this.fontSize / 3);
    ctx.fillText(this.text, textX, textY);
    
    ctx.restore();
  }

  containsPoint(px, py) {
    return (
      px >= this.x &&
      px <= this.x + this.width &&
      py >= this.y &&
      py <= this.y + this.height
    );
  }

  getCenter() {
    return {
      x: this.x + this.width / 2,
      y: this.y + this.height / 2,
    };
  }
}

// ========== ADD: New ImageShape class ==========
class ImageShape extends Shape {
  constructor(x, y, w, h, img) {
    // Let the parent constructor store x, y, width, height, and set default opacity
    super(x, y, w, h, ""); 
    this.img = img;
  }

  draw(ctx) {
    if (!this.img) return;
    ctx.save();
    // Set global alpha to use the shape's opacity
    ctx.globalAlpha = this.opacity;
    ctx.drawImage(this.img, this.x, this.y, this.width, this.height);
    ctx.restore();
  }

  // (Optional) If you want a bounding-box check:
  containsPoint(px, py) {
    return (
      px >= this.x &&
      px <= this.x + this.width &&
      py >= this.y &&
      py <= this.y + this.height
    );
  }
}

// Updated TextShape class
class TextShape {
  constructor(x, y, text, fontSize = 14, fontFamily = 'Arial') {
    this.id = shapeCounter++;
    this.x = x;
    this.y = y; // Now represents the top of the text
    this.text = text;
    this.fontSize = fontSize;
    this.fontFamily = fontFamily;
    // NEW: add a default textColor
    this.textColor = "#000";

    // Measure text width for bounding box
    const tempCtx = document.createElement("canvas").getContext("2d");
    tempCtx.font = `${this.fontSize}px ${this.fontFamily}`;
    const metrics = tempCtx.measureText(this.text);
    this.width = metrics.width;
    this.height = this.fontSize; // Height is now just the font size
  }

  draw(ctx) {
    ctx.fillStyle = this.textColor;
    ctx.font = `${this.fontSize}px ${this.fontFamily}`;
    // Adjust the y-coordinate to account for the baseline
    ctx.fillText(this.text, this.x, this.y + this.height);
  }

  containsPoint(px, py) {
    // Simple bounding-box check using top-left coordinates
    return (
      px >= this.x &&
      px <= this.x + this.width &&
      py >= this.y &&
      py <= this.y + this.height
    );
  }

  getCenter() {
    // Center of the text bounding box
    return {
      x: this.x + this.width / 2,
      y: this.y + this.height / 2
    };
  }
}

// Reference the "Text" button
const textBtn = document.getElementById("toolText");
textBtn.addEventListener("click", () => {
  currentTool = "text";
  clearEditor(); // If you have a function that hides the inline editor
});

// ============= TOOLBAR HANDLERS =============
selectBtn.addEventListener("click", () => {
  currentTool = "select";
  clearEditor();
});

rectBtn.addEventListener("click", () => {
  currentTool = "rect";
  clearEditor();
});

arrowBtn.addEventListener("click", () => {
  currentTool = "arrow";
  clearEditor();
});

// --- ADD event listener for exportGifBtn ---
exportGifBtn.addEventListener("click", exportAnimatedGif);

// Add to your global variables section:
let freeArrows = [];    // array to store free arrows
let isDrawingFreeArrow = false;
let freeArrowStart = null;
let currentFreeArrowPos = null; // Used to track the live mouse position while drawing

// Add event listener for the Free Arrow button
const freeArrowBtn = document.getElementById("toolFreeArrow");
freeArrowBtn.addEventListener("click", () => {
  currentTool = "freeArrow";
  clearEditor();
});

// Add to your global variables section:
let isDraggingArrowHandle = false;  // Are we dragging an endpoint?
let draggedHandle = null;           // 'start' or 'end' to identify which endpoint

// ======== MOUSE EVENTS ========

// Mousedown
canvas.addEventListener("mousedown", (e) => {
  const { x, y } = getCanvasMousePos(e);

  // If a waypoint handle is detected in an arrow, handle that first.
  if (selectedArrow && selectedArrow.waypoints && selectedArrow.waypoints.length > 0) {
    for (let i = 0; i < selectedArrow.waypoints.length; i++) {
      const point = selectedArrow.waypoints[i];
      if (isPointNearPoint(x, y, point.x, point.y, ARROW_HANDLE_SIZE)) {
        selectedWaypointIndex = i;
        requestRender();
        return;
      }
    }
  }

  // If we're in free arrow drawing mode
  if (currentTool === "freeArrow") {
    isDrawingFreeArrow = true;
    freeArrowStart = { x, y };
    currentFreeArrowPos = { x, y };
    requestRender();
    return;
  }

  // Check if clicking on an arrow handle (for free arrows)
  if (selectedArrow && selectedArrow.fromId === undefined) {
    if (isPointNearPoint(x, y, selectedArrow.fromX, selectedArrow.fromY, ARROW_HANDLE_SIZE)) {
      isDraggingArrowHandle = true;
      draggedHandle = 'start';
      requestRender();
      return;
    }
    if (isPointNearPoint(x, y, selectedArrow.toX, selectedArrow.toY, ARROW_HANDLE_SIZE)) {
      isDraggingArrowHandle = true;
      draggedHandle = 'end';
      requestRender();
      return;
    }
  }
  
  // (Additional arrow selection or shape selection logic here.)
  const clickedArrow = findArrowUnderMouse(x, y);
  if (clickedArrow && currentTool === "select") {
    selectedArrow = clickedArrow;
    selectedShape = null;
    isDraggingArrow = true;
    dragStartX = x;
    dragStartY = y;
    requestRender();
    return;
  }

  // Check if user clicked a resize handle...
  if (selectedShape) {
    const handleIndex = getHandleIndexAtPos(selectedShape, x, y);
    if (handleIndex !== -1) {
      isResizing = true;
      resizeHandleIndex = handleIndex;
      requestRender();
      return;
    }
  }

  // Check if user clicked on a shape
  const clickedShape = findShapeUnderMouse(x, y);
  if (clickedShape) {
    if (currentTool === "select") {
      selectedShape = clickedShape;
      draggingShape = clickedShape;
      dragOffsetX = x - clickedShape.x;
      dragOffsetY = y - clickedShape.y;
      // Update UI controls if needed.
      opacityRange.value = selectedShape.opacity;
      if (selectedShape.isAnimated) {
        animatedBorderBtn.textContent = "On";
        isAnimatedOn = true;
      } else {
        animatedBorderBtn.textContent = "Off";
        isAnimatedOn = false;
      }
      requestRender();
    }
  } else {
    // If no shape was clicked, try to select an arrow
    const clickedArrow = findArrowUnderMouse(x, y);
    if (clickedArrow) {
      selectedArrow = clickedArrow;
      selectedShape = null;
      opacityRange.value = 1;
      requestRender();
    } else {
      // Empty space => deselect both shape and arrow
      selectedShape = null;
      selectedArrow = null;
      opacityRange.value = 1;
      animatedBorderBtn.textContent = "Off";
      isAnimatedOn = false;
      requestRender();
    }
  }

  if (currentTool === "rect") {
    const shapeText = prompt("Enter text for the rectangle:", "Shape");
    if (shapeText !== null) {
      const newShape = new Shape(x - 50, y - 25, 100, 50, shapeText);
      historyManager.execute(new AddShapeCommand(newShape));
    }
  } else if (currentTool === "arrow") {
    const clickedShape = findShapeUnderMouse(x, y);
    if (clickedShape) {
      isDrawingLine = true;
      arrowStartShape = clickedShape;
      arrowEndPos = { x, y };
      requestRender();
    }
  }

  if (currentTool === "text") {
    const shapeText = prompt("Enter your text:", "New Text");
    if (shapeText !== null) {
      const fontSize = parseInt(fontSizeSelect.value) || 14;
      const fontFamily = fontFamilySelect.value || "Arial";
      const newTextShape = new TextShape(x, y, shapeText, fontSize, fontFamily);
      historyManager.execute(new AddShapeCommand(newTextShape));
      requestRender();
    }
  }
});

// Mousemove
canvas.addEventListener("mousemove", (e) => {
  const { x, y } = getCanvasMousePos(e);

  if (isDrawingFreeArrow && freeArrowStart) {
    currentFreeArrowPos = { x, y };
    requestRender();
    return;
  }

  if (isResizing && selectedShape) {
    resizeShape(selectedShape, resizeHandleIndex, x, y);
    requestRender();
    return;
  }

  if (draggingShape) {
    draggingShape.x = x - dragOffsetX;
    draggingShape.y = y - dragOffsetY;
    requestRender();
  } 
  else if (isDrawingLine) {
    arrowEndPos.x = x;
    arrowEndPos.y = y;
    requestRender();
  }

  if (isDraggingArrow && selectedArrow && selectedArrow.fromId === undefined) {
    const dx = x - dragStartX;
    const dy = y - dragStartY;
    
    selectedArrow.fromX += dx;
    selectedArrow.fromY += dy;
    selectedArrow.toX += dx;
    selectedArrow.toY += dy;
    
    dragStartX = x;
    dragStartY = y;
    requestRender();
    return;
  }

  if (isDraggingArrowHandle && selectedArrow) {
    if (draggedHandle === 'start') {
      selectedArrow.fromX = x;
      selectedArrow.fromY = y;
    } else if (draggedHandle === 'end') {
      selectedArrow.toX = x;
      selectedArrow.toY = y;
    }
    requestRender();
    return;
  }

  // Hover detection
  if (!draggingShape && !isDrawingLine && !isDraggingArrow && selectedWaypointIndex === -1) {
    const arrow = findArrowUnderMouse(x, y);
    if (arrow !== hoveredArrow) {
      hoveredArrow = arrow;
      canvas.style.cursor = arrow ? 'pointer' : 'default';
      requestRender();
    }
  }
});

// Mouseup
canvas.addEventListener("mouseup", (e) => {
  if (isDraggingWaypoint || isDraggingEndpoint) {
    isDraggingWaypoint = false;
    isDraggingEndpoint = false;
    selectedWaypointIndex = -1;
    draggedHandle = null;
    requestRender();
    return;
  }
  
  if (isResizing) {
    isResizing = false;
    resizeHandleIndex = -1;
    requestRender();
  }
  if (draggingShape) {
    draggingShape = null;
    requestRender();
  }
  
  if (isDrawingLine) {
    const { x, y } = getCanvasMousePos(e);
    const releasedShape = findShapeUnderMouse(x, y);
    if (releasedShape && releasedShape !== arrowStartShape) {
        arrows.push({ 
            fromId: arrowStartShape.id, 
            toId: releasedShape.id,
            curve: false,
            color: arrowColorPicker.value,
            lineWidth: parseInt(lineThicknessPicker.value) || 2
        });
        requestRender();
    }
    isDrawingLine = false;
    arrowStartShape = null;
  }
  
  if (isDrawingFreeArrow && freeArrowStart) {
    const { x, y } = getCanvasMousePos(e);
    const newArrow = {
        fromId: undefined,
        toId: undefined,
        fromX: freeArrowStart.x,
        fromY: freeArrowStart.y,
        toX: x,
        toY: y,
        curve: false,
        color: arrowColorPicker.value,
        lineWidth: parseInt(lineThicknessPicker.value) || 2
    };
    arrows.push(newArrow);
    isDrawingFreeArrow = false;
    freeArrowStart = null;
    currentFreeArrowPos = null;
    requestRender();
    return;
  }
  
  if (isDraggingArrowHandle) {
    isDraggingArrowHandle = false;
    draggedHandle = null;
    requestRender();
  }
  
  selectedWaypointIndex = -1;
  
  if (isDraggingArrow) {
    isDraggingArrow = false;
    requestRender();
    return;
  }
});

// File Drop Listener
canvas.addEventListener("drop", (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const dropX = e.clientX - rect.left;
  const dropY = e.clientY - rect.top;

  const files = e.dataTransfer.files;
  if (!files || files.length === 0) return;

  const file = files[0];

  // Only accept image files
  if (!file.type.startsWith("image/")) {
    console.log("Dropped file is not an image.");
    return;
  }

  if (file.type === "image/gif") {
    const fileReaderArrayBuffer = new FileReader();
    fileReaderArrayBuffer.onload = (evt) => {
      const buffer = evt.target.result;
      try {
        const lib = (typeof window.gifuct !== "undefined" ? window.gifuct : (typeof gifuct !== "undefined" ? gifuct : null));
        if (!lib) {
          console.error("gifuct library is not loaded.");
          return;
        }
        const gifData = lib.parseGIF(buffer);
        const frames = lib.decompressFrames(gifData, true);

        const fileReaderDataURL = new FileReader();
        fileReaderDataURL.onload = (evt) => {
          const dataUrl = evt.target.result;
          const animatedGifShape = new AnimatedGifShape(dropX, dropY, frames, 1);
          animatedGifShape.gifSrc = dataUrl;
          shapes.push(animatedGifShape);
          requestRender();
        };
        fileReaderDataURL.readAsDataURL(file);
      } catch (error) {
        console.error("Error decoding animated GIF:", error);
      }
    };
    fileReaderArrayBuffer.readAsArrayBuffer(file);
  } else {
    const fileReader = new FileReader();
    fileReader.onload = (evt) => {
      const img = new Image();
      img.onload = () => {
        const imageShape = new ImageShape(dropX, dropY, img.width, img.height, img);
        shapes.push(imageShape);
        requestRender();
      };
      img.src = evt.target.result;
    };
    fileReader.readAsDataURL(file);
  }
});

// Replace existing dblclick handlers with this merged version:
canvas.addEventListener("dblclick", (e) => {
  const { x, y } = getCanvasMousePos(e);
  
  // First, see if a shape was double-clicked:
  const shape = findShapeUnderMouse(x, y);
  if (shape) {
    // Show the inline editor for this shape
    shapeEditorInput.style.display = "block";
    if (shape instanceof TextShape) {
      // For a TextShape, position above the text
      shapeEditorInput.style.left = shape.x + "px";
      shapeEditorInput.style.top = (shape.y - shape.height - 5) + "px";
    } else {
      shapeEditorInput.style.left = shape.x + "px";
      shapeEditorInput.style.top = (shape.y + shape.height + 5) + "px";
    }
    shapeEditorInput.value = shape.text;
    shapeEditorInput.focus();
    shapeEditorInput.onkeydown = (evt) => {
      if (evt.key === "Enter") {
        updateShapeText(shape, shapeEditorInput.value);
        clearEditor();
      }
    };
    shapeEditorInput.onblur = () => {
      updateShapeText(shape, shapeEditorInput.value);
      clearEditor();
    };
    return;
  }
  
  if (selectedArrow) {
    // Check first if double-click is on an existing waypoint
    if (selectedArrow.waypoints && selectedArrow.waypoints.length > 0) {
      for (let i = 0; i < selectedArrow.waypoints.length; i++) {
        if (isPointNearPoint(x, y, selectedArrow.waypoints[i].x, selectedArrow.waypoints[i].y, ARROW_HANDLE_SIZE)) {
          // Remove the waypoint
          selectedArrow.waypoints.splice(i, 1);
          if (selectedArrow.waypoints.length === 0) {
            selectedArrow.waypoints = undefined;
          }
          return;
        }
      }
    }
    
    // If no waypoint was deleted, proceed with adding a new waypoint
    const segments = getArrowSegments(selectedArrow);
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (isPointNearLine(x, y, seg.x1, seg.y1, seg.x2, seg.y2, 15)) {
        // Ensure waypoint array exists
        if (!selectedArrow.waypoints) {
          selectedArrow.waypoints = [];
        }
        
        const newPoint = { x, y };
        
        if (selectedArrow.curve) {
          // For curved arrows, we need to find the exact segment where the click occurred
          const allPoints = getArrowPoints(selectedArrow);
          
          // Find which actual segment pair contains our click point
          let segmentIndex = -1;
          for (let j = 0; j < allPoints.length - 1; j++) {
            if (isPointNearLine(x, y, 
                allPoints[j].x, allPoints[j].y,
                allPoints[j + 1].x, allPoints[j + 1].y, 15)) {
              segmentIndex = j;
              break;
            }
          }
          
          if (segmentIndex === -1) return; // Shouldn't happen, but just in case
          
          // Convert segment index to waypoint index
          let waypointIndex;
          if (segmentIndex === 0) {
            // Click is between start point and first waypoint (or end if no waypoints)
            waypointIndex = 0;
          } else if (segmentIndex >= allPoints.length - 2) {
            // Click is between last waypoint and end point
            waypointIndex = selectedArrow.waypoints.length;
          } else {
            // Click is between two waypoints
            waypointIndex = segmentIndex;
          }
          
          selectedArrow.waypoints.splice(waypointIndex, 0, newPoint);
        } else {
          // For straight lines, maintain existing logic
          if (i === 0) {
            selectedArrow.waypoints.unshift(newPoint);
          } else if (i === segments.length - 1) {
            selectedArrow.waypoints.push(newPoint);
          } else {
            selectedArrow.waypoints.splice(i, 0, newPoint);
          }
        }
        break;
      }
    }
  }
});

// Hide and reset the inline editor
function clearEditor() {
  shapeEditorInput.style.display = "none";
  shapeEditorInput.value = "";
  shapeEditorInput.onkeydown = null;
  shapeEditorInput.onblur = null;
}

// ======== UTILITY FUNCTIONS ========

// Return the shape (on top) under the mouse, if any
function findShapeUnderMouse(x, y) {
  for (let i = shapes.length - 1; i >= 0; i--) {
    if (shapes[i].containsPoint(x, y)) {
      return shapes[i];
    }
  }
  return null;
}

// Convert mouse event to canvas coordinates
function getCanvasMousePos(e) {
  const rect = canvas.getBoundingClientRect();
  // --- Get current scale from canvas transform ---
  const transformValue = canvas.style.transform;
  let scale = 1; // Default scale if no transform
  if (transformValue) {
      const scaleMatch = transformValue.match(/scale\((.*?)\)/);
      if (scaleMatch && scaleMatch[1]) {
          scale = parseFloat(scaleMatch[1]);
      }
  }
  return {
    x: (e.clientX - rect.left) / scale,  // --- Apply inverse scale ---
    y: (e.clientY - rect.top) / scale,   // --- Apply inverse scale ---
  };
}

// Compute intersection of line from shape to the target with the shape's edges
function getEdgeIntersection(shape, targetX, targetY) {
  const center = shape.getCenter();
  const dx = targetX - center.x;
  const dy = targetY - center.y;

  const { x, y, width, height } = shape;
  const left = x, right = x + width;
  const top = y, bottom = y + height;

  function intersectSide(side, isVertical) {
    let t;
    if (isVertical) {
      if (dx === 0) return null;
      t = (side - center.x) / dx;
    } else {
      if (dy === 0) return null;
      t = (side - center.y) / dy;
    }
    if (t < 0) return null;
    const ix = center.x + t * dx;
    const iy = center.y + t * dy;
    if (isVertical) {
      if (iy >= top && iy <= bottom) {
        return { x: side, y: iy, t };
      }
    } else {
      if (ix >= left && ix <= right) {
        return { x: ix, y: side, t };
      }
    }
    return null;
  }

  const candidates = [];
  [ intersectSide(left, true),
    intersectSide(right, true),
    intersectSide(top, false),
    intersectSide(bottom, false)
  ].forEach(pt => { if (pt) candidates.push(pt); });

  if (!candidates.length) {
    return center; // fallback
  }
  let best = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i].t < best.t) {
      best = candidates[i];
    }
  }
  return { x: best.x, y: best.y };
}

/////////////////////////////////////
// 1. Declare a global canvasBgColor
/////////////////////////////////////
let canvasBgColor = "#ffffff";

// ======= New Rendering Loop Optimizations =======

// Global flag for controlling continuous animation.
// Set to true to ensure the diagram is re-rendered continuously for animations
// (e.g. arrow dash offsets update, animated shapes, etc.).
// Set to false if you only want re-rendering on explicit user interactions.
const continuousAnimationEnabled = true;

// Global flags for controlling when to render:
let needsRender = true;
let renderScheduled = false;

// Call this function whenever a state change or user interaction occurs that
// should trigger a redraw.
function requestRender() {
  needsRender = true;
  if (!renderScheduled) {
    renderScheduled = true;
    requestAnimationFrame(animate);
  }
}

// This function tests whether something dynamic is actively occurring on the canvas.
// Adding the continuousAnimationEnabled flag ensures that even if no user interaction
// is occurring, the animation will be updated continuously.
function shouldAnimateContinuously() {
  if (continuousAnimationEnabled) return true;
  
  // If the user is drawing a line or free arrow, we need continuous feedback.
  if (isDrawingLine || isDrawingFreeArrow) return true;
  
  // If any shape is flagged as animated, we continue updating.
  for (let i = 0; i < shapes.length; i++) {
    if (shapes[i].isAnimated) return true;
  }
  
  // If a waypoint is being dragged, update continuously.
  if (selectedWaypointIndex !== -1) return true;
  
  // If an arrow is selected or hovered, we might be animating dashes.
  if (selectedArrow || hoveredArrow) return true;
  
  return false;
}

// ===== Modified animate() Function =====
function animate() {
  // We are now processing an animation frame.
  renderScheduled = false;
  
  // If nothing has changed and no interactive animation is active, skip drawing.
  if (!needsRender && !shouldAnimateContinuously()) {
    return;
  }
  
  // Clear the "dirty" flag—assume we are rendering now.
  needsRender = false;
  
  // --- Begin Drawing Code (unchanged from before) ---
  
  // Clear the canvas.
  ctx.fillStyle = canvasBgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw shapes.
  shapes.forEach((shape) => {
    shape.draw(ctx);
  });
  
  // Draw both connected and free arrows.
  arrows.forEach((arrow) => {
    if (arrow.fromId !== undefined) {
      const fromShape = shapes.find(s => s.id === arrow.fromId);
      const toShape = shapes.find(s => s.id === arrow.toId);
      if (fromShape && toShape) {
        let startTargetX = (arrow.waypoints && arrow.waypoints.length > 0)
          ? arrow.waypoints[0].x 
          : toShape.x + toShape.width / 2;
        let startTargetY = (arrow.waypoints && arrow.waypoints.length > 0)
          ? arrow.waypoints[0].y 
          : toShape.y + toShape.height / 2;
  
        let endTargetX = (arrow.waypoints && arrow.waypoints.length > 0)
          ? arrow.waypoints[arrow.waypoints.length - 1].x 
          : fromShape.x + fromShape.width / 2;
        let endTargetY = (arrow.waypoints && arrow.waypoints.length > 0)
          ? arrow.waypoints[arrow.waypoints.length - 1].y 
          : fromShape.y + fromShape.height / 2;
  
        const fromPt = getEdgeIntersection(fromShape, startTargetX, startTargetY);
        const toPt = getEdgeIntersection(toShape, endTargetX, endTargetY);
  
        drawArrow(ctx, fromPt.x, fromPt.y, toPt.x, toPt.y, arrow);
      }
    } else {
      // Free arrow drawing.
      drawArrow(ctx, arrow.fromX, arrow.fromY, arrow.toX, arrow.toY, arrow);
    }
  });
  
  // Draw temporary arrow lines (if any).
  if (isDrawingLine && arrowStartShape) {
    const fromPt = getEdgeIntersection(arrowStartShape, arrowEndPos.x, arrowEndPos.y);
    drawTempLine(ctx, fromPt.x, fromPt.y, arrowEndPos.x, arrowEndPos.y);
  }
  
  if (isDrawingFreeArrow && freeArrowStart && currentFreeArrowPos) {
    drawArrow(ctx, freeArrowStart.x, freeArrowStart.y, currentFreeArrowPos.x, currentFreeArrowPos.y, {
      color: arrowColorPicker.value,
      lineWidth: parseInt(lineThicknessPicker.value) || 2
    });
  }
  
  // Draw additional handles (for selected shape or arrow)
  if (selectedShape) {
    drawResizeHandles(ctx, selectedShape);
  }
  if (selectedArrow) {
    drawArrowSelectionHandles(ctx, selectedArrow);
  }
  
  // Update dash offset for arrow animations if not exporting.
  if (!exportingGif) {
    dashOffset += 0.5;
  }
  
  // --- End Drawing Code ---
  
  // If there is still an active animation (or continuous animations are enabled),
  // schedule a new frame.
  if (shouldAnimateContinuously()) {
    requestRender();
  }
}

// Kick off the rendering loop initially.
requestRender();

// Draw a dotted arrow for a final connection
function drawArrow(ctx, fromX, fromY, toX, toY, arrowObj) {
    ctx.save();
    
    if (arrowObj === hoveredArrow || arrowObj === selectedArrow) {
      ctx.lineWidth = (arrowObj.lineWidth || 2) + 2;
    } else {
      ctx.lineWidth = arrowObj.lineWidth || 2;
    }
    
    ctx.setLineDash([6, 4]); // Same dash pattern for arrows
    
    // Determine effective dash offset for arrows:
    const effectiveDashOffset = exportingGif ? exportDashOffset : dashOffset;
    ctx.lineDashOffset = -(effectiveDashOffset % 10);
    
    ctx.strokeStyle = arrowObj.color || "#000";
  
    ctx.beginPath();
    let startPoint = { x: fromX, y: fromY };
    let endPoint = { x: toX, y: toY };
  
    if (arrowObj.fromId !== undefined) {
        const fromShape = shapes.find(s => s.id === arrowObj.fromId);
        const toShape = shapes.find(s => s.id === arrowObj.toId);
        if (fromShape && toShape) {
          let startTarget, endTarget;
          if (arrowObj.waypoints && arrowObj.waypoints.length > 0) {
            startTarget = arrowObj.waypoints[0];
            endTarget = arrowObj.waypoints[arrowObj.waypoints.length - 1];
          } else {
            startTarget = toShape.getCenter();
            endTarget = fromShape.getCenter();
          }
          startPoint = getEdgeIntersection(fromShape, startTarget.x, startTarget.y);
          endPoint = getEdgeIntersection(toShape, endTarget.x, endTarget.y);
        }
    }
  
    let points = [startPoint];
    if (arrowObj.waypoints && arrowObj.waypoints.length) {
      points.push(...arrowObj.waypoints);
    }
    points.push(endPoint);
    
    if (arrowObj.curve && points.length >= 2) {
      let curvePoints = getCatmullRomCurvePoints(points, 20);
      ctx.moveTo(points[0].x, points[0].y);
      curvePoints.forEach(pt => ctx.lineTo(pt.x, pt.y));
    } else {
      ctx.moveTo(startPoint.x, startPoint.y);
      if (arrowObj.waypoints && arrowObj.waypoints.length) {
        arrowObj.waypoints.forEach(pt => ctx.lineTo(pt.x, pt.y));
      }
      ctx.lineTo(endPoint.x, endPoint.y);
    }
    
    ctx.stroke();
  
    // Optionally, draw arrowhead
    drawArrowhead(ctx, 
      (arrowObj.waypoints && arrowObj.waypoints.length) ? arrowObj.waypoints[arrowObj.waypoints.length - 1].x : startPoint.x,
      (arrowObj.waypoints && arrowObj.waypoints.length) ? arrowObj.waypoints[arrowObj.waypoints.length - 1].y : startPoint.y,
      endPoint.x, endPoint.y,
      arrowObj.color
    );
    
    // Draw waypoint handles (if the arrow is selected)
    if (selectedArrow === arrowObj) {
      drawWaypointHandles(ctx, arrowObj);
    }
    
    ctx.restore();
}

// Draw a temporary dashed line (no arrowhead)
function drawTempLine(ctx, fromX, fromY, toX, toY) {
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.lineDashOffset = exportingGif ? exportDashOffset : -dashOffset;
  ctx.strokeStyle = "blue";
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  ctx.restore();
}

// Basic arrowhead
function drawArrowhead(ctx, fromX, fromY, toX, toY, color = "#000000") {
  const headLen = 10;
  const angle = Math.atan2(toY - fromY, toX - fromX);

  ctx.save();
  ctx.translate(toX, toY);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-headLen, headLen / 2);
  ctx.lineTo(-headLen, -headLen / 2);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

// =========== GIF RECORDING LOGIC ===========

// --- MODIFIED: Combined start/stop and export into a single function ---
function exportAnimatedGif() {
  exportingGif = true;
  // Initialize exportDashOffset in the same direction as dashOffset
  exportDashOffset = dashOffset; 

  console.log("Initializing GIF recorder and starting export...");
  let gif = new GIF({
    workers: 2,
    quality: 7,
    width: canvas.width,
    height: canvas.height,
    workerScript: 'gif.worker.js'
  });

  gif.on('progress', function (p) {
    console.log("GIF Progress: " + Math.round(p * 100) + '%');
  });

  gif.on("finished", function (blob) {
    console.log("GIF rendering finished. Creating download link...");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "animated_diagram.gif";
    link.click();
    URL.revokeObjectURL(url);
    gif = null;
    exportingGif = false;
  });

  // Calculate cycle timing as before...
  let longestCycle = 0;
  let shortestDelay = Infinity;
  let hasAnimatedContent = false;

  shapes.forEach(shape => {
    if (shape instanceof AnimatedGifShape && shape.imageFrames) {
      hasAnimatedContent = true;
      let totalDelay = 0;
      shape.imageFrames.forEach(frame => {
        const frameDelay = frame.delay || 100;
        totalDelay += frameDelay;
        shortestDelay = Math.min(shortestDelay, frameDelay);
      });
      longestCycle = Math.max(longestCycle, totalDelay);
    }
    if (shape.isAnimated) {
      hasAnimatedContent = true;
      longestCycle = Math.max(longestCycle, 500);
      shortestDelay = Math.min(shortestDelay, 50);
    }
  });

  if (!hasAnimatedContent) {
    longestCycle = 500;
    shortestDelay = 50;
  }

  shortestDelay = Math.max(20, Math.min(shortestDelay, 100));
  const frameDelay = shortestDelay;
  const numFrames = Math.ceil(longestCycle / frameDelay);

  console.log(`Recording ${numFrames} frames with ${frameDelay}ms delay (cycle: ${longestCycle}ms)`);

  let frameCount = 0;
  let lastCapture = 0;

  function captureFrame(timestamp) {
    if (frameCount >= numFrames) {
      console.log("Finished capturing frames. Rendering GIF...");
      gif.render();
      return;
    }

    if (timestamp - lastCapture >= frameDelay) {
      gif.addFrame(canvas, { 
        copy: true, 
        delay: frameDelay
      });
      lastCapture = timestamp;
      frameCount++;
      // Update exportDashOffset in the same positive direction as dashOffset
      exportDashOffset += 2;
    }

    requestAnimationFrame(captureFrame);
  }

  requestAnimationFrame(captureFrame);
}

// ========== ADD: Canvas drag/drop listeners ==========
canvas.addEventListener("dragover", (e) => {
  e.preventDefault(); // Allow dropping
});

canvas.addEventListener("drop", (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const dropX = e.clientX - rect.left;
  const dropY = e.clientY - rect.top;

  const files = e.dataTransfer.files;
  if (!files || files.length === 0) return;

  const file = files[0];

  // Only accept image files
  if (!file.type.startsWith("image/")) {
    console.log("Dropped file is not an image.");
    return;
  }

  if (file.type === "image/gif") {
    // Create a FileReader for the ArrayBuffer needed for decoding
    const fileReaderArrayBuffer = new FileReader();
    fileReaderArrayBuffer.onload = (evt) => {
      const buffer = evt.target.result;
      try {
        const lib = (typeof window.gifuct !== "undefined" ? window.gifuct : (typeof gifuct !== "undefined" ? gifuct : null));
        if (!lib) {
          console.error("gifuct library is not loaded.");
          return;
        }
        const gifData = lib.parseGIF(buffer);
        const frames = lib.decompressFrames(gifData, true);

        // Now create a second FileReader to get the data URL to store as gifSrc
        const fileReaderDataURL = new FileReader();
        fileReaderDataURL.onload = (evt) => {
          const dataUrl = evt.target.result;
          const animatedGifShape = new AnimatedGifShape(dropX, dropY, frames, 1);
          // IMPORTANT: assign gifSrc so that your export logic can save it.
          animatedGifShape.gifSrc = dataUrl;
          shapes.push(animatedGifShape);
          requestRender();
        };
        fileReaderDataURL.readAsDataURL(file);
      } catch (error) {
        console.error("Error decoding animated GIF:", error);
      }
    };
    fileReaderArrayBuffer.readAsArrayBuffer(file);
  } else {
    // Processing for regular (non-GIF) images remains unchanged
    const fileReader = new FileReader();
    fileReader.onload = (evt) => {
      const img = new Image();
      img.onload = () => {
        const imageShape = new ImageShape(dropX, dropY, img.width, img.height, img);
        shapes.push(imageShape);
        requestRender();
      };
      img.src = evt.target.result;
    };
    fileReader.readAsDataURL(file);
  }
});

// --- ADD: Function to get position of all resize handles for a shape ---
// We'll define an array of (x, y) coords (for corners + optionally edges).
function getResizeHandles(shape) {
  const handles = [];
  const { x, y, width, height } = shape;
  // Corners: top-left, top-right, bottom-left, bottom-right
  handles.push({ x: x,         y: y         });              // top-left
  handles.push({ x: x+width,  y: y         });              // top-right
  handles.push({ x: x,         y: y+height });              // bottom-left
  handles.push({ x: x+width,  y: y+height });              // bottom-right
  
  // If you want mid-edge handles, uncomment:
  // handles.push({ x: x + width/2, y: y          }); // top edge
  // handles.push({ x: x + width/2, y: y + height }); // bottom edge
  // handles.push({ x: x,           y: y + height/2 }); // left edge
  // handles.push({ x: x + width,   y: y + height/2 }); // right edge
  
  return handles;
}

// --- ADD: Check if mouse is in any handle bounding box ---
function getHandleIndexAtPos(shape, mouseX, mouseY) {
  if (!shape) return -1;
  const handles = getResizeHandles(shape);
  for (let i = 0; i < handles.length; i++) {
    const hx = handles[i].x;
    const hy = handles[i].y;
    // We'll treat each handle as a small square
    if (
      mouseX >= hx - HANDLE_SIZE/2 && mouseX <= hx + HANDLE_SIZE/2 &&
      mouseY >= hy - HANDLE_SIZE/2 && mouseY <= hy + HANDLE_SIZE/2
    ) {
      return i;
    }
  }
  return -1;
}

// --- ADD: Actual resize logic depending on which handle is grabbed ---
function resizeShape(shape, handleIndex, mouseX, mouseY) {
  const { x, y, width, height } = shape;
  let newWidth = width;
  let newHeight = height;

  switch (handleIndex) {
    case 0: // top-left corner
      newWidth = width + (x - mouseX);
      newHeight = height + (y - mouseY);
      shape.x = mouseX;
      shape.y = mouseY;
      break;
    case 1: // top-right corner
      newWidth = mouseX - x;
      newHeight = height + (y - mouseY);
      shape.y = mouseY;
      break;
    case 2: // bottom-left corner
      newWidth = width + (x - mouseX);
      newHeight = mouseY - y;
      shape.x = mouseX;
      break;
    case 3: // bottom-right corner
      newWidth = mouseX - x;
      newHeight = mouseY - y;
      break;
  }

  // Enforce minimum size values.
  shape.width = Math.max(newWidth, 20);
  shape.height = Math.max(newHeight, 20);
  
  // Invalidate the offscreen cache.
  if (typeof shape.markDirty === "function") {
    shape.markDirty();
  }
}

// --- ADD: Draw resize handles if a shape is selected ---
function drawResizeHandles(ctx, shape) {
  const handles = getResizeHandles(shape);
  ctx.save();
  ctx.fillStyle = "red";
  handles.forEach((h) => {
    ctx.fillRect(h.x - HANDLE_SIZE/2, h.y - HANDLE_SIZE/2, HANDLE_SIZE, HANDLE_SIZE);
  });
  ctx.restore();
}

// ================== DELETE / REMOVAL LOGIC ==================

// 1) Helper function to remove a shape by ID from both shapes & arrows
function removeShapeById(id) {
  // Remove the shape itself
  shapes = shapes.filter((s) => s.id !== id);
  // Remove any arrows that link to/from this shape
  arrows = arrows.filter((arrow) => arrow.fromId !== id && arrow.toId !== id);
}

// 2) Keyboard event to listen for "Delete" or "Backspace"
document.addEventListener("keydown", (e) => {
  // Check for Delete or Backspace keys
  if ((e.key === "Delete" || e.key === "Backspace") && (selectedShape || selectedArrow)) {
    // If the text editor is active, don't delete
    if (document.activeElement === shapeEditorInput) {
      return;
    }
    if (selectedShape) {
      historyManager.execute(new DeleteShapeCommand(selectedShape));
      selectedShape = null;
    } else if (selectedArrow) {
      historyManager.execute(new DeleteArrowCommand(selectedArrow));
      selectedArrow = null;
    }
    e.preventDefault();
  }
  
  // Keep the existing Ctrl+Z and Ctrl+Y handlers
  if (document.activeElement !== shapeEditorInput) {
    if (e.ctrlKey && e.key === 'z') {
      e.preventDefault();
      historyManager.undo();
    }
    if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
      e.preventDefault();
      historyManager.redo();
    }
  }
});

/***************************************************
 * LAYER/Z-ORDER FUNCTIONS
 ***************************************************/

// Bring shape forward by one layer
function bringShapeForward(shape) {
  const index = shapes.indexOf(shape);
  if (index >= 0 && index < shapes.length - 1) {
    // remove from current position
    shapes.splice(index, 1);
    // insert at the next higher position
    shapes.splice(index + 1, 0, shape);
  }
}

// Send shape backward by one layer
function sendShapeBackward(shape) {
  const index = shapes.indexOf(shape);
  if (index > 0) {
    // remove from the array
    shapes.splice(index, 1);
    // insert it one position lower
    shapes.splice(index - 1, 0, shape);
  }
}

// Bring shape fully to the front
function bringShapeToFront(shape) {
  const index = shapes.indexOf(shape);
  if (index >= 0) {
    shapes.splice(index, 1);
    shapes.push(shape);
  }
}

// Send shape fully to the back
function sendShapeToBack(shape) {
  const index = shapes.indexOf(shape);
  if (index >= 0) {
    shapes.splice(index, 1);
    shapes.unshift(shape);
  }
}

/***************************************************
 * EXAMPLE UI HOOKS OR KEYBOARD SHORTCUTS
 ***************************************************/



/**************************************************
 * End of main.js
 **************************************************/ 

// Add proper context menu event listeners
const contextBringForward = document.getElementById("ctx-bring-forward");
const contextSendBackward = document.getElementById("ctx-send-backward");
const contextBringFront = document.getElementById("ctx-bring-front");
const contextSendBack = document.getElementById("ctx-send-back");
const contextDelete = document.getElementById("ctx-delete");

if (contextBringForward) {
    contextBringForward.addEventListener("click", () => {
        if (selectedShape) {
            bringShapeForward(selectedShape);
        }
        contextMenu.style.display = "none";
    });
}

if (contextSendBackward) {
    contextSendBackward.addEventListener("click", () => {
        if (selectedShape) {
            sendShapeBackward(selectedShape);
        }
        contextMenu.style.display = "none";
    });
}

if (contextBringFront) {
    contextBringFront.addEventListener("click", () => {
        if (selectedShape) {
            bringShapeToFront(selectedShape);
        }
        contextMenu.style.display = "none";
    });
}

if (contextSendBack) {
    contextSendBack.addEventListener("click", () => {
        if (selectedShape) {
            sendShapeToBack(selectedShape);
        }
        contextMenu.style.display = "none";
    });
}

if (contextDelete) {
    contextDelete.addEventListener("click", () => {
        if (selectedShape) {
            historyManager.execute(new DeleteShapeCommand(selectedShape));
            selectedShape = null;
        } else if (selectedArrow) {
            historyManager.execute(new DeleteArrowCommand(selectedArrow));
            selectedArrow = null;
        }
        contextMenu.style.display = "none";
    });
}

function updateShapeText(shape, newText) {
  // Update the text in either a rectangle or a TextShape
  shape.text = newText;

  // If this is a TextShape, re-measure the bounding box 
  // in case the user typed a longer or shorter string
  if (shape instanceof TextShape) {
    const tempCtx = document.createElement("canvas").getContext("2d");
    tempCtx.font = `${shape.fontSize}px ${shape.fontFamily}`;
    const metrics = tempCtx.measureText(shape.text);
    shape.width = metrics.width;
    shape.height = shape.fontSize; 
  }
}

// Add event listeners for the font controls
fontSizeSelect.addEventListener("change", () => {
  if (selectedShape) {
    const newSize = parseInt(fontSizeSelect.value);
    if (selectedShape instanceof TextShape) {
      selectedShape.fontSize = newSize;
      // Recalculate bounds
      const tempCtx = document.createElement("canvas").getContext("2d");
      tempCtx.font = `${selectedShape.fontSize}px ${selectedShape.fontFamily}`;
      const metrics = tempCtx.measureText(selectedShape.text);
      selectedShape.width = metrics.width;
      selectedShape.height = selectedShape.fontSize;
    } else {
      // For regular shapes, just update the font size for drawing
      selectedShape.fontSize = newSize;
    }
  }
});

fontFamilySelect.addEventListener("change", () => {
  if (selectedShape) {
    const newFont = fontFamilySelect.value;
    if (selectedShape instanceof TextShape) {
      selectedShape.fontFamily = newFont;
      // Recalculate bounds
      const tempCtx = document.createElement("canvas").getContext("2d");
      tempCtx.font = `${selectedShape.fontSize}px ${selectedShape.fontFamily}`;
      const metrics = tempCtx.measureText(selectedShape.text);
      selectedShape.width = metrics.width;
    } else {
      // For regular shapes, just update the font family for drawing
      selectedShape.fontFamily = newFont;
    }
  }
});

/********************************************************************
 * ADDING SAVE/LOAD FUNCTIONALITY (with ID preservation)
 ********************************************************************/

// 1) Convert in-memory shape objects to a simpler "serializable" form
function shapeToSerializable(shape) {
  if (shape instanceof AnimatedGifShape) {
    return {
      id: shape.id,
      type: "AnimatedGifShape",
      x: shape.x,
      y: shape.y,
      width: shape.width,
      height: shape.height,
      // Make sure gifSrc has a valid value (data URL or external URL)
      gifSrc: shape.gifSrc || "",
      speedMultiplier: shape.speedMultiplier,
      opacity: shape.opacity !== undefined ? shape.opacity : 1
    };
  } else if (shape instanceof ImageShape) {
    return {
      id: shape.id,
      type: "ImageShape",
      x: shape.x,
      y: shape.y,
      width: shape.width,
      height: shape.height,
      imgSrc: shape.img.src,
      color: shape.color,
      textColor: shape.textColor,
      fillColor: shape.fillColor,
      lineWidth: shape.lineWidth,
      isAnimated: shape.isAnimated,
      opacity: shape.opacity !== undefined ? shape.opacity : 1
    };
  } else if (shape instanceof TextShape) {
    return {
      id: shape.id,
      type: "TextShape",
      x: shape.x,
      y: shape.y,
      text: shape.text,
      fontSize: shape.fontSize,
      fontFamily: shape.fontFamily,
      color: shape.color,
      textColor: shape.textColor,
      fillColor: shape.fillColor,
      lineWidth: shape.lineWidth,
      opacity: shape.opacity !== undefined ? shape.opacity : 1
    };
  } else {
    // Default "Shape"
    return {
      id: shape.id,
      type: "Shape",
      x: shape.x,
      y: shape.y,
      width: shape.width,
      height: shape.height,
      text: shape.text,
      fontSize: shape.fontSize || 14,
      fontFamily: shape.fontFamily || "Arial",
      color: shape.color,
      textColor: shape.textColor,
      fillColor: shape.fillColor,
      lineWidth: shape.lineWidth,
      isAnimated: shape.isAnimated,
      opacity: shape.opacity !== undefined ? shape.opacity : 1
    };
  }
}

// 2) Convert the simpler "serializable" form back into actual shape objects
function shapeFromSerializable(sdata) {
  let newShape;

  if (sdata.type === "AnimatedGifShape") {
    if (sdata.gifSrc) {
      // Create an image element using the saved GIF source.
      const img = new Image();
      img.src = sdata.gifSrc;
      newShape = new AnimatedGifShape(sdata.x, sdata.y, [], sdata.speedMultiplier);
      newShape.gifSrc = sdata.gifSrc;
      newShape.img = img;
      newShape.width = sdata.width;
      newShape.height = sdata.height;
    } else {
      newShape = new Shape(sdata.x, sdata.y, sdata.width, sdata.height, "");
    }
  } else if (sdata.type === "ImageShape") {
    const img = new Image();
    img.src = sdata.imgSrc;
    newShape = new ImageShape(sdata.x, sdata.y, sdata.width, sdata.height, img);
  } else if (sdata.type === "TextShape") {
    newShape = new TextShape(sdata.x, sdata.y, sdata.text, sdata.fontSize, sdata.fontFamily);
  } else {
    newShape = new Shape(sdata.x, sdata.y, sdata.width, sdata.height, sdata.text);
    newShape.fontSize = sdata.fontSize || 14;
    newShape.fontFamily = sdata.fontFamily || "Arial";
  }

  // Restore common properties
  newShape.color = sdata.color || "#333";
  newShape.textColor = sdata.textColor || "#000";
  newShape.fillColor = sdata.fillColor || "#e8f1fa";
  newShape.lineWidth = sdata.lineWidth || 2;
  newShape.id = sdata.id;
  newShape.opacity = sdata.opacity !== undefined ? sdata.opacity : 1;
  // Restore animated border state
  newShape.isAnimated = sdata.isAnimated !== undefined ? sdata.isAnimated : false;
  
  return newShape;
}

// 3) Export the entire diagram as JSON and trigger a file download
function saveDiagram() {
  const exportData = {
    shapeCounter: shapeCounter,
    shapes: shapes.map(shapeToSerializable),
    arrows: arrows.map(arrow => {
      let arrowData = {};
      if (arrow.fromId === undefined) {
        // Free arrow: include coordinates
        arrowData = {
          fromId: undefined,
          toId: undefined,
          fromX: arrow.fromX,
          fromY: arrow.fromY,
          toX: arrow.toX,
          toY: arrow.toY,
          color: arrow.color,
          lineWidth: arrow.lineWidth,
          curve: arrow.curve, // Add this line
        };
      } else {
        // Connected arrow
        arrowData = {
          fromId: arrow.fromId,
          toId: arrow.toId,
          color: arrow.color,
          lineWidth: arrow.lineWidth,
          curve: arrow.curve, // Add this line
        };
      }
      // Save optional properties if they exist.
      if (arrow.waypoints) {
        arrowData.waypoints = arrow.waypoints;
      }
      if (arrow.startAttachment) {
        arrowData.startAttachment = arrow.startAttachment;
      }
      if (arrow.endAttachment) {
        arrowData.endAttachment = arrow.endAttachment;
      }
      return arrowData;
    }),
    canvasBgColor: canvasBgColor
  };

  const dataStr =
    "data:text/json;charset=utf-8," +
    encodeURIComponent(JSON.stringify(exportData, null, 2));
  const dlAnchorEl = document.createElement("a");
  dlAnchorEl.setAttribute("href", dataStr);
  dlAnchorEl.setAttribute("download", "diagram.json");
  dlAnchorEl.click();
}

// 4) Ask the user for a JSON file from disk, then re-import shapes/arrows
function loadDiagramFromFile() {
  historyManager.clear();
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/json";

  fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const jsonText = evt.target.result;
        importDiagram(jsonText);
        historyManager.clear(); // Clear history when a new diagram is loaded.
      } catch (error) {
        console.error("Error reading JSON:", error);
      }
    };
    reader.readAsText(file);
  };

  // Open the file picker dialog.
  fileInput.click();
}

// 5) Import the diagram data from a JSON string
async function importDiagram(jsonText) {
  try {
    const importData = JSON.parse(jsonText);

    // Clear existing shapes/arrows
    shapes = [];
    arrows = [];

    // Import shapes (rest of your code stays the same)
    const shapePromises = importData.shapes.map(sdata => {
      if (sdata.type === "AnimatedGifShape") {
        return createAnimatedGifShape(sdata);
      } else {
        return Promise.resolve(shapeFromSerializable(sdata));
      }
    });
    const newShapes = await Promise.all(shapePromises);
    shapes.push(...newShapes);

    // Compute the largest used shape ID.
    const maxId = newShapes.reduce((acc, s) => Math.max(acc, s.id), 0);
    shapeCounter = Math.max(importData.shapeCounter, maxId + 1);

    // Restore arrows, including free arrows and connected arrows with optional properties:
    arrows = (importData.arrows || []).map(arrowData => {
      if (arrowData.fromId === undefined) {
        // Free arrow: include coordinate information.
        return {
          fromId: undefined,
          toId: undefined,
          fromX: arrowData.fromX,
          fromY: arrowData.fromY,
          toX: arrowData.toX,
          toY: arrowData.toY,
          color: arrowData.color,
          lineWidth: arrowData.lineWidth,
          waypoints: arrowData.waypoints, // may be undefined
          curve: arrowData.curve || false, // Add this line with default
        };
      } else {
        // Connected arrow
        return {
          fromId: arrowData.fromId,
          toId: arrowData.toId,
          color: arrowData.color,
          lineWidth: arrowData.lineWidth,
          waypoints: arrowData.waypoints,          // may be undefined
          startAttachment: arrowData.startAttachment,  // may be undefined
          endAttachment: arrowData.endAttachment,      // may be undefined
          curve: arrowData.curve || false, // Add this line with default
        };
      }
    });

    selectedShape = null;

    // Restore canvas background color
    canvasBgColor = importData.canvasBgColor || "#ffffff";
    const canvasColorPicker = document.getElementById("canvasColorPicker");
    if (canvasColorPicker) {
      canvasColorPicker.value = canvasBgColor;
    }
    console.log("Diagram loaded successfully!");
  } catch (error) {
    console.error("Error parsing diagram JSON:", error);
  }
}

// ----------------------------------------------------------------------
// ADD TWO NEW BUTTONS (in your HTML) and attach event listeners here:
// E.g. <button id="saveBtn">Save</button> and <button id="loadBtn">Load</button>
// ----------------------------------------------------------------------

// Grab references to the newly created buttons
const saveBtn = document.getElementById("saveBtn");
const loadBtn = document.getElementById("loadBtn");

// Attach click listeners to run our save/load functions
saveBtn.addEventListener("click", saveDiagram);
loadBtn.addEventListener("click", loadDiagramFromFile);

// ----------------------------------------------------------------------
// All previous code in main.js (Shape classes, event handlers, etc.) remains below
// ---------------------------------------------------------------------- 

// --- ADD: Function to find arrow under mouse ---
// ----- Revised function to compute arrow segments -----
// This works for both connected arrows and free arrows (with or without waypoints).
function getArrowSegments(arrow) {
  if (!arrow) return [];
  const segments = [];
  
  let startPoint, endPoint;
  
  if (arrow.fromId !== undefined) {
    const fromShape = shapes.find(s => s.id === arrow.fromId);
    const toShape = shapes.find(s => s.id === arrow.toId);
    if (!fromShape || !toShape) return segments;

    let startTarget, endTarget;
    
    if (arrow.waypoints && arrow.waypoints.length > 0) {
      startTarget = arrow.waypoints[0];
      endTarget = arrow.waypoints[arrow.waypoints.length - 1];
    } else {
      startTarget = toShape.getCenter();
      endTarget = fromShape.getCenter();
    }

    startPoint = getEdgeIntersection(fromShape, startTarget.x, startTarget.y);
    endPoint = getEdgeIntersection(toShape, endTarget.x, endTarget.y);
  } else {
    // Free arrow
    startPoint = { x: arrow.fromX, y: arrow.fromY };
    endPoint = { x: arrow.toX, y: arrow.toY };
  }

  // Build points array including start, waypoints, and end
  let points = [startPoint];
  if (arrow.waypoints && arrow.waypoints.length > 0) {
    points.push(...arrow.waypoints);
  }
  points.push(endPoint);
  
  // If curve mode is on, use the curve points from Catmull-Rom interpolation
  if (arrow.curve && points.length >= 2) {
    const curvePoints = getCatmullRomCurvePoints(points, 20);
    for (let i = 0; i < curvePoints.length - 1; i++) {
      segments.push({
        x1: curvePoints[i].x,
        y1: curvePoints[i].y,
        x2: curvePoints[i + 1].x,
        y2: curvePoints[i + 1].y
      });
    }
  } else {
    // Otherwise, use simple straight segments connecting the points
    let prevX = points[0].x, prevY = points[0].y;
    for (let i = 1; i < points.length; i++) {
      segments.push({
          x1: prevX,
          y1: prevY,
          x2: points[i].x,
          y2: points[i].y
      });
      prevX = points[i].x;
      prevY = points[i].y;
    }
  }
  return segments;
}

// ----- Revised hit detection for arrows -----
// Instead of checking only the (computed) endpoints, we iterate through every segment.
function findArrowUnderMouse(x, y) {
    for (let i = arrows.length - 1; i >= 0; i--) {
        const arrow = arrows[i];
        const segments = getArrowSegments(arrow);
        for (let seg of segments) {
            // Increase the threshold to 15 pixels for better selection over curved paths.
            if (isPointNearLine(x, y, seg.x1, seg.y1, seg.x2, seg.y2, 15)) {
                return arrow;
            }
        }
    }
    return null;
}

// --- ADD: Helper function to check if point is near a line ---
function isPointNearLine(px, py, x1, y1, x2, y2, threshold = 10) {
    // Increase default threshold to 10 pixels for easier selection
    
    // First do a quick bounding box check for performance
    const minX = Math.min(x1, x2) - threshold;
    const maxX = Math.max(x1, x2) + threshold;
    const minY = Math.min(y1, y2) - threshold;
    const maxY = Math.max(y1, y2) + threshold;
    
    if (px < minX || px > maxX || py < minY || py > maxY) {
        return false;
    }

    // If we're still here, do the more precise check
    const dx = x2 - x1;
    const dy = y2 - y1;

    if (dx === 0 && dy === 0) {
        // Line is just a point
        return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2) <= threshold;
    }

    const t = ((px - x1) * dx + (py - y1) * dy) / (dx ** 2 + dy ** 2);
    const clampedT = Math.max(0, Math.min(1, t));

    const closestX = x1 + clampedT * dx;
    const closestY = y1 + clampedT * dy;

    // Calculate distance to the closest point
    const distance = Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
    
    return distance <= threshold;
}

// --- ADD: Function to calculate point-to-line distance ---
function pointLineDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx === 0 && dy === 0) {
    // Line is just a point
    return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  }

  const t = ((px - x1) * dx + (py - y1) * dy) / (dx ** 2 + dy ** 2);
  const clampedT = Math.max(0, Math.min(1, t)); // Clamp t to be within 0-1

  const closestX = x1 + clampedT * dx;
  const closestY = y1 + clampedT * dy;

  return Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
}

// --- ADD: Listen for changes to the arrow color picker ---
arrowColorPicker.addEventListener("input", (e) => {
  // --- MOD: Check if a shape or arrow is selected ---
  if (selectedArrow) {
    selectedArrow.color = e.target.value;
  } else if (selectedShape) {
    selectedShape.color = e.target.value;
  }
});

// --- ADD: Function to draw selection handles for an arrow ---
function drawArrowSelectionHandles(ctx, arrow) {
  if (!arrow || !ctx) return;
  
  let fromX, fromY, toX, toY;

  if (arrow.fromId !== undefined) {
    // Connected arrow
    const fromShape = shapes.find((s) => s.id === arrow.fromId);
    const toShape = shapes.find((s) => s.id === arrow.toId);
    if (!fromShape || !toShape) return;

    // If there are waypoints, use the first and last waypoints as targets
    // for calculating intersection points
    let startTarget, endTarget;
    
    if (arrow.waypoints && arrow.waypoints.length > 0) {
      startTarget = arrow.waypoints[0];
      endTarget = arrow.waypoints[arrow.waypoints.length - 1];
    } else {
      startTarget = toShape.getCenter();
      endTarget = fromShape.getCenter();
    }

    const fromPt = getEdgeIntersection(fromShape, startTarget.x, startTarget.y);
    const toPt = getEdgeIntersection(toShape, endTarget.x, endTarget.y);
    
    fromX = fromPt.x;
    fromY = fromPt.y;
    toX = toPt.x;
    toY = toPt.y;
  } else {
    // Free arrow
    fromX = arrow.fromX;
    fromY = arrow.fromY;
    toX = arrow.toX;
    toY = arrow.toY;
  }

  ctx.save();
  // Draw larger, more visible handles
  const handleSize = ARROW_HANDLE_SIZE * 1.5;
  
  // Draw start handle (green)
  ctx.fillStyle = "green";
  ctx.strokeStyle = "white";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(fromX, fromY, handleSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  
  // Draw end handle (red)
  ctx.fillStyle = "red";
  ctx.beginPath();
  ctx.arc(toX, toY, handleSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  
  ctx.restore();
}

// ----------------------------------------------------------------------
// All previous code in main.js (Shape classes, event handlers, etc.) remains below
// ---------------------------------------------------------------------- 

function init() {
  // Grab the new text color picker
  const textColorPicker = document.getElementById("textColorPicker");

  // Listen for user input changes on text color
  textColorPicker.addEventListener("input", (e) => {
    if (selectedShape) {
      // If a shape is selected (regular shape or TextShape)
      selectedShape.textColor = e.target.value;
    }
  });
}

// Finally, add a small init call somewhere after your variable declarations or 
// inside a DOMContentLoaded event. For instance:
document.addEventListener("DOMContentLoaded", init); 

// Add event listeners for the fill color picker
fillColorPicker.addEventListener("input", (e) => {
  if (selectedShape) {
    selectedShape.fillColor = e.target.value;
  }
}); 

/////////////////////////////////////////////
// 2. Listen for changes in the new color picker
/////////////////////////////////////////////
document.addEventListener("DOMContentLoaded", () => {
    // Existing init code, then:
    const canvasColorPicker = document.getElementById("canvasColorPicker");
    canvasColorPicker.addEventListener("input", (e) => {
        canvasBgColor = e.target.value; // update the global variable
    });
}); 

// --- ADD: Listen for changes to the line thickness picker ---
lineThicknessPicker.addEventListener("input", (e) => {
  // --- MOD: Check if a shape or arrow is selected ---
  if (selectedArrow) {
    selectedArrow.lineWidth = parseInt(e.target.value);
  } else if (selectedShape) {
    selectedShape.lineWidth = parseInt(e.target.value);
  }
}); 

// --- ADD: Event listener for the animated border checkbox ---
const animatedBorderBtn = document.getElementById('animatedBorderBtn');

// Store overall "On / Off" in a variable (if you want a single global toggle).
// Alternatively, you can directly toggle the selected shape's isAnimated property each time.
let isAnimatedOn = false;

animatedBorderBtn.addEventListener('click', () => {
  if (!selectedShape) return;

  // Flip the global state
  isAnimatedOn = !isAnimatedOn;

  // Update button label
  animatedBorderBtn.textContent = isAnimatedOn ? 'On' : 'Off';

  // If you want a per-shape toggle, do:
  selectedShape.isAnimated = isAnimatedOn;

  // Or more advanced: if you want multiple shapes to remain individually toggled,
  // then remove "isAnimatedOn" and do:
  // selectedShape.isAnimated = !selectedShape.isAnimated;
  // animatedBorderBtn.textContent = selectedShape.isAnimated ? 'On' : 'Off';

  // Redraw canvas
}); 

// Get reference to the new opacity slider
const opacityRange = document.getElementById("opacityRange");

// Listen for changes on the opacity slider
opacityRange.addEventListener("input", (e) => {
  if (selectedShape) {
    // Set the selected shape's opacity to the slider value (a number between 0 and 1)
    selectedShape.opacity = parseFloat(e.target.value);
    // Optionally redraw the canvas if you have a redraw function
  }
});

// Add this code near your other event listeners (e.g., after the drag/drop listeners)
// Paste event for images from the clipboard
document.addEventListener("paste", (e) => {
  // Only handle paste if we're not in a text input
  if (document.activeElement === shapeEditorInput) {
    return;
  }

  const clipboardData = e.clipboardData;
  if (!clipboardData) return;
  
  const items = clipboardData.items;
  if (!items) return;
  
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf("image") !== -1) {
      const blob = items[i].getAsFile();
      if (blob) {
        const reader = new FileReader();
        reader.onload = function(evt) {
          const img = new Image();
          img.onload = function() {
            // Calculate position to place the image at the center of the viewport
            const rect = canvas.getBoundingClientRect();
            const scale = parseFloat(canvas.style.transform.match(/scale\((.*?)\)/)?.[1] || 1);
            const x = (rect.width / 2 - img.width / 2) / scale;
            const y = (rect.height / 2 - img.height / 2) / scale;
            
            // Create a new ImageShape and add using history manager
            const imageShape = new ImageShape(x, y, img.width, img.height, img);
            historyManager.execute(new AddShapeCommand(imageShape));
            requestRender();
          };
          img.src = evt.target.result;
        };
        reader.readAsDataURL(blob);
        break;
      }
    }
  }
});

// Get reference to the "Remove White" button
const btnRemoveWhite = document.getElementById("btnRemoveWhite");

btnRemoveWhite.addEventListener("click", () => {
  if (!selectedShape) {
    console.log("No object selected.");
    return;
  }
  if (!(selectedShape instanceof ImageShape)) {
    console.log("Selected object is not an image.");
    return;
  }
  
  // Create an offscreen canvas with the dimensions of the current image
  const offCanvas = document.createElement("canvas");
  offCanvas.width = selectedShape.img.width;
  offCanvas.height = selectedShape.img.height;
  
  const offCtx = offCanvas.getContext("2d");
  // Draw the original image into the offscreen canvas
  offCtx.drawImage(selectedShape.img, 0, 0);
  
  // Get pixel data
  const imgData = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height);
  const data = imgData.data;
  
  // Loop through each pixel, replacing near-white pixels with transparent ones.
  // This tolerance will treat any pixel with r, g, b values > 240 as white.
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r > 240 && g > 240 && b > 240) { 
      // Set alpha channel to 0 (transparent)
      data[i + 3] = 0;
    }
  }
  
  // Put the modified pixel data back into the offscreen canvas
  offCtx.putImageData(imgData, 0, 0);
  
  // Create a new image from the modified canvas
  const newImg = new Image();
  newImg.onload = function() {
    // Update the selected shape's image to use the new Image
    selectedShape.img = newImg;
    // Optionally, update dimensions if desired:
    selectedShape.width = newImg.width;
    selectedShape.height = newImg.height;
    // Redraw the canvas if needed (assuming your animation loop is running continuously)
  };
  
  // Set the new source to the canvas data URL
  newImg.src = offCanvas.toDataURL();
});

class FreeArrow {
  constructor(fromX, fromY, toX, toY, color = "#000", lineWidth = 2) {
    this.fromX = fromX;
    this.fromY = fromY;
    this.toX = toX;
    this.toY = toY;
    this.color = color;
    this.lineWidth = lineWidth;
  }

  draw(ctx) {
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.lineDashOffset = -dashOffset;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.lineWidth;
    ctx.beginPath();
    ctx.moveTo(this.fromX, this.fromY);
    ctx.lineTo(this.toX, this.toY);
    ctx.stroke();

    // (Optional) Draw arrowhead and selection handles here
    ctx.restore();
  }
}

function updateOpacityControl() {
  if (selectedShape) {
    opacityRange.value = selectedShape.opacity;
  } else {
    opacityRange.value = 1; // or another default value if no shape is selected
  }
}

// Add helper function to check if a point is near another point
function isPointNearPoint(x1, y1, x2, y2, threshold = ARROW_HANDLE_SIZE) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy) <= threshold;
}

// Add an asynchronous helper function for creating an AnimatedGifShape from saved data.
async function createAnimatedGifShape(sdata) {
  // Use fetch to get the ArrayBuffer from the saved data URL.
  const response = await fetch(sdata.gifSrc);
  const buffer = await response.arrayBuffer();
  
  // Assume the gifuct library is available globally.
  const gifData = window.gifuct.parseGIF(buffer);
  const frames = window.gifuct.decompressFrames(gifData, true);
  
  // Create and initialize your AnimatedGifShape with proper frames.
  const animatedShape = new AnimatedGifShape(sdata.x, sdata.y, frames, sdata.speedMultiplier);
  animatedShape.id = sdata.id;
  animatedShape.color = sdata.color || "#333";
  animatedShape.textColor = sdata.textColor || "#000";
  animatedShape.fillColor = sdata.fillColor || "#e8f1fa";
  animatedShape.lineWidth = sdata.lineWidth || 2;
  animatedShape.opacity = sdata.opacity !== undefined ? sdata.opacity : 1;
  animatedShape.gifSrc = sdata.gifSrc;
  
  return animatedShape;
}

// Add function to draw waypoint handles
function drawWaypointHandles(ctx, arrow) {
  if (!ctx || !arrow || !arrow.waypoints || !arrow.waypoints.length) return;
  
  ctx.save();
  ctx.fillStyle = "blue";
  ctx.strokeStyle = "white";
  
  // Draw handles for each waypoint
  arrow.waypoints.forEach((point, index) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, ARROW_HANDLE_SIZE, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
  });
  
  ctx.restore();
}

// ----- Update mousedown for dragging waypoints -----
// Now checks against the larger ARROW_HANDLE_SIZE for easier selection.
canvas.addEventListener("mousedown", (e) => {
    const { x, y } = getCanvasMousePos(e);
    
    // Check for waypoint dragging first.
    if (selectedArrow && selectedArrow.waypoints && selectedArrow.waypoints.length > 0) {
        for (let i = 0; i < selectedArrow.waypoints.length; i++) {
            const point = selectedArrow.waypoints[i];
            if (isPointNearPoint(x, y, point.x, point.y, ARROW_HANDLE_SIZE)) {
                selectedWaypointIndex = i;
                return;
            }
        }
    }
    
    // ... Rest of your mousedown code remains unchanged ...
});

// Update mousemove handler
canvas.addEventListener("mousemove", (e) => {
    const { x, y } = getCanvasMousePos(e);
    
    if (selectedWaypointIndex !== -1 && selectedArrow) {
        selectedArrow.waypoints[selectedWaypointIndex].x = x;
        selectedArrow.waypoints[selectedWaypointIndex].y = y;
        return;
    }
    
    // ... rest of existing mousemove code ...
});

// Update mouseup handler
canvas.addEventListener("mouseup", () => {
    selectedWaypointIndex = -1;
    // ... rest of existing mouseup code ...
});

// Global variables for arrow hovering and waypoint dragging

function getCatmullRomCurvePoints(points, numOfSegments) {
    // Returns an array of interpolated points along the Catmull-Rom spline.
    let curvePoints = [];
    for (let i = 0; i < points.length - 1; i++) {
        // Handle boundary cases
        let p0 = i === 0 ? points[i] : points[i - 1];
        let p1 = points[i];
        let p2 = points[i + 1];
        let p3 = (i + 2 < points.length) ? points[i + 2] : p2;
        
        for (let t = 0; t <= 1; t += 1 / numOfSegments) {
            let t2 = t * t;
            let t3 = t2 * t;
            let x = 0.5 * ((2 * p1.x) +
                (-p0.x + p2.x) * t +
                (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
                (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
            let y = 0.5 * ((2 * p1.y) +
                (-p0.y + p2.y) * t +
                (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
                (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
            curvePoints.push({ x, y });
        }
    }
    return curvePoints;
}

// Toggle curve mode button event listener
const toggleCurveBtn = document.getElementById("toggleCurveBtn");
toggleCurveBtn.addEventListener("click", () => {
    console.log("Toggle button clicked");
    if (selectedArrow) {
        console.log("Selected arrow found");
        selectedArrow.curve = !selectedArrow.curve;
        console.log("Curve mode:", selectedArrow.curve);
        toggleCurveBtn.textContent = selectedArrow.curve ? "Curve" : "Straight";
        // The animate loop will handle the redraw automatically
    } else {
        console.log("No arrow selected");
    }
});

// Update the arrow selection logic to maintain toggle button state
function updateToggleButtonState(arrow) {
    const toggleCurveBtn = document.getElementById("toggleCurveBtn");
    if (arrow) {
        toggleCurveBtn.textContent = arrow.curve ? "Curve" : "Straight";
    }
}

// Add this to wherever you handle arrow selection
canvas.addEventListener("mousedown", (e) => {
    const { x, y } = getCanvasMousePos(e);  // Get mouse position first
    
    // If we clicked an arrow
    const clickedArrow = findArrowUnderMouse(x, y);
    if (clickedArrow) {
        selectedArrow = clickedArrow;
        selectedShape = null;
        updateToggleButtonState(clickedArrow);
        return;
    }
    
    // If we didn't click an arrow, clear selection
    if (selectedArrow) {
        selectedArrow = null;
        updateToggleButtonState(null);
    }
});

// Update the button reference
const btnRemoveColor = document.getElementById("btnRemoveColor");

btnRemoveColor.addEventListener("click", () => {
  if (!selectedShape) {
    console.log("No object selected.");
    return;
  }
  if (!(selectedShape instanceof ImageShape)) {
    console.log("Selected object is not an image.");
    return;
  }

  // Create color picker input
  const colorPicker = document.createElement("input");
  colorPicker.type = "color";
  colorPicker.value = "#FFFFFF"; // Default to white
  
  // Create a dialog for color selection
  const dialog = document.createElement("dialog");
  dialog.style.padding = "20px";
  
  const heading = document.createElement("h3");
  heading.textContent = "Select color to remove";
  
  const toleranceLabel = document.createElement("label");
  toleranceLabel.textContent = "Color tolerance: ";
  const toleranceInput = document.createElement("input");
  toleranceInput.type = "range";
  toleranceInput.min = "0";
  toleranceInput.max = "100";
  toleranceInput.value = "20";
  
  const confirmBtn = document.createElement("button");
  confirmBtn.textContent = "Remove Color";
  confirmBtn.style.marginLeft = "10px";
  
  dialog.appendChild(heading);
  dialog.appendChild(colorPicker);
  dialog.appendChild(document.createElement("br"));
  dialog.appendChild(document.createElement("br"));
  dialog.appendChild(toleranceLabel);
  dialog.appendChild(toleranceInput);
  dialog.appendChild(document.createElement("br"));
  dialog.appendChild(document.createElement("br"));
  dialog.appendChild(confirmBtn);
  
  document.body.appendChild(dialog);
  dialog.showModal();

  confirmBtn.onclick = () => {
    const selectedColor = colorPicker.value;
    const tolerance = parseInt(toleranceInput.value);
    
    // Convert hex to RGB
    const r = parseInt(selectedColor.substr(1,2), 16);
    const g = parseInt(selectedColor.substr(3,2), 16);
    const b = parseInt(selectedColor.substr(5,2), 16);
    
    // Create an offscreen canvas
    const offCanvas = document.createElement("canvas");
    offCanvas.width = selectedShape.img.width;
    offCanvas.height = selectedShape.img.height;
    
    const offCtx = offCanvas.getContext("2d");
    offCtx.drawImage(selectedShape.img, 0, 0);
    
    const imgData = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height);
    const data = imgData.data;
    
    // Loop through pixels
    for (let i = 0; i < data.length; i += 4) {
      const pixelR = data[i];
      const pixelG = data[i + 1];
      const pixelB = data[i + 2];
      
      // Calculate color difference using Euclidean distance
      const colorDiff = Math.sqrt(
        Math.pow(pixelR - r, 2) +
        Math.pow(pixelG - g, 2) +
        Math.pow(pixelB - b, 2)
      );
      
      // If color is within tolerance range, make it transparent
      if (colorDiff <= tolerance * 2.55) { // Convert percentage to 0-255 range
        data[i + 3] = 0; // Set alpha to 0
      }
    }
    
    offCtx.putImageData(imgData, 0, 0);
    
    // Create and update the new image
    const newImg = new Image();
    newImg.onload = function() {
      selectedShape.img = newImg;
    };
    newImg.src = offCanvas.toDataURL();
    
    dialog.close();
    dialog.remove();
  };
});

// Helper function to get all points of an arrow (including start, waypoints, and end)
function getArrowPoints(arrow) {
  let points = [];
  
  if (arrow.fromId !== undefined) {
    // Connected arrow
    const fromShape = shapes.find(s => s.id === arrow.fromId);
    const toShape = shapes.find(s => s.id === arrow.toId);
    if (!fromShape || !toShape) return points;
    
    let startTarget = arrow.waypoints && arrow.waypoints.length > 0 
      ? arrow.waypoints[0] 
      : toShape.getCenter();
    let endTarget = arrow.waypoints && arrow.waypoints.length > 0
      ? arrow.waypoints[arrow.waypoints.length - 1]
      : fromShape.getCenter();
      
    points.push(getEdgeIntersection(fromShape, startTarget.x, startTarget.y));
  } else {
    // Free arrow
    points.push({ x: arrow.fromX, y: arrow.fromY });
  }
  
  // Add waypoints
  if (arrow.waypoints && arrow.waypoints.length > 0) {
    points.push(...arrow.waypoints);
  }
  
  // Add end point
  if (arrow.fromId !== undefined) {
    const toShape = shapes.find(s => s.id === arrow.toId);
    const fromShape = shapes.find(s => s.id === arrow.fromId);
    let endTarget = arrow.waypoints && arrow.waypoints.length > 0
      ? arrow.waypoints[arrow.waypoints.length - 1]
      : fromShape.getCenter();
    points.push(getEdgeIntersection(toShape, endTarget.x, endTarget.y));
  } else {
    points.push({ x: arrow.toX, y: arrow.toY });
  }
  
  return points;
}

// ============= UNDO/REDO SYSTEM =============

class HistoryManager {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
    this.maxStackSize = 50; // Limit stack size to prevent memory issues
  }

  execute(command) {
    command.execute();
    this.undoStack.push(command);
    this.redoStack = []; // Clear redo stack when new action is performed
    
    // Trim undo stack if it exceeds max size
    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack.shift();
    }
    
    // Update UI buttons
    this.updateButtonStates();
  }

  undo() {
    if (this.undoStack.length === 0) return;
    
    const command = this.undoStack.pop();
    command.undo();
    this.redoStack.push(command);
    
    this.updateButtonStates();
  }

  redo() {
    if (this.redoStack.length === 0) return;
    
    const command = this.redoStack.pop();
    command.execute();
    this.undoStack.push(command);
    
    this.updateButtonStates();
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.updateButtonStates();
  }

  updateButtonStates() {
    // Update UI button states
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    
    if (undoBtn) undoBtn.disabled = this.undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = this.redoStack.length === 0;
  }
}

// Command base class
class Command {
  execute() { throw new Error('execute() must be implemented'); }
  undo() { throw new Error('undo() must be implemented'); }
}

// Add Shape Command
class AddShapeCommand extends Command {
  constructor(shape) {
    super();
    this.shape = shape;
  }

  execute() {
    shapes.push(this.shape);
    requestRender();
  }

  undo() {
    const index = shapes.indexOf(this.shape);
    if (index !== -1) {
      shapes.splice(index, 1);
      if (selectedShape === this.shape) {
        selectedShape = null;
      }
    }
    requestRender();
  }
}

// Delete Shape Command
class DeleteShapeCommand extends Command {
  constructor(shape) {
    super();
    this.shape = shape;
    this.affectedArrows = []; // Store arrows that connect to this shape
  }

  execute() {
    // Store affected arrows before deletion
    this.affectedArrows = arrows.filter(
      arrow => arrow.fromId === this.shape.id || arrow.toId === this.shape.id
    );
    
    // Remove shape and connected arrows
    const index = shapes.indexOf(this.shape);
    if (index !== -1) {
      shapes.splice(index, 1);
      arrows = arrows.filter(
        arrow => arrow.fromId !== this.shape.id && arrow.toId !== this.shape.id
      );
      if (selectedShape === this.shape) {
        selectedShape = null;
      }
    }
    requestRender();
  }

  undo() {
    shapes.push(this.shape);
    arrows.push(...this.affectedArrows);
    requestRender();
  }
}

// Move Shape Command
class MoveShapeCommand extends Command {
  constructor(shape, oldX, oldY, newX, newY) {
    super();
    this.shape = shape;
    this.oldX = oldX;
    this.oldY = oldY;
    this.newX = newX;
    this.newY = newY;
  }

  execute() {
    this.shape.x = this.newX;
    this.shape.y = this.newY;
    requestRender();
  }

  undo() {
    this.shape.x = this.oldX;
    this.shape.y = this.oldY;
    requestRender();
  }
}

// Add Arrow Command
class AddArrowCommand extends Command {
  constructor(arrow) {
    super();
    this.arrow = arrow;
  }

  execute() {
    arrows.push(this.arrow);
    requestRender();
  }

  undo() {
    const index = arrows.indexOf(this.arrow);
    if (index !== -1) {
      arrows.splice(index, 1);
      if (selectedArrow === this.arrow) {
        selectedArrow = null;
      }
    }
    requestRender();
  }
}

// Delete Arrow Command
class DeleteArrowCommand extends Command {
  constructor(arrow) {
    super();
    this.arrow = arrow;
  }

  execute() {
    const index = arrows.indexOf(this.arrow);
    if (index !== -1) {
      arrows.splice(index, 1);
      if (selectedArrow === this.arrow) {
        selectedArrow = null;
      }
    }
    requestRender();
  }

  undo() {
    arrows.push(this.arrow);
    requestRender();
  }
}

// Modify Text Command
class ModifyTextCommand extends Command {
  constructor(shape, oldText, newText) {
    super();
    this.shape = shape;
    this.oldText = oldText;
    this.newText = newText;
  }

  execute() {
    this.shape.text = this.newText;
    if (this.shape instanceof TextShape) {
      // Recalculate bounds for TextShape
      const tempCtx = document.createElement("canvas").getContext("2d");
      tempCtx.font = `${this.shape.fontSize}px ${this.shape.fontFamily}`;
      const metrics = tempCtx.measureText(this.shape.text);
      this.shape.width = metrics.width;
    }
    requestRender();
  }

  undo() {
    this.shape.text = this.oldText;
    if (this.shape instanceof TextShape) {
      // Recalculate bounds for TextShape
      const tempCtx = document.createElement("canvas").getContext("2d");
      tempCtx.font = `${this.shape.fontSize}px ${this.shape.fontFamily}`;
      const metrics = tempCtx.measureText(this.shape.text);
      this.shape.width = metrics.width;
    }
    requestRender();
  }
}

// Create history manager instance
const historyManager = new HistoryManager();

// Add keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Check if we're editing text
  if (document.activeElement === shapeEditorInput) {
    return;
  }

  // Undo: Ctrl+Z
  if (e.ctrlKey && e.key === 'z') {
    e.preventDefault();
    historyManager.undo();
  }
  
  // Redo: Ctrl+Y or Ctrl+Shift+Z
  if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
    e.preventDefault();
    historyManager.redo();
  }
});

// Update existing code to use commands

// Modify shape creation to use AddShapeCommand
function createShape(x, y, text) {
  const newShape = new Shape(x - 50, y - 25, 100, 50, text);
  historyManager.execute(new AddShapeCommand(newShape));
}

// Modify text updates to use ModifyTextCommand
function updateShapeText(shape, newText) {
  historyManager.execute(new ModifyTextCommand(shape, shape.text, newText));
}

// Modify shape deletion to use DeleteShapeCommand
function deleteShape(shape) {
  historyManager.execute(new DeleteShapeCommand(shape));
}

// Add to mouseup event for shape movement
canvas.addEventListener("mouseup", (e) => {
  if (draggingShape) {
    // Record the move command if the shape actually moved
    if (dragStartX !== draggingShape.x || dragStartY !== draggingShape.y) {
      historyManager.execute(
        new MoveShapeCommand(
          draggingShape,
          dragStartX,
          dragStartY,
          draggingShape.x,
          draggingShape.y
        )
      );
    }
    draggingShape = null;
  }
  // ... rest of existing mouseup code ...
});

// Clear history when loading new diagram


// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // Get references to the undo/redo buttons
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');

    // Add click listeners
    if (undoBtn) {
        undoBtn.addEventListener('click', () => {
            historyManager.undo();
        });
    } else {
        console.error('Undo button not found in DOM');
    }

    if (redoBtn) {
        redoBtn.addEventListener('click', () => {
            historyManager.redo();
        });
    } else {
        console.error('Redo button not found in DOM');
    }
});

// Also, we need to modify some existing event handlers to use the history manager.
// For example, in your rectangle creation handler:
rectBtn.addEventListener("click", () => {
    currentTool = "rect";
    clearEditor();
});


// ... rest of mousedown handling ...

