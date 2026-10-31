const assert = require("node:assert/strict");
const test = require("node:test");

const speech = require("./speech.cjs");

const config = { apiKey: "test-key", baseUrl: "https://api.openai.com/v1", provider: "openai" };

test("transcribes audio through the configured OpenAI-compatible endpoint", async () => {
  let request;
  const fetchImpl = async (url, init) => {
    request = { url, init };
    return { ok: true, json: async () => ({ text: "  hello from speech  " }) };
  };
  const result = await speech.transcribeSpeech(
    { audio: new Uint8Array([1, 2, 3, 4]), mimeType: "audio/webm;codecs=opus", language: "en-US" },
    config,
    fetchImpl,
  );
  assert.equal(result.text, "hello from speech");
  assert.equal(request.url, "https://api.openai.com/v1/audio/transcriptions");
  assert.equal(request.init.headers.Authorization, "Bearer test-key");
  assert.equal(request.init.body.get("model"), "whisper-1");
  assert.equal(request.init.body.get("language"), "en");
  assert.equal(request.init.body.get("file").name, "speech.webm");
});

test("allows a transcription model override", async () => {
  let request;
  const fetchImpl = async (url, init) => {
    request = { url, init };
    return { ok: true, json: async () => ({ text: "ok" }) };
  };
  await speech.transcribeSpeech({ audio: new Uint8Array([1]), mimeType: "audio/mp4" }, { ...config, transcriptionModel: "gpt-4o-mini-transcribe" }, fetchImpl);
  assert.equal(request.init.body.get("model"), "gpt-4o-mini-transcribe");
  assert.equal(request.init.body.get("file").name, "speech.m4a");
});

test("rejects missing audio and keys", async () => {
  await assert.rejects(() => speech.transcribeSpeech({ audio: new Uint8Array() }, config), /No audio/);
  await assert.rejects(() => speech.transcribeSpeech({ audio: new Uint8Array([1]) }, { ...config, apiKey: "" }), /model API key/i);
});

test("surfaces provider transcription errors", async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, text: async () => "Invalid API key" });
  await assert.rejects(
    () => speech.transcribeSpeech({ audio: new Uint8Array([1]) }, config, fetchImpl),
    /Voice transcription failed \(401\)\. Invalid API key/,
  );
});
