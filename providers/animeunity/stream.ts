import { ProviderContext, Stream } from "../types";
import { BASE_HOST, DEFAULT_HEADERS } from "./utils";

function extractDownloadUrl(html: string): string | null {
  const direct = html.match(/window\.downloadUrl\s*=\s*'([^']+)'/);
  if (direct?.[1]) {
    return direct[1];
  }
  const alt = html.match(/(https?:\/\/[^\s"'<>]+(?:mp4|m3u8)[^\s"'<>]*)/i);
  return alt?.[1] || null;
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

    const url = extractDownloadUrl(pageRes.data || "");
    if (!url) {
      return [];
    }

    const type = url.toLowerCase().includes(".m3u8") ? "m3u8" : "mp4";
    return [
      {
        server: "AnimeUnity",
        link: url,
        type,
      },
    ];
  } catch (err) {
    console.error("animeunity stream error", err);
    return [];
  }
};
