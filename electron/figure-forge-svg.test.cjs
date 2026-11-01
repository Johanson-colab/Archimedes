const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

test("generated SVG strips executable content and external references", async () => {
  const dom = new JSDOM("");
  global.DOMParser = dom.window.DOMParser;
  global.XMLSerializer = dom.window.XMLSerializer;
  try {
    const { sanitizeFigureSvg } = await import("../src/figureforge/sanitize-svg.mjs");
    const clean = sanitizeFigureSvg('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><image href="https://evil.test/a"/><rect width="10" height="10" fill="url(https://evil.test/x)"/><text>Safe label</text></svg>');
    assert.doesNotMatch(clean, /onload|script|https:\/\/evil/);
    assert.match(clean, /Safe label/);
    assert.throws(() => sanitizeFigureSvg('<!DOCTYPE svg [<!ENTITY e SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg">&e;</svg>'), /Unsafe/);
  } finally {
    delete global.DOMParser; delete global.XMLSerializer; dom.window.close();
  }
});
