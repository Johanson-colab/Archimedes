const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const store = require("./store.cjs");
const agent = require("./agent.cjs");
const modelConfig = require("./model-config.cjs");

test("main Work dispatch works without API key; native bindings stay out of forks and export", { skip: process.platform === "win32" }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-codex-integration-"));
  const binary = path.join(directory, "fake-codex");
  const previousFetch = global.fetch;
  try {
    // A real child protocol peer exercises the actual client, not mocked runAgent.
    fs.writeFileSync(binary, `#!${process.execPath}
const readline=require('node:readline');
const send=m=>process.stdout.write(JSON.stringify(m)+'\\n');
readline.createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line); if(!m.id)return;
 let result={};
 if(m.method==='account/read')result={account:{type:'chatgpt'}};
 if(m.method.startsWith('thread/'))result={thread:{id:'native-fixture'}};
 if(m.method==='turn/start'){
   send({id:m.id,result:{turn:{id:'native-turn'}}});
   send({method:'item/agentMessage/delta',params:{threadId:'native-fixture',turnId:'native-turn',itemId:'answer',delta:'Native fixture answer'}});
   send({method:'turn/completed',params:{threadId:'native-fixture',turn:{id:'native-turn',status:'completed'}}});
 }else send({id:m.id,result});
});
`, { mode: 0o700 });
    store.openWorkspace(directory);
    modelConfig.initializeModelConfig(directory);
    const originalKey = process.env.ARCHIMEDES_LLM_API_KEY;
    const legacyKey = process.env.AXIOM_LLM_API_KEY;
    delete process.env.ARCHIMEDES_LLM_API_KEY;
    delete process.env.AXIOM_LLM_API_KEY;
    global.fetch = () => { throw new Error("The API backend must not be called"); };
    // Native dispatch must not even read the API model or prepare API context.
    // Reload with fail-fast dependencies to exercise the dispatch boundary.
    const contextModule = require("./agent/context.cjs");
    const originalPrepare = contextModule.prepareConversation;
    const originalGetConfig = modelConfig.getActiveModelConfig;
    const cachedAgent = require.cache[require.resolve("./agent.cjs")];
    let nativeAgent;
    try {
      contextModule.prepareConversation = () => { throw new Error("API context preparation must be bypassed"); };
      modelConfig.getActiveModelConfig = () => { throw new Error("API model configuration must be bypassed"); };
      delete require.cache[require.resolve("./agent.cjs")];
      nativeAgent = require("./agent.cjs");
    } finally {
      contextModule.prepareConversation = originalPrepare;
      modelConfig.getActiveModelConfig = originalGetConfig;
      require.cache[require.resolve("./agent.cjs")] = cachedAgent;
    }
    let result;
    try {
      result = await nativeAgent.runAgent({ prompt: "hello", workspace: directory, mode: "free-chat", origin: "research", capabilities: { write: "ask", command: "ask" }, externalBackend: { backend: "codex", binary, model: "" } });
    } finally {
      if (originalKey === undefined) delete process.env.ARCHIMEDES_LLM_API_KEY; else process.env.ARCHIMEDES_LLM_API_KEY = originalKey;
      if (legacyKey === undefined) delete process.env.AXIOM_LLM_API_KEY; else process.env.AXIOM_LLM_API_KEY = legacyKey;
    }
    assert.equal(result.status, "completed");
    assert.equal(result.response, "Native fixture answer");
    assert.equal(store.nativeAgentBindings(result.threadId).get().last_turn_id, result.turnId);
    assert.equal(JSON.stringify(store.getResearchThread(result.threadId)).includes("native-fixture"), false);
    const fork = store.forkResearchThread(result.threadId);
    assert.equal(store.nativeAgentBindings(fork.id).get(), undefined);
    await assert.rejects(agent.runAgent({ prompt: "hello", workspace: directory, origin: "paper", externalBackend: { backend: "codex", binary, model: "" } }), /only for main Work/);
  } finally {
    global.fetch = previousFetch;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("native approval is not executed again by the renderer terminal", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/App.tsx"), "utf8");
  assert.match(source, /action\.kind === "command" && action\.payload\.command && !action\.payload\.externalAgent/);
  const main = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  assert.match(main, /input\.origin === "research" && backend\.backend === "codex"/);
});
