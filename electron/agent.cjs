const fs = require("node:fs");
const path = require("node:path");
const store = require("./store.cjs");

const MAX_TOOL_ROUNDS = 6;
const MAX_FILE_BYTES = 64_000;
const HIDDEN_PATHS = new Set([".axiom", ".git", "node_modules", "dist"]);

const tools = [
  {
    type: "function",
    function: {
      name: "list_workspace_files",
      description: "List files and folders inside the active research workspace. Use this before reading an unknown path.",
      parameters: {
        type: "object",
        properties: { directory: { type: "string", description: "A workspace-relative directory. Defaults to the workspace root." } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_workspace_file",
      description: "Read a UTF-8 text file inside the active research workspace.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "A workspace-relative file path." } },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_artifact",
      description: "Propose writing a research artifact. This never writes immediately; the user must approve the proposal.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Workspace-relative destination path, such as notes/gap-analysis.md." },
          content: { type: "string", description: "Complete UTF-8 file content." },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_command",
      description: "Propose a shell command. This never executes immediately; the user must approve it.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The exact shell command to propose." },
          cwd: { type: "string", description: "Optional workspace-relative directory in which to run it." },
        },
        required: ["command"],
        additionalProperties: false,
      },
    },
  },
];

function configuration() {
  const apiKey = process.env.AXIOM_LLM_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (process.env.AXIOM_LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: process.env.AXIOM_LLM_MODEL || "gpt-4.1-mini",
  };
}

function workspacePath(root, requested = "") {
  const candidate = path.resolve(root, requested || ".");
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    throw new Error("The requested path is outside the active workspace.");
  }
  return candidate;
}

function relativePath(root, target) {
  return path.relative(root, target).split(path.sep).join("/") || ".";
}

function rejectHidden(relative) {
  if (relative.split("/").some((part) => HIDDEN_PATHS.has(part) || part.startsWith("."))) {
    throw new Error("Axiom does not expose hidden workspace folders to the Agent.");
  }
}

function listFiles(root, directory) {
  const target = workspacePath(root, directory);
  const relative = relativePath(root, target);
  if (relative !== ".") rejectHidden(relative);
  const entries = fs.readdirSync(target, { withFileTypes: true })
    .filter((entry) => !HIDDEN_PATHS.has(entry.name) && !entry.name.startsWith("."))
    .slice(0, 120)
    .map((entry) => ({ path: relativePath(root, path.join(target, entry.name)), type: entry.isDirectory() ? "directory" : "file" }));
  return entries;
}

function readFile(root, filePath) {
  const target = workspacePath(root, filePath);
  const relative = relativePath(root, target);
  rejectHidden(relative);
  const stats = fs.statSync(target);
  if (!stats.isFile()) throw new Error("The requested path is not a file.");
  if (stats.size > MAX_FILE_BYTES) throw new Error(`The requested file is larger than ${MAX_FILE_BYTES} bytes.`);
  return fs.readFileSync(target, "utf8");
}

function parseArguments(serialized) {
  try { return JSON.parse(serialized || "{}"); }
  catch { throw new Error("The model returned invalid tool arguments."); }
}

function executeTool({ root, taskId, call, emit }) {
  const args = parseArguments(call.function.arguments);
  const name = call.function.name;
  emit({ type: "tool", title: name.replaceAll("_", " "), detail: "Working in the research workspace" });

  if (name === "list_workspace_files") {
    return { content: JSON.stringify({ entries: listFiles(root, args.directory) }) };
  }
  if (name === "read_workspace_file") {
    return { content: JSON.stringify({ path: args.path, content: readFile(root, args.path) }) };
  }
  if (name === "write_artifact") {
    if (typeof args.path !== "string" || typeof args.content !== "string" || args.content.length > 200_000) {
      throw new Error("A write proposal needs a path and no more than 200000 characters of content.");
    }
    const target = workspacePath(root, args.path);
    const relative = relativePath(root, target);
    rejectHidden(relative);
    const action = store.createAction({ taskId, kind: "write", payload: { path: relative, content: args.content } });
    return { action, content: JSON.stringify({ approval_required: true, action_id: action.id, kind: "write", path: relative }) };
  }
  if (name === "propose_command") {
    if (typeof args.command !== "string" || !args.command.trim() || args.command.length > 2_000) {
      throw new Error("A command proposal needs a non-empty command of at most 2000 characters.");
    }
    const workingDirectory = workspacePath(root, args.cwd || "");
    const action = store.createAction({ taskId, kind: "command", payload: { command: args.command.trim(), cwd: workingDirectory } });
    return { action, content: JSON.stringify({ approval_required: true, action_id: action.id, kind: "command", command: args.command.trim() }) };
  }
  throw new Error(`Unsupported Agent tool: ${name}`);
}

async function complete(config, messages) {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: config.model, messages, tools, tool_choice: "auto", temperature: 0.2 }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Model request failed (${response.status}): ${detail}`);
  }
  const body = await response.json();
  const message = body?.choices?.[0]?.message;
  if (!message) throw new Error("The model response did not contain a message.");
  return message;
}

async function runAgent({ prompt, workspace, emit = () => {} }) {
  const task = store.startTask({ prompt });
  const config = configuration();

  if (!config) {
    const response = "Axiom needs a model configuration before it can run this research task. Add AXIOM_LLM_API_KEY, AXIOM_LLM_BASE_URL, and AXIOM_LLM_MODEL to your local environment, then retry.";
    store.finishTask(task.id, { response, status: "needs_configuration" });
    emit({ type: "configuration", title: "Model configuration required", detail: "No local LLM API key was found" });
    return { taskId: task.id, response, status: "needs_configuration", actions: [] };
  }

  const messages = [
    {
      role: "system",
      content: "You are Axiom, an evidence-aware research IDE Agent. Work only with the active workspace through tools. Cite workspace-relative source paths in final answers. Read and list files automatically when needed. Writing files and running commands require user approval, so use the corresponding proposal tools rather than claiming those operations have already happened. Keep a concise, useful final answer.",
    },
    { role: "user", content: prompt },
  ];
  const actions = [];

  try {
    emit({ type: "status", title: "Research task started", detail: `Model: ${config.model}` });
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const message = await complete(config, messages);
      messages.push({ role: "assistant", content: message.content || "", tool_calls: message.tool_calls });
      if (!message.tool_calls?.length) {
        const response = message.content || "The research task completed without a final text response.";
        store.finishTask(task.id, { response });
        emit({ type: "complete", title: "Research task complete", detail: `${actions.length} approval item${actions.length === 1 ? "" : "s"}` });
        return { taskId: task.id, response, status: "completed", actions };
      }

      for (const call of message.tool_calls) {
        try {
          const result = executeTool({ root: workspace, taskId: task.id, call, emit });
          if (result.action) actions.push(result.action);
          messages.push({ role: "tool", tool_call_id: call.id, content: result.content });
        } catch (error) {
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: error.message || String(error) }) });
        }
      }
    }
    const response = "Axiom stopped this task after reaching its safe tool-call limit. Please refine the request and try again.";
    store.finishTask(task.id, { response, status: "incomplete" });
    return { taskId: task.id, response, status: "incomplete", actions };
  } catch (error) {
    const response = `Axiom could not complete this task: ${error.message || String(error)}`;
    store.finishTask(task.id, { response, status: "failed" });
    emit({ type: "failed", title: "Research task failed", detail: "The task record was saved for inspection" });
    return { taskId: task.id, response, status: "failed", actions };
  }
}

module.exports = { runAgent };
