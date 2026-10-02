import { ExternalIdMapping, Info, ProviderContext } from "../../types";
import { resolveAniZipMetadata } from "../anizip/client";
import {
  getAniBridgeIndex,
  findAniBridgeRecordsByDescriptors,
  findAniBridgeSourceRecords,
} from "./anibridge";
import { resolveLegacyImdbId } from "./legacyImdb";
import {
  AniBridgeDescriptor,
  AniBridgeIds,
  AniBridgeTarget,
  AnimeMappingResolution,
} from "./types";
import { parseAniBridgeDescriptor } from "./descriptors";

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
      if (!ids.imdbMovieIds.includes(target.id))
        ids.imdbMovieIds.push(target.id);
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

function addDescriptorId(ids: AniBridgeIds, descriptor: AniBridgeDescriptor) {
  addTargetId(ids, { ...descriptor, ranges: {} });
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
    left.raw.localeCompare(right.raw),
  );
}

function findDirectMetadataTargets(
  index: Awaited<ReturnType<typeof getAniBridgeIndex>>,
  anilistId?: number,
  malId?: number,
): AniBridgeTarget[] {
  if (!index) return [];
  const descriptors = [
    anilistId ? `anilist:${anilistId}` : undefined,
    malId ? `mal:${malId}` : undefined,
  ].filter((value): value is string => Boolean(value));
  return mergeTargets(
    descriptors.flatMap(
      descriptor => index.records.get(descriptor)?.targets || [],
    ),
  );
}

function buildRawTarget(
  provider: "tmdb_movie" | "tmdb_show" | "tvdb_movie" | "tvdb_show",
  id: number,
  scope?: string,
): string {
  return [provider, String(id), scope].filter(Boolean).join(":");
}

function normalizePositiveInt(value: unknown): number | undefined {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeImdbId(value: unknown): string | undefined {
  const text = String(value ?? "").trim().toLowerCase();
  return /^tt\d{5,}$/.test(text) ? text : undefined;
}

function buildExternalLookupDescriptors({
  isMovie,
  tmdbId,
  tvdbId,
  imdbId,
}: {
  isMovie: boolean;
  tmdbId?: number;
  tvdbId?: number;
  imdbId?: string;
}): string[] {
  const descriptors: string[] = [];
  const tmdb = normalizePositiveInt(tmdbId);
  const tvdb = normalizePositiveInt(tvdbId);
  const imdb = normalizeImdbId(imdbId);
  if (tmdb) descriptors.push(`${isMovie ? "tmdb_movie" : "tmdb_show"}:${tmdb}`);
  if (tvdb) descriptors.push(`${isMovie ? "tvdb_movie" : "tvdb_show"}:${tvdb}`);
  if (imdb) descriptors.push(`${isMovie ? "imdb_movie" : "imdb_show"}:${imdb}`);
  return descriptors;
}

function buildIdsFromRecords(
  records: ReturnType<typeof findAniBridgeRecordsByDescriptors>,
  sourceDescriptors: string[]
): AniBridgeIds {
  const ids = emptyIds();
  sourceDescriptors
    .map((descriptor) => parseAniBridgeDescriptor(descriptor))
    .filter((descriptor): descriptor is AniBridgeDescriptor => !!descriptor)
    .forEach((descriptor) => addDescriptorId(ids, descriptor));
  records
    .flatMap((record) => record.targets)
    .forEach((target) => addTargetId(ids, target));
  Object.values(ids).forEach((values) =>
    values.sort((a: any, b: any) =>
      typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a).localeCompare(String(b))
    )
  );
  return ids;
}

function pickPrimaryImdbId(ids: AniBridgeIds, isMovie: boolean): string | undefined {
  return (isMovie ? ids.imdbMovieIds : ids.imdbShowIds)[0];
}

function pickPrimaryDiscoveredAnimeIds(ids: AniBridgeIds): {
  anilistId?: number;
  malId?: number;
} {
  return {
    anilistId: ids.anilistIds[0],
    malId: ids.malIds[0],
  };
}

async function resolveAniZipExternalTargets({
  providerContext,
  anilistId,
  malId,
  isMovie,
  targets,
}: {
  providerContext: ProviderContext;
  anilistId?: number;
  malId?: number;
  isMovie: boolean;
  targets: AniBridgeTarget[];
}): Promise<AniBridgeTarget[]> {
  const hasTmdbTarget = targets.some((target) =>
    isMovie
      ? target.provider === "tmdb_movie"
      : target.provider === "tmdb_show",
  );
  const hasTvdbTarget = targets.some((target) =>
    isMovie
      ? target.provider === "tvdb_movie"
      : target.provider === "tvdb_show",
  );
  if (hasTmdbTarget && (hasTvdbTarget || isMovie)) return [];

  const metadata = await resolveAniZipMetadata({
    providerContext,
    anilistId,
    malId,
  });
  const output: AniBridgeTarget[] = [];

  if (
    !hasTmdbTarget &&
    metadata.tmdbId &&
    (isMovie || metadata.mediaType === "movie")
  ) {
    const raw = buildRawTarget("tmdb_movie", metadata.tmdbId);
    output.push({
      provider: "tmdb_movie",
      id: String(metadata.tmdbId),
      raw,
      ranges: {},
    });
  }

  if (!hasTvdbTarget && metadata.tvdbId) {
    const provider =
      isMovie || metadata.mediaType === "movie" ? "tvdb_movie" : "tvdb_show";
    const raw = buildRawTarget(provider, metadata.tvdbId);
    output.push({
      provider,
      id: String(metadata.tvdbId),
      raw,
      ranges: {},
    });
  }

  if (
    !hasTmdbTarget &&
    metadata.tmdbId &&
    !(isMovie || metadata.mediaType === "movie")
  ) {
    const tvdbTargets = targets.filter(
      (target) =>
        target.provider === "tvdb_show" &&
        (!metadata.tvdbId || target.id === String(metadata.tvdbId)),
    );
    if (tvdbTargets.length === 0) {
      const raw = buildRawTarget("tmdb_show", metadata.tmdbId);
      output.push({
        provider: "tmdb_show",
        id: String(metadata.tmdbId),
        raw,
        ranges: {},
      });
    } else {
      tvdbTargets.forEach((target) => {
        const raw = buildRawTarget("tmdb_show", metadata.tmdbId!, target.scope);
        output.push({
          provider: "tmdb_show",
          id: String(metadata.tmdbId),
          scope: target.scope,
          raw,
          ranges: { ...target.ranges },
        });
      });
    }
  }

  return output;
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
  let targets = mergeTargets(records.flatMap((record) => record.targets));
  let metadataTargets = findDirectMetadataTargets(
    index,
    normalizedAnilistId,
    normalizedMalId,
  );
  const aniZipTmdbTargets = await resolveAniZipExternalTargets({
    providerContext,
    anilistId: normalizedAnilistId,
    malId: normalizedMalId,
    isMovie,
    targets: metadataTargets,
  });
  if (aniZipTmdbTargets.length > 0) {
    targets = mergeTargets([...targets, ...aniZipTmdbTargets]);
    metadataTargets = mergeTargets([
      ...metadataTargets,
      ...aniZipTmdbTargets,
    ]);
  }
  const ids = emptyIds();
  if (normalizedAnilistId) ids.anilistIds.push(normalizedAnilistId);
  if (normalizedMalId) ids.malIds.push(normalizedMalId);
  targets.forEach((target) => addTargetId(ids, target));
  Object.values(ids).forEach((values) =>
    values.sort((a: any, b: any) =>
      typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a).localeCompare(String(b)),
    ),
  );

  const metadataIds = emptyIds();
  metadataTargets.forEach(target => addTargetId(metadataIds, target));
  const mappedImdbIds = isMovie
    ? metadataIds.imdbMovieIds
    : metadataIds.imdbShowIds;
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
    metadataTargets,
    ids,
    imdbId,
    imdbSource,
    lookupSource: "anilist-mal",
  };
}

export async function resolveExternalAnimeMappings({
  providerContext,
  isMovie,
  tmdbId,
  tvdbId,
  imdbId,
  includeLegacyImdb = true,
}: {
  providerContext: ProviderContext;
  isMovie: boolean;
  tmdbId?: number;
  tvdbId?: number;
  imdbId?: string;
  includeLegacyImdb?: boolean;
}): Promise<AnimeMappingResolution> {
  const descriptors = buildExternalLookupDescriptors({
    isMovie,
    tmdbId,
    tvdbId,
    imdbId,
  });
  if (descriptors.length === 0) {
    return {
      sourceDescriptors: [],
      targets: [],
      metadataTargets: [],
      ids: emptyIds(),
      lookupSource: "external-reverse",
    };
  }

  const index = await getAniBridgeIndex(providerContext);
  const records = index
    ? findAniBridgeRecordsByDescriptors(index, descriptors)
    : [];
  const sourceDescriptors = records.map((record) => record.sourceDescriptor);
  const targets = mergeTargets(records.flatMap((record) => record.targets));
  const ids = buildIdsFromRecords(records, sourceDescriptors);

  let resolvedImdbId: string | undefined =
    normalizeImdbId(imdbId) || pickPrimaryImdbId(ids, isMovie);
  let imdbSource: AnimeMappingResolution["imdbSource"] = resolvedImdbId
    ? "anibridge-v3"
    : undefined;

  if (!resolvedImdbId && includeLegacyImdb) {
    const discovered = pickPrimaryDiscoveredAnimeIds(ids);
    resolvedImdbId = await resolveLegacyImdbId({
      providerContext,
      anilistId: discovered.anilistId,
      malId: discovered.malId,
    });
    if (resolvedImdbId) imdbSource = "plexanibridge-v2";
  }

  return {
    schemaVersion: index?.schemaVersion,
    generatedOn: index?.generatedOn,
    sourceDescriptors,
    targets,
    metadataTargets: targets,
    ids,
    imdbId: resolvedImdbId,
    imdbSource,
    lookupSource: "external-reverse",
  };
}

export function buildAniBridgeExtra(
  resolution: AnimeMappingResolution,
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
