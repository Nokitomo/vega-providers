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
