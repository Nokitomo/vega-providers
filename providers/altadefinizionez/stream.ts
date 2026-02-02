import { ProviderContext, Stream, TextTracks } from "../types";

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

const resolveMediaUrl = (href: string, baseUrl: string): string => {
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

const extractPackedStreamUrl = (decoded: string): string => {
  if (!decoded) return "";
  const m3u8Match = decoded.match(/https?:[^"'\s]+\.m3u8[^"'\s]*/i);
  if (m3u8Match) return m3u8Match[0];
  const mp4Match = decoded.match(/https?:[^"'\s]+\.mp4[^"'\s]*/i);
  return mp4Match ? mp4Match[0] : "";
};

const normalizeSubtitleLanguage = (
  label: string,
  fileUrl: string
): string => {
  const normalizedLabel = label.trim().toLowerCase();
  const fromLabelMap: Record<string, string> = {
    italian: "it",
    english: "en",
    spanish: "es",
    french: "fr",
    german: "de",
    japanese: "ja",
    chinese: "zh",
    russian: "ru",
    turkish: "tr",
    arabic: "ar",
    hebrew: "he",
    greek: "el",
    bulgarian: "bg",
    ukrainian: "uk",
    catalan: "ca",
    indonesian: "id",
    malay: "ms",
    thai: "th",
  };
  if (fromLabelMap[normalizedLabel]) {
    return fromLabelMap[normalizedLabel];
  }
  const suffixMatch = fileUrl.match(/_([a-z]{3})\.(?:vtt|srt|ttml)$/i);
  if (suffixMatch) {
    const code = suffixMatch[1].toLowerCase();
    const fromCodeMap: Record<string, string> = {
      ita: "it",
      eng: "en",
      spa: "es",
      fre: "fr",
      ger: "de",
      jpn: "ja",
      chi: "zh",
      rus: "ru",
      tur: "tr",
      ara: "ar",
      heb: "he",
      gre: "el",
      bul: "bg",
      ukr: "uk",
      cat: "ca",
      ind: "id",
      may: "ms",
      tha: "th",
    };
    return fromCodeMap[code] || code;
  }
  return normalizedLabel || "und";
};

const resolveSubtitleType = (fileUrl: string): TextTracks[0]["type"] => {
  const lower = fileUrl.toLowerCase();
  if (lower.endsWith(".srt")) return "application/x-subrip";
  if (lower.endsWith(".ttml")) return "application/ttml+xml";
  return "text/vtt";
};

const parseTracksFromDecoded = (
  decoded: string,
  baseUrl?: string
): TextTracks => {
  if (!decoded) return [];
  const tracks: TextTracks = [];
  const trackBlockMatch = decoded.match(
    /tracks\s*:\s*\[([\s\S]*?)\]/
  );
  const block = trackBlockMatch ? trackBlockMatch[1] : "";
  if (!block) {
    return [];
  }
  const regex =
    /\{[^}]*?file\s*:\s*["']([^"']+)["'][^}]*?(?:label|title)\s*:\s*["']([^"']+)["'][^}]*?kind\s*:\s*["']([^"']+)["'][^}]*?\}/gi;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(block))) {
    const file = match[1];
    const label = match[2];
    const kind = match[3];
    if (!file || kind.toLowerCase() !== "captions") {
      continue;
    }
    const resolved = baseUrl ? resolveMediaUrl(file, baseUrl) : file;
    tracks.push({
      title: label || resolved || file,
      language: normalizeSubtitleLanguage(label || "", file),
      type: resolveSubtitleType(file),
      uri: resolved || file,
    });
  }
  if (tracks.length > 0) {
    return tracks;
  }
  const looseRegex = /https?:[^"'\s]+\.vtt[^"'\s]*/gi;
  const seen = new Set<string>();
  let urlMatch: RegExpExecArray | null = null;
  while ((urlMatch = looseRegex.exec(block))) {
    const file = urlMatch[0];
    const resolved = baseUrl ? resolveMediaUrl(file, baseUrl) : file;
    const key = resolved || file;
    if (seen.has(key)) continue;
    seen.add(key);
    tracks.push({
      title: resolved || file,
      language: normalizeSubtitleLanguage("", file),
      type: resolveSubtitleType(file),
      uri: resolved || file,
    });
  }
  return tracks;
};

const decodeSuperVideo = (html: string): string => {
  const functionRegex =
    /eval\(function\((.*?)\)\{.*?return p\}.*?\('(.*?)'\.split/;
  const match = functionRegex.exec(html);
  let decoded = "";
  if (!match) return decoded;
  const encodedString = match[2];
  decoded = encodedString.split("',36,")?.[0].trim();
  const tail = encodedString.split("',36,")[1];
  if (!tail) return decoded;
  let base = 36;
  let count = tail.slice(2).split("|").length;
  let dictionary = tail.slice(2).split("|");
  while (count--) {
    if (dictionary[count]) {
      const regex = new RegExp("\\b" + count.toString(base) + "\\b", "g");
      decoded = decoded.replace(regex, dictionary[count]);
    }
  }
  return decoded;
};

const extractSuperVideoData = (
  html: string,
  baseUrl?: string
): {
  streamUrl: string;
  subtitles: TextTracks;
} => {
  const decoded = decodeSuperVideo(html);
  const streamUrl =
    decoded.match(/file:\s*"([^"]+\.m3u8[^"]*)"/i)?.[1] || "";
  const subtitles = parseTracksFromDecoded(decoded, baseUrl);
  return { streamUrl, subtitles };
};

const extractDroploadData = (
  html: string,
  baseUrl?: string
): {
  streamUrl: string;
  subtitles: TextTracks;
} => {
  const decoded = unpackPacker(html);
  return {
    streamUrl: extractPackedStreamUrl(decoded),
    subtitles: parseTracksFromDecoded(decoded, baseUrl),
  };
};

const extractDroploadCookies = (html: string): Record<string, string> => {
  const cookies: Record<string, string> = {};
  if (!html) return cookies;
  const jqueryRegex = /\$\.cookie\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]/gi;
  let match: RegExpExecArray | null = null;
  while ((match = jqueryRegex.exec(html))) {
    const name = match[1];
    const value = match[2];
    if (name) {
      cookies[name] = value;
    }
  }
  const docRegex =
    /document\.cookie\s*=\s*['"]([^=;'"]+)=([^;'"]*)/gi;
  while ((match = docRegex.exec(html))) {
    const name = match[1];
    const value = match[2];
    if (name) {
      cookies[name] = value;
    }
  }
  return cookies;
};

const buildCookieHeader = (cookies: Record<string, string>): string => {
  const entries = Object.entries(cookies).filter(
    ([key, value]) => key && value != null
  );
  if (entries.length === 0) return "";
  return entries.map(([key, value]) => `${key}=${value}`).join("; ");
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

        const parsed = extractSuperVideoData(
          res.data || "",
          new URL(normalized).origin
        );
        const streamUrl =
          parsed.streamUrl ||
          (await extractors.superVideoExtractor(res.data));
        if (streamUrl) {
          addStream({
            server: `SuperVideo ${superVideoIndex}`,
            link: streamUrl,
            type: "m3u8",
            subtitles:
              parsed.subtitles.length > 0 ? parsed.subtitles : undefined,
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

        const droploadOrigin = new URL(normalized).origin;
        const parsed = extractDroploadData(res.data || "", droploadOrigin);
        const streamUrl = parsed.streamUrl;
        if (streamUrl) {
          const type = streamUrl.toLowerCase().includes(".m3u8")
            ? "m3u8"
            : "mp4";
          const cookies = extractDroploadCookies(res.data || "");
          const cookieHeader = buildCookieHeader(cookies);
          const headers: Record<string, string> = {
            Referer: normalized,
            Origin: droploadOrigin,
          };
          const userAgent =
            typeof commonHeaders["User-Agent"] === "string"
              ? commonHeaders["User-Agent"]
              : "";
          if (userAgent) {
            headers["User-Agent"] = userAgent;
          }
          if (cookieHeader) {
            headers["Cookie"] = cookieHeader;
          }
          addStream({
            server: `Dropload ${droploadIndex}`,
            link: streamUrl,
            type,
            subtitles:
              parsed.subtitles.length > 0 ? parsed.subtitles : undefined,
            headers,
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
