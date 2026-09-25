import { ProviderContext } from "../../types";
import { resolveAniZipMetadata } from "./client";

export type AnimeUnityArtwork = {
  imdbId?: string;
  logo?: string;
  poster?: string;
  fanart?: string;
  banner?: string;
  background?: string;
};

export async function resolveAniZipArtwork({
  providerContext,
  anilistId,
  malId,
}: {
  providerContext: ProviderContext;
  anilistId?: number;
  malId?: number;
}): Promise<AnimeUnityArtwork> {
  const metadata = await resolveAniZipMetadata({
    providerContext,
    anilistId,
    malId,
  });
  return {
    imdbId: metadata.imdbId,
    logo: metadata.artwork.logo,
    poster: metadata.artwork.poster,
    fanart: metadata.artwork.fanart,
    banner: metadata.artwork.banner,
    background: metadata.artwork.fanart || metadata.artwork.banner,
  };
}
