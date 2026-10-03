const assert = require("node:assert/strict");
const test = require("node:test");
const { isPrivateAddress, pageTextFromHtml, publicHttpsUrl } = require("./remote-content.cjs");

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
