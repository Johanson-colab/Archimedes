function evidenceForTool(name, args, result) {
  const retrievedAt = new Date().toISOString();
  const query = String(args.query || (Array.isArray(args.queries) ? args.queries.join(" | ") : ""));
  if (name === "web_search") {
    return (result.results || []).map((row) => ({
      kind: "discovery", tool: name, query, url: row.url, title: row.title,
      excerpt: row.snippet || "", retrieved_at: retrievedAt,
    }));
  }
  if (name === "search_academic_papers") {
    return (result.papers || []).map((paper) => ({
      kind: "discovery", tool: name, query, url: paper.url || paper.pdf_url,
      title: paper.title, excerpt: paper.abstract || "", retrieved_at: retrievedAt,
    })).filter((entry) => entry.url);
  }
  const url = result.source_url || result.url;
  if (!url) return [];
  if (result.kind === "pdf_vision" && result.text) return [{
    kind: "read", tool: name, query, url, title: result.title || url,
    excerpt: result.text.slice(0, 1000), page: result.page, retrieved_at: retrievedAt,
    method: "vision_model",
  }];
  if (result.kind === "pdf_find") return (result.matches || []).map((match) => ({
    kind: "read", tool: name, query, url, title: result.name || url,
    excerpt: match.excerpt, page: match.page, retrieved_at: retrievedAt,
  }));
  if (Array.isArray(result.pages)) return result.pages.filter((page) => page.text).map((page) => ({
    kind: "read", tool: name, query, url, title: result.title || result.name || url,
    excerpt: page.text.slice(0, 500), page: page.page, retrieved_at: retrievedAt,
  }));
  const excerpt = result.text || result.matches?.map((match) => match.excerpt).join("\n") || "";
  if (!excerpt) return [];
  return [{ kind: "read", tool: name, query, url, title: result.title || url, excerpt: excerpt.slice(0, 1000), retrieved_at: retrievedAt }];
}

module.exports = { evidenceForTool };
