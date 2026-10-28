const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const app = read("src", "App.tsx");
const dock = read("src", "ResearchDock.tsx");
const researchPath = read("src", "ResearchPathPanel.tsx");
const proactive = read("src", "ProactiveAgentPanel.tsx");
const settingsPanel = read("src", "ProactiveSettingsPanel.tsx");
const settingsModal = read("src", "SettingsModal.tsx");
const types = read("src", "proactive-types.ts");
const engine = read("src", "proactive-engine.ts");
const hook = read("src", "useProactiveAgent.ts");
const library = read("src", "LibraryView.tsx");
const paper = read("src", "PaperWritingView.tsx");
const css = read("src", "styles.css");

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

test("the dock is global, collapsible, reorderable, resizable, and never auto-opens", () => {
  assert.match(dock, /archimedes-research-dock-v1/);
  assert.match(dock, /order: \["research", "proactive"\]/);
  assert.match(dock, /researchOpen/);
  assert.match(dock, /proactiveOpen/);
  assert.match(dock, /if \(!openIds\.length\) return null/);
  assert.match(dock, /onPointerDown=\{\(event\) => startDrag\(event, id\)\}/);
  assert.match(dock, /const reorder =/);
  assert.match(dock, /document\.elementFromPoint/);
  assert.match(dock, /role="separator"/);
  assert.match(dock, /onDoubleClick/);
  assert.match(dock, /--dock-split/);
  assert.doesNotMatch(dock, /autoOpen|setOpen\(true\)/);
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

test("toolbar exposes the global dock and proactive agent without stealing focus", () => {
  assert.match(app, /className=\{researchDockOpen \? "quiet-icon-button dock-toggle open" : "quiet-icon-button dock-toggle"\}/);
  assert.match(app, /className=\{proactive\.open \? "quiet-icon-button dock-toggle open" : "quiet-icon-button dock-toggle"\}/);
  assert.match(app, /dock-badge/);
  assert.match(app, /aria-pressed=\{proactive\.open\}/);
  assert.match(app, /toggleProactiveDock/);
  assert.match(app, /setSettingsSection\("proactive"\)/);
  assert.match(app, /<ResearchDock/);
  assert.match(app, /<ProactiveAgentPanel/);
  assert.match(app, /<div className="conversation-title"><strong>\{mainTitle\}<\/strong><\/div>/);
  assert.doesNotMatch(app, /researchDockOpen && mainSection === "chat"/);
  assert.doesNotMatch(app, /disabled=\{mainSection !== "chat"\}/);
});

test("proactive settings expose mode, budget, quiet hours, and L0 sources", () => {
  assert.match(settingsModal, /type SettingsSection = "general" \| "journey" \| "proactive"/);
  assert.match(settingsModal, /<ProactiveSettingsPanel/);
  assert.match(settingsPanel, /Off/);
  assert.match(settingsPanel, /Manual/);
  assert.match(settingsPanel, /Auto/);
  assert.match(settingsPanel, /Daily budget/);
  assert.match(settingsPanel, /Quiet hours/);
  assert.match(settingsPanel, /Search with 0 results/);
  assert.match(settingsPanel, /Repeated passage selection/);
  assert.match(settingsPanel, /LaTeX build failure/);
  assert.match(settingsPanel, /Uncited claims/);
  assert.match(settingsPanel, /No screenshots/);
  assert.match(settingsPanel, /3 dismissals/);
});

test("the proactive header is output-first and uses an amber status mark", () => {
  assert.doesNotMatch(proactive, /proactive-panel-name/);
  assert.match(proactive, /agent-proactive-status/);
  assert.match(proactive, /agent-proactive-budget/);
  assert.match(proactive, /agent-proactive-bar/);
  assert.doesNotMatch(proactive, /proactive-status-dot/);
  assert.doesNotMatch(proactive, /SourceIcon/);
  assert.doesNotMatch(researchPath, /<Route|<Flag/);
  assert.match(css, /\.agent-proactive-bar\.active/);
  assert.doesNotMatch(css, /\.agent-proactive[^}]*#8fbf9d/);
});

test("the dock is 186px, global, and keeps the work surface a stable row", () => {
  assert.match(css, /\.codex-main \{[\s\S]*?grid-template-rows: 44px auto minmax\(0, 1fr\)/);
  assert.match(css, /\.main-workspace \{[^}]*grid-row: 3/);
  assert.match(css, /\.research-dock \{[^}]*height: 186px/);
  assert.match(css, /\.research-dock-panel \{[^}]*border-radius: 12px/);
  assert.match(css, /\.research-dock\.split \.research-dock-panels/);
  assert.match(css, /\.theme-paper \.research-dock/);
  assert.match(css, /\.research-path-label/);
  assert.match(app, /researchOpen=\{researchDockOpen\}/);
  assert.match(css, /@media \(max-width: 980px\)/);
});

test("proactive shows the latest output only and hides the composer until asked", () => {
  assert.match(proactive, /const latest = sorted\[0\]/);
  assert.match(proactive, /const selected = selectedId/);
  assert.match(proactive, /composerOpen \?/);
  assert.match(proactive, /agent-proactive-foot/);
  assert.match(proactive, /agent-proactive-history/);
  assert.match(proactive, /onDraftInChat/);
  assert.doesNotMatch(proactive, /proactive-inbox/);
});

test("proactive suggestions are read-only and only draft into the main chat", () => {
  assert.match(app, /function draftProactiveInChat/);
  assert.match(app, /Draft added to the main composer/);
  assert.doesNotMatch(app, /runProactiveSuggestion[\s\S]{0,700}writeWorkspaceFile/);
  assert.match(proactive, /Suggestions only · drafts go to chat/);
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
