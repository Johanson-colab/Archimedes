const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildModelHeaders,
  formatConnectionError,
  formatModelRequestError,
  modelProviderErrorDetail,
  sanitizeHeaders,
  sanitizeSessionHeader,
} = require("./model-request-headers.cjs");
const modelConfig = require("./model-config.cjs");
const paperReviewModel = require("./paper-review-model.cjs");
const { complete } = require("./agent.cjs");

test("sanitizeHeaders drops unsafe or malformed headers", () => {
  assert.deepEqual(sanitizeHeaders({
    "X-Safe": "value",
    host: "evil.test",
    "Content-Length": "10",
    "x-bad": "a\r\nb",
    "x-empty": "",
  }), { "X-Safe": "value" });
});

test("sanitizeSessionHeader validates strategy and name", () => {
  assert.deepEqual(sanitizeSessionHeader({ name: "x-opencode-session", strategy: "fixed", value: "abc" }), { name: "x-opencode-session", strategy: "fixed", value: "abc" });
  assert.equal(sanitizeSessionHeader({ name: "host", strategy: "thread" }), null);
  assert.deepEqual(sanitizeSessionHeader({ name: "x-session" }), { name: "x-session", strategy: "thread" });
});

test("buildModelHeaders adds auth, custom headers, and thread session id", () => {
  const config = {
    apiKey: "secret",
    headers: { "X-Tenant": "lab" },
    sessionHeader: { name: "x-opencode-session", strategy: "thread" },
    userAgent: "Archimedes/0.1.0",
  };
  assert.deepEqual(buildModelHeaders(config, "thread-123", { baseHeaders: { "Content-Type": "application/json" } }), {
    "Content-Type": "application/json",
    Authorization: "Bearer secret",
    "X-Tenant": "lab",
    "x-opencode-session": "thread-123",
    "User-Agent": "Archimedes/0.1.0",
  });
  assert.equal(buildModelHeaders({ sessionHeader: { name: "x-opencode-session", strategy: "disabled" } }, "t")["x-opencode-session"], undefined);
  assert.equal(buildModelHeaders({ sessionHeader: { name: "x-opencode-session", strategy: "fixed", value: "fixed-id" } }, "thread")["x-opencode-session"], "fixed-id");
});

test("provider session errors get actionable messages", () => {
  const raw = '{"type":"error","error":{"type":"MissingSessionID","message":"Request is missing x-opencode-session"}}';
  assert.match(formatModelRequestError(400, raw), /requires a stable session header/);
  assert.equal(formatConnectionError(400, raw), "Connection failed (400): MissingSessionID");
  assert.equal(formatModelRequestError(500, "boom"), "Model request failed (500): boom");
  assert.match(modelProviderErrorDetail(raw, { headers: { "X-Tenant": "dummy" } }), /requires a stable session header/);
  assert.equal(modelProviderErrorDetail("The key DUMMY_API_KEY was rejected", { apiKey: "DUMMY_API_KEY" }), "The key [redacted] was rejected");
});

test("saved custom header values stay in the main process and can be replaced or cleared", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-headers-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  modelConfig.initializeModelConfig(directory);
  const input = {
    provider: "custom",
    baseUrl: "https://opencode.ai/inference/go/openai/v1",
    model: "hy4-flash-free",
    apiKey: "test-key",
    headers: { "X-Tenant": "lab" },
    sessionHeader: { name: "x-opencode-session", strategy: "fixed", value: "example-session" },
    userAgent: "Archimedes/0.1.0",
  };
  const saved = modelConfig.saveModelConfig(input);
  assert.equal(saved.hasCustomHeaders, true);
  assert.equal(Object.hasOwn(saved, "headers"), false);
  assert.deepEqual(saved.sessionHeader, { name: "x-opencode-session", strategy: "fixed", hasValue: true });
  assert.deepEqual(modelConfig.getActiveModelConfig().headers, input.headers);
  assert.deepEqual(modelConfig.getActiveModelConfig().sessionHeader, input.sessionHeader);

  const connection = { provider: input.provider, baseUrl: input.baseUrl, model: input.model };
  modelConfig.saveModelConfig({ ...connection, sessionHeader: { name: "x-opencode-session", strategy: "fixed" } });
  assert.equal(modelConfig.getActiveModelConfig().sessionHeader.value, "example-session");
  modelConfig.saveModelConfig({ ...connection, headers: {}, sessionHeader: null });
  assert.deepEqual(modelConfig.getActiveModelConfig().headers, {});
  assert.equal(modelConfig.getActiveModelConfig().sessionHeader, null);
});

test("the dedicated Go provider recognizes existing Custom connections and uses the Go catalog", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-opencode-go-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  modelConfig.initializeModelConfig(directory);
  const baseUrl = "https://opencode.ai/inference/go/openai/v1";
  fs.writeFileSync(path.join(directory, "model-config.json"), JSON.stringify({
    provider: "custom",
    baseUrl: `${baseUrl}/`,
    model: "hy4",
    apiKey: "legacy-key",
  }));
  const publicConfig = modelConfig.getPublicModelConfig();
  assert.equal(publicConfig.provider, "opencode-go");
  assert.equal(publicConfig.baseUrl, baseUrl);
  assert.equal(publicConfig.hasApiKey, true);
  assert.equal(Object.hasOwn(publicConfig, "apiKey"), false);
  assert.deepEqual(publicConfig.sessionHeader, { name: "x-opencode-session", strategy: "thread", hasValue: false });

  const request = t.mock.method(globalThis, "fetch", async () => Response.json({ data: [{ id: "hy4" }] }));
  assert.deepEqual((await modelConfig.listProviderModels()).models, ["hy4"]);
  assert.equal(request.mock.calls[0].arguments[0], "https://opencode.ai/inference/go/v1/models");
  assert.equal(request.mock.calls[0].arguments[1].headers.Authorization, "Bearer legacy-key");
  assert.match(request.mock.calls[0].arguments[1].headers["User-Agent"], /^Archimedes\//);
  assert.equal(request.mock.calls[0].arguments[1].headers["x-opencode-session"], "archimedes-model-catalog");
  await assert.rejects(modelConfig.testModelConfig({ provider: "openai", baseUrl }), /Add an API key/);
  await assert.rejects(modelConfig.testModelConfig({ provider: "opencode-go", baseUrl: "https://other.example/v1" }), /Add an API key/);
  modelConfig.saveModelConfig({ provider: "opencode-go", baseUrl, model: "qwen3.7-plus" });
  assert.equal(modelConfig.getActiveModelConfig().apiKey, "legacy-key");
});

test("catalog, connection test, chat and inherited Paper review use the configured HTTP headers", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-model-provider-"));
  modelConfig.initializeModelConfig(directory);
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const body = [];
    for await (const chunk of req) body.push(chunk);
    const input = body.length ? JSON.parse(Buffer.concat(body).toString()) : {};
    requests.push({ url: req.url, headers: req.headers });
    if (req.url === "/v1/models") return res.end(JSON.stringify({ data: [{ id: "hy4-flash-free" }] }));
    if (!req.headers["x-opencode-session"]) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: { type: "MissingSessionID" } }));
    }
    if (input.stream) {
      res.setHeader("Content-Type", "text/event-stream");
      return res.end('data: {"choices":[{"delta":{"content":"OK"},"finish_reason":"stop"}]}\n\n');
    }
    res.end(JSON.stringify({ model: "hy4-flash-free", choices: [{ finish_reason: "stop", message: { content: '{"ok":true}' } }] }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const connection = {
    provider: "custom",
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
    model: "hy4-flash-free",
    apiKey: "test-key",
  };
  const proposed = {
    ...connection,
    headers: { "X-Tenant": "fixture-tenant" },
    sessionHeader: { name: "x-opencode-session", strategy: "thread" },
    userAgent: "Archimedes/0.1.0",
  };
  modelConfig.saveModelConfig(connection);
  await assert.rejects(modelConfig.testModelConfig(connection), /MissingSessionID/);
  assert.deepEqual((await modelConfig.listProviderModels(proposed)).models, ["hy4-flash-free"]);
  assert.equal((await modelConfig.testModelConfig(proposed)).ok, true);
  modelConfig.saveModelConfig(proposed);
  const config = modelConfig.getActiveModelConfig();
  const messages = [{ role: "user", content: "Reply with OK." }];
  for (const sessionId of ["thread-abc", "thread-abc", "thread-def"]) {
    assert.equal((await complete(config, messages, { allowTools: false, sessionId })).content, "OK");
  }
  const inheritedReviewModel = paperReviewModel.resolveReviewModel({ model: { mode: "agent" } });
  const review = await paperReviewModel.completeJson({ ...inheritedReviewModel, sessionId: "review-123" }, { system: "Review the paper", prompt: "Return JSON" });
  assert.deepEqual(review.json, { ok: true });
  assert.deepEqual(requests.map(({ url, headers }) => [url, headers["x-opencode-session"]]), [
    ["/v1/chat/completions", undefined],
    ["/v1/models", "archimedes-model-catalog"],
    ["/v1/chat/completions", "archimedes-connection-test"],
    ["/v1/chat/completions", "thread-abc"],
    ["/v1/chat/completions", "thread-abc"],
    ["/v1/chat/completions", "thread-def"],
    ["/v1/chat/completions", "review-123"],
  ]);
  for (const { headers } of requests.slice(1)) {
    assert.equal(headers["x-tenant"], "fixture-tenant");
    assert.equal(headers["user-agent"], "Archimedes/0.1.0");
    assert.equal(headers.authorization, "Bearer test-key");
  }
  await assert.rejects(modelConfig.testModelConfig({ ...connection, headers: {}, sessionHeader: null }), /MissingSessionID/);
  assert.equal(requests.at(-1).headers["x-tenant"], undefined);
});

test("the reproduction executor includes its run ID on every model request", async () => {
  const main = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const start = main.indexOf("  const executeRun = async (session) => {");
  const end = main.indexOf('  ipcMain.handle("reproduction:run"', start);
  const requests = [];
  const runtime = {
    runPilot: async ({ complete }) => {
      for (const prompt of ["First decision", "Second decision"]) await complete({ system: "Pilot", prompt });
      return { status: "verified" };
    },
    reproductionModel: () => ({
      provider: "opencode-go", baseUrl: "https://reproduction.fixture.example/v1", model: "test", apiKey: "fixture-key",
      sessionHeader: { name: "x-opencode-session", strategy: "thread" },
    }),
    completeJson: (model, options) => paperReviewModel.completeJson(model, {
      ...options,
      fetchImpl: async (_url, { headers }) => {
        requests.push(headers["x-opencode-session"]);
        return Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"action":"done"}' } }] });
      },
    }),
    store: { updateReproduction() {}, updateReproductionRun() {} },
    reproductionEnvItems: () => [],
    stopSession: async () => {},
    notifyRunFinished() {},
  };
  const executeRun = new Function(...Object.keys(runtime), `${main.slice(start, end)}\nreturn executeRun;`)(...Object.values(runtime));
  for (const id of ["run-first", "run-second"]) {
    await executeRun({ record: { id: "reproduction" }, run: { id }, contract: {}, backend: {}, send() {} });
  }
  assert.deepEqual(requests, ["run-first", "run-first", "run-second", "run-second"]);
});
