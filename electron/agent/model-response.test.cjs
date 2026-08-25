const assert = require("node:assert/strict");
const test = require("node:test");
const { ModelProtocolError, StreamContentGuard, normalizeAssistantMessage, presentStoredAssistantMessage } = require("./model-response.cjs");

const dsml = `<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="read_workspace_file">
<｜｜DSML｜｜parameter name="path" string="true">phase0/openalex.json</｜｜DSML｜｜parameter>
</｜｜DSML｜｜invoke>
<｜｜DSML｜｜invoke name="search_academic_papers">
<｜｜DSML｜｜parameter name="query" string="true">agent memory</｜｜DSML｜｜parameter>
<｜｜DSML｜｜parameter name="limit">6</｜｜DSML｜｜parameter>
</｜｜DSML｜｜invoke>
</｜｜DSML｜｜tool_calls>`;

test("keeps native OpenAI tool calls as the primary protocol", () => {
  const native = [{ id: "call_1", type: "function", function: { name: "read_workspace_file", arguments: "{}" } }];
  const result = normalizeAssistantMessage({ content: "", tool_calls: native });
  assert.equal(result.protocol, "openai");
  assert.deepEqual(result.tool_calls, native);
});

test("normalizes DSML content into structured tool calls", () => {
  const result = normalizeAssistantMessage({ content: dsml, tool_calls: [] });
  assert.equal(result.protocol, "dsml");
  assert.equal(result.content, "");
  assert.equal(result.tool_calls.length, 2);
  assert.equal(result.tool_calls[0].function.name, "read_workspace_file");
  assert.deepEqual(JSON.parse(result.tool_calls[0].function.arguments), { path: "phase0/openalex.json" });
  assert.deepEqual(JSON.parse(result.tool_calls[1].function.arguments), { query: "agent memory", limit: 6 });
});

test("streams ordinary assistant text", () => {
  const output = [];
  const guard = new StreamContentGuard((delta) => output.push(delta));
  guard.push("这是正常");
  guard.push("回答");
  const message = normalizeAssistantMessage({ content: "这是正常回答" });
  guard.finish(message);
  assert.equal(output.join(""), "这是正常回答");
});

test("does not leak chunked DSML into assistant text", () => {
  const output = [];
  const guard = new StreamContentGuard((delta) => output.push(delta));
  for (const chunk of ["  <｜｜DS", "ML｜｜tool_calls>", dsml.slice(dsml.indexOf("\n") + 1)]) guard.push(chunk);
  const message = normalizeAssistantMessage({ content: `  ${dsml}` });
  guard.finish(message);
  assert.deepEqual(output, []);
  assert.equal(message.tool_calls.length, 2);
});

test("rejects malformed DSML instead of rendering it", () => {
  assert.throws(
    () => normalizeAssistantMessage({ content: "<｜｜DSML｜｜tool_calls><broken>" }),
    ModelProtocolError,
  );
});

test("replaces previously stored DSML with a diagnostic message", () => {
  const result = presentStoredAssistantMessage(dsml);
  assert.match(result, /internal tool-call protocol/);
  assert.equal(result.includes("DSML"), false);
  assert.equal(presentStoredAssistantMessage("A normal saved answer"), "A normal saved answer");
});
