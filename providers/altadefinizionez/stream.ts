import { ProviderContext, Stream } from "../types";

const DEFAULT_BASE_URL = "https://altadefinizionez.sbs";
const MOSTRAGUARDA_BASE = "https://mostraguarda.stream";
const REQUEST_TIMEOUT = 10000;

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, "");

const resolveBaseUrl = async (
  providerContext: ProviderContext
): Promise<string> => {
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

const resolveUrl = (href: string, baseUrl: string): string => {
  if (!href) return "";
  if (/^https?:\/\//i.test(href)) return href;
  return new URL(href, baseUrl).href;
};

const normalizeStreamLink = (href: string, baseUrl: string): string => {
  if (!href) return "";
  if (href.startsWith("//")) return `https:${href}`;
  if (/^https?:\/\//i.test(href)) return href;
  return new URL(href, baseUrl).href;
};

const isSuperVideo = (href: string): boolean =>
  /supervideo\./i.test(href) || href.toLowerCase().includes("supervideo");

const isDropload = (href: string): boolean => /dropload\./i.test(href);

const extractImdbIdFromValue = (value: string): string => {
  if (!value) return "";
  const match = value.match(/tt\d{6,9}/i);
  return match ? match[0] : "";
};

const extractImdbIdFromHtml = (
  html: string,
  cheerio: ProviderContext["cheerio"]
): string => {
  const direct = extractImdbIdFromValue(html);
  if (direct) return direct;

  const $ = cheerio.load(html || "");
  const iframeAttrCandidates = [
    "src",
    "data-src",
    "data-lazy-src",
    "data-original",
    "data-embed",
    "data-url",
  ];
  let found = "";

  $("iframe").each((_index, element) => {
    const node = $(element);
    for (const attr of iframeAttrCandidates) {
      found = extractImdbIdFromValue(node.attr(attr) || "");
      if (found) {
        return false;
      }
    }
  });

  if (found) return found;

  const dataImdbNode = $("[data-imdb], [data-imdb-id], [data-id-imdb]").first();
  if (dataImdbNode.length) {
    const dataAttrs = ["data-imdb", "data-imdb-id", "data-id-imdb"];
    for (const attr of dataAttrs) {
      found = extractImdbIdFromValue(dataImdbNode.attr(attr) || "");
      if (found) return found;
    }
  }

  const imdbLink = $("a[href*=\"imdb.com/title/\"]").attr("href");
  found = extractImdbIdFromValue(imdbLink || "");
  return found;
};

const PACKER_REGEX =
  /eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\((['"])((?:\\.|[^\\])*)\1,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])((?:\\.|[^\\])*)\5\.split\('\|'\)\)\)/;

const unescapePackerString = (value: string): string =>
  value.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, "\\");

const unpackPacker = (html: string): string => {
  const match = html.match(PACKER_REGEX);
  if (!match) return "";

  const payload = unescapePackerString(match[2]);
  const base = Number.parseInt(match[3], 10);
  const count = Number.parseInt(match[4], 10);
  const dictionary = unescapePackerString(match[6]).split("|");

  if (!Number.isFinite(base) || !Number.isFinite(count)) return "";

  let decoded = payload;
  for (let index = count - 1; index >= 0; index -= 1) {
    const value = dictionary[index];
    if (!value) continue;
    const token = index.toString(base);
    const regex = new RegExp(`\\b${token}\\b`, "g");
    decoded = decoded.replace(regex, value);
  }

  return decoded;
};

const extractPackedStreamUrl = (html: string): string => {
  const decoded = unpackPacker(html);
  if (!decoded) return "";
  const m3u8Match = decoded.match(/https?:[^"'\s]+\.m3u8[^"'\s]*/i);
  if (m3u8Match) return m3u8Match[0];
  const mp4Match = decoded.match(/https?:[^"'\s]+\.mp4[^"'\s]*/i);
  return mp4Match ? mp4Match[0] : "";
};

const extractMostraguardaStreams = async (
  rawLinks: string[],
  providerContext: ProviderContext,
  signal: AbortSignal
): Promise<Stream[]> => {
  const { axios, extractors, commonHeaders } = providerContext;
  const streams: Stream[] = [];
  const seen = new Set<string>();
  let superVideoIndex = 1;
  let droploadIndex = 1;

  const addStream = (stream: Stream): void => {
    if (!stream.link || seen.has(stream.link)) return;
    streams.push(stream);
    seen.add(stream.link);
  };

  for (const raw of rawLinks) {
    if (signal?.aborted) break;
    if (!raw) continue;
    const normalized = normalizeStreamLink(raw, MOSTRAGUARDA_BASE);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    if (isSuperVideo(normalized)) {
      try {
        const res = await axios.get(normalized, {
          headers: {
            ...commonHeaders,
            Referer: `${MOSTRAGUARDA_BASE}/`,
          },
          timeout: REQUEST_TIMEOUT,
          signal,
        });

        const streamUrl = await extractors.superVideoExtractor(res.data);
        if (streamUrl) {
          addStream({
            server: `SuperVideo ${superVideoIndex}`,
            link: streamUrl,
            type: "m3u8",
          });
          superVideoIndex += 1;
        }
      } catch (err) {
        console.error("altadefinizionez supervideo error", err);
      }
      continue;
    }

    if (isDropload(normalized)) {
      try {
        const res = await axios.get(normalized, {
          headers: {
            ...commonHeaders,
            Referer: `${MOSTRAGUARDA_BASE}/`,
          },
          timeout: REQUEST_TIMEOUT,
          signal,
        });

        const streamUrl = extractPackedStreamUrl(res.data || "");
        if (streamUrl) {
          const type = streamUrl.toLowerCase().includes(".m3u8")
            ? "m3u8"
            : "mp4";
          addStream({
            server: `Dropload ${droploadIndex}`,
            link: streamUrl,
            type,
          });
          droploadIndex += 1;
        }
      } catch (err) {
        console.error("altadefinizionez dropload error", err);
      }
    }
  }

  return streams;
};

const getMovieStreams = async (
  pageUrl: string,
  providerContext: ProviderContext,
  signal: AbortSignal
): Promise<Stream[]> => {
  const { axios, cheerio, commonHeaders } = providerContext;
  const pageOrigin = new URL(pageUrl).origin;
  const res = await axios.get(pageUrl, {
    headers: {
      ...commonHeaders,
      Referer: `${pageOrigin}/`,
    },
    timeout: REQUEST_TIMEOUT,
    signal,
  });

  const html = res.data || "";
  const imdbId = extractImdbIdFromHtml(html, cheerio);
  if (!imdbId) return [];

  const playerUrl = `${MOSTRAGUARDA_BASE}/index.php?task=set-movie-a&id_imdb=${imdbId}`;
  const playerRes = await axios.get(playerUrl, {
    headers: {
      ...commonHeaders,
      Referer: `${MOSTRAGUARDA_BASE}/`,
    },
    timeout: REQUEST_TIMEOUT,
    signal,
  });

  const $ = cheerio.load(playerRes.data || "");
  const links: string[] = [];

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

  return await extractMostraguardaStreams(links, providerContext, signal);
};

const getSeriesStreams = async (
  pageUrl: string,
  episodeKey: string,
  providerContext: ProviderContext,
  signal: AbortSignal
): Promise<Stream[]> => {
  const { axios, cheerio, commonHeaders } = providerContext;
  const pageOrigin = new URL(pageUrl).origin;
  const res = await axios.get(pageUrl, {
    headers: {
      ...commonHeaders,
      Referer: `${pageOrigin}/`,
    },
    timeout: REQUEST_TIMEOUT,
    signal,
  });

  const $ = cheerio.load(res.data || "");
  const parts = episodeKey.split("-");
  const season = parts[0] || "";
  const selector = season
    ? `.dropdown.mirrors[data-season="${season}"][data-episode="${episodeKey}"]`
    : `.dropdown.mirrors[data-episode="${episodeKey}"]`;

  const links: string[] = [];
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

  return await extractMostraguardaStreams(links, providerContext, signal);
};

export const getStream = async function ({
  link,
  type,
  signal,
  providerContext,
}: {
  link: string;
  type: string;
  signal: AbortSignal;
  providerContext: ProviderContext;
}): Promise<Stream[]> {
  try {
    if (signal?.aborted) return [];
    const baseUrl = await resolveBaseUrl(providerContext);

    if (link.includes("::")) {
      const [rawUrl, episodeKey] = link.split("::");
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
