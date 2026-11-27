// Task-owned resources only. No global installs, renderer builds, or paid APIs.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const repository = path.resolve(__dirname, "../../../..");
const handoff = require(path.join(repository, "docs/reviews/2026-11-16-system-review/implementation-evidence/v03-resource-handoff.json"));
const manifest = require(path.join(repository, "shared/latex-engine.json"));
const { verifyEngineArchive, ensureManagedEngine } = require(path.join(repository, "electron/managed-latex-engine.cjs"));
const resourceRoot = path.dirname(handoff.cache), flat = path.join(resourceRoot, "flat-live-bundle"), resources = path.join(resourceRoot, "managed-resources");
const source = handoff.bundle_directory, indexFile = `${source}.index`;
const fonts = ["phvb.tfm", "phvb.vf", "phvb8r.tfm", "8r.enc", "uhvb8a.pfb"];
const hash = value => createHash("sha256").update(value).digest("hex");
(async () => {
  const entries = new Map(fs.readFileSync(indexFile, "utf8").trim().split("\n").map(line => {
    const [name, offset, size] = line.split(" "); return [name, { offset: Number(offset), size: Number(size) }];
  }));
  fs.mkdirSync(flat, { recursive: true });
  for (const name of fs.readdirSync(source)) {
    const file = path.join(source, name);
    if (fs.statSync(file).isFile() && !fs.existsSync(path.join(flat, name))) fs.copyFileSync(file, path.join(flat, name));
  }
  const downloads = await Promise.all(fonts.map(async name => {
    const item = entries.get(name); if (!item) throw new Error(`The official bundle index lacks ${name}`);
    const target = path.join(flat, name);
    if (fs.existsSync(target) && fs.statSync(target).size === item.size) return { name, bytes: item.size, reused: true, sha256: hash(fs.readFileSync(target)) };
    const response = await fetch(manifest.bundleUrl, { headers: { Range: `bytes=${item.offset}-${item.offset + item.size - 1}` }, signal: AbortSignal.timeout(30_000) });
    if (response.status !== 206 || !String(response.headers.get("content-range")).startsWith(`bytes ${item.offset}-${item.offset + item.size - 1}/`)) { await response.body?.cancel(); throw new Error(`The official bundle did not honor the range for ${name}`); }
    const data = Buffer.from(await response.arrayBuffer()); if (data.length !== item.size) throw new Error(`Incomplete ${name}`);
    fs.writeFileSync(`${target}.part`, data); fs.renameSync(`${target}.part`, target);
    return { name, bytes: data.length, reused: false, sha256: hash(data) };
  }));
  // The flat subset is a test fixture with its own content identity; it is not
  // presented as the complete upstream bundle or shipped to users.
  const digest = createHash("sha256");
  for (const name of fs.readdirSync(flat).filter(name => name !== "SHA256SUM").sort()) digest.update(name).update(fs.readFileSync(path.join(flat, name)));
  fs.writeFileSync(path.join(flat, "SHA256SUM"), digest.digest("hex") + "\n");
  const archiveFile = path.join(resources, "latex-engine/engine.tar.gz");
  const partial = `${archiveFile}.part`, asset = manifest.platforms[`${process.platform}-${process.arch}`];
  if (!fs.existsSync(archiveFile) && fs.existsSync(partial)) {
    const pending = fs.readFileSync(partial);
    if (hash(pending) !== asset.sha256) throw new Error(`Official archive is incomplete or not yet verified (${pending.length} bytes); keep the partial file and resume its download.`);
    verifyEngineArchive(pending, asset); fs.renameSync(partial, archiveFile);
  }
  if (!fs.existsSync(archiveFile)) throw new Error("Official engine archive download is still incomplete; font progress retained.");
  const archive = fs.readFileSync(archiveFile); verifyEngineArchive(archive, asset);
  const executable = await ensureManagedEngine({ runtimeRoot: path.join(resourceRoot, "official-runtime"), resourcesPath: resources,
    fetchImpl: async () => { throw new Error("The verified archive must supply the engine offline."); } });
  const defaultCache = path.join(resourceRoot, "official-runtime/tex-cache");
  if (!fs.existsSync(defaultCache)) fs.cpSync(handoff.cache, defaultCache, { recursive: true });
  const upstreamData = path.join(defaultCache, "bundles/data", handoff.bundle_hash);
  for (const name of fonts) fs.copyFileSync(path.join(flat, name), path.join(upstreamData, name));
  const result = { resourceRoot, bundle: flat, resources, executable, engineVersion: manifest.version, archiveBytes: archive.length,
    archiveSha256: hash(archive), executableSha256: hash(fs.readFileSync(executable)), fonts: downloads,
    runtimeRoot: path.join(resourceRoot, "official-runtime"), defaultCache, defaultBundle: manifest.bundleUrl,
    flatSubsetFiles: fs.readdirSync(flat).length, source: manifest.bundleUrl, cleanup: "Retain this task-owned resource directory until unified acceptance, then remove it." };
  fs.writeFileSync(path.join(resourceRoot, "official-live-resource-handoff.json"), JSON.stringify(result, null, 2) + "\n");
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
})().catch(error => { process.stderr.write(error.stack + "\n"); process.exitCode = 1; });
