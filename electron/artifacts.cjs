const ARTIFACT_KINDS = new Map([
  ["png", "image"], ["jpg", "image"], ["jpeg", "image"], ["webp", "image"], ["gif", "image"], ["bmp", "image"],
  ["pdf", "pdf"],
  ["csv", "csv"], ["tsv", "csv"],
  ["json", "json"],
  ["md", "markdown"], ["markdown", "markdown"], ["mdx", "markdown"],
  ["svg", "svg"],
  ["html", "html"], ["htm", "html"],
  ["txt", "text"], ["log", "text"],
]);

function artifactKind(filePath) {
  const extension = String(filePath || "").split(".").at(-1)?.toLowerCase() || "";
  return ARTIFACT_KINDS.get(extension) || "other";
}

function isArtifactPath(filePath) {
  return artifactKind(filePath) !== "other";
}

module.exports = { artifactKind, isArtifactPath };
