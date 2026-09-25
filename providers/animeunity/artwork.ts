import { parseAniZipMetadata } from "./anizip/parser";

export { resolveAniZipArtwork } from "./anizip/artworkResolver";
export type { AnimeUnityArtwork } from "./anizip/artworkResolver";

// Kept as a compatibility export for the provider test suite and old consumers.
export const parseAniZipArtwork = (payload: any) => {
  const metadata = parseAniZipMetadata(payload);
  return {
    imdbId: metadata.imdbId,
    logo: metadata.artwork.logo,
    poster: metadata.artwork.poster,
    background: metadata.artwork.fanart || metadata.artwork.banner,
  };
};
