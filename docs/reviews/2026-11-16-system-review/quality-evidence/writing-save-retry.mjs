// Real save helper plus isolated disk: failure must not poison the file queue.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const { createWritingDocument, editWritingDocument, saveWritingDocument } = await import(path.join(repo, 'src/paper-writing-state.ts'));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'archimedes-writing-retry-'));
try {
  const a = path.join(temporary, 'a'), b = path.join(temporary, 'b');
  for (const root of [a, b]) fs.mkdirSync(root);
  fs.writeFileSync(path.join(a, 'main.tex'), 'Original A');
  fs.writeFileSync(path.join(b, 'main.tex'), 'Original B');
  const preview = content => ({ path: 'main.tex', name: 'main.tex', content, kind: 'text', size: content.length, modifiedAt: 'fixture' });
  const document = createWritingDocument(a, preview('Original A'));
  let fail = true, release;
  const pendingWrite = new Promise(resolve => { release = resolve; });
  const calls = [];
  const write = async (root, name, content) => {
    calls.push({ owner: root === a ? 'A' : 'B', content });
    if (fail) { fail = false; throw new Error('Fixture write rejected'); }
    await pendingWrite;
    fs.writeFileSync(path.join(root, name), content);
    return preview(content);
  };
  editWritingDocument(document, 'First edit');
  await assert.rejects(saveWritingDocument(document, write, () => {}), /Fixture write rejected/);
  const failureRetained = document.draft === 'First edit' && document.savedDraft === 'Original A' && document.saveState === 'unsaved';
  assert.equal(failureRetained, true);
  editWritingDocument(document, 'Retry snapshot');
  const retry = saveWritingDocument(document, write, () => {});
  editWritingDocument(document, 'Newest queued edit');
  const newest = saveWritingDocument(document, write, () => {});
  release();
  await Promise.all([retry, newest]);
  assert.equal(fs.readFileSync(path.join(a, 'main.tex'), 'utf8'), 'Newest queued edit');
  assert.equal(fs.readFileSync(path.join(b, 'main.tex'), 'utf8'), 'Original B');
  assert.equal(document.draft, document.savedDraft);
  assert.equal(document.error, '');
  assert.equal(document.saveState, 'saved');
  console.log(JSON.stringify({ probe: 'failed-save-retry-and-newest-snapshot', failureRetained, calls, finalState: document.saveState, errorCleared: document.error === '', otherRootUntouched: true }, null, 2));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
