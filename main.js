/**************************************************
 * main.js - Extended "Visio-like" Diagram Editor
 *           Now with GIF export using gif.js
 *           Now supporting image drag & drop
 **************************************************/

const canvas = document.getElementById("myCanvas");
const ctx = canvas.getContext("2d");

// Toolbar buttons
const selectBtn = document.getElementById("toolSelect");
const rectBtn = document.getElementById("toolRect");
const arrowBtn = document.getElementById("toolArrow");
const startGifBtn = document.getElementById("startGifBtn");
const stopGifBtn = document.getElementById("stopGifBtn");

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

// ============== GIF RECORDING VARS ===============
let isRecordingGIF = false;
let gif = null;  // will hold the GIF instance from gif.js

// --- ADD: Variables to track selection and resizing state ---
let selectedShape = null;        // which shape (if any) is selected
let isResizing = false;          // are we currently resizing a shape?
let resizeHandleIndex = -1;      // which handle is being dragged?
const HANDLE_SIZE = 8;           // size of each resize handle

// Reference the context menu div
const contextMenu = document.getElementById("context-menu");

// Hide the menu on any left-click
document.addEventListener("click", () => {
  contextMenu.style.display = "none";
});

// Right-click on the canvas
canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault(); // Prevent default browser menu

  // Get mouse position on the canvas
  const { x, y } = getCanvasMousePos(e);

  // Check if we right-clicked on a shape
  const shape = findShapeUnderMouse(x, y);

  // If we did, select it and show our context menu at the mouse location
  if (shape) {
    selectedShape = shape;
    contextMenu.style.left = e.pageX + "px";
    contextMenu.style.top = e.pageY + "px";
    contextMenu.style.display = "block";
  } else {
    // Otherwise, hide it
    contextMenu.style.display = "none";
  }
});

// Shape class
class Shape {
  constructor(x, y, w, h, text) {
    this.id = shapeCounter++;
    this.x = x;
    this.y = y;
    this.width = w;
    this.height = h;
    this.text = text;
  }

  draw(ctx) {
    ctx.fillStyle = "#e8f1fa";
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 2;
    ctx.fillRect(this.x, this.y, this.width, this.height);
    ctx.strokeRect(this.x, this.y, this.width, this.height);

    // Draw text
    ctx.fillStyle = "#000";
    ctx.font = "14px Arial";
    const metrics = ctx.measureText(this.text);
    const textX = this.x + (this.width - metrics.width) / 2;
    const textY = this.y + this.height / 2 + 5;
    ctx.fillText(this.text, textX, textY);
  }

  containsPoint(px, py) {
    return (
      px >= this.x &&
      px <= this.x + this.width &&
      py >= this.y &&
      py <= this.y + this.height
    );
  }

  // Returns the center of this rectangle
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
    // Let the parent constructor store x, y, width, height
    super(x, y, w, h, ""); 
    this.img = img;
  }

  draw(ctx) {
    if (!this.img) return;
    // Draw using the shape's current width & height so the user can resize
    ctx.drawImage(this.img, this.x, this.y, this.width, this.height);
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

// Start/Stop GIF recording
startGifBtn.addEventListener("click", startRecordingGIF);
stopGifBtn.addEventListener("click", stopRecordingGIF);

// ======== MOUSE EVENTS ========

// Mousedown
canvas.addEventListener("mousedown", (e) => {
  const { x, y } = getCanvasMousePos(e);

  // First, check if we're clicking on a resize handle of the currently selected shape
  if (selectedShape) {
    const handleIndex = getHandleIndexAtPos(selectedShape, x, y);
    if (handleIndex !== -1) {
      // We clicked on a handle: go into "resizing" mode
      isResizing = true;
      resizeHandleIndex = handleIndex;
      return;
    }
  }

  // If not clicking a handle, see if we're clicking on a shape to either select or drag
  const clickedShape = findShapeUnderMouse(x, y);
  if (clickedShape) {
    // If "select" tool is active, we might just select the shape...
    if (currentTool === "select") {
      // Set it as selected
      selectedShape = clickedShape;
      // Also prepare to drag if needed
      draggingShape = clickedShape;
      dragOffsetX = x - clickedShape.x;
      dragOffsetY = y - clickedShape.y;
    }
  } else {
    // If user clicks empty space, deselect anything
    selectedShape = null;
  }

  if (currentTool === "rect") {
    // Prompt for text
    const shapeText = prompt("Enter text for the rectangle:", "Shape");
    if (shapeText !== null) {
      // Create shape around the click position
      const newShape = new Shape(x - 50, y - 25, 100, 50, shapeText);
      shapes.push(newShape);
    }
  }
  else if (currentTool === "arrow") {
    // Check if we're clicking on a shape to begin drawing an arrow
    const clickedShape = findShapeUnderMouse(x, y);
    if (clickedShape) {
      isDrawingLine = true;
      arrowStartShape = clickedShape;
      arrowEndPos = { x, y };
    }
  }
});

// Mousemove
canvas.addEventListener("mousemove", (e) => {
  const { x, y } = getCanvasMousePos(e);

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
});

// Double-click => Edit shape text inline
canvas.addEventListener("dblclick", (e) => {
  const { x, y } = getCanvasMousePos(e);
  const shape = findShapeUnderMouse(x, y);
  if (shape) {
    // Position the editor near the shape
    shapeEditorInput.style.display = "block";
    shapeEditorInput.style.left = shape.x + "px";
    shapeEditorInput.style.top = (shape.y + shape.height + 5) + "px";
    shapeEditorInput.value = shape.text;
    shapeEditorInput.focus();

    // When user finishes editing
    shapeEditorInput.onkeydown = (evt) => {
      if (evt.key === "Enter") {
        shape.text = shapeEditorInput.value;
        clearEditor();
      }
    };
    shapeEditorInput.onblur = () => {
      shape.text = shapeEditorInput.value;
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
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
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

// Draw everything in an animation loop (for the dotted-line "marching" effect)
function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw shapes
  shapes.forEach((shape) => {
    shape.draw(ctx);
  });

  // Draw existing arrows
  arrows.forEach((arrow) => {
    const fromShape = shapes.find((s) => s.id === arrow.fromId);
    const toShape = shapes.find((s) => s.id === arrow.toId);
    if (fromShape && toShape) {
      // Find intersection points on each shape's edge
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
      drawArrow(ctx, fromPt.x, fromPt.y, toPt.x, toPt.y);
    }
  });

  // If currently drawing an arrow, draw the "rubber band" line
  if (isDrawingLine && arrowStartShape) {
    // from arrowStartShape edge to current mouse position
    const fromPt = getEdgeIntersection(
      arrowStartShape,
      arrowEndPos.x,
      arrowEndPos.y
    );
    // draw a temporary line to the mouse
    drawTempLine(ctx, fromPt.x, fromPt.y, arrowEndPos.x, arrowEndPos.y);
  }

  // --- ADD: If there's a selected shape, draw its resize handles ---
  if (selectedShape) {
    drawResizeHandles(ctx, selectedShape);
  }

  // Update dash offset
  dashOffset += 2;
  if (dashOffset > 10000) {
    dashOffset = 0;
  }

  // If recording, add this frame to the GIF
  if (isRecordingGIF && gif) {
    try {
      console.log("Adding frame to GIF");
      gif.addFrame(canvas, {
        copy: true,
        delay: 100
      });
    } catch (error) {
      console.error("Error adding frame:", error);
    }
  }

  requestAnimationFrame(animate);
}

// Draw a dotted arrow for a final connection
function drawArrow(ctx, fromX, fromY, toX, toY) {
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.lineDashOffset = -dashOffset;
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  drawArrowhead(ctx, fromX, fromY, toX, toY);
  ctx.restore();
}

// Draw a temporary dashed line (no arrowhead)
function drawTempLine(ctx, fromX, fromY, toX, toY) {
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.lineDashOffset = -dashOffset;
  ctx.strokeStyle = "blue";
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  ctx.restore();
}

// Basic arrowhead
function drawArrowhead(ctx, fromX, fromY, toX, toY) {
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
  ctx.fillStyle = "#000000";
  ctx.fill();
  ctx.restore();
}

// =========== GIF RECORDING LOGIC ===========

// Start capturing frames in our animation loop
function startRecordingGIF() {
  if (!isRecordingGIF) {
    console.log("Initializing GIF recorder...");
    try {
      gif = new GIF({
        workers: 1,
        quality: 10,
        width: canvas.width,
        height: canvas.height,
        workerScript: 'gif.worker.js'  // Local path
      });
      
      gif.on('progress', function(p) {
        console.log('GIF Progress: ' + Math.round(p * 100) + '%');
      });
      
      isRecordingGIF = true;
      console.log("Recording started successfully");
    } catch (error) {
      console.error("Error starting GIF recording:", error);
    }
  }
}

// Stop capturing and finalize the GIF
function stopRecordingGIF() {
  if (isRecordingGIF) {
    isRecordingGIF = false;
    console.log("Recording stopped. Rendering GIF...");

    // Render the GIF
    gif.on("finished", function(blob) {
      console.log("GIF rendering finished. Creating download link...");
      const url = URL.createObjectURL(blob);

      // Create a temporary link element to download the file
      const link = document.createElement("a");
      link.href = url;
      link.download = "diagram.gif";

      // Programmatically click the link to download
      link.click();

      // Cleanup references
      URL.revokeObjectURL(url);
      gif = null;
    });

    gif.render(); // start async rendering
  }
}

// ========== ADD: Canvas drag/drop listeners ==========
canvas.addEventListener("dragover", (e) => {
  e.preventDefault(); // Allow dropping
});

canvas.addEventListener("drop", (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();

  // Get where on the canvas the file is dropped
  const dropX = e.clientX - rect.left;
  const dropY = e.clientY - rect.top;

  const files = e.dataTransfer.files;
  if (!files || files.length === 0) return;

  const file = files[0];
  const fileReader = new FileReader();

  // Make sure it's an image
  if (!file.type.startsWith("image/")) {
    console.log("Dropped file is not an image.");
    return;
  }

  fileReader.onload = (evt) => {
    const img = new Image();
    img.onload = () => {
      // Use the natural width/height as a default. User can resize later.
      const imageShape = new ImageShape(dropX, dropY, img.width, img.height, img);
      shapes.push(imageShape);
    };
    img.src = evt.target.result;
  };

  fileReader.readAsDataURL(file);
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
  // Some browsers interpret "Backspace" differently; here we also handle "Delete" explicitly
  if ((e.key === "Delete" || e.key === "Backspace") && selectedShape) {
    removeShapeById(selectedShape.id);
    selectedShape = null; // Clear selection
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
        }
        contextMenu.style.display = "none";
    });
} 