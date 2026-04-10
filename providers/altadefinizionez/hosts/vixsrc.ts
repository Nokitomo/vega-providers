import { ProviderContext, Stream } from "../../types";
import { GUARDAHD_BASE, REQUEST_TIMEOUT } from "../utils/constants";
import { attachUserAgentHeader } from "../utils/headers";
import {
  appendQueryParams,
  extractQueryParamsFromUrl,
  normalizeUrlValue,
  resolveMediaUrl,
} from "../utils/url";

export const extractVixsrcData = (
  html: string,
  pageUrl: string
): {
  streamUrl: string;
  fallbackUrl: string;
} => {
  const masterUrlMatch = html.match(
    /window\.masterPlaylist\s*=\s*{[\s\S]*?url\s*:\s*['"]([^'"]+)['"]/i
  );
  const masterUrlRaw = masterUrlMatch?.[1] || "";
  const paramsBlockMatch = html.match(
    /window\.masterPlaylist\s*=\s*{[\s\S]*?params\s*:\s*{([\s\S]*?)}[\s\S]*?}/i
  );
  const paramsBlock = paramsBlockMatch?.[1] || "";
  const params: Record<string, string> = {};
  const paramRegex = /['"]([^'"]+)['"]\s*:\s*'([^']*)'/g;
  let match: RegExpExecArray | null = null;
  while ((match = paramRegex.exec(paramsBlock))) {
    if (match[1]) {
      params[match[1]] = match[2] || "";
    }
  }
  const embedParams = extractQueryParamsFromUrl(pageUrl);
  if (!params.token && embedParams.token) params.token = embedParams.token;
  if (!params.expires && embedParams.expires) params.expires = embedParams.expires;
  if (!params.asn && embedParams.asn) params.asn = embedParams.asn;
  const canPlayFhd = /window\.canPlayFHD\s*=\s*true/i.test(html);
  if (canPlayFhd && !params.h) {
    params.h = "1";
  }
  const masterUrlResolved = masterUrlRaw
    ? resolveMediaUrl(normalizeUrlValue(masterUrlRaw), pageUrl)
    : "";
  const streamUrl = masterUrlResolved ? appendQueryParams(masterUrlResolved, params) : "";
  const downloadMatch = html.match(/window\.downloadUrl\s*=\s*['"]([^'"]+)['"]/i);
  const fallbackUrl = downloadMatch?.[1]
    ? resolveMediaUrl(normalizeUrlValue(downloadMatch[1]), pageUrl)
    : "";
  return { streamUrl, fallbackUrl };
};

export const resolveVixsrcStream = async ({
  normalizedUrl,
  index,
  providerContext,
  signal,
}: {
  normalizedUrl: string;
  index: number;
  providerContext: ProviderContext;
  signal: AbortSignal;
}): Promise<Stream | null> => {
  const { axios, commonHeaders } = providerContext;
  const res = await axios.get(normalizedUrl, {
    headers: {
      ...commonHeaders,
      Referer: `${GUARDAHD_BASE}/`,
    },
    timeout: REQUEST_TIMEOUT,
    signal,
  });

  const parsed = extractVixsrcData(String(res.data || ""), normalizedUrl);
  const streamUrl = parsed.streamUrl || parsed.fallbackUrl;
  if (!streamUrl) {
    return null;
  }

  const isPlaylistLink =
    streamUrl.toLowerCase().includes("/playlist/") ||
    streamUrl.toLowerCase().includes(".m3u8");
  const type = isPlaylistLink ? "m3u8" : "mp4";
  const vixOrigin = new URL(normalizedUrl).origin;
  const headers: Record<string, string> = {
    Referer: normalizedUrl,
    Origin: vixOrigin,
    Accept: "*/*",
  };
  attachUserAgentHeader(headers, commonHeaders);

  return {
    server: `Server 1 ${index}`,
    link: streamUrl,
    type,
    headers,
  };
};
