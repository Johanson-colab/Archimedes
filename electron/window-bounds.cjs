function initialWindowBounds(workArea) {
  // Electron work areas are already in device-independent pixels. Applying the
  // display scale factor again makes windows oversized on 125–200% Windows DPI.
  // Leave room for native borders and fractional-DPI rounding on Windows.
  const width = Math.min(1560, Math.max(1, workArea.width - 16));
  const height = Math.min(980, Math.max(1, workArea.height - 16));
  return {
    x: workArea.x + Math.floor((workArea.width - width) / 2),
    y: workArea.y + Math.floor((workArea.height - height) / 2),
    width, height,
    minWidth: Math.min(1100, width),
    minHeight: Math.min(720, height),
  };
}

module.exports = { initialWindowBounds };
