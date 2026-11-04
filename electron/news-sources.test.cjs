const test = require("node:test");
const assert = require("node:assert/strict");

const {
  canonicalUrl,
  itemId,
  parseArxiv,
  parseGitHub,
  parseHackerNews,
  parseLobsters,
  parseReddit,
  parseRssFeed,
  parseX,
} = require("./news-sources.cjs");

test("canonicalUrl strips tracking params and trailing slashes", () => {
  assert.equal(canonicalUrl("https://Example.com/Post/?utm_source=x&ref=hn#top"), "https://example.com/Post");
  assert.equal(canonicalUrl("https://example.com/"), "https://example.com/");
  assert.equal(canonicalUrl("https://example.com/a?keep=1&utm_medium=social"), "https://example.com/a?keep=1");
});

test("item ids are stable across tracking parameters", () => {
  assert.equal(
    itemId("hn", "https://example.com/story?utm_source=hn"),
    itemId("hn", "https://example.com/story"),
  );
});

test("parseHackerNews keeps points, comments, domain and discussion link", () => {
  const items = parseHackerNews({
    hits: [
      { objectID: "101", title: "Postman silently installs AI plugins", url: "https://github.com/postmanlabs/postman-app-support/issues/14370", author: "mike_hearn", points: 1247, num_comments: 410, created_at: "2026-11-04T06:00:00Z", _tags: ["story", "author_mike_hearn", "front_page"] },
      { objectID: "102", title: "Ask HN: local eval harnesses", created_at: "2026-11-04T04:00:00Z", points: 214, num_comments: 96 },
    ],
  });
  assert.equal(items.length, 2);
  assert.equal(items[0].source, "hn");
  assert.equal(items[0].native.domain, "github.com");
  assert.equal(items[0].native.points, 1247);
  assert.equal(items[0].native.comments, 410);
  assert.equal(items[0].native.discussionUrl, "https://news.ycombinator.com/item?id=101");
  assert.deepEqual(items[0].tags, ["front_page"]);
  assert.equal(items[1].url, "https://news.ycombinator.com/item?id=102");
});

test("parseGitHub exposes repo metadata and trending rank", () => {
  const items = parseGitHub({
    items: [
      { full_name: "deepseek-ai/dsh-superagent-prototype", html_url: "https://github.com/deepseek-ai/dsh-superagent-prototype", description: "Towards a More Autonomous Agent System", language: "TypeScript", stargazers_count: 17867, forks_count: 1204, open_issues_count: 213, topics: ["llm", "agents"], created_at: "2026-10-29T00:00:00Z", pushed_at: "2026-11-04T08:00:00Z", owner: { login: "deepseek-ai" }, name: "dsh-superagent-prototype" },
    ],
  });
  assert.equal(items[0].title, "deepseek-ai/dsh-superagent-prototype");
  assert.equal(items[0].publishedAt, "2026-11-04T08:00:00.000Z");
  assert.equal(items[0].native.stars, 17867);
  assert.equal(items[0].native.trendingRank, 1);
  assert.deepEqual(items[0].tags, ["llm", "agents", "TypeScript"]);
});

test("parseArxiv reads Atom entries, authors and categories", () => {
  const xml = `<?xml version="1.0"?>
  <feed xmlns="http://www.w3.org/2005/Atom">
    <title>arXiv Query</title>
    <entry>
      <id>http://arxiv.org/abs/2511.05421v1</id>
      <published>2026-11-03T18:00:00Z</published>
      <title>From Autonomous Agents to Cognitive Symbionts</title>
      <summary>We survey agent architectures that persist memory across sessions.</summary>
      <author><name>Y. Li</name></author>
      <author><name>M. Zhang</name></author>
      <category term="cs.CL" />
      <category term="cs.AI" />
    </entry>
  </feed>`;
  const items = parseArxiv(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].native.arxivId, "2511.05421");
  assert.deepEqual(items[0].native.authors, ["Y. Li", "M. Zhang"]);
  assert.deepEqual(items[0].tags, ["cs.CL", "cs.AI"]);
  assert.equal(items[0].native.pdfUrl, "https://arxiv.org/pdf/2511.05421");
});

test("parseLobsters keeps score, comments and tags", () => {
  const items = parseLobsters([
    { title: "Death comes for XSLT", url: "https://blog.example.com/xslt", short_id_url: "https://lobste.rs/s/abc", score: 81, comment_count: 33, created_at: "2026-11-04T00:00:00Z", submitter_user: { username: "jm" }, tags: ["web", "history"] },
  ]);
  assert.equal(items[0].score, 81);
  assert.equal(items[0].native.commentsUrl, "https://lobste.rs/s/abc");
  assert.deepEqual(items[0].tags, ["web", "history"]);
});

test("parseRssFeed handles RSS items, images and entity decoding", () => {
  const xml = `<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>The Register</title>
    <item>
      <title>Regulators ask whether bundled AI assistants count as dark patterns</title>
      <link>https://www.theregister.com/2026/11/04/ai_assistants_dark_patterns/</link>
      <description><![CDATA[<p>Consumer groups argue that pre-installed assistants steer users.</p><img src="https://cdn.example.com/photo.jpg" />]]></description>
      <pubDate>Tue, 04 Nov 2026 10:00:00 GMT</pubDate>
      <dc:creator>John Leyden</dc:creator>
      <enclosure url="https://cdn.example.com/hero.png" type="image/png" />
      <media:thumbnail url="https://cdn.example.com/thumb.jpg" />
    </item>
  </channel>
</rss>`;
  const items = parseRssFeed(xml, { feedLabel: "The Register" });
  assert.equal(items.length, 1);
  assert.equal(items[0].source, "rss");
  assert.equal(items[0].author, "John Leyden");
  assert.equal(items[0].summary, "Consumer groups argue that pre-installed assistants steer users.");
  assert.equal(items[0].media.length, 3);
  assert.deepEqual(items[0].media.map((entry) => entry.url), [
    "https://cdn.example.com/hero.png",
    "https://cdn.example.com/thumb.jpg",
    "https://cdn.example.com/photo.jpg",
  ]);
  assert.deepEqual(items[0].tags, ["The Register"]);
});

test("parseRssFeed handles Atom entries", () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
    <title>Example feed</title>
    <entry>
      <title>Inference costs fall 40%</title>
      <link href="https://example.com/inference" />
      <published>2026-11-04T08:00:00Z</published>
      <summary>Per-token pricing dropped sharply.</summary>
      <author><name>Jane Doe</name></author>
    </entry>
  </feed>`;
  const items = parseRssFeed(xml);
  assert.equal(items[0].url, "https://example.com/inference");
  assert.equal(items[0].author, "Jane Doe");
  assert.equal(items[0].native.feedLabel, "Example feed");
});

test("parseReddit keeps subreddit, flair, score and preview image", () => {
  const items = parseReddit({
    data: {
      children: [{
        data: {
          title: "Which local eval harness are you using in 2026?",
          permalink: "/r/LocalLLaMA/comments/abc/local_eval/",
          author: "token_wanderer",
          subreddit_name_prefixed: "r/LocalLLaMA",
          link_flair_text: "Discussion",
          score: 2400,
          num_comments: 318,
          upvote_ratio: 0.91,
          created_utc: 1762248000,
          selftext: "We compared lm-eval-harness, lighteval and homegrown runners.",
          preview: { images: [{ source: { url: "https://preview.redd.it/abc.png?width=1200&amp;format=png", width: 1200, height: 800 } }] },
        },
      }],
    },
  });
  assert.equal(items[0].native.subreddit, "r/LocalLLaMA");
  assert.equal(items[0].native.flair, "Discussion");
  assert.equal(items[0].native.author, "u/token_wanderer");
  assert.equal(items[0].score, 2400);
  assert.equal(items[0].media[0].url, "https://preview.redd.it/abc.png?width=1200&format=png");
  assert.equal(items[0].media[0].width, 1200);
});

test("parseX resolves author and media from includes", () => {
  const items = parseX({
    data: [{
      id: "1900000000000000000",
      text: "We're releasing a new interpretability tool today.",
      author_id: "u1",
      created_at: "2026-11-04T05:00:00Z",
      public_metrics: { reply_count: 128, retweet_count: 342, like_count: 2100, impression_count: 412000 },
      attachments: { media_keys: ["m1"] },
    }],
    includes: {
      users: [{ id: "u1", name: "Anthropic", username: "AnthropicAI", profile_image_url: "https://pbs.twimg.com/a.jpg" }],
      media: [{ media_key: "m1", type: "photo", url: "https://pbs.twimg.com/media/chart.jpg", width: 1200, height: 600, alt_text: "Probe accuracy by layer" }],
    },
  });
  assert.equal(items[0].url, "https://x.com/AnthropicAI/status/1900000000000000000");
  assert.equal(items[0].author, "@AnthropicAI");
  assert.equal(items[0].native.metrics.likes, 2100);
  assert.equal(items[0].media[0].url, "https://pbs.twimg.com/media/chart.jpg");
  assert.equal(items[0].media[0].alt, "Probe accuracy by layer");
});

test("parsers tolerate empty and malformed payloads", () => {
  assert.deepEqual(parseHackerNews(null), []);
  assert.deepEqual(parseGitHub({}), []);
  assert.deepEqual(parseArxiv(""), []);
  assert.deepEqual(parseLobsters(null), []);
  assert.deepEqual(parseRssFeed("<not-xml"), []);
  assert.deepEqual(parseReddit({}), []);
  assert.deepEqual(parseX({}), []);
});
