import { ProviderContext } from "../../types";
import { AnimeMappingResolution } from "../mappings";
import { resolveTmdbMediaMetadata } from "./client";
import { TmdbMediaMetadata, TmdbMediaType } from "./types";

function selectPrimaryShowId(
  resolution: AnimeMappingResolution
): number | undefined {
  const scores = new Map<string, number>();
  resolution.targets.forEach((target) => {
    if (target.provider !== "tmdb_show") return;
    scores.set(
      target.id,
      (scores.get(target.id) || 0) + Object.keys(target.ranges).length
    );
  });
  const selected = Array.from(scores.entries()).sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
  )[0]?.[0];
  const id = Number.parseInt(selected || "", 10);
  return Number.isFinite(id) && id > 0 ? id : undefined;
}

export function selectPrimaryTmdbId(
  resolution: AnimeMappingResolution,
  isMovie: boolean
): { id: number; type: TmdbMediaType } | null {
  const id = isMovie
    ? resolution.ids.tmdbMovieIds[0]
    : selectPrimaryShowId(resolution) || resolution.ids.tmdbShowIds[0];
  return id ? { id, type: isMovie ? "movie" : "tv" } : null;
}

export async function resolveAnimeTmdbMetadata({
  providerContext,
  mappingResolution,
  isMovie,
}: {
  providerContext: ProviderContext;
  mappingResolution: AnimeMappingResolution;
  isMovie: boolean;
}): Promise<TmdbMediaMetadata | null> {
  const target = selectPrimaryTmdbId(mappingResolution, isMovie);
  return target
    ? resolveTmdbMediaMetadata({ providerContext, ...target })
    : null;
}
