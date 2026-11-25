const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function createLiteratureHistory(directory) {
  function file(scope) {
    if (!scope || typeof scope.workspace !== 'string' || !scope.workspace || typeof scope.projectId !== 'string') throw new Error('A workspace and project scope are required.');
    const hash = crypto.createHash('sha256').update(JSON.stringify([scope.workspace, scope.projectId])).digest('hex');
    return path.join(directory, 'literature-review', `${hash}.json`);
  }
  function list(scope) {
    try { const result = JSON.parse(fs.readFileSync(file(scope), 'utf8')); if (!Array.isArray(result)) throw new Error('Invalid history'); return result; }
    catch (error) { if (error.code === 'ENOENT') return []; throw new Error('Could not read literature search history.'); }
  }
  function save(scope, record) {
    if (!record || typeof record.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(record.id) || typeof record.question !== 'string' || !Array.isArray(record.results)) throw new Error('Invalid literature search record.');
    if (Buffer.byteLength(JSON.stringify(record)) > 1024 * 1024) throw new Error('Literature search record exceeds the size limit.');
    const records = [record, ...list(scope).filter(item => item.id !== record.id)].slice(0, 15); const target = file(scope); fs.mkdirSync(path.dirname(target), { recursive: true }); const temp = `${target}.${crypto.randomUUID()}.tmp`;
    try { fs.writeFileSync(temp, JSON.stringify(records), { flag: 'wx', mode: 0o600 }); fs.renameSync(temp, target); } finally { try { fs.unlinkSync(temp); } catch {} }
    return records;
  }
  return { list, save };
}
module.exports = { createLiteratureHistory };
