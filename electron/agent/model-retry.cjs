// Retry only before a model response stream has begun. Tool execution is never retried here.
function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener('abort', aborted);
    const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    function aborted() { clearTimeout(timer); cleanup(); reject(Object.assign(new Error('Model request interrupted.'), { name: 'AbortError' })); }
    if (signal?.aborted) aborted();
    else signal?.addEventListener('abort', aborted, { once: true });
  });
}

function retryDelay(response, attempt) {
  const header = response?.headers?.get?.('retry-after');
  if (header != null && String(header).trim()) {
    const seconds = Number(header);
    const timestamp = Date.parse(header);
    const millis = Number.isFinite(seconds) ? seconds * 1000 : timestamp - Date.now();
    if (Number.isFinite(millis)) return Math.max(0, Math.min(10_000, millis));
  }
  return Math.min(2000, 250 * 2 ** attempt);
}

async function fetchModelWithRetry(url, options, { retries = 2, sleep = wait } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    if (options.signal?.aborted) throw Object.assign(new Error('Model request interrupted.'), { name: 'AbortError' });
    let response;
    try { response = await fetch(url, options); }
    catch (error) {
      if (options.signal?.aborted || error?.name === 'AbortError' || !(error instanceof TypeError) || attempt >= retries) throw error;
      await sleep(retryDelay(null, attempt), options.signal);
      continue;
    }
    if (attempt >= retries || ![429, 500, 502, 503, 504].includes(response.status)) return response;
    const delay = retryDelay(response, attempt);
    try { await response.body?.cancel?.(); } catch { /* Retry does not depend on draining an error body. */ }
    await sleep(delay, options.signal);
  }
}

module.exports = { fetchModelWithRetry, retryDelay };
