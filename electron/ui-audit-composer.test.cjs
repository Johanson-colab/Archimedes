const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const app = read("src", "App.tsx");
const css = read("src", "styles.css");
const library = read("src", "LibraryView.tsx");
const voice = read("src", "VoiceInputButton.tsx");
const main = read("electron", "main.cjs");
const preload = read("electron", "preload.cjs");

test("conversation composers keep their resting border while focused", () => {
  assert.doesNotMatch(css, /\.conversation-composer:focus-within/);
  assert.doesNotMatch(css, /\.theme-paper \.conversation-composer:focus-within/);
  assert.doesNotMatch(css, /\.has-welcome \.conversation-composer:focus-within/);
  assert.doesNotMatch(css, /\.paper-ai-compose-input:focus-within/);
  assert.doesNotMatch(css, /\.paper-ai-compose textarea:focus \{ border-color: #8fb6a0/);
  assert.doesNotMatch(css, /\.reader-notebook-section textarea:focus \{ border-color: #8fb6a0/);
  assert.match(css, /\.conversation-composer textarea:focus-visible \{ outline: none; \}/);
});

test("chat-like side inputs share the quiet focus contract", () => {
  for (const selector of [
    ".paper-ai-compose textarea:focus",
    ".paper-ai-compose textarea:focus-visible",
    ".paper-comment-composer textarea:focus",
    ".paper-comment-composer textarea:focus-visible",
    ".artifact-comment-box textarea:focus",
    ".artifact-comment-box textarea:focus-visible",
    ".reader-notebook-section textarea:focus",
    ".reader-notebook-section textarea:focus-visible",
    ".notes-editor:focus",
    ".notes-editor:focus-visible",
  ]) {
    assert.ok(css.includes(selector), `${selector} should be included in the quiet focus reset`);
  }
});

test("chat send controls are unfilled up-arrows", () => {
  assert.match(app, /<ArrowUp size=\{16\} strokeWidth=\{2\.4\} \/>/);
  assert.doesNotMatch(app, /SendHorizontal/);
  assert.match(css, /\.conversation-send,[\s\S]*?background: transparent;[\s\S]*?border-radius: 6px;/);
  assert.match(css, /\.conversation-send:hover,[\s\S]*?color: var\(--accent\);[\s\S]*?background: transparent;/);
  assert.match(css, /\.conversation-send:disabled,[\s\S]*?opacity: \.35;/);
  assert.match(library, /className="paper-ai-send"/);
  assert.match(library, /<ArrowUp size=\{15\} \/>/);
  assert.doesNotMatch(library, /<Send size=\{14\} \/>/);
  assert.match(css, /\.paper-ai-send \{[^}]*background: transparent/);
  assert.doesNotMatch(css, /\.paper-ai-compose \.primary-button/);
  assert.match(library, /className="daily-search-send"/);
  assert.match(css, /\.daily-search-send \{[^}]*background: transparent/);
});

test("main composer supports a minimal voice button beside send", () => {
  assert.match(app, /<div className="composer-send-cluster">[\s\S]*?<VoiceInputButton[\s\S]*?<button className="conversation-send"/);
  assert.match(app, /onTranscribe=\{\(audio, mimeType, language\) => desktopBridge\.transcribeSpeech\(audio, mimeType, language\)\}/);
  assert.match(voice, /MediaRecorder/);
  assert.match(voice, /getUserMedia/);
  assert.match(voice, /MAX_RECORDING_MS = 120_000/);
  assert.match(voice, /<Mic size=\{15\} \/>/);
  assert.match(voice, /Voice recording failed/);
  assert.match(css, /\.conversation-voice \{[^}]*background: transparent/);
  assert.match(css, /\.composer-send-cluster \.conversation-send \{ margin-left: 0; \}/);
  assert.match(main, /speech:transcribe/);
  assert.match(main, /speech:request-permission/);
  assert.match(preload, /transcribeSpeech/);
  assert.match(preload, /requestMicrophoneAccess/);
});
