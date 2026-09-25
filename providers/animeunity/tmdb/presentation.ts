type ArtworkSource = {
  logo?: string;
  poster?: string;
  background?: string;
};

export function selectTmdbPreferredArtwork({
  tmdb,
  provider,
  cinemeta,
  aniZip,
}: {
  tmdb?: ArtworkSource | null;
  provider?: ArtworkSource | null;
  cinemeta?: ArtworkSource | null;
  aniZip?: ArtworkSource | null;
}): Required<ArtworkSource> {
  const poster =
    tmdb?.poster ||
    provider?.poster ||
    cinemeta?.poster ||
    aniZip?.poster ||
    "";
  const background =
    provider?.background ||
    tmdb?.background ||
    cinemeta?.background ||
    aniZip?.background ||
    poster;
  return {
    logo: tmdb?.logo || cinemeta?.logo || aniZip?.logo || provider?.logo || "",
    poster,
    background,
  };
}
