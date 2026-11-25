export type BibliographyEntry = {
  citekey: string;
  entryType: string;
  paper: AcademicSearchResult;
  exportLoss?: { locatorFields: string[]; literalAuthors: string[] };
};
export type BibliographyPaper = LibraryPaper & { citekey?: string; entry_type?: string };
export type MetadataPatch = Partial<Pick<AcademicSearchResult, "title" | "authors" | "year" | "venue" | "doi" | "arxiv_id" | "url" | "pdf_url">>;
export type BibliographyBridge = ResearchDeskBridge & {
  setPaperBibliography: (paperId: string, input: { citekey: string; entryType: string }) => Promise<unknown>;
  repairLibraryPaperMetadata: (paperId: string, patch: MetadataPatch) => Promise<LibraryPaper>;
};

const fields = ["title", "authors", "year", "venue", "doi", "arxiv_id", "url", "pdf_url"] as const;
const opaqueFields = new Set(["url", "doi", "eprint"]);
const legacySpellings = new WeakMap<AcademicSearchResult, { title: string; authors: string[]; citekey: string }>();
const accentMarks: Record<string, string> = {
  "'": "\u0301", "\x60": "\u0300", '"': "\u0308", "^": "\u0302", "~": "\u0303",
  "=": "\u0304", ".": "\u0307", b: "\u0331", c: "\u0327", d: "\u0323",
  H: "\u030b", k: "\u0328", r: "\u030a", u: "\u0306", v: "\u030c",
};
const characterCommands: Record<string, string> = {
  aa: "å", AA: "Å", ae: "æ", AE: "Æ", i: "ı", j: "ȷ", l: "ł", L: "Ł",
  o: "ø", O: "Ø", oe: "œ", OE: "Œ", ss: "ß", textasciicircum: "^", textasciitilde: "~",
};

// Grouping braces affect capitalization, escaped braces are literal metadata.
function plain(value: string, latexText = true) {
  let result = "";
  for (let index = 0; index < value.length; index++) {
    if (value[index] === "\\") {
      const source = value.slice(index);
      const backslash = /^\\textbackslash\{\} ?/.exec(source);
      const accent = /^\\(['\x60".^~=]|[bcdHkruv](?![A-Za-z]))\s*(?:\{(\\[ij]|\p{L})\}|(\\[ij](?![A-Za-z])|\p{L}))/u.exec(source);
      const command = /^\\([A-Za-z]+)(\{\}|\s*)/.exec(source);
      if (backslash) {
        result += "\\";
        index += backslash[0].length - 1;
      } else if (latexText && accent) {
        const letter = (accent[2] || accent[3]).replace(/^\\/, "");
        result += (letter + accentMarks[accent[1]]).normalize("NFC");
        index += accent[0].length - 1;
      } else if (latexText && command && Object.hasOwn(characterCommands, command[1])) {
        result += characterCommands[command[1]];
        index += command[0].length - 1;
      } else if (/[{}&%_#$]/.test(value[index + 1] || "")) {
        result += value[++index];
      } else {
        result += value[index];
      }
    } else if (value[index] !== "{" && value[index] !== "}") {
      result += latexText && value[index] === "~" ? "\u00a0" : value[index];
    }
  }
  return latexText ? result.replace(/^[^\S\u00a0]+|[^\S\u00a0]+$/g, "") : result.trim();
}
const doi = (value: string) => value.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "").toLowerCase();
const arxiv = (value: string) => value.trim().toLowerCase().replace(/^https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|pdf)\//, "").replace(/^arxiv:\s*/, "").replace(/\.pdf$/, "").replace(/v\d+$/, "");
const arxivUrl = (value: string) => /^https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|pdf)\//i.test(value);
const arxivId = (value: string) => /^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[a-z]{2})?\/\d{7})$/.test(arxiv(value));
const title = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function authorIdentity(authors: string[] = []) {
  return authors.map(author => title(author).split(" ").sort().join(" ")).filter(Boolean).join("\n");
}

export function bibliographyTitleKey(paper: AcademicSearchResult) {
  if (paper.s2_id || paper.arxiv_id || paper.doi) return "";
  const prefix = `title:${title(paper.title)}`;
  const authors = authorIdentity(paper.authors);
  if (!authors && !paper.year) return prefix;
  const bytes = new TextEncoder().encode(JSON.stringify([authors, paper.year || null]));
  return crypto.subtle.digest("SHA-256", bytes).then(hash =>
    prefix + ":" + Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join(""));
}

function compatibleTitleMetadata(first: AcademicSearchResult, second: AcademicSearchResult) {
  if (first.year && second.year && first.year !== second.year) return false;
  const firstAuthors = authorIdentity(first.authors), secondAuthors = authorIdentity(second.authors);
  return !firstAuthors || !secondAuthors || firstAuthors === secondAuthors
    || (firstAuthors.endsWith("\nothers") && secondAuthors.startsWith(firstAuthors.slice(0, -"others".length)))
    || (secondAuthors.endsWith("\nothers") && firstAuthors.startsWith(secondAuthors.slice(0, -"others".length)));
}

function splitAuthors(value: string, latexText = true) {
  const authors: string[] = [];
  const literalAuthors: string[] = [];
  let depth = 0, start = 0, firstGroupEnd = -1;
  const readAuthor = (end: number) => {
    const source = value.slice(start, end).trimEnd();
    const author = plain(source, latexText);
    const wholeNameIsGrouped = source.trimStart().startsWith("{") && firstGroupEnd === start + source.length - 1;
    // Export already groups a name containing "and" to keep it as one author.
    if (author && wholeNameIsGrouped && !/\s+and\s+/i.test(author)) literalAuthors.push(author);
    return author;
  };
  for (let index = 0; index < value.length; index++) {
    if (value[index] === "\\") { index++; continue; }
    if (value[index] === "{") depth++;
    else if (value[index] === "}") {
      depth--;
      if (depth === 0 && firstGroupEnd < 0) firstGroupEnd = index;
    }
    const separator = depth === 0 ? /^\s+and\s+/i.exec(value.slice(index)) : null;
    if (separator) {
      authors.push(readAuthor(index));
      index += separator[0].length - 1;
      start = index + 1;
      firstGroupEnd = -1;
    }
  }
  const last = readAuthor(value.length);
  if (last) authors.push(last);
  return { authors, literalAuthors };
}

function formatWarning(template: string, values?: Record<string, string | number>) {
  return values ? template.replace(/\{(\w+)\}/g, (placeholder, name) => String(values[name] ?? placeholder)) : template;
}

// Small BibTeX interchange parser: balanced braced/quoted values and literals.
// Macro expressions are reported instead of silently importing a wrong title.
export function parseBibliography(input: string, t = formatWarning): { entries: BibliographyEntry[]; warnings: string[] } {
  const omittedComments: Array<{ start: number; length: number }> = [];
  input = input.replace(/^\s*%.*$/gm, (comment, start: number) => {
    omittedComments.push({ start, length: comment.length });
    return "";
  });
  const sourceOffset = (offset: number) => {
    for (const { start, length } of omittedComments) {
      if (start > offset) break;
      offset += length;
    }
    return offset;
  };
  const entries: BibliographyEntry[] = [], warnings: string[] = [];
  let cursor = 0;
  const skip = () => { while (cursor < input.length) { if (/\s|,/.test(input[cursor])) cursor++; else if (input[cursor] === "%") { while (cursor < input.length && input[cursor] !== "\n") cursor++; } else break; } };
  const skipWhitespace = () => { while (cursor < input.length && /\s/.test(input[cursor])) cursor++; };
  // Directive bodies are opaque: nested braces and parentheses must not expose
  // a commented-out entry to the entry parser.
  const skipDelimited = (open: string, close: string, quotedValues: boolean) => {
    let depth = 1, braces = 0, quoted = false;
    while (cursor < input.length) {
      const character = input[cursor];
      if (character === "\\") { cursor += 2; continue; }
      if (open === "{") {
        if (character === "{") depth++;
        else if (character === "}" && --depth === 0) { cursor++; return; }
      } else {
        if (character === "{") braces++;
        else if (character === "}" && braces > 0) braces--;
        else if (character === '"' && braces === 0 && quotedValues) quoted = !quoted;
        else if (character === "(" && braces === 0 && !quoted) depth++;
        else if (character === close && braces === 0 && !quoted && --depth === 0) { cursor++; return; }
      }
      cursor++;
    }
    throw new Error("Unclosed BibTeX directive");
  };
  const delimited = (open: string, close: string) => {
    cursor++;
    const start = cursor;
    let depth = 1, braces = 0;
    while (cursor < input.length) {
      if (input[cursor] === "\\") { cursor += 2; continue; }
      if (open === close) {
        if (input[cursor] === "{") braces++;
        else if (input[cursor] === "}") braces--;
        if (input[cursor] === close && braces === 0) return input.slice(start, cursor++);
        cursor++; continue;
      }
      if (input[cursor] === open) depth++;
      if (input[cursor] === close && --depth === 0) return input.slice(start, cursor++);
      // A quoted value may contain balanced braces with a quote inside.
      if (open === close && input[cursor] !== close) depth = 1;
      cursor++;
    }
    throw new Error(t("Unclosed BibTeX value"));
  };
  while (cursor < input.length) {
    const at = input.indexOf("@", cursor);
    if (at < 0) break;
    cursor = at + 1;
    const kind = /^[a-z]+/i.exec(input.slice(cursor));
    if (!kind) { cursor++; continue; }
    cursor += kind[0].length; skip();
    if (!["{", "("].includes(input[cursor])) { warnings.push(t("Invalid entry at {offset}", { offset: sourceOffset(at) })); continue; }
    const open = input[cursor], close = open === "{" ? "}" : ")";
    cursor++;
    if (["comment", "preamble", "string"].includes(kind[0].toLowerCase())) {
      try { skipDelimited(open, close, kind[0].toLowerCase() !== "comment"); } catch { cursor = input.length; }
      warnings.push(t("Skipped @{directive} directive at {offset}", { directive: kind[0], offset: sourceOffset(at) })); continue;
    }
    skipWhitespace();
    const key = /^[^,}\s)]+/.exec(input.slice(cursor));
    if (!key) { warnings.push(t("Missing citation key at {offset}", { offset: sourceOffset(at) })); continue; }
    cursor += key[0].length;
    if (/[\s,{}\\#%"]/.test(key[0])) { warnings.push(t("Invalid citation key: {citekey}", { citekey: key[0] })); const next = input.indexOf("@", cursor); cursor = next < 0 ? input.length : next; continue; }
    const record: Record<string, string> = {};
    let closed = false;
    try {
      while (cursor < input.length) {
        skip();
        if (input[cursor] === close) { cursor++; closed = true; break; }
        const name = /^[a-z][\w-]*/i.exec(input.slice(cursor));
        if (!name) throw new Error(t("Invalid field"));
        cursor += name[0].length; skip();
        if (input[cursor++] !== "=") throw new Error(t("Missing field value"));
        skip();
        let value = "";
        if (input[cursor] === "{") value = delimited("{", "}");
        else if (input[cursor] === '"') value = delimited('"', '"');
        else {
          const literal = /^[^,}\n)]+/.exec(input.slice(cursor));
          if (!literal || !/^\d+$/.test(literal[0].trim())) throw new Error(t("Unsupported BibTeX macro; expand it before import"));
          value = literal[0]; cursor += value.length;
        }
        const field = name[0].toLowerCase();
        record[field] = field === "author" || field === "title" ? value : plain(value, !opaqueFields.has(field));
      }
      if (!closed) throw new Error(t("Unclosed BibTeX entry"));
      const decodedTitle = plain(record.title || "");
      if (!decodedTitle.trim()) throw new Error(t("Missing title"));
      const normalizedDoi = doi(record.doi || "");
      const eprintIsArxiv = (!record.archiveprefix || /^arxiv$/i.test(record.archiveprefix)) && arxivId(record.eprint || "");
      const normalizedArxiv = eprintIsArxiv ? arxiv(record.eprint) : arxivUrl(record.url || "") && arxivId(record.url) ? arxiv(record.url) : "";
      const externalId = normalizedDoi ? `doi:${normalizedDoi}` : normalizedArxiv ? `arxiv:${normalizedArxiv}` : `bibtex:${key[0]}`;
      const entryType = kind[0].toLowerCase();
      const rawAuthors = record.author || "";
      const { authors, literalAuthors } = splitAuthors(rawAuthors);
      const locatorFields = ["volume", "number", "pages"].filter(field => record[field]);
      const exportLoss = locatorFields.length || literalAuthors.length ? { locatorFields, literalAuthors } : undefined;
      const paper: AcademicSearchResult = {
        external_id: externalId, s2_id: "", arxiv_id: normalizedArxiv, doi: normalizedDoi,
        title: decodedTitle, authors,
        year: /^\d{4}$/.test(record.year || "") ? Number(record.year) : null, venue: record.journal || record.booktitle || record.publisher || "",
        abstract: record.abstract || "", url: record.url || (normalizedDoi ? `https://doi.org/${normalizedDoi}` : normalizedArxiv ? `https://arxiv.org/abs/${normalizedArxiv}` : ""),
        pdf_url: "", citation_count: 0, source: "bibtex",
      };
      const legacyTitle = /[\\~]/.test(record.title) ? plain(record.title, false) : decodedTitle;
      const legacyAuthors = /[\\~]/.test(rawAuthors) ? splitAuthors(rawAuthors, false).authors : authors;
      if (legacyTitle !== decodedTitle || legacyAuthors.join("\n") !== authors.join("\n")) {
        legacySpellings.set(paper, { title: legacyTitle, authors: legacyAuthors, citekey: key[0] });
      }
      entries.push({ citekey: key[0], entryType, ...(exportLoss ? { exportLoss } : {}), paper });
    } catch (cause) {
      warnings.push(t("{citekey}: {message}", { citekey: key[0], message: cause instanceof Error ? cause.message : String(cause) }));
      const next = input.indexOf("@", cursor);
      cursor = next < 0 ? input.length : next;
    }
  }
  return { entries, warnings };
}

const identifierFields = [
  ['s2_id', (value: string) => value.trim().toLowerCase()], ['arxiv_id', arxiv], ['doi', doi],
] as const;

export function hasConflictingBibliographyIdentifiers(first: AcademicSearchResult, second: AcademicSearchResult) {
  return identifierFields.some(([field, normalize]) => {
    const a = normalize(first[field] || "");
    const b = normalize(second[field] || "");
    return a && b && a !== b;
  });
}

export function matchBibliographyPaper<T extends AcademicSearchResult>(incoming: AcademicSearchResult, papers: T[], { strongOnly = false, titleAlreadyMatched = false, originalKey = "" }: { strongOnly?: boolean; titleAlreadyMatched?: boolean; originalKey?: string } = {}) {
  const compatible = (paper: AcademicSearchResult) => !hasConflictingBibliographyIdentifiers(incoming, paper);
  for (const [field, normalize] of identifierFields) {
    if (!incoming[field]) continue;
    const matched = papers.find(paper => paper[field] && normalize(incoming[field]) === normalize(paper[field]) && compatible(paper));
    if (matched) return matched;
  }
  if (strongOnly) return undefined;
  const normalizedTitle = title(incoming.title);
  // A metadata repair does not rewrite the stored key assigned at import.
  const legacyKey = `title:${normalizedTitle}`;
  const retained = originalKey && papers.find(paper => "canonical_key" in paper && compatible(paper)
    && (paper.canonical_key === originalKey && originalKey !== legacyKey
      || paper.canonical_key === legacyKey && compatibleTitleMetadata(incoming, paper)));
  const matched = retained || papers.find(paper => compatible(paper) && compatibleTitleMetadata(incoming, paper)
    && (titleAlreadyMatched || normalizedTitle && normalizedTitle === title(paper.title)));
  if (matched) return matched;
  // Recover the exact spelling saved by the old parser for this citation.
  const legacy = legacySpellings.get(incoming);
  return legacy && papers.find(paper => "citekey" in paper && paper.citekey === legacy.citekey
    && paper.title === legacy.title && compatible(paper) && (
      compatibleTitleMetadata(incoming, paper) || compatibleTitleMetadata({ ...incoming, authors: legacy.authors }, paper)
    ));
}

// Complete a compatible record's identity without replacing saved identifiers.
export function paperWithLearnedIdentifiers(paper: BibliographyPaper, representative: AcademicSearchResult) {
  const identifiers = identifierFields
    .filter(([field]) => !paper[field] && representative[field])
    .map(([field]) => [field, representative[field]]);
  return identifiers.length ? { ...paper, ...Object.fromEntries(identifiers) } : paper;
}

export function metadataDifferences(entry: AcademicSearchResult, current: AcademicSearchResult): MetadataPatch {
  return Object.fromEntries(fields.filter((field) => {
    const value = entry[field];
    return value !== "" && value !== null && (!Array.isArray(value) || value.length) && JSON.stringify(value) !== JSON.stringify(current[field]);
  }).map((field) => [field, entry[field]]));
}

export function citationKeyIdentity(key: string) {
  return key.normalize("NFKC").trim().toLowerCase();
}

// Explicit keys are reserved before generated ones so an existing citation
// keeps resolving to its original paper instead of a newly allocated key.
function allocateCitationKeys(papers: BibliographyPaper[]) {
  const used = new Set<string>(), keys = new Array<string>(papers.length);
  const allocate = (index: number, base: string) => {
    let key = base, suffix = 2;
    while (used.has(citationKeyIdentity(key))) key = `${base}_${suffix++}`;
    used.add(citationKeyIdentity(key));
    keys[index] = key;
  };
  papers.forEach((paper, index) => { if (paper.citekey) allocate(index, paper.citekey); });
  papers.forEach((paper, index) => { if (!keys[index]) allocate(index, `paper_${paper.id.replace(/[^a-z0-9]/gi, "")}`); });
  return keys;
}

export function exportBibliography(papers: BibliographyPaper[]) {
  const keys = allocateCitationKeys(papers);
  return papers.map((paper, index) => {
    const venueField = /^(inproceedings|conference|incollection)$/.test(paper.entry_type || "") ? "booktitle" : "journal";
    const values: Record<string, string> = { title: paper.title, author: paper.authors.map((author) => /\s+and\s+/i.test(author) ? `{${author}}` : author).join(" and "), year: paper.year ? String(paper.year) : "", [venueField]: paper.venue, doi: paper.doi, eprint: paper.arxiv_id, url: paper.url };
    const escape = (value: string) => value.replace(/[\\{}%&#_$^~\u00a0]/g, (character) => {
      if (character === "\\") return "\\textbackslash{} ";
      if (character === "^") return "\\textasciicircum{}";
      if (character === "~") return "\\textasciitilde{}";
      if (character === "\u00a0") return "~";
      return "\\" + character;
    });
    const formatValue = (field: string, value: string) => {
      if (opaqueFields.has(field)) {
        // ACM places the DOI inside a hyperlink argument, where a bare percent starts a TeX comment.
        const delimiters = field === "url" ? /[{}\\]/g : /[{}\\%&#_$]/g;
        return value.replace(delimiters, character => character === "\\" ? "\\textbackslash{} " : "\\" + character);
      }
      if (field === "author") return paper.authors.map(author =>
        /\s+and\s+/i.test(author) ? `{${escape(author)}}` : escape(author)).join(" and ");
      return escape(value);
    };
    return `@${paper.entry_type || "article"}{${keys[index]},\n${Object.entries(values).filter(([, value]) => value).map(([field, value]) => `  ${field} = {${formatValue(field, value)}}`).join(",\n")}\n}`;
  }).join("\n\n") + "\n";
}

// Only retained rows can represent another import. A discarded title-only
// match has no authority to hide a later entry with a different DOI.
export function indexBibliographyBatch(entries: BibliographyEntry[]) {
  const byIdentity = new Map<string, Set<AcademicSearchResult>>();
  const repeatedRows = new Set<number>();
  const representatives = new Map<number, AcademicSearchResult>();
  const addIdentity = (key: string, representative: AcademicSearchResult) => {
    const group = byIdentity.get(key);
    if (group) group.add(representative);
    else byIdentity.set(key, new Set([representative]));
  };
  entries.forEach(({ paper }, index) => {
    const identities = identifierFields.flatMap(([field, normalize]) =>
      paper[field] ? [field + ":" + normalize(paper[field])] : []);
    const normalizedTitle = title(paper.title);
    const titleKey = normalizedTitle ? "title:" + normalizedTitle : "";
    let representative: AcademicSearchResult | undefined;
    for (const identity of identities) {
      representative = matchBibliographyPaper(paper, [...(byIdentity.get(identity) || [])], { strongOnly: true });
      if (representative) break;
    }
    if (representative) {
      repeatedRows.add(index);
      if (titleKey) addIdentity(titleKey, representative);
      for (const [field, normalize] of identifierFields) {
        if (!paper[field] || representative[field]) continue;
        representative[field] = paper[field];
        addIdentity(field + ":" + normalize(paper[field]), representative);
      }
      return;
    }
    if (titleKey && matchBibliographyPaper(paper, [...(byIdentity.get(titleKey) || [])], { titleAlreadyMatched: true })) {
      repeatedRows.add(index);
      return;
    }
    representative = { ...paper };
    const legacy = legacySpellings.get(paper);
    if (legacy) legacySpellings.set(representative, legacy);
    representatives.set(index, representative);
    for (const identity of identities) addIdentity(identity, representative);
    if (titleKey) addIdentity(titleKey, representative);
  });
  // A strong alias can make two retained rows claim the same identifier.
  // Detect contradictions after the batch has finished learning aliases.
  const conflictingPapers = new Set<AcademicSearchResult>();
  for (const [identity, group] of byIdentity) {
    if (identity.startsWith("title:") || group.size < 2) continue;
    const papers = [...group];
    for (const paper of papers) {
      if (papers.some(other => hasConflictingBibliographyIdentifiers(paper, other))) conflictingPapers.add(paper);
    }
  }
  const conflictingRows = new Set([...representatives].filter(([, paper]) => conflictingPapers.has(paper)).map(([index]) => index));
  return { repeatedRows, representatives, conflictingRows };
}
