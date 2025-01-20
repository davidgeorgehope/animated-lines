/**************************************************
 * main.js - Extended "Visio-like" Diagram Editor
 *           Now with GIF export using gif.js
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
  else if (currentTool === "select") {
    // Start dragging if shape is clicked
    const clickedShape = findShapeUnderMouse(x, y);
    if (clickedShape) {
      draggingShape = clickedShape;
      dragOffsetX = x - clickedShape.x;
      dragOffsetY = y - clickedShape.y;
    }
  }
});

// Mousemove
canvas.addEventListener("mousemove", (e) => {
  const { x, y } = getCanvasMousePos(e);

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
  const { x, y } = getCanvasMousePos(e);

  if (draggingShape) {
    draggingShape = null;
  }

  if (isDrawingLine) {
    // If we release on another shape, create an arrow
    const releasedShape = findShapeUnderMouse(x, y);
    if (releasedShape && releasedShape !== arrowStartShape) {
      arrows.push({ fromId: arrowStartShape.id, toId: releasedShape.id });
    }
    // Reset arrow drawing state
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
  // shape center
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
  ctx.strokeStyle = "#ff0000";
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
  ctx.fillStyle = "#ff0000";
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

// Start the animation loop
animate();

/**************************************************
 * End of main.js
 **************************************************/ 