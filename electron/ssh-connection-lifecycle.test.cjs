const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const test = require('node:test');

function fixture() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  let kills = 0;
  child.kill = () => { kills++; };
  const timers = new Set();
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, 'ssh-servers.cjs'), 'utf8');
  vm.runInNewContext(source, {
    module, Buffer, process,
    require: (name) => name === 'node:child_process' ? { spawn: () => child } : require(name),
    setTimeout: (fn) => { const timer = { fn, unref() {} }; timers.add(timer); return timer; },
    clearTimeout: (timer) => timers.delete(timer),
  });
  return { child, timers, kills: () => kills, connect: () => module.exports.testConnection({ host: 'example.test', user: 'tester' }) };
}

for (const outcome of ['success', 'failure', 'error']) {
  test(`SSH ${outcome} clears its timeout and never kills the finished process`, async () => {
    const f = fixture();
    const result = f.connect();
    if (outcome === 'error') f.child.emit('error', new Error('spawn failed'));
    else {
      f.child.stdout.emit('data', Buffer.from('archimedes-ok'));
      f.child.emit('close', outcome === 'success' ? 0 : 1);
    }
    assert.equal((await result).ok, outcome === 'success');
    assert.equal(f.timers.size, 0);
    assert.equal(f.kills(), 0);
  });
}

test('SSH timeout kills the active process and ignores a subsequent close', async () => {
  const f = fixture();
  const result = f.connect();
  [...f.timers][0].fn();
  assert.equal((await result).ok, false);
  assert.equal(f.kills(), 1);
  assert.equal(f.timers.size, 0);
  f.child.emit('close', 0);
});

test('SSH timeout still resolves when process termination throws', async () => {
  const f = fixture();
  f.child.kill = () => { throw new Error('already exited'); };
  const result = f.connect();
  assert.doesNotThrow(() => [...f.timers][0].fn());
  assert.equal((await result).ok, false);
  assert.equal(f.timers.size, 0);
});
