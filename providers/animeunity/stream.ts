import { ProviderContext, Stream } from "../types";

const BASE_HOST = "https://www.animeunity.so";
const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
};

function extractDownloadUrl(html: string): string | null {
  const direct = html.match(/window\.downloadUrl\s*=\s*['"]([^'"]+)['"]/);
  if (direct?.[1]) {
    return decodeEscapedValue(direct[1]);
  }
  const alt = html.match(/(https?:\/\/[^\s"'<>]+(?:mp4|m3u8)[^\s"'<>]*)/i);
  return alt?.[1] ? decodeEscapedValue(alt[1]) : null;
}

function decodeEscapedValue(value: string): string {
  return value
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code) =>
      String.fromCharCode(parseInt(code, 16))
    )
    .replace(/\\\//g, "/");
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
  let origin = "";
  let referer = "";
  try {
    const parsed = new URL(embedUrl);
    origin = parsed.origin;
    referer = embedUrl;
  } catch (_) {
    origin = "";
    referer = embedUrl;
  }
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

function extractMasterPlaylistParams(html: string): Record<string, string> {
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

  return params;
}

function extractMasterPlaylistUrl(html: string): string | null {
  const urlMatch = html.match(
    /window\.masterPlaylist\s*=\s*{[\s\S]*?url\s*:\s*['"]([^'"]+)['"]/
  );
  return urlMatch?.[1] ? decodeEscapedValue(urlMatch[1]) : null;
}

function canPlayFhd(html: string, embedUrl: string): boolean {
  if (/window\.canPlayFHD\s*=\s*true/.test(html)) {
    return true;
  }
  try {
    const parsed = new URL(embedUrl);
    return parsed.searchParams.has("canPlayFHD");
  } catch (_) {
    return false;
  }
}

function buildPlaylistUrl(
  rawUrl: string,
  embedUrl: string,
  params: Record<string, string>,
  allowFhd: boolean
): string | null {
  try {
    const playlistUrl = new URL(rawUrl, embedUrl);
    Object.entries(params).forEach(([key, value]) => {
      if (!value) {
        return;
      }
      if (!playlistUrl.searchParams.has(key)) {
        playlistUrl.searchParams.append(key, value);
      }
    });
    if (allowFhd) {
      playlistUrl.searchParams.set("h", "1");
    }
    return playlistUrl.toString();
  } catch (_) {
    return null;
  }
}

function extractVixCloudStreams(html: string, embedUrl: string): Stream[] {
  const streamsMatch = html.match(/window\.streams\s*=\s*(\[[\s\S]*?\]);/);
  const streams = streamsMatch?.[1]
    ? parseStreamsBlock(streamsMatch[1])
    : [];

  const params = extractMasterPlaylistParams(html);
  const masterUrl = extractMasterPlaylistUrl(html);
  const allowFhd = canPlayFhd(html, embedUrl);
  const streamHeaders = buildStreamHeaders(embedUrl);
  const derivedStreams: Array<{ name?: string; url?: string }> = [];

  if (masterUrl && streams.length < 2) {
    try {
      const baseUrl = new URL(masterUrl, embedUrl);
      const server1 = new URL(baseUrl.toString());
      if (!server1.searchParams.has("ub")) {
        server1.searchParams.set("ub", "1");
      }
      const server2 = new URL(baseUrl.toString());
      if (!server2.searchParams.has("ab")) {
        server2.searchParams.set("ab", "1");
      }
      derivedStreams.push(
        { name: "Server1", url: server1.toString() },
        { name: "Server2", url: server2.toString() }
      );
    } catch (_) {
      // ignore invalid base url
    }
  }

  const parsedStreams: Array<Stream | null> = [...streams, ...derivedStreams]
    .filter((stream) => stream?.url)
    .map((stream) => {
      if (!stream?.url) {
        return null;
      }
      const playlistUrl = buildPlaylistUrl(
        stream.url,
        embedUrl,
        params,
        allowFhd
      );
      if (!playlistUrl) {
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
      const downloadUrl = extractDownloadUrl(pageHtml);
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
