function normalizeWorkspacePath(value: string) {
  const parts: string[] = [];
  for (const part of value.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return "";
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/");
}

function resolveReference(sourcePath: string, reference: string, extension: string) {
  const value = reference.trim();
  if (!value || value.startsWith("/") || /^[A-Za-z]:\//.test(value) || value.includes("\\")) return "";
  const suffix = /\.[^/]+$/.test(value) ? "" : extension;
  const base = sourcePath.split("/").slice(0, -1);
  return normalizeWorkspacePath([...base, `${value}${suffix}`].join("/"));
}

function referencedPaths(sourcePath: string, content: string, contents: ReadonlyMap<string, string>) {
  const source = content.replace(/\\(?:\\|%)|%[^\r\n]*/g, value => value.startsWith("%") ? "" : value);
  const paths = new Set<string>();
  const add = (reference: string, extension: string, cachedOnly = false) => {
    const resolved = resolveReference(sourcePath, reference, extension);
    if (resolved && (!cachedOnly || contents.has(resolved))) paths.add(resolved);
  };
  for (const match of source.matchAll(/\\(?:input|include|subfile)\s*\{([^}]+)\}/g)) add(match[1], ".tex");
  for (const match of source.matchAll(/\\(?:bibliography|addbibresource)\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g)) {
    for (const reference of match[1].split(",")) add(reference, ".bib");
  }
  for (const match of source.matchAll(/\\(?:import|subimport)\s*\{([^}]+)\}\s*\{([^}]+)\}/g)) {
    add(`${match[1].trim().replace(/\/$/, "")}/${match[2].trim()}`, ".tex");
  }
  for (const match of source.matchAll(/\\(?:usepackage|RequirePackage|documentclass|LoadClass)\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g)) {
    const extension = /\\documentclass|\\LoadClass/.test(match[0]) ? ".cls" : ".sty";
    for (const reference of match[1].split(",")) add(reference, extension, true);
  }
  return paths;
}

/** Return only files reachable from the selected manuscript, including siblings outside its folder. */
export function manuscriptSourcePaths(mainPath: string, contents: ReadonlyMap<string, string>) {
  const paths = new Set<string>();
  const pending = [mainPath];
  while (pending.length) {
    const current = pending.shift()!;
    if (!current || paths.has(current)) continue;
    paths.add(current);
    const content = contents.get(current);
    if (content === undefined) continue;
    for (const referenced of referencedPaths(current, content, contents)) if (!paths.has(referenced)) pending.push(referenced);
  }
  return paths;
}
