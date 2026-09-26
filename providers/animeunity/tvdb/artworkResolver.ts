import { ProviderContext } from "../../types";
import { readExternalCache, writeExternalCache } from "../externalCache";
import { getProviderRuntimeCache } from "../mappings/runtimeCache";
import {
  buildTvdbBackgroundLanguagePriority,
  buildTvdbLogoLanguagePriority,
  buildTvdbPosterLanguagePriority,
} from "./languages";
import { fetchTvdbHtml, TVDB_BASE_URL } from "./http";
import {
  extractTvdbEntityPath,
  parseTvdbArtworkDetails,
  parseTvdbArtworkGrid,
  parseTvdbOriginalLanguage,
  parseTvdbTitle,
} from "./parser";
import {
  TvdbArtwork,
  TvdbArtworkField,
  TvdbArtworkMetadata,
  TvdbMediaType,
} from "./types";

const CACHE_SCHEMA = "v1";
const SOFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DETAIL_LOOKUPS_PER_FIELD = 8;

type TvdbCacheValue = {
  metadata: TvdbArtworkMetadata;
  resolvedFields: TvdbArtworkField[];
};

function pickFields(
  metadata: TvdbArtworkMetadata,
  fields: TvdbArtworkField[],
): TvdbArtworkMetadata {
  return {
    source: metadata.source,
    sourceUrl: metadata.sourceUrl,
    tvdbId: metadata.tvdbId,
    mediaType: metadata.mediaType,
    tvdbShowId: metadata.tvdbShowId,
    tvdbMovieId: metadata.tvdbMovieId,
    seasonNumber: metadata.seasonNumber,
    title: metadata.title,
    originalLanguage: metadata.originalLanguage,
    ...(fields.includes("logo") ? { logo: metadata.logo } : {}),
    ...(fields.includes("poster") ? { poster: metadata.poster } : {}),
    ...(fields.includes("background")
      ? { background: metadata.background }
      : {}),
  };
}

function languagePriorityForField(
  field: TvdbArtworkField,
  originalLanguage?: string,
): string[] {
  if (field === "logo") return buildTvdbLogoLanguagePriority();
  if (field === "poster")
    return buildTvdbPosterLanguagePriority(originalLanguage);
  return buildTvdbBackgroundLanguagePriority(originalLanguage);
}

function pickByLanguage(
  items: TvdbArtwork[],
  field: TvdbArtworkField,
  originalLanguage?: string,
): TvdbArtwork | undefined {
  const priority = languagePriorityForField(field, originalLanguage);
  for (const language of priority) {
    const match = items.find((item) => item.language === language);
    if (match) return match;
  }
  return undefined;
}

async function resolveArtworkDetails({
  providerContext,
  candidates,
}: {
  providerContext: ProviderContext;
  candidates: TvdbArtwork[];
}): Promise<TvdbArtwork[]> {
  const selected = candidates.slice(0, MAX_DETAIL_LOOKUPS_PER_FIELD);
  const details = await Promise.all(
    selected.map(async (candidate) => {
      if (!candidate.id) return candidate;
      const detail = await fetchTvdbHtml(
        providerContext,
        `/artwork/${encodeURIComponent(candidate.id)}`,
      );
      return detail
        ? parseTvdbArtworkDetails(
            detail.html,
            providerContext.cheerio,
            candidate,
          )
        : candidate;
    }),
  );
  return details;
}

async function resolveField({
  providerContext,
  pageHtml,
  field,
  originalLanguage,
}: {
  providerContext: ProviderContext;
  pageHtml: string;
  field: TvdbArtworkField;
  originalLanguage?: string;
}): Promise<string | undefined> {
  const candidates = parseTvdbArtworkGrid(
    pageHtml,
    providerContext.cheerio,
    field,
  );
  if (candidates.length === 0) return undefined;
  const detailed = await resolveArtworkDetails({ providerContext, candidates });
  return pickByLanguage(detailed, field, originalLanguage)?.url;
}

function entryPath(mediaType: TvdbMediaType, id: number): string {
  return mediaType === "movie"
    ? `/dereferrer/movie/${encodeURIComponent(String(id))}`
    : `/?id=${encodeURIComponent(String(id))}&tab=series`;
}

export async function resolveTvdbArtworkMetadata({
  providerContext,
  tvdbId,
  tvdbShowId,
  tvdbMovieId,
  mediaType = "series",
  seasonNumber,
  fields = ["logo", "poster", "background"],
}: {
  providerContext: ProviderContext;
  tvdbId?: number;
  tvdbShowId?: number;
  tvdbMovieId?: number;
  mediaType?: TvdbMediaType;
  seasonNumber?: number;
  fields?: TvdbArtworkField[];
}): Promise<TvdbArtworkMetadata | null> {
  const id = Math.trunc(Number(tvdbId || tvdbShowId || tvdbMovieId));
  if (!Number.isFinite(id) || id <= 0 || fields.length === 0) {
    return null;
  }

  const requestedFields = Array.from(new Set(fields));
  const persistentKey = `animeunity:tvdb:${CACHE_SCHEMA}:artwork:${mediaType}:${id}:season:${seasonNumber ?? "none"}`;
  const cached = readExternalCache<TvdbCacheValue>(
    providerContext,
    persistentKey,
    SOFT_TTL_MS,
  );
  const cachedResolved = new Set(cached?.value.resolvedFields || []);
  if (cached && requestedFields.every((field) => cachedResolved.has(field))) {
    return pickFields(cached.value.metadata, requestedFields);
  }

  const runtimeCache = getProviderRuntimeCache(providerContext);
  const pendingKey = `${persistentKey}:pending:${requestedFields.sort().join(",")}`;
  const pending = runtimeCache.get(pendingKey) as
    Promise<TvdbArtworkMetadata | null> | undefined;
  if (pending) return pending;

  const request = (async (): Promise<TvdbArtworkMetadata | null> => {
    const entryResponse = await fetchTvdbHtml(
      providerContext,
      entryPath(mediaType, id),
      !!cached && cached.ageMs > SOFT_TTL_MS,
    );
    if (!entryResponse) {
      return cached ? pickFields(cached.value.metadata, requestedFields) : null;
    }

    const entityPath = extractTvdbEntityPath(
      entryResponse.html,
      mediaType,
      entryResponse.url,
    );
    if (!entityPath) {
      return cached ? pickFields(cached.value.metadata, requestedFields) : null;
    }

    const originalLanguage =
      parseTvdbOriginalLanguage(entryResponse.html, providerContext.cheerio) ||
      cached?.value.metadata.originalLanguage;
    const metadata: TvdbArtworkMetadata = {
      source: "tvdb-web",
      sourceUrl: `${TVDB_BASE_URL}${entityPath}`,
      tvdbId: id,
      mediaType,
      tvdbShowId: mediaType === "series" ? id : undefined,
      tvdbMovieId: mediaType === "movie" ? id : undefined,
      seasonNumber: mediaType === "series" ? seasonNumber : undefined,
      title: parseTvdbTitle(entryResponse.html, providerContext.cheerio),
      originalLanguage,
      ...cached?.value.metadata,
    };

    const unresolved = new Set<TvdbArtworkField>(requestedFields);
    const seasonPath =
      mediaType === "series" && seasonNumber != null
        ? `${entityPath}/seasons/official/${encodeURIComponent(String(seasonNumber))}`
        : undefined;
    const seasonResponse =
      seasonPath && unresolved.has("poster")
        ? await fetchTvdbHtml(providerContext, seasonPath)
        : null;

    if (seasonResponse && unresolved.has("poster")) {
      const poster = await resolveField({
        providerContext,
        pageHtml: seasonResponse.html,
        field: "poster",
        originalLanguage,
      });
      if (poster) {
        metadata.poster = poster;
        metadata.sourceUrl = `${TVDB_BASE_URL}${seasonPath}`;
        unresolved.delete("poster");
      }
    }

    await Promise.all(
      Array.from(unresolved).map(async (field) => {
        const value = await resolveField({
          providerContext,
          pageHtml: entryResponse.html,
          field,
          originalLanguage,
        });
        if (!value) return;
        metadata[field] = value;
        unresolved.delete(field);
      }),
    );

    const resolvedFields = Array.from(
      new Set([...(cached?.value.resolvedFields || []), ...requestedFields]),
    );
    writeExternalCache(providerContext, persistentKey, {
      metadata,
      resolvedFields,
    } as TvdbCacheValue);
    return pickFields(metadata, requestedFields);
  })()
    .catch(() =>
      cached ? pickFields(cached.value.metadata, requestedFields) : null,
    )
    .finally(() => runtimeCache.delete(pendingKey));

  runtimeCache.set(pendingKey, request);
  return request;
}
