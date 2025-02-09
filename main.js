/////////////////////////////////////////////////
// CanvasManager
/////////////////////////////////////////////////
class CanvasManager {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    this.scale = 1;
  }

  adjustCanvasZoom() {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;
    const scaleX = windowWidth / canvasWidth;
    const scaleY = windowHeight / canvasHeight;
    this.scale = Math.min(scaleX, scaleY);
    this.canvas.style.transformOrigin = "0 0";
    this.canvas.style.transform = `scale(${this.scale})`;
  }

  getMousePos(evt) {
    const rect = this.canvas.getBoundingClientRect();
    let scaleVal = 1;
    const transformValue = this.canvas.style.transform;
    if (transformValue) {
      const scaleMatch = transformValue.match(/scale\((.*?)\)/);
      if (scaleMatch && scaleMatch[1]) {
        scaleVal = parseFloat(scaleMatch[1]);
      }
    }
    return {
      x: (evt.clientX - rect.left) / scaleVal,
      y: (evt.clientY - rect.top) / scaleVal
    };
  }

  clearCanvas(color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

/////////////////////////////////////////////////
// Shape Classes
/////////////////////////////////////////////////
let shapeCounter = 0;

// Helper function for word wrap
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + " " + word).width;
    if (width < maxWidth) {
      currentLine += " " + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines;
}

class Shape {
  constructor(x, y, w, h, text) {
    this.id = shapeCounter++;
    this.x = x;
    this.y = y;
    this.width = w;
    this.height = h;
    this.text = text;
    this.fontSize = 14;
    this.fontFamily = "Arial";
    this.color = "#333";
    this.fillColor = "#e8f1fa";
    this.textColor = "#000";
    this.lineWidth = 2;
    this.isAnimated = false;
    this.opacity = 1;
    
    // Store last used colors for this shape
    this.lastUsedColors = {
      line: this.color,
      fill: this.fillColor,
      text: this.textColor
    };
  }

  // Time-based update (by default does nothing; override in subclasses if needed)
  update(dt) {
    // If you want to animate something about this shape over time, do it here.
    // e.g., if (this.isAnimated) { ... }
  }

  draw(ctx, dashOffset) {
    ctx.save();
    ctx.globalAlpha = this.opacity;
    ctx.fillStyle = this.fillColor;
    ctx.fillRect(this.x, this.y, this.width, this.height);
    
    if (this.isAnimated) {
      ctx.setLineDash([6, 4]);
      ctx.lineDashOffset = -(dashOffset % 10);
    } else {
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }
    
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.lineWidth;
    ctx.strokeRect(this.x, this.y, this.width, this.height);
    
    // Text rendering with word wrap
    ctx.fillStyle = this.textColor;
    ctx.font = `${this.fontSize}px ${this.fontFamily}`;
    const padding = 10; // Padding from edges
    const maxWidth = this.width - (padding * 2);
    const lines = wrapText(ctx, this.text, maxWidth);
    
    const lineHeight = this.fontSize * 1.2;
    const totalTextHeight = lines.length * lineHeight;
    let textY = this.y + (this.height - totalTextHeight) / 2 + this.fontSize;
    
    lines.forEach(line => {
      const textWidth = ctx.measureText(line).width;
      const textX = this.x + (this.width - textWidth) / 2;
      ctx.fillText(line, textX, textY);
      textY += lineHeight;
    });
    
    ctx.restore();
  }

  containsPoint(px, py) {
    return px >= this.x && px <= this.x + this.width && py >= this.y && py <= this.y + this.height;
  }

  getCenter() {
    return {
      x: this.x + this.width / 2,
      y: this.y + this.height / 2
    };
  }
}

class ImageShape extends Shape {
  constructor(x, y, w, h, img) {
    super(x, y, w, h, "");
    this.img = img;
  }

  update(dt) {
    // No time-based animation by default for images (unless you add something).
  }

  draw(ctx, dashOffset) {
    if (!this.img) return;
    ctx.save();
    ctx.globalAlpha = this.opacity;
    ctx.drawImage(this.img, this.x, this.y, this.width, this.height);
    ctx.restore();
  }

  containsPoint(px, py) {
    return px >= this.x && px <= this.x + this.width && py >= this.y && py <= this.y + this.height;
  }
}

class TextShape {
  constructor(x, y, text, fontSize = 14, fontFamily = "Arial") {
    this.id = shapeCounter++;
    this.x = x;
    this.y = y;
    this.text = text;
    this.fontSize = fontSize;
    this.fontFamily = fontFamily;
    this.textColor = "#000";
    const tempCtx = document.createElement("canvas").getContext("2d");
    tempCtx.font = `${this.fontSize}px ${this.fontFamily}`;
    const metrics = tempCtx.measureText(this.text);
    this.width = metrics.width;
    this.height = this.fontSize;
    this.opacity = 1;
    this.isAnimated = false;
    this.color = "#333"; // Not really used here
    this.fillColor = "#e8f1fa"; // Not used for text
    this.lineWidth = 2; // Not used
    this.lastUsedColors = {
      line: this.color,
      fill: this.fillColor,
      text: this.textColor
    };
  }

  update(dt) {
    // If needed, animate text over time
  }

  draw(ctx, dashOffset) {
    ctx.save();
    ctx.fillStyle = this.textColor;
    ctx.globalAlpha = this.opacity;
    ctx.font = `${this.fontSize}px ${this.fontFamily}`;
    ctx.textAlign = "center";      // Use canvas API to center align text horizontally
    ctx.textBaseline = "middle";   // Adjust vertical alignment if desired

    // Wrap the text using the provided helper
    const lines = wrapText(ctx, this.text, this.width);
    const lineHeight = this.fontSize * 1.2;
    this.height = lines.length * lineHeight;
    
    // Determine horizontal center
    // You can also adjust vertical position if you want to center the text block vertically within the shape
    const centerX = this.x + this.width / 2;
    
    // For simplicity, display from the top of the shape.
    // If you need full vertical centering, you can compute an offset too.
    let y = this.y + this.fontSize;
    
    lines.forEach(line => {
      ctx.fillText(line, centerX, y);
      y += lineHeight;
    });
    
    ctx.restore();
  }

  containsPoint(px, py) {
    return px >= this.x && 
           px <= this.x + this.width && 
           py >= this.y && 
           py <= this.y + this.height;
  }

  getCenter() {
    return {
      x: this.x + this.width / 2,
      y: this.y + this.height / 2
    };
  }
}

class AnimatedGifShape {
  constructor(x, y, frames, speedMultiplier = 1) {
    this.id = shapeCounter++;
    this.x = x;
    this.y = y;
    this.frames = frames;
    this.speedMultiplier = speedMultiplier;
    this.currentFrameIndex = 0;
    this.backgroundCanvas = document.createElement("canvas");
    this.backgroundCtx = this.backgroundCanvas.getContext("2d", {
      willReadFrequently: true,
      alpha: true
    });
    this.width = Math.max(...frames.map(f => f.dims.width + f.dims.left));
    this.height = Math.max(...frames.map(f => f.dims.height + f.dims.top));
    this.backgroundCanvas.width = this.width;
    this.backgroundCanvas.height = this.height;
    this.opacity = 1;
    this.isAnimated = true; // <-- Set this to true so frames update

    // For consistent shape styling (unused, but included for parallels)
    this.color = "#333";
    this.fillColor = "#e8f1fa";
    this.textColor = "#000";
    this.lineWidth = 2;
    this.lastUsedColors = {
      line: this.color,
      fill: this.fillColor,
      text: this.textColor
    };

    // We'll accumulate elapsed time to know when to switch frames
    this.accumulatedTime = 0;

    this.preRenderFrames();
  }
  getTotalLoopTime() {
    // Sum all frame delays for a single loop
    return this.imageFrames.reduce(
      (acc, f) => acc + (f.delay || 100),
      0
    );
  }
  resetAnimation() {
    this.currentFrameIndex = 0;
    this.accumulatedTime = 0;
    this.backgroundCtx.clearRect(0, 0, this.width, this.height);
  }
  preRenderFrames() {
    this.imageFrames = this.frames.map(frame => {
      const { dims, patch } = frame;
      const frameCanvas = document.createElement("canvas");
      frameCanvas.width = this.width;
      frameCanvas.height = this.height;
      const frameCtx = frameCanvas.getContext("2d", { willReadFrequently: true, alpha: true });
      frameCtx.imageSmoothingEnabled = false;
      const patchCanvas = document.createElement("canvas");
      patchCanvas.width = dims.width;
      patchCanvas.height = dims.height;
      const patchCtx = patchCanvas.getContext("2d");
      patchCtx.imageSmoothingEnabled = false;
      const imageData = new ImageData(new Uint8ClampedArray(patch), dims.width, dims.height);
      patchCtx.putImageData(imageData, 0, 0);
      frameCtx.drawImage(patchCanvas, dims.left, dims.top);
      return {
        canvas: frameCanvas,
        dims: dims,
        delay: frame.delay ? frame.delay / this.speedMultiplier : 100,
        disposalType: frame.disposalType || 2
      };
    });
  }

  update(dt) {
    // Only advance frames if shape is actually "animated"
    if (!this.isAnimated || !this.imageFrames.length) return;

    // Accumulate dt in milliseconds
    this.accumulatedTime += dt;

    const currentFrame = this.imageFrames[this.currentFrameIndex];
    const delayMs = currentFrame.delay || 100;

    // When we've exceeded the frame delay, move to the next frame
    while (this.accumulatedTime > delayMs) {
      this.accumulatedTime -= delayMs;

      // If disposalType === 2, clear that part from background
      if (currentFrame.disposalType === 2) {
        this.backgroundCtx.clearRect(
          currentFrame.dims.left,
          currentFrame.dims.top,
          currentFrame.dims.width,
          currentFrame.dims.height
        );
      }

      // Move to next frame
      this.currentFrameIndex = (this.currentFrameIndex + 1) % this.imageFrames.length;
    }
  }

  draw(ctx, dashOffset) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = this.opacity;

    // Draw background from previous frames
    ctx.drawImage(this.backgroundCanvas, this.x, this.y, this.width, this.height);

    // Draw the current frame
    const frame = this.imageFrames[this.currentFrameIndex];
    if (frame) {
      ctx.drawImage(frame.canvas, this.x, this.y, this.width, this.height);

      // If disposal is not "clear," we paint onto the background
      if (frame.disposalType !== 2) {
        this.backgroundCtx.drawImage(frame.canvas, 0, 0);
      }
    }
    ctx.restore();
  }

  containsPoint(px, py) {
    return px >= this.x && px <= this.x + this.width && py >= this.y && py <= this.y + this.height;
  }

  getCenter() {
    return {
      x: this.x + this.width / 2,
      y: this.y + this.height / 2
    };
  }
}

/////////////////////////////////////////////////
// ShapeManager
/////////////////////////////////////////////////
class ShapeManager {
  constructor() {
    this.shapes = [];
  }

  addShape(shape) {
    this.shapes.push(shape);
  }

  removeShapeById(id) {
    this.shapes = this.shapes.filter(s => s.id !== id);
  }

  findShapeById(id) {
    return this.shapes.find(s => s.id === id);
  }

  findShapeUnderMouse(x, y) {
    for (let i = this.shapes.length - 1; i >= 0; i--) {
      if (this.shapes[i].containsPoint(x, y)) {
        return this.shapes[i];
      }
    }
    return null;
  }
}

/////////////////////////////////////////////////
// ArrowManager
/////////////////////////////////////////////////
function isPointNearLine(px, py, x1, y1, x2, y2, threshold = 10) {
  const minX = Math.min(x1, x2) - threshold;
  const maxX = Math.max(x1, x2) + threshold;
  const minY = Math.min(y1, y2) - threshold;
  const maxY = Math.max(y1, y2) + threshold;
  if (px < minX || px > maxX || py < minY || py > maxY) {
    return false;
  }
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2) <= threshold;
  }
  const t = ((px - x1) * dx + (py - y1) * dy) / (dx ** 2 + dy ** 2);
  const clampedT = Math.max(0, Math.min(1, t));
  const closestX = x1 + clampedT * dx;
  const closestY = y1 + clampedT * dy;
  const distance = Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
  return distance <= threshold;
}

class ArrowManager {
  constructor() {
    this.arrows = [];
    this.ARROW_HANDLE_SIZE = 10;
  }

  addArrow(arrow) {
    this.arrows.push(arrow);
  }

  removeArrow(arrow) {
    const idx = this.arrows.indexOf(arrow);
    if (idx !== -1) {
      this.arrows.splice(idx, 1);
    }
  }

  findArrowUnderMouse(x, y, getArrowSegmentsFunc) {
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const arrow = this.arrows[i];
      const segments = getArrowSegmentsFunc(arrow);
      for (let seg of segments) {
        if (isPointNearLine(x, y, seg.x1, seg.y1, seg.x2, seg.y2, 15)) {
          return arrow;
        }
      }
    }
    return null;
  }
}

/////////////////////////////////////////////////
// HistoryManager
/////////////////////////////////////////////////
class HistoryManager {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
    this.maxStackSize = 50;
  }

  execute(command) {
    command.execute();
    this.undoStack.push(command);
    this.redoStack = [];
    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack.shift();
    }
    this.updateButtonStates();
  }

  undo() {
    if (!this.undoStack.length) return;
    const command = this.undoStack.pop();
    command.undo();
    this.redoStack.push(command);
    this.updateButtonStates();
  }

  redo() {
    if (!this.redoStack.length) return;
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
    const undoBtn = document.getElementById("undoBtn");
    const redoBtn = document.getElementById("redoBtn");
    if (undoBtn) undoBtn.disabled = this.undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = this.redoStack.length === 0;
  }
}

class Command {
  execute() {}
  undo() {}
}

class AddShapeCommand extends Command {
  constructor(shape, shapeManager) {
    super();
    this.shape = shape;
    this.shapeManager = shapeManager;
  }

  execute() {
    this.shapeManager.addShape(this.shape);
  }

  undo() {
    this.shapeManager.removeShapeById(this.shape.id);
  }
}

class DeleteShapeCommand extends Command {
  constructor(shape, shapeManager, arrowManager) {
    super();
    this.shape = shape;
    this.shapeManager = shapeManager;
    this.arrowManager = arrowManager;
    this.affectedArrows = [];
  }

  execute() {
    this.affectedArrows = [];
    const shapeId = this.shape.id;
    for (let ar of this.arrowManager.arrows) {
      if (ar.fromId === shapeId || ar.toId === shapeId) {
        this.affectedArrows.push(ar);
      }
    }
    this.shapeManager.removeShapeById(shapeId);
    this.arrowManager.arrows = this.arrowManager.arrows.filter(
      a => a.fromId !== shapeId && a.toId !== shapeId
    );
  }

  undo() {
    this.shapeManager.addShape(this.shape);
    for (let ar of this.affectedArrows) {
      this.arrowManager.addArrow(ar);
    }
  }
}

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
  }

  undo() {
    this.shape.x = this.oldX;
    this.shape.y = this.oldY;
  }
}

class AddArrowCommand extends Command {
  constructor(arrow, arrowManager) {
    super();
    this.arrow = arrow;
    this.arrowManager = arrowManager;
  }

  execute() {
    this.arrowManager.addArrow(this.arrow);
  }

  undo() {
    this.arrowManager.removeArrow(this.arrow);
  }
}

class DeleteArrowCommand extends Command {
  constructor(arrow, arrowManager) {
    super();
    this.arrow = arrow;
    this.arrowManager = arrowManager;
  }

  execute() {
    this.arrowManager.removeArrow(this.arrow);
  }

  undo() {
    this.arrowManager.addArrow(this.arrow);
  }
}

class ModifyTextCommand extends Command {
  constructor(shape, oldText, newText) {
    super();
    this.shape = shape;
    this.oldText = oldText;
    this.newText = newText;
  }

  execute() {
    this.shape.text = this.newText;
  }

  undo() {
    this.shape.text = this.oldText;
  }
}

/////////////////////////////////////////////////
// GifExporter Class
/////////////////////////////////////////////////
class GifExporter {
  constructor(canvas, onProgress, onFinished) {
    this.canvas = canvas;
    this.gif = new GIF({
      workers: 2,
      quality: 7,
      width: canvas.width,
      height: canvas.height,
      workerScript: "gif.worker.js"
    });
    this.gif.on("progress", p => {
      if (onProgress) onProgress(p);
    });
    this.gif.on("finished", blob => {
      if (onFinished) onFinished(blob);
    });
  }

  addFrame(delay = 100) {
    this.gif.addFrame(this.canvas, { copy: true, delay });
  }

  render() {
    this.gif.render();
  }
}

/////////////////////////////////////////////////
// Main Animation Variables
/////////////////////////////////////////////////
const HANDLE_SIZE = 8;
let dashOffset = 0;
let canvasBgColor = "#ffffff";
let freeArrows = [];
let isDrawingFreeArrow = false;
let freeArrowStart = null;
let currentFreeArrowPos = null;
let isDraggingArrowHandle = false;
let draggedHandle = null;
let selectedWaypointIndex = -1;
let isDraggingWaypoint = false;
let isDraggingEndpoint = false;
let selectedShape = null;
let isResizing = false;
let resizeHandleIndex = -1;
let selectedArrow = null;
let hoveredArrow = null;
let isDraggingArrow = false;
let dragStartX = 0;
let dragStartY = 0;
let currentTool = "select";
let draggingShape = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let isDrawingLine = false;
let arrowStartShape = null;
let arrowEndPos = { x: 0, y: 0 };

let canvas, ctx;
let shapeManager, arrowManager, historyManager;
let shapeEditorInput;
let arrowColorPicker, fillColorPicker, lineThicknessPicker, fontSizeSelect, fontFamilySelect;
let textColorPicker;

/////////////////////////////////////////////////
// Setup & Init
/////////////////////////////////////////////////
document.addEventListener("DOMContentLoaded", () => {
  canvas = document.getElementById("myCanvas");
  ctx = canvas.getContext("2d", { willReadFrequently: true });
  const cManager = new CanvasManager(canvas);
  cManager.adjustCanvasZoom();
  window.addEventListener("resize", () => cManager.adjustCanvasZoom());

  shapeManager = new ShapeManager();
  arrowManager = new ArrowManager();
  historyManager = new HistoryManager();

  shapeEditorInput = document.getElementById("shapeEditor");
  arrowColorPicker = document.getElementById("arrowColorPicker");
  fillColorPicker = document.getElementById("fillColorPicker");
  lineThicknessPicker = document.getElementById("lineThicknessPicker");
  fontSizeSelect = document.getElementById("fontSizeSelect");
  fontFamilySelect = document.getElementById("fontFamilySelect");
  textColorPicker = document.getElementById("textColorPicker");

  document.getElementById("toolSelect").addEventListener("click", () => {
    currentTool = "select";
    clearEditor();
  });
  document.getElementById("toolRect").addEventListener("click", () => {
    currentTool = "rect";
    clearEditor();
  });
  document.getElementById("toolArrow").addEventListener("click", () => {
    currentTool = "arrow";
    clearEditor();
  });
  document.getElementById("toolFreeArrow").addEventListener("click", () => {
    currentTool = "freeArrow";
    clearEditor();
  });
  document.getElementById("toolText").addEventListener("click", () => {
    currentTool = "text";
    clearEditor();
  });

  document.getElementById("exportGifBtn").addEventListener("click", exportAnimatedGif);
  document.getElementById("saveBtn").addEventListener("click", saveDiagram);
  document.getElementById("loadBtn").addEventListener("click", loadDiagramFromFile);

  arrowColorPicker.addEventListener("input", e => {
    if (selectedArrow) {
      selectedArrow.color = e.target.value;
    } else if (selectedShape) {
      selectedShape.color = e.target.value;
      selectedShape.lastUsedColors.line = e.target.value;
    }
    // no direct draw call; the main loop handles it
  });

  fillColorPicker.addEventListener("input", e => {
    if (selectedShape) {
      if (selectedShape instanceof TextShape) return;
      if (selectedShape instanceof ImageShape) return;
      if (selectedShape instanceof AnimatedGifShape) return;
      selectedShape.fillColor = e.target.value;
      selectedShape.lastUsedColors.fill = e.target.value;
    }
  });

  lineThicknessPicker.addEventListener("input", e => {
    if (selectedArrow) {
      selectedArrow.lineWidth = parseInt(e.target.value);
    } else if (selectedShape) {
      selectedShape.lineWidth = parseInt(e.target.value);
    }
  });

  textColorPicker.addEventListener("input", e => {
    if (selectedShape) {
      if (selectedShape instanceof ImageShape) return;
      if (selectedShape instanceof AnimatedGifShape) return;
      selectedShape.textColor = e.target.value;
      selectedShape.lastUsedColors.text = e.target.value;
    }
  });

  const canvasColorPicker = document.getElementById("canvasColorPicker");
  if (canvasColorPicker) {
    canvasColorPicker.addEventListener("input", e => {
      canvasBgColor = e.target.value;
    });
  }

  document.getElementById("opacityRange").addEventListener("input", e => {
    if (selectedShape) {
      selectedShape.opacity = parseFloat(e.target.value);
    }
  });

  document.getElementById("animatedBorderBtn").addEventListener("click", e => {
    if (!selectedShape) return;
    selectedShape.isAnimated = !selectedShape.isAnimated;
    e.target.textContent = selectedShape.isAnimated ? "On" : "Off";
  });

  document.getElementById("btnRemoveWhite").addEventListener("click", removeWhiteBG);
  document.getElementById("btnRemoveColor").addEventListener("click", removeColorBG);
  document.getElementById("toggleCurveBtn").addEventListener("click", e => {
    if (selectedArrow) {
      selectedArrow.curve = !selectedArrow.curve;
      e.target.textContent = selectedArrow.curve ? "Curve" : "Straight";
    }
  });

  const undoBtn = document.getElementById("undoBtn");
  undoBtn.addEventListener("click", () => {
    historyManager.undo();
  });
  const redoBtn = document.getElementById("redoBtn");
  redoBtn.addEventListener("click", () => {
    historyManager.redo();
  });

  // Canvas event listeners
  canvas.addEventListener("mousedown", onCanvasMouseDown);
  canvas.addEventListener("mousemove", onCanvasMouseMove);
  canvas.addEventListener("mouseup", onCanvasMouseUp);
  canvas.addEventListener("dblclick", onCanvasDblClick);
  document.addEventListener("keydown", onDocKeyDown);
  document.addEventListener("click", () => {
    const contextMenu = document.getElementById("context-menu");
    contextMenu.style.display = "none";
    hoveredArrow = null;
    canvas.style.cursor = "default";
  });
  canvas.addEventListener("contextmenu", e => {
    e.preventDefault();
    const shape = shapeManager.findShapeUnderMouse(
      cManager.getMousePos(e).x,
      cManager.getMousePos(e).y
    );
    if (shape) {
      selectedShape = shape;
      const menu = document.getElementById("context-menu");
      menu.style.left = e.clientX + "px";
      menu.style.top = e.clientY + "px";
      menu.style.display = "block";
    }
  });

  document.getElementById("ctx-bring-forward").addEventListener("click", () => {
    if (selectedShape) {
      bringShapeForward(selectedShape);
    }
    document.getElementById("context-menu").style.display = "none";
  });

  document.getElementById("ctx-send-backward").addEventListener("click", () => {
    if (selectedShape) {
      sendShapeBackward(selectedShape);
    }
    document.getElementById("context-menu").style.display = "none";
  });

  document.getElementById("ctx-bring-front").addEventListener("click", () => {
    if (selectedShape) {
      bringShapeToFront(selectedShape);
    }
    document.getElementById("context-menu").style.display = "none";
  });

  document.getElementById("ctx-send-back").addEventListener("click", () => {
    if (selectedShape) {
      sendShapeToBack(selectedShape);
    }
    document.getElementById("context-menu").style.display = "none";
  });

  document.getElementById("ctx-delete").addEventListener("click", () => {
    if (selectedShape) {
      historyManager.execute(
        new DeleteShapeCommand(selectedShape, shapeManager, arrowManager)
      );
      selectedShape = null;
    } else if (selectedArrow) {
      historyManager.execute(new DeleteArrowCommand(selectedArrow, arrowManager));
      selectedArrow = null;
    }
    document.getElementById("context-menu").style.display = "none";
  });

  document.addEventListener("paste", onDocPaste);

  canvas.addEventListener("dragover", e => {
    e.preventDefault();
  });
  canvas.addEventListener("drop", onCanvasDrop);

  // Start the main animation loop
  requestAnimationFrame(mainLoop);

  fontSizeSelect.addEventListener("change", e => {
    if (selectedShape) {
      selectedShape.fontSize = parseInt(e.target.value);
      if (selectedShape instanceof TextShape) {
        // recalc text shape width
        const tempCtx = document.createElement("canvas").getContext("2d");
        tempCtx.font = `${selectedShape.fontSize}px ${selectedShape.fontFamily}`;
        const metrics = tempCtx.measureText(selectedShape.text);
        selectedShape.width = metrics.width;
        selectedShape.height = selectedShape.fontSize;
      }
    }
  });

  fontFamilySelect.addEventListener("change", e => {
    if (selectedShape) {
      selectedShape.fontFamily = e.target.value;
      if (selectedShape instanceof TextShape) {
        // recalc text shape width
        const tempCtx = document.createElement("canvas").getContext("2d");
        tempCtx.font = `${selectedShape.fontSize}px ${selectedShape.fontFamily}`;
        const metrics = tempCtx.measureText(selectedShape.text);
        selectedShape.width = metrics.width;
        selectedShape.height = selectedShape.fontSize;
      }
    }
  });
});

/////////////////////////////////////////////////
// Main Loop: Time-Based Animation
/////////////////////////////////////////////////
let lastTime = 0;
function mainLoop(timestamp) {
  const dt = timestamp - lastTime; // dt in ms
  lastTime = timestamp;

  // 1) Update
  update(dt);

  // 2) Draw
  drawAll();

  // Keep going
  requestAnimationFrame(mainLoop);
}

function update(dt) {
  // Convert dt to milliseconds. dt is already ms from rAF, so no conversion needed
  // If you want dashOffset to move at e.g. 0.02 px per ms:
  dashOffset += 0.02 * dt;

  // Update each shape (some shapes might animate)
  shapeManager.shapes.forEach(shape => shape.update(dt));
}

function drawAll() {
  // Clear canvas
  ctx.fillStyle = canvasBgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw shapes
  shapeManager.shapes.forEach(s => {
    s.draw(ctx, dashOffset);
  });

  // Draw arrows
  arrowManager.arrows.forEach(arrow => {
    drawArrowFull(ctx, arrow);
  });

  // Temporary line if user is in the middle of drawing an arrow
  if (isDrawingLine && arrowStartShape) {
    const fromPt = getEdgeIntersection(arrowStartShape, arrowEndPos.x, arrowEndPos.y);
    drawTempLine(ctx, fromPt.x, fromPt.y, arrowEndPos.x, arrowEndPos.y);
  }

  // Temporary free arrow if in the middle of drawing one
  if (isDrawingFreeArrow && freeArrowStart && currentFreeArrowPos) {
    drawArrowFull(ctx, {
      fromId: undefined,
      toId: undefined,
      fromX: freeArrowStart.x,
      fromY: freeArrowStart.y,
      toX: currentFreeArrowPos.x,
      toY: currentFreeArrowPos.y,
      color: arrowColorPicker.value,
      lineWidth: parseInt(lineThicknessPicker.value) || 2
    });
  }

  // Draw resize handles if a shape is selected
  if (selectedShape) {
    drawResizeHandles(ctx, selectedShape);
  }

  // Draw arrow handles if an arrow is selected
  if (selectedArrow) {
    drawArrowSelectionHandles(ctx, selectedArrow);
  }
}

function exportAnimatedGif() {
  // First, reset all animated GIF shapes
  shapeManager.shapes.forEach(s => {
    if (s instanceof AnimatedGifShape) {
      s.resetAnimation();
    }
  });

  // Find maximum single-loop time among *all* AnimatedGifShape objects
  let maxLoopTime = 0;
  shapeManager.shapes.forEach(s => {
    if (s instanceof AnimatedGifShape) {
      const loopTime = s.getTotalLoopTime();
      if (loopTime > maxLoopTime) {
        maxLoopTime = loopTime;
      }
    }
  });

  // If there are no GIF shapes, fallback to a default
  if (maxLoopTime === 0) {
    maxLoopTime = 2000; // 2 seconds, for instance
  }

  // Decide FPS for the exported GIF
  const fps = 15;
  const frameDelay = 1000 / fps;  // ~66ms
  // We want exactly 1 cycle (or 2 cycles, etc.). Let's do 1 cycle for simplicity:
  const totalDurationMs = maxLoopTime; // do exactly one loop
  const totalFrames = Math.round(totalDurationMs / frameDelay);

  // Create the GifExporter
  const gifExporter = new GifExporter(canvas, p => {
    // progress
  }, blob => {
    // finished callback
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "animated_diagram.gif";
    link.click();
    URL.revokeObjectURL(url);
  });

  // We'll store dashOffset and lastTime if you want to restore them
  const oldDashOffset = dashOffset;
  const oldLastTime = lastTime;

  // Do the offline recording
  for (let f = 0; f < totalFrames; f++) {
    update(frameDelay);  // step the scene
    drawAll();           // render to canvas
    gifExporter.addFrame(frameDelay);
  }

  gifExporter.render();

  // Optionally restore offsets
  dashOffset = oldDashOffset;
  lastTime = oldLastTime;
}


/////////////////////////////////////////////////
// Offline GIF Export
/////////////////////////////////////////////////
function exportAnimatedGifOld() {
  // We do an "offline" approach: step the entire animation at a fixed rate
  // and add frames to a new GIF, guaranteeing consistent playback timing.

  // 1. Create a new GifExporter
  const gifExporter = new GifExporter(
    canvas,
    p => { /* progress callback if you want it */ },
    blob => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "animated_diagram.gif";
      link.click();
      URL.revokeObjectURL(url);
    }
  );

  // Decide how long to record, at what FPS, etc.
  // Example: record 2 seconds at 15 fps
  const totalDurationMs = 2000;  // 2 seconds
  const fps = 15;
  const frameDelay = 1000 / fps; // each frame gets 1000/15 ~ 66.6 ms
  const totalFrames = Math.round(totalDurationMs / frameDelay);

  // We'll store the old dashOffset and shape states, so we can restore after
  const oldDashOffset = dashOffset;
  const oldLastTime = lastTime; // might not matter, but let's store it

  // Also store the original isAnimated flags if you want
  // (some might want to forcibly animate everything, but we assume shapes with isAnimated = true only)
  // We'll just keep them as is.

  // We do a quick offline loop
  for (let f = 0; f < totalFrames; f++) {
    // 1) Update all shapes by frameDelay
    update(frameDelay); 
    // 2) Draw to the canvas
    drawAll();
    // 3) Add frame to GIF
    gifExporter.addFrame(frameDelay);
  }

  // Finish
  gifExporter.render();

  // Optional: restore dashOffset or lastTime if needed
  dashOffset = oldDashOffset;
  lastTime = oldLastTime;
}

/////////////////////////////////////////////////
// Other Functions (Arrows, Resizing, UI events)
/////////////////////////////////////////////////
function drawTempLine(context, x1, y1, x2, y2) {
  context.save();
  context.setLineDash([6, 4]);
  context.lineDashOffset = -(dashOffset % 10);
  context.strokeStyle = "blue";
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
  context.restore();
}

function drawArrowFull(context, arrow) {
  context.save();
  // Thicken line if hovered or selected
  if (arrow === hoveredArrow || arrow === selectedArrow) {
    context.lineWidth = (arrow.lineWidth || 2) + 2;
  } else {
    context.lineWidth = arrow.lineWidth || 2;
  }
  context.setLineDash([6, 4]);
  context.lineDashOffset = -(dashOffset % 10);
  context.strokeStyle = arrow.color || "#000";
  context.beginPath();
  let startPoint = { x: arrow.fromX, y: arrow.fromY };
  let endPoint = { x: arrow.toX, y: arrow.toY };
  if (arrow.fromId !== undefined) {
    const fromShape = shapeManager.findShapeById(arrow.fromId);
    const toShape = shapeManager.findShapeById(arrow.toId);
    if (fromShape && toShape) {
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
    }
  }
  let points = [startPoint];
  if (arrow.waypoints && arrow.waypoints.length) {
    points.push(...arrow.waypoints);
  }
  points.push(endPoint);

  if (arrow.curve && points.length >= 2) {
    let curvePoints = getCatmullRomCurvePoints(points, 20);
    context.moveTo(points[0].x, points[0].y);
    curvePoints.forEach(pt => context.lineTo(pt.x, pt.y));
  } else {
    context.moveTo(startPoint.x, startPoint.y);
    if (arrow.waypoints && arrow.waypoints.length) {
      arrow.waypoints.forEach(pt => context.lineTo(pt.x, pt.y));
    }
    context.lineTo(endPoint.x, endPoint.y);
  }
  context.stroke();
  drawArrowhead(
    context,
    (arrow.waypoints && arrow.waypoints.length) ? arrow.waypoints[arrow.waypoints.length - 1].x : startPoint.x,
    (arrow.waypoints && arrow.waypoints.length) ? arrow.waypoints[arrow.waypoints.length - 1].y : startPoint.y,
    endPoint.x,
    endPoint.y,
    arrow.color
  );
  if (selectedArrow === arrow) {
    drawWaypointHandles(context, arrow);
  }
  context.restore();
}

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
  [
    intersectSide(left, true),
    intersectSide(right, true),
    intersectSide(top, false),
    intersectSide(bottom, false)
  ].forEach(pt => { if (pt) candidates.push(pt); });
  if (!candidates.length) {
    return center;
  }
  let best = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i].t < best.t) {
      best = candidates[i];
    }
  }
  return { x: best.x, y: best.y };
}

function drawWaypointHandles(ctx, arrow) {
  if (!arrow.waypoints || !arrow.waypoints.length) return;
  ctx.save();
  ctx.fillStyle = "blue";
  ctx.strokeStyle = "white";
  arrow.waypoints.forEach(pt => {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, arrowManager.ARROW_HANDLE_SIZE, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
}

function drawArrowSelectionHandles(ctx, arrow) {
  if (!arrow) return;
  ctx.save();
  const handleSize = arrowManager.ARROW_HANDLE_SIZE * 1.5;
  let fromX, fromY, toX, toY;
  if (arrow.fromId !== undefined) {
    const fromShape = shapeManager.findShapeById(arrow.fromId);
    const toShape = shapeManager.findShapeById(arrow.toId);
    if (!fromShape || !toShape) return;
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
    fromX = arrow.fromX;
    fromY = arrow.fromY;
    toX = arrow.toX;
    toY = arrow.toY;
  }
  ctx.fillStyle = "green";
  ctx.strokeStyle = "white";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(fromX, fromY, handleSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "red";
  ctx.beginPath();
  ctx.arc(toX, toY, handleSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawResizeHandles(ctx, shape) {
  const handles = getResizeHandles(shape);
  ctx.save();
  ctx.fillStyle = "red";
  handles.forEach(h => {
    ctx.fillRect(h.x - HANDLE_SIZE / 2, h.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
  });
  ctx.restore();
}

function getResizeHandles(shape) {
  const handles = [];
  const { x, y, width, height } = shape;
  handles.push({ x: x, y: y });
  handles.push({ x: x + width, y: y });
  handles.push({ x: x, y: y + height });
  handles.push({ x: x + width, y: y + height });
  return handles;
}

function getHandleIndexAtPos(shape, mx, my) {
  const handles = getResizeHandles(shape);
  for (let i = 0; i < handles.length; i++) {
    const hx = handles[i].x;
    const hy = handles[i].y;
    if (
      mx >= hx - HANDLE_SIZE / 2 &&
      mx <= hx + HANDLE_SIZE / 2 &&
      my >= hy - HANDLE_SIZE / 2 &&
      my <= hy + HANDLE_SIZE / 2
    ) {
      return i;
    }
  }
  return -1;
}

function resizeShape(shape, handleIndex, mx, my) {
  const { x, y, width, height } = shape;
  let newWidth = width;
  let newHeight = height;
  switch (handleIndex) {
    case 0:
      newWidth = width + (x - mx);
      newHeight = height + (y - my);
      shape.x = mx;
      shape.y = my;
      break;
    case 1:
      newWidth = mx - x;
      newHeight = height + (y - my);
      shape.y = my;
      break;
    case 2:
      newWidth = width + (x - mx);
      newHeight = my - y;
      shape.x = mx;
      break;
    case 3:
      newWidth = mx - x;
      newHeight = my - y;
      break;
  }
  shape.width = Math.max(newWidth, 20);
  shape.height = Math.max(newHeight, 20);
}

// Basic Catmull-Rom curve for arrow path
function getCatmullRomCurvePoints(pts, numSegments) {
  let curvePts = [];
  for (let i = 0; i < pts.length - 1; i++) {
    let p0 = i === 0 ? pts[i] : pts[i - 1];
    let p1 = pts[i];
    let p2 = pts[i + 1];
    let p3 = (i + 2 < pts.length) ? pts[i + 2] : p2;
    for (let t = 0; t <= 1; t += 1 / numSegments) {
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
      curvePts.push({ x, y });
    }
  }
  return curvePts;
}

function onCanvasMouseDown(e) {
  const pos = getMousePosScaled(e);
  const mx = pos.x;
  const my = pos.y;

  // If arrow has a selected waypoint, check for grabbing it
  if (selectedArrow && selectedArrow.waypoints && selectedArrow.waypoints.length) {
    for (let i = 0; i < selectedArrow.waypoints.length; i++) {
      if (isPointNearPoint(mx, my, selectedArrow.waypoints[i].x, selectedArrow.waypoints[i].y, arrowManager.ARROW_HANDLE_SIZE)) {
        selectedWaypointIndex = i;
        return;
      }
    }
  }

  // Check if clicked arrow endpoints
  if (currentTool === "select") {
    for (let arrow of arrowManager.arrows) {
      if (arrow.fromId === undefined) {
        if (isPointNearPoint(mx, my, arrow.fromX, arrow.fromY, arrowManager.ARROW_HANDLE_SIZE)) {
          selectedArrow = arrow;
          isDraggingArrowHandle = true;
          draggedHandle = "start";
          return;
        }
        if (isPointNearPoint(mx, my, arrow.toX, arrow.toY, arrowManager.ARROW_HANDLE_SIZE)) {
          selectedArrow = arrow;
          isDraggingArrowHandle = true;
          draggedHandle = "end";
          return;
        }
      }
    }
  }

  // If not dragging endpoint, try selecting arrow body
  if (currentTool === "select") {
    const clickedArrow = arrowManager.findArrowUnderMouse(mx, my, getArrowSegments);
    if (clickedArrow) {
      selectedArrow = clickedArrow;
      selectedShape = null;
      updateShapeControls();
      isDraggingArrow = true;
      dragStartX = mx;
      dragStartY = my;
      return;
    }
  }

  // Free arrow drawing
  if (currentTool === "freeArrow") {
    isDrawingFreeArrow = true;
    freeArrowStart = { x: mx, y: my };
    currentFreeArrowPos = { x: mx, y: my };
    return;
  }

  // Resizing shape?
  if (selectedShape) {
    const hIdx = getHandleIndexAtPos(selectedShape, mx, my);
    if (hIdx !== -1) {
      isResizing = true;
      resizeHandleIndex = hIdx;
      return;
    }
  }
  
  // If we clicked a shape
  const clickedShape = shapeManager.findShapeUnderMouse(mx, my);
  if (clickedShape) {
    if (currentTool === "select") {
      selectedArrow = null;
      selectedShape = clickedShape;
      draggingShape = clickedShape;
      dragOffsetX = mx - clickedShape.x;
      dragOffsetY = my - clickedShape.y;
      updateShapeControls(clickedShape);
      return;
    }
  } else {
    selectedShape = null;
    selectedArrow = null;
  }

  if (currentTool === "rect") {
    const shapeText = prompt("Enter text for the rectangle:", "Shape");
    if (shapeText !== null) {
      const newShape = new Shape(mx - 50, my - 25, 100, 50, shapeText);
      historyManager.execute(new AddShapeCommand(newShape, shapeManager));
    }
  } else if (currentTool === "arrow") {
    const startShape = shapeManager.findShapeUnderMouse(mx, my);
    if (startShape) {
      isDrawingLine = true;
      arrowStartShape = startShape;
      arrowEndPos = { x: mx, y: my };
    }
  } else if (currentTool === "text") {
    const shapeText = prompt("Enter your text:", "New Text");
    if (shapeText !== null) {
      const fontSize = parseInt(fontSizeSelect.value) || 14;
      const fontFamily = fontFamilySelect.value || "Arial";
      const newTextShape = new TextShape(mx, my, shapeText, fontSize, fontFamily);
      historyManager.execute(new AddShapeCommand(newTextShape, shapeManager));
    }
  }
}

function onCanvasMouseMove(e) {
  const pos = getMousePosScaled(e);
  const mx = pos.x;
  const my = pos.y;

  // Move a waypoint
  if (selectedWaypointIndex !== -1 && selectedArrow && selectedArrow.waypoints) {
    selectedArrow.waypoints[selectedWaypointIndex] = { x: mx, y: my };
    return;
  }

  // Dragging arrow endpoint
  if (isDraggingArrowHandle && selectedArrow) {
    if (draggedHandle === "start") {
      if (selectedArrow.fromId !== undefined) {
        selectedArrow.fromId = undefined; // detach
      }
      selectedArrow.fromX = mx;
      selectedArrow.fromY = my;
    } else if (draggedHandle === "end") {
      if (selectedArrow.toId !== undefined) {
        selectedArrow.toId = undefined;
      }
      selectedArrow.toX = mx;
      selectedArrow.toY = my;
    }
    return;
  }

  // Drawing a free arrow
  if (isDrawingFreeArrow && freeArrowStart) {
    currentFreeArrowPos = { x: mx, y: my };
    return;
  }

  // Updating temporary arrow line
  if (isDrawingLine && arrowStartShape) {
    arrowEndPos = { x: mx, y: my };
    return;
  }

  // Resizing shape
  if (isResizing && selectedShape) {
    resizeShape(selectedShape, resizeHandleIndex, mx, my);
    return;
  }

  // Moving shape
  if (draggingShape) {
    draggingShape.x = mx - dragOffsetX;
    draggingShape.y = my - dragOffsetY;
    return;
  }

  // Dragging arrow
  if (isDraggingArrow && selectedArrow && selectedArrow.fromId === undefined) {
    const dx = mx - dragStartX;
    const dy = my - dragStartY;
    selectedArrow.fromX += dx;
    selectedArrow.fromY += dy;
    selectedArrow.toX += dx;
    selectedArrow.toY += dy;
    if (selectedArrow.waypoints && selectedArrow.waypoints.length) {
      for (let i = 0; i < selectedArrow.waypoints.length; i++) {
        selectedArrow.waypoints[i].x += dx;
        selectedArrow.waypoints[i].y += dy;
      }
    }
    dragStartX = mx;
    dragStartY = my;
    return;
  }

  // Hover detection for arrow
  if (!draggingShape && !isDrawingLine && !isDraggingArrow && selectedWaypointIndex === -1) {
    const arrow = arrowManager.findArrowUnderMouse(mx, my, getArrowSegments);
    if (arrow !== hoveredArrow) {
      hoveredArrow = arrow;
      canvas.style.cursor = arrow ? "pointer" : "default";
    }
  }
}

function onCanvasMouseUp(e) {
  if (draggingShape) {
    draggingShape = null;
  }
  if (isDraggingWaypoint) {
    isDraggingWaypoint = false;
    selectedWaypointIndex = -1;
    return;
  }
  if (isResizing) {
    isResizing = false;
    resizeHandleIndex = -1;
  }
  if (isDraggingArrowHandle) {
    isDraggingArrowHandle = false;
    draggedHandle = null;
  }
  if (isDrawingLine) {
    const pos = getMousePosScaled(e);
    const releasedShape = shapeManager.findShapeUnderMouse(pos.x, pos.y);
    if (releasedShape && releasedShape !== arrowStartShape) {
      const arrowObj = {
        fromId: arrowStartShape.id,
        toId: releasedShape.id,
        curve: false,
        color: arrowColorPicker.value,
        lineWidth: parseInt(lineThicknessPicker.value) || 2
      };
      historyManager.execute(new AddArrowCommand(arrowObj, arrowManager));
    }
    isDrawingLine = false;
    arrowStartShape = null;
  }
  if (isDrawingFreeArrow && freeArrowStart) {
    const pos = getMousePosScaled(e);
    const newArrow = {
      fromId: undefined,
      toId: undefined,
      fromX: freeArrowStart.x,
      fromY: freeArrowStart.y,
      toX: pos.x,
      toY: pos.y,
      curve: false,
      color: arrowColorPicker.value,
      lineWidth: parseInt(lineThicknessPicker.value) || 2
    };
    historyManager.execute(new AddArrowCommand(newArrow, arrowManager));
    isDrawingFreeArrow = false;
    freeArrowStart = null;
    currentFreeArrowPos = null;
    return;
  }
  if (isDraggingArrow) {
    isDraggingArrow = false;
    return;
  }
  selectedWaypointIndex = -1;
}

function onCanvasDblClick(e) {
  const pos = getMousePosScaled(e);
  const shape = shapeManager.findShapeUnderMouse(pos.x, pos.y);
  if (shape) {
    shapeEditorInput.style.display = "block";
    const scaleMatch = canvas.style.transform.match(/scale\((.*?)\)/);
    const scaleVal = scaleMatch ? parseFloat(scaleMatch[1]) : 1;
    const canvasRect = canvas.getBoundingClientRect();
    if (shape instanceof TextShape) {
      shapeEditorInput.style.left = (canvasRect.left + shape.x * scaleVal) + "px";
      shapeEditorInput.style.top = (canvasRect.top + shape.y * scaleVal) + "px";
    } else {
      const centerX = shape.x + shape.width / 2;
      const centerY = shape.y + shape.height / 2;
      shapeEditorInput.style.left = (canvasRect.left + centerX * scaleVal - shapeEditorInput.offsetWidth / 2) + "px";
      shapeEditorInput.style.top = (canvasRect.top + centerY * scaleVal - shapeEditorInput.offsetHeight / 2) + "px";
    }
    shapeEditorInput.value = shape.text || "";
    shapeEditorInput.focus();
    shapeEditorInput.onkeydown = evt => {
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
    if (selectedArrow.waypoints && selectedArrow.waypoints.length > 0) {
      for (let i = 0; i < selectedArrow.waypoints.length; i++) {
        if (isPointNearPoint(pos.x, pos.y, selectedArrow.waypoints[i].x, selectedArrow.waypoints[i].y, arrowManager.ARROW_HANDLE_SIZE)) {
          selectedArrow.waypoints.splice(i, 1);
          if (!selectedArrow.waypoints.length) {
            selectedArrow.waypoints = undefined;
          }
          return;
        }
      }
    }
    const segments = getArrowSegments(selectedArrow);
    let minDistance = Infinity;
    let bestSegmentIndex = -1;
    
    if (selectedArrow.curve) {
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const distance = distanceToLineSegment(pos.x, pos.y, seg.x1, seg.y1, seg.x2, seg.y2);
        if (distance < minDistance) {
          minDistance = distance;
          bestSegmentIndex = i;
        }
      }
      if (minDistance <= 8) {
        if (!selectedArrow.waypoints) {
          selectedArrow.waypoints = [];
        }
        const insertionIndex = Math.floor(bestSegmentIndex / (segments.length / (selectedArrow.waypoints.length + 1)));
        selectedArrow.waypoints.splice(insertionIndex, 0, { x: pos.x, y: pos.y });
      }
    } else {
      // Straight lines
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (isPointNearLine(pos.x, pos.y, seg.x1, seg.y1, seg.x2, seg.y2, 15)) {
          if (!selectedArrow.waypoints) {
            selectedArrow.waypoints = [];
          }
          if (i === 0) {
            selectedArrow.waypoints.unshift({ x: pos.x, y: pos.y });
          } else if (i === segments.length - 1) {
            selectedArrow.waypoints.push({ x: pos.x, y: pos.y });
          } else {
            selectedArrow.waypoints.splice(i, 0, { x: pos.x, y: pos.y });
          }
          break;
        }
      }
    }
  }
}

function distanceToLineSegment(px, py, x1, y1, x2, y2) {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;
  const dot = A * C + B * D;
  const len_sq = C * C + D * D;
  let param = -1;
  if (len_sq !== 0) {
    param = dot / len_sq;
  }
  let xx, yy;
  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }
  const dx = px - xx;
  const dy = py - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

function onDocKeyDown(e) {
  if ((e.key === "Delete" || e.key === "Backspace") && (selectedShape || selectedArrow)) {
    if (document.activeElement === shapeEditorInput) {
      return;
    }
    if (selectedShape) {
      historyManager.execute(new DeleteShapeCommand(selectedShape, shapeManager, arrowManager));
      selectedShape = null;
    } else if (selectedArrow) {
      historyManager.execute(new DeleteArrowCommand(selectedArrow, arrowManager));
      selectedArrow = null;
    }
    e.preventDefault();
  }
  if (document.activeElement !== shapeEditorInput) {
    if (e.ctrlKey && e.key === "z") {
      e.preventDefault();
      historyManager.undo();
    }
    if (e.ctrlKey && (e.key === "y" || (e.shiftKey && e.key === "z"))) {
      e.preventDefault();
      historyManager.redo();
    }
  }
}

function onDocPaste(e) {
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
        reader.onload = evt => {
          const img = new Image();
          img.onload = function() {
            const rect = canvas.getBoundingClientRect();
            const scaleMatch = canvas.style.transform.match(/scale\((.*?)\)/);
            const scaleVal = scaleMatch ? parseFloat(scaleMatch[1]) : 1;
            const x = (rect.width / 2 - img.width / 2) / scaleVal;
            const y = (rect.height / 2 - img.height / 2) / scaleVal;
            const newShape = new ImageShape(x, y, img.width, img.height, img);
            historyManager.execute(new AddShapeCommand(newShape, shapeManager));
          };
          img.src = evt.target.result;
        };
        reader.readAsDataURL(blob);
        break;
      }
    }
  }
}

function onCanvasDrop(e) {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const scaleMatch = canvas.style.transform.match(/scale\((.*?)\)/);
  const scaleVal = scaleMatch ? parseFloat(scaleMatch[1]) : 1;
  const dropX = (e.clientX - rect.left) / scaleVal;
  const dropY = (e.clientY - rect.top) / scaleVal;
  const files = e.dataTransfer.files;
  if (!files || !files.length) return;
  const file = files[0];
  if (!file.type.startsWith("image/")) return;
  if (file.type === "image/gif") {
    const fr = new FileReader();
    fr.onload = evt => {
      const buffer = evt.target.result;
      try {
        const lib = window.gifuct || gifuct || null;
        if (!lib) return;
        const gifData = lib.parseGIF(buffer);
        const frames = lib.decompressFrames(gifData, true);
        const fileReaderDataURL = new FileReader();
        fileReaderDataURL.onload = evt2 => {
          const dataUrl = evt2.target.result;
          const animated = new AnimatedGifShape(dropX, dropY, frames, 1);
          animated.gifSrc = dataUrl;
          shapeManager.addShape(animated);
        };
        fileReaderDataURL.readAsDataURL(file);
      } catch (err) {
        console.error("Error decoding animated GIF:", err);
      }
    };
    fr.readAsArrayBuffer(file);
  } else {
    const reader = new FileReader();
    reader.onload = evt => {
      const img = new Image();
      img.onload = () => {
        const imageShape = new ImageShape(dropX, dropY, img.width, img.height, img);
        shapeManager.addShape(imageShape);
      };
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  }
}

function isPointNearPoint(x1, y1, x2, y2, threshold) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy) <= threshold;
}

function clearEditor() {
  shapeEditorInput.style.display = "none";
  shapeEditorInput.value = "";
  shapeEditorInput.onkeydown = null;
  shapeEditorInput.onblur = null;
}

function updateShapeText(shape, newText) {
  const oldText = shape.text;
  shape.text = newText;
  historyManager.execute(new ModifyTextCommand(shape, oldText, newText));
}

function getMousePosScaled(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleMatch = canvas.style.transform.match(/scale\((.*?)\)/);
  const scaleVal = scaleMatch ? parseFloat(scaleMatch[1]) : 1;
  return {
    x: (e.clientX - rect.left) / scaleVal,
    y: (e.clientY - rect.top) / scaleVal
  };
}

function getArrowSegments(arrow) {
  const segments = [];
  let startPoint, endPoint;
  if (arrow.fromId !== undefined) {
    const fromShape = shapeManager.findShapeById(arrow.fromId);
    const toShape = shapeManager.findShapeById(arrow.toId);
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
    startPoint = { x: arrow.fromX, y: arrow.fromY };
    endPoint = { x: arrow.toX, y: arrow.toY };
  }
  let pts = [startPoint];
  if (arrow.waypoints && arrow.waypoints.length) {
    pts.push(...arrow.waypoints);
  }
  pts.push(endPoint);
  if (arrow.curve && pts.length >= 2) {
    const curvePts = getCatmullRomCurvePoints(pts, 20);
    for (let i = 0; i < curvePts.length - 1; i++) {
      segments.push({
        x1: curvePts[i].x,
        y1: curvePts[i].y,
        x2: curvePts[i + 1].x,
        y2: curvePts[i + 1].y
      });
    }
  } else {
    let px = pts[0].x, py = pts[0].y;
    for (let i = 1; i < pts.length; i++) {
      segments.push({
        x1: px, y1: py,
        x2: pts[i].x, y2: pts[i].y
      });
      px = pts[i].x;
      py = pts[i].y;
    }
  }
  return segments;
}

function bringShapeForward(shape) {
  const idx = shapeManager.shapes.indexOf(shape);
  if (idx >= 0 && idx < shapeManager.shapes.length - 1) {
    shapeManager.shapes.splice(idx, 1);
    shapeManager.shapes.splice(idx + 1, 0, shape);
  }
}

function sendShapeBackward(shape) {
  const idx = shapeManager.shapes.indexOf(shape);
  if (idx > 0) {
    shapeManager.shapes.splice(idx, 1);
    shapeManager.shapes.splice(idx - 1, 0, shape);
  }
}

function bringShapeToFront(shape) {
  const idx = shapeManager.shapes.indexOf(shape);
  if (idx >= 0) {
    shapeManager.shapes.splice(idx, 1);
    shapeManager.shapes.push(shape);
  }
}

function sendShapeToBack(shape) {
  const idx = shapeManager.shapes.indexOf(shape);
  if (idx >= 0) {
    shapeManager.shapes.splice(idx, 1);
    shapeManager.shapes.unshift(shape);
  }
}

function removeWhiteBG() {
  if (!selectedShape) return;
  if (!(selectedShape instanceof ImageShape)) return;
  const offCanvas = document.createElement("canvas");
  offCanvas.width = selectedShape.img.width;
  offCanvas.height = selectedShape.img.height;
  const offCtx = offCanvas.getContext("2d");
  offCtx.drawImage(selectedShape.img, 0, 0);
  const imgData = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r > 240 && g > 240 && b > 240) {
      data[i + 3] = 0;
    }
  }
  offCtx.putImageData(imgData, 0, 0);
  const newImg = new Image();
  newImg.onload = function() {
    selectedShape.img = newImg;
    selectedShape.width = newImg.width;
    selectedShape.height = newImg.height;
  };
  newImg.src = offCanvas.toDataURL();
}

function removeColorBG() {
  if (!selectedShape) return;
  if (!(selectedShape instanceof ImageShape)) return;
  const colorPicker = document.createElement("input");
  colorPicker.type = "color";
  colorPicker.value = "#FFFFFF";
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
    const r = parseInt(selectedColor.substr(1,2), 16);
    const g = parseInt(selectedColor.substr(3,2), 16);
    const b = parseInt(selectedColor.substr(5,2), 16);
    const offCanvas = document.createElement("canvas");
    offCanvas.width = selectedShape.img.width;
    offCanvas.height = selectedShape.img.height;
    const offCtx = offCanvas.getContext("2d");
    offCtx.drawImage(selectedShape.img, 0, 0);
    const imgData = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const pixelR = data[i];
      const pixelG = data[i + 1];
      const pixelB = data[i + 2];
      const colorDiff = Math.sqrt(
        Math.pow(pixelR - r, 2) +
        Math.pow(pixelG - g, 2) +
        Math.pow(pixelB - b, 2)
      );
      if (colorDiff <= tolerance * 2.55) {
        data[i + 3] = 0;
      }
    }
    offCtx.putImageData(imgData, 0, 0);
    const newImg = new Image();
    newImg.onload = function() {
      selectedShape.img = newImg;
    };
    newImg.src = offCanvas.toDataURL();
    dialog.close();
    dialog.remove();
  };
}

function saveDiagram() {
  const exportData = {
    shapeCounter: shapeCounter,
    shapes: shapeManager.shapes.map(s => shapeToSerializable(s)),
    arrows: arrowManager.arrows.map(a => arrowToSerializable(a)),
    canvasBgColor: canvasBgColor
  };
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
  const dlAnchorEl = document.createElement("a");
  dlAnchorEl.setAttribute("href", dataStr);
  dlAnchorEl.setAttribute("download", "diagram.json");
  dlAnchorEl.click();
}

function loadDiagramFromFile() {
  historyManager.clear();
  const fi = document.createElement("input");
  fi.type = "file";
  fi.accept = "application/json";
  fi.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      importDiagram(evt.target.result);
      historyManager.clear();
    };
    reader.readAsText(file);
  };
  fi.click();
}

function shapeToSerializable(s) {
  if (s instanceof AnimatedGifShape) {
    return {
      id: s.id,
      type: "AnimatedGifShape",
      x: s.x,
      y: s.y,
      width: s.width,
      height: s.height,
      gifSrc: s.gifSrc || "",
      speedMultiplier: s.speedMultiplier,
      opacity: s.opacity !== undefined ? s.opacity : 1,
      isAnimated: s.isAnimated,
      lastUsedColors: s.lastUsedColors || {
        line: s.color,
        fill: s.fillColor,
        text: s.textColor
      }
    };
  } else if (s instanceof ImageShape) {
    return {
      id: s.id,
      type: "ImageShape",
      x: s.x,
      y: s.y,
      width: s.width,
      height: s.height,
      imgSrc: s.img.src,
      color: s.color,
      textColor: s.textColor,
      fillColor: s.fillColor,
      lineWidth: s.lineWidth,
      isAnimated: s.isAnimated,
      opacity: s.opacity !== undefined ? s.opacity : 1,
      lastUsedColors: s.lastUsedColors || {
        line: s.color,
        fill: s.fillColor,
        text: s.textColor
      }
    };
  } else if (s instanceof TextShape) {
    return {
      id: s.id,
      type: "TextShape",
      x: s.x,
      y: s.y,
      text: s.text,
      fontSize: s.fontSize,
      fontFamily: s.fontFamily,
      color: s.color,
      textColor: s.textColor,
      fillColor: s.fillColor,
      lineWidth: s.lineWidth,
      isAnimated: s.isAnimated,
      opacity: s.opacity !== undefined ? s.opacity : 1,
      lastUsedColors: s.lastUsedColors || {
        line: s.color,
        fill: s.fillColor,
        text: s.textColor
      },
      width: s.width,
      height: s.height
    };
  } else {
    return {
      id: s.id,
      type: "Shape",
      x: s.x,
      y: s.y,
      width: s.width,
      height: s.height,
      text: s.text,
      fontSize: s.fontSize || 14,
      fontFamily: s.fontFamily || "Arial",
      color: s.color,
      textColor: s.textColor,
      fillColor: s.fillColor,
      lineWidth: s.lineWidth,
      isAnimated: s.isAnimated,
      opacity: s.opacity !== undefined ? s.opacity : 1,
      lastUsedColors: s.lastUsedColors || {
        line: s.color,
        fill: s.fillColor,
        text: s.textColor
      }
    };
  }
}

function arrowToSerializable(a) {
  if (a.fromId === undefined) {
    return {
      fromId: undefined,
      toId: undefined,
      fromX: a.fromX,
      fromY: a.fromY,
      toX: a.toX,
      toY: a.toY,
      color: a.color,
      lineWidth: a.lineWidth,
      curve: a.curve,
      waypoints: a.waypoints
    };
  } else {
    return {
      fromId: a.fromId,
      toId: a.toId,
      color: a.color,
      lineWidth: a.lineWidth,
      curve: a.curve,
      waypoints: a.waypoints
    };
  }
}

async function importDiagram(jsonText) {
  try {
    const data = JSON.parse(jsonText);
    shapeManager.shapes = [];
    arrowManager.arrows = [];
    const shapePromises = data.shapes.map(sd => {
      if (sd.type === "AnimatedGifShape") {
        return createAnimatedGifShape(sd);
      } else {
        return Promise.resolve(shapeFromSerializable(sd));
      }
    });
    const newShapes = await Promise.all(shapePromises);
    shapeManager.shapes.push(...newShapes);
    const maxId = newShapes.reduce((acc, s) => Math.max(acc, s.id), 0);
    shapeCounter = Math.max(data.shapeCounter, maxId + 1);
    arrowManager.arrows = (data.arrows || []).map(ad => {
      if (ad.fromId === undefined) {
        return {
          fromId: undefined,
          toId: undefined,
          fromX: ad.fromX,
          fromY: ad.fromY,
          toX: ad.toX,
          toY: ad.toY,
          color: ad.color,
          lineWidth: ad.lineWidth,
          waypoints: ad.waypoints,
          curve: ad.curve || false
        };
      } else {
        return {
          fromId: ad.fromId,
          toId: ad.toId,
          color: ad.color,
          lineWidth: ad.lineWidth,
          waypoints: ad.waypoints,
          startAttachment: ad.startAttachment,
          endAttachment: ad.endAttachment,
          curve: ad.curve || false
        };
      }
    });
    selectedShape = null;
    canvasBgColor = data.canvasBgColor || "#ffffff";
    const canvasColorPicker = document.getElementById("canvasColorPicker");
    if (canvasColorPicker) {
      canvasColorPicker.value = canvasBgColor;
    }
  } catch (err) {
    console.error("Error parsing diagram JSON:", err);
  }
}

async function createAnimatedGifShape(sd) {
  const resp = await fetch(sd.gifSrc);
  const buff = await resp.arrayBuffer();
  const lib = window.gifuct || gifuct;
  const gifData = lib.parseGIF(buff);
  const frames = lib.decompressFrames(gifData, true);
  const ags = new AnimatedGifShape(sd.x, sd.y, frames, sd.speedMultiplier);
  ags.id = sd.id;
  ags.color = sd.color || "#333";
  ags.textColor = sd.textColor || "#000";
  ags.fillColor = sd.fillColor || "#e8f1fa";
  ags.lineWidth = sd.lineWidth || 2;
  ags.opacity = sd.opacity !== undefined ? sd.opacity : 1;
  ags.gifSrc = sd.gifSrc;
  ags.isAnimated = sd.isAnimated !== undefined ? sd.isAnimated : true; // <-- Set this to true so frames update
  return ags;
}

function shapeFromSerializable(sd) {
  let newShape;
  if (sd.type === "AnimatedGifShape") {
    // Typically won't happen because we do createAnimatedGifShape, but fallback:
    newShape = new Shape(sd.x, sd.y, sd.width, sd.height, "");
  } else if (sd.type === "ImageShape") {
    const img = new Image();
    img.src = sd.imgSrc;
    newShape = new ImageShape(sd.x, sd.y, sd.width, sd.height, img);
  } else if (sd.type === "TextShape") {
    newShape = new TextShape(sd.x, sd.y, sd.text, sd.fontSize, sd.fontFamily);
    // Use fallback dimensions if they don't exist in the saved data:
    newShape.width = sd.width || newShape.width;
    newShape.height = sd.height || newShape.height;
  } else {
    newShape = new Shape(sd.x, sd.y, sd.width, sd.height, sd.text);
    newShape.fontSize = sd.fontSize || 14;
    newShape.fontFamily = sd.fontFamily || "Arial";
  }

  newShape.id = sd.id;
  newShape.color = sd.color || "#333";
  newShape.textColor = sd.textColor || "#000";
  newShape.fillColor = sd.fillColor || "#e8f1fa";
  newShape.lineWidth = sd.lineWidth || 2;
  newShape.isAnimated = sd.isAnimated !== undefined ? sd.isAnimated : true;
  newShape.opacity = sd.opacity !== undefined ? sd.opacity : 1;
  
  newShape.lastUsedColors = sd.lastUsedColors || {
    line: newShape.color,
    fill: newShape.fillColor,
    text: newShape.textColor
  };

  return newShape;
}

function updateShapeControls(shape) {
  if (!shape && !selectedArrow) return;

  if (selectedArrow) {
    if (arrowColorPicker) {
      arrowColorPicker.value = selectedArrow.color || "#000000";
    }
    if (lineThicknessPicker) {
      lineThicknessPicker.value = selectedArrow.lineWidth || "2";
    }
    const toggleCurveBtn = document.getElementById("toggleCurveBtn");
    if (toggleCurveBtn) {
      toggleCurveBtn.textContent = selectedArrow.curve ? "Curve" : "Straight";
    }
    return;
  }
  // For shapes
  if (shape instanceof ImageShape || shape instanceof AnimatedGifShape) {
    // avoid updating color pickers with these shapes if you like
  } else if (shape.lastUsedColors) {
    if (arrowColorPicker) {
      arrowColorPicker.value = shape.lastUsedColors.line;
    }
    if (fillColorPicker) {
      fillColorPicker.value = shape.lastUsedColors.fill;
    }
    if (textColorPicker) {
      textColorPicker.value = shape.lastUsedColors.text;
    }
  }

  if (fontSizeSelect) {
    fontSizeSelect.value = shape.fontSize || "14";
  }
  if (fontFamilySelect) {
    fontFamilySelect.value = shape.fontFamily || "Arial";
  }

  const opacityRange = document.getElementById("opacityRange");
  if (opacityRange) {
    opacityRange.value = shape.opacity || 1;
  }

  if (lineThicknessPicker) {
    lineThicknessPicker.value = shape.lineWidth || "2";
  }

  const animatedBorderBtn = document.getElementById("animatedBorderBtn");
  if (animatedBorderBtn) {
    animatedBorderBtn.textContent = shape.isAnimated ? "On" : "Off";
  }
}
