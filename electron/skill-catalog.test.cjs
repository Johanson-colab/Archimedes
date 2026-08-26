const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { listSkillCollections, listSkills, parseSkillDocument, readSkill } = require("./skill-catalog.cjs");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-skills-"));
  const skill = path.join(root, "AI-Research-SKILLs", "21-research-ideation", "idea-spark");
  fs.mkdirSync(skill, { recursive: true });
  fs.writeFileSync(path.join(skill, "SKILL.md"), "---\nname: idea-spark\ndescription: Turn observations into testable hypotheses.\n---\n\n# Idea Spark\n", "utf8");
  const arisSource = path.join(root, ".aris-source", "research-lit");
  const arisRoot = path.join(root, ".agents", "skills");
  fs.mkdirSync(arisSource, { recursive: true });
  fs.mkdirSync(arisRoot, { recursive: true });
  fs.writeFileSync(path.join(arisSource, "SKILL.md"), "---\nname: research-lit\ndescription: Search and synthesize research literature.\n---\n\n# Research Lit\n", "utf8");
  fs.symlinkSync(arisSource, path.join(arisRoot, "research-lit"));
  return root;
}

test("parses scalar and block skill descriptions", () => {
  assert.deepEqual(parseSkillDocument("---\nname: demo\ndescription: A concise skill.\n---\n# Demo\n", "fallback"), { name: "demo", description: "A concise skill." });
  assert.equal(parseSkillDocument("---\nname: demo\ndescription: |\n  First line.\n  Second line.\n---\n", "fallback").description, "First line. Second line.");
});

test("indexes collections and reads a catalog skill", () => {
  const root = fixture();
  const collections = listSkillCollections(root, root);
  assert.equal(collections.length, 6);
  assert.equal(collections.find((collection) => collection.id === "AI-Research-SKILLs").skillCount, 1);
  assert.equal(collections.find((collection) => collection.id === "ARIS").skillCount, 1);

  const skills = listSkills(root, "AI-Research-SKILLs", root);
  assert.equal(skills.length, 1);
  assert.equal(skills[0].category, "Research Ideation");
  assert.equal(readSkill(root, skills[0].id, root).content.includes("# Idea Spark"), true);
  const aris = listSkills(root, "ARIS", root);
  assert.equal(aris[0].category, "Literature & Evidence");
  assert.equal(readSkill(root, aris[0].id, root).content.includes("# Research Lit"), true);
  assert.throws(() => readSkill(root, "../outside", root), /outside the Skills directory/);
});
