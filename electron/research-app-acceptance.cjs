const fs = require('node:fs');
const path = require('node:path');

function relativePath(value) {
  return typeof value === 'string' && value.length <= 2000 && value.startsWith('/') && !value.startsWith('//') && !/[\\\r\n\t]/.test(value);
}
function readAcceptance(app) {
  const file = path.join(app.directory, 'research-app.checks.json'), stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink() || stat.size > 32000) throw new Error('Add research-app.checks.json with real HTTP and browser acceptance checks.');
  const plan = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (plan.starter === true) throw new Error('Replace the starter workflow and its acceptance checks before delivery.');
  if (plan.schemaVersion !== 1 || typeof plan.description !== 'string' || !plan.description.trim() || plan.description.length > 1000 || !Array.isArray(plan.http) || !plan.http.length || plan.http.length > 10 || !Array.isArray(plan.browser) || plan.browser.length > 30 || !plan.browser.some(s => s.action === 'expect') || !plan.browser.some(s => ['click', 'fill', 'select'].includes(s.action))) throw new Error('Acceptance needs a workflow description, HTTP checks, a browser interaction and an expected result.');
  for (const check of plan.http) {
    if (check.status !== undefined && (!Number.isInteger(check.status) || check.status < 200 || check.status > 599)) throw new Error('Invalid expected HTTP status.');
    if (!relativePath(check.path) || (check.contains !== undefined && (typeof check.contains !== 'string' || !check.contains || check.contains.length > 2000))) throw new Error('Invalid HTTP acceptance check.');
    if (check.json !== undefined && (!check.json || typeof check.json.path !== 'string' || check.json.path.length > 200 || !/^[A-Za-z0-9_.]*$/.test(check.json.path) || (!Object.hasOwn(check.json, 'equals') && !Object.hasOwn(check.json, 'minItems')) || (check.json.minItems !== undefined && (!Number.isInteger(check.json.minItems) || check.json.minItems < 1 || check.json.minItems > 10000)))) throw new Error('Invalid JSON acceptance assertion.');
  }
  for (const step of plan.browser) {
    if (step.timeoutMs !== undefined && (!Number.isInteger(step.timeoutMs) || step.timeoutMs < 100 || step.timeoutMs > 120000)) throw new Error('Browser step timeout must be 100–120000 ms.');
    if (!['fill', 'click', 'select', 'expect'].includes(step.action) || typeof step.selector !== 'string' || !step.selector.trim() || step.selector.length > 500) throw new Error('Unsupported browser acceptance action or selector.');
    for (const key of ['value', 'text']) if (step[key] !== undefined && (typeof step[key] !== 'string' || step[key].length > 4000)) throw new Error('Browser assertion text is too large.');
    if (['fill', 'select'].includes(step.action) && typeof step.value !== 'string') throw new Error('Input actions need a value.');
    if (step.action === 'expect' && !['text', 'value', 'count'].some(key => Object.hasOwn(step, key))) throw new Error('Expected result must assert text, value or count.');
    if (step.count !== undefined && (!Number.isInteger(step.count) || step.count < 0 || step.count > 10000)) throw new Error('Invalid expected element count.');
  }
  return plan;
}
module.exports = { readAcceptance, relativePath };
