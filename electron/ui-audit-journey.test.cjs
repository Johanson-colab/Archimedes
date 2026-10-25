const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
const settingsModal = fs.readFileSync(path.join(root, "src", "SettingsModal.tsx"), "utf8");
const panel = fs.readFileSync(path.join(root, "src", "JourneySettingsPanel.tsx"), "utf8");
const journey = fs.readFileSync(path.join(root, "src", "JourneyView.tsx"), "utf8");
const rendererDefaults = fs.readFileSync(path.join(root, "src", "journeySettings.ts"), "utf8");
const store = fs.readFileSync(path.join(root, "electron", "journey-settings.cjs"), "utf8");
const main = fs.readFileSync(path.join(root, "electron", "main.cjs"), "utf8");
const preload = fs.readFileSync(path.join(root, "electron", "preload.cjs"), "utf8");
const css = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const summarizer = fs.readFileSync(path.join(root, "electron", "journey-summarizer.cjs"), "utf8");
const snapshots = fs.readFileSync(path.join(root, "electron", "journey-snapshots.cjs"), "utf8");

test("journey has a dedicated settings section with all controls", () => {
  assert.match(settingsModal, /type SettingsSection = "general" \| "journey"/);
  assert.match(settingsModal, /\{ id: "journey", label: "Journey"/);
  assert.match(settingsModal, /<JourneySettingsPanel/);
  assert.match(settingsModal, /journeySettings: JourneySettings/);
  assert.match(app, /journeySettings=\{journeySettings\}/);
  assert.match(panel, /Default view/);
  assert.match(panel, /Map threshold/);
  assert.match(panel, /Max chapters/);
  assert.match(panel, /Auto-merge/);
  assert.match(panel, /Target episodes/);
  assert.match(panel, /Episode cadence/);
  assert.match(panel, /Idle delay/);
  assert.match(panel, /Brief interval/);
  assert.match(panel, /Summary length/);
  assert.match(panel, /Summary model/);
  assert.match(panel, /Reset Journey settings/);
  assert.match(css, /\.settings-toggle\.on/);
  assert.match(css, /\.settings-stepper/);
});

test("journey defaults are shared by the renderer and the electron store", () => {
  for (const source of [rendererDefaults, store]) {
    assert.match(source, /defaultView: "story"/);
    assert.match(source, /mapMode: "auto"/);
    assert.match(source, /mapChapters: 8/);
    assert.match(source, /mapSteps: 150/);
    assert.match(source, /maxChapters: 10/);
    assert.match(source, /targetEpisodes: 4/);
    assert.match(source, /episodeCadence: 12/);
    assert.match(source, /idleDelay: 60/);
    assert.match(source, /briefInterval: 5/);
    assert.match(source, /maxPinned: 5/);
    assert.match(source, /summaryTokenBudget: 500/);
  }
  assert.match(main, /journey:get-settings/);
  assert.match(main, /journey:save-settings/);
  assert.match(main, /journey:reset-settings/);
  assert.match(preload, /getJourneySettings/);
  assert.match(preload, /saveJourneySettings/);
  assert.match(preload, /resetJourneySettings/);
  assert.match(app, /getJourneySettings\(\)/);
});

test("journey story uses chapters, a scrubber, evidence, and a pinned next move", () => {
  assert.match(journey, /function buildChapters/);
  assert.match(journey, /function buildEpisodes/);
  assert.match(journey, /function buildEvidence/);
  assert.match(journey, /function buildBrief/);
  assert.match(journey, /journey-scrubber/);
  assert.match(journey, /journey-chapters/);
  assert.match(journey, /journey-evidence/);
  assert.match(journey, /journey-dock/);
  assert.match(journey, /journey-views/);
  assert.match(journey, /journey-map/);
  assert.match(journey, /mapAvailable/);
  assert.match(journey, /settings\.mapMode/);
  assert.match(journey, /settings\.mapChapters/);
  assert.match(journey, /settings\.mapSteps/);
  assert.doesNotMatch(journey, /lucide-react/);
  assert.doesNotMatch(journey, /const phases = \[/);
  assert.doesNotMatch(journey, /derived progress/i);
  assert.match(css, /\.journey-scrubber/);
  assert.match(css, /\.journey-map-scrim/);
});

test("journey settings control view, merging, cadence, and pins", () => {
  assert.match(journey, /settings\.defaultView/);
  assert.match(journey, /settings\.collapseCompleted/);
  assert.match(journey, /settings\.autoMerge/);
  assert.match(journey, /settings\.maxChapters/);
  assert.match(journey, /settings\.targetEpisodes/);
  assert.match(journey, /settings\.sinceYouLeft/);
  assert.match(journey, /settings\.followLive/);
  assert.match(journey, /settings\.maxPinned/);
  assert.match(journey, /settings\.evidenceLedger/);
  assert.match(journey, /settings\.openClaims/);
  assert.match(journey, /settings\.summaryLength/);
  assert.match(panel, /\{ value: "story", label: t\("Story"\) \}/);
  assert.match(panel, /\{ value: "auto", label: t\("Auto"\) \}/);
  assert.match(panel, /\{ value: "concise", label: t\("Concise"\) \}/);
  assert.match(panel, /value="current">\{t\("Current chat model"\)\}/);
  assert.match(panel, /Economy model · not configured/);
});

test("journey summaries are loaded, updated on cadence, and stored per thread", () => {
  assert.match(main, /journey:summarize/);
  assert.match(main, /journey:get-summary/);
  assert.match(preload, /summarizeJourney/);
  assert.match(preload, /getJourneySummary/);
  assert.match(journey, /getJourneySummary\(thread\.id\)/);
  assert.match(journey, /summarizeJourney\(/);
  assert.match(journey, /summaryUpdating/);
  assert.match(journey, /summaryError/);
  assert.match(journey, /settings\.episodeCadence/);
  assert.match(journey, /settings\.idleDelay/);
  assert.match(journey, /settings\.briefInterval/);
  assert.match(journey, /settings\.liveSummaries/);
  assert.match(journey, /settings\.updateOnTurnEnd/);
  assert.match(journey, /settings\.updateOnApproval/);
  assert.match(journey, /settings\.targetEpisodes/);
  assert.match(journey, /AI brief/);
  assert.match(journey, /Preview summary/);
  assert.match(summarizer, /maxOutputTokens/);
  assert.match(summarizer, /parseSummary/);
  assert.match(summarizer, /validateSummary/);
  assert.match(summarizer, /Never invent/);
  assert.match(snapshots, /journey-summaries/);
  assert.match(snapshots, /module\.exports/);
});
