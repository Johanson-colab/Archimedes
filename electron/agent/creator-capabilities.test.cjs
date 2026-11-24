const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { execFileSync, spawnSync } = require("node:child_process");
const test = require("node:test");
const capabilities = require("./creator-capabilities.cjs");
const { prepareConversation } = require("./context.cjs");
const { userPrompt } = require("./codex-backend.cjs");
const { discoverSkills } = require("./api-skills.cjs");
const root = path.join(__dirname, "../assets/research-capabilities");
const index = require("../assets/research-capabilities/catalog.json");
const sha = (value) => createHash("sha256").update(value).digest("hex");

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-creator-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("curated bundle preserves every selected resource, source version and license", () => {
  const selection = require("../../shared/creator-capability-selection.json");
  assert.equal(index.items.length, 56);
  assert.deepEqual(index.items.map((item) => item.id), selection.items.map((item) => item.id));
  assert.match(index.source.commit, /^[a-f0-9]{40}$/);
  assert.equal(sha(fs.readFileSync(path.join(root, index.source.licenseFile))), index.source.licenseSha256);
  for (const item of index.items) {
    assert.equal(item.validation.runtime, "not-verified");
    assert.notEqual(item.version, "unknown");
    assert.ok(item.files["SKILL.md"]);
    assert.equal(item.contentHash, sha(Buffer.from(JSON.stringify({ files: item.files, executableFiles: item.executableFiles }))));
    for (const category of item.categories) assert.ok(index.categories.some((entry) => entry.id === category));
    for (const [relative, hash] of Object.entries(item.files)) {
      assert.equal(sha(fs.readFileSync(path.join(root, "packages", item.id, relative))), hash, `${item.id}/${relative}`);
    }
  }
});

test("goal retrieval works across English, Chinese, specialist tasks and exact IDs", () => {
  for (const [query, expected] of [
    ["做一个每周追踪新论文的文献追踪台", "paper-lookup"],
    ["统计分析，比较两组差异并计算效应量", "statistical-analysis"],
    ["single cell RNA sequencing QC and clusters", "scanpy"],
    ["化学分子SMILES结构分析", "rdkit"],
    ["天文FITS数据处理", "astropy"],
    ["publication multi-panel scientific-visualization", "scientific-visualization"],
    ["科研写作和引用证据", "scientific-writing"],
  ]) {
    const result = capabilities.searchCapabilities({ query, limit: 8 });
    assert.ok(result.candidates.some((item) => item.id === expected), `${query}: ${result.candidates.map((item) => item.id)}`);
    assert.ok(result.candidates.length <= 8);
    assert.ok(result.candidates.every((item) => !Object.hasOwn(item, "content")));
  }
  assert.deepEqual(capabilities.searchCapabilities({ query: "zzzznotacapability" }).candidates, []);
  assert.throws(() => capabilities.searchCapabilities({ category: "biology" }), /Unknown research category/);
  assert.throws(() => capabilities.searchCapabilities({ query: "x".repeat(2001) }), /bounded/);
});

test("catalog browsing is bounded and pages through all entries without forcing a selection", () => {
  const ids = [];
  let offset = 0;
  do {
    const result = capabilities.searchCapabilities({ offset, limit: 12 });
    ids.push(...result.candidates.map((item) => item.id));
    offset = result.next_offset;
  } while (offset !== null);
  assert.equal(new Set(ids).size, index.items.length);
  const writing = capabilities.searchCapabilities({ category: "writing", limit: 12 });
  assert.ok(writing.candidates.every((item) => item.categories.includes("writing")));
});

test("resource reads are paged, integrity checked and confined to listed files", () => {
  const page = capabilities.readCapability({ id: "paper-lookup", limit: 300 });
  assert.equal(page.content.length, 300);
  assert.equal(page.next_offset, 300);
  const next = capabilities.readCapability({ id: "paper-lookup", offset: page.next_offset, limit: 300 });
  const original = fs.readFileSync(path.join(root, "packages/paper-lookup/SKILL.md"), "utf8");
  assert.equal(page.content + next.content, original.slice(0, 600));
  const script = page.resources.find((resource) => resource.startsWith("scripts/") && resource.endsWith(".py"));
  assert.ok(script);
  assert.ok(capabilities.readCapability({ id: "paper-lookup", path: script }).content.length);
  for (const resource of ["../../LICENSE.md", "/etc/passwd", "references/../SKILL.md", "scripts\\..\\SKILL.md", "not-present.py"]) {
    assert.throws(() => capabilities.readCapability({ id: "paper-lookup", path: resource }), /unsafe|Unknown/);
  }
  assert.throws(() => capabilities.readCapability({ id: "not-present" }), /Unknown/);
});

test("dependency planning supports zero, one or multiple skills without requiring an Agent", () => {
  assert.deepEqual(capabilities.planDependencies({ ids: [] }).capabilities, []);
  assert.equal(capabilities.planDependencies({ ids: [] }).agentRequired, null);
  const plan = capabilities.planDependencies({ ids: ["paper-lookup", "statistical-analysis"] });
  assert.equal(plan.capabilities.length, 2);
  assert.equal(plan.capabilities[0].contentHash, index.items.find((item) => item.id === "paper-lookup").contentHash);
  assert.ok(plan.capabilities[0].files["SKILL.md"]);
  assert.throws(() => capabilities.planDependencies({ ids: ["paper-lookup", "paper-lookup"] }), /unique/);
  assert.throws(() => capabilities.planDependencies({ ids: ["made-up"] }), /Unknown/);
});

test("per-App export carries complete resources and version lock without global discovery or overwrite", (t) => {
  const workspace = temporary(t);
  const result = capabilities.exportAppCapabilities({ workspace, appId: "literature-tracker", ids: ["paper-lookup", "scientific-schematics"] });
  const exported = path.join(workspace, result.appPath, ".capabilities");
  const lock = JSON.parse(fs.readFileSync(path.join(exported, "lock.json")));
  for (const [relative, hash] of Object.entries(lock.capabilities[0].files)) {
    assert.equal(sha(fs.readFileSync(path.join(exported, "paper-lookup", relative))), hash);
  }
  assert.ok(fs.existsSync(path.join(exported, "LICENSE.md")));
  if (process.platform !== "win32") assert.ok(fs.statSync(path.join(exported, "scientific-schematics/scripts/example_usage.sh")).mode & 0o100);
  assert.deepEqual(discoverSkills(workspace), []);
  for (const directory of [".agents", ".claude", ".codex", ".opencode"]) assert.equal(fs.existsSync(path.join(workspace, directory)), false);
  assert.throws(() => capabilities.exportAppCapabilities({ workspace, appId: "literature-tracker", ids: [] }), /already exist/);
  assert.equal(fs.readdirSync(path.dirname(exported)).some((entry) => entry.startsWith(".capabilities-")), false);
});

test("exports refuse path traversal and linked directories", (t) => {
  const workspace = temporary(t);
  const elsewhere = temporary(t);
  for (const appId of ["../outside", "test/nested", "", ".agents", "Bad-ID"]) {
    assert.throws(() => capabilities.exportAppCapabilities({ workspace, appId, ids: [] }), /App ID/);
  }
  fs.symlinkSync(elsewhere, path.join(workspace, "research-apps"), "dir");
  assert.throws(() => capabilities.exportAppCapabilities({ workspace, appId: "test", ids: [] }), /real workspace directories/);
  assert.deepEqual(fs.readdirSync(elsewhere), []);
});

test("Creator tools refuse ordinary modes even if arguments request Create", () => {
  for (const mode of [undefined, "standard", "research", "paper-review"]) {
    assert.throws(() => capabilities.invokeCreatorTool("search_research_capabilities", { query: "create statistical-analysis", mode: "create" }, mode), /only available in Create/);
  }
  assert.ok(capabilities.invokeCreatorTool("search_research_capabilities", { query: "paper-lookup" }, "create").candidates.length);
});

test("the API tool registry enforces the caller's mode, not a model-supplied argument", async () => {
  const { executeTool, createToolRegistry } = require("../agent.cjs");
  const registry = createToolRegistry();
  const call = { id: "creator-search", function: { name: "search_research_capabilities", arguments: JSON.stringify({ query: "文献追踪" }) } };
  for (const mode of [undefined, "standard", "research"]) {
    await assert.rejects(executeTool({ call, registry, mode }), /only available in Create/);
  }
  const result = await executeTool({ call, registry, mode: "create" });
  assert.ok(JSON.parse(result.content).candidates.some((item) => item.id === "paper-lookup"));
});

test("Create instructions reach API and shared native prompts on new and resumed turns only", () => {
  for (const mode of ["standard", "research", "create"]) {
    const turn = { id: "t", mode, user_message: "Make a tracker" };
    const thread = { id: "t", mode, turns: [turn] };
    const api = prepareConversation({ thread, currentTurnId: "t", mode }).messages[0].content;
    for (const resume of [false, true]) {
      const native = userPrompt(thread, turn, resume, [], "No experiment bridge");
      if (mode === "create") {
        assert.match(api, /search_research_capabilities/);
        assert.match(native, /creator-capabilities-cli.cjs/);
        assert.match(native, /no global skill installation is necessary/);
        assert.match(native, /zero, one or multiple/);
        assert.doesNotMatch(native, /# Paper Lookup/);
      } else {
        assert.doesNotMatch(api, /search_research_capabilities/);
        assert.doesNotMatch(native, /creator-capabilities-cli/);
      }
    }
  }
});

test("native CLI searches, reads and exports without a provider or global skill installation", (t) => {
  const workspace = temporary(t);
  const cli = path.join(__dirname, "creator-capabilities-cli.cjs");
  const call = (operation, args) => JSON.parse(execFileSync(process.execPath, [cli, operation, JSON.stringify(args)], { encoding: "utf8" }));
  assert.ok(call("search", { query: "文献追踪" }).candidates.some((item) => item.id === "paper-lookup"));
  assert.match(call("read", { id: "paper-lookup", limit: 500 }).content, /Paper Lookup|paper-lookup/);
  assert.deepEqual(call("plan", { ids: [] }).capabilities, []);
  assert.ok(call("export", { workspace, appId: "test-app", ids: ["paper-lookup"] }).lockPath);
  const invalid = spawnSync(process.execPath, [cli, "execute", "{}"], { encoding: "utf8" });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Use search/);
});
