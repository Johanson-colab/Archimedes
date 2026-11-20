const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const agent = require("./agent.cjs");
const { deepSearchPapers } = require("./deep-paper-search.cjs");
const { generateBitmap, prepareFigurePlan } = require("./figure-forge.cjs");
const modelConfig = require("./model-config.cjs");
const { completeJson } = require("./paper-review-model.cjs");
const { transcribeSpeech } = require("./speech.cjs");

const gatewayToken = "DUMMY_GATEWAY_TOKEN";
const fixedSession = "DUMMY_FIXED_SESSION";
const config = {
  apiKey: "fixture-key",
  baseUrl: "https://gateway.example.test/v1",
  headers: { "X-Gateway-Token": gatewayToken },
  model: "fixture-model",
  provider: "custom",
  sessionHeader: { name: "X-Session", strategy: "fixed", value: fixedSession },
};
const invalidJsonMessage = "The model provider returned invalid JSON. Check the model endpoint and try again.";
const reference = "data:image/png;base64,YWJj";
const pdfData = "data:application/pdf;base64," + Buffer.from("%PDF-1.7").toString("base64");

function invalidJsonResponse(_url, { headers }) {
  assert.equal(headers["X-Gateway-Token"], gatewayToken);
  assert.equal(headers["X-Session"], fixedSession);
  return new Response(headers["X-Gateway-Token"] + " " + headers["X-Session"], { status: 200 });
}

test("malformed successful responses cannot echo private headers through their decoder errors", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-model-response-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  modelConfig.initializeModelConfig(directory);
  const fetchImpl = t.mock.method(globalThis, "fetch", async (...args) => invalidJsonResponse(...args));

  for (const [request, expected] of [
    [() => modelConfig.testModelConfig(config), invalidJsonMessage],
    [() => modelConfig.listProviderModels(config), invalidJsonMessage],
    [() => agent.complete(config, []), invalidJsonMessage],
    [() => agent.complete({ ...config, provider: "anthropic" }, []), invalidJsonMessage],
    [() => completeJson(config, { system: "Review", prompt: "Evaluate", fetchImpl }), invalidJsonMessage],
    [() => deepSearchPapers({ prompt: "Fixture research topic" }, {
      modelConfig: config, fetchImpl, searchSources: async () => ({ papers: [] }),
    }), "No papers matched the expanded search. Query expansion unavailable: " + invalidJsonMessage],
    [() => prepareFigurePlan({ pdfData }, { config, complete: agent.complete, fetchImpl }), invalidJsonMessage],
    [() => generateBitmap({ references: [reference, reference], plan: "Test", method: "direct", model: "gpt-image-2" }, { config, fetchImpl }), invalidJsonMessage],
    [() => transcribeSpeech({ audio: Uint8Array.of(1) }, config, fetchImpl), invalidJsonMessage],
  ]) {
    await assert.rejects(request(), { message: expected });
  }
  assert.equal(fetchImpl.mock.callCount(), 9);
});

test("non-streaming and temperature retries use the same safe JSON decoder", async t => {
  const fetchImpl = t.mock.method(globalThis, "fetch", async (url, options) => {
    const request = JSON.parse(options.body);
    if (request.stream) return new Response('data: {"type":"response.output_text.delta","delta":"OK"}\n\n', {
      headers: { "Content-Type": "text/event-stream" },
    });
    if (Object.hasOwn(request, "temperature")) return new Response("temperature is unsupported", { status: 400 });
    return invalidJsonResponse(url, options);
  });

  await assert.rejects(agent.complete(config, []), { message: invalidJsonMessage });
  await assert.rejects(completeJson(config, { system: "Review", prompt: "Evaluate", fetchImpl }), { message: invalidJsonMessage });
  assert.equal(fetchImpl.mock.callCount(), 4);
});

test("a failed agent turn persists the actionable diagnostic without including the response body", async t => {
  const store = require("./store.cjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-agent-invalid-json-"));
  store.openWorkspace(root);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  modelConfig.initializeModelConfig(path.join(root, "settings"));
  t.mock.method(globalThis, "fetch", async (...args) => invalidJsonResponse(...args));

  for (const provider of ["custom", "anthropic"]) {
    modelConfig.saveModelConfig({ ...config, provider });
    const result = await agent.runAgent({ workspace: root, prompt: "Inspect the fixture" });
    assert.equal(result.status, "failed");
    const savedThread = JSON.stringify(store.getResearchThread(result.threadId));
    assert.ok(savedThread.includes(invalidJsonMessage));
    assert.doesNotMatch(savedThread, /DUMMY_GATEWAY_TOKEN|DUMMY_FIXED_SESSION/);
  }
});
