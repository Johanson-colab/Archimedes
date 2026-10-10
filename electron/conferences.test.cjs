const test = require("node:test");
const assert = require("node:assert/strict");
const { searchConferencePapers, normalizeConferenceOptions, normalizeVirtualRows, deduplicate, parseAnthology, parseAaaiIssue, enrichSchedule } = require("./conferences.cjs");

const meta = { id: "iclr", label: "ICLR", year: 2026, host: "https://iclr.cc", retrieved_at: "2026-10-10T00:00:00Z" };
const source = "https://iclr.cc/static/virtual/data/iclr-2026-orals-posters.json";
function event(overrides = {}) {
  return { id: 1, name: "A verified paper", decision: "Accept (Poster)", visible: true,
    virtualsite_url: "/virtual/2026/poster/1", sourceurl: "https://openreview.net/group?id=ICLR.cc/2026/Conference",
    paper_url: "https://openreview.net/forum?id=Abcd123456", authors: [{ fullname: "An Author" }], ...overrides };
}

test("conference search bounds years and accounts for biennial conferences", async () => {
  assert.throws(() => normalizeConferenceOptions({ conference: "iclr", year: 2027 }), /2026/);
  assert.throws(() => normalizeConferenceOptions({ conference: "other", year: 2026 }), /supported/);
  const result = await searchConferencePapers({ conference: "iccv", year: 2026 }, { fetchImpl: () => { throw new Error("Must not fetch a nonexistent edition"); } });
  assert.equal(result.status, "not_held"); assert.equal(result.total, 0);
});

test("only accepted main conference records are imported and presentation does not imply a decision", () => {
  const rows = normalizeVirtualRows([
    event(), event({ id: 2, decision: "Reject" }), event({ id: 3, decision: "Withdrawn" }),
    event({ id: 4, sourceurl: "https://openreview.net/group?id=ICLR.cc/2026/Workshop/Test" }),
    event({ id: 5, sourceurl: "https://openreview.net/group?id=ICLR.cc/2026/Position_Paper_Track" }),
    event({ id: 6, visible: false }), event({ id: 7, virtualsite_url: "/virtual/2025/poster/7" }),
    event({ id: 9, name: "Oral Presentations", virtualsite_url: "/virtual/2026/workshop/9" }),
    event({ id: 8, name: "No presentation supplied", decision: "Accept", event_type: "" }),
  ], { 1: "Official abstract" }, meta, source);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].abstract, "Official abstract");
  assert.equal(rows[0].pdf_url, "https://openreview.net/pdf?id=Abcd123456");
  assert.equal(rows[1].conference.presentation, "unknown");
});

test("oral and poster sessions deduplicate with official oral evidence retained", () => {
  const rows = normalizeVirtualRows([event(), event({ id: 2, decision: "Accept (Spotlight)", event_type: "Oral", virtualsite_url: "/virtual/2026/oral/2" })], {}, meta, source);
  const result = deduplicate(rows);
  assert.equal(result.length, 1);
  assert.equal(result[0].conference.presentation, "oral");
  assert.equal(result[0].conference.presentation_source_url, "https://iclr.cc/virtual/2026/oral/2");
});

test("invalid OpenReview placeholders fall back to the official paper page", () => {
  const [paper] = normalizeVirtualRows([event({ paper_url: "https://openreview.net/forum?id=2026-Oral--placeholder" })], {}, meta, source);
  assert.equal(paper.url, "https://iclr.cc/virtual/2026/poster/1");
  assert.equal(paper.pdf_url, "");
});

test("schedule enrichments match real paper titles without adding agenda or workshop entries", () => {
  const papers = normalizeVirtualRows([event()], {}, meta, source);
  const html = '<h3 class="event-title"><a href="/virtual/2026/oral/3">A verified paper</a></h3><h3 class="event-title"><a href="/virtual/2026/oral/4">An agenda item</a></h3>';
  enrichSchedule(papers, html, "oral", "https://iclr.cc/virtual/2026/events/oral", { 3: "An official abstract" });
  assert.equal(papers.length, 1); assert.equal(papers[0].conference.presentation, "oral"); assert.equal(papers[0].abstract, "An official abstract");
});

test("search filters the entire catalog before pagination and reuses cached catalogs", async () => {
  const catalog = normalizeVirtualRows(Array.from({ length: 45 }, (_, id) => event({ id, name: `Paper ${id}`, paper_url: `https://openreview.net/forum?id=p${id}`, decision: id === 44 ? "Accept (Oral)" : "Accept (Poster)" })), {}, meta, source);
  const options = { readCache: () => ({ papers: catalog, sources: [source], fetched_at: meta.retrieved_at, status: "available" }), fetchImpl: () => { throw new Error("Cache should be used"); } };
  const result = await searchConferencePapers({ conference: "iclr", year: 2026, presentation: "oral", query: '"Paper 44"', limit: 10 }, options);
  assert.equal(result.total, 1); assert.equal(result.papers[0].title, "Paper 44"); assert.equal(result.cached, true);
  const page = await searchConferencePapers({ conference: "iclr", year: 2026, offset: 40, limit: 10 }, options);
  assert.equal(page.papers.length, 5); assert.equal(page.has_more, false);
});

test("source failures are distinct from unpublished catalogs and stale data is disclosed", async () => {
  await assert.rejects(searchConferencePapers({ conference: "iclr", year: 2026, forceRefresh: true }, { fetchImpl: async () => new Response("", { status: 403 }) }), /HTTP 403/);
  const empty = await searchConferencePapers({ conference: "emnlp", year: 2026 }, { fetchImpl: async () => new Response("", { status: 404 }) });
  assert.equal(empty.status, "not_published");
  const stale = await searchConferencePapers({ conference: "iclr", year: 2026, forceRefresh: true }, {
    fetchImpl: async () => { throw new Error("network unavailable"); }, readCache: () => ({ papers: [], sources: [source], status: "available" }),
  });
  assert.equal(stale.stale, true); assert.ok(stale.warnings.some((text) => text.includes("刷新失败")));
});

test("anthology parser excludes proceedings front matter and Findings", () => {
  const html = `<div class="d-sm-flex"><span><strong><a href="/2026.acl-long.1/">A main paper</a></strong><span><a href="/people/a/">A Author</a></span></span><div id="abstract-1">Official abstract</div></div>
    <strong><a href="/2026.acl-long.0/">Proceedings</a></strong><strong><a href="/2026.findings-acl.1/">Findings</a></strong>`;
  const papers = parseAnthology(html, { ...meta, id: "acl", label: "ACL" }, "https://aclanthology.org/2026.acl-long/");
  assert.equal(papers.length, 1); assert.deepEqual(papers[0].authors, ["A Author"]);
  assert.equal(papers[0].conference.presentation, "unknown");
});

test("AAAI parser uses real PDF download links and excludes retractions", () => {
  const html = `<div class="obj_article_summary"><h3 class="title"><a href="https://ojs.aaai.org/index.php/AAAI/article/view/123">A paper</a></h3><div class="authors">A Author, B Author</div><a class="pdf" href="https://ojs.aaai.org/index.php/AAAI/article/view/123/456">PDF</a></div>
    <div class="obj_article_summary"><h3 class="title"><a href="/article/view/9">RETRACTED: A paper</a></h3></div>`;
  const papers = parseAaaiIssue(html, { ...meta, id: "aaai", label: "AAAI" }, "https://ojs.aaai.org/index.php/AAAI/issue/view/1");
  assert.equal(papers.length, 1); assert.ok(papers[0].pdf_url.includes("/article/download/123/456"));
  assert.equal(papers[0].conference.presentation, "unknown");
});
