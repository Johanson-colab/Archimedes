const test = require('node:test');
const assert = require('node:assert/strict');
const { NativeProcess } = require('./native-process.cjs');
test('OpenCode free quota errors give actionable guidance without exposing provider secrets', async () => {
  const p = new NativeProcess({ backend: 'opencode' });
  p.child = { stdin: { writable: true, write() {} }, kill() {} };
  const result = p.request('session/prompt');
  p.read(JSON.stringify({ id: 1, error: { code: -32603, message: 'SECRET_PROVIDER_CONFIG', data: { errorName: 'provider.free-limit', apiKey: 'SECRET_KEY' } } }) + '\n');
  await assert.rejects(result, error => /free usage limit/i.test(error.message) && !/SECRET/.test(error.message));
  p.close();
});
test('ACP authentication-required code asks for native provider login without exposing its error data', async () => {
  const p = new NativeProcess({ backend: 'opencode' });
  p.child = { stdin: { writable: true, write() {} }, kill() {} };
  const result = p.request('session/prompt');
  p.read(JSON.stringify({ id: 1, error: { code: -32000, message: 'SECRET_PROVIDER_CONFIG' } }) + '\n');
  await assert.rejects(result, error => /sign in|authentication required/i.test(error.message) && !/SECRET/.test(error.message));
  p.close();
});
test('native transport parses batched lines separately and fails oversized JSON lines', async () => {
  const p = new NativeProcess({ backend: 'fixture', binary: process.execPath });
  const seen = []; p.on('message', m => seen.push(m));
  p.read('{"a":1}\n{"a":2}\n'); assert.deepEqual(seen, [{ a: 1 }, { a: 2 }]);
  const closed = new Promise(resolve => p.once('closed', resolve));
  p.read('x'.repeat(8 * 1024 * 1024 + 1));
  assert.match((await closed).message, /oversized/);
});
test('native transport closes its real detached child on abort', async () => {
  const p = new NativeProcess({ backend: 'fixture', binary: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'] });
  p.start(); const child = p.child; const exit = new Promise(resolve => child.once('exit', resolve));
  p.close(); await exit; assert.notEqual(child.signalCode, null);
});
test('native transport fails malformed JSON without surfacing raw contents', async () => {
  const p = new NativeProcess({ backend: 'fixture', binary: process.execPath });
  const closed = new Promise(resolve => p.once('closed', resolve)); p.read('SECRET\n');
  assert.equal((await closed).message.includes('SECRET'), false);
});
test('native transport writes Claude control envelopes and matches acknowledgements',async()=>{
 const script="const r=require('readline').createInterface({input:process.stdin});r.on('line',l=>{const m=JSON.parse(l);console.log(JSON.stringify({type:'control_response',response:{subtype:'success',request_id:m.request_id,response:{seen:m.request.subtype}}}));});";
 const p=new NativeProcess({backend:'claude',binary:process.execPath,args:['-e',script]});p.start();
 try {assert.deepEqual(await p.request('initialize',{hooks:{}}),{seen:'initialize'});} finally {p.close();}
});
test('native transport writes ACP JSON RPC and fails request errors without raw provider data',async()=>{
 const script="const r=require('readline').createInterface({input:process.stdin});r.on('line',l=>{const m=JSON.parse(l);console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,error:{code:-1,message:'SECRET'}}));});";
 const p=new NativeProcess({backend:'opencode',binary:process.execPath,args:['-e',script]});p.start();
 try {await assert.rejects(p.request('initialize',{}),e=>/rejected initialize/.test(e.message)&&!e.message.includes('SECRET'));} finally {p.close();}
});
test('native transport drains buffered stdout after exit before treating close as final',async()=>{
 const {EventEmitter}=require('node:events');
 const {PassThrough}=require('node:stream');
 const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>true;
 const p=new NativeProcess({backend:'opencode',binary:'fixture',spawnImpl:()=>child});
 p.start();const pending=p.request('initialize');
 child.emit('exit',0,null);
 child.stdout.write(JSON.stringify({jsonrpc:'2.0',id:1,result:{protocolVersion:1}})+'\n');
 child.emit('close',0,null);
 assert.deepEqual(await pending,{protocolVersion:1});assert.equal(p.closed,true);
});
function windowsFixture(treeKillImpl, treeKillTimeout = 2000) {
 const {EventEmitter}=require('node:events');const {PassThrough}=require('node:stream');
 const child=new EventEmitter();child.pid=456789;child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kills=[];child.kill=s=>{child.kills.push(s);return true;};
 const p=new NativeProcess({backend:'opencode',binary:'fixture',platform:'win32',spawnImpl:()=>child,treeKillImpl,treeKillTimeout});p.start();return {p,child};
}
test('Windows native cleanup targets only its owned PID tree without a shell',()=>{
 const {EventEmitter}=require('node:events');const helper=new EventEmitter();helper.kill=()=>true;const calls=[];
 const {p,child}=windowsFixture((binary,args,options)=>{calls.push({binary,args,options});return helper;});p.close();
 assert.equal(calls.length,1);assert.equal(calls[0].binary,'taskkill.exe');assert.deepEqual(calls[0].args,['/PID','456789','/T','/F']);assert.equal(calls[0].options.shell,false);assert.equal(calls[0].options.windowsHide,true);assert.equal(calls[0].options.stdio,'ignore');
 helper.emit('close',0);assert.deepEqual(child.kills,[]);
});
test('Windows tree cleanup failures fall back to the owned child and release helper timeout',()=>{
 const {EventEmitter}=require('node:events');const helper=new EventEmitter();helper.kill=()=>true;
 const {p,child}=windowsFixture(()=>helper);p.close();helper.emit('error',new Error('missing taskkill'));helper.emit('close',1);
 assert.deepEqual(child.kills,['SIGKILL']);
});
test('Windows tree cleanup bounds a stuck helper then kills the owned child',async()=>{
 const {EventEmitter}=require('node:events');const helper=new EventEmitter();let helperKills=0;helper.kill=()=>{helperKills++;return true;};
 const {p,child}=windowsFixture(()=>helper,5);p.close();await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(helperKills,1);assert.deepEqual(child.kills,['SIGKILL']);
});
test('Windows tree cleanup rejects invalid PIDs and catches taskkill launch errors',()=>{
 let calls=0;const {p,child}=windowsFixture(()=>{calls++;throw new Error('spawn failed');});p.close();assert.equal(calls,1);assert.deepEqual(child.kills,['SIGKILL']);
 const next=windowsFixture(()=>{calls++;});next.child.pid=-99;next.p.close();assert.equal(calls,1);assert.deepEqual(next.child.kills,['SIGKILL']);
});
