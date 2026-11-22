const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const ssh = require('../ssh-servers.cjs');
const { runSshWorkspace, remotePath } = require('./ssh-workspace.cjs');
function setup(t) { const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ssh-workspace-test-')); t.after(()=>fs.rmSync(dir,{recursive:true,force:true})); ssh.initialize(dir); return ssh.saveServer({host:'host.test',user:'ubuntu',workspace:'~/research'}); }
function spawnFake(code, output, inspect) { return (program,args,options) => { inspect?.(program,args,options); const child=new EventEmitter(); child.stdout=new PassThrough(); child.stderr=new PassThrough(); child.kill=()=>true; process.nextTick(()=>{child.stdout.write(output);child.emit('close',code)}); return child; }; }
test('uses the selected server and requires approval before executing', async t => { const server=setup(t);let started=false;await assert.rejects(runSshWorkspace({server,command:'pwd',approve:async()=>false,spawnImpl:()=>{started=true}}),/not approved/);assert.equal(started,false);let approval;const result=await runSshWorkspace({server,command:'pwd',approve:async a=>(approval=a,true),spawnImpl:spawnFake(0,'/home/ubuntu/research\n',(p,a)=>{assert.equal(p,'ssh');assert.ok(a.includes('ubuntu@host.test'));assert.match(a.at(-1), /research/);})});assert.match(approval.command,/SSH ubuntu@host.test:22/);assert.equal(result.exitCode,0);assert.match(result.output,/research/); });
test('caps output and validates cwd',async t=>{ const server=setup(t);const result=await runSshWorkspace({server,command:'x',approve:async()=>true,spawnImpl:spawnFake(0,'x'.repeat(100000))});assert.equal(result.truncated,true);assert.ok(Buffer.byteLength(result.output)<=32768);assert.throws(()=>remotePath('relative'),/absolute/); });
test('abort does not claim remote process termination',async t=>{const server=setup(t),controller=new AbortController();const pending=runSshWorkspace({server,command:'wait',approve:async()=>true,signal:controller.signal,spawnImpl:()=>{const c=new EventEmitter();c.stdout=new PassThrough();c.stderr=new PassThrough();c.kill=()=>true;return c}});setImmediate(()=>controller.abort());await assert.rejects(pending,/termination is not confirmed/);});
