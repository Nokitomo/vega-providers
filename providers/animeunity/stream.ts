import { ProviderContext, Stream } from "../types";

const BASE_HOST = "https://www.animeunity.so";
const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
};

function extractDownloadUrl(html: string): string | null {
  const direct = html.match(/window\.downloadUrl\s*=\s*'([^']+)'/);
  if (direct?.[1]) {
    return direct[1];
  }
  const alt = html.match(/(https?:\/\/[^\s"'<>]+(?:mp4|m3u8)[^\s"'<>]*)/i);
  return alt?.[1] || null;
}

function buildStreamHeaders(embedUrl: string): Record<string, string> {
  let origin = "";
  try {
    origin = new URL(embedUrl).origin;
  } catch (_) {
    origin = "";
  }
  return {
    Accept: "*/*",
    "User-Agent": DEFAULT_HEADERS["User-Agent"],
    Referer: embedUrl,
    ...(origin ? { Origin: origin } : {}),
  };
}

function extractVixCloudStreams(html: string, embedUrl: string): Stream[] {
  const streamsMatch = html.match(/window\.streams\s*=\s*(\[[\s\S]*?\]);/);
  if (!streamsMatch?.[1]) {
    return [];
  }

  let streams: Array<{ name?: string; url?: string }> = [];
  try {
    streams = JSON.parse(streamsMatch[1]);
  } catch (_) {
    return [];
  }

  const tokenMatch = html.match(/['"]token['"]\s*:\s*'([^']*)'/);
  const expiresMatch = html.match(/['"]expires['"]\s*:\s*'([^']*)'/);
  const asnMatch = html.match(/['"]asn['"]\s*:\s*'([^']*)'/);

  const streamHeaders = buildStreamHeaders(embedUrl);
  const parsedStreams: Array<Stream | null> = streams.map((stream) => {
    if (!stream?.url) {
      return null;
    }
    try {
      const playlistUrl = new URL(stream.url);
      if (tokenMatch?.[1]) {
        playlistUrl.searchParams.append("token", tokenMatch[1]);
      }
      if (expiresMatch?.[1]) {
        playlistUrl.searchParams.append("expires", expiresMatch[1]);
      }
      if (asnMatch?.[1]) {
        playlistUrl.searchParams.append("asn", asnMatch[1]);
      }
      return {
        server: stream.name ? `AnimeUnity ${stream.name}` : "AnimeUnity",
        link: playlistUrl.toString(),
        type: "m3u8",
        headers: streamHeaders,
      };
    } catch (_) {
      return null;
    }
  });

  return parsedStreams.filter((stream): stream is Stream => !!stream);
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
    const embedUrl =
      (location && location.startsWith("http") && location) ||
      (typeof embedRes.data === "string" ? embedRes.data.trim() : "");

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
      const streams = extractVixCloudStreams(pageHtml, embedUrl);
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
