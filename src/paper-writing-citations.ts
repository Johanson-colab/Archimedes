import { citationKeyIdentity, exportBibliography, matchBibliographyPaper, parseBibliography, type BibliographyPaper } from "./bibliography";

export function manuscriptBibliographyPaths(content: string, mainPath: string) {
  const base = mainPath.split("/").slice(0, -1).join("/");
  const source = content.replace(/\\(?:\\|%)|%[^\r\n]*/g, value => value.startsWith("%") ? "" : value);
  const names = [...source.matchAll(/\\(?:bibliography|addbibresource)(?:\[[^\]]*\])?\{([^}]+)\}/g)].flatMap(match => match[1].split(","));
  const paths = new Set<string>();
  for (const name of names.map(value => value.trim())) {
    if (name.startsWith("/") || name.includes("\\") || name.split("/").includes("..")) continue;
    const relative = name.split("/").filter(part => part && part !== ".").join("/");
    if (relative) paths.add(`${base ? `${base}/` : ""}${relative.endsWith(".bib") ? relative : `${relative}.bib`}`);
  }
  return [...paths];
}

function sameReference(paper: AcademicSearchResult, existing: AcademicSearchResult) {
  const candidates = [existing];
  if (matchBibliographyPaper(paper, candidates, { strongOnly: true })) return true;
  if (!paper.year || paper.year !== existing.year || !paper.authors.length) return false;
  const names = (value: AcademicSearchResult) => value.authors.map(author => author.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()).sort().join("|");
  return names(paper) === names(existing) && Boolean(matchBibliographyPaper(paper, candidates));
}

export function prepareManuscriptCitation(content: string, paper: BibliographyPaper) {
  const keys: string[] = [];
  const { entries } = parseBibliography(content, undefined, key => keys.push(key));
  const generated = exportBibliography([paper]);
  const requested = parseBibliography(generated).entries[0].citekey;
  const occupied = keys.filter(key => citationKeyIdentity(key) === citationKeyIdentity(requested));
  if (occupied.length) {
    const existing = entries.find((entry) => entry.citekey === occupied[0]);
    if (occupied.length !== 1 || !existing || !sameReference(paper, existing.paper)) {
      throw new Error("The citation key belongs to a different bibliography entry.");
    }
    return { content, key: existing.citekey };
  }
  const existing = entries.find((entry) => sameReference(paper, entry.paper));
  if (existing) return { content, key: existing.citekey };
  return { content: `${content}${content ? (content.endsWith("\n") ? "\n" : "\n\n") : ""}${generated}`, key: requested };
}

export function insertCitationAt(draft: string, position: number, key: string) {
  const citation = `\\cite{${key}}`;
  return draft.startsWith(citation, position) ? draft : `${draft.slice(0, position)}${citation}${draft.slice(position)}`;
}
