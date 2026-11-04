const test = require("node:test");
const assert = require("node:assert/strict");

const venues = require("./paper-review-venues.cjs");

test("venue packs load and cover the public conference set", () => {
  const packs = venues.listVenues();
  assert.ok(packs.length >= 5);
  const ids = new Set(packs.map((pack) => pack.id));
  assert.equal(ids.size, packs.length);
  for (const id of ["iclr-2026-main", "neurips-2026-main", "icml-2026-main", "acl-2026-main", "cvpr-2026-main"]) {
    assert.ok(ids.has(id), `missing ${id}`);
  }
  for (const pack of packs) {
    assert.equal(venues.validateVenuePack(pack), true);
    assert.ok(pack.sourceUrls.every((url) => url.startsWith("https://")));
    assert.ok(pack.template.summary.length > 10);
    assert.ok(pack.rubric.summary.length > 10);
  }
});

test("public venue metadata omits prompts and keeps the review scale", () => {
  const [venue] = venues.publicVenues();
  assert.ok(venue.id);
  assert.equal(venue.rubric, undefined);
  assert.equal(venue.template, undefined);
  assert.ok(venue.overall.max > venue.overall.min);
  assert.ok(venue.subdimensions.length >= 2);
});

test("decision bands map a score to a venue label", () => {
  const iclr = venues.getVenue("iclr-2026-main");
  assert.equal(venues.decisionForScore(iclr, 1), "Reject");
  assert.equal(venues.decisionForScore(iclr, 5), "Borderline");
  assert.equal(venues.decisionForScore(iclr, 7), "Weak accept");
  assert.equal(venues.decisionForScore(iclr, 10), "Accept");
  const acl = venues.getVenue("acl-2026-main");
  assert.equal(venues.decisionForScore(acl, 2), "Reject");
  assert.equal(venues.decisionForScore(acl, 3), "Borderline");
  assert.equal(venues.decisionForScore(acl, 4), "Accept");
});

test("venue validation fails closed on missing labels and decision gaps", () => {
  const base = structuredClone(venues.getVenue("iclr-2026-main"));
  const missingLabel = structuredClone(base);
  delete missingLabel.overall.labels["7"];
  assert.throws(() => venues.validateVenuePack(missingLabel), /labels is missing 7/);

  const gap = structuredClone(base);
  gap.decisionBands = [{ min: 1, max: 4, label: "Reject" }, { min: 6, max: 10, label: "Accept" }];
  assert.throws(() => venues.validateVenuePack(gap), /gap/);

  const badSource = structuredClone(base);
  badSource.sourceUrls = ["http://example.com"];
  assert.throws(() => venues.validateVenuePack(badSource), /HTTPS/);
});
