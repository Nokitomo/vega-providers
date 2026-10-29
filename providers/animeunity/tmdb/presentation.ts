import type { ArtworkSource as ArtworkSourceName } from "../../types";

type ArtworkSource = {
  logo?: string;
  poster?: string;
  background?: string;
};

export function selectTmdbPreferredArtwork({
  tmdb,
  tvdb,
  provider,
  cinemeta,
  aniZip,
}: {
  tmdb?: ArtworkSource | null;
  tvdb?: ArtworkSource | null;
  provider?: ArtworkSource | null;
  cinemeta?: ArtworkSource | null;
  aniZip?: ArtworkSource | null;
}): Required<ArtworkSource> {
  const poster =
    tmdb?.poster ||
    tvdb?.poster ||
    provider?.poster ||
    cinemeta?.poster ||
    aniZip?.poster ||
    "";
  const background =
    tmdb?.background ||
    cinemeta?.background ||
    tvdb?.background ||
    aniZip?.background ||
    provider?.background ||
    poster;
  return {
    logo:
      tmdb?.logo ||
      cinemeta?.logo ||
      tvdb?.logo ||
      aniZip?.logo ||
      provider?.logo ||
      "",
    poster,
    background,
  };
}

export function selectTmdbPreferredArtworkSources({
  tmdb, tvdb, provider, cinemeta, aniZip,
}: {
  tmdb?: ArtworkSource | null;
  tvdb?: ArtworkSource | null;
  provider?: ArtworkSource | null;
  cinemeta?: ArtworkSource | null;
  aniZip?: ArtworkSource | null;
}): Record<"logo" | "poster" | "background", ArtworkSourceName | undefined> {
  const logo = tmdb?.logo ? "tmdb" : cinemeta?.logo ? "cinemeta" :
    tvdb?.logo ? "tvdb" : aniZip?.logo ? "anizip" : provider?.logo ? "provider" : undefined;
  const poster = tmdb?.poster ? "tmdb" : tvdb?.poster ? "tvdb" :
    provider?.poster ? "provider" : cinemeta?.poster ? "cinemeta" :
    aniZip?.poster ? "anizip" : undefined;
  const background = tmdb?.background ? "tmdb" : cinemeta?.background ? "cinemeta" :
    tvdb?.background ? "tvdb" : aniZip?.background ? "anizip" :
    provider?.background ? "provider" : poster;
  return {logo, poster, background};
}
