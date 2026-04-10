import { ProviderContext, Stream, TextTracks } from "../../types";
import { MOSTRAGUARDA_BASE, REQUEST_TIMEOUT } from "../utils/constants";
import { attachUserAgentHeader } from "../utils/headers";
import { extractPackedStreamUrl, unpackPacker } from "../utils/packer";
import { parseTracksFromDecoded } from "../utils/subtitles";

export const extractDroploadData = (
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

export const extractDroploadCookies = (html: string): Record<string, string> => {
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
  const docRegex = /document\.cookie\s*=\s*['"]([^=;'"]+)=([^;'"]*)/gi;
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

export const resolveDroploadStream = async ({
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

  const droploadOrigin = new URL(normalizedUrl).origin;
  const parsed = extractDroploadData(res.data || "", droploadOrigin);
  const streamUrl = parsed.streamUrl;
  if (!streamUrl) {
    return null;
  }

  const type = streamUrl.toLowerCase().includes(".m3u8") ? "m3u8" : "mp4";
  const cookies = extractDroploadCookies(res.data || "");
  const cookieHeader = buildCookieHeader(cookies);
  const headers: Record<string, string> = {
    Referer: normalizedUrl,
    Origin: droploadOrigin,
  };
  attachUserAgentHeader(headers, commonHeaders);
  if (cookieHeader) {
    headers["Cookie"] = cookieHeader;
  }

  return {
    server: `Dropload ${index}`,
    link: streamUrl,
    type,
    subtitles: parsed.subtitles.length > 0 ? parsed.subtitles : undefined,
    headers,
  };
};
