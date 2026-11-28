const { createHash } = require("node:crypto");

const identifier = {
  s2_id: value => String(value || "").trim().toLowerCase(),
  arxiv_id: value => String(value || "").trim().toLowerCase().replace(/^https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|pdf)\//, "").replace(/^arxiv:\s*/, "").replace(/\.pdf$/, "").replace(/v\d+$/, ""),
  doi: value => String(value || "").trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, "").replace(/^doi:\s*/, ""),
};
const titleIdentity = value => String(value || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const citationKeyIdentity = value => value.normalize("NFKC").trim().toLowerCase();

function authorIdentity(authors = []) {
  return authors.map(author => titleIdentity(author).split(" ").sort().join(" ")).filter(Boolean).join("\n");
}

function canonicalTitleKey(paper) {
  const key = `title:${titleIdentity(paper.title)}`;
  const authors = authorIdentity(paper.authors);
  const year = paper.year || null;
  if (!authors && !year) return key;
  const fingerprint = createHash("sha256").update(JSON.stringify([authors, year])).digest("hex");
  return `${key}:${fingerprint}`;
}

function compatibleTitleMetadata(row, paper) {
  if (row.year && paper.year && row.year !== paper.year) return false;
  const savedAuthors = authorIdentity(JSON.parse(row.authors_json)), importedAuthors = authorIdentity(paper.authors);
  return !savedAuthors || !importedAuthors || savedAuthors === importedAuthors
    || (savedAuthors.endsWith("\nothers") && importedAuthors.startsWith(savedAuthors.slice(0, -"others".length)))
    || (importedAuthors.endsWith("\nothers") && savedAuthors.startsWith(importedAuthors.slice(0, -"others".length)));
}

function conflictingIdentifiers(first, second) {
  return Object.entries(identifier).some(([key, normalize]) => normalize(first[key]) && normalize(second[key]) && normalize(first[key]) !== normalize(second[key]));
}

function findImportMatch(db, paper, canonicalKey, { libraryId, projectId, cloudPaperId } = {}) {
  // A local PDF's content hash is its identity; equal filenames are not duplicates.
  if (canonicalKey.startsWith("local-pdf:")) return db.prepare("SELECT * FROM papers WHERE canonical_key = ?").get(canonicalKey) || null;
  const fields = 'papers.id, papers.canonical_key, papers.title, papers.authors_json, papers.year, papers.s2_id, papers.arxiv_id, papers.doi, papers.cloud_paper_id';
  const ownLibrary = libraryId ? db.prepare(`SELECT ${fields} FROM papers JOIN library_papers ON library_papers.paper_id = papers.id
    WHERE library_papers.library_id = ? ORDER BY library_papers.added_at, papers.id`).all(libraryId) : [];
  const ownProject = projectId ? db.prepare(`SELECT DISTINCT ${fields} FROM papers JOIN library_papers ON library_papers.paper_id = papers.id
    JOIN libraries ON libraries.id = library_papers.library_id WHERE libraries.project_id = ? ORDER BY papers.id`).all(projectId) : [];
  // A bibliographic match may reuse an unlinked local record. Each cloud record
  // has its own edit timestamps and annotations even when two share a DOI.
  const sameCloudIdentity = row => !cloudPaperId || !row.cloud_paper_id || row.cloud_paper_id === cloudPaperId;
  const strong = rows => {
    for (const [key, normalize] of Object.entries(identifier)) {
      const value = normalize(paper[key]);
      if (value) { const match = rows.find(row => sameCloudIdentity(row) && normalize(row[key]) === value && !conflictingIdentifiers(row, paper)); if (match) return match; }
    }
    return null;
  };
  const scopedStrong = strong(ownLibrary) || strong(ownProject);
  if (scopedStrong) return scopedStrong;
  const exact = db.prepare("SELECT * FROM papers WHERE canonical_key = ?").get(canonicalKey);
  const titleKey = canonicalKey.startsWith("title:");
  if (exact && !titleKey && conflictingIdentifiers(exact, paper)) throw new Error("The imported identifiers conflict with the existing paper. Review its metadata before importing.");
  if (exact && strong([exact])) return exact;
  const title = titleIdentity(paper.title);
  const compatible = row => sameCloudIdentity(row) && !conflictingIdentifiers(row, paper) && compatibleTitleMetadata(row, paper);
  const weak = rows => title ? rows.find(row => titleIdentity(row.title) === title && compatible(row)) || null : null;
  const legacyKey = `title:${title}`;
  const fingerprintMatches = exact && titleKey && canonicalKey !== legacyKey && canonicalKey === canonicalTitleKey(paper);
  // The saved title may have been corrected after its import key was assigned.
  const compatibleExact = exact && sameCloudIdentity(exact) && (!titleKey || (
    !conflictingIdentifiers(exact, paper) && (fingerprintMatches || compatibleTitleMetadata(exact, paper))
  ));
  const legacy = !compatibleExact && titleKey && canonicalKey !== legacyKey
    ? db.prepare("SELECT * FROM papers WHERE canonical_key = ?").get(legacyKey) : null;
  const exactMatch = compatibleExact ? exact : legacy && compatible(legacy) ? legacy : null;
  if (!Object.entries(identifier).some(([key, normalize]) => normalize(paper[key]))) {
    const scopedTitle = rows => exactMatch && rows.some(row => row.id === exactMatch.id) ? exactMatch : weak(rows);
    const scopedWeak = scopedTitle(ownLibrary) || scopedTitle(ownProject);
    if (scopedWeak || exactMatch) return scopedWeak || exactMatch;
  }
  // A citation can gain a DOI/arXiv/S2 id after initial import. Only scan the
  // identity fields on that uncommon path; normal repeated keys use the index.
  const rows = db.prepare(`SELECT ${fields} FROM papers`).all();
  return strong(rows) || weak(ownLibrary) || weak(ownProject) || exactMatch || weak(rows);
}

function assertPaperAccess(db, paperId, canAccessProject, role = "viewer", projectId = null) {
  const projects = db.prepare(`SELECT DISTINCT libraries.project_id FROM library_papers
    JOIN libraries ON libraries.id = library_papers.library_id WHERE library_papers.paper_id = ?`).all(paperId);
  if (!projects.some(project => (!projectId || project.project_id === projectId) && canAccessProject(project.project_id, role))) {
    throw new Error(`You do not have ${role} access to this paper in the selected project.`);
  }
}

function bibliography(db, paperId) {
  const row = db.prepare("SELECT * FROM paper_bibliography WHERE paper_id = ?").get(paperId);
  return { paper_id: paperId, citekey: row?.citekey || "", entryType: row?.entry_type || "article", updated_at: row?.updated_at || null };
}

function assertCitationKeyAvailable(db, paperId, citekey, libraryId = null) {
  const identity = citationKeyIdentity(citekey);
  if (!identity) return;
  const peerKeys = db.prepare(`SELECT DISTINCT bibliography.citekey
    FROM library_papers AS member
    JOIN library_papers AS peer ON peer.library_id = member.library_id AND peer.paper_id <> member.paper_id
    JOIN paper_bibliography AS bibliography ON bibliography.paper_id = peer.paper_id
    WHERE member.paper_id = ? AND member.library_id = COALESCE(?, member.library_id) AND bibliography.citekey <> ''`).all(paperId, libraryId);
  if (peerKeys.some(peer => citationKeyIdentity(peer.citekey) === identity)) {
    throw new Error("Citation key conflict: edit the source before importing");
  }
}

function setBibliography(db, paperId, patch, canAccessProject) {
  assertPaperAccess(db, paperId, canAccessProject, "editor");
  const current = bibliography(db, paperId);
  const citekey = patch.citekey === undefined ? current.citekey : String(patch.citekey).trim();
  const entryType = patch.entryType === undefined ? current.entryType : String(patch.entryType).trim().toLowerCase();
  if (citekey.length > 200 || /[\s,{}\\#%"]/.test(citekey)) throw new Error("Use a citation key without spaces or BibTeX delimiters.");
  if (!/^[a-z][a-z0-9_-]{0,79}$/.test(entryType)) throw new Error("Choose a valid bibliography entry type.");
  if (citationKeyIdentity(citekey) !== citationKeyIdentity(current.citekey)) {
    assertCitationKeyAvailable(db, paperId, citekey);
  }
  db.prepare(`INSERT INTO paper_bibliography (paper_id, citekey, entry_type, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(paper_id) DO UPDATE SET citekey = excluded.citekey, entry_type = excluded.entry_type, updated_at = excluded.updated_at`)
    .run(paperId, citekey, entryType, new Date().toISOString());
  return bibliography(db, paperId);
}

function repairMetadata(db, paperId, patch, canAccessProject) {
  assertPaperAccess(db, paperId, canAccessProject, "editor");
  const assignments = [], values = [];
  for (const key of ["title", "venue", "doi", "arxiv_id", "url", "pdf_url"]) {
    if (patch[key] === undefined) continue;
    if (typeof patch[key] !== "string" || patch[key].length > 10_000 || key === "title" && !patch[key].trim()) throw new Error(`Invalid paper ${key}.`);
    assignments.push(`${key} = ?`); values.push(patch[key].trim());
  }
  if (patch.authors !== undefined) {
    if (!Array.isArray(patch.authors) || !patch.authors.every(author => typeof author === "string")) throw new Error("Paper authors must be a list of names.");
    assignments.push("authors_json = ?"); values.push(JSON.stringify(patch.authors.map(author => author.trim()).filter(Boolean)));
  }
  if (patch.year !== undefined) {
    if (patch.year !== null && (!Number.isInteger(patch.year) || patch.year < 1 || patch.year > 9999)) throw new Error("Paper year must be a year or null.");
    assignments.push("year = ?"); values.push(patch.year);
  }
  if (assignments.length) db.prepare(`UPDATE papers SET ${assignments.join(", ")}, updated_at = ? WHERE id = ?`).run(...values, new Date().toISOString(), paperId);
}

module.exports = { identifier, titleIdentity, canonicalTitleKey, compatibleTitleMetadata, findImportMatch, assertPaperAccess, bibliography, assertCitationKeyAvailable, setBibliography, repairMetadata };
