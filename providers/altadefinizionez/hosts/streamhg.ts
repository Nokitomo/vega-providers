import { ProviderContext, Stream } from "../../types";
import { MOSTRAGUARDA_BASE, REQUEST_TIMEOUT } from "../utils/constants";
import { attachUserAgentHeader } from "../utils/headers";
import { unpackPacker } from "../utils/packer";
import {
  buildStreamHgRedirectUrl,
  extractDirectMediaCandidates,
} from "../utils/streamhg";

export const extractStreamHgData = async ({
  html,
  pageUrl,
  providerContext,
  signal,
}: {
  html: string;
  pageUrl: string;
  providerContext: ProviderContext;
  signal: AbortSignal;
}): Promise<string> => {
  const decoded = unpackPacker(html);
  const directInDecoded = extractDirectMediaCandidates(decoded, pageUrl);
  if (directInDecoded.length > 0) return directInDecoded[0];

  const directInHtml = extractDirectMediaCandidates(html, pageUrl);
  if (directInHtml.length > 0) return directInHtml[0];

  const { axios, cheerio, commonHeaders } = providerContext;
  const $ = cheerio.load(html || "");
  const scriptSources = $("script[src]")
    .map((_index, element) => $(element).attr("src") || "")
    .get()
    .filter(Boolean)
    .map((src) => new URL(src, pageUrl).href);

  for (const scriptUrl of scriptSources.slice(0, 6)) {
    try {
      const scriptRes = await axios.get(scriptUrl, {
        headers: {
          ...commonHeaders,
          Referer: pageUrl,
        },
        timeout: REQUEST_TIMEOUT,
        signal,
      });
      const scriptText = String(scriptRes.data || "");
      const decodedScript = unpackPacker(scriptText);
      const directInDecodedScript = extractDirectMediaCandidates(
        decodedScript,
        pageUrl
      );
      if (directInDecodedScript.length > 0) {
        return directInDecodedScript[0];
      }
      const directInScript = extractDirectMediaCandidates(scriptText, pageUrl);
      if (directInScript.length > 0) {
        return directInScript[0];
      }
    } catch (_) {
      // best effort: try next script
    }
  }

  return "";
};

export const resolveStreamHgStream = async ({
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

  const streamHgOrigin = new URL(normalizedUrl).origin;
  const streamUrl = await extractStreamHgData({
    html: String(res.data || ""),
    pageUrl: normalizedUrl,
    providerContext,
    signal,
  });
  let resolvedStreamUrl = streamUrl;
  const redirectedUrl = buildStreamHgRedirectUrl(normalizedUrl);
  if (!resolvedStreamUrl && redirectedUrl) {
    try {
      const redirectedRes = await axios.get(redirectedUrl, {
        headers: {
          ...commonHeaders,
          Referer: normalizedUrl,
        },
        timeout: REQUEST_TIMEOUT,
        signal,
      });
      resolvedStreamUrl = await extractStreamHgData({
        html: String(redirectedRes.data || ""),
        pageUrl: redirectedUrl,
        providerContext,
        signal,
      });
    } catch (_) {
      // best effort: ignore redirected extraction failures
    }
  }

  if (!resolvedStreamUrl) {
    return null;
  }

  const type = resolvedStreamUrl.toLowerCase().includes(".m3u8") ? "m3u8" : "mp4";
  const resolvedOrigin = (() => {
    try {
      return new URL(resolvedStreamUrl).origin;
    } catch (_) {
      return streamHgOrigin;
    }
  })();
  const refererBase = redirectedUrl || normalizedUrl;
  const headers: Record<string, string> = {
    Referer: `${refererBase}`,
    Origin: resolvedOrigin,
  };
  attachUserAgentHeader(headers, commonHeaders);

  return {
    server: `StreamHG ${index}`,
    link: resolvedStreamUrl,
    type,
    headers,
  };
};
