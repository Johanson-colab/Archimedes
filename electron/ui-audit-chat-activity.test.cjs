const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
const activity = fs.readFileSync(path.join(root, "src", "ChatActivityTimeline.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");

test("chat renders an inline activity timeline between the prompt and answer", () => {
  assert.match(app, /import ChatActivityTimeline from "\.\/ChatActivityTimeline"/);
  assert.match(app, /trajectoryEvents=\{trajectoryEvents\}/);
  assert.match(app, /<ChatActivityTimeline events=\{events\} rawEvents=\{trajectoryEvents\} busy=\{agentBusy\} interrupting=\{interrupting\} \/>/);
  assert.match(app, /visibleMessages\.slice\(0, lastUserIndex \+ 1\)/);
  assert.match(app, /visibleMessages\.slice\(lastUserIndex \+ 1\)/);
});

test("the old running row and yellow assistant mark are removed from chat", () => {
  assert.doesNotMatch(app, /conversation-running/);
  assert.doesNotMatch(app, /assistant-mark"><ArchimedesMark/);
});

test("default verbosity is grouped steps with collapsible activity", () => {
  assert.match(activity, /chatVerbosity === "low"/);
  assert.match(activity, /chatVerbosity === "high"/);
  assert.match(activity, /steps\.slice\(0, 4\)/);
  assert.match(activity, /chat-activity-more/);
  assert.match(activity, /chat-activity-footer/);
  assert.match(activity, /eventFailedAnswer/);
  assert.match(activity, /Stopped with an error/);
  assert.match(css, /\.chat-activity-footer\.failed/);
  assert.match(activity, /Agent activity/);
  assert.match(css, /\.chat-activity-card/);
  assert.match(css, /\.chat-activity-step\.running/);
  assert.match(css, /\.chat-activity-step-full/);
});

test("activity rows share one column track so labels never overlap details", () => {
  // A fixed label column let long labels overflow into the detail text. The
  // rows are subgrids of one shared track, and the label ellipsizes if the
  // widest label still does not fit.
  assert.match(css, /\.chat-activity-steps \{[^}]*grid-template-columns: 18px minmax\(0, max-content\) minmax\(0, 1fr\) auto/);
  assert.match(css, /\.chat-activity-step \{[^}]*grid-template-columns: subgrid/);
  assert.match(css, /\.chat-activity-step-label \{[^}]*overflow: hidden/);
  assert.match(css, /\.chat-activity-step-label \{[^}]*text-overflow: ellipsis/);
  assert.doesNotMatch(css, /\.chat-activity-step \{[^}]*grid-template-columns: 18px 100px/);
});

test("activity is derived from raw trajectory events when a thread is reopened", () => {
  assert.match(activity, /function rawSteps/);
  assert.match(activity, /event\.type === "tool_call"/);
  assert.match(activity, /event\.type === "tool_result"/);
  assert.match(activity, /event\.type === "source_evidence"/);
  assert.match(activity, /const lastTurnId = events\.at\(-1\)\?\.turn_id/);
  assert.match(activity, /calls\.set/);
});

test("the live and reopened activity reports the same localized snapshot coverage", async () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { transformWithOxc } = await import("vite");
  const strings = fs.readFileSync(path.join(root, "src/i18n/translations/composer.ts"), "utf8");
  const { code: translationsCode } = await transformWithOxc(strings.replace(/^export /m, ""), "composer.ts");
  const translations = new Function(`${translationsCode}\nreturn composer;`)();
  const renderer = activity.replace(/^import .*;$/gm, "").replace("export default function", "function");
  const { code } = await transformWithOxc(renderer, "ChatActivityTimeline.tsx", { jsx: { runtime: "classic" } });
  const icons = require("lucide-react");
  const { BookOpen, ChevronDown, FileCode2, Search, SquareTerminal, Wrench } = icons;
  const t = (key, values = {}) => (translations[key] || key).replace(/\{(\w+)\}/g, (_, name) => values[name]);
  const Component = new Function("React", "useMemo", "useState", "useUISettings", "eventFailedAnswer", "BookOpen", "ChevronDown", "FileCode2", "Search", "SquareTerminal", "Wrench", `${code}\nreturn ChatActivityTimeline;`)(
    React, React.useMemo, React.useState, () => ({ chatVerbosity: "high", t }), () => false, BookOpen, ChevronDown, FileCode2, Search, SquareTerminal, Wrench,
  );
  const coverage = {
    before: { entries: 10, metadataOnly: 2, ignoredDirectories: 1, byteBudgetReached: true, entryLimitReached: false },
    after: { entries: 1, metadataOnly: 0, ignoredDirectories: 1, byteBudgetReached: false, entryLimitReached: false },
  };
  const live = { title: "Workspace change scan is limited", detail: "", state: "done", snapshotCoverage: coverage };
  const persisted = { id: "1", turn_id: "t", type: "workspace_snapshot_coverage", payload: coverage };
  for (const args of [{ events: [live], rawEvents: [] }, { events: [], rawEvents: [persisted] }]) {
    const html = renderToStaticMarkup(React.createElement(Component, { ...args, busy: false, interrupting: false }));
    assert.match(html, /工作区变更扫描受限/);
    assert.match(html, /执行前扫描 · 文件数：10 · 按大小和时间跟踪：2 · 忽略的目录数：1 · 已达到文本读取字节数上限/);
    assert.doesNotMatch(html, /执行后扫描|Before scan/);
  }
});
