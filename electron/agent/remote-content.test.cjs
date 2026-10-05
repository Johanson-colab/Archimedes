const assert = require("node:assert/strict");
const test = require("node:test");
const { findInText, isPrivateAddress, pageTextFromHtml, publicHttpsUrl } = require("./remote-content.cjs");

test("blocks local and non-HTTPS page destinations", () => {
  assert.throws(() => publicHttpsUrl("http://example.org"), /public HTTPS/);
  assert.throws(() => publicHttpsUrl("https://127.0.0.1/private"), /public HTTPS/);
  assert.throws(() => publicHttpsUrl("https://localhost/"), /public HTTPS/);
  assert.throws(() => publicHttpsUrl("https://example.org:8443/"), /public HTTPS/);
  assert.equal(publicHttpsUrl("https://example.org/article").hostname, "example.org");
  assert.equal(isPrivateAddress("172.16.0.1"), true);
  assert.equal(isPrivateAddress("1.1.1.1"), false);
});

test("extracts readable article text without page boilerplate", () => {
  const article = pageTextFromHtml("<!doctype html><title>Example</title><nav>Menu</nav><article><h1>Research update</h1><p>This paragraph contains enough text to be a useful article body for the readability parser, with several details about the update.</p><p>A second paragraph describes the results and their implications for readers.</p></article>", "https://example.org/update");
  assert.match(article.text, /Research update/);
  assert.match(article.text, /second paragraph/);
  assert.doesNotMatch(article.text, /Menu/);
});

test("finds page passages with offsets for follow-up reading", () => {
  const text = "Methods include one benchmark. Results compare another benchmark.";
  const result = findInText(text, "BENCHMARK", { contextChars: 4 });
  assert.equal(result.match_count, 2);
  assert.equal(result.matches[0].start_char, 20);
  assert.match(text.slice(result.matches[1].start_char), /^benchmark/);
});

test("extracts documentation text when article detection fails", () => {
  const result = pageTextFromHtml("<html><head><title>Docs</title></head><body><nav>Skip</nav><main><h1>API</h1><p>Use the search endpoint.</p></main></body></html>", "https://example.org/docs");
  assert.match(result.text, /search endpoint/);
  assert.doesNotMatch(result.text, /Skip/);
});
