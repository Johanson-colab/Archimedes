const { randomUUID, createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { canonicalWorkspace, resolveResearchContext } = require("./workspace-context.cjs");
const { writableTarget } = require("./agent/workspace-tools.cjs");
const packages = require("./project-results.cjs");

// The window owns the data store; persisted project/session records own paths.
// No renderer-provided execution root or file path is accepted here.
function registerProjectResultCommands({ ipcMain, store, files = packages }) {
  const required = (id) => {
    const record = store.getProjectResultRecord(id);
    if (!record) throw new Error("Project result not found in this data workspace.");
    return record;
  };
  ipcMain.handle("project-results:list", (_event, input = {}) => store.listProjectResultRecords(input));
  ipcMain.handle("project-results:get", (_event, { id } = {}) => files.readPackage(required(id)));
  ipcMain.handle("project-results:read-file", (_event, { id, name } = {}) => files.readPackageFile(required(id), name));
  ipcMain.handle("project-results:stage-figure", (_event, { resultId, fileName, target } = {}) => {
    const record = required(resultId);
    const context = resolveResearchContext(store, { projectId: target?.projectId, workspaceId: target?.workspaceId,
      threadId: target?.threadId || undefined, workspace: target?.workspace });
    if (context.projectId !== record.projectId) throw new Error("The manuscript and result must belong to the same project.");
    if (typeof target?.mainPath !== "string" || !/\.tex$/i.test(target.mainPath)) throw new Error("Choose an existing manuscript main .tex file.");
    const main = writableTarget(context.workspace, target.mainPath);
    if (!fs.statSync(main.target).isFile()) throw new Error("Choose an existing manuscript main .tex file.");
    const detail = files.readPackage(record), entry = detail.files.find(file => file.name === fileName && file.role === "output");
    if (!entry || !/\.(png|jpe?g|pdf)$/i.test(entry.name)) throw new Error("Save an exported PNG, JPEG or PDF before adding this figure to a manuscript.");
    if (detail.fileState !== "ready") throw new Error("The saved result has changed or missing files. Save a current result before adding it to a manuscript.");
    const read = files.readPackageFile(record, entry.name);
    if (read.fileState !== "ready" || read.actualSha256 !== entry.sha256) throw new Error("The saved figure changed while it was being read.");
    const bytes = Buffer.from(read.content, read.encoding);
    const format = path.extname(entry.name).toLowerCase();
    const valid = format === ".png" ? bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
      : format === ".pdf" ? bytes.subarray(0, 5).toString("ascii") === "%PDF-" : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!valid) throw new Error("The saved output is not a valid PNG, JPEG or PDF image.");
    const relative = path.posix.join(path.posix.dirname(main.relative), "figures/results", `${record.id}-${entry.sha256.slice(0, 12)}-${entry.name}`);
    const destination = writableTarget(context.workspace, relative, true);
    const source = { resultId: record.id, manifestPath: record.manifestPath, sha256: entry.sha256, name: entry.name };
    let created = false;
    try {
      let fd;
      try { fd = fs.openSync(destination.target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600); created = true; fs.writeFileSync(fd, bytes); }
      catch (error) {
        if (error.code !== "EEXIST") throw error;
        const existing = writableTarget(context.workspace, relative);
        const readFd = fs.openSync(existing.target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
        try { if (createHash("sha256").update(fs.readFileSync(readFd)).digest("hex") !== entry.sha256) throw new Error("A different file already exists at the staged figure path."); }
        finally { fs.closeSync(readFd); }
      } finally { if (fd !== undefined) fs.closeSync(fd); }
      const receipt = writableTarget(context.workspace, `${relative}.source.json`);
      const metadata = { version: 1, projectId: context.projectId, workspaceId: context.workspaceId, executionRoot: context.workspace, path: relative, source };
      if (fs.existsSync(receipt.target)) {
        const fd = fs.openSync(receipt.target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
        try { if (JSON.stringify(JSON.parse(fs.readFileSync(fd, "utf8"))) !== JSON.stringify(metadata)) throw new Error("The staged figure source receipt has changed."); }
        finally { fs.closeSync(fd); }
      } else fs.writeFileSync(receipt.target, JSON.stringify(metadata), { flag: "wx", mode: 0o600 });
      if (context.thread) store.upsertArtifact({ threadId: context.thread.id, path: relative, title: `${record.title}: ${entry.name}`, kind: format === ".pdf" ? "pdf" : "image", sha256: entry.sha256, sizeBytes: bytes.length, source: `project-${record.kind}` });
      return { path: relative, sha256: entry.sha256, source };
    } catch (error) { if (created) fs.rmSync(destination.target, { force: true }); throw error; }
  });
  ipcMain.handle("project-results:save", (_event, input = {}) => {
    const existing = input.id ? required(input.id) : null;
    if (existing && (input.projectId !== existing.projectId || input.kind !== existing.kind
      || (input.workspaceId && input.workspaceId !== existing.workspaceId))) throw new Error("A saved result cannot move to another project or workspace.");
    const project = store.getResearchProject(input.projectId);
    if (!project || project.archived_at || !store.canAccessProject(project.id, "editor")) throw new Error("You do not have permission to save a project result.");
    const context = existing || (() => {
      const owner = resolveResearchContext(store, { projectId: input.projectId, workspaceId: input.workspaceId });
      return { projectId: owner.projectId, workspaceId: owner.workspaceId, executionRoot: owner.workspace };
    })();
    const threadId = input.threadId === undefined ? existing?.threadId || null : input.threadId;
    if (threadId) {
      const thread = store.getResearchThread(threadId);
      if (thread.project_id !== context.projectId || thread.workspace_id !== context.workspaceId
        || canonicalWorkspace(thread.workspace_path) !== context.executionRoot) throw new Error("The linked session does not belong to this project result.");
    }
    const receipt = files.savePackage({
      id: existing?.id || randomUUID(), projectId: context.projectId, workspaceId: context.workspaceId,
      executionRoot: context.executionRoot, threadId, kind: input.kind, title: input.title,
      manifest: input.manifest, files: input.files,
    });
    // The manifest is the durable file receipt. Report DB failure honestly;
    // filesystem writes and SQLite cannot be one transaction.
    store.registerProjectResult(receipt);
    return receipt;
  });
}

module.exports = { registerProjectResultCommands };
