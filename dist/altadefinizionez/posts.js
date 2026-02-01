Object.defineProperty(exports, "__esModule", { value: true });
exports.getSearchPosts = exports.getPosts = void 0;
const DEFAULT_BASE_URL = "https://altadefinizionez.sbs";
const REQUEST_TIMEOUT = 10000;
const normalizeBaseUrl = (value) => value.replace(/\/+$/, "");
const resolveBaseUrl = async (providerContext) => {
  try {
    const resolved = await providerContext.getBaseUrl("altadefinizionez");
    if (resolved) {
      return normalizeBaseUrl(resolved);
    }
  } catch (_) {
    // ignore and fall back to default
  }
  return DEFAULT_BASE_URL;
};
const resolveUrl = (href, baseUrl) => {
  if (!href) return "";
  if (/^https?:\/\//i.test(href)) return href;
  return new URL(href, baseUrl).href;
};
const stripHash = (href) => href.split("#")[0];
const isDetailLink = (href, baseUrl) => {
  if (!href) return false;
  try {
    const resolved = new URL(href, baseUrl);
    const baseHost = new URL(baseUrl).hostname;
    if (!resolved.hostname.endsWith(baseHost)) return false;
    return /\/\d+[^/]*\.html$/i.test(resolved.pathname);
  } catch (_) {
    return false;
  }
};
const buildListUrl = (baseUrl, filter, page) => {
  const normalized = (filter || "").trim();
  const safePage = page > 1 ? page : 1;
  if (!normalized || normalized === "latest") {
    return `${baseUrl}/`;
  }
  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }
  const parts = normalized.split("?");
  const pathPart = parts[0];
  const queryPart = parts[1];
  const cleanedPath = (pathPart || "").replace(/^\/+/, "").replace(/\/+$/, "");
  if (!cleanedPath) {
    return `${baseUrl}/`;
  }
  if (cleanedPath === "film") {
    if (safePage > 1) {
      return `${baseUrl}/film/page/${safePage}/${queryPart ? `?${queryPart}` : ""}`;
    }
    return `${baseUrl}/film/${queryPart ? `?${queryPart}` : ""}`;
  }
  if (cleanedPath.startsWith("catalog/")) {
    if (safePage > 1) {
      return `${baseUrl}/${cleanedPath}/page/${safePage}/`;
    }
    return `${baseUrl}/${cleanedPath}/`;
  }
  if (safePage > 1) {
    return `${baseUrl}/${cleanedPath}/page/${safePage}/`;
  }
  if (queryPart) {
    return `${baseUrl}/${cleanedPath}/?${queryPart}`;
  }
  return `${baseUrl}/${cleanedPath}/`;
};
const extractImage = (element, baseUrl) => {
  const img = element.find("img").first();
  const src =
    img.attr("data-src") ||
    img.attr("data-lazy-src") ||
    img.attr("data-original") ||
    img.attr("src") ||
    "";
  return src ? resolveUrl(src, baseUrl) : "";
};
const addPost = (posts, seen, post) => {
  if (!post.title || !post.link || !post.image) return;
  if (seen.has(post.link)) return;
  posts.push(post);
  seen.add(post.link);
};
const parseGridPosts = ($, baseUrl, posts, seen) => {
  $(".movie").each((_, element) => {
    const item = $(element);
    const anchor = item.find(".movie-poster a[href]").first();
    const href = anchor.attr("href") || "";
    const resolved = stripHash(resolveUrl(href, baseUrl));
    if (!isDetailLink(resolved, baseUrl)) return;
    const title =
      item.find(".movie-title a").first().text().trim() ||
      anchor.attr("title") ||
      anchor.text().trim();
    const image = extractImage(item.find(".movie-poster").first(), baseUrl);
    const episodeLabel = item
      .find(".movie-label .label.episode")
      .first()
      .text()
      .trim();
    addPost(posts, seen, {
      title: title,
      link: resolved,
      image: image,
      episodeLabel: episodeLabel || void 0,
    });
  });
};
const parseTablePosts = ($, baseUrl, posts, seen) => {
  $("table.catalog-table tr").each((_, element) => {
    const row = $(element);
    const anchor = row.find("a[href]").first();
    const href = anchor.attr("href") || "";
    const resolved = stripHash(resolveUrl(href, baseUrl));
    if (!isDetailLink(resolved, baseUrl)) return;
    const title =
      row.find("h2 a").first().text().trim() ||
      anchor.attr("title") ||
      anchor.text().trim();
    const image = extractImage(row, baseUrl);
    addPost(posts, seen, {
      title: title,
      link: resolved,
      image: image,
    });
  });
};
const parseFallbackPosts = ($, baseUrl, posts, seen) => {
  $(".movie-poster a[href]").each((_, element) => {
    const anchor = $(element);
    const href = anchor.attr("href") || "";
    const resolved = stripHash(resolveUrl(href, baseUrl));
    if (!isDetailLink(resolved, baseUrl)) return;
    const title = anchor.attr("title") || anchor.text().trim();
    const image = extractImage(anchor, baseUrl);
    addPost(posts, seen, {
      title: title,
      link: resolved,
      image: image,
    });
  });
};
const parsePostsFromHtml = (html, baseUrl, cheerio) => {
  const $ = cheerio.load(html || "");
  const posts = [];
  const seen = new Set();
  parseGridPosts($, baseUrl, posts, seen);
  parseTablePosts($, baseUrl, posts, seen);
  if (posts.length === 0) {
    parseFallbackPosts($, baseUrl, posts, seen);
  }
  return posts;
};
const getPosts = async function ({
  filter,
  page,
  signal,
  providerContext,
}) {
  try {
    if (signal && signal.aborted) return [];
    const axios = providerContext.axios;
    const commonHeaders = providerContext.commonHeaders;
    const cheerio = providerContext.cheerio;
    const baseUrl = await resolveBaseUrl(providerContext);
    const url = buildListUrl(baseUrl, filter, page);
    const res = await axios.get(url, {
      headers: {
        ...commonHeaders,
        Referer: `${baseUrl}/`,
      },
      timeout: REQUEST_TIMEOUT,
      signal: signal,
    });
    return parsePostsFromHtml(res.data, baseUrl, cheerio);
  } catch (err) {
    console.error("altadefinizionez posts error", err);
    return [];
  }
};
exports.getPosts = getPosts;
const getSearchPosts = async function ({
  searchQuery,
  page,
  signal,
  providerContext,
}) {
  try {
    if (signal && signal.aborted) return [];
    const normalized = (searchQuery || "").trim();
    if (!normalized) return [];
    if (page > 1) return [];
    const axios = providerContext.axios;
    const commonHeaders = providerContext.commonHeaders;
    const cheerio = providerContext.cheerio;
    const baseUrl = await resolveBaseUrl(providerContext);
    const body = `do=search&subaction=search&story=${encodeURIComponent(
      normalized
    )}`;
    const res = await axios.post(`${baseUrl}/`, body, {
      headers: {
        ...commonHeaders,
        Referer: `${baseUrl}/`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: REQUEST_TIMEOUT,
      signal: signal,
    });
    return parsePostsFromHtml(res.data, baseUrl, cheerio);
  } catch (err) {
    console.error("altadefinizionez search error", err);
    return [];
  }
};
exports.getSearchPosts = getSearchPosts;