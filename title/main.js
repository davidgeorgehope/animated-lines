function onCanvasMouseDown(e) {
  const cRect = canvas.getBoundingClientRect();
  const scaleMatch = canvas.style.transform.match(/scale\((.*?)\)/);
  const scaleVal = scaleMatch ? parseFloat(scaleMatch[1]) : 1;
  const mx = (e.clientX - cRect.left) / scaleVal;
  const my = (e.clientY - cRect.top) / scaleVal;

  // 1. If an arrow is already selected and it has waypoints,
  //    first check if the click is near one of them.
  if (selectedArrow && selectedArrow.waypoints && selectedArrow.waypoints.length) {
    for (let i = 0; i < selectedArrow.waypoints.length; i++) {
      const pt = selectedArrow.waypoints[i];
      if (isPointNearPoint(mx, my, pt.x, pt.y, arrowManager.ARROW_HANDLE_SIZE)) {
        selectedWaypointIndex = i;
        requestRender();
        return;
      }
    }
  }

  // 2. For “free” arrows (that don’t snap to shapes), check if
  //    the click is on one of the arrow’s endpoint handles.
  if (selectedArrow && selectedArrow.fromId === undefined) {
    if (isPointNearPoint(mx, my, selectedArrow.fromX, selectedArrow.fromY, arrowManager.ARROW_HANDLE_SIZE)) {
      isDraggingArrowHandle = true;
      draggedHandle = "start";
      requestRender();
      return;
    }
    if (isPointNearPoint(mx, my, selectedArrow.toX, selectedArrow.toY, arrowManager.ARROW_HANDLE_SIZE)) {
      isDraggingArrowHandle = true;
      draggedHandle = "end";
      requestRender();
      return;
    }
  }

  // 3. If none of the above conditions apply, then if using the "select" tool
  //    try selecting an arrow if one is clicked.
  if (currentTool === "select") {
    const clickedArrow = arrowManager.findArrowUnderMouse(mx, my, getArrowSegments);
    if (clickedArrow) {
      selectedArrow = clickedArrow;
      selectedShape = null;
      updateShapeControls();
      isDraggingArrow = true;
      dragStartX = mx;
      dragStartY = my;
      requestRender();
      return;
    }
  }

  // Continue with the rest of your logic (selecting shapes, drawing arrows, etc.)
  // ...
}