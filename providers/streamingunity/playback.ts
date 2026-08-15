import { extractTitleId } from "./utils";

const PLAYBACK_MARKER = "vixsrc=";
const DEFAULT_VIXSRC_BASE_URL = "https://vixsrc.to";

export type StreamingUnityPlayback = {
  titleId: string;
  episodeId?: string;
  mediaType?: "movie" | "series";
  imdbId?: string;
  tmdbId?: string;
  seasonNumber?: number;
  episodeNumber?: number;
};

const normalizeId = (value: unknown): string => String(value || "").trim();

const normalizePositiveNumber = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
};

export const buildStreamingUnityPlaybackLink = (
  baseLink: string,
  playback: Omit<StreamingUnityPlayback, "titleId">
): string => {
  const episodeId = normalizeId(playback.episodeId);
  const legacyLink = episodeId ? `${baseLink}::${episodeId}` : baseLink;
  const imdbId = normalizeId(playback.imdbId);
  const tmdbId = normalizeId(playback.tmdbId);
  if (!imdbId && !tmdbId) return legacyLink;

  const params = new URLSearchParams();
  if (playback.mediaType) params.set("m", playback.mediaType);
  if (imdbId) params.set("i", imdbId);
  if (tmdbId) params.set("t", tmdbId);

  const seasonNumber = normalizePositiveNumber(playback.seasonNumber);
  const episodeNumber = normalizePositiveNumber(playback.episodeNumber);
  if (seasonNumber) params.set("s", String(seasonNumber));
  if (episodeNumber) params.set("e", String(episodeNumber));

  return `${baseLink}::${episodeId}::${PLAYBACK_MARKER}${encodeURIComponent(
    params.toString()
  )}`;
};

export const parseStreamingUnityPlaybackLink = (
  link: string
): StreamingUnityPlayback => {
  const parts = String(link || "").split("::");
  const baseLink = parts[0] || "";
  const episodeId = normalizeId(parts[1]);
  const encodedMetadata = parts
    .slice(2)
    .find((part) => part.startsWith(PLAYBACK_MARKER));
  const output: StreamingUnityPlayback = {
    titleId: extractTitleId(baseLink),
    episodeId: episodeId || undefined,
  };
  if (!encodedMetadata) return output;

  try {
    const rawParams = decodeURIComponent(
      encodedMetadata.slice(PLAYBACK_MARKER.length)
    );
    const params = new URLSearchParams(rawParams);
    const mediaType = params.get("m");
    if (mediaType === "movie" || mediaType === "series") {
      output.mediaType = mediaType;
    }
    output.imdbId = normalizeId(params.get("i")) || undefined;
    output.tmdbId = normalizeId(params.get("t")) || undefined;
    output.seasonNumber = normalizePositiveNumber(params.get("s"));
    output.episodeNumber = normalizePositiveNumber(params.get("e"));
  } catch (_) {
    return output;
  }

  return output;
};

export const buildStreamingUnityVixsrcUrl = (
  playback: StreamingUnityPlayback,
  baseUrl: string = DEFAULT_VIXSRC_BASE_URL
): string => {
  const externalId = normalizeId(playback.imdbId) || normalizeId(playback.tmdbId);
  if (!externalId) return "";

  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  if (playback.mediaType === "series" || playback.episodeId) {
    const seasonNumber = normalizePositiveNumber(playback.seasonNumber);
    const episodeNumber = normalizePositiveNumber(playback.episodeNumber);
    if (!seasonNumber || !episodeNumber) return "";
    return `${normalizedBaseUrl}/tv/${encodeURIComponent(
      externalId
    )}/${seasonNumber}/${episodeNumber}`;
  }

  return `${normalizedBaseUrl}/movie/${encodeURIComponent(externalId)}`;
};
