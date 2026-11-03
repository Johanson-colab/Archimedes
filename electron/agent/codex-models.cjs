// The native catalog is authoritative: effort names are intentionally not an enum.
async function listNativeModels(client) {
  const models = [];
  let cursor;
  const seen = new Set();
  for (let page = 0; page < 20; page++) {
    const result = await client.request('model/list', cursor ? { cursor } : {});
    for (const item of result?.data || []) {
      const id = item.model || item.id;
      if (typeof id !== 'string' || !id || seen.has(id)) continue;
      seen.add(id);
      models.push({ id, label: item.displayName || id,
        efforts: [...new Set((item.supportedReasoningEfforts || []).map(e => e.reasoningEffort).filter(e => typeof e === 'string' && e))],
        ...(item.defaultReasoningEffort ? { defaultEffort: item.defaultReasoningEffort } : {}),
        isDefault: Boolean(item.isDefault) });
    }
    if (!result?.nextCursor) return models;
    if (result.nextCursor === cursor) throw new Error('Codex model catalog returned a repeated cursor.');
    cursor = result.nextCursor;
  }
  throw new Error('Codex model catalog exceeded the page limit.');
}
async function validateNativeChoice(client, config) {
  if (!config.model && !config.effort) return;
  if (config.effort && !config.model) throw new Error('Select an explicit Codex model before choosing a reasoning effort.');
  const models = await listNativeModels(client);
  const model = config.model ? models.find(m => m.id === config.model) : models.find(m => m.isDefault);
  if (!model) throw new Error('The selected Codex model is unavailable. Check the native model list before retrying.');
  if (config.effort && !model.efforts.includes(config.effort)) throw new Error(`The selected reasoning effort is not supported by Codex model ${model.label}. Choose an advertised effort or the native default.`);
}
module.exports = { listNativeModels, validateNativeChoice };
