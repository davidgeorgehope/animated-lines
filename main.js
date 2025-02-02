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
// Set to 1200×627 for LinkedIn
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

// --- ADD: Variables for arrow dragging ---
let isDraggingArrow = false;
let dragStartX = 0;
let dragStartY = 0;

// --- ADD: Variables to track selection and resizing state ---
let selectedShape = null;        // which shape (if any) is selected
let isResizing = false;          // are we currently resizing a shape?
let resizeHandleIndex = -1;      // which handle is being dragged?
const HANDLE_SIZE = 8;           // size of each resize handle

// --- ADD: Arrow selection variables ---
let selectedArrow = null;        // which arrow (if any) is selected
const ARROW_HANDLE_SIZE = 6;     // slightly smaller than shape handles

// Reference the context menu div
const contextMenu = document.getElementById("context-menu");

// Hide the menu on any left-click
document.addEventListener("click", () => {
  contextMenu.style.display = "none";
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
    
    // Set global alpha based on the shape's opacity
    ctx.globalAlpha = this.opacity;
    
    // Fill the shape
    ctx.fillStyle = this.fillColor;
    ctx.fillRect(this.x, this.y, this.width, this.height);

    // Check for animated border
    if (this.isAnimated) {
      ctx.setLineDash([10, 5]);
      // Use exportDashOffset when exporting; otherwise use the live dashOffset
      ctx.lineDashOffset = exportingGif ? exportDashOffset : -dashOffset;
    } else {
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }
    
    // Stroke the shape
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.lineWidth;
    ctx.strokeRect(this.x, this.y, this.width, this.height);
    
    // Draw text centered in the shape
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

  if (currentTool === "freeArrow") {
    isDrawingFreeArrow = true;
    freeArrowStart = { x, y };
    // Initialize the live tracking of the mouse position
    currentFreeArrowPos = { x, y };
    return;
  }

  // Check if clicking on an arrow handle
  if (selectedArrow && !selectedArrow.fromId) {  // Only for free arrows
    // Check start handle
    if (isPointNearPoint(x, y, selectedArrow.fromX, selectedArrow.fromY)) {
      isDraggingArrowHandle = true;
      draggedHandle = 'start';
      return;
    }
    // Check end handle
    if (isPointNearPoint(x, y, selectedArrow.toX, selectedArrow.toY)) {
      isDraggingArrowHandle = true;
      draggedHandle = 'end';
      return;
    }
  }

  // Check for arrow selection first
  const clickedArrow = findArrowUnderMouse(x, y);
  if (clickedArrow && currentTool === "select") {
    selectedArrow = clickedArrow;
    selectedShape = null;
    isDraggingArrow = true;
    dragStartX = x;
    dragStartY = y;
    return;
  }

  // Check if user clicked a resize handle...
  if (selectedShape) {
    const handleIndex = getHandleIndexAtPos(selectedShape, x, y);
    if (handleIndex !== -1) {
      isResizing = true;
      resizeHandleIndex = handleIndex;
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

      // Deselect arrow if shape is selected
      selectedArrow = null;
      
      // Update the opacity slider to match the selected shape's opacity.
      opacityRange.value = selectedShape.opacity;

      // Update animated border button state.
      if (selectedShape.isAnimated) {
        animatedBorderBtn.textContent = "On";
        isAnimatedOn = true;
      } else {
        animatedBorderBtn.textContent = "Off";
        isAnimatedOn = false;
      }
    }
  } else {
    // If no shape was clicked, try to select an arrow
    const clickedArrow = findArrowUnderMouse(x, y);
    if (clickedArrow) {
      selectedArrow = clickedArrow;
      selectedShape = null;
      // Reset opacity slider because no shape is selected.
      opacityRange.value = 1;
    } else {
      // Empty space => deselect both shape and arrow
      selectedShape = null;
      selectedArrow = null;
      // Reset opacity slider to default (1)
      opacityRange.value = 1;
      animatedBorderBtn.textContent = "Off";
      isAnimatedOn = false;
    }
  }

  if (currentTool === "rect") {
    const shapeText = prompt("Enter text for the rectangle:", "Shape");
    if (shapeText !== null) {
      const newShape = new Shape(x - 50, y - 25, 100, 50, shapeText);
      shapes.push(newShape);
    }
  } else if (currentTool === "arrow") {
    // Start drawing an arrow
    const clickedShape = findShapeUnderMouse(x, y);
    if (clickedShape) {
      isDrawingLine = true;
      arrowStartShape = clickedShape;
      arrowEndPos = { x, y };
    }
  }

  if (currentTool === "text") {
    const shapeText = prompt("Enter your text:", "New Text");
    if (shapeText !== null) {
      const fontSize = parseInt(fontSizeSelect.value) || 14;
      const fontFamily = fontFamilySelect.value || "Arial";
      const newTextShape = new TextShape(x, y, shapeText, fontSize, fontFamily);
      shapes.push(newTextShape);
    }
  }
});

// Mousemove
canvas.addEventListener("mousemove", (e) => {
  const { x, y } = getCanvasMousePos(e);

  if (isDrawingFreeArrow && freeArrowStart) {
    currentFreeArrowPos = { x, y };
    return;
  }

  if (isResizing && selectedShape) {
    // We're dragging a handle to resize the selected shape
    resizeShape(selectedShape, resizeHandleIndex, x, y);
    return; // no further dragging logic
  }

  if (draggingShape) {
    // Move the shape
    draggingShape.x = x - dragOffsetX;
    draggingShape.y = y - dragOffsetY;
  } 
  else if (isDrawingLine) {
    // Update the "rubber band" end position
    arrowEndPos.x = x;
    arrowEndPos.y = y;
  }

  if (isDraggingArrow && selectedArrow && selectedArrow.fromId === undefined) {
    // Only move free arrows (those without fromId)
    const dx = x - dragStartX;
    const dy = y - dragStartY;
    
    // Update arrow position
    selectedArrow.fromX += dx;
    selectedArrow.fromY += dy;
    selectedArrow.toX += dx;
    selectedArrow.toY += dy;
    
    // Update drag start position
    dragStartX = x;
    dragStartY = y;
    return;
  }

  if (isDraggingArrowHandle && selectedArrow) {
    // Update the appropriate endpoint
    if (draggedHandle === 'start') {
      selectedArrow.fromX = x;
      selectedArrow.fromY = y;
    } else if (draggedHandle === 'end') {
      selectedArrow.toX = x;
      selectedArrow.toY = y;
    }
    return;
  }
});

// Mouseup
canvas.addEventListener("mouseup", (e) => {
  // Get mouse position from the event
  const { x, y } = getCanvasMousePos(e);

  if (isResizing) {
    isResizing = false;
    resizeHandleIndex = -1;
  }

  if (draggingShape) {
    draggingShape = null;
  }

  if (isDrawingLine) {
    const releasedShape = findShapeUnderMouse(x, y);
    if (releasedShape && releasedShape !== arrowStartShape) {
      arrows.push({ fromId: arrowStartShape.id, toId: releasedShape.id });
    }
    isDrawingLine = false;
    arrowStartShape = null;
  }

  if (isDrawingFreeArrow && freeArrowStart) {
    // Complete the free arrow drawing on mouse release
    const { x, y } = getCanvasMousePos(e);
    const newArrow = {
      fromId: undefined, // Free arrow
      toId: undefined,
      fromX: freeArrowStart.x,
      fromY: freeArrowStart.y,
      toX: x,
      toY: y,
      color: arrowColorPicker.value,
      lineWidth: parseInt(lineThicknessPicker.value) || 2
    };
    arrows.push(newArrow);
    // Clear free arrow drawing state
    isDrawingFreeArrow = false;
    freeArrowStart = null;
    currentFreeArrowPos = null;
    return;
  }

  if (isDraggingArrow) {
    isDraggingArrow = false;
    return;
  }

  if (isDraggingArrowHandle) {
    isDraggingArrowHandle = false;
    draggedHandle = null;
    return;
  }
});

// Double-click => Edit shape text inline
canvas.addEventListener("dblclick", (e) => {
  const { x, y } = getCanvasMousePos(e);
  const shape = findShapeUnderMouse(x, y);
  if (shape) {
    shapeEditorInput.style.display = "block";

    if (shape instanceof TextShape) {
      // Position the editor near the text
      // For a TextShape, y is the baseline of the text, so shift upward by shape.height
      // to place the editor above or at the text area
      shapeEditorInput.style.left = shape.x + "px";
      shapeEditorInput.style.top = (shape.y - shape.height - 5) + "px";
    } else {
      // Standard rectangle shape
      shapeEditorInput.style.left = shape.x + "px";
      shape.style.top = (shape.y + shape.height + 5) + "px";
    }

    // Populate the editor with existing text
    shapeEditorInput.value = shape.text;
    shapeEditorInput.focus();

    // When user finishes editing via ENTER
    shapeEditorInput.onkeydown = (evt) => {
      if (evt.key === "Enter") {
        updateShapeText(shape, shapeEditorInput.value);
        clearEditor();
      }
    };

    // When user clicks away
    shapeEditorInput.onblur = () => {
      updateShapeText(shape, shapeEditorInput.value);
      clearEditor();
    };
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

// The animate() function:
function animate() {
    ctx.fillStyle = canvasBgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw shapes
    shapes.forEach((shape) => {
      shape.draw(ctx);
    });

    // Draw arrows (both connected and free)
    arrows.forEach((arrow) => {
        if (arrow.fromId !== undefined) {
            // Connected arrow
            const fromShape = shapes.find((s) => s.id === arrow.fromId);
            const toShape = shapes.find((s) => s.id === arrow.toId);
            if (fromShape && toShape) {
                const fromPt = getEdgeIntersection(
                    fromShape,
                    toShape.x + toShape.width / 2,
                    toShape.y + toShape.height / 2
                );
                const toPt = getEdgeIntersection(
                    toShape,
                    fromShape.x + fromShape.width / 2,
                    fromShape.y + fromShape.height / 2
                );
                drawArrow(ctx, fromPt.x, fromPt.y, toPt.x, toPt.y, arrow);
            }
        } else {
            // Free arrow
            drawArrow(ctx, arrow.fromX, arrow.fromY, arrow.toX, arrow.toY, arrow);
        }
    });

    // If currently drawing a connected arrow (rubber band), draw it
    if (isDrawingLine && arrowStartShape) {
      const fromPt = getEdgeIntersection(
        arrowStartShape,
        arrowEndPos.x,
        arrowEndPos.y
      );
      drawTempLine(ctx, fromPt.x, fromPt.y, arrowEndPos.x, arrowEndPos.y);
    }

    // --- New: If a free arrow is being drawn, draw it
    if (isDrawingFreeArrow && freeArrowStart && currentFreeArrowPos) {
      drawArrow(ctx, freeArrowStart.x, freeArrowStart.y, currentFreeArrowPos.x, currentFreeArrowPos.y, {
          color: arrowColorPicker.value,
          lineWidth: parseInt(lineThicknessPicker.value) || 2
      });
    }

    // Draw resize handles if a shape is selected
    if (selectedShape) {
      drawResizeHandles(ctx, selectedShape);
    }

    // Draw arrow selection handles if an arrow is selected
    if (selectedArrow) {
      drawArrowSelectionHandles(ctx, selectedArrow);
    }

    // Update dash offset only once per frame
    if (!exportingGif) {
      dashOffset += 2;
      if (dashOffset > 10000) dashOffset = 0;
    }

    requestAnimationFrame(animate);
}

// Draw a dotted arrow for a final connection
function drawArrow(ctx, fromX, fromY, toX, toY, arrowObj) {
  ctx.save();
  ctx.setLineDash([6, 4]);
  // Use exportDashOffset when exporting; otherwise, use the negative of dashOffset
  ctx.lineDashOffset = exportingGif ? exportDashOffset : -dashOffset;
  ctx.strokeStyle = arrowObj.color || "#000";
  ctx.lineWidth = arrowObj.lineWidth || 2;

  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  drawArrowhead(ctx, fromX, fromY, toX, toY, arrowObj.color);
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
  // Set export mode and initialize the dash offset used in export.
  exportingGif = true;
  exportDashOffset = -dashOffset; // Initialize with negative version to mimic live behavior

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
    // Exit export mode once done.
    exportingGif = false;
  });

  // For example, capture at 30 FPS to manage file size.
  const captureDurationMs = 3000; // Total capture duration; adjust as needed.
  const frameDelayMs = 33;        // About 30 FPS (33 ms per frame).
  const numFrames = captureDurationMs / frameDelayMs;
  let frameCount = 0;

  function captureFrame() {
    if (frameCount < numFrames) {
      // Update exportDashOffset in the same direction as the live dash offset.
      exportDashOffset -= 2; // Use negative increment instead
      gif.addFrame(canvas, { copy: true, delay: frameDelayMs });
      frameCount++;
      setTimeout(captureFrame, frameDelayMs);
    } else {
      console.log("Finished capturing frames. Rendering GIF...");
      gif.render();
    }
  }

  captureFrame();
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

  const fileReader = new FileReader();

  // Check if the file is a GIF
  if (file.type === "image/gif") {
    fileReader.onload = (evt) => {
      const buffer = evt.target.result;
      try {
        // Use whichever global is available
        const lib = (typeof window.gifuct !== "undefined" ? window.gifuct : (typeof gifuct !== "undefined" ? gifuct : null));
        if (!lib) {
          console.error("gifuct library is not loaded.");
          return;
        }
        const gifData = lib.parseGIF(buffer);
        const frames = lib.decompressFrames(gifData, true);
        // Create an AnimatedGifShape from the decoded frames
        const animatedGifShape = new AnimatedGifShape(dropX, dropY, frames, 1);
        shapes.push(animatedGifShape);
      } catch (error) {
        console.error("Error decoding animated GIF:", error);
      }
    };
    fileReader.readAsArrayBuffer(file);
  } else {
    // Regular (non-GIF) image processing
    fileReader.onload = (evt) => {
      const img = new Image();
      img.onload = () => {
        const imageShape = new ImageShape(dropX, dropY, img.width, img.height, img);
        shapes.push(imageShape);
      };
      img.src = evt.target.result;
    };
    fileReader.readAsDataURL(file);
  }
});

// Start the animation loop
animate();

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
  const newX = x;
  const newY = y;
  let newWidth = width;
  let newHeight = height;

  // handleIndex in [0..3] for corners (or more if you included edges)
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
    // (If you added mid-edge handles, handle them here)
  }

  // Enforce minimum size values if desired:
  shape.width = Math.max(newWidth, 20);
  shape.height = Math.max(newHeight, 20);
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
      removeShapeById(selectedShape.id);
      selectedShape = null;
    } else if (selectedArrow) {
      // Check if the arrow is a free arrow or attached to shapes
      if (selectedArrow.fromId !== undefined) {
        arrows = arrows.filter(arrow => arrow !== selectedArrow);
      } else {
        arrows = arrows.filter(arrow => arrow !== selectedArrow);
      }
      selectedArrow = null;
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
            removeShapeById(selectedShape.id);
            selectedShape = null;
        } else if (selectedArrow) {
            if (selectedArrow.fromId !== undefined) {
                arrows = arrows.filter(arrow => arrow !== selectedArrow);
            } else {
                arrows = arrows.filter(arrow => arrow !== selectedArrow);
            }
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
  // Notice we add "id" to the exported data
  if (shape instanceof ImageShape) {
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

  if (sdata.type === "ImageShape") {
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
  // Restore other properties
  newShape.color = sdata.color || "#333";
  newShape.textColor = sdata.textColor || "#000";
  newShape.fillColor = sdata.fillColor || "#e8f1fa";
  newShape.lineWidth = sdata.lineWidth || 2;
  newShape.isAnimated = sdata.isAnimated || false;
  newShape.id = sdata.id;
  newShape.opacity = sdata.opacity !== undefined ? sdata.opacity : 1;
  return newShape;
}

// 3) Export the entire diagram as JSON and trigger a file download
function saveDiagram() {
  const exportData = {
    shapeCounter: shapeCounter,
    shapes: shapes.map(shapeToSerializable),
    arrows: arrows.map(arrow => {
      // For free arrows (not connected to any shape), include coordinates.
      if (arrow.fromId === undefined) {
        return {
          fromId: undefined,
          toId: undefined,
          fromX: arrow.fromX,
          fromY: arrow.fromY,
          toX: arrow.toX,
          toY: arrow.toY,
          color: arrow.color,
          lineWidth: arrow.lineWidth
        };
      } else {
        // For connected arrows
        return {
          fromId: arrow.fromId,
          toId: arrow.toId,
          color: arrow.color,
          lineWidth: arrow.lineWidth
        };
      }
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
      } catch (error) {
        console.error("Error reading JSON:", error);
      }
    };
    reader.readAsText(file);
  };

  // Programmatically click the <input> to open the file picker dialog
  fileInput.click();
}

// 5) Import the diagram data from a JSON string
function importDiagram(jsonText) {
  try {
    const importData = JSON.parse(jsonText);

    // Clear existing shapes/arrows
    shapes = [];
    arrows = [];

    // Recreate shapes
    const newShapes = importData.shapes.map(shapeFromSerializable);
    shapes.push(...newShapes);

    // Compute the largest used shape ID so we can set shapeCounter accordingly.
    const maxId = newShapes.reduce((acc, s) => Math.max(acc, s.id), 0);
    shapeCounter = Math.max(importData.shapeCounter, maxId + 1);

    // Restore arrows, handling free arrows explicitly.
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
          lineWidth: arrowData.lineWidth
        };
      } else {
        // Connected arrow
        return {
          fromId: arrowData.fromId,
          toId: arrowData.toId,
          color: arrowData.color,
          lineWidth: arrowData.lineWidth
        };
      }
    });

    // Optionally, reset the selected shape
    selectedShape = null;

    // Restore canvasBgColor
    canvasBgColor = importData.canvasBgColor || "#ffffff";
    // Update canvas background color picker value
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
function findArrowUnderMouse(x, y) {
  for (let i = arrows.length - 1; i >= 0; i--) {
    const arrow = arrows[i];
    
    // Handle both connected and free arrows
    let fromX, fromY, toX, toY;
    
    if (arrow.fromId !== undefined) {
      // Connected arrow
      const fromShape = shapes.find((s) => s.id === arrow.fromId);
      const toShape = shapes.find((s) => s.id === arrow.toId);
      if (fromShape && toShape) {
        const fromPt = getEdgeIntersection(
          fromShape,
          toShape.x + toShape.width / 2,
          toShape.y + toShape.height / 2
        );
        const toPt = getEdgeIntersection(
          toShape,
          fromShape.x + fromShape.width / 2,
          fromShape.y + fromShape.height / 2
        );
        fromX = fromPt.x;
        fromY = fromPt.y;
        toX = toPt.x;
        toY = toPt.y;
      }
    } else {
      // Free arrow
      fromX = arrow.fromX;
      fromY = arrow.fromY;
      toX = arrow.toX;
      toY = arrow.toY;
    }
    
    if (isPointNearLine(x, y, fromX, fromY, toX, toY, 5)) {
      return arrow;
    }
  }
  return null;
}

// --- ADD: Helper function to check if point is near a line ---
function isPointNearLine(px, py, x1, y1, x2, y2, threshold) {
  const dist = pointLineDistance(px, py, x1, y1, x2, y2);
  return dist <= threshold;
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
  if (!arrow) return;

  let fromX, fromY, toX, toY;

  if (arrow.fromId !== undefined) {
    // Connected arrow
    const fromShape = shapes.find((s) => s.id === arrow.fromId);
    const toShape = shapes.find((s) => s.id === arrow.toId);
    if (!fromShape || !toShape) return;

    const fromPt = getEdgeIntersection(
      fromShape,
      toShape.x + toShape.width / 2,
      toShape.y + toShape.height / 2
    );
    const toPt = getEdgeIntersection(
      toShape,
      fromShape.x + fromShape.width / 2,
      fromShape.y + fromShape.height / 2
    );
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
  redrawCanvas();
}); 

// Get reference to the new opacity slider
const opacityRange = document.getElementById("opacityRange");

// Listen for changes on the opacity slider
opacityRange.addEventListener("input", (e) => {
  if (selectedShape) {
    // Set the selected shape's opacity to the slider value (a number between 0 and 1)
    selectedShape.opacity = parseFloat(e.target.value);
    // Optionally redraw the canvas if you have a redraw function
    redrawCanvas();
  }
});

// Add this code near your other event listeners (e.g., after the drag/drop listeners)
// Paste event for images from the clipboard
document.addEventListener("paste", (e) => {
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
            // Calculate position to place the image at the center of the canvas
            const x = canvas.width / 2 - img.width / 2;
            const y = canvas.height / 2 - img.height / 2;
            // Create a new ImageShape and add to shapes
            const imageShape = new ImageShape(x, y, img.width, img.height, img);
            shapes.push(imageShape);
          };
          img.src = evt.target.result;
        };
        reader.readAsDataURL(blob);
        // Only paste the first found image
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
    redrawCanvas();
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
function isPointNearPoint(x1, y1, x2, y2, threshold = 5) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy) <= threshold;
}

