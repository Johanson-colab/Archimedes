export const defaultJourneySettings: JourneySettings = {
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

const views = new Set<JourneyDefaultView>(["story", "outline"]);
const mapModes = new Set<JourneyMapMode>(["auto", "always", "off"]);
const summaryLengths = new Set<JourneySummaryLength>(["concise", "standard", "detailed"]);
const summaryModels = new Set<JourneySummaryModel>(["current", "economy"]);
const chapterDetections = new Set<JourneyChapterDetection>(["ai", "turns"]);

function clampNumber(value: unknown, fallback: number, min: number, max: number, step = 1) {
  const raw = Number(value);
  const numeric = Math.round((Number.isFinite(raw) ? raw : fallback) / step) * step;
  return Math.max(min, Math.min(max, numeric));
}

export function normalizeJourneySettings(input: Partial<JourneySettings> = {}): JourneySettings {
  const next = { ...defaultJourneySettings, ...input };
  if (!views.has(next.defaultView)) next.defaultView = "story";
  if (!mapModes.has(next.mapMode)) next.mapMode = "auto";
  if (!summaryLengths.has(next.summaryLength)) next.summaryLength = "standard";
  if (!summaryModels.has(next.summaryModel)) next.summaryModel = "current";
  if (!chapterDetections.has(next.chapterDetection)) next.chapterDetection = "ai";
  next.mapChapters = clampNumber(next.mapChapters, 8, 4, 20);
  next.mapSteps = clampNumber(next.mapSteps, 150, 50, 500, 10);
  next.maxChapters = clampNumber(next.maxChapters, 10, 6, 16);
  next.targetEpisodes = clampNumber(next.targetEpisodes, 4, 3, 6);
  next.episodeCadence = clampNumber(next.episodeCadence, 12, 6, 24);
  next.idleDelay = clampNumber(next.idleDelay, 60, 20, 180, 10);
  next.briefInterval = clampNumber(next.briefInterval, 5, 1, 15);
  next.maxPinned = clampNumber(next.maxPinned, 5, 3, 10);
  next.summaryTokenBudget = clampNumber(next.summaryTokenBudget, 500, 200, 800, 50);
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
