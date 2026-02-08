import { ProviderContext, Stream } from "../types";
import {
  REQUEST_TIMEOUT,
  buildLocaleUrl,
  decodeHtmlEntities,
  extractInertiaPage,
  extractTitleId,
  resolveBaseUrl,
  resolveUrl,
} from "./utils";
import { extractVixCloudStreams } from "../animeunity/parsers/stream";

const SERVER_PREFIX = "StreamingUnity";

const getUserAgent = (headers: Record<string, string>): string => {
  const candidate = headers["User-Agent"] || headers["user-agent"];
  return typeof candidate === "string" && candidate.trim()
    ? candidate
    : "Mozilla/5.0";
};

const fetchHtml = async (
  url: string,
  providerContext: ProviderContext,
  signal: AbortSignal,
  referer?: string
): Promise<string> => {
  const { axios, commonHeaders } = providerContext;
  const res = await axios.get(url, {
    headers: {
      ...commonHeaders,
      Referer: referer || url,
    },
    timeout: REQUEST_TIMEOUT,
    signal,
  });
  return typeof res.data === "string" ? res.data : String(res.data ?? "");
};

const parseLink = (link: string): { titleId: string; episodeId?: string } => {
  const [base, episodePart] = String(link || "").split("::", 2);
  const titleId = extractTitleId(base);
  const episodeId = episodePart ? episodePart.trim() : undefined;
  return { titleId, episodeId };
};

const buildWatchUrl = (baseUrl: string, titleId: string): string =>
  buildLocaleUrl(`/watch/${titleId}`, baseUrl);

const buildEpisodeIframeUrl = (
  baseUrl: string,
  titleId: string,
  episodeId: string
): string => {
  const encodedEpisodeId = encodeURIComponent(episodeId);
  const iframeUrl = buildLocaleUrl(`/iframe/${titleId}`, baseUrl);
  return `${iframeUrl}?episode_id=${encodedEpisodeId}&next_episode=1`;
};

const extractEmbedUrl = (
  html: string,
  baseUrl: string,
  cheerio: ProviderContext["cheerio"]
): string => {
  const page = extractInertiaPage(html, cheerio);
  const embedFromPage = page?.props?.embedUrl;
  if (embedFromPage) {
    return decodeHtmlEntities(String(embedFromPage));
  }

  const $ = cheerio.load(html || "");
  const href = $("a[href*='/it/iframe/']").first().attr("href") || "";
  if (href) {
    return resolveUrl(decodeHtmlEntities(href), baseUrl);
  }

  const match = html.match(/https?:\/\/[^"'\s]+\/it\/iframe\/\d+[^"'\s]*/i);
  if (match?.[0]) {
    return decodeHtmlEntities(match[0]);
  }

  const relativeMatch = html.match(/\/it\/iframe\/\d+[^"'\s]*/i);
  if (relativeMatch?.[0]) {
    return resolveUrl(relativeMatch[0], baseUrl);
  }

  return "";
};

const extractIframeSrc = (
  html: string,
  baseUrl: string,
  cheerio: ProviderContext["cheerio"]
): string => {
  const $ = cheerio.load(html || "");
  const src = $("iframe[src]").first().attr("src") || "";
  if (src) {
    return resolveUrl(decodeHtmlEntities(src), baseUrl);
  }

  const match = html.match(/https?:\/\/[^"'\s]+vixcloud\.co\/embed\/\d+[^"'\s]*/i);
  if (match?.[0]) {
    return decodeHtmlEntities(match[0]);
  }

  return "";
};

const normalizeServerName = (value: string): string => {
  if (!value) return SERVER_PREFIX;
  if (value.startsWith("AnimeUnity")) {
    return value.replace(/^AnimeUnity/, SERVER_PREFIX);
  }
  return `${SERVER_PREFIX} ${value}`.trim();
};

export const getStream = async function ({
  link,
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
    const { titleId, episodeId } = parseLink(link);
    if (!titleId) return [];

    const watchUrl = buildWatchUrl(baseUrl, titleId);
    let iframeSrc = "";
    let iframeReferer = watchUrl;

    if (episodeId) {
      const iframeUrl = buildEpisodeIframeUrl(baseUrl, titleId, episodeId);
      const iframeHtml = await fetchHtml(
        iframeUrl,
        providerContext,
        signal,
        watchUrl
      );
      iframeSrc = extractIframeSrc(iframeHtml, baseUrl, providerContext.cheerio);
      iframeReferer = iframeUrl;
    }

    if (!iframeSrc) {
      const watchHtml = await fetchHtml(watchUrl, providerContext, signal, baseUrl);
      const embedUrl = extractEmbedUrl(watchHtml, baseUrl, providerContext.cheerio);
      if (!embedUrl) return [];

      const iframeHtml = await fetchHtml(
        embedUrl,
        providerContext,
        signal,
        watchUrl
      );
      iframeSrc = extractIframeSrc(iframeHtml, baseUrl, providerContext.cheerio);
      if (!iframeSrc) return [];
      iframeReferer = embedUrl;
    }

    const vixHtml = await fetchHtml(
      iframeSrc,
      providerContext,
      signal,
      iframeReferer
    );
    const userAgent = getUserAgent(providerContext.commonHeaders);
    const streams = extractVixCloudStreams(vixHtml, iframeSrc, userAgent);

    return streams.map((stream) => ({
      ...stream,
      server: normalizeServerName(stream.server || ""),
    }));
  } catch (err) {
    console.error("streamingunity stream error", err);
    return [];
  }
};
