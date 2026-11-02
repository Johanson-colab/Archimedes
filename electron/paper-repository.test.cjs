const assert = require("node:assert/strict");
const test = require("node:test");

const { findRepositoryUrl, isGithubUrl } = require("./paper-repository.cjs");

const NOVEL = {
  title: "Evo-Harness: Context-to-Harness Skill Compilation",
  url: "https://arxiv.org/abs/2608.15071",
  abstract: "Code is released at https://github.com/A-EVO-Lab/a-evolve.",
};

test("a record that already names a repository keeps it", () => {
  const found = findRepositoryUrl({ recordUrl: "https://github.com/MemTensor/MemT-1.0", paper: NOVEL });
  assert.deepEqual(found, { url: "https://github.com/MemTensor/MemT-1.0", source: "record" });
});

test("an arXiv record borrows the repository named in the paper", () => {
  const found = findRepositoryUrl({ recordUrl: "https://arxiv.org/abs/2608.15071", paper: NOVEL });
  assert.equal(found.url, "https://github.com/A-EVO-Lab/a-evolve");
  assert.equal(found.source, "paper");
});

test("a link that names a branch beats the repository root", () => {
  const found = findRepositoryUrl({
    recordUrl: "",
    paper: {
      title: "x",
      url: "https://arxiv.org/abs/1",
      abstract: "Code at https://github.com/A-EVO-Lab/a-evolve and the release lives at https://github.com/A-EVO-Lab/a-evolve/tree/release/evo-harness.",
    },
  });
  assert.equal(found.url, "https://github.com/A-EVO-Lab/a-evolve/tree/release/evo-harness");
});

test("a link in the first pages is used when the abstract has none", () => {
  const found = findRepositoryUrl({
    recordUrl: "https://arxiv.org/abs/1",
    paper: { title: "x", url: "", abstract: "no link here" },
    pages: [{ text: "page one" }, { text: "Our code: https://github.com/owner/repo.git" }],
  });
  assert.equal(found.url, "https://github.com/owner/repo.git");
});

test("trailing punctuation is not part of the URL", () => {
  const found = findRepositoryUrl({ recordUrl: "", paper: { abstract: "See (https://github.com/owner/repo)." } });
  assert.equal(found.url, "https://github.com/owner/repo");
});

test("a paper with no repository yields nothing rather than a guess", () => {
  assert.deepEqual(findRepositoryUrl({ recordUrl: "https://arxiv.org/abs/1", paper: { abstract: "no code" } }), { url: "", source: "" });
});

test("github-like URLs are recognised precisely", () => {
  assert.equal(isGithubUrl("https://github.com/a/b"), true);
  assert.equal(isGithubUrl("https://github.com/a/b/tree/main"), true);
  assert.equal(isGithubUrl("https://gitlab.com/a/b"), false);
  assert.equal(isGithubUrl("https://arxiv.org/abs/1"), false);
});
