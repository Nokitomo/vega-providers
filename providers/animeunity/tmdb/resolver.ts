import { ProviderContext } from "../../types";
import { AnimeMappingResolution } from "../mappings";
import { parseSeasonScope } from "../mappings";
import { resolveTmdbArtworkMetadata } from "./artworkResolver";
import { resolveTmdbSeasonPoster } from "./seasonArtworkResolver";
import {
  TmdbArtworkField,
  TmdbArtworkMetadata,
  TmdbImageSize,
  TmdbMediaType,
} from "./types";

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

export function selectPrimaryTmdbTarget(
  resolution: AnimeMappingResolution,
  isMovie: boolean
): { id: number; type: TmdbMediaType; seasonNumber?: number } | null {
  const selected = selectPrimaryTmdbId(resolution, isMovie);
  if (!selected || selected.type === "movie") return selected;

  const matchingTargets = resolution.targets.filter(
    (target) => target.provider === "tmdb_show" && target.id === String(selected.id)
  );
  const seasons = matchingTargets.map((target) => parseSeasonScope(target.scope));
  const scopedSeasons = Array.from(
    new Set(seasons.filter((season): season is number => season != null))
  );
  const isUnambiguous =
    matchingTargets.length > 0 &&
    seasons.every((season) => season != null) &&
    scopedSeasons.length === 1;

  return isUnambiguous
    ? { ...selected, seasonNumber: scopedSeasons[0] }
    : selected;
}

export async function resolveAnimeTmdbMetadata({
  providerContext,
  mappingResolution,
  isMovie,
  fields,
  imageSize,
}: {
  providerContext: ProviderContext;
  mappingResolution: AnimeMappingResolution;
  isMovie: boolean;
  fields?: TmdbArtworkField[];
  imageSize?: TmdbImageSize;
}): Promise<TmdbArtworkMetadata | null> {
  const target = selectPrimaryTmdbTarget(mappingResolution, isMovie);
  if (!target) return null;

  const requestedFields = Array.from(
    new Set(fields || (["logo", "poster", "background"] as TmdbArtworkField[]))
  );
  if (target.type !== "tv" || target.seasonNumber == null) {
    return resolveTmdbArtworkMetadata({
      providerContext,
      id: target.id,
      type: target.type,
      fields: requestedFields,
      imageSize,
    });
  }

  const generalFields = requestedFields.filter((field) => field !== "poster");
  const [seasonArtwork, generalArtwork] = await Promise.all([
    requestedFields.includes("poster")
      ? resolveTmdbSeasonPoster({
          providerContext,
          mediaId: target.id,
          seasonNumber: target.seasonNumber,
          imageSize,
        })
      : null,
    generalFields.length > 0
      ? resolveTmdbArtworkMetadata({
          providerContext,
          id: target.id,
          type: target.type,
          fields: generalFields,
          imageSize,
        })
      : null,
  ]);

  let poster = seasonArtwork?.poster;
  let generalPoster: TmdbArtworkMetadata | null = null;
  if (requestedFields.includes("poster") && !poster) {
    generalPoster = await resolveTmdbArtworkMetadata({
      providerContext,
      id: target.id,
      type: target.type,
      fields: ["poster"],
      imageSize,
    });
    poster = generalPoster?.poster;
  }

  const base = generalArtwork || seasonArtwork || generalPoster;
  return base
    ? {
        ...base,
        seasonNumber: target.seasonNumber,
        logo: generalArtwork?.logo,
        poster,
        background: generalArtwork?.background,
      }
    : null;
}
