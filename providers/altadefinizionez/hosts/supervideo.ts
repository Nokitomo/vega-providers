import { ProviderContext, Stream, TextTracks } from "../../types";
import { MOSTRAGUARDA_BASE, REQUEST_TIMEOUT } from "../utils/constants";
import { parseTracksFromDecoded } from "../utils/subtitles";

const decodeSuperVideo = (html: string): string => {
  const functionRegex =
    /eval\(function\((.*?)\)\{.*?return p\}.*?\('(.*?)'\.split/;
  const match = functionRegex.exec(html);
  let decoded = "";
  if (!match) return decoded;
  const encodedString = match[2];
  decoded = encodedString.split("',36,")?.[0].trim();
  const tail = encodedString.split("',36,")[1];
  if (!tail) return decoded;
  const base = 36;
  let count = tail.slice(2).split("|").length;
  const dictionary = tail.slice(2).split("|");
  while (count--) {
    if (dictionary[count]) {
      const regex = new RegExp("\\b" + count.toString(base) + "\\b", "g");
      decoded = decoded.replace(regex, dictionary[count]);
    }
  }
  return decoded;
};

export const extractSuperVideoData = (
  html: string,
  baseUrl?: string
): {
  streamUrl: string;
  subtitles: TextTracks;
} => {
  const decoded = decodeSuperVideo(html);
  const streamUrl = decoded.match(/file:\s*"([^"]+\.m3u8[^"]*)"/i)?.[1] || "";
  const subtitles = parseTracksFromDecoded(decoded, baseUrl);
  return { streamUrl, subtitles };
};

export const resolveSuperVideoStream = async ({
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
  const { axios, extractors, commonHeaders } = providerContext;
  const res = await axios.get(normalizedUrl, {
    headers: {
      ...commonHeaders,
      Referer: `${MOSTRAGUARDA_BASE}/`,
    },
    timeout: REQUEST_TIMEOUT,
    signal,
  });

  const parsed = extractSuperVideoData(res.data || "", new URL(normalizedUrl).origin);
  const streamUrl = parsed.streamUrl || (await extractors.superVideoExtractor(res.data));
  if (!streamUrl) {
    return null;
  }

  return {
    server: `SuperVideo ${index}`,
    link: streamUrl,
    type: "m3u8",
    subtitles: parsed.subtitles.length > 0 ? parsed.subtitles : undefined,
  };
};
