Object.defineProperty(exports, "__esModule", { value: true });
exports.getStream = void 0;
const DEFAULT_BASE_URL = "https://altadefinizionez.sbs";
const MOSTRAGUARDA_BASE = "https://mostraguarda.stream";
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
const normalizeStreamLink = (href, baseUrl) => {
  if (!href) return "";
  if (href.startsWith("//")) return `https:${href}`;
  if (/^https?:\/\//i.test(href)) return href;
  return new URL(href, baseUrl).href;
};
const isSuperVideo = (href) =>
  /supervideo\./i.test(href) || href.toLowerCase().includes("supervideo");
const extractImdbId = (html) => {
  const match = html.match(/tt\d{6,9}/i);
  return match ? match[0] : "";
};
const extractSuperVideoStreams = async (rawLinks, providerContext, signal) => {
  const axios = providerContext.axios;
  const extractors = providerContext.extractors;
  const commonHeaders = providerContext.commonHeaders;
  const streams = [];
  const seen = new Set();
  let index = 1;
  for (const raw of rawLinks) {
    if (signal && signal.aborted) break;
    if (!raw) continue;
    const normalized = normalizeStreamLink(raw, MOSTRAGUARDA_BASE);
    if (!normalized || !isSuperVideo(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    try {
      const res = await axios.get(normalized, {
        headers: {
          ...commonHeaders,
          Referer: `${MOSTRAGUARDA_BASE}/`,
        },
        timeout: REQUEST_TIMEOUT,
        signal: signal,
      });
      const streamUrl = await extractors.superVideoExtractor(res.data);
      if (streamUrl) {
        streams.push({
          server: `SuperVideo ${index}`,
          link: streamUrl,
          type: "m3u8",
        });
        index += 1;
      }
    } catch (err) {
      console.error("altadefinizionez supervideo error", err);
    }
  }
  return streams;
};
const getMovieStreams = async (pageUrl, providerContext, signal) => {
  const axios = providerContext.axios;
  const cheerio = providerContext.cheerio;
  const commonHeaders = providerContext.commonHeaders;
  const pageOrigin = new URL(pageUrl).origin;
  const res = await axios.get(pageUrl, {
    headers: {
      ...commonHeaders,
      Referer: `${pageOrigin}/`,
    },
    timeout: REQUEST_TIMEOUT,
    signal: signal,
  });
  const html = res.data || "";
  const imdbId = extractImdbId(html);
  if (!imdbId) return [];
  const playerUrl = `${MOSTRAGUARDA_BASE}/index.php?task=set-movie-a&id_imdb=${imdbId}`;
  const playerRes = await axios.get(playerUrl, {
    headers: {
      ...commonHeaders,
      Referer: `${MOSTRAGUARDA_BASE}/`,
    },
    timeout: REQUEST_TIMEOUT,
    signal: signal,
  });
  const $ = cheerio.load(playerRes.data || "");
  const links = [];
  $("li[data-link], span[data-link]").each((_, element) => {
    const link = $(element).attr("data-link");
    if (link) {
      links.push(link);
    }
  });
  if (links.length === 0) {
    const iframe = $("iframe").attr("src");
    if (iframe) {
      links.push(iframe);
    }
  }
  return await extractSuperVideoStreams(links, providerContext, signal);
};
const getSeriesStreams = async (pageUrl, episodeKey, providerContext, signal) => {
  const axios = providerContext.axios;
  const cheerio = providerContext.cheerio;
  const commonHeaders = providerContext.commonHeaders;
  const pageOrigin = new URL(pageUrl).origin;
  const res = await axios.get(pageUrl, {
    headers: {
      ...commonHeaders,
      Referer: `${pageOrigin}/`,
    },
    timeout: REQUEST_TIMEOUT,
    signal: signal,
  });
  const $ = cheerio.load(res.data || "");
  const parts = episodeKey.split("-");
  const season = parts[0] || "";
  const selector = season
    ? `.dropdown.mirrors[data-season="${season}"][data-episode="${episodeKey}"]`
    : `.dropdown.mirrors[data-episode="${episodeKey}"]`;
  const links = [];
  $(selector)
    .find(".dropdown-item[data-link]")
    .each((_, element) => {
      const link = $(element).attr("data-link");
      if (link) {
        links.push(link);
      }
    });
  if (links.length === 0 && season) {
    $(`.dropdown.mirrors[data-episode="${episodeKey}"]`)
      .find(".dropdown-item[data-link]")
      .each((_, element) => {
        const link = $(element).attr("data-link");
        if (link) {
          links.push(link);
        }
      });
  }
  return await extractSuperVideoStreams(links, providerContext, signal);
};
const getStream = async function ({ link, type, signal, providerContext }) {
  try {
    if (signal && signal.aborted) return [];
    const baseUrl = await resolveBaseUrl(providerContext);
    if (link.includes("::")) {
      const parts = link.split("::");
      const rawUrl = parts[0];
      const episodeKey = parts[1];
      const pageUrl = resolveUrl(rawUrl, baseUrl);
      if (!episodeKey) return [];
      return await getSeriesStreams(pageUrl, episodeKey, providerContext, signal);
    }
    if (type === "series") {
      return [];
    }
    const pageUrl = resolveUrl(link, baseUrl);
    return await getMovieStreams(pageUrl, providerContext, signal);
  } catch (err) {
    console.error("altadefinizionez stream error", err);
    return [];
  }
};
exports.getStream = getStream;