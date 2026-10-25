const fs = require("node:fs");
const path = require("node:path");

const SETTINGS_FILE = "journey-settings.json";
const DEFAULT_VIEWS = new Set(["story", "outline"]);
const MAP_MODES = new Set(["auto", "always", "off"]);
const SUMMARY_LENGTHS = new Set(["concise", "standard", "detailed"]);
const SUMMARY_MODELS = new Set(["current", "economy"]);
const CHAPTER_DETECTIONS = new Set(["ai", "turns"]);

let settingsPath = "";
let settings = null;

function defaults() {
  return {
    defaultView: "story",
    mapMode: "auto",
    mapChapters: 8,
    mapSteps: 150,
    sinceYouLeft: true,
    followLive: true,
    maxChapters: 10,
    autoMerge: true,
    collapseCompleted: true,
    targetEpisodes: 4,
    liveSummaries: true,
    episodeCadence: 12,
    idleDelay: 60,
    briefInterval: 5,
    summaryLength: "standard",
    summaryModel: "current",
    updateOnTurnEnd: true,
    updateOnApproval: true,
    evidenceLedger: true,
    openClaims: true,
    maxPinned: 5,
    chapterDetection: "ai",
    summaryTokenBudget: 500,
  };
}

function number(value, fallback, min, max, step = 1) {
  const raw = Number(value);
  const numeric = Math.round((Number.isFinite(raw) ? raw : fallback) / step) * step;
  return Math.max(min, Math.min(max, numeric));
}

function normalize(input = {}) {
  const next = { ...defaults(), ...(settings || {}), ...input };
  if (!DEFAULT_VIEWS.has(next.defaultView)) next.defaultView = "story";
  if (!MAP_MODES.has(next.mapMode)) next.mapMode = "auto";
  if (!SUMMARY_LENGTHS.has(next.summaryLength)) next.summaryLength = "standard";
  if (!SUMMARY_MODELS.has(next.summaryModel)) next.summaryModel = "current";
  if (!CHAPTER_DETECTIONS.has(next.chapterDetection)) next.chapterDetection = "ai";
  next.mapChapters = number(next.mapChapters, 8, 4, 20);
  next.mapSteps = number(next.mapSteps, 150, 50, 500, 10);
  next.maxChapters = number(next.maxChapters, 10, 6, 16);
  next.targetEpisodes = number(next.targetEpisodes, 4, 3, 6);
  next.episodeCadence = number(next.episodeCadence, 12, 6, 24);
  next.idleDelay = number(next.idleDelay, 60, 20, 180, 10);
  next.briefInterval = number(next.briefInterval, 5, 1, 15);
  next.maxPinned = number(next.maxPinned, 5, 3, 10);
  next.summaryTokenBudget = number(next.summaryTokenBudget, 500, 200, 800, 50);
  next.sinceYouLeft = Boolean(next.sinceYouLeft);
  next.followLive = Boolean(next.followLive);
  next.autoMerge = Boolean(next.autoMerge);
  next.collapseCompleted = Boolean(next.collapseCompleted);
  next.liveSummaries = Boolean(next.liveSummaries);
  next.updateOnTurnEnd = Boolean(next.updateOnTurnEnd);
  next.updateOnApproval = Boolean(next.updateOnApproval);
  next.evidenceLedger = Boolean(next.evidenceLedger);
  next.openClaims = Boolean(next.openClaims);
  return next;
}

function initialize(userDataPath) {
  settingsPath = path.join(userDataPath, SETTINGS_FILE);
  try {
    settings = normalize(JSON.parse(fs.readFileSync(settingsPath, "utf8")));
  } catch {
    settings = defaults();
  }
  return settings;
}

function persist() {
  if (!settingsPath) return;
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

function journeySettings() {
  if (!settings) settings = defaults();
  return { ...settings };
}

function saveJourneySettings(input = {}) {
  settings = normalize(input);
  persist();
  return journeySettings();
}

function resetJourneySettings() {
  settings = defaults();
  persist();
  return journeySettings();
}

module.exports = {
  defaults,
  initialize,
  journeySettings,
  normalize,
  resetJourneySettings,
  saveJourneySettings,
};
