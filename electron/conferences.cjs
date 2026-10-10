const { JSDOM } = require("jsdom");
const conferences = require("../shared/conferences.json");
const { matchesDailyTopic } = require("./literature.cjs");

const YEAR_MIN = 2023;
const YEAR_MAX = 2026;
const TTL = 6 * 60 * 60 * 1000;
const pending = new Map();
const RANK = { oral: 3, spotlight: 2, poster: 1, unknown: 0 };
const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
const titleKey = (value) => clean(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

function normalizeConferenceOptions(input = {}) {
  const conference = conferences.find((entry) => entry.id === input.conference);
  if (!conference) throw new Error("Choose one of the supported conferences.");
  const year = Number(input.year ?? YEAR_MAX);
  if (!Number.isInteger(year) || year < YEAR_MIN || year > YEAR_MAX) throw new Error(`Choose a year from ${YEAR_MIN} to ${YEAR_MAX}.`);
  const presentation = input.presentation ?? "all";
  if (!["all", "oral", "spotlight", "poster", "unknown"].includes(presentation)) throw new Error("Choose a valid presentation format.");
  return {
    conference: conference.id, year, presentation,
    query: clean(input.query).slice(0, 300), topic: input.topic || "all",
    offset: Math.max(0, Math.min(100000, Math.trunc(Number(input.offset) || 0))),
    limit: Math.max(1, Math.min(100, Math.trunc(Number(input.limit) || 40))),
  };
}

function presentationOf(value) {
  const text = clean(value);
  if (/reject|withdraw|desk.reject|under.review/i.test(text)) return null;
  if (/\boral\b/i.test(text)) return "oral";
  if (/\bspotlight\b/i.test(text)) return "spotlight";
  if (/\bposter\b/i.test(text)) return "poster";
  return "unknown";
}

function publicUrl(value, base) {
  if (!value) return "";
  try {
    const url = new URL(value, base);
    if (!["https:", "http:"].includes(url.protocol)) return "";
    url.protocol = "https:";
    return url.href;
  } catch { return ""; }
}

function pdfFromLink(value) {
  if (!value) return "";
  const url = new URL(value);
  if (url.hostname === "openreview.net" && url.pathname === "/forum" && url.searchParams.get("id")) {
    if (!/^[a-zA-Z0-9]{10}$/.test(url.searchParams.get("id"))) return "";
    url.pathname = "/pdf";
    return url.href;
  }
  if (url.hostname === "openaccess.thecvf.com" && /\/html\/.*_paper\.html$/.test(url.pathname)) {
    url.pathname = url.pathname.replace("/html/", "/papers/").replace(/\.html$/, ".pdf");
    return url.href;
  }
  return /\.pdf(?:$|\?)/i.test(value) || url.pathname === "/pdf" ? value : "";
}

function paperRecord(meta, data) {
  return {
    external_id: data.external_id || data.url, s2_id: "", arxiv_id: "", doi: data.doi || "",
    title: data.title, authors: data.authors || [], year: meta.year, venue: `${meta.label} ${meta.year}`,
    abstract: data.abstract || "", url: data.url, pdf_url: data.pdf_url || "", citation_count: 0,
    source: data.source || "official-conference", published_at: "", discovered_at: "",
    categories: data.categories || [], upvotes: 0, github_url: "", github_stars: 0,
    conference: {
      id: meta.id, year: meta.year, presentation: data.presentation || "unknown",
      decision: data.decision || "Accepted", track: data.track || "Main conference",
      source_url: data.source_url, presentation_source_url: data.presentation_source_url || "",
      retrieved_at: meta.retrieved_at,
    },
  };
}

function deduplicate(papers) {
  const byTitle = new Map();
  for (const paper of papers) {
    const key = titleKey(paper.title);
    if (!key || !paper.url || /^(?:retracted|withdrawn|erratum|proceedings of)/i.test(paper.title)) continue;
    const current = byTitle.get(key);
    if (!current) { byTitle.set(key, paper); continue; }
    const ranked = RANK[paper.conference.presentation] > RANK[current.conference.presentation] ? paper : current;
    byTitle.set(key, { ...ranked, authors: ranked.authors.length ? ranked.authors : current.authors.length ? current.authors : paper.authors,
      abstract: ranked.abstract || current.abstract || paper.abstract, pdf_url: ranked.pdf_url || current.pdf_url || paper.pdf_url });
  }
  return [...byTitle.values()];
}

async function get(url, context, optional = false) {
  const response = await context.fetchImpl(url, { headers: { "User-Agent": "Archimedes-Research/0.1", Accept: "application/json,text/html" }, signal: AbortSignal.timeout(45000) });
  if (optional && [404, 410].includes(response.status)) return null;
  if (!response.ok) throw new Error(`Official source returned HTTP ${response.status}: ${url}`);
  const text = await response.text();
  if (text.length > 80_000_000) throw new Error("Official catalog exceeded the download size limit.");
  return text;
}

function normalizeVirtualRows(rows, abstracts, meta, sourceUrl) {
  return rows.flatMap((row) => {
    const title = clean(row.name);
    const virtualUrl = publicUrl(row.virtualsite_url, meta.host);
    // The export can also contain workshops, position papers and duplicated oral sessions.
    if (!title || row.visible === false || !new RegExp(`/virtual/${meta.year}/(?:loc/[^/]+/)?(?:poster|oral)/\\d+$`).test(virtualUrl) || /workshop|tutorial/i.test(row.sourceurl || "")) return [];
    if (row.sourceurl && /openreview|\.cc\/|thecvf\.com\//i.test(row.sourceurl) && !new RegExp(`/${meta.year}/Conference(?:$|[&#])`).test(row.sourceurl)) return [];
    const decision = clean(row.decision);
    const decisionPresentation = presentationOf(decision);
    if (decisionPresentation === null) return [];
    const eventPresentation = presentationOf(row.event_type || row.eventtype) || "unknown";
    const presentation = RANK[eventPresentation] > RANK[decisionPresentation] ? eventPresentation : decisionPresentation;
    const paperPdfLink = publicUrl(row.paper_pdf_url, meta.host);
    const categories = [...(row.keywords || []).map(clean), clean(row.topic)].filter(Boolean);
    return [paperRecord(meta, {
      title, authors: (row.authors || []).map((author) => clean(author.fullname)).filter(Boolean),
      // OpenReview forum and PDF links in current conference exports can stay
      // access-controlled after the public schedule is live. The official
      // virtual entry is the stable, reader-facing record for this paper.
      url: virtualUrl,
      pdf_url: new URL(paperPdfLink || virtualUrl).hostname === "openreview.net" ? "" : pdfFromLink(paperPdfLink),
      abstract: clean(row.abstract || abstracts?.[String(row.id)]), categories,
      presentation, decision: decision || row.event_type || "Accepted", source_url: sourceUrl,
      presentation_source_url: virtualUrl,
    })];
  });
}

function parseCvf(html, meta, sourceUrl) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const papers = [...doc.querySelectorAll("dt.ptitle")].flatMap((item) => {
    const link = item.querySelector("a");
    const url = publicUrl(link?.getAttribute("href"), sourceUrl);
    if (!url.includes(`/content/${meta.label}${meta.year}/html/`)) return [];
    const authorRow = item.nextElementSibling;
    const authors = [...(authorRow?.querySelectorAll("a") || [])].map((a) => clean(a.textContent));
    return [paperRecord(meta, { title: clean(link.textContent), authors, url, pdf_url: pdfFromLink(url), source: "cvf-proceedings", source_url: sourceUrl })];
  });
  dom.window.close();
  return papers;
}

function enrichSchedule(papers, html, presentation, sourceUrl, abstracts = {}) {
  const dom = new JSDOM(html);
  const records = new Map(papers.map((paper) => [titleKey(paper.title), paper]));
  for (const link of dom.window.document.querySelectorAll("a[href]")) {
    const paper = records.get(titleKey(link.textContent));
    const url = publicUrl(link.getAttribute("href"), sourceUrl);
    const id = new RegExp(`/virtual/\\d{4}/${presentation}/(\\d+)$`).exec(url)?.[1];
    if (!paper || !id) continue;
    if (RANK[presentation] > RANK[paper.conference.presentation]) {
      paper.conference.presentation = presentation;
      paper.conference.presentation_source_url = url;
      paper.conference.decision = `Accepted (${presentation})`;
    }
    if (!paper.abstract && abstracts[id]) paper.abstract = clean(abstracts[id]);
  }
  dom.window.close();
}

async function loadVirtual(meta, context) {
  const sourceUrl = `${meta.host}/static/virtual/data/${meta.id}-${meta.year}-orals-posters.json`;
  const abstractUrl = `${meta.host}/static/virtual/data/${meta.id}-${meta.year}-abstracts.json`;
  const [catalogText, abstractResult] = await Promise.all([get(sourceUrl, context, true), get(abstractUrl, context, true).catch(() => null)]);
  if (!catalogText) return { papers: [], status: "not_published", sources: [sourceUrl] };
  let payload = JSON.parse(catalogText);
  if (!Array.isArray(payload.results)) throw new Error("The official conference catalog format has changed.");
  const rows = [...payload.results];
  const abstracts = abstractResult ? JSON.parse(abstractResult) : {};
  const warnings = [];
  const visited = new Set();
  while (payload.next) {
    const next = publicUrl(payload.next, meta.host);
    if (new URL(next).origin !== meta.host || visited.has(next)) throw new Error("Invalid official catalog pagination.");
    visited.add(next);
    try {
      payload = JSON.parse(await get(next, context));
      if (!Array.isArray(payload.results)) throw new Error("Invalid catalog page.");
      rows.push(...payload.results);
    } catch (error) {
      warnings.push("The official presentation catalog could not be loaded completely.");
      break;
    }
    if (visited.size > 100) throw new Error("Conference pagination exceeded its limit.");
  }
  let papers = normalizeVirtualRows(rows, abstracts, meta, sourceUrl);
  const sources = [sourceUrl];
  if (abstractResult) sources.push(abstractUrl);
  if (warnings.length && ["cvpr", "iccv"].includes(meta.id)) {
    const proceedingsUrl = `https://openaccess.thecvf.com/${meta.label}${meta.year}?day=all`;
    const html = await get(proceedingsUrl, context);
    papers.push(...parseCvf(html, meta, proceedingsUrl));
    sources.push(proceedingsUrl);
    papers = deduplicate(papers);
    for (const presentation of ["poster", "oral"]) {
      const scheduleUrl = `${meta.host}/virtual/${meta.year}/events/${presentation}`;
      try {
        const scheduleHtml = await get(scheduleUrl, context, true);
        if (scheduleHtml) { enrichSchedule(papers, scheduleHtml, presentation, scheduleUrl, abstracts); sources.push(scheduleUrl); }
      } catch { /* Proceedings remain verifiable even if a presentation schedule cannot be read. */ }
    }
    const unknown = papers.filter((paper) => paper.conference.presentation === "unknown").length;
    warnings[0] = unknown ? `The official proceedings filled the catalog. ${unknown} papers could not be matched to an accessible presentation schedule and are marked Unclassified.` : "";
  }
  return { papers: deduplicate(papers), status: warnings.some(Boolean) ? "partial" : "available", sources, warnings: warnings.filter(Boolean) };
}

function parseAnthology(html, meta, sourceUrl) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const pattern = new RegExp(`^/${meta.year}\\.${meta.id}-(?:long|short|main)\\.[1-9]\\d*/$`);
  const papers = [...doc.querySelectorAll("strong a")].flatMap((link) => {
    const href = link.getAttribute("href") || "";
    if (!pattern.test(href)) return [];
    const block = link.closest(".d-sm-flex");
    const id = href.slice(1, -1);
    const authors = [...(link.closest("span")?.querySelectorAll('a[href^="/people/"]') || [])].map((a) => clean(a.textContent));
    const abstractId = `abstract-${id.replace(/\./g, "--")}`;
    return [paperRecord(meta, {
      title: clean(link.textContent), authors, url: `https://aclanthology.org/${id}/`,
      pdf_url: `https://aclanthology.org/${id}.pdf`, doi: `10.18653/v1/${id}`,
      abstract: clean(doc.getElementById(abstractId)?.textContent || block?.querySelector('[id^="abstract-"]')?.textContent),
      source: "acl-anthology", source_url: sourceUrl,
      track: id.includes("-short.") ? "Short papers" : "Main conference",
    })];
  });
  dom.window.close();
  return papers;
}

async function loadAnthology(meta, context) {
  const slugs = meta.id === "acl" ? ["long", "short"] : ["main"];
  const sources = slugs.map((slug) => `${meta.host}/${meta.year}.${meta.id}-${slug}/`);
  const pages = await Promise.all(sources.map((url) => get(url, context, true)));
  const papers = deduplicate(pages.flatMap((html, index) => html ? parseAnthology(html, meta, sources[index]) : []));
  if (pages.some(Boolean) && !papers.length) throw new Error("The official proceedings layout has changed; no verifiable paper records were extracted.");
  return { papers, status: papers.length ? "available" : "not_published", sources,
    warnings: papers.length ? ["ACL Anthology does not publish per-paper Oral/Poster labels; unavailable presentation formats are marked Unclassified."] : [] };
}

function parseAaaiIssue(html, meta, sourceUrl) {
  const dom = new JSDOM(html);
  const papers = [...dom.window.document.querySelectorAll(".obj_article_summary")].flatMap((item) => {
    const link = item.querySelector(".title a");
    const title = clean(link?.textContent);
    const url = publicUrl(link?.href, sourceUrl);
    if (!title || !url || /retract|withdraw|erratum/i.test(title)) return [];
    const galley = publicUrl(item.querySelector("a.pdf")?.href, sourceUrl);
    return [paperRecord(meta, {
      title, authors: clean(item.querySelector(".authors")?.textContent).split(/,\s*/).filter(Boolean), url,
      // OJS view URLs show an HTML viewer; download URLs return the actual PDF.
      pdf_url: galley.replace("/article/view/", "/article/download/"), source: "aaai-proceedings", source_url: sourceUrl,
    })];
  });
  dom.window.close();
  return papers;
}

async function loadAaai(meta, context) {
  const archiveUrl = `${meta.host}/index.php/AAAI/issue/archive`;
  const issues = new Set();
  let url = archiveUrl;
  for (let page = 0; url && page < 25; page += 1) {
    const dom = new JSDOM(await get(url, context));
    const doc = dom.window.document;
    let older = false;
    for (const issue of doc.querySelectorAll(".obj_issue_summary")) {
      const link = issue.querySelector("a.title");
      const title = clean(link?.textContent);
      const match = /AAAI-(\d{2})\s+Technical Tracks?/i.exec(title);
      if (match && Number(match[1]) + 2000 < meta.year) older = true;
      if (match && Number(match[1]) + 2000 === meta.year) issues.add(publicUrl(link.href, url));
    }
    const next = doc.querySelector("a.next");
    url = !older && next ? publicUrl(next.href, url) : "";
    dom.window.close();
  }
  if (!issues.size) return { papers: [], status: "not_published", sources: [archiveUrl] };
  const queue = [...issues];
  const papers = [];
  const errors = [];
  // Limit pressure on AAAI Press while indexing all of the year's technical volumes.
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const sourceUrl = queue.shift();
      try {
        const records = parseAaaiIssue(await get(sourceUrl, context), meta, sourceUrl);
        if (!records.length) throw new Error("No papers were extracted from an official technical volume.");
        papers.push(...records);
      } catch (error) { errors.push(error.message); }
    }
  }));
  if (!papers.length) throw new Error(errors.join(" "));
  return { papers: deduplicate(papers), status: errors.length ? "partial" : "available", sources: [archiveUrl, ...issues],
    warnings: ["AAAI Press does not publish per-paper presentation labels; unclassified papers are not assumed to be Posters.", ...(errors.length ? [`${errors.length} official volumes could not be loaded, so this catalog is incomplete.`] : [])] };
}

async function searchConferencePapers(input, options = {}) {
  const query = normalizeConferenceOptions(input);
  const config = conferences.find((entry) => entry.id === query.conference);
  const meta = { ...config, year: query.year, retrieved_at: new Date().toISOString() };
  const context = { fetchImpl: options.fetchImpl || fetch };
  // v2 stops surfacing access-controlled OpenReview forum links as paper records.
  const cacheKey = `conference-v2:${meta.id}:${meta.year}`;
  let catalog = !input.forceRefresh ? options.readCache?.(cacheKey, TTL) : null;
  let cached = Boolean(catalog);
  let stale = false;
  if (meta.parity !== undefined && query.year % 2 !== meta.parity) {
    catalog = { papers: [], status: "not_held", sources: [meta.host], fetched_at: meta.retrieved_at,
      warnings: [`${meta.label} ${query.year} is not held. ${meta.label} runs in ${meta.parity ? "odd" : "even"}-numbered years.`] };
  }
  if (!catalog) {
    const lockKey = `${options.scope || "default"}:${cacheKey}`;
    if (!pending.has(lockKey)) {
      pending.set(lockKey, (async () => {
        const loaded = await (meta.type === "anthology" ? loadAnthology(meta, context) : meta.type === "aaai" ? loadAaai(meta, context) : loadVirtual(meta, context));
        const result = { ...loaded, fetched_at: meta.retrieved_at };
        options.writeCache?.(cacheKey, result);
        return result;
      })());
    }
    try { catalog = await pending.get(lockKey); }
    catch (error) {
      catalog = options.readCache?.(cacheKey);
      if (!catalog) throw error;
      cached = true; stale = true;
      catalog = { ...catalog, warnings: [...(catalog.warnings || []), `Refresh failed; showing cached official records. ${error.message}`] };
    } finally { pending.delete(lockKey); }
  }
  const terms = query.query.match(/"[^"]+"|\S+/g)?.map((term) => term.replace(/^"|"$/g, "").toLowerCase()) || [];
  const filtered = catalog.papers.filter((paper) => {
    const haystack = `${paper.title} ${paper.abstract} ${paper.authors.join(" ")} ${paper.categories.join(" ")}`.toLowerCase();
    return (query.presentation === "all" || paper.conference.presentation === query.presentation)
      && terms.every((term) => haystack.includes(term)) && matchesDailyTopic(paper, query.topic);
  }).sort((a, b) => RANK[b.conference.presentation] - RANK[a.conference.presentation] || a.title.localeCompare(b.title));
  const counts = { oral: 0, spotlight: 0, poster: 0, unknown: 0 };
  for (const paper of catalog.papers) counts[paper.conference.presentation] += 1;
  return { papers: filtered.slice(query.offset, query.offset + query.limit), total: filtered.length,
    catalog_total: catalog.papers.length, presentation_counts: counts, options: query,
    sources: catalog.sources, status: catalog.status, warnings: catalog.warnings || [],
    fetched_at: catalog.fetched_at, cached, stale, has_more: query.offset + query.limit < filtered.length };
}

module.exports = { searchConferencePapers, normalizeConferenceOptions, normalizeVirtualRows, presentationOf, deduplicate, parseAnthology, parseCvf, parseAaaiIssue, enrichSchedule };
