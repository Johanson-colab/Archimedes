const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const app = read("src", "App.tsx");
const layer = read("src", "AgentLayer.tsx");
const researchPath = read("src", "ResearchPathPanel.tsx");
const proactive = read("src", "ProactiveAgentPanel.tsx");
const settingsPanel = read("src", "ProactiveSettingsPanel.tsx");
const settingsModal = read("src", "SettingsModal.tsx");
const types = read("src", "proactive-types.ts");
const engine = read("src", "proactive-engine.ts");
const model = read("electron", "model-config.cjs");
const main = read("electron", "main.cjs");
const proactiveAgent = read("electron", "proactive-agent.cjs");
const hook = read("src", "useProactiveAgent.ts");
const library = read("src", "LibraryView.tsx");
const paper = read("src", "PaperWritingView.tsx");
const css = read("src", "styles.css");
const i18n = read("src", "i18n.tsx");

test("proactive is opt-in and starts off", () => {
  assert.match(types, /mode: "off"/);
  assert.match(types, /Proactive is opt-in|Proactive is opt-in|mode: "off",/);
  assert.match(types, /dailyBudget: 8/);
  assert.match(types, /queued|shown|accepted|dismissed|expired|undone/);
  assert.match(types, /evidence: ProactiveEvidence\[\]/);
  assert.match(types, /whyNow: string/);
  assert.match(types, /fingerprint: string/);
  assert.match(types, /undo\?: \{ label: string; token\?: string \}/);
});

test("the floating layer drags, resizes, clamps, and persists", () => {
  assert.match(layer, /archimedes-agent-layer-v1/);
  assert.match(layer, /agent-float-panel/);
  assert.doesNotMatch(layer, /agent-float-grip/);
  assert.match(layer, /agent-float-resize/);
  assert.match(layer, /startDrag/);
  assert.match(layer, /startResize/);
  assert.match(layer, /clampLayout/);
  assert.match(layer, /ResizeObserver/);
  assert.doesNotMatch(layer, /research-dock/);
});

test("research path keeps the thread state and drops the old chrome", () => {
  assert.doesNotMatch(researchPath, /AI routed/);
  assert.doesNotMatch(researchPath, /Current focus/);
  assert.doesNotMatch(researchPath, /Planned/);
  assert.doesNotMatch(researchPath, /Needs revalidation/);
  assert.doesNotMatch(researchPath, /Review checkpoint/);
  assert.doesNotMatch(researchPath, /research-path-heading/);
  assert.match(researchPath, /agent-path-project/);
  assert.match(researchPath, /agent-path-checkpoint/);
  assert.match(researchPath, /onTogglePin/);
  assert.match(researchPath, /t\("Accept & advance"\)/);
  assert.match(researchPath, /research-path-stage/);
  assert.match(researchPath, /research-path-label/);
  assert.match(researchPath, /onCollapse/);
});

test("the research path state is lifted to the thread owner", () => {
  assert.match(app, /const \[acceptedStages, setAcceptedStages\]/);
  assert.match(app, /const \[staleStages, setStaleStages\]/);
  assert.match(app, /const \[selectedStage, setSelectedStage\]/);
  assert.match(app, /useEffect\(\(\) => \{[\s\S]*?setAcceptedStages\(researchStages\.slice/);
  assert.match(app, /<ResearchPathPanel/);
  assert.match(app, /stages=\{researchStages\}/);
  assert.doesNotMatch(app, /className=\{welcomeVisible \? "conversation-layout has-welcome" : "conversation-layout has-journey"\}/);
});

test("proactive output always carries evidence, why-now, and one primary action", () => {
  assert.match(proactive, /agent-proactive-why/);
  assert.match(proactive, /agent-proactive-evidence-chip/);
  assert.match(proactive, /EvidenceDetail/);
  assert.match(proactive, /agent-proactive-primary/);
  assert.match(proactive, /action\.label/);
  assert.match(proactive, /Not now/);
  assert.match(proactive, /Suggestion history/);
  assert.match(proactive, /Observe once/);
  assert.match(proactive, /agent-proactive-status/);
  assert.doesNotMatch(proactive, /proactive-status-dot/);
  assert.match(proactive, /agent-proactive-menu/);
  assert.match(proactive, /closeOnEscape/);
  assert.doesNotMatch(proactive, /SourceIcon/);
  assert.doesNotMatch(proactive, /window\.open|shell\.open|exec\(/);
});

test("the engine dedupes, expires, budgets, and learns from dismissal", () => {
  assert.match(engine, /isDuplicate/);
  assert.match(engine, /DISMISSED_DEDUPE_WINDOW_MS/);
  assert.match(engine, /expireAndPrune/);
  assert.match(engine, /createdToday/);
  assert.match(engine, /suppressedUntil/);
  assert.match(engine, /findUncitedClaims/);
  assert.match(engine, /citationSignalFromMessages/);
  assert.match(engine, /fingerprintFor/);
  assert.match(engine, /status: "queued"/);
  assert.match(engine, /PROACTIVE_HISTORY_RETENTION_MS/);
});

test("the hook gates on composer focus and uses the dock as the shown boundary", () => {
  assert.match(hook, /COMPOSER_SELECTOR = '\[data-ui="research-composer"\]'/);
  assert.match(hook, /composerHasFocus/);
  assert.match(hook, /focusin/);
  assert.match(hook, /focusout/);
  assert.match(hook, /setAllQueuedShown/);
  assert.match(hook, /if \(!open\) return/);
  assert.match(hook, /IGNORE_COOLDOWN_MS/);
  assert.match(hook, /setPanelView\("inbox"\)/);
  assert.match(hook, /saveProactiveState/);
  assert.match(hook, /archimedes-proactive-open/);
});

test("L0 signals are emitted by the surfaces that own the evidence", () => {
  assert.match(library, /emitProactiveSignal/);
  assert.match(library, /source: "search"/);
  assert.match(library, /source: "selection"/);
  assert.match(library, /You selected the same passage/);
  assert.match(library, /got 0 hits/);
  assert.match(paper, /emitProactiveSignal/);
  assert.match(paper, /source: "latex"/);
  assert.match(paper, /Build failed/);
  assert.match(paper, /Ask AI to fix/);
});

test("toolbar opens the floating panels without stealing focus", () => {
  assert.match(app, /className=\{researchPanelOpen \? "quiet-icon-button dock-toggle open" : "quiet-icon-button dock-toggle"\}/);
  assert.match(app, /className=\{proactive\.open \? "quiet-icon-button dock-toggle open" : "quiet-icon-button dock-toggle"\}/);
  assert.match(app, /dock-badge/);
  assert.match(app, /aria-pressed=\{proactive\.open\}/);
  assert.match(app, /toggleProactiveDock/);
  assert.match(app, /setSettingsSection\("proactive"\)/);
  assert.match(app, /<AgentLayer/);
  assert.match(app, /<ProactiveAgentPanel/);
  assert.doesNotMatch(app, /<ResearchDock/);
  assert.doesNotMatch(app, /researchDockOpen/);
});

test("proactive settings expose mode, budget, quiet hours, and L0 sources", () => {
  assert.match(settingsModal, /type SettingsSection = "general" \| "journey" \| "proactive"/);
  assert.match(settingsModal, /<ProactiveSettingsPanel/);
  assert.match(settingsPanel, /Off/);
  assert.match(settingsPanel, /Manual/);
  assert.match(settingsPanel, /Auto/);
  assert.match(settingsPanel, /Random/);
  assert.match(settingsPanel, /Daily budget/);
  assert.match(settingsPanel, /Quiet hours/);
  assert.match(settingsPanel, /Search with 0 results/);
  assert.match(settingsPanel, /Repeated passage selection/);
  assert.match(settingsPanel, /LaTeX build failure/);
  assert.match(settingsPanel, /Uncited claims/);
  assert.match(settingsPanel, /App screenshots/);
  assert.match(settingsPanel, /L2 · Archimedes window only/);
  assert.match(settingsPanel, /3 dismissals/);
});

test("the proactive header is output-first and uses an amber status mark", () => {
  assert.doesNotMatch(proactive, /proactive-panel-name/);
  assert.match(proactive, /agent-proactive-status/);
  assert.doesNotMatch(proactive, /agent-proactive-budget/);
  assert.doesNotMatch(proactive, /agent-proactive-mark/);
  assert.match(proactive, /agent-proactive-bar/);
  assert.doesNotMatch(proactive, /proactive-status-dot/);
  assert.doesNotMatch(proactive, /SourceIcon/);
  assert.doesNotMatch(researchPath, /<Route|<Flag/);
  assert.match(css, /\.agent-proactive-bar\.active/);
  assert.doesNotMatch(css, /\.agent-proactive[^}]*#8fbf9d/);
});

test("panels float over the workspace and share one surface", () => {
  assert.match(app, /<AgentLayer/);
  assert.doesNotMatch(app, /<ResearchDock/);
  assert.match(app, /researchOpen=\{researchPanelOpen\}/);
  assert.doesNotMatch(app, /research-dock/);
  assert.match(css, /\.agent-layer \{[^}]*position: absolute/);
  assert.match(css, /\.agent-float-panel \{[^}]*border-radius: 14px/);
  assert.match(css, /\.agent-proactive-head,\r?\n\.agent-path-head \{[^}]*background: transparent/);
  assert.match(css, /\.agent-proactive-foot,\r?\n\.agent-proactive-compose \{[\s\S]*?background: transparent/);
  assert.match(css, /\.agent-float-panel > \.agent-proactive-panel/);
  assert.match(css, /\.agent-float-resize/);
});

test("proactive shows the latest output only and hides the composer until asked", () => {
  assert.match(proactive, /const latest = sorted\[0\]/);
  assert.match(proactive, /const selected = selectedId/);
  assert.match(proactive, /composerOpen \?/);
  assert.match(proactive, /agent-proactive-foot/);
  assert.match(proactive, /agent-proactive-history/);
  assert.match(proactive, /controller\.reply/);
  assert.match(proactive, /ArrowUp/);
  assert.doesNotMatch(proactive, /proactive-inbox/);
});

test("proactive suggestions are read-only and replies use the Proactive model", () => {
  assert.match(hook, /runProactiveReply/);
  assert.match(hook, /replyBusy/);
  assert.doesNotMatch(app, /draftProactiveInChat/);
  assert.doesNotMatch(app, /runProactiveSuggestion[\s\S]{0,700}writeWorkspaceFile/);
  assert.match(proactive, /submitReply/);
  assert.match(proactive, /Back to suggestions/);
  assert.match(css, /\.agent-proactive-send \{[^}]*background: transparent/);
  assert.doesNotMatch(css, /\.agent-proactive-send \{[^}]*border-radius: 50%/);
  assert.doesNotMatch(css, /\.theme-paper \.agent-proactive-send \{[^}]*background: #34302a/);
  assert.doesNotMatch(css, /\.agent-proactive-(body|history-list) \{[^}]*scrollbar-width: thin/);
});

test("proactive action labels follow the interface language", () => {
  assert.match(proactive, /function hasCjkLabel/);
  assert.match(proactive, /function actionLabel/);
  assert.match(proactive, /t\("Insert draft"\)/);
  assert.match(proactive, /t\("Copy draft"\)/);
  assert.match(i18n, /"Insert draft": "插入草稿"/);
  assert.match(i18n, /"Copy draft": "复制草稿"/);
});

test("live observation follows the local activity pulse", () => {
  assert.match(hook, /useActivityPulse/);
  assert.match(hook, /observationInterval/);
  assert.match(hook, /shouldObserve/);
  assert.match(hook, /runProactiveObservation/);
  assert.match(hook, /recordObservation/);
  assert.doesNotMatch(proactive, /agent-proactive-activity/);
  assert.doesNotMatch(proactive, /controller\.activity\.score/);
  assert.match(settingsPanel, /Live observation/);
  assert.match(settingsPanel, /liveObservationBudget/);
  assert.match(settingsPanel, /Library radar/);
  assert.match(hook, /citationSignalFromMessages/);
  assert.match(hook, /archimedes-proactive-radar-day/);
});

test("L2 captures the Archimedes window only, never the desktop", () => {
  assert.match(settingsPanel, /appCapture/);
  assert.match(settingsPanel, /disabled={!settings.visionCapable}/);
  assert.match(settingsPanel, /Mark the Proactive model as vision-capable/);
  assert.match(settingsPanel, /L2 · Archimedes window only/);
  assert.match(hook, /captureProactiveScreenshot/);
  assert.match(hook, /proactiveCapture/);
  assert.match(hook, /lastCaptureRef/);
  assert.match(main, /proactive:screenshot/);
  assert.match(main, /captureAppWindow/);
  assert.match(proactiveAgent, /capturePage/);
  assert.match(proactiveAgent, /toJPEG/);
  assert.doesNotMatch(main, /desktopCapturer/);
  assert.match(css, /\[data-proactive-capture="true"\] \.agent-layer/);
});

test("Proactive model lives inside the Proactive agent page", () => {
  assert.match(settingsPanel, /Proactive model/);
  assert.match(settingsPanel, /saveModelConfig/);
  assert.match(settingsPanel, /visionCapable/);
  assert.match(settingsPanel, /This model accepts images/);
  assert.doesNotMatch(settingsModal, /proactive-model/);
  assert.match(model, /role = "agent"/);
  assert.match(model, /useAgent/);
  assert.match(model, /inheritedFromAgent/);
  assert.match(types, /liveObservation: boolean/);
  assert.match(types, /visionCapable: boolean/);
});

test("the research path is thread-scoped and can be pinned globally", () => {
  assert.match(app, /pinnedPathThreadId/);
  assert.match(app, /pathThreadInactive/);
  assert.match(app, /openPathThread/);
  assert.match(app, /archimedes-research-path-pin/);
  assert.match(researchPath, /onTogglePin/);
  assert.match(researchPath, /Open pinned thread/);
  assert.match(researchPath, /threadInactive/);
});

test("configured model starts auto from the dock and random mode opens on signals", () => {
  assert.match(app, /function toggleProactiveDock\(\)[\s\S]*?proactive\.settings\.mode === "off"[\s\S]*?proactive\.modelReady[\s\S]*?proactive\.setSettings\(\{ mode: "auto" \}\)[\s\S]*?proactive\.setOpen\(true\)/);
  assert.match(hook, /const presentSignal = useCallback[\s\S]*?settings\.mode === "random"[\s\S]*?setOpen\(true\)/);
  assert.match(hook, /const persistOpen = state\.settings\.mode === "random" \? false/);
  assert.match(hook, /if \(state\.settings\.mode === "random"\) setOpen\(false\)/);
  assert.match(hook, /\(mode !== "auto" && mode !== "random"\)/);
  assert.match(proactive, /mode === "random"/);
  assert.match(types, /ProactiveMode = "off" \| "manual" \| "auto" \| "random"/);
});
