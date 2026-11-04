const fs = require("node:fs");
const path = require("node:path");

/**
 * Versioned venue packs for the Paper review micro app.
 *
 * Packs are plain JSON under shared/paper-review/venue-packs so they can be
 * reviewed and diffed like code. Validation is intentionally strict: a pack
 * with an out-of-range score, a missing rubric section or a decision-band gap
 * must never reach a review prompt.
 */

const PACK_DIR = path.join(__dirname, "..", "shared", "paper-review", "venue-packs");
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,80}$/;

let cache = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function integerRange(value, name) {
  assert(value && Number.isInteger(value.min) && Number.isInteger(value.max), `${name} needs integer min and max.`);
  assert(value.max > value.min, `${name} max must be greater than min.`);
  return value;
}

function validateScale(value, name) {
  integerRange(value, name);
  assert(value.labels && typeof value.labels === "object", `${name}.labels is required.`);
  for (let score = value.min; score <= value.max; score += 1) {
    assert(typeof value.labels[String(score)] === "string" && value.labels[String(score)].trim(), `${name}.labels is missing ${score}.`);
  }
}

function validateVenuePack(pack, source = "venue pack") {
  assert(pack && typeof pack === "object", `${source} must be an object.`);
  assert(pack.schemaVersion === 1, `${source} has an unsupported schemaVersion.`);
  assert(typeof pack.id === "string" && ID_PATTERN.test(pack.id), `${source} has an invalid id.`);
  assert(typeof pack.venue === "string" && pack.venue.trim(), `${source} needs a venue name.`);
  assert(Number.isInteger(pack.year) && pack.year >= 2024 && pack.year <= 2100, `${source} needs a valid year.`);
  assert(typeof pack.track === "string" && pack.track.trim(), `${source} needs a track.`);
  assert(typeof pack.displayName === "string" && pack.displayName.trim(), `${source} needs a displayName.`);
  assert(typeof pack.version === "string" && pack.version.trim(), `${source} needs a version.`);
  assert(Array.isArray(pack.sourceUrls) && pack.sourceUrls.length > 0, `${source} needs at least one source URL.`);
  for (const url of pack.sourceUrls) assert(/^https:\/\//i.test(String(url)), `${source} source URLs must use HTTPS.`);
  assert(typeof pack.anonymous === "boolean", `${source} needs an anonymous flag.`);
  assert(Number.isInteger(pack.pageLimit) && pack.pageLimit > 0 && pack.pageLimit <= 60, `${source} needs a sane pageLimit.`);

  validateScale(pack.overall, `${source}.overall`);
  validateScale(pack.confidence, `${source}.confidence`);

  assert(Array.isArray(pack.subdimensions) && pack.subdimensions.length >= 2, `${source} needs at least two subdimensions.`);
  const dimensionIds = new Set();
  let totalWeight = 0;
  for (const dimension of pack.subdimensions) {
    assert(typeof dimension.id === "string" && ID_PATTERN.test(dimension.id), `${source} has an invalid subdimension id.`);
    assert(!dimensionIds.has(dimension.id), `${source} repeats subdimension ${dimension.id}.`);
    dimensionIds.add(dimension.id);
    assert(typeof dimension.label === "string" && dimension.label.trim(), `${source}.${dimension.id} needs a label.`);
    integerRange(dimension, `${source}.${dimension.id}`);
    assert(Number.isFinite(Number(dimension.weight)) && Number(dimension.weight) > 0, `${source}.${dimension.id} needs a positive weight.`);
    assert(typeof dimension.guidance === "string" && dimension.guidance.trim(), `${source}.${dimension.id} needs guidance.`);
    totalWeight += Number(dimension.weight);
  }
  assert(totalWeight > 0, `${source} subdimension weights must sum to a positive value.`);

  assert(Array.isArray(pack.decisionBands) && pack.decisionBands.length > 0, `${source} needs decision bands.`);
  const bands = [...pack.decisionBands].sort((left, right) => Number(left.min) - Number(right.min));
  let cursor = pack.overall.min;
  for (const band of bands) {
    assert(typeof band.label === "string" && band.label.trim(), `${source} decision bands need labels.`);
    assert(Number.isFinite(Number(band.min)) && Number.isFinite(Number(band.max)), `${source} decision bands need numeric bounds.`);
    assert(Number(band.min) <= cursor + 0.02, `${source} decision bands overlap or leave a gap at ${band.min}.`);
    assert(Number(band.max) >= Number(band.min), `${source} has an inverted decision band.`);
    cursor = Math.max(cursor, Number(band.max));
  }
  assert(cursor >= pack.overall.max - 0.001, `${source} decision bands do not cover the overall scale.`);

  assert(Array.isArray(pack.deskRejectRules) && pack.deskRejectRules.length > 0, `${source} needs desk-reject rules.`);
  assert(pack.template && typeof pack.template === "object", `${source} needs a review template.`);
  for (const key of ["summary", "strengths", "weaknesses", "questions", "limitations"]) {
    assert(typeof pack.template[key] === "string" && pack.template[key].trim(), `${source}.template.${key} is required.`);
  }
  assert(pack.rubric && typeof pack.rubric === "object", `${source} needs a rubric.`);
  assert(typeof pack.rubric.summary === "string" && pack.rubric.summary.trim(), `${source}.rubric.summary is required.`);
  return true;
}

function loadPacks() {
  if (cache) return cache;
  if (!fs.existsSync(PACK_DIR)) throw new Error("Paper review venue packs are missing.");
  const packs = [];
  const seen = new Set();
  for (const file of fs.readdirSync(PACK_DIR).filter((name) => name.endsWith(".json")).sort()) {
    const fullPath = path.join(PACK_DIR, file);
    let pack;
    try {
      pack = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    } catch (error) {
      throw new Error(`Could not parse venue pack ${file}: ${error.message}`);
    }
    validateVenuePack(pack, file);
    if (seen.has(pack.id)) throw new Error(`Duplicate venue pack id: ${pack.id}`);
    seen.add(pack.id);
    packs.push(structuredClone(pack));
  }
  if (!packs.length) throw new Error("No Paper review venue packs were found.");
  packs.sort((left, right) => right.year - left.year || left.venue.localeCompare(right.venue) || left.track.localeCompare(right.track));
  cache = packs;
  return cache;
}

function listVenues() {
  return loadPacks().map((pack) => structuredClone(pack));
}

function publicVenues() {
  return loadPacks().map((pack) => ({
    id: pack.id,
    venue: pack.venue,
    year: pack.year,
    track: pack.track,
    displayName: pack.displayName,
    version: pack.version,
    pageLimit: pack.pageLimit,
    overall: { min: pack.overall.min, max: pack.overall.max },
    confidence: { min: pack.confidence.min, max: pack.confidence.max },
    subdimensions: pack.subdimensions.map((dimension) => ({ id: dimension.id, label: dimension.label, min: dimension.min, max: dimension.max })),
    sourceUrls: [...pack.sourceUrls],
    notes: pack.notes || "",
  }));
}

function getVenue(id) {
  const pack = loadPacks().find((candidate) => candidate.id === id);
  return pack ? structuredClone(pack) : null;
}

function decisionForScore(pack, score) {
  const value = Number(score);
  const band = pack.decisionBands.find((entry) => value >= Number(entry.min) - 0.001 && value <= Number(entry.max) + 0.001);
  return band ? band.label : "Unclassified";
}

module.exports = {
  PACK_DIR,
  validateVenuePack,
  listVenues,
  publicVenues,
  getVenue,
  decisionForScore,
};
