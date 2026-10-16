import { ProviderContext } from "../types";
import { resolveAniZipArtwork } from "./artwork";
import { resolveAnimeUnityCinemetaMetadata } from "./cinemeta";
import { resolveAnimeTmdbMetadata } from "./tmdb";
import { resolveTvdbArtworkMetadata } from "./tvdb";
import { resolveAnimeMappings } from "./mappings";

type MappingResolution = Awaited<ReturnType<typeof resolveAnimeMappings>>;
type TvdbTarget = {
  id: number;
  mediaType: "series" | "movie";
  seasonNumber?: number;
} | null;

export const selectUnfailedLogo = (
  url: string | undefined,
  failedUrls: readonly string[],
): string | undefined => {
  const normalized = String(url || "").trim();
  return /^https:\/\//i.test(normalized) &&
    normalized.length <= 2048 &&
    !failedUrls.includes(normalized)
    ? normalized
    : undefined;
};

/** Resolve only the next logo after an actual image-load failure. */
export async function resolveAnimeLogoFallback({
  providerContext,
  mappingResolution,
  anilistId,
  malId,
  isMovie,
  tvdbTarget,
  failedUrls,
}: {
  providerContext: ProviderContext;
  mappingResolution: MappingResolution;
  anilistId?: number;
  malId?: number;
  isMovie: boolean;
  tvdbTarget: TvdbTarget;
  failedUrls: readonly string[];
}): Promise<string | undefined> {
  const tmdb = await resolveAnimeTmdbMetadata({
    providerContext,
    mappingResolution,
    isMovie,
    fields: ["logo"],
  });
  const tmdbLogo = selectUnfailedLogo(tmdb?.logo, failedUrls);
  if (tmdbLogo) return tmdbLogo;

  let aniZip: Awaited<ReturnType<typeof resolveAniZipArtwork>> | undefined;
  let imdbId = mappingResolution.imdbId || "";
  if (!imdbId) {
    aniZip = await resolveAniZipArtwork({
      providerContext,
      anilistId,
      malId,
    });
    imdbId = aniZip.imdbId || "";
  }
  const cinemeta = await resolveAnimeUnityCinemetaMetadata({
    providerContext,
    imdbId,
    isMovie,
  });
  const cinemetaLogo = selectUnfailedLogo(cinemeta.logo, failedUrls);
  if (cinemetaLogo) return cinemetaLogo;

  if (tvdbTarget) {
    const tvdb = await resolveTvdbArtworkMetadata({
      providerContext,
      tvdbId: tvdbTarget.id,
      mediaType: tvdbTarget.mediaType,
      seasonNumber: tvdbTarget.seasonNumber,
      fields: ["logo"],
    });
    const tvdbLogo = selectUnfailedLogo(tvdb?.logo, failedUrls);
    if (tvdbLogo) return tvdbLogo;
  }

  aniZip ||= await resolveAniZipArtwork({
    providerContext,
    anilistId,
    malId,
  });
  return selectUnfailedLogo(aniZip.logo, failedUrls);
}
