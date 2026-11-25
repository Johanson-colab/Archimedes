const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const countdown = import(pathToFileURL(path.join(__dirname, '../src/approval-countdown.mjs')).href);

function fakeClock() {
  let time = 0, callback;
  return { now: () => time, setInterval: fn => { callback = fn; return 1; }, clearInterval: () => {}, advance: ms => { time += ms; callback(); } };
}

test('only managed local command approvals qualify for a countdown', async () => {
  const { localCommandApprovalId } = await countdown;
  const action = { id: 'local', kind: 'command', payload: { managedByAgent: true } };
  assert.equal(localCommandApprovalId(action), 'local');
  for (const remoteOperation of ['ssh_remote_exec', 'ssh_remote_read', 'ssh_remote_edit']) {
    assert.equal(localCommandApprovalId({ ...action, payload: { ...action.payload, remoteOperation } }), null);
    assert.equal(localCommandApprovalId({ ...action, payload: { remoteOperation } }), null);
  }
  assert.equal(localCommandApprovalId({ ...action, kind: 'write' }), null);
  assert.equal(localCommandApprovalId({ ...action, payload: {} }), null);
  assert.equal(localCommandApprovalId(null), null);
});

test('countdown runs exactly once after ten seconds', async () => {
  const { startApprovalCountdown } = await countdown;
  const clock = fakeClock(), ticks = []; let runs = 0;
  const stop = startApprovalCountdown(value => ticks.push(value), () => runs++, clock);
  clock.advance(9999); assert.equal(runs, 0); assert.equal(ticks.at(-1), 1);
  clock.advance(1); assert.equal(runs, 1); assert.equal(ticks.at(-1), 0);
  clock.advance(1000); stop(); assert.equal(runs, 1);
});

test('cancelling prevents a queued callback from approving', async () => {
  const { startApprovalCountdown } = await countdown;
  const clock = fakeClock(); let runs = 0;
  const stop = startApprovalCountdown(() => {}, () => runs++, clock);
  clock.advance(5000); stop(); clock.advance(6000); assert.equal(runs, 0);
});
