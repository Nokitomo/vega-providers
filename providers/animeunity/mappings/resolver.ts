import { ExternalIdMapping, Info, ProviderContext } from "../../types";
import { getAniBridgeIndex, findAniBridgeSourceRecords } from "./anibridge";
import { resolveLegacyImdbId } from "./legacyImdb";
import {
  AniBridgeIds,
  AniBridgeTarget,
  AnimeMappingResolution,
} from "./types";

function emptyIds(): AniBridgeIds {
  return {
    anidbIds: [],
    anilistIds: [],
    imdbMovieIds: [],
    imdbShowIds: [],
    malIds: [],
    tmdbMovieIds: [],
    tmdbShowIds: [],
    tvdbMovieIds: [],
    tvdbShowIds: [],
  };
}

function addNumericId(target: number[], value: string) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed > 0 && !target.includes(parsed)) {
    target.push(parsed);
  }
}

function addTargetId(ids: AniBridgeIds, target: AniBridgeTarget) {
  switch (target.provider) {
    case "anidb":
      addNumericId(ids.anidbIds, target.id);
      break;
    case "anilist":
      addNumericId(ids.anilistIds, target.id);
      break;
    case "imdb_movie":
      if (!ids.imdbMovieIds.includes(target.id)) ids.imdbMovieIds.push(target.id);
      break;
    case "imdb_show":
      if (!ids.imdbShowIds.includes(target.id)) ids.imdbShowIds.push(target.id);
      break;
    case "mal":
      addNumericId(ids.malIds, target.id);
      break;
    case "tmdb_movie":
      addNumericId(ids.tmdbMovieIds, target.id);
      break;
    case "tmdb_show":
      addNumericId(ids.tmdbShowIds, target.id);
      break;
    case "tvdb_movie":
      addNumericId(ids.tvdbMovieIds, target.id);
      break;
    case "tvdb_show":
      addNumericId(ids.tvdbShowIds, target.id);
      break;
  }
}

function mergeTargets(targets: AniBridgeTarget[]): AniBridgeTarget[] {
  const merged = new Map<string, AniBridgeTarget>();
  targets.forEach((target) => {
    const key = `${target.provider}:${target.id}:${target.scope || ""}`;
    const current = merged.get(key);
    if (current) {
      current.ranges = { ...current.ranges, ...target.ranges };
      return;
    }
    merged.set(key, { ...target, ranges: { ...target.ranges } });
  });
  return Array.from(merged.values()).sort((left, right) =>
    left.raw.localeCompare(right.raw)
  );
}

export async function resolveAnimeMappings({
  providerContext,
  anilistId,
  malId,
  isMovie,
  includeLegacyImdb = true,
}: {
  providerContext: ProviderContext;
  anilistId?: number;
  malId?: number;
  isMovie: boolean;
  includeLegacyImdb?: boolean;
}): Promise<AnimeMappingResolution> {
  const normalizedAnilistId =
    Number.isFinite(anilistId) && Number(anilistId) > 0
      ? Math.trunc(Number(anilistId))
      : undefined;
  const normalizedMalId =
    Number.isFinite(malId) && Number(malId) > 0
      ? Math.trunc(Number(malId))
      : undefined;
  if (!normalizedAnilistId && !normalizedMalId) {
    return {
      sourceDescriptors: [],
      targets: [],
      ids: emptyIds(),
    };
  }

  const index = await getAniBridgeIndex(providerContext);
  const records = index
    ? findAniBridgeSourceRecords(index, normalizedAnilistId, normalizedMalId)
    : [];
  const targets = mergeTargets(records.flatMap((record) => record.targets));
  const ids = emptyIds();
  if (normalizedAnilistId) ids.anilistIds.push(normalizedAnilistId);
  if (normalizedMalId) ids.malIds.push(normalizedMalId);
  targets.forEach((target) => addTargetId(ids, target));
  Object.values(ids).forEach((values) =>
    values.sort((a: any, b: any) =>
      typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a).localeCompare(String(b))
    )
  );

  const mappedImdbIds = isMovie ? ids.imdbMovieIds : ids.imdbShowIds;
  let imdbId: string | undefined = mappedImdbIds[0];
  let imdbSource: AnimeMappingResolution["imdbSource"] = imdbId
    ? "anibridge-v3"
    : undefined;

  if (!imdbId && includeLegacyImdb) {
    imdbId = await resolveLegacyImdbId({
      providerContext,
      anilistId: normalizedAnilistId,
      malId: normalizedMalId,
    });
    if (imdbId) imdbSource = "plexanibridge-v2";
  }

  return {
    schemaVersion: index?.schemaVersion,
    generatedOn: index?.generatedOn,
    sourceDescriptors: records.map((record) => record.sourceDescriptor),
    targets,
    ids,
    imdbId,
    imdbSource,
  };
}

export function buildAniBridgeExtra(
  resolution: AnimeMappingResolution
): Pick<NonNullable<Info["extra"]>, "ids" | "mappings"> {
  const targets: ExternalIdMapping[] = resolution.targets.map((target) => ({
    provider: target.provider,
    id: target.id,
    scope: target.scope,
    ranges:
      Object.keys(target.ranges).length > 0 ? { ...target.ranges } : undefined,
  }));

  return {
    ids: {
      anilistIds: resolution.ids.anilistIds,
      malIds: resolution.ids.malIds,
      anidbIds: resolution.ids.anidbIds,
      imdbMovieIds: resolution.ids.imdbMovieIds,
      imdbShowIds: resolution.ids.imdbShowIds,
      tmdbMovieIds: resolution.ids.tmdbMovieIds,
      tmdbShowIds: resolution.ids.tmdbShowIds,
      tvdbMovieIds: resolution.ids.tvdbMovieIds,
      tvdbShowIds: resolution.ids.tvdbShowIds,
    },
    mappings: resolution.schemaVersion
      ? {
          source: "anibridge-v3",
          schemaVersion: resolution.schemaVersion,
          generatedOn: resolution.generatedOn,
          sourceDescriptors: resolution.sourceDescriptors,
          imdbSource: resolution.imdbSource,
          targets,
        }
      : undefined,
  };
}
