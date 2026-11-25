const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");
const noop = () => {};

test("reader reuses the PDF, rejects stale page selections, and cancels obsolete work", async (t) => {
  const dom = new JSDOM('<style>.arch-pdf-stage { padding: 34px; }</style><div id="root"></div>', { pretendToBeVisual: true });
  for (const key of ["window", "document", "Node"]) global[key] = dom.window[key];
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require("react");
  const root = require("react-dom/client").createRoot(document.getElementById("root"));
  t.after(async () => {
    await React.act(async () => root.unmount());
    dom.window.close();
    for (const key of ["window", "document", "Node", "IS_REACT_ACT_ENVIRONMENT"]) delete global[key];
  });
  Object.defineProperty(window.HTMLElement.prototype, "clientWidth", { get: () => 800 });
  window.HTMLCanvasElement.prototype.getContext = () => ({ setTransform: noop });
  const { transformWithOxc } = await import("vite");
  const source = fs.readFileSync(path.join(__dirname, "../src/LibraryView.tsx"), "utf8");
  const component = source.slice(source.indexOf("function PdfPaperCanvas("), source.indexOf("function selectionNodeSpan("))
    .replace('import("./pdf-runtime")', "loadRuntime()");
  const { code } = await transformWithOxc(component, "reader.tsx", { jsx: { runtime: "classic" } });

  const drawn = { promise: Promise.resolve(), cancel: noop };
  const makePage = (number) => ({
    getViewport: ({ scale }) => ({ width: 612 * scale, height: 792 * scale }),
    render: () => drawn,
    getTextContent: async () => ({ text: `Page ${number}` }),
    getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
    getAnnotations: async () => [],
    cleanup: noop,
  });
  const fetches = [];
  const selections = [];
  let docOpens = 0;
  let docCloses = 0;
  let releasePage;
  let releaseFetch;
  const scope = {
    ...React, React,
    useUISettings: () => ({ t: (value) => value }),
    ResizeObserver: class { observe = noop; disconnect = noop; },
    PDF_VIEWPORT_WIDTH_STEP: 16,
    fetch: (url, { signal } = {}) => {
      fetches.push({ url, signal });
      const response = { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
      return url === "held-fetch.pdf"
        ? new Promise((resolve) => { releaseFetch = () => resolve(response); })
        : Promise.resolve(response);
    },
    loadRuntime: async () => ({
      pdfjs: {
        getDocument() {
          docOpens++;
          const document = {
            getPage: (number) => number === 2
              ? new Promise((resolve) => { releasePage = () => resolve(makePage(number)); })
              : Promise.resolve(makePage(number)),
            cleanup: noop,
          };
          return { promise: Promise.resolve(document), destroy: async () => { docCloses++; } };
        },
        TextLayer: class {
          constructor({ textContentSource, container }) {
            this.container = container;
            this.text = textContentSource.text;
          }
          async render() {
            this.container.append(Object.assign(document.createElement("span"), { textContent: this.text }));
          }
          cancel() {}
        },
      },
    }),
    LoaderCircle: () => null, FileText: () => null,
    clearActivePdfSelection: noop, applyPdfHighlights: noop, applyPdfSearchHighlights: noop,
    detectPdfImageRegions: () => [], pdfTextLines: () => [], findEquationRects: () => [], equationTokens: () => [],
    detectPdfCaptionRegions: () => [], installPdfInteractiveRegions: noop, mergePdfInteractiveRegions: (regions) => regions,
    selectionNodeSpan: (node) => node.parentElement, selectPdfTextByLayout: () => null,
    readableError: (error) => error.message,
  };
  const Canvas = new Function(...Object.keys(scope), `${code}\nreturn PdfPaperCanvas;`)(...Object.values(scope));
  const render = (pageNumber, zoom = 1, url = "paper.pdf") => React.act(async () => {
    root.render(url ? React.createElement(Canvas, {
      key: url, url, pageNumber, zoom, highlights: [], searchQuery: "",
      activeSelection: "", figureCaptureActive: false, onClearSelection: noop,
      onSelection: (text) => selections.push(text),
    }) : null);
  });
  const pickText = () => React.act(async () => {
    const span = document.querySelector(".arch-pdf-text-layer span");
    const range = document.createRange();
    range.selectNodeContents(span);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    span.dispatchEvent(new window.MouseEvent("mouseup", { bubbles: true }));
  });

  await render(1);
  await pickText();
  assert.deepEqual(selections, ["Page 1"]);
  await render(2);
  assert.equal(document.querySelector(".arch-pdf-text-layer").textContent, "Page 1");
  await pickText();
  assert.deepEqual(selections, ["Page 1"], "page 1 remains visible but cannot be selected after navigating to page 2");
  await React.act(async () => releasePage());
  await pickText();
  assert.deepEqual(selections, ["Page 1", "Page 2"]);

  await render(1, 1.2);
  await render(3, 1.2);
  assert.equal(document.querySelector(".arch-pdf-text-layer").textContent, "Page 3");
  assert.equal(document.querySelector(".arch-pdf-loading.error"), null);
  assert.deepEqual(fetches.map(({ url }) => url), ["paper.pdf"]);
  assert.equal(docOpens, 1);

  await render(1, 1, "held-fetch.pdf");
  assert.equal(docCloses, 1);
  await render(1, 1, "");
  assert.equal(fetches[1]?.signal?.aborted, true);
  await React.act(async () => releaseFetch());
  assert.equal(docOpens, 1, "a response that races with abort cannot start a worker after the reader closes");
});
