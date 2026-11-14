const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runNative, canResumeExternal, checkNative, compactNative, steerNative } = require('./external-backend.cjs');
class Fixture extends EventEmitter {
  constructor(o) { super(); this.options=o; this.closed=false; this.sent=[]; Fixture.last=this; }
  start(){ return this; } close(){this.closed=true;this.emit('closed',new Error('closed'));}
  send(m){this.sent.push(m);if(m.type==='user')queueMicrotask(()=>{this.emit('message',{type:'assistant',message:{content:[{type:'thinking',thinking:'PRIVATE'},{type:'text',text:'Hello'}]}});this.emit('message',{type:'result',subtype:'success',result:'Hello',session_id:this.options.sessionId});});}
  request(method,params){this.sent.push({method,params});if(method==='initialize')return Promise.resolve({models:[{value:'sonnet',displayName:'Sonnet',supportedEffortLevels:['low','medium','high']}]});return Promise.resolve({});}
}
function options(backend='claude') { const saves=[],events=[];return {config:{backend,binary:process.execPath,permissionMode:'ask'},workspace:process.cwd(),thread:{id:'local',turns:[]},turn:{id:'turn',user_message:'hi'},emit:e=>events.push(e),bindings:{get:()=>null,save:b=>saves.push(b)},Client:Fixture,saves,events}; }
test('external resume requires backend workspace model and completed local turn',()=>{
 const b={backend:'claude',native_thread_id:'id',workspace:'/x',model:'m',last_turn_id:'t'};
 assert.equal(canResumeExternal(b,{backend:'claude',workspace:'/x',model:'m',previousTurnId:'t'}),true);
 for(const patch of [{backend:'opencode'},{last_turn_id:null},{workspace:'/y'},{model:'n'}])assert.equal(canResumeExternal({...b,...patch},{backend:'claude',workspace:'/x',model:'m',previousTurnId:'t'}),false);
 assert.equal(canResumeExternal({...b,backend:undefined},{backend:'claude',workspace:'/x',model:'m',previousTurnId:'t'}),false);
});
test('Claude native result streams visible text and dirties continuity before sending',async()=>{
 const o=options();assert.equal(await runNative(o),'Hello');assert.equal(o.saves[0].last_turn_id,null);assert.equal(o.saves.at(-1).last_turn_id,'turn');assert.equal(o.saves.at(-1).backend,'claude');assert.equal(JSON.stringify(o.events).includes('PRIVATE'),false);assert.ok(o.events.some(e=>e.type==='assistant_delta'));assert.equal(Fixture.last.closed,true);
});
test('external backends reject unsupported permissions and attachments before delivery',async()=>{
 const o=options();o.config.permissionMode='workspace-write';await assert.rejects(runNative(o),/permission/);assert.equal(o.saves.length,0);
 const s=options();s.contextItems=[{type:'skill'}];await assert.rejects(runNative(s),/skill/);assert.equal(s.saves.length,0);
});
test('Claude check initializes without user prompt or native IDs in result',async()=>{
 const c=await checkNative({backend:'claude',binary:process.execPath},{Client:Fixture});assert.equal(c.ready,true);assert.equal(c.models[0].id,'sonnet');assert.equal(Fixture.last.sent.some(m=>m.type==='user'),false);assert.equal(Fixture.last.closed,true);
});
test('unimplemented native controls fail explicitly',async()=>{
 await assert.rejects(compactNative({config:{backend:'claude'}}),/compact/i);await assert.rejects(steerNative('unknown','message'),/active/);
});
class ACPFixture extends Fixture {
  request(method,params){
    this.sent.push({method,params});
    if(method==='initialize')return Promise.resolve({protocolVersion:1,agentCapabilities:{loadSession:true,promptCapabilities:{image:true}}});
    if(method==='session/new'||method==='session/load') {
      queueMicrotask(()=>this.emit('message',{method:'session/update',params:{sessionId:'native-acp',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'OLD REPLAY'}}}}));
      return Promise.resolve({sessionId:'native-acp',configOptions:[{id:'model',options:[{value:'p/model'}]}]});
    }
    if(method==='session/set_config_option')return Promise.resolve({configOptions:[{id:params.configId,currentValue:params.value,options:[{value:params.value}]}]});
    if(method==='session/prompt'){
      assert.equal(this.options.backend,'opencode');
      this.emit('message',{method:'session/update',params:{sessionId:'native-acp',update:{sessionUpdate:'agent_thought_chunk',content:{type:'text',text:'PRIVATE'}}}});
      this.emit('message',{method:'session/update',params:{sessionId:'native-acp',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'ACP answer'}}}});
      return Promise.resolve({stopReason:'end_turn'});
    }
    return Promise.resolve({});
  }
}
test('Claude maps native effort and permission selections onto its CLI flags', async () => {
 const o=options();o.config.model='sonnet';o.config.effort='high';o.config.permissionMode='accept-edits';
 assert.equal(await runNative(o),'Hello');
 const args=Fixture.last.options.args;
 assert.equal(args[args.indexOf('--effort')+1],'high');
 assert.equal(args[args.indexOf('--permission-mode')+1],'acceptEdits');
});
test('Claude Research installs native skills and appends its workflow without changing permissions', async t => {
 const o=options();o.workspace=fs.mkdtempSync(path.join(os.tmpdir(),'archimedes-claude-research-'));
 t.after(()=>fs.rmSync(o.workspace,{recursive:true,force:true}));
 o.researchSkill='idea-spark';const records=[];o.recordEvent=e=>records.push(e);
 assert.equal(await runNative(o),'Hello');
 const args=Fixture.last.options.args;
 const instructions=args[args.indexOf('--append-system-prompt')+1];
 assert.match(instructions,/\.claude\/skills\/archimedes-idea-spark/);
 assert.match(instructions,/RUN_DIR=/);
 assert.equal(args[args.indexOf('--permission-mode')+1],'default');
 assert.equal(args.includes('--dangerously-skip-permissions'),false);
 assert.equal(records.some(e=>e.type==='research_skill'),true);
 assert.equal(o.events.filter(e=>e.type==='native_activity').length,0);
});
test('OpenCode Research installs its skills and explicitly requests the workflow through ACP', async t => {
 const o=options('opencode');o.Client=ACPFixture;o.workspace=fs.mkdtempSync(path.join(os.tmpdir(),'archimedes-opencode-research-'));
 t.after(()=>fs.rmSync(o.workspace,{recursive:true,force:true}));
 o.researchSkill='idea-spark';const records=[];o.recordEvent=e=>records.push(e);
 assert.equal(await runNative(o),'ACP answer');
 const prompt=Fixture.last.sent.find(c=>c.method==='session/prompt').params.prompt;
 assert.match(prompt[0].text,/\.opencode\/skills\/archimedes-idea-spark/);
 assert.match(prompt[0].text,/User request:\nhi/);
 assert.deepEqual(Fixture.last.options.args,['acp']);
 assert.equal(Fixture.last.options.env,undefined);
 const state=records.find(e=>e.type==='research_skill');
 const run=path.join(o.workspace,state.payload.runRelative);
 assert.equal(fs.statSync(run).isDirectory(),true);
 // Fresh process and an omitted renderer selection must still resume Research.
 o.thread.events=[state];o.researchSkill=undefined;
 assert.equal(await runNative(o),'ACP answer');
 assert.equal(records.filter(e=>e.type==='research_skill').at(-1).payload.runRelative,state.payload.runRelative);
});
test('OpenCode validates model via ACP config and does not render session replay or thoughts',async()=>{
 const o=options('opencode');o.Client=ACPFixture;o.config.model='p/model';assert.equal(await runNative(o),'ACP answer');
 assert.equal(o.saves.at(-1).backend,'opencode');assert.equal(JSON.stringify(o.events).includes('OLD REPLAY'),false);assert.equal(JSON.stringify(o.events).includes('PRIVATE'),false);
 assert.equal(Fixture.last.sent.some(m=>m.method==='session/set_config_option'),true);
});
test('lost prompt acknowledgement leaves dirty binding and never retries',async()=>{
 class Lost extends ACPFixture {request(m,p){if(m==='session/prompt'){this.sent.push({method:m});return Promise.reject(new Error('lost acknowledgement'));}return super.request(m,p);}}
 const o=options('opencode');o.Client=Lost;await assert.rejects(runNative(o),/lost acknowledgement/);assert.equal(o.saves.length,1);assert.equal(o.saves[0].last_turn_id,null);assert.equal(Fixture.last.sent.filter(m=>m.method==='session/prompt').length,1);
});
test('pending one-shot native approval is aborted when the turn ends',async()=>{
 let approvalSignal;let release;
 class Approval extends Fixture {
   respond(id,result){this.sent.push({id,result});}
   send(m){this.sent.push(m);if(m.type==='user')queueMicrotask(()=>{
     this.emit('message',{type:'control_request',request_id:'permission',request:{subtype:'can_use_tool',tool_name:'Bash',input:{command:'pwd'}}});
     this.emit('message',{type:'result',subtype:'success',result:'done',session_id:this.options.sessionId});
   });}
 }
 const o=options();o.Client=Approval;o.approve=({signal})=>{approvalSignal=signal;return new Promise(resolve=>{release=resolve});};
 assert.equal(await runNative(o),'done');assert.equal(approvalSignal.aborted,true);release(true);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(Fixture.last.sent.some(m=>m.id==='permission'),false);
});
test('aborting native request closes its client and preserves dirty binding',async()=>{
 let entered;const started=new Promise(resolve=>{entered=resolve});
 class Waiting extends Fixture{send(m){this.sent.push(m);if(m.type==='user')entered();}}
 const o=options();o.Client=Waiting;const controller=new AbortController();o.signal=controller.signal;
 const pending=runNative(o);await started;controller.abort();await assert.rejects(pending,/interrupted/);assert.equal(Fixture.last.closed,true);assert.equal(o.saves.at(-1).last_turn_id,null);
});
test('emitter failure during final activity cleanup still closes child',async()=>{
 class Tool extends Fixture{send(m){if(m.type==='user')queueMicrotask(()=>{this.emit('message',{type:'assistant',message:{content:[{type:'tool_use',id:'native-tool',name:'Bash',input:{command:'pwd'}}]}});this.emit('message',{type:'result',subtype:'success',result:'done',session_id:this.options.sessionId});});}}
 const o=options();o.Client=Tool;o.emit=e=>{if(e.type==='native_activity'&&e.activity.status==='completed')throw new Error('renderer gone');};
 await assert.rejects(runNative(o),/renderer gone/);assert.equal(Fixture.last.closed,true);
});
test('Claude catalog exposes labels and complete context input usage',async()=>{
 const c=await checkNative({backend:'claude',binary:process.execPath},{Client:Fixture});assert.equal(c.models[0].label,'Sonnet');
 class Usage extends Fixture{send(m){if(m.type==='user')queueMicrotask(()=>this.emit('message',{type:'result',subtype:'success',result:'done',session_id:this.options.sessionId,usage:{input_tokens:10,cache_read_input_tokens:20,cache_creation_input_tokens:30,output_tokens:5}}));}}
 const o=options();o.Client=Usage;await runNative(o);const usage=o.events.find(e=>e.usage)?.usage;assert.equal(usage.inputTokens,60);assert.equal(usage.cachedInputTokens,20);assert.equal(usage.totalTokens,65);assert.equal(usage.modelContextWindow,null);
});
test('Claude streams distinct assistant messages through tool loops and authoritative final text',async()=>{
 class Loop extends Fixture{send(m){if(m.type==='user')queueMicrotask(()=>{
  for(const text of ['Checking files.','Final answer.'])this.emit('message',{type:'assistant',message:{content:[{type:'text',text}]}});
  this.emit('message',{type:'result',subtype:'success',result:'Final answer.',session_id:this.options.sessionId});
 });}}
 const o=options();o.Client=Loop;assert.equal(await runNative(o),'Final answer.');assert.ok(o.events.filter(e=>e.type==='assistant_delta').map(e=>e.delta).join('').includes('Final answer.'));
});
test('Claude unsupported interactive question is denied without opening approval',async()=>{
 let asked=false;
 class Question extends Fixture{
 respond(id,result){this.sent.push({id,result});}
 send(m){if(m.type==='user')queueMicrotask(()=>{this.emit('message',{type:'control_request',request_id:'q',request:{subtype:'can_use_tool',tool_name:'AskUserQuestion',input:{questions:[{question:'Which?'}]}}});this.emit('message',{type:'result',subtype:'success',result:'done',session_id:this.options.sessionId});});}}
 const o=options();o.Client=Question;o.approve=()=>{asked=true;return true;};await runNative(o);assert.equal(asked,false);assert.equal(Fixture.last.sent.find(m=>m.id==='q').result.behavior,'deny');
});
test('OpenCode rejects image prompts when native ACP image capability is unavailable',async()=>{
 class TextOnly extends ACPFixture{request(m,p){if(m==='initialize')return Promise.resolve({protocolVersion:1,agentCapabilities:{loadSession:true,promptCapabilities:{image:false}}});return super.request(m,p);}}
 const o=options('opencode');o.Client=TextOnly;o.contextItems=[{type:'image',image:{dataUrl:'data:image/png;base64,YQ=='}}];
 await assert.rejects(runNative(o),/image capability/);assert.equal(o.saves.length,0);assert.equal(Fixture.last.sent.some(m=>m.method==='session/prompt'),false);
});
test('Claude excludes subagent text from the parent response stream',async()=>{
 class Child extends Fixture{send(m){if(m.type==='user')queueMicrotask(()=>{
  this.emit('message',{type:'stream_event',parent_tool_use_id:'child',event:{type:'content_block_delta',delta:{type:'text_delta',text:'CHILD INTERNAL'}}});
  this.emit('message',{type:'assistant',parent_tool_use_id:'child',message:{content:[{type:'text',text:'CHILD INTERNAL'}]}});
  this.emit('message',{type:'result',subtype:'success',result:'Parent answer',session_id:this.options.sessionId});
 });}}
 const o=options();o.Client=Child;assert.equal(await runNative(o),'Parent answer');assert.equal(JSON.stringify(o.events).includes('CHILD INTERNAL'),false);
});
test('native activity updates coalesce and persist only the last bounded snapshot',async()=>{
 class Noisy extends ACPFixture {request(m,p){if(m!=='session/prompt')return super.request(m,p);
  for(let i=0;i<100;i++)this.emit('message',{method:'session/update',params:{sessionId:'native-acp',update:{sessionUpdate:i?'tool_call_update':'tool_call',toolCallId:'tool',kind:'execute',status:i>90?'completed':'in_progress',content:[{type:'content',content:{type:'text',text:'x'.repeat(40000)+i}}]}}});
  this.emit('message',{method:'session/update',params:{sessionId:'native-acp',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'done'}}}});return Promise.resolve({stopReason:'end_turn'});
 }}
 const o=options('opencode');o.Client=Noisy;const recorded=[];o.recordEvent=e=>recorded.push(e);await runNative(o);
 const events=o.events.filter(e=>e.type==='native_activity');assert.ok(events.length<=4,`too many activity events: ${events.length}`);
 const snapshots=recorded.filter(e=>e.type==='native_activity');assert.equal(snapshots.length,1);assert.ok(snapshots[0].payload.activity.output.endsWith('99'));assert.ok(snapshots[0].payload.activity.output.length<=32768);
});

test('Paper to Slides sends the official Claude skill and token through the native launch', async t => {
 const o=options();o.workspace=fs.mkdtempSync(path.join(os.tmpdir(),'archimedes-slides-claude-'));
 t.after(()=>fs.rmSync(o.workspace,{recursive:true,force:true}));
 o.researchSkill='paper-to-slides';o.mineruToken='test-private-token';const records=[];o.recordEvent=e=>records.push(e);
 assert.equal(await runNative(o),'Hello');
 const launch=Fixture.last.options;const instructions=launch.args[launch.args.indexOf('--append-system-prompt')+1];
 assert.match(instructions,/archimedes-paper2slides/);
 assert.equal(launch.env.MINERU_API_TOKEN,'test-private-token');
 assert.doesNotMatch(JSON.stringify(launch.args)+JSON.stringify(o.events)+JSON.stringify(records),/test-private-token/);
 assert.equal(fs.existsSync(path.join(o.workspace,'.claude/skills/archimedes-paper2slides/scripts/audit_deck.py')),false);
});
