import { AniZipArtwork, AniZipEpisode, AniZipMetadata } from "./types";

function normalizeHttpsUrl(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return /^https:\/\//i.test(text) && text.length <= 2048 ? text : undefined;
}

function isTvdbIconUrl(value?: string): boolean {
  try {
    return /(?:^|\/)icons(?:\/|$)/i.test(new URL(value || "").pathname);
  } catch {
    return false;
  }
}

function normalizeText(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function normalizePositiveNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function normalizeImdbId(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^tt\d{5,}$/.test(text) ? text : undefined;
}

export function parseAniZipArtwork(payload: any): AniZipArtwork {
  const images = Array.isArray(payload?.images) ? payload.images : [];
  const findImage = (type: string): string | undefined => {
    const match = images.find(
      (image: any) =>
        String(image?.coverType || "").trim().toLowerCase() ===
        type.toLowerCase()
    );
    return normalizeHttpsUrl(match?.url);
  };

  return {
    logo:
      [findImage("Clearlogo"), findImage("Clear Logo"), findImage("Logo")].find(
        (url) => !!url && !isTvdbIconUrl(url)
      ),
    poster: findImage("Poster"),
    fanart: findImage("Fanart"),
    banner: findImage("Banner"),
  };
}

function parseAniZipEpisode(value: any): AniZipEpisode | null {
  const episodeNumber = normalizePositiveNumber(value?.episodeNumber);
  const absoluteEpisodeNumber = normalizePositiveNumber(
    value?.absoluteEpisodeNumber
  );
  if (episodeNumber == null && absoluteEpisodeNumber == null) return null;

  return {
    tvdbShowId: normalizePositiveNumber(value?.tvdbShowId),
    seasonNumber: normalizePositiveNumber(value?.seasonNumber),
    episodeNumber,
    absoluteEpisodeNumber,
    titleIt: normalizeText(value?.title?.it),
    titleEn: normalizeText(value?.title?.en),
    overview: normalizeText(value?.overview),
    image: normalizeHttpsUrl(value?.image),
  };
}

export function parseAniZipMetadata(payload: any): AniZipMetadata {
  const episodes = Object.values(payload?.episodes || {})
    .map(parseAniZipEpisode)
    .filter((episode): episode is AniZipEpisode => episode != null);

  return {
    imdbId: normalizeImdbId(payload?.mappings?.imdb_id),
    artwork: parseAniZipArtwork(payload),
    episodes,
  };
}
