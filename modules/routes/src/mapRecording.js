// MapLibre preserves frames for trajectory and board capture.
export const recordingContextOptions=()=>({canvasContextAttributes:{preserveDrawingBuffer:true}});
export function drawExplanationPointer(context, mapCanvas, pointer) {
  if (!pointer || document.visibilityState === 'hidden' || document.elementFromPoint(pointer.x, pointer.y) !== mapCanvas) return false;
  const rect = mapCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  context.save();
  context.translate((pointer.x - rect.left) * context.canvas.width / rect.width,
    (pointer.y - rect.top) * context.canvas.height / rect.height);
  const scale = context.canvas.width / rect.width;
  context.scale(scale, scale);
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(0, 25);
  context.lineTo(7, 19);
  context.lineTo(12, 30);
  context.lineTo(17, 28);
  context.lineTo(12, 17);
  context.lineTo(22, 17);
  context.closePath();
  context.strokeStyle = '#ffffff';
  context.lineWidth = 3;
  context.lineJoin = 'round';
  context.stroke();
  context.fillStyle = '#164f43';
  context.fill();
  context.restore();
  return true;
}
