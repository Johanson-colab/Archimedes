const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { execFileSync } = require('node:child_process');
const ssh = require('../ssh-servers.cjs');
const { runSshWorkspace, runRemoteFileOperation, buildRemoteFileOperation, remotePath } = require('./ssh-workspace.cjs');
function setup(t) { const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ssh-workspace-test-')); t.after(()=>fs.rmSync(dir,{recursive:true,force:true})); ssh.initialize(dir); return ssh.saveServer({host:'host.test',user:'ubuntu',workspace:'~/research'}); }
function spawnFake(code, output, inspect) { return (program,args,options) => { inspect?.(program,args,options); const child=new EventEmitter(); child.stdout=new PassThrough(); child.stderr=new PassThrough(); child.kill=()=>true; process.nextTick(()=>{child.stdout.write(output);child.emit('close',code)}); return child; }; }
test('uses the selected server and requires approval before executing', async t => { const server=setup(t);let started=false;await assert.rejects(runSshWorkspace({server,command:'pwd',approve:async()=>false,spawnImpl:()=>{started=true}}),/not approved/);assert.equal(started,false);let approval;const result=await runSshWorkspace({server,command:'pwd',approve:async a=>(approval=a,true),spawnImpl:spawnFake(0,'/home/ubuntu/research\n',(p,a)=>{assert.equal(p,'ssh');assert.ok(a.includes('ubuntu@host.test'));assert.match(a.at(-1), /research/);})});assert.match(approval.command,/SSH ubuntu@host.test:22/);assert.equal(approval.remoteOperation,'ssh_remote_exec');assert.equal(result.exitCode,0);assert.match(result.output,/research/); });
test('caps output and validates cwd',async t=>{ const server=setup(t);const result=await runSshWorkspace({server,command:'x',approve:async()=>true,spawnImpl:spawnFake(0,'x'.repeat(100000))});assert.equal(result.truncated,true);assert.ok(Buffer.byteLength(result.output)<=32768);assert.throws(()=>remotePath('relative'),/absolute/); });
test('abort does not claim remote process termination',async t=>{const server=setup(t),controller=new AbortController();const pending=runSshWorkspace({server,command:'wait',approve:async()=>true,signal:controller.signal,spawnImpl:()=>{const c=new EventEmitter();c.stdout=new PassThrough();c.stderr=new PassThrough();c.kill=()=>true;return c}});setImmediate(()=>controller.abort());await assert.rejects(pending,/termination is not confirmed/);});
test('remote file operations read bounded lines and edit exactly one match, including shell metacharacters', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-file-test-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const name = "a 'quoted' file.txt"; const file = path.join(dir, name);
  fs.writeFileSync(file, 'first\nold $(not-a-command)\nlast\n', { mode: 0o640 });
  const run = operation => execFileSync('bash', ['-c', operation.command], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(run(buildRemoteFileOperation('ssh_remote_read', { path: name, offset: 2, limit: 1 })), '2: old $(not-a-command)\n');
  const edit = buildRemoteFileOperation('ssh_remote_edit', { path: name, old_text: 'old $(not-a-command)', new_text: 'new value' });
  assert.match(edit.displayCommand, /old \$\(not-a-command\)/);
  assert.match(run(edit), /updated/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'first\nnew value\nlast\n');
  assert.equal(fs.statSync(file).mode & 0o777, 0o640);
  assert.throws(() => run(edit));
  fs.symlinkSync(file, path.join(dir, 'link'));
  assert.throws(() => run(buildRemoteFileOperation('ssh_remote_edit', { path: 'link', old_text: 'first', new_text: 'x' })));
});
test('file operation arguments are bounded and every operation requires approval', async t => {
  const server = setup(t); let started = false, approval;
  assert.throws(() => buildRemoteFileOperation('ssh_remote_read', { path: 'a', limit: 201 }), /range/);
  assert.throws(() => buildRemoteFileOperation('ssh_remote_edit', { path: 'a', old_text: '', new_text: 'b' }), /nonempty/);
  await assert.rejects(runRemoteFileOperation({ server, name: 'ssh_remote_edit', args: { path: 'a', old_text: 'before', new_text: 'after' }, approve: async a => { approval = a; return false; }, spawnImpl: () => { started = true; } }), /not approved/);
  assert.equal(started, false); assert.equal(approval.remoteOperation, 'ssh_remote_edit'); assert.match(approval.command, /before/); assert.match(approval.command, /after/); assert.match(approval.command, /ubuntu@host.test/);
});
