import { ProviderContext, Stream, TextTracks } from "../../types";
import { MOSTRAGUARDA_BASE, REQUEST_TIMEOUT } from "../utils/constants";
import { attachUserAgentHeader } from "../utils/headers";
import { extractPackedStreamUrl, unpackPacker } from "../utils/packer";
import { parseTracksFromDecoded } from "../utils/subtitles";
import { resolveMediaUrl } from "../utils/url";

export const extractMixdropData = (
  html: string,
  baseUrl: string
): {
  streamUrl: string;
  subtitles: TextTracks;
} => {
  const decoded = unpackPacker(html);
  const wurl = decoded.match(/MDCore\.wurl\s*=\s*["']([^"']+)["']/i)?.[1] || "";
  const furl = decoded.match(/MDCore\.furl\s*=\s*["']([^"']+)["']/i)?.[1] || "";
  const rawCandidate = (wurl || furl || extractPackedStreamUrl(decoded) || "")
    .trim()
    .replace(/\\\//g, "/");
  const streamUrlRaw = /\.(?:m3u8|mp4)(?:[?#].*)?$/i.test(rawCandidate)
    ? rawCandidate
    : "";
  return {
    streamUrl: streamUrlRaw ? resolveMediaUrl(streamUrlRaw, baseUrl) : "",
    subtitles: parseTracksFromDecoded(decoded, baseUrl),
  };
};

export const resolveMixdropStream = async ({
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
      Referer: `${MOSTRAGUARDA_BASE}/`,
    },
    timeout: REQUEST_TIMEOUT,
    signal,
  });

  const mixdropOrigin = new URL(normalizedUrl).origin;
  const parsed = extractMixdropData(res.data || "", mixdropOrigin);
  const streamUrl = parsed.streamUrl;
  if (!streamUrl) {
    return null;
  }

  const type = streamUrl.toLowerCase().includes(".m3u8") ? "m3u8" : "mp4";
  const headers: Record<string, string> = {
    Referer: `${mixdropOrigin}/`,
    Origin: mixdropOrigin,
  };
  attachUserAgentHeader(headers, commonHeaders);

  return {
    server: `Mixdrop ${index}`,
    link: streamUrl,
    type,
    subtitles: parsed.subtitles.length > 0 ? parsed.subtitles : undefined,
    headers,
  };
};
