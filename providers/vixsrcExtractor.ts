import { ProviderContext, Stream } from "./types";

const DEFAULT_TIMEOUT_MS = 15000;

const normalizeUrlValue = (value: string): string =>
  String(value || "").replace(/\\\//g, "/").replace(/&amp;/g, "&").trim();

const resolveMediaUrl = (href: string, baseUrl: string): string => {
  const normalized = normalizeUrlValue(href);
  if (!normalized) return "";
  if (normalized.startsWith("//")) return `https:${normalized}`;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  return new URL(normalized, baseUrl).href;
};

const extractQueryParams = (value: string): Record<string, string> => {
  try {
    const url = new URL(value);
    const output: Record<string, string> = {};
    url.searchParams.forEach((item, key) => {
      output[key] = item;
    });
    return output;
  } catch (_) {
    return {};
  }
};

const appendQueryParams = (
  value: string,
  params: Record<string, string>
): string => {
  try {
    const url = new URL(value);
    Object.entries(params).forEach(([key, item]) => {
      if (item && !url.searchParams.has(key)) url.searchParams.set(key, item);
    });
    return url.toString();
  } catch (_) {
    return value;
  }
};

export const buildVixsrcApiUrl = (pageUrl: string): string => {
  try {
    const url = new URL(pageUrl);
    if (!/^\/(?:movie|tv)\//i.test(url.pathname)) return "";
    url.pathname = `/api${url.pathname}`;
    return url.toString();
  } catch (_) {
    return "";
  }
};

export const extractVixsrcEmbedUrl = (
  data: unknown,
  baseUrl: string
): string => {
  if (!data || typeof data !== "object") return "";
  const src = String((data as { src?: unknown }).src || "").trim();
  return src ? resolveMediaUrl(src, baseUrl) : "";
};

export const extractVixsrcData = (
  html: string,
  pageUrl: string
): { streamUrl: string; fallbackUrl: string } => {
  const masterUrlMatch = html.match(
    /window\.masterPlaylist\s*=\s*{[\s\S]*?url\s*:\s*['"]([^'"]+)['"]/i
  );
  const paramsBlockMatch = html.match(
    /window\.masterPlaylist\s*=\s*{[\s\S]*?params\s*:\s*{([\s\S]*?)}[\s\S]*?}/i
  );
  const params: Record<string, string> = {};
  const paramRegex = /['"]([^'"]+)['"]\s*:\s*['"]([^'"]*)['"]/g;
  let match: RegExpExecArray | null = null;
  while ((match = paramRegex.exec(paramsBlockMatch?.[1] || ""))) {
    if (match[1]) params[match[1]] = match[2] || "";
  }

  const pageParams = extractQueryParams(pageUrl);
  ["token", "expires", "asn"].forEach((key) => {
    if (!params[key] && pageParams[key]) params[key] = pageParams[key];
  });
  if (/window\.canPlayFHD\s*=\s*true/i.test(html) && !params.h) params.h = "1";

  const masterUrl = masterUrlMatch?.[1]
    ? resolveMediaUrl(masterUrlMatch[1], pageUrl)
    : "";
  const streamUrl = masterUrl ? appendQueryParams(masterUrl, params) : "";
  const downloadMatch = html.match(
    /window\.downloadUrl\s*=\s*['"]([^'"]+)['"]/i
  );
  const fallbackUrl = downloadMatch?.[1]
    ? resolveMediaUrl(downloadMatch[1], pageUrl)
    : "";
  return { streamUrl, fallbackUrl };
};

export const resolveVixsrcStream = async ({
  url,
  server,
  providerContext,
  signal,
  requestReferer,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  url: string;
  server: string;
  providerContext: ProviderContext;
  signal: AbortSignal;
  requestReferer?: string;
  timeoutMs?: number;
}): Promise<Stream | null> => {
  const { axios, commonHeaders } = providerContext;
  const requestHeaders = {
    ...commonHeaders,
    Referer: requestReferer || url,
  };
  const response = await axios.get(url, {
    headers: requestHeaders,
    timeout: timeoutMs,
    signal,
  });
  let mediaPageUrl = url;
  let parsed = extractVixsrcData(String(response?.data || ""), mediaPageUrl);

  if (!parsed.streamUrl && !parsed.fallbackUrl) {
    const apiUrl = buildVixsrcApiUrl(url);
    if (apiUrl) {
      const apiResponse = await axios.get(apiUrl, {
        headers: { ...commonHeaders, Referer: url },
        timeout: timeoutMs,
        signal,
      });
      const embedUrl = extractVixsrcEmbedUrl(apiResponse?.data, url);
      if (embedUrl) {
        const embedResponse = await axios.get(embedUrl, {
          headers: { ...commonHeaders, Referer: url },
          timeout: timeoutMs,
          signal,
        });
        mediaPageUrl = embedUrl;
        parsed = extractVixsrcData(
          String(embedResponse?.data || ""),
          mediaPageUrl
        );
      }
    }
  }

  const streamUrl = parsed.streamUrl || parsed.fallbackUrl;
  if (!streamUrl) return null;

  const origin = new URL(mediaPageUrl).origin;
  const userAgent = commonHeaders["User-Agent"] || commonHeaders["user-agent"];
  const headers: Record<string, string> = {
    Referer: mediaPageUrl,
    Origin: origin,
    Accept: "*/*",
  };
  if (userAgent) headers["User-Agent"] = userAgent;

  return {
    server,
    link: streamUrl,
    type: /(?:\/playlist\/|\.m3u8(?:$|[?#]))/i.test(streamUrl) ? "m3u8" : "mp4",
    headers,
  };
};
