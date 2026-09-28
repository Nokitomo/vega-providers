import {ProviderContext, Stream} from "../types";

type TorrentioStream = {
  name?: string;
  title?: string;
  url?: string;
  infoHash?: string;
  fileIdx?: number;
};

type TorrentioConfig = {
  baseUrl: string;
  debridService: string;
  debridApiKey: string;
  qualityFilter: string;
  sortBy: string;
  includeP2PFallback: boolean;
};

const readConfig = async (providerContext: ProviderContext): Promise<TorrentioConfig> => {
  const kv = providerContext.kvStore;
  const baseUrl = String(
    (await kv.get<string>("customInstanceUrl")) || "https://torrentio.strem.fun",
  )
    .trim()
    .replace(/\/+$/, "");
  return {
    baseUrl,
    debridService: (await kv.get<string>("debridService")) || "none",
    debridApiKey: String((await kv.get<string>("debridApiKey")) || "").trim(),
    qualityFilter: (await kv.get<string>("qualityFilter")) || "all",
    sortBy: (await kv.get<string>("sortBy")) || "qualitythenseeders",
    includeP2PFallback: (await kv.get<boolean>("includeP2PFallback")) ?? true,
  };
};

const parseWatchLink = (link: string, fallbackType: string) => {
  const match = link.match(/\/watch\/(movie|series)\/(tt\d+)(?:\/(\d+)\/(\d+))?/i);
  if (match) {
    return {
      type: match[1].toLowerCase(),
      imdbId: match[2],
      season: match[3] || "",
      episode: match[4] || "",
    };
  }
  const imdbId = link.match(/tt\d+/i)?.[0] || "";
  return {type: fallbackType || "movie", imdbId, season: "", episode: ""};
};

const qualityFrom = (value: string): Stream["quality"] => {
  const normalized = value.toLowerCase();
  const hasToken = (token: string) =>
    new RegExp(`(?:^|[\\s.()[\\]_-])${token}(?:p)?(?:$|[\\s.()[\\]_-])`, "i").test(
      normalized,
    );
  if (hasToken("2160") || hasToken("4k")) return "2160";
  if (hasToken("1080")) return "1080";
  if (hasToken("720")) return "720";
  if (hasToken("480")) return "480";
  if (hasToken("360")) return "360";
  return undefined;
};

const qualityAllowed = (quality: Stream["quality"], maximum: string) => {
  if (!quality || maximum === "all" || maximum === "2160") return true;
  const rank: Record<string, number> = {"360": 360, "480": 480, "720": 720, "1080": 1080, "2160": 2160};
  return (rank[quality] || 0) <= (rank[maximum] || 2160);
};

const magnetLink = (stream: TorrentioStream) => {
  if (!stream.infoHash) return undefined;
  const params = [
    `xt=urn:btih:${encodeURIComponent(stream.infoHash)}`,
    stream.title ? `dn=${encodeURIComponent(stream.title.split("\n")[0])}` : "",
    Number.isInteger(stream.fileIdx) ? `so=${stream.fileIdx}` : "",
  ].filter(Boolean);
  return `magnet:?${params.join("&")}`;
};

const languageLabel = (value: string) => {
  const upper = value.toUpperCase();
  if (upper.includes("ITALIAN") || upper.includes("🇮🇹")) return "IT";
  if (upper.includes("MULTI")) return "MULTI";
  if (upper.includes("ENGLISH") || upper.includes("🇬🇧") || upper.includes("🇺🇸")) return "EN";
  return "";
};

export const getStream = async function ({
  link,
  type,
  signal,
  providerContext,
}: {
  link: string;
  type: string;
  signal?: AbortSignal;
  providerContext: ProviderContext;
}): Promise<Stream[]> {
  const request = parseWatchLink(link, type);
  if (!request.imdbId) throw new Error("Torrentio stream link does not contain an IMDb ID");
  const config = await readConfig(providerContext);
  const options: string[] = [];
  if (config.sortBy && config.sortBy !== "qualitythenseeders") {
    options.push(`sort=${encodeURIComponent(config.sortBy)}`);
  }
  if (
    config.debridService !== "none" &&
    /^[a-z0-9]+$/i.test(config.debridService) &&
    config.debridApiKey
  ) {
    options.push(
      `${config.debridService}=${encodeURIComponent(config.debridApiKey)}`,
    );
  }
  const optionPath = options.length ? `${options.join("|")}/` : "";
  const itemId =
    request.type === "series" && request.season && request.episode
      ? `${request.imdbId}:${request.season}:${request.episode}`
      : request.imdbId;
  const response = await providerContext.axios.get(
    `${config.baseUrl}/${optionPath}stream/${request.type}/${itemId}.json`,
    {signal, timeout: 15000},
  );

  return ((response.data?.streams || []) as TorrentioStream[])
    .map((item): Stream | undefined => {
      const combinedTitle = `${item.name || ""} ${item.title || ""}`.trim();
      const quality = qualityFrom(combinedTitle);
      if (!qualityAllowed(quality, config.qualityFilter)) return undefined;
      const direct = String(item.url || "").trim();
      const linkValue = direct || magnetLink(item);
      if (!linkValue) return undefined;
      const isTorrent = linkValue.startsWith("magnet:");
      if (isTorrent && !config.includeP2PFallback) return undefined;
      const language = languageLabel(combinedTitle);
      const size = item.title?.match(/💾\s*([\d.]+\s*(?:KB|MB|GB|TB))/i)?.[1];
      const seeders = item.title?.match(/(?:👤|S:)\s*(\d+)/i)?.[1];
      const labels = [item.name || "Torrentio", language, seeders ? `S:${seeders}` : "", size || ""]
        .filter(Boolean)
        .join(" • ");
      return {
        server: labels,
        link: linkValue,
        type: isTorrent ? "torrent" : /\.m3u8(?:$|\?)/i.test(linkValue) ? "m3u8" : "mp4",
        quality,
      };
    })
    .filter((stream): stream is Stream => Boolean(stream));
};
