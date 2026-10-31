const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const DEFAULT_TRANSCRIPTION_MODEL = process.env.ARCHIMEDES_TRANSCRIPTION_MODEL || "whisper-1";

function audioBuffer(input) {
  if (input instanceof Uint8Array) return Buffer.from(input);
  if (input instanceof ArrayBuffer) return Buffer.from(input);
  if (ArrayBuffer.isView(input)) return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  throw new Error("No audio was received.");
}

function extensionForMime(mimeType) {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

function transcriptionEndpoint(baseUrl) {
  return `${String(baseUrl || "").trim().replace(/\/+$/, "")}/audio/transcriptions`;
}

async function transcribeSpeech({ audio, mimeType, language } = {}, config = {}, fetchImpl = fetch) {
  if (!config.apiKey) throw new Error("Voice input needs a model API key. Open Model settings and save an OpenAI-compatible provider first.");
  if (!config.baseUrl) throw new Error("Voice input needs a model API base URL.");
  const bytes = audioBuffer(audio);
  if (!bytes.length) throw new Error("No audio was received.");
  if (bytes.length > MAX_AUDIO_BYTES) throw new Error("Voice recording is too large. Try a shorter recording.");

  const type = String(mimeType || "audio/webm").split(";")[0];
  const form = new FormData();
  form.append("file", new Blob([bytes], { type }), `speech.${extensionForMime(type)}`);
  form.append("model", config.transcriptionModel || DEFAULT_TRANSCRIPTION_MODEL);
  if (language) form.append("language", String(language).split("-")[0].slice(0, 8));

  const response = await fetchImpl(transcriptionEndpoint(config.baseUrl), {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, Accept: "application/json" },
    body: form,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Voice transcription failed (${response.status}).${detail ? ` ${detail.slice(0, 300)}` : ""}`);
  }
  const payload = await response.json();
  const text = typeof payload?.text === "string" ? payload.text.trim() : "";
  if (!text) throw new Error("No speech was detected. Try again.");
  return { text };
}

module.exports = {
  DEFAULT_TRANSCRIPTION_MODEL,
  MAX_AUDIO_BYTES,
  transcribeSpeech,
};
