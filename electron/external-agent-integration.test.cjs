const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const store = require('./store.cjs');
const agent = require('./agent.cjs');
const modelConfig = require('./model-config.cjs');

for (const backend of ['claude', 'opencode']) test(`${backend} runs through the real child and main Work orchestrator without an API call`, { skip: process.platform === 'win32', timeout: 15000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `harness-${backend}-integration-`));
  const binary = path.join(root, `fixture-${backend}`);
  const previousFetch = global.fetch;
  try {
    fs.writeFileSync(binary, `#!${process.execPath}
const readline = require('node:readline');
const send = message => process.stdout.write(JSON.stringify(message) + '\\n');
const backend = ${JSON.stringify(backend)};
const sessionId = backend === 'claude' ? process.argv.find(arg => arg.startsWith('--session-id=')).split('=')[1] : 'private-native-acp';
const update = update => send({jsonrpc:'2.0',method:'session/update',params:{sessionId,update}});
readline.createInterface({input:process.stdin}).on('line',line=>{
  const message = JSON.parse(line);
  if(backend === 'claude') {
    if(message.type === 'control_request') send({type:'control_response',response:{subtype:'success',request_id:message.request_id,response:{models:[]}}});
    if(message.type === 'user') {
      send({type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:'Native fixture answer'}}});
      send({type:'result',subtype:'success',session_id:sessionId,result:'Native fixture answer'});
    }
  } else {
    let result={};
    if(message.method === 'initialize')result={protocolVersion:1,agentCapabilities:{loadSession:true}};
    if(message.method === 'session/new')result={sessionId,configOptions:[]};
    if(message.method === 'session/prompt') {
      update({sessionUpdate:'agent_message_chunk',content:{type:'text',text:'Native fixture answer'}});
      result={stopReason:'end_turn'};
    }
    if(message.id)send({jsonrpc:'2.0',id:message.id,result});
  }
});
`, { mode: 0o700 });
    store.openWorkspace(root);
    modelConfig.initializeModelConfig(root);
    global.fetch = () => { throw new Error('The API backend must not be called'); };
    const events = [];
    const result = await agent.runAgent({ prompt: 'hello', workspace: root, origin: 'research', mode: 'free-chat', capabilities: { write: 'ask', command: 'ask' }, externalBackend: { backend, binary, model: '', permissionMode: 'ask' }, emit: event => events.push(event) });
    assert.equal(result.status, 'completed');
    assert.equal(result.response, 'Native fixture answer');
    assert.equal(store.nativeAgentBindings(result.threadId).get().backend, backend);
    assert.ok(events.some(event => event.type === 'assistant_delta'));
    assert.equal(JSON.stringify(store.getResearchThread(result.threadId)).includes('private-native-acp'), false);
  } finally {
    global.fetch = previousFetch;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
