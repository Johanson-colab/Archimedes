const { createHash } = require("node:crypto");

/**
 * News source adapters.
 *
 * Every adapter has a pure `parse*` function so the normalization contract can
 * be tested without network access, plus a fetcher that handles conditional
 * requests and per-source authentication.
 */

const SOURCE_LABELS = {
  hn: "Hacker News",
  github: "GitHub",
  arxiv: "arXiv",
  lobsters: "Lobste.rs",
  reddit: "Reddit",
  rss: "RSS",
  x: "X",
};

const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
  "source",
]);

const TITLE_STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "into", "over", "your",
  "you", "are", "was", "were", "has", "have", "how", "why", "what", "when",
  "who", "will", "can", "not", "but", "its", "our", "their", "they", "them",
  "about", "after", "before", "more", "most", "than", "then", "there", "here",
  "just", "now", "new", "via", "per", "out", "off", "all", "any", "one", "two",
]);

const USER_AGENT = "ArchimedesNews/0.1 (+https://github.com/Johanson-colab/Archimedes)";

function decodeEntities(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)));
}

function stripHtml(value) {
  return decodeEntities(String(value || "").replace(/<!\[CDATA\[|\]\]>/g, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value, limit) {
  const text = String(value || "").trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}\u2026` : text;
}

function canonicalUrl(raw) {
  try {
    const url = new URL(String(raw || "").trim());
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (TRACKING_PARAMS.has(lower) || lower.startsWith("utm_")) url.searchParams.delete(key);
    }
    url.host = url.host.toLowerCase();
    let output = url.toString();
    if (output.endsWith("/") && url.pathname !== "/") output = output.slice(0, -1);
    return output;
  } catch {
    return String(raw || "").trim();
  }
}

function itemId(source, url) {
  const digest = createHash("sha1").update(canonicalUrl(url)).digest("hex").slice(0, 16);
  return `${source}:${digest}`;
}

function domainOf(url) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizeTags(tags) {
  return [...new Set((Array.isArray(tags) ? tags : []).map((tag) => String(tag || "").trim()).filter(Boolean))].slice(0, 8);
}

function normalizeMedia(media) {
  const seen = new Set();
  const output = [];
  for (const entry of Array.isArray(media) ? media : []) {
    const url = String(entry?.url || "").trim();
    if (!url || seen.has(url) || !/^https?:\/\//i.test(url)) continue;
    seen.add(url);
    const item = { url, alt: String(entry?.alt || "").trim() };
    if (Number.isFinite(Number(entry?.width)) && Number(entry.width) > 0) item.width = Number(entry.width);
    if (Number.isFinite(Number(entry?.height)) && Number(entry.height) > 0) item.height = Number(entry.height);
    output.push(item);
    if (output.length >= 4) break;
  }
  return output;
}

function makeItem(source, fields) {
  const url = canonicalUrl(fields.url);
  return {
    id: itemId(source, url),
    source,
    sourceLabel: SOURCE_LABELS[source] || source,
    title: String(fields.title || "").trim(),
    url,
    author: String(fields.author || "").trim(),
    publishedAt: fields.publishedAt ? new Date(fields.publishedAt).toISOString() : "",
    score: Number(fields.score) || 0,
    comments: Number(fields.comments) || 0,
    summary: truncate(stripHtml(fields.summary || ""), 460),
    tags: normalizeTags(fields.tags),
    media: normalizeMedia(fields.media),
    native: fields.native && typeof fields.native === "object" ? fields.native : {},
  };
}

function parseHackerNews(json) {
  const hits = Array.isArray(json?.hits) ? json.hits : [];
  return hits
    .filter((hit) => hit && hit.title)
    .map((hit) => makeItem("hn", {
      title: hit.title,
      url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
      author: hit.author || "",
      publishedAt: hit.created_at || hit.created_at_i ? hit.created_at || new Date(hit.created_at_i * 1000).toISOString() : "",
      score: hit.points,
      comments: hit.num_comments,
      summary: hit.story_text || "",
      tags: (hit._tags || []).filter((tag) => !tag.startsWith("author_") && tag !== "story"),
      native: {
        objectId: hit.objectID || "",
        points: Number(hit.points) || 0,
        comments: Number(hit.num_comments) || 0,
        domain: domainOf(hit.url || ""),
        discussionUrl: `https://news.ycombinator.com/item?id=${hit.objectID || ""}`,
      },
    }));
}

function parseGitHub(json) {
  const items = Array.isArray(json?.items) ? json.items : [];
  return items
    .filter((repo) => repo && repo.full_name)
    .map((repo, index) => makeItem("github", {
      title: repo.full_name,
      url: repo.html_url,
      author: repo.owner?.login || "",
      // Repos are created days ago but "rising" means they are active now, so
      // the item time follows the last push instead of repo creation.
      publishedAt: repo.pushed_at || repo.updated_at || repo.created_at || "",
      score: repo.stargazers_count,
      comments: repo.open_issues_count,
      summary: repo.description || "",
      tags: [...(Array.isArray(repo.topics) ? repo.topics : []), repo.language || ""],
      native: {
        owner: repo.owner?.login || "",
        name: repo.name || "",
        fullName: repo.full_name,
        language: repo.language || "",
        stars: Number(repo.stargazers_count) || 0,
        forks: Number(repo.forks_count) || 0,
        issues: Number(repo.open_issues_count) || 0,
        trendingRank: index + 1,
      },
    }));
}

function firstMatch(block, pattern) {
  const match = block.match(pattern);
  return match ? match[1] : "";
}

function parseArxiv(xml) {
  const entries = String(xml || "").match(/<entry>[\s\S]*?<\/entry>/gi) || [];
  return entries
    .map((entry) => {
      const idUrl = firstMatch(entry, /<id>\s*([^<]+?)\s*<\/id>/i);
      const title = stripHtml(firstMatch(entry, /<title>\s*([\s\S]*?)\s*<\/title>/i));
      if (!title) return null;
      const published = firstMatch(entry, /<published>\s*([^<]+?)\s*<\/published>/i);
      const authors = [...entry.matchAll(/<author>[\s\S]*?<name>\s*([^<]+?)\s*<\/name>[\s\S]*?<\/author>/gi)].map((match) => decodeEntities(match[1]));
      const categories = [...entry.matchAll(/<category[^>]*\bterm="([^"]+)"/gi)].map((match) => match[1]);
      const arxivId = idUrl.replace(/^https?:\/\/arxiv\.org\/abs\//i, "").replace(/v\d+$/i, "");
      return makeItem("arxiv", {
        title,
        url: idUrl,
        author: authors[0] || "",
        publishedAt: published,
        summary: firstMatch(entry, /<summary>\s*([\s\S]*?)\s*<\/summary>/i),
        tags: categories,
        native: { arxivId, authors, categories, pdfUrl: `https://arxiv.org/pdf/${arxivId}` },
      });
    })
    .filter(Boolean);
}

function parseLobsters(json) {
  const entries = Array.isArray(json) ? json : [];
  return entries
    .filter((story) => story && story.title)
    .map((story) => makeItem("lobsters", {
      title: story.title,
      url: story.url || story.short_id_url || "",
      author: story.submitter_user?.username || "",
      publishedAt: story.created_at || "",
      score: story.score,
      comments: story.comment_count,
      summary: story.description || "",
      tags: Array.isArray(story.tags) ? story.tags : [],
      native: {
        commentsUrl: story.comments_url || story.short_id_url || "",
        shortId: story.short_id || "",
      },
    }));
}

function parseRssFeed(xml, { feedLabel = "" } = {}) {
  const source = String(xml || "");
  const isAtom = /<feed[\s>]/i.test(source) && !/<rss[\s>]/i.test(source);
  const blocks = isAtom ? source.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [] : source.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  const feedTitle = stripHtml(isAtom ? firstMatch(source, /<feed[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/i) : firstMatch(source, /<channel[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/i));
  return blocks
    .map((block) => {
      const title = stripHtml(firstMatch(block, /<title[^>]*>([\s\S]*?)<\/title>/i));
      const link = isAtom
        ? firstMatch(block, /<link[^>]*\bhref="([^"]+)"[^>]*\/?>/i) || firstMatch(block, /<link[^>]*>([^<]+)<\/link>/i)
        : firstMatch(block, /<link>\s*([^<]+?)\s*<\/link>/i);
      if (!title || !link) return null;
      const rawDescription = firstMatch(block, /<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i) || firstMatch(block, /<description[^>]*>([\s\S]*?)<\/description>/i) || firstMatch(block, /<summary[^>]*>([\s\S]*?)<\/summary>/i);
      const media = [];
      for (const match of block.matchAll(/<enclosure[^>]*\burl="([^"]+)"[^>]*>/gi)) {
        const tag = match[0];
        const type = (tag.match(/\btype="([^"]+)"/i) || [])[1] || "";
        if (!type || type.startsWith("image/")) media.push({ url: decodeEntities(match[1]) });
      }
      for (const match of block.matchAll(/<media:(?:content|thumbnail)[^>]*\burl="([^"]+)"[^>]*>/gi)) {
        media.push({ url: decodeEntities(match[1]) });
      }
      const inlineImage = block.match(/<img[^>]+src="([^"]+)"/i);
      if (inlineImage) media.push({ url: decodeEntities(inlineImage[1]) });
      const published = firstMatch(block, /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || firstMatch(block, /<published[^>]*>([\s\S]*?)<\/published>/i) || firstMatch(block, /<updated[^>]*>([\s\S]*?)<\/updated>/i);
      const author = firstMatch(block, /<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i) || firstMatch(block, /<author[\s\S]*?<name>([\s\S]*?)<\/name>/i);
      return makeItem("rss", {
        title,
        url: decodeEntities(link),
        author: stripHtml(author),
        publishedAt: published ? new Date(published).toISOString() : "",
        summary: rawDescription,
        tags: feedLabel ? [feedLabel] : [],
        media,
        native: { feedLabel: feedLabel || feedTitle || "" },
      });
    })
    .filter(Boolean);
}

function redditImage(post) {
  const preview = post?.preview?.images?.[0]?.source;
  if (preview?.url) return [{ url: decodeEntities(preview.url), width: preview.width, height: preview.height }];
  if (post?.post_hint === "image" && post.url_overridden_by_dest) return [{ url: post.url_overridden_by_dest }];
  const thumbnail = String(post?.thumbnail || "");
  if (/^https?:\/\//i.test(thumbnail)) return [{ url: thumbnail }];
  return [];
}

function parseReddit(json) {
  const children = Array.isArray(json?.data?.children) ? json.data.children : [];
  return children
    .map((child) => child?.data)
    .filter((post) => post && post.title)
    .map((post) => makeItem("reddit", {
      title: post.title,
      url: post.permalink ? `https://www.reddit.com${post.permalink}` : post.url,
      author: post.author || "",
      publishedAt: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : "",
      score: post.score,
      comments: post.num_comments,
      summary: post.selftext || "",
      tags: [post.subreddit_name_prefixed || (post.subreddit ? `r/${post.subreddit}` : ""), post.link_flair_text || ""],
      media: redditImage(post),
      native: {
        subreddit: post.subreddit_name_prefixed || (post.subreddit ? `r/${post.subreddit}` : ""),
        author: post.author ? `u/${post.author}` : "",
        flair: post.link_flair_text || "",
        upvoteRatio: Number(post.upvote_ratio) || 0,
        permalink: post.permalink ? `https://www.reddit.com${post.permalink}` : post.url,
        isSelf: Boolean(post.is_self),
      },
    }));
}

function parseX(json) {
  const users = new Map((json?.includes?.users || []).map((user) => [user.id, user]));
  const media = new Map((json?.includes?.media || []).map((entry) => [entry.media_key, entry]));
  return (Array.isArray(json?.data) ? json.data : [])
    .filter((tweet) => tweet && tweet.text)
    .map((tweet) => {
      const user = users.get(tweet.author_id) || {};
      const mediaItems = (tweet.attachments?.media_keys || [])
        .map((key) => media.get(key))
        .filter(Boolean)
        .map((entry) => ({
          url: entry.type === "photo" ? entry.url : entry.preview_image_url || entry.url,
          width: entry.width,
          height: entry.height,
          alt: entry.alt_text || "",
        }))
        .filter((entry) => entry.url);
      return makeItem("x", {
        title: truncate(tweet.text, 140),
        url: user.username ? `https://x.com/${user.username}/status/${tweet.id}` : `https://x.com/i/web/status/${tweet.id}`,
        author: user.username ? `@${user.username}` : "",
        publishedAt: tweet.created_at || "",
        score: Number(tweet.public_metrics?.like_count) || 0,
        comments: Number(tweet.public_metrics?.reply_count) || 0,
        summary: tweet.text,
        tags: [],
        media: mediaItems,
        native: {
          name: user.name || "",
          handle: user.username ? `@${user.username}` : "",
          avatar: user.profile_image_url || "",
          metrics: {
            replies: Number(tweet.public_metrics?.reply_count) || 0,
            reposts: Number(tweet.public_metrics?.retweet_count) || 0,
            likes: Number(tweet.public_metrics?.like_count) || 0,
            views: Number(tweet.public_metrics?.impression_count) || 0,
          },
        },
      });
    });
}

// --- fetchers ---------------------------------------------------------------

async function fetchWithTimeout(fetchImpl, url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function conditionalHeaders(state = {}) {
  const headers = { "User-Agent": USER_AGENT, Accept: "*/*" };
  if (state.etag) headers["If-None-Match"] = state.etag;
  if (state.lastModified) headers["If-Modified-Since"] = state.lastModified;
  return headers;
}

function responseState(response) {
  return {
    etag: response.headers?.get?.("etag") || "",
    lastModified: response.headers?.get?.("last-modified") || "",
  };
}

async function fetchJson(fetchImpl, url, options, state) {
  const response = await fetchWithTimeout(fetchImpl, url, { ...options, headers: { ...conditionalHeaders(state), ...(options.headers || {}) } });
  if (response.status === 304) return { notModified: true, ...responseState(response) };
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return { json: await response.json(), ...responseState(response) };
}

async function fetchText(fetchImpl, url, options, state) {
  const response = await fetchWithTimeout(fetchImpl, url, { ...options, headers: { ...conditionalHeaders(state), ...(options.headers || {}) } });
  if (response.status === 304) return { notModified: true, ...responseState(response) };
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return { text: await response.text(), ...responseState(response) };
}

async function fetchHackerNews({ fetchImpl = fetch, state = {} } = {}) {
  const url = "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30";
  const result = await fetchJson(fetchImpl, url, {}, state);
  return result.notModified ? result : { ...result, items: parseHackerNews(result.json) };
}

async function fetchGitHub({ fetchImpl = fetch, state = {}, days = 7, minStars = 50, token = "" } = {}) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const query = `created:>${since} stars:>${minStars}`;
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=25`;
  const result = await fetchJson(fetchImpl, url, { headers: { Accept: "application/vnd.github+json" } }, state);
  return result.notModified ? result : { ...result, items: parseGitHub(result.json) };
}

async function fetchArxiv({ fetchImpl = fetch, state = {} } = {}) {
  const url = "https://export.arxiv.org/api/query?search_query=cat:cs.CL+OR+cat:cs.LG+OR+cat:cs.AI&start=0&max_results=25&sortBy=submittedDate&sortOrder=descending";
  const result = await fetchText(fetchImpl, url, {}, state);
  return result.notModified ? result : { ...result, items: parseArxiv(result.text) };
}

async function fetchLobsters({ fetchImpl = fetch, state = {} } = {}) {
  const url = "https://lobste.rs/hottest.json";
  const result = await fetchJson(fetchImpl, url, {}, state);
  return result.notModified ? result : { ...result, items: parseLobsters(result.json) };
}

async function fetchRedditToken({ fetchImpl = fetch, clientId, clientSecret }) {
  if (!clientId || !clientSecret) throw new Error("Reddit OAuth is not configured.");
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetchWithTimeout(fetchImpl, "https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw new Error(`Reddit OAuth failed (HTTP ${response.status})`);
  const json = await response.json();
  if (!json?.access_token) throw new Error("Reddit OAuth returned no access token.");
  return { token: json.access_token, expiresIn: Number(json.expires_in) || 3600 };
}

async function fetchReddit({ fetchImpl = fetch, state = {}, clientId, clientSecret, subreddits = [], tokenCache } = {}) {
  let token = tokenCache?.token && tokenCache.expiresAt > Date.now() ? tokenCache.token : "";
  if (!token) {
    const granted = await fetchRedditToken({ fetchImpl, clientId, clientSecret });
    token = granted.token;
    if (tokenCache) Object.assign(tokenCache, { token, expiresAt: Date.now() + Math.max(60, granted.expiresIn - 60) * 1000 });
  }
  const lists = (subreddits.length ? subreddits : ["LocalLLaMA"]).slice(0, 5);
  const items = [];
  let etag = state.etag || "";
  let lastModified = state.lastModified || "";
  let notModified = true;
  for (const subreddit of lists) {
    const url = `https://oauth.reddit.com/r/${encodeURIComponent(subreddit)}/hot?limit=25&raw_json=1`;
    const result = await fetchJson(fetchImpl, url, { headers: { Authorization: `bearer ${token}` } }, state);
    if (result.notModified) continue;
    notModified = false;
    etag = result.etag || etag;
    lastModified = result.lastModified || lastModified;
    items.push(...parseReddit(result.json));
  }
  return notModified ? { notModified, etag, lastModified } : { items, etag, lastModified };
}

async function fetchX({ fetchImpl = fetch, state = {}, bearerToken, query } = {}) {
  if (!bearerToken) throw new Error("X is not configured. Add a bearer token in News settings.");
  const search = String(query || "").trim() || "(AI OR LLM OR agents) -is:retweet lang:en";
  const url = `https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(search)}&max_results=20&expansions=author_id,attachments.media_keys&tweet.fields=created_at,public_metrics,author_id,attachments&user.fields=name,username,profile_image_url&media.fields=url,preview_image_url,width,height,alt_text`;
  const result = await fetchJson(fetchImpl, url, { headers: { Authorization: `Bearer ${bearerToken}` } }, state);
  return result.notModified ? result : { ...result, items: parseX(result.json) };
}

async function fetchRss({ fetchImpl = fetch, state = {}, feed }) {
  if (!feed?.url) throw new Error("RSS feed has no URL.");
  const result = await fetchText(fetchImpl, feed.url, { headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" } }, state);
  return result.notModified ? result : { ...result, items: parseRssFeed(result.text, { feedLabel: feed.label || "" }) };
}

module.exports = {
  SOURCE_LABELS,
  canonicalUrl,
  itemId,
  makeItem,
  parseArxiv,
  parseGitHub,
  parseHackerNews,
  parseLobsters,
  parseReddit,
  parseRssFeed,
  parseX,
  fetchArxiv,
  fetchGitHub,
  fetchHackerNews,
  fetchLobsters,
  fetchReddit,
  fetchRss,
  fetchX,
  truncate,
  stripHtml,
  decodeEntities,
};
