const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const modelConfig = require("./model-config.cjs");
const { getModelCapabilities } = require("./agent/model-capabilities.cjs");

function tempUser() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-registry-"));
}

test("legacy single model config migrates into the registry", () => {
  const directory = tempUser();
  fs.writeFileSync(path.join(directory, "model-config.json"), JSON.stringify({
    agent: { provider: "custom", baseUrl: "https://example.test/v1", model: "legacy-model", apiKey: "legacy-key" },
  }));
  modelConfig.initializeModelConfig(directory);
  const profiles = modelConfig.listModelProfiles();
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].id, "legacy-agent");
  assert.equal(profiles[0].model, "legacy-model");
  assert.deepEqual(modelConfig.getRoleAssignments(), { agent: "legacy-agent", proactive: null });
});

test("multiple profiles coexist and role assignments are independent", () => {
  const directory = tempUser();
  modelConfig.initializeModelConfig(directory);
  const first = modelConfig.saveModelProfile({ id: "cheap", label: "Cheap", provider: "custom", baseUrl: "https://a.test/v1", model: "cheap-model", apiKey: "k1", contextWindowTokens: 128000, maxOutputTokens: 4096 });
  const second = modelConfig.saveModelProfile({ id: "strong", label: "Strong", provider: "custom", baseUrl: "https://b.test/v1", model: "strong-model", apiKey: "k2", contextWindowTokens: 1000000, maxOutputTokens: 16384 });
  assert.equal(modelConfig.listModelProfiles().length, 2);
  modelConfig.setRoleModel("agent", first.id);
  modelConfig.setRoleModel("proactive", second.id);
  assert.equal(modelConfig.getActiveModelConfig("agent").model, "cheap-model");
  assert.equal(modelConfig.getActiveModelConfig("proactive").model, "strong-model");
  modelConfig.deleteModelProfile(first.id);
  assert.equal(modelConfig.listModelProfiles().length, 1);
  assert.equal(modelConfig.getRoleAssignments().agent, null);
  assert.equal(modelConfig.getActiveModelConfig("proactive").model, "strong-model");
});

test("per-model metadata overrides guessed capabilities", () => {
  const config = {
    provider: "custom",
    model: "unknown-model",
    contextWindowTokens: 200000,
    maxOutputTokens: 32000,
    capabilities: { thinkingEfforts: ["low", "high"], supportsVision: true, supportsTools: false },
  };
  const capabilities = getModelCapabilities(config);
  assert.deepEqual(capabilities.thinkingEfforts, ["low", "high"]);
  assert.equal(capabilities.supportsVision, true);
  assert.equal(capabilities.supportsTools, false);
  assert.equal(capabilities.contextCharacterLimits.standard, 800000);
  assert.equal(capabilities.contextCharacterLimits["extra-long"], 800000);
  assert.equal(capabilities.maxOutputTokens, 32000);
});

test("saving through the compatibility API writes a registry profile", () => {
  const directory = tempUser();
  modelConfig.initializeModelConfig(directory);
  const publicConfig = modelConfig.saveModelConfig({
    provider: "custom",
    baseUrl: "https://opencode.ai/inference/go/openai/v1",
    model: "hy4-flash-free",
    apiKey: "test-key",
    label: "Go free",
    contextWindowTokens: 262144,
    maxOutputTokens: 8192,
  });
  assert.equal(publicConfig.modelLabel, "Go free");
  assert.equal(modelConfig.listModelProfiles().length, 1);
  assert.equal(modelConfig.getRoleAssignments().agent, publicConfig.modelId);
});

test("creating and editing profiles on the same endpoint keeps their credentials separate", (context) => {
  const directory = tempUser();
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  modelConfig.initializeModelConfig(directory);
  const endpoint = { provider: "custom", baseUrl: "https://example.test/v1" };
  const original = modelConfig.saveModelConfig({ ...endpoint, model: "original", apiKey: "original-fixture-key" });
  const newProfile = { ...endpoint, id: null, model: "separate" };
  assert.throws(() => modelConfig.saveModelConfig(newProfile), /valid API key/);
  const separate = modelConfig.saveModelConfig({ ...newProfile, apiKey: "separate-fixture-key" });
  assert.notEqual(separate.modelId, original.modelId);
  assert.equal(modelConfig.listModelProfiles().length, 2);

  modelConfig.saveModelConfig({ ...endpoint, id: original.modelId, model: "original-edited" });
  assert.equal(modelConfig.getActiveModelConfig().apiKey, "original-fixture-key");
  modelConfig.setRoleModel("proactive", separate.modelId);
  modelConfig.initializeModelConfig(directory);
  assert.equal(modelConfig.getActiveModelConfig().model, "original-edited");
  assert.equal(modelConfig.getActiveModelConfig("proactive").model, "separate");
  assert.equal(modelConfig.getActiveModelConfig("proactive").apiKey, "separate-fixture-key");
});

test("deleting a migrated profile stays deleted after reopening the registry", (context) => {
  const directory = tempUser();
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, "model-config.json"), JSON.stringify({
    provider: "custom", baseUrl: "https://example.test/v1", model: "legacy-model", apiKey: "legacy-key",
  }));
  modelConfig.initializeModelConfig(directory);
  assert.equal(modelConfig.getPublicModelConfig().modelId, "legacy-agent");
  modelConfig.deleteModelProfile("legacy-agent");
  assert.equal(modelConfig.getPublicModelConfig().modelId, "");
  modelConfig.initializeModelConfig(directory);
  assert.deepEqual(modelConfig.listModelProfiles(), []);
  assert.equal(modelConfig.getPublicModelConfig().modelId, "");
});

test("basic role edits preserve a shared profile while explicit edits update it", (context) => {
  const directory = tempUser();
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  modelConfig.initializeModelConfig(directory);
  const endpoint = { provider: "custom", baseUrl: "https://example.test/v1" };
  const original = modelConfig.saveModelConfig({
    ...endpoint, model: "shared", apiKey: "fixture-key",
    headers: { "x-tenant": "fixture" }, contextWindowTokens: 24_000, maxOutputTokens: 321,
  });
  modelConfig.setRoleModel("proactive", original.modelId);
  assert.equal(modelConfig.getPublicModelConfig("agent").sharedAcrossRoles, true);

  modelConfig.saveModelConfig({ ...endpoint, id: original.modelId, model: "shared-renamed" }, "proactive");
  assert.equal(modelConfig.getActiveModelConfig("agent").model, "shared-renamed");

  const dedicated = modelConfig.saveModelConfig({ ...endpoint, model: "dedicated" }, "proactive");
  assert.notEqual(dedicated.modelId, original.modelId);
  assert.equal(modelConfig.getActiveModelConfig("agent").model, "shared-renamed");
  assert.equal(modelConfig.getActiveModelConfig("proactive").apiKey, "fixture-key");
  assert.equal(modelConfig.getActiveModelConfig("proactive").headers["x-tenant"], "fixture");
  assert.equal(dedicated.contextWindowTokens, 24_000);
  assert.equal(dedicated.maxOutputTokens, 321);
  assert.equal(dedicated.sharedAcrossRoles, false);
});
