export type LibraryDocument = { paperId: string; libraryId: string; kind: "paper" | "notes" };
export type PaperReaderSession = {
  pageNumber: number;
  pdfZoom: number;
  readerView: "paper" | "canvas" | "review" | "project" | "codebase";
  chatOpen: boolean;
  readerChromeOpen: boolean;
  sideTab: "chat" | "notes";
  composerDraft?: string;
};

export function libraryDocumentKey(document: LibraryDocument) {
  return `${document.kind}:${document.libraryId}:${document.paperId}`;
}

export function matchLibraryPaper(paper: LibraryPaper, query: string) {
  const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
  const needle = normalize(query);
  return !needle || [paper.title, paper.authors.join(" "), paper.abstract, paper.venue, ...paper.tags].some((value) => normalize(value || "").includes(needle));
}

export function uniqueLibraryPapers(catalog: Record<string, LibraryPaper[]>, libraryIds: string[]) {
  const papers = new Map<string, LibraryPaper>();
  for (const id of libraryIds) for (const paper of catalog[id] || []) papers.set(paper.id, paper);
  return [...papers.values()];
}

export function sortLibraryPapers(papers: LibraryPaper[], sort: string) {
  return [...papers].sort((a, b) => sort === "title" ? a.title.localeCompare(b.title)
    : sort === "year" ? (b.year || 0) - (a.year || 0) || b.created_at.localeCompare(a.created_at)
    : b.created_at.localeCompare(a.created_at) || a.title.localeCompare(b.title));
}

/** Shared by tree expansion, search and refresh so rapid navigation cannot
 * multiply the number of simultaneous metadata IPC calls. */
export function createLibraryRequestQueue(limit = 2) {
  let running = 0;
  const pending: Array<{ start: () => void; cancel: () => void }> = [];
  function pump() {
    while (running < limit && pending.length) pending.shift()!.start();
  }
  return {
    run<T>(work: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        pending.push({
          start() {
            running++;
            Promise.resolve().then(work).then(resolve, reject).finally(() => { running--; pump(); });
          },
          cancel() { reject(new Error("Library request cancelled")); },
        });
        pump();
      });
    },
    clearPending() { for (const task of pending.splice(0)) task.cancel(); },
  };
}
