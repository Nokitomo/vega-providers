import { ProviderContext, Stream } from "../types";

const BASE_HOST = "https://www.animeunity.so";
const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
};
const DEBUG_STREAM = true;

const debugLog = (...args: any[]) => {
  if (!DEBUG_STREAM) {
    return;
  }
  try {
    const consoleRef = (globalThis as any)["console"];
    if (consoleRef && typeof consoleRef.log === "function") {
      consoleRef.log("[AnimeUnity]", ...args);
    }
  } catch (_) {
    // ignore logging failures
  }
};

const ORIGIN_PATTERN = /^(https?:\/\/[^\/?#]+)/i;

function safeDecode(value: string): string {
  if (!value) {
    return value;
  }
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch (_) {
    return value;
  }
}

function getOrigin(url: string): string {
  const match = normalizeUrl(url).match(ORIGIN_PATTERN);
  return match?.[1] || "";
}

function extractQueryParamsFromUrl(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (!url) {
    return params;
  }
  const queryStart = url.indexOf("?");
  if (queryStart === -1) {
    return params;
  }
  const hashStart = url.indexOf("#", queryStart);
  const queryString =
    hashStart === -1
      ? url.slice(queryStart + 1)
      : url.slice(queryStart + 1, hashStart);
  if (!queryString) {
    return params;
  }
  queryString.split("&").forEach((part) => {
    if (!part) {
      return;
    }
    const [rawKey, rawValue = ""] = part.split("=");
    const key = safeDecode(rawKey);
    if (!key) {
      return;
    }
    params[key] = safeDecode(rawValue);
  });
  return params;
}

function appendQueryParams(
  url: string,
  params: Record<string, string>
): string {
  const normalized = normalizeUrl(url);
  if (!normalized) {
    return normalized;
  }
  const [baseWithQuery, hashPart] = normalized.split("#", 2);
  const base = baseWithQuery.split("?")[0];
  const existing = extractQueryParamsFromUrl(baseWithQuery);
  const output: Record<string, string> = {...existing};
  Object.entries(params).forEach(([key, value]) => {
    if (!value || output[key]) {
      return;
    }
    output[key] = value;
  });
  const query = Object.entries(output)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  const rebuilt = query ? `${base}?${query}` : base;
  return hashPart ? `${rebuilt}#${hashPart}` : rebuilt;
}

function resolveUrl(rawUrl: string, baseUrl: string): string {
  const normalized = normalizeUrl(rawUrl);
  if (!normalized) {
    return normalized;
  }
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized;
  }
  if (normalized.startsWith("//")) {
    return `https:${normalized}`;
  }
  const origin = getOrigin(baseUrl);
  if (!origin) {
    return normalized;
  }
  if (normalized.startsWith("/")) {
    return `${origin}${normalized}`;
  }
  return `${origin}/${normalized}`;
}

function extractDownloadUrl(html: string): string | null {
  const direct = html.match(/window\.downloadUrl\s*=\s*['"]([^'"]+)['"]/);
  if (direct?.[1]) {
    return decodeEscapedValue(direct[1]);
  }
  const alt = html.match(/(https?:\/\/[^\s"'<>]+(?:mp4|m3u8)[^\s"'<>]*)/i);
  return alt?.[1] ? decodeEscapedValue(alt[1]) : null;
}

function decodeEscapedValue(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, code) =>
        String.fromCharCode(parseInt(code, 16))
      )
      .replace(/\\\//g, "/")
  );
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&amp;/g, "&");
}

function normalizeUrl(value: string): string {
  return decodeEscapedValue(value).trim();
}

function extractFirstUrl(value: string): string | null {
  const match = value.match(/https?:\/\/[^\s"'<>]+/);
  return match?.[0] ? normalizeUrl(match[0]) : null;
}

function normalizeHtmlUrls(html: string): string {
  return html.replace(/\\\//g, "/");
}

function extractVixCloudIdFromUrl(value: string): string | null {
  const match = value.match(/vixcloud\.co\/(?:embed|playlist)\/(\d+)/);
  return match?.[1] || null;
}

function extractEmbedParams(embedUrl: string): Record<string, string> {
  const params = extractQueryParamsFromUrl(embedUrl);
  const output: Record<string, string> = {};
  if (params.token) {
    output.token = params.token;
  }
  if (params.expires) {
    output.expires = params.expires;
  }
  if (params.asn) {
    output.asn = params.asn;
  }
  return output;
}

function extractEmbedId(embedUrl: string): string | null {
  const match = normalizeUrl(embedUrl).match(/\/(?:embed|playlist)\/(\d+)/);
  return match?.[1] || null;
}

function extractVideoId(html: string): string | null {
  const match = html.match(/window\.video\s*=\s*{[\s\S]*?id\s*:\s*'(\d+)'/);
  return match?.[1] || null;
}

function extractVixCloudIdFromHtml(html: string): string | null {
  const normalizedHtml = normalizeHtmlUrls(html);
  return extractVixCloudIdFromUrl(normalizedHtml);
}

function buildFallbackMasterUrl(
  html: string,
  embedUrl: string
): string | null {
  const id =
    extractEmbedId(embedUrl) ||
    extractVideoId(html) ||
    extractVixCloudIdFromHtml(html);
  if (!id) {
    return null;
  }
  const origin = getOrigin(embedUrl);
  return origin ? `${origin}/playlist/${id}` : null;
}

function parseStreamsBlock(
  rawBlock: string
): Array<{ name?: string; url?: string }> {
  if (!rawBlock) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawBlock);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => ({
        name: item?.name,
        url: item?.url ? decodeEscapedValue(item.url) : undefined,
      }));
    }
  } catch (_) {
    // fall through to regex parsing
  }

  const entries: Array<{ name?: string; url?: string }> = [];
  const items = rawBlock.match(/{[\s\S]*?}/g) || [];
  items.forEach((item, index) => {
    const nameMatch = item.match(/name\s*:\s*['"]([^'"]+)['"]/i);
    const urlMatch = item.match(/url\s*:\s*['"]([^'"]+)['"]/i);
    if (urlMatch?.[1]) {
      entries.push({
        name: nameMatch?.[1] || `Server${index + 1}`,
        url: decodeEscapedValue(urlMatch[1]),
      });
    }
  });

  return entries;
}

function buildStreamHeaders(embedUrl: string): Record<string, string> {
  const origin = getOrigin(embedUrl);
  const referer = embedUrl || "";
  const streamHeaders: Record<string, string> = {
    Accept: "*/*",
    "User-Agent": DEFAULT_HEADERS["User-Agent"],
    ...(origin ? { Origin: origin } : {}),
  };
  if (referer) {
    streamHeaders.Referer = referer;
  }
  return streamHeaders;
}

function extractMasterPlaylistParams(
  html: string,
  embedUrl: string
): Record<string, string> {
  const params: Record<string, string> = {};
  const paramsBlock = html.match(
    /window\.masterPlaylist\s*=\s*{[\s\S]*?params\s*:\s*{([\s\S]*?)}[\s\S]*?}/
  );
  const paramsSource = paramsBlock?.[1] || "";
  const paramRegex = /['"]([^'"]+)['"]\s*:\s*'([^']*)'/g;
  let match: RegExpExecArray | null = null;
  while ((match = paramRegex.exec(paramsSource)) !== null) {
    if (match[1] && match[2]) {
      params[match[1]] = match[2];
    }
  }

  if (!params.token) {
    const tokenMatch = html.match(/['"]token['"]\s*:\s*'([^']*)'/);
    if (tokenMatch?.[1]) {
      params.token = tokenMatch[1];
    }
  }
  if (!params.expires) {
    const expiresMatch = html.match(/['"]expires['"]\s*:\s*'([^']*)'/);
    if (expiresMatch?.[1]) {
      params.expires = expiresMatch[1];
    }
  }
  if (!params.asn) {
    const asnMatch = html.match(/['"]asn['"]\s*:\s*'([^']*)'/);
    if (asnMatch?.[1]) {
      params.asn = asnMatch[1];
    }
  }

  const embedParams = extractEmbedParams(embedUrl);
  Object.entries(embedParams).forEach(([key, value]) => {
    if (!params[key] && value) {
      params[key] = value;
    }
  });

  return params;
}

function extractMasterPlaylistUrl(html: string, embedUrl: string): string | null {
  const urlMatch = html.match(
    /window\.masterPlaylist\s*=\s*{[\s\S]*?url\s*:\s*['"]([^'"]+)['"]/
  );
  const url = urlMatch?.[1] ? decodeEscapedValue(urlMatch[1]) : null;
  if (url) {
    return url;
  }
  return buildFallbackMasterUrl(html, embedUrl);
}

function canPlayFhd(html: string, embedUrl: string): boolean {
  if (/window\.canPlayFHD\s*=\s*true/.test(html)) {
    return true;
  }
  const params = extractQueryParamsFromUrl(embedUrl);
  return (
    Object.prototype.hasOwnProperty.call(params, "canPlayFHD") ||
    params.h === "1"
  );
}

function buildPlaylistUrl(
  rawUrl: string,
  embedUrl: string,
  params: Record<string, string>,
  allowFhd: boolean
): string | null {
  const resolved = resolveUrl(rawUrl, embedUrl);
  if (!resolved) {
    return null;
  }
  const mergedParams: Record<string, string> = {...params};
  if (allowFhd && !mergedParams.h) {
    mergedParams.h = "1";
  }
  return appendQueryParams(resolved, mergedParams);
}

function extractVixCloudStreams(html: string, embedUrl: string): Stream[] {
  const streamsMatch = html.match(/window\.streams\s*=\s*(\[[\s\S]*?\]);/);
  const streams = streamsMatch?.[1]
    ? parseStreamsBlock(streamsMatch[1])
    : [];

  const params = extractMasterPlaylistParams(html, embedUrl);
  const masterUrl = extractMasterPlaylistUrl(html, embedUrl);
  const allowFhd = canPlayFhd(html, embedUrl);
  const streamHeaders = buildStreamHeaders(embedUrl);
  const derivedStreams: Array<{ name?: string; url?: string }> = [];

  if (masterUrl && streams.length < 2) {
    const baseUrl = resolveUrl(masterUrl, embedUrl);
    if (baseUrl) {
      const server1 = appendQueryParams(baseUrl, { ub: "1" });
      const server2 = appendQueryParams(baseUrl, { ab: "1" });
      derivedStreams.push(
        { name: "Server1", url: server1 },
        { name: "Server2", url: server2 }
      );
    }
  }

  const fallbackStreams: Stream[] = [];
  const parsedStreams: Array<Stream | null> = [...streams, ...derivedStreams]
    .filter((stream) => stream?.url)
    .map((stream) => {
      if (!stream?.url) {
        return null;
      }
      const rawUrl = resolveUrl(stream.url, embedUrl);
      if (!rawUrl) {
        return null;
      }
      const playlistUrl = buildPlaylistUrl(
        rawUrl,
        embedUrl,
        params,
        allowFhd
      );
      if (!playlistUrl) {
        fallbackStreams.push({
          server: stream.name ? `AnimeUnity ${stream.name}` : "AnimeUnity",
          link: rawUrl,
          type: "m3u8",
          headers: streamHeaders,
        });
        return null;
      }
      return {
        server: stream.name ? `AnimeUnity ${stream.name}` : "AnimeUnity",
        link: playlistUrl,
        type: "m3u8",
        headers: streamHeaders,
      };
    });

  const output = parsedStreams
    .filter((stream): stream is Stream => !!stream)
    .filter((stream, index, list) => {
      return (
        list.findIndex((item) => item.link === stream.link) === index
      );
    });
  if (output.length > 0) {
    return output;
  }

  if (fallbackStreams.length > 0) {
    return fallbackStreams.filter((stream, index, list) => {
      return (
        list.findIndex((item) => item.link === stream.link) === index
      );
    });
  }

  if (masterUrl) {
    const playlistUrl = buildPlaylistUrl(
      masterUrl,
      embedUrl,
      params,
      allowFhd
    );
    if (playlistUrl) {
      return [
        {
          server: "AnimeUnity",
          link: playlistUrl,
          type: "m3u8",
          headers: streamHeaders,
        },
      ];
    }
  }

  return [];
}

export const getStream = async function ({
  link,
  providerContext,
}: {
  link: string;
  type: string;
  signal: AbortSignal;
  providerContext: ProviderContext;
}): Promise<Stream[]> {
  try {
    const { axios } = providerContext;
    const headers = {
      ...DEFAULT_HEADERS,
      Referer: `${BASE_HOST}/`,
    };
    const embedRes = await axios.get(`${BASE_HOST}/embed-url/${link}`, {
      headers,
      timeout: 15000,
      validateStatus: () => true,
      maxRedirects: 0,
    });

    const location = embedRes.headers?.location;
    const rawEmbed = typeof embedRes.data === "string" ? embedRes.data.trim() : "";
    const embedCandidate =
      (location && location.startsWith("http") && location) ||
      extractFirstUrl(rawEmbed) ||
      rawEmbed;
    const embedUrl = normalizeUrl(embedCandidate);

    debugLog("embed-url status", embedRes.status || "unknown");
    debugLog("embed-url location", location || "none");
    debugLog("embed-url resolved", embedUrl || "empty");

    if (!embedUrl || !embedUrl.startsWith("http")) {
      debugLog("embed-url invalid", embedCandidate || "empty");
      return [];
    }

    const pageRes = await axios.get(embedUrl, {
      headers: {
        ...headers,
        Referer: `${BASE_HOST}/embed-url/${link}`,
      },
      timeout: 15000,
    });

    const pageHtml = typeof pageRes.data === "string" ? pageRes.data : "";
    debugLog("embed page status", pageRes.status || "unknown");
    debugLog("embed page flags", {
      streams: /window\.streams/.test(pageHtml),
      master: /window\.masterPlaylist/.test(pageHtml),
      video: /window\.video/.test(pageHtml),
      download: /window\.downloadUrl/.test(pageHtml),
    });

    if (embedUrl.includes("vixcloud.co")) {
      const streams = extractVixCloudStreams(pageHtml, embedUrl);
      const downloadUrl = extractDownloadUrl(pageHtml);
      debugLog("vixcloud streams", streams.length);
      debugLog("vixcloud download", downloadUrl ? "yes" : "no");
      if (downloadUrl) {
        const type = downloadUrl.toLowerCase().includes(".m3u8")
          ? "m3u8"
          : "mp4";
        const streamHeaders = buildStreamHeaders(embedUrl);
        const downloadStream: Stream = {
          server: "AnimeUnity Download",
          link: downloadUrl,
          type,
          headers: streamHeaders,
        };
        if (streams.length > 0) {
          if (!streams.find((stream) => stream.link === downloadUrl)) {
            return [...streams, downloadStream];
          }
          return streams;
        }
        return [downloadStream];
      }
      if (streams.length > 0) {
        return streams;
      }
    }

    const url = extractDownloadUrl(pageHtml);
    if (!url) {
      return [];
    }

    const type = url.toLowerCase().includes(".m3u8") ? "m3u8" : "mp4";
    const streamHeaders = buildStreamHeaders(embedUrl);
    return [
      {
        server: "AnimeUnity",
        link: url,
        type,
        headers: streamHeaders,
      },
    ];
  } catch (err) {
    console.error("animeunity stream error", err);
    return [];
  }
};
