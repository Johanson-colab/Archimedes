// Explicit, offline import. Never installs scientific packages or global skills.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { parseSkillDocument } = require("../electron/skill-catalog.cjs");

const target = path.join(__dirname, "../electron/assets/research-capabilities");
const hash = (buffer) => createHash("sha256").update(buffer).digest("hex");
function scalar(text, field) {
  const lines = text.split(/\r?\n/);
  const index = lines.findIndex((line) => line.startsWith(`${field}:`));
  if (index < 0) return "";
  const value = lines[index].slice(field.length + 1).trim();
  if (/^[>|][+-]?$/.test(value)) {
    const parts = [];
    for (let i = index + 1; i < lines.length && /^\s/.test(lines[i]); i++) parts.push(lines[i].trim());
    return parts.join(" ");
  }
  return value.replace(/^(["'])(.*)\1$/, "$2");
}
function collect(root, directory = root, files = {}) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
    if (entry.name.startsWith(".") || ["__pycache__", "node_modules"].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Linked upstream resource: ${file}`);
    if (entry.isDirectory()) collect(root, file, files);
    else if (entry.isFile()) files[path.relative(root, file).split(path.sep).join("/")] = fs.readFileSync(file);
  }
  return files;
}
function importCapabilities(source) {
  const selection = require("../shared/creator-capability-selection.json");
  const commit = execFileSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const dirty = execFileSync("git", ["-C", source, "status", "--porcelain", "--", "skills", "LICENSE.md"], { encoding: "utf8" });
  if (dirty.trim()) throw new Error("Import a clean upstream checkout so the recorded commit identifies the resources.");
  if (fs.existsSync(target)) throw new Error("Capability bundle already exists. Preserve/review it before importing a replacement.");
  const staging = fs.mkdtempSync(path.join(path.dirname(target), ".research-capabilities-"));
  try {
    const items = selection.items.map((item) => {
      const files = collect(path.join(source, "skills", item.id));
      const document = files["SKILL.md"].toString("utf8");
      const frontmatter = document.split("---")[1];
      const parsed = parseSkillDocument(document, item.id);
      if (parsed.name !== item.id) throw new Error(`Upstream skill name mismatch: ${item.id}`);
      const hashes = {};
      const executableFiles = [];
      for (const [relative, content] of Object.entries(files)) {
        const destination = path.join(staging, "packages", item.id, relative);
        const executable = Boolean(fs.statSync(path.join(source, "skills", item.id, relative)).mode & 0o111);
        if (executable) executableFiles.push(relative);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, content, { mode: executable ? 0o755 : 0o644 });
        hashes[relative] = hash(content);
      }
      return {
        ...item, description: parsed.description,
        version: /\n  version:\s*["']([^"']+)["']/.exec(frontmatter)?.[1] || "unknown",
        license: scalar(frontmatter, "license") || "See upstream LICENSE.md and resource notices",
        requirements: scalar(frontmatter, "compatibility"),
        environmentHints: [...new Set(document.match(/\b[A-Z][A-Z0-9_]*(?:_API_KEY|_API_TOKEN|_TOKEN)\b/g) || [])].sort(),
        validation: { bundle: "integrity-checked", runtime: "not-verified" },
        files: hashes,
        executableFiles,
        contentHash: hash(Buffer.from(JSON.stringify({ files: hashes, executableFiles }))),
      };
    });
    const license = fs.readFileSync(path.join(source, "LICENSE.md"));
    fs.writeFileSync(path.join(staging, "LICENSE.md"), license);
    const catalog = {
      schemaVersion: 1,
      source: { repository: "https://github.com/K-Dense-AI/scientific-agent-skills", commit, licenseFile: "LICENSE.md", licenseSha256: hash(license) },
      categories: require("../shared/research-apps.json").categories,
      items,
    };
    fs.writeFileSync(path.join(staging, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
    fs.renameSync(staging, target);
    return { count: items.length, commit, target };
  } finally { fs.rmSync(staging, { recursive: true, force: true }); }
}
if (require.main === module) {
  try {
    if (!process.argv[2]) throw new Error("Usage: node scripts/import-creator-capabilities.cjs <upstream-checkout>");
    console.log(JSON.stringify(importCapabilities(path.resolve(process.argv[2]))));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { importCapabilities };
