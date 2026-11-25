// Run the synthetic store benchmark with Node. Add --desktop to replay the same
// fixture in a prepared Electron app after npm run build. The desktop pass
// observes the actual eight-second interval for each poll sample.
const assert = require("node:assert/strict");
const { AsyncLocalStorage } = require("node:async_hooks");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const { createServer } = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { monitorEventLoopDelay, performance } = require("node:perf_hooks");
const { DatabaseSync, StatementSync } = require("node:sqlite");
const { setTimeout: wait } = require("node:timers/promises");
const { parseArgs } = require("node:util");
const { serialize } = require("node:v8");

const root = path.resolve(__dirname, "..");
const store = require("../electron/store.cjs");
const modelConfig = require("../electron/model-config.cjs");
const at = "2026-01-01T00:00:00.000Z";
const identity = { version: 1, userId: "bench-user", displayName: "Synthetic researcher", deviceId: "bench-device", deviceName: "Synthetic device", createdAt: at, updatedAt: at };
const prompt = "Benchmark request for a synthetic research conversation";
const delta = "Synthetic benchmark delta";
const checkpointSummary = "Earlier synthetic research context.";
const sqlScope = new AsyncLocalStorage();

function assertNatural(name, value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`--${name} requires a positive integer.`);
  return number;
}

function options() {
  const { values } = parseArgs({ options: {
    sizes: { type: "string", default: "20,250,1000" },
    events: { type: "string", default: "20000" },
    sessions: { type: "string", default: "50" },
    samples: { type: "string", default: "30" },
    json: { type: "boolean" },
    desktop: { type: "boolean" },
  } });
  const sizes = values.sizes.split(",").map(value => assertNatural("sizes", value));
  const events = assertNatural("events", values.events);
  if (events < 5 * Math.max(...sizes)) throw new Error("--events must allow at least five events per turn in the largest conversation.");
  return { ...values, sizes, events, sessions: assertNatural("sessions", values.sessions), samples: assertNatural("samples", values.samples) };
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function fixtureEvents(turn, question, answer, count) {
  const url = "https://evidence.invalid/paper";
  const call = { id: `bench-call-${turn}`, type: "function", function: { name: "open_web_page", arguments: JSON.stringify({ url }) } };
  return [
    ["user_message", { text: question, mode: "free-chat" }],
    ["assistant_step", { content: "Finding evidence.", tool_calls: [call], protocol: "openai" }],
    ["tool_result", { name: call.function.name, call_id: call.id, content: JSON.stringify({ url, text: "Synthetic evidence".repeat(8) }) }],
    ["source_evidence", { url, kind: "read", title: "Synthetic evidence", page: 1, excerpt: "A short excerpt with a numerical observation." }],
    ...Array.from({ length: count - 5 }, (_, index) => ["status", { text: `Reading step ${index + 1}` }]),
    ["assistant_message", { text: answer, status: "completed" }],
  ];
}

function seedFixture(parent, size, settings) {
  const workspace = fs.mkdtempSync(path.join(parent, `workspace-${size}-`));
  const database = path.join(workspace, ".archimedes", "archimedes.db");
  const profile = fs.mkdtempSync(path.join(parent, `profile-${size}-`));
  fs.writeFileSync(path.join(profile, "identity.json"), JSON.stringify(identity));
  fs.writeFileSync(path.join(profile, "last-workspace.json"), JSON.stringify({ workspace }));

  store.setLocalIdentity(identity);
  store.openWorkspace(workspace);
  const sessions = Array.from({ length: settings.sessions }, (_, index) => {
    const title = `Synthetic session ${String(index + 1).padStart(3, "0")}`;
    const thread = store.createResearchThread({ title, mode: "free-chat" });
    return { id: thread.id, title, marker: `Fixture answer ${index + 1}.`, turns: index === 0 ? size : 1 };
  });
  store.closeAllWorkspaces();
  const db = new DatabaseSync(database);
  const insertTurn = db.prepare(`INSERT INTO research_turns
    (id, thread_id, mode, user_message, assistant_message, status, created_at, completed_at)
    VALUES (?, ?, 'free-chat', ?, ?, 'completed', ?, ?)`);
  const insertEvent = db.prepare(`INSERT INTO research_events
    (id, thread_id, turn_id, sequence, type, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const setCheckpoint = db.prepare("UPDATE research_threads SET harness='api', context_summary=?, context_summary_through_turn_id=? WHERE id=?");
  const eventCount = Math.round(settings.events * size / Math.max(...settings.sizes));
  const hash = createHash("sha256");
  let checkpoint;
  db.exec("BEGIN");
  for (const [index, session] of sessions.entries()) {
    for (let turn = 1; turn <= session.turns; turn++) {
      const id = `bench-turn-${index + 1}-${turn}`;
      const question = `Fixture question ${index + 1} turn ${turn}. ${"How can we check this result? ".repeat(9)}`;
      const answer = `${session.marker} Turn ${turn}. ${"The local experiment reports a repeatable result. ".repeat(12)}`;
      const count = index ? 5 : Math.floor(eventCount * turn / size) - Math.floor(eventCount * (turn - 1) / size);
      const events = fixtureEvents(id, question, answer, count);
      insertTurn.run(id, session.id, question, answer, at, at);
      for (const [seq, [type, payload]] of events.entries()) insertEvent.run(`${id}-e${seq + 1}`, session.id, id, seq + 1, type, JSON.stringify(payload), at);
      hash.update(JSON.stringify([session.title, id, question, answer, events]));
      if (!index && turn === Math.max(1, Math.floor(size / 2))) checkpoint = id;
    }
    setCheckpoint.run(index ? "" : checkpointSummary, index ? null : checkpoint, session.id);
  }
  db.exec("COMMIT");
  const rows = Object.fromEntries(["research_threads", "research_turns", "research_events"].map(table => [table, db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count]));
  db.close();
  return { workspace, database, profile, sessions, checkpoint, size, samples: settings.samples, rows, fixtureDigest: hash.digest("hex") };
}

// Count calls and materialized rows at the actual node:sqlite statement boundary.
function installSqlCounters() {
  for (const method of ["all", "get", "run"]) {
    const original = StatementSync.prototype[method];
    StatementSync.prototype[method] = function(...args) {
      const result = original.apply(this, args);
      const counters = sqlScope.getStore();
      if (counters) {
        const readRows = method === "all" ? result.length : method === "get" ? Number(Boolean(result)) : 0;
        const table = /\b(?:FROM|UPDATE|INTO)\s+(\w+)/i.exec(this.sourceSQL)?.[1] || "other";
        counters.calls++;
        counters.readRows += readRows;
        counters.rowsByTable[table] = (counters.rowsByTable[table] || 0) + readRows;
        if (method === "run") counters.rowsChanged += result.changes;
      }
      return result;
    };
  }
}

function counters() {
  return { calls: 0, readRows: 0, rowsChanged: 0, rowsByTable: {} };
}

function measure(operation) {
  const sql = counters();
  const start = performance.now();
  const result = sqlScope.run(sql, operation);
  return { result, sample: { ms: performance.now() - start, sql, v8Bytes: serialize(result).byteLength } };
}

function summary(samples, field = "ms") {
  const order = samples.map(sample => sample[field]).sort((a, b) => a - b);
  const percentile = proportion => order[Math.ceil(proportion * order.length) - 1];
  return { count: order.length, p50: percentile(0.5), p95: percentile(0.95) };
}

function eventLoopReport(loop) {
  loop.disable();
  return { p50: loop.percentile(50) / 1e6, p95: loop.percentile(95) / 1e6, max: loop.max / 1e6 };
}

async function localModel() {
  const requests = [];
  let hold;
  const server = createServer(async (request, response) => {
    let text = "";
    for await (const chunk of request) text += chunk;
    const body = JSON.parse(text);
    const last = body.messages.at(-1)?.content;
    requests.push({ prompt: last, stream: body.stream, bytes: Buffer.byteLength(text), contextDigest: digest(body.messages) });
    if (request.method !== "POST" || request.url !== "/v1/chat/completions" || body.stream !== true || last !== prompt) {
      response.writeHead(400).end("Unexpected request in the local benchmark.");
      return;
    }
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`);
    const finish = () => response.end('data: {"choices":[{"finish_reason":"stop","delta":{}}]}\n\n');
    if (hold) hold = finish;
    else finish();
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return {
    requests,
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
    hold: () => { hold = () => {}; },
    release: () => { const finish = hold; hold = null; finish?.(); },
    stop: () => { server.closeAllConnections(); server.close(); },
  };
}

function configureModel(profile, baseUrl) {
  modelConfig.initializeModelConfig(profile);
  modelConfig.saveModelConfig({ provider: "custom", baseUrl, model: "benchmark-fixture", apiKey: "synthetic-no-network-key" });
}

// A measured send persists a turn. Restore the benchmark-owned DB between
// samples without invoking Undo, which creates an archived copy of the history.
function resetSend(fixture) {
  const [thread] = fixture.sessions;
  const db = new DatabaseSync(fixture.database);
  try {
    db.exec("PRAGMA foreign_keys=ON; BEGIN");
    db.prepare("DELETE FROM research_turns WHERE thread_id=? AND id NOT LIKE 'bench-turn-%'").run(thread.id);
    db.prepare("DELETE FROM task_runs WHERE prompt=?").run(prompt);
    db.prepare("UPDATE research_threads SET status='idle', context_summary=?, context_summary_through_turn_id=? WHERE id=?")
      .run(checkpointSummary, fixture.checkpoint, thread.id);
    db.exec("COMMIT");
  } finally { db.close(); }
}

function describeDetail(thread) {
  return { turns: thread.turns.length, events: thread.events.length, messages: thread.messages.length,
    lastMessage: thread.messages.at(-1).text, lastEvent: thread.events.at(-1).type };
}

async function benchmarkCore(fixture) {
  const primary = fixture.sessions[0].id;
  installSqlCounters();
  store.setLocalIdentity(identity);
  const loop = monitorEventLoopDelay({ resolution: 1 });
  loop.enable();
  await wait(5);
  const cold = measure(() => store.openWorkspace(fixture.workspace));
  const get = () => store.getResearchThread(primary);
  const context = () => store.getResearchThreadContext(primary);
  const bind = () => store.bindResearchThreadHarness(primary, "api");
  const operations = { detail: get, context, harnessBind: bind };
  const samples = { detail: [], context: [], harnessBind: [], sessionSwitch: [], firstModelDelta: [] };
  const model = await localModel();
  configureModel(fixture.profile, model.baseUrl);
  const { runAgent } = require("../electron/agent.cjs");
  try {
    const resultSummary = { ...describeDetail(get()), contextTurns: context().turns.length, harness: bind() };
    for (let index = 0; index < fixture.samples; index++) {
      for (const [name, operation] of Object.entries(operations)) samples[name].push(measure(operation).sample);
      const session = fixture.sessions[index % fixture.sessions.length];
      samples.sessionSwitch.push({ session: session.title, ...measure(() => store.getResearchThread(session.id)).sample });
      const sql = counters();
      const start = performance.now();
      let firstDelta;
      const result = await sqlScope.run(sql, () => runAgent({ prompt, workspace: fixture.workspace, threadId: primary, mode: "free-chat", origin: "research", autoBuildGraph: false, emit: event => {
        if (event.type === "assistant_delta" && !firstDelta) {
          firstDelta = { ms: performance.now() - start, sql: structuredClone(sql), v8Bytes: serialize(event).byteLength };
        }
      } }));
      assert.equal(result.status, "completed", result.response);
      assert.equal(result.response, delta);
      assert.ok(firstDelta, "The model request did not produce a first delta.");
      assert.equal(model.requests.length, index + 1);
      samples.firstModelDelta.push({ ...firstDelta, request: model.requests.at(-1) });
      resetSend(fixture);
      await wait(0);
    }
    return { coldOpen: cold.sample, resultSummary, resultDigest: digest(resultSummary), samples,
      timing: Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, summary(values)])),
      eventLoopDelayMs: eventLoopReport(loop), peakRssKiB: process.resourceUsage().maxRSS };
  } finally {
    store.closeAllWorkspaces();
    model.stop();
  }
}

// Runs in the real renderer. The benchmark clicks the shipped session menu
// and composer, and subscribes through the normal preload event bridge.
function installRenderer(prompt) {
  const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const eventually = async predicate => {
    const deadline = performance.now() + 30_000;
    for (let value = predicate(); !value; value = predicate()) {
      if (performance.now() >= deadline) throw new Error(`Renderer never reached ${predicate}`);
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  };
  const composer = () => document.querySelector("[data-ui=research-composer] textarea");
  const sendButton = () => document.querySelector("[data-ui=research-composer] .conversation-send");
  const setDraft = (element, value) => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  };
  window.threadBench = {
    async open(target, sessionCount) {
      await eventually(() => document.querySelector(".session-chip"));
      const start = performance.now();
      document.querySelector(".session-chip").click();
      await eventually(() => Number(document.querySelector(".session-menu-heading small")?.textContent) === sessionCount);
      const choices = [...document.querySelectorAll(".session-row-open")];
      const button = choices.find(row => row.querySelector(".session-row-title")?.textContent.trim() === target.title);
      if (!button) throw new Error(`Missing session ${target.title}`);
      button.click();
      await eventually(() => {
        const reply = document.querySelector(".conversation-message.assistant:last-child");
        return reply?.textContent.includes(target.marker);
      });
      await nextPaint();
      return performance.now() - start;
    },
    async send() {
      setDraft(composer(), prompt);
      await eventually(() => sendButton()?.getAttribute("aria-label") === "Send" && !sendButton().disabled);
      return new Promise(resolve => {
        const start = performance.now();
        const unsubscribe = window.researchDesk.onAgentEvent(event => {
          if (event.type !== "assistant_delta") return;
          unsubscribe();
          const bridgeMs = performance.now() - start;
          nextPaint().then(() => resolve({ ms: performance.now() - start, bridgeMs }));
        });
        sendButton().click();
      });
    },
    async idle() {
      await eventually(() => sendButton()?.getAttribute("aria-label") === "Send");
      await nextPaint();
    },
    async input() {
      const element = composer();
      const value = element.value;
      const start = performance.now();
      setDraft(element, `${value}x`);
      await nextPaint();
      const ms = performance.now() - start;
      if (element.value !== `${value}x`) throw new Error("The composer did not accept input.");
      setDraft(element, value);
      return ms;
    },
  };
  return true;
}

async function benchmarkDesktop(fixture) {
  const { app, BrowserWindow, ipcMain, nativeTheme, session } = require("electron");
  const model = await localModel();
  const launchAt = performance.now();
  let polling = false;
  let lastPoll;
  let running;
  const observed = new Map();
  const pollSamples = [];
  const tracked = new Set(["workspace:open", "research-thread:get", "agent:run"]);
  const handle = ipcMain.handle;
  installSqlCounters();
  ipcMain.handle = function(channel, listener) {
    handle.call(this, channel, tracked.has(channel) ? async (event, ...args) => {
      const sql = counters();
      const start = performance.now();
      const poll = channel === "research-thread:get" && polling;
      const input = poll ? event.sender.executeJavaScript("window.threadBench.input()") : null;
      const intervalMs = poll ? start - lastPoll : undefined;
      if (poll) lastPoll = start;
      if (channel === "agent:run") running = { start, sql };
      const result = await sqlScope.run(sql, () => listener(event, ...args));
      const row = { ms: performance.now() - start, sql };
      if (poll) {
        input.then(inputMs => pollSamples.push({ ...row, intervalMs, inputMs, v8Bytes: serialize(result).byteLength }));
      } else {
        // Serialize outside the measured IPC/renderer path.
        observed.set(channel, { row, result });
      }
      return result;
    } : listener);
  };
  function take(channel) {
    const record = observed.get(channel);
    assert.ok(record, `No observed IPC result for ${channel}`);
    observed.delete(channel);
    return { ...record.row, v8Bytes: serialize(record.result).byteLength };
  }
  app.setAppPath(root);
  app.setPath("userData", fixture.profile);
  app.commandLine.appendSwitch("disable-gpu");
  nativeTheme.themeSource = "light";
  configureModel(fixture.profile, model.baseUrl);
  const fetch = globalThis.fetch;
  globalThis.fetch = (url, options) => new URL(url).hostname === "127.0.0.1"
    ? fetch(url, options) : Promise.reject(new Error("Outside isolated benchmark"));
  app.on("browser-window-created", (_event, win) => {
    win.setContentSize(1440, 920);
    win.webContents.setZoomFactor(1);
    win.webContents.setBackgroundThrottling(false);
    win.hide();
  });
  const loop = monitorEventLoopDelay({ resolution: 1 });
  loop.enable();
  try {
    require("../electron/main.cjs");
    await app.whenReady();
    if (process.platform === "darwin") app.dock.hide();
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !/^(?:https?:\/\/127\.0\.0\.1:|file:|data:|blob:)/i.test(details.url) }));
    for (let attempt = 0; attempt < 300 && BrowserWindow.getAllWindows().length === 0; attempt++) await wait(100);
    const [win] = BrowserWindow.getAllWindows();
    assert.ok(win, "The benchmark app did not open a window.");
    const contents = win.webContents;
    const run = script => contents.executeJavaScript(script);
    const send = contents.send;
    contents.send = function(channel, event, ...args) {
      if (channel === "agent:event" && event.type === "assistant_delta" && running && !running.first) {
        running.first = { ms: performance.now() - running.start, sql: structuredClone(running.sql), v8Bytes: serialize(event).byteLength };
      }
      return send.call(this, channel, event, ...args);
    };
    await run(`(${installRenderer})(${JSON.stringify(prompt)})`);
    const [primary, ...other] = fixture.sessions;
    const open = async target => {
      const ms = await run(`window.threadBench.open(${JSON.stringify(target)}, ${fixture.sessions.length})`);
      return { ms, session: target.title, main: take("research-thread:get") };
    };
    await open(primary);
    const cold = { ms: performance.now() - launchAt, workspaceOpen: take("workspace:open") };
    const samples = { switchToPrimary: [], switchToOther: [], firstModelDelta: [], poll: pollSamples };
    for (let index = 0; index < Math.max(fixture.samples, other.length); index++) {
      samples.switchToOther.push(await open(other[index % other.length]));
      samples.switchToPrimary.push(await open(primary));
    }
    for (let index = 0; index < fixture.samples; index++) {
      const rendered = await run("window.threadBench.send()");
      await run("window.threadBench.idle()");
      assert.ok(running.first, "No first model delta was observed in the main process.");
      assert.equal(model.requests.length, index + 1);
      samples.firstModelDelta.push({ ...rendered, mainFirstDelta: running.first, mainRun: take("agent:run"), request: model.requests.at(-1) });
      resetSend(fixture);
      await open(other[0]);
      await open(primary);
    }
    model.hold();
    await run("window.threadBench.send()");
    lastPoll = performance.now();
    polling = true;
    const deadline = performance.now() + fixture.samples * 8500 + 15_000;
    while (pollSamples.length < fixture.samples && performance.now() < deadline) await wait(100);
    polling = false;
    model.release();
    await run("window.threadBench.idle()");
    assert.equal(pollSamples.length, fixture.samples);
    assert.equal(model.requests.length, fixture.samples + 1);
    const timing = Object.fromEntries(Object.entries(samples).map(([name, group]) => [name, summary(group)]));
    timing.inputDuringPoll = summary(pollSamples, "inputMs");
    console.log(JSON.stringify({ runtime: process.versions.electron, viewport: await run("[innerWidth, innerHeight, devicePixelRatio]"),
      cold, samples, timing, eventLoopDelayMs: eventLoopReport(loop),
      peakRssKiB: process.resourceUsage().maxRSS,
      rendererPeakRssKiB: app.getAppMetrics().find(item => item.type === "Tab")?.memory.peakWorkingSetSize }));
    app.exit(0);
  } catch (error) {
    console.error(error.stack);
    app.exit(1);
  } finally { model.stop(); }
}

function runChild(executable, flag, metadata, timeout) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const processResult = spawnSync(executable, [__filename, flag, metadata], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout, env });
  if (processResult.error) throw processResult.error;
  if (processResult.status !== 0) throw new Error(processResult.stderr.trim() || `Benchmark child exited ${processResult.status}.`);
  return JSON.parse(processResult.stdout.trim().split("\n").at(-1));
}

async function main() {
  const [command, file] = process.argv.slice(2);
  if (command === "--core-child") return console.log(JSON.stringify(await benchmarkCore(JSON.parse(fs.readFileSync(file, "utf8")))));
  if (command === "--desktop-child") return benchmarkDesktop(JSON.parse(fs.readFileSync(file, "utf8")));
  const settings = options();
  const desktop = settings.desktop ? require("./electron-runtime.cjs").electronBinary() : null;
  if (desktop && !fs.existsSync(path.join(root, "dist", "index.html"))) throw new Error("--desktop needs the production renderer. Run npm run build first.");
  if (desktop && settings.sessions < 2) throw new Error("--desktop requires at least two sessions to switch between.");
  const temp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "archimedes-thread-bench-"));
  try {
    const fixtures = [];
    for (const size of settings.sizes) {
      const fixture = seedFixture(temp, size, settings);
      const metadata = path.join(temp, `fixture-${size}.json`);
      fs.writeFileSync(metadata, JSON.stringify(fixture));
      const core = runChild(process.execPath, "--core-child", metadata, 180_000);
      const record = { size, rows: fixture.rows, fixtureDigest: fixture.fixtureDigest, core };
      if (desktop) {
        console.error(`Electron: ${size} turns, ${settings.samples} live polling intervals.`);
        record.desktop = runChild(desktop, "--desktop-child", metadata, 180_000 + settings.samples * 8500);
      }
      fixtures.push(record);
    }
    const output = {
      environment: { platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model, cores: os.cpus().length, memoryBytes: os.totalmem(), node: process.version,
        revision: spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim() },
      settings, units: { timing: "milliseconds", sql: "prepared statement calls and materialized rows", ipc: "V8 serialization byte size", memory: "peak process RSS in KiB" },
      fixtures,
    };
    if (settings.json) console.log(JSON.stringify(output, null, 2));
    else for (const fixture of fixtures) console.log(JSON.stringify({ size: fixture.size, rows: fixture.rows, fixtureDigest: fixture.fixtureDigest, main: fixture.core.timing, desktop: fixture.desktop?.timing }, null, 2));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
