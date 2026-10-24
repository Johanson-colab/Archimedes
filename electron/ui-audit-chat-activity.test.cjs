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
  assert.match(activity, /Agent activity/);
  assert.match(css, /\.chat-activity-card/);
  assert.match(css, /\.chat-activity-step\.running/);
  assert.match(css, /\.chat-activity-step-full/);
});

test("activity is derived from raw trajectory events when a thread is reopened", () => {
  assert.match(activity, /function rawSteps/);
  assert.match(activity, /event\.type === "tool_call"/);
  assert.match(activity, /event\.type === "tool_result"/);
  assert.match(activity, /event\.type === "source_evidence"/);
  assert.match(activity, /const lastTurnId = events\.at\(-1\)\?\.turn_id/);
  assert.match(activity, /calls\.set/);
});
