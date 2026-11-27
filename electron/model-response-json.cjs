// JSON decoders can quote the malformed body, including credentials echoed by a gateway.
const INVALID_JSON = "The model provider returned invalid JSON. Check the model endpoint and try again.";

async function readModelResponseJson(response) {
  try {
    return await response.json();
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new Error(INVALID_JSON);
  }
}

function parseModelResponseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(INVALID_JSON);
  }
}

module.exports = { parseModelResponseJson, readModelResponseJson };
