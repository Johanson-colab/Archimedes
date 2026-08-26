const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const IGNORED_NAMES = new Set([".git", ".github", "node_modules", "dist", "build", "__pycache__"]);
const MAX_SKILL_BYTES = 500_000;

const COLLECTION_METADATA = {
  "AI-Research-SKILLs": {
    name: "AI Research Skills",
    description: "Model engineering, agents, evaluation, RAG, training, and research ideation.",
  },
  "Research-Paper-Writing-Skills": {
    name: "Research Paper Writing",
    description: "Reviewer-facing structure, argument flow, evidence alignment, and paper revision.",
  },
  "academic-research-skills": {
    name: "Academic Research",
    description: "Deep research, academic pipelines, paper drafting, and rigorous review workflows.",
  },
  "nature-skills": {
    name: "Nature Research Toolkit",
    description: "Literature reading, figures, citations, statistics, proposals, and publication workflows.",
  },
  "paper-craft-skills": {
    name: "Paper Craft",
    description: "Turn papers into polished analysis pages, visual stories, and presentation decks.",
  },
  "scientific-agent-skills": {
    name: "Scientific Agents",
    description: "Reusable capabilities for autonomous scientific agents and experiment workflows.",
  },
};

function normalizeRelative(value = "") {
  return String(value || "").replaceAll("\\", "/").replace(/^\/+/, "");
}

function resolveSkillsRoot(workspace, preferredRoot) {
  const candidates = [
    preferredRoot,
    process.env.ARCHIMEDES_SKILLS_ROOT,
    workspace && path.join(path.resolve(workspace), "Skills"),
    workspace && path.join(path.dirname(path.resolve(workspace)), "Skills"),
    path.join(os.homedir(), "Documents", "AI Research", "Skills"),
  ].filter(Boolean);
  return candidates.map((candidate) => path.resolve(candidate)).find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) || null;
}

function pathInside(root, relative) {
  if (!root) throw new Error("The Skills directory is unavailable.");
  const target = path.resolve(root, normalizeRelative(relative));
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error("The requested skill is outside the Skills directory.");
  return target;
}

function frontmatterValue(frontmatter, key) {
  const lines = frontmatter.split(/\r?\n/);
  const index = lines.findIndex((line) => line.match(new RegExp(`^${key}:\\s*`)));
  if (index < 0) return "";
  const raw = lines[index].replace(new RegExp(`^${key}:\\s*`), "").trim();
  if (/^[|>][+-]?$/.test(raw)) {
    return collectIndented(lines, index + 1);
  }
  return raw.replace(/^(["'])(.*)\1$/, "$2").trim();
}

function collectIndented(lines, start) {
  const values = [];
  for (let index = start; index < lines.length; index += 1) {
    if (!/^\s+/.test(lines[index]) && lines[index].trim()) break;
    values.push(lines[index].trim());
  }
  return values.join(" ").trim();
}

function parseSkillDocument(content, fallbackName) {
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n)?/);
  const frontmatter = match?.[1] || "";
  const body = match ? content.slice(match[0].length) : content;
  const name = frontmatterValue(frontmatter, "name") || fallbackName;
  const firstParagraph = body.split(/\r?\n\s*\r?\n/).map((part) => part.replace(/^#+\s+.*$/gm, "").trim()).find(Boolean) || "";
  const description = frontmatterValue(frontmatter, "description") || firstParagraph.replace(/\s+/g, " ").slice(0, 320);
  return { name, description };
}

function displayCategory(relativeDirectory) {
  const parts = normalizeRelative(relativeDirectory).split("/").filter(Boolean);
  const categoryParts = parts.slice(0, -1).filter((part) => part.toLowerCase() !== "skills");
  const value = categoryParts.at(-1) || "General";
  return value.replace(/^\d+[-_]?/, "").replaceAll(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function walkSkills(collectionPath) {
  const results = [];
  function visit(directory, depth = 0) {
    if (depth > 5) return;
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
    if (entries.some((entry) => entry.isFile() && entry.name === "SKILL.md")) {
      results.push(directory);
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || IGNORED_NAMES.has(entry.name) || entry.name.startsWith(".")) continue;
      visit(path.join(directory, entry.name), depth + 1);
    }
  }
  visit(collectionPath);
  return results;
}

function skillSummary(root, collectionId, skillDirectory) {
  const manifest = path.join(skillDirectory, "SKILL.md");
  const stats = fs.statSync(manifest);
  if (stats.size > MAX_SKILL_BYTES) return null;
  const content = fs.readFileSync(manifest, "utf8");
  const relativeDirectory = path.relative(path.join(root, collectionId), skillDirectory).split(path.sep).join("/");
  const parsed = parseSkillDocument(content, path.basename(skillDirectory));
  return {
    id: path.relative(root, skillDirectory).split(path.sep).join("/"),
    collectionId,
    collectionName: COLLECTION_METADATA[collectionId]?.name || collectionId,
    name: parsed.name,
    description: parsed.description,
    category: displayCategory(relativeDirectory),
    path: skillDirectory,
  };
}

function listSkillCollections(workspace, preferredRoot) {
  const root = resolveSkillsRoot(workspace, preferredRoot);
  if (!root) return [];
  const discovered = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name);
  const collectionIds = [...new Set([...Object.keys(COLLECTION_METADATA), ...discovered])];
  return collectionIds
    .map((collectionId) => {
      const metadata = COLLECTION_METADATA[collectionId] || { name: collectionId, description: "Local research skills collection." };
      const collectionPath = path.join(root, collectionId);
      const skillCount = fs.existsSync(collectionPath) && fs.statSync(collectionPath).isDirectory() ? walkSkills(collectionPath).length : 0;
      return { id: collectionId, ...metadata, skillCount };
    })
    .sort((left, right) => Object.keys(COLLECTION_METADATA).indexOf(left.id) - Object.keys(COLLECTION_METADATA).indexOf(right.id));
}

function listSkills(workspace, collectionId = "", preferredRoot) {
  const root = resolveSkillsRoot(workspace, preferredRoot);
  if (!root) return [];
  const collectionIds = collectionId
    ? [normalizeRelative(collectionId)]
    : listSkillCollections(workspace, preferredRoot).map((collection) => collection.id);
  return collectionIds.flatMap((id) => {
    if (!id || id.includes("/")) return [];
    const collectionPath = pathInside(root, id);
    if (!fs.existsSync(collectionPath) || !fs.statSync(collectionPath).isDirectory()) return [];
    return walkSkills(collectionPath).flatMap((directory) => {
      try { return skillSummary(root, id, directory) || []; } catch { return []; }
    });
  }).sort((left, right) => left.category.localeCompare(right.category) || left.name.localeCompare(right.name));
}

function readSkill(workspace, skillId, preferredRoot) {
  const root = resolveSkillsRoot(workspace, preferredRoot);
  const skillDirectory = pathInside(root, skillId);
  const manifest = path.join(skillDirectory, "SKILL.md");
  if (!fs.existsSync(manifest) || !fs.statSync(manifest).isFile()) throw new Error("SKILL.md was not found for this skill.");
  const stats = fs.statSync(manifest);
  if (stats.size > MAX_SKILL_BYTES) throw new Error("This SKILL.md is too large to preview.");
  const collectionId = normalizeRelative(skillId).split("/")[0];
  const summary = skillSummary(root, collectionId, skillDirectory);
  if (!summary) throw new Error("This skill cannot be previewed.");
  return { ...summary, content: fs.readFileSync(manifest, "utf8") };
}

module.exports = { listSkillCollections, listSkills, parseSkillDocument, readSkill, resolveSkillsRoot };
