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
  assert.match(app, /<div className="composer-send-cluster">[\s\S]*?<VoiceInputButton[\s\S]*?className="conversation-send"/);
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

test("composer input has IME protection and grows with the draft", () => {
  assert.match(app, /shouldSubmitPaperChatKey\(event\)/);
  assert.match(app, /aria-label=\{t\("Message Archimedes"\)\}/);
  assert.match(app, /textarea\.style\.height = "auto"/);
  assert.match(app, /textarea\.style\.overflowY = textarea\.scrollHeight > maxHeight \? "auto" : "hidden"/);
});

test("model controls are split and only render when the model supports them", () => {
  assert.match(app, /availableThinkingEfforts\.length > 0 && <div className="reasoning-effort-picker"/);
  assert.match(app, /availableContextLengths\.length > 0 && <div className="reasoning-effort-picker"/);
  assert.doesNotMatch(app, /disabled=\{!availableThinkingEfforts\.length\}/);
  assert.doesNotMatch(app, /disabled=\{!availableContextLengths\.length\}/);
  assert.match(app, /ariaLabel=\{t\("Thinking effort"\)\}/);
  assert.match(app, /ariaLabel=\{t\("Context length"\)\}/);
});

test("runtime is status-first and context usage exposes a readable breakdown", () => {
  assert.doesNotMatch(app, /composer-runtime-switch" role="group"/);
  assert.match(app, /className="composer-runtime-local"/);
  assert.doesNotMatch(app, /composer-runtime-dot/);
  assert.match(app, /className=\{cloudSignedIn \? "composer-runtime-cloud signed-in" : "composer-runtime-cloud locked"\}/);
  assert.match(app, /role="progressbar"/);
  assert.match(app, /aria-valuenow=\{contextUsagePercent\}/);
  assert.match(app, /className="context-usage-breakdown"/);
  assert.match(app, /t\("Instructions"\)/);
  assert.match(app, /onClick=\{onOpenWorkspaceSettings\}/);
  assert.match(app, /selectionStart/);
  assert.match(app, /selectionEnd/);
});

test("composer drafts are persisted per thread and restored after a failed send", () => {
  assert.match(app, /const COMPOSER_DRAFT_STORAGE_PREFIX = "archimedes-composer-draft:"/);
  assert.match(app, /function readComposerDraft\(key: string\)/);
  assert.match(app, /writeComposerDraft\(draftKey/);
  assert.match(app, /const composerDraftKey = activeThreadId \?\?/);
  assert.match(app, /draftKey=\{composerDraftKey\}/);
  assert.match(app, /const sent = await onSubmit\(/);
  assert.match(app, /setPrompt\(\(current\) => current\.trim\(\) \? current : draft\)/);
});

test("composer accepts dropped and pasted files through the existing bridge", () => {
  assert.match(app, /desktopBridge\.attachDroppedFiles\(files\.slice\(0, available\)\)/);
  assert.match(app, /onDragOver=\{\(event\) =>/);
  assert.match(app, /event\.dataTransfer\.dropEffect = "copy"/);
  assert.match(app, /onDrop=\{\(event\) =>/);
  assert.match(app, /className="composer-drop-target"/);
  assert.match(app, /event\.clipboardData\.files/);
  assert.match(app, /Drop files or folders to attach/);
});

test("composer exposes history recall, focus shortcut and disabled-send reason", () => {
  assert.match(app, /COMPOSER_HISTORY_STORAGE_KEY = "archimedes-composer-history"/);
  assert.match(app, /function recallPrompt\(direction: -1 \| 1\)/);
  assert.match(app, /event\.key === "ArrowUp"/);
  assert.match(app, /event\.key === "ArrowDown"/);
  assert.match(app, /event\.key\.toLowerCase\(\) !== "l"/);
  assert.match(app, /aria-keyshortcuts="Control\+L Meta\+L"/);
  assert.match(app, /Add text or attach an image to send/);
});

test("composer queues follow-ups while the agent is busy", () => {
  assert.match(app, /type QueuedPrompt =/);
  assert.match(app, /const \[queuedPrompts, setQueuedPrompts\] = useState<QueuedPrompt\[\]>\(\[\]\)/);
  assert.match(app, /if \(agentBusy\) \{\n      queueCurrentPrompt\(\);/);
  assert.match(app, /up to five follow-ups can be queued at a time/i);
  assert.match(app, /className="composer-queue"/);
  assert.match(app, /onSubmit\(next\.draft, next\.mode, next\.reasoningEffort, next\.contextLength, next\.contextItems\)/);
});

test("composer exposes slash commands and an @ context shortcut", () => {
  assert.match(app, /const slashCommands = \[/);
  assert.match(app, /setSlashQuery/);
  assert.match(app, /ariaLabel=\{t\("Composer commands"\)\}/);
  assert.match(app, /if \(event\.key === "@"/);
  assert.match(app, /setContextPickerRequest\(\(current\) => current \+ 1\)/);
  assert.match(app, /openRequest=\{contextPickerRequest\}/);
});

test("composer exposes the current file and a clear-all attachment action", () => {
  assert.match(app, /currentFile=\{selectedFile\}/);
  assert.match(app, /onClear=\{\(\) => contextItems\.forEach\(\(item\) => onRemoveContext\(item\.id\)\)\}/);
  assert.match(read("src", "ContextPicker.tsx"), /label="Current file"/);
  assert.match(read("src", "ContextPicker.tsx"), /className="attached-context-clear"/);
  assert.match(css, /\.attached-context-clear \{/);
});
