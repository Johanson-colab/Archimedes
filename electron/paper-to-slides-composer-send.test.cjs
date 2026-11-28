const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");

function extractFunction(source, name, nextName) {
  const start = source.indexOf(`  function ${name}(`);
  const end = source.indexOf(`\n  ${nextName}`, start);
  assert.ok(start >= 0 && end > start, `extract ${name}`);
  return source.slice(start, end);
}

function extractSlidesHandler(source) {
  const marker = '"paper-to-slides": <PaperToSlidesView';
  const start = source.indexOf("onStart={async ", source.indexOf(marker));
  const end = source.indexOf("\n    }} />", start);
  assert.ok(source.indexOf(marker) >= 0 && start >= 0 && end > start, "extract Paper to Slides onStart");
  return `const onStart = ${source.slice(start + "onStart={".length, end)}\n    };`;
}

function extractInitHandler(source) {
  const start = source.indexOf('    if (command === "init") {');
  const end = source.indexOf('    if (command === "new")', start);
  assert.ok(start >= 0 && end > start, "extract /init handler");
  return `const runInit = async command => {\n${source.slice(start, end)}\n    };`;
}

async function evaluate(source, bindings, resultExpression) {
  const { transformWithOxc } = await import("vite");
  const { code } = await transformWithOxc(source, "composer-fixture.tsx", { jsx: { runtime: "classic" } });
  const expression = resultExpression ?? (source.includes("const onStart =") ? "onStart" : source.includes("function startNewTask") ? "startNewTask" : "acceptComposerSend");
  return new Function(...Object.keys(bindings), `${code}\nreturn ${expression};`)(...Object.values(bindings));
}

function ownerKey(dataRoot, threadId, draftKey) {
  return threadId ? JSON.stringify([dataRoot, "thread", threadId]) : JSON.stringify([dataRoot, "draft", draftKey]);
}

async function composerHarness() {
  const workspace = "/fixture/workspace";
  const projectId = "project-fixture";
  const workspaceId = "workspace-fixture";
  const draftKey = `new:${projectId}:${workspace}`;
  const previousOwner = ownerKey(workspace, "previous-thread", "previous-thread");
  const targetOwner = ownerKey(workspace, null, draftKey);
  const previousSlot = {
    id: "previous-composer",
    session: { context: [{ id: "submitted-attachment", type: "file" }], queued: [], paused: false },
  };
  const composerSlots = { current: new Map([[previousOwner, previousSlot]]) };
  const pendingComposerSend = { current: null };
  const currentComposerSlot = { current: previousSlot };
  const drafts = new Map();
  const noop = () => {};
  let resolveSubmission;
  const submissions = [];
  const updateComposer = (slot, update) => { slot.session = update(slot.session); };
  const bindings = {
    workspace,
    executionWorkspace: workspace,
    activeProjectId: projectId,
    activeWorkspaceId: workspaceId,
    activeThreadId: "previous-thread",
    agentBusy: false,
    workspaceOpeningRef: { current: false },
    workspaces: [{ id: workspaceId, project_id: projectId, root: workspace, is_default: true }],
    projects: [],
    composerOwner: previousOwner,
    composerDraftKey: "previous-thread",
    composerSlot: previousSlot,
    composerSlots,
    pendingComposerSend,
    currentComposerSlot,
    composerOwnerKey: ownerKey,
    readComposerDraft: key => drafts.get(key) ?? null,
    writeComposerDraft: (key, draft) => draft ? drafts.set(key, draft) : drafts.delete(key),
    clearPendingAssistantDeltas: noop,
    initialMessages: [],
    threadOpenRequestRef: { current: 0 },
    activeThreadIdRef: { current: "previous-thread" },
    setRemoteServerId: noop,
    setMainSection: noop,
    setChatViewNonce: noop,
    setActiveProjectId: noop,
    setActiveWorkspaceId: noop,
    setActiveThreadId: noop,
    setBoundHarness: noop,
    setThreadVisibility: noop,
    setMessages: noop,
    setTrajectoryEvents: noop,
    setPendingAction: noop,
    setChangeSets: noop,
    updateComposer,
    setContextItems: update => updateComposer(previousSlot, session => ({ ...session, context: update(session.context) })),
    desktopBridge: { stagePaperToSlidesPdf: async () => `${workspace}/.archimedes/paper-to-slides/input.pdf` },
    reasoningEffort: "high",
    contextLength: "standard",
    submitPrompt: (...args) => {
      submissions.push(args);
      return new Promise(resolve => { resolveSubmission = resolve; });
    },
  };
  const startNewTask = await evaluate(extractFunction(appSource, "startNewTask", "async function runConversationCommand"), bindings);
  const acceptComposerSend = await evaluate(extractFunction(appSource, "acceptComposerSend", "const executionWorkspaceRef"), bindings);
  const onStart = await evaluate(extractSlidesHandler(appSource), { ...bindings, startNewTask });
  return {
    workspace,
    draftKey,
    previousOwner,
    targetOwner,
    previousSlot,
    composerSlots,
    pendingComposerSend,
    currentComposerSlot,
    drafts,
    submissions,
    acceptComposerSend,
    onStart,
    updateComposer,
    finish: success => resolveSubmission?.(success),
  };
}

test("Paper to Slides transfers the new-task composer slot through the first owned agent event", async () => {
  const harness = await composerHarness();
  const starting = harness.onStart({ pdfPath: "/fixture/paper.pdf", backend: "codex", language: "English", length: "12", instructions: "" });
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(harness.submissions.length, 1);
    const submission = harness.submissions[0];
    assert.deepEqual(submission[4].map(item => item.id), ["submitted-attachment"], "the current composer attachments are submitted with the deck request");
    const send = submission[9];
    assert.ok(send, "the deck request carries composer ownership");
    assert.equal(send.owner, harness.targetOwner);
    assert.equal(send.draftKey, harness.draftKey);
    assert.equal(harness.pendingComposerSend.current, send);
    assert.equal(harness.composerSlots.current.get(harness.targetOwner), send.slot);
    assert.equal(harness.currentComposerSlot.current, send.slot, "the target slot is current before React must render");
    assert.deepEqual(send.slot.session.context, [], "submitted attachments are detached from the follow-up composer");

    send.slot.session.context.push({ id: "attachment-during-start", type: "file" });
    harness.acceptComposerSend(send, "slides-thread");
    const threadOwner = ownerKey(harness.workspace, "slides-thread");
    assert.equal(harness.composerSlots.current.get(threadOwner), send.slot, "the first owned event moves the live composer slot to the new thread");
    assert.equal(harness.composerSlots.current.has(harness.targetOwner), false, "the temporary new-task owner is retired");
    assert.deepEqual(harness.composerSlots.current.get(threadOwner).session.context.map(item => item.id), ["attachment-during-start"]);
  } finally {
    harness.finish(true);
    await starting;
  }
  assert.equal(harness.pendingComposerSend.current, null, "the pending ownership bridge is cleared after submission");
});

test("Paper to Slides restores detached attachments when the request cannot start", async () => {
  const harness = await composerHarness();
  const starting = harness.onStart({ pdfPath: "/fixture/paper.pdf", backend: "codex", language: "English", length: "12", instructions: "" });
  await new Promise(resolve => setImmediate(resolve));
  const send = harness.submissions[0][9];
  assert.ok(send);
  assert.deepEqual(harness.previousSlot.session.context, [], "the source composer is cleared before submission");
  send.slot.session.context.push({ id: "attachment-during-start", type: "file" });
  harness.finish(false);
  await starting;
  assert.equal(harness.pendingComposerSend.current, null);
  assert.deepEqual(send.slot.session.context.map(item => item.id), ["submitted-attachment", "attachment-during-start"]);
});

test("composer acceptance migrates a hidden draft and keeps queued attachments", async () => {
  const harness = await composerHarness();
  const send = {
    slot: harness.previousSlot,
    owner: harness.previousOwner,
    dataRoot: harness.workspace,
    draftKey: "new-draft",
    clientRunId: "work-composer:hidden-draft",
    accepted: false,
  };
  const queued = { id: "queued", draft: "Follow up", mode: "research", reasoningEffort: "high", contextLength: "standard", contextItems: [{ id: "queued-image", type: "image" }] };
  send.slot.session.queued.push(queued);
  harness.drafts.set(send.draftKey, { text: "Newer hidden draft", selectionStart: 18, selectionEnd: 18, newChatMode: "standard" });
  harness.currentComposerSlot.current = send.slot;

  harness.acceptComposerSend(send, "created-thread");

  const threadOwner = ownerKey(harness.workspace, "created-thread");
  assert.equal(harness.composerSlots.current.get(threadOwner), send.slot);
  assert.deepEqual(harness.composerSlots.current.get(threadOwner).session.queued, [queued]);
  assert.equal(harness.drafts.get("created-thread")?.text, "Newer hidden draft");
});

test("/init hands startup attachments to the created thread without losing newer context", async () => {
  const harness = await composerHarness();
  const submitted = { id: "init-attachment", type: "file" };
  const newer = { id: "init-newer-attachment", type: "file" };
  harness.previousSlot.session.context = [submitted];
  const submissions = [];
  const runInit = await evaluate(extractInitHandler(appSource), {
    command: "init",
    executionWorkspace: harness.workspace,
    composerSlot: harness.previousSlot,
    composerOwner: harness.previousOwner,
    composerDraftKey: "previous-thread",
    workspace: harness.workspace,
    pendingComposerSend: harness.pendingComposerSend,
    reasoningEffort: "high",
    contextLength: "standard",
    contextItems: [submitted],
    INIT_PROMPT: "Initialize project",
    t: value => value,
    submitPrompt: async (...args) => {
      submissions.push(args);
      const send = args[9];
      send.slot.session.context.push(newer);
      harness.acceptComposerSend(send, "init-thread");
      return true;
    },
    setContextItems: update => harness.updateComposer(harness.previousSlot, session => ({ ...session, context: update(session.context) })),
    updateComposer: harness.updateComposer,
  }, "runInit");

  await runInit("init");

  assert.equal(submissions.length, 1);
  assert.equal(harness.pendingComposerSend.current, null);
  const threadOwner = ownerKey(harness.workspace, "init-thread");
  assert.deepEqual(harness.composerSlots.current.get(threadOwner).session.context.map(item => item.id), [newer.id]);
});
