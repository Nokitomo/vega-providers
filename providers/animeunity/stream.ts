import { ProviderContext, Stream } from "../types";
import {
  buildStreamHeaders,
  extractDownloadUrl,
  extractFirstUrl,
  extractVixCloudStreams,
  normalizeUrl,
} from "./parsers/stream";

const BASE_HOST = "https://www.animeunity.so";
const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
};

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

    if (!embedUrl || !embedUrl.startsWith("http")) {
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
    if (embedUrl.includes("vixcloud.co")) {
      const streams = extractVixCloudStreams(
        pageHtml,
        embedUrl,
        DEFAULT_HEADERS["User-Agent"]
      );
      const downloadUrl = extractDownloadUrl(pageHtml);
      if (downloadUrl) {
        const type = downloadUrl.toLowerCase().includes(".m3u8")
          ? "m3u8"
          : "mp4";
        const streamHeaders = buildStreamHeaders(
          embedUrl,
          DEFAULT_HEADERS["User-Agent"]
        );
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
    const streamHeaders = buildStreamHeaders(
      embedUrl,
      DEFAULT_HEADERS["User-Agent"]
    );
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
