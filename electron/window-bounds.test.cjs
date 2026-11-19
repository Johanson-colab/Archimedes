const assert = require("node:assert/strict");
const test = require("node:test");
const { initialWindowBounds } = require("./window-bounds.cjs");

test("initial and minimum window sizes fit small and scaled monitor work areas", () => {
  for (const area of [
    { x: 0, y: 0, width: 1920, height: 1040 },
    { x: 0, y: 0, width: 1280, height: 680 },
    { x: 0, y: 0, width: 960, height: 500 },
    { x: -1536, y: -300, width: 1536, height: 824 },
  ]) {
    const bounds = initialWindowBounds(area);
    assert.ok(bounds.x >= area.x && bounds.y >= area.y);
    assert.ok(bounds.x + bounds.width <= area.x + area.width);
    assert.ok(bounds.y + bounds.height <= area.y + area.height);
    assert.ok(bounds.minWidth <= bounds.width && bounds.minHeight <= bounds.height);
  }
});
