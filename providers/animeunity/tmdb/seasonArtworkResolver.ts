import { ProviderContext } from "../../types";
import { getProviderRuntimeCache } from "../mappings/runtimeCache";
import { parseTmdbDetailsPage } from "./details";
import { fetchTmdbHtml, TMDB_BASE_URL } from "./http";
import {
  normalizeTmdbImageUrl,
  parseTmdbImageGallery,
} from "./images";
import {
  buildLocalePriority,
  languageCodeFromLocale,
  resolveOriginalLocale,
  TMDB_PRIMARY_LOCALE,
} from "./locales";
import {
  readTmdbPersistentCache,
  writeTmdbPersistentCache,
} from "./persistentCache";
import { TmdbArtworkMetadata, TmdbImageSize } from "./types";

const SEASON_ARTWORK_SOFT_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_SCHEMA = "v1";

export async function resolveTmdbSeasonPoster({
  providerContext,
  mediaId,
  seasonNumber,
  imageSize = "original",
}: {
  providerContext: ProviderContext;
  mediaId: number;
  seasonNumber: number;
  imageSize?: TmdbImageSize;
}): Promise<TmdbArtworkMetadata | null> {
  if (!Number.isFinite(mediaId) || mediaId <= 0 || seasonNumber < 0) {
    return null;
  }

  const persistentKey =
    `animeunity:tmdb:${CACHE_SCHEMA}:season-artwork:tv:${mediaId}:${seasonNumber}`;
  const cached = readTmdbPersistentCache<TmdbArtworkMetadata>(
    providerContext,
    persistentKey
  );
  if (cached && cached.ageMs <= SEASON_ARTWORK_SOFT_TTL_MS) {
    return {
      ...cached.value,
      poster: normalizeTmdbImageUrl(cached.value.poster, imageSize),
    };
  }

  const runtimeCache = getProviderRuntimeCache(providerContext);
  const pendingKey = `${persistentKey}:pending`;
  const pending = runtimeCache.get(pendingKey) as
    | Promise<TmdbArtworkMetadata | null>
    | undefined;
  if (pending) return pending;

  const request = (async (): Promise<TmdbArtworkMetadata | null> => {
    const detailsHtml = await fetchTmdbHtml(
      providerContext,
      `/tv/${mediaId}`,
      TMDB_PRIMARY_LOCALE,
      !!cached && cached.ageMs > SEASON_ARTWORK_SOFT_TTL_MS
    );
    const details = detailsHtml
      ? parseTmdbDetailsPage(
          detailsHtml,
          providerContext.cheerio,
          TMDB_PRIMARY_LOCALE
        )
      : null;
    if (!details) {
      return cached
        ? {
            ...cached.value,
            poster: normalizeTmdbImageUrl(cached.value.poster, imageSize),
          }
        : null;
    }

    const originalLanguage =
      resolveOriginalLocale(details.originalLanguageName) ||
      cached?.value.originalLanguage;
    let poster: string | undefined;
    for (const locale of buildLocalePriority(originalLanguage)) {
      const html = await fetchTmdbHtml(
        providerContext,
        `/tv/${mediaId}/season/${seasonNumber}/images/posters`,
        locale,
        !!cached && cached.ageMs > SEASON_ARTWORK_SOFT_TTL_MS
      );
      if (!html) continue;
      const language = languageCodeFromLocale(locale);
      const images = parseTmdbImageGallery(
        html,
        providerContext.cheerio,
        "poster",
        language
      );
      poster = images.find((image) => image.language === language)?.url;
      if (poster) break;
    }

    const metadata: TmdbArtworkMetadata = {
      id: mediaId,
      type: "tv",
      source: "tmdb-web",
      sourceUrl: `${TMDB_BASE_URL}/tv/${mediaId}/season/${seasonNumber}`,
      originalLanguage,
      seasonNumber,
      poster,
    };
    writeTmdbPersistentCache(providerContext, persistentKey, metadata);
    return {
      ...metadata,
      poster: normalizeTmdbImageUrl(metadata.poster, imageSize),
    };
  })()
    .catch(() =>
      cached
        ? {
            ...cached.value,
            poster: normalizeTmdbImageUrl(cached.value.poster, imageSize),
          }
        : null
    )
    .finally(() => runtimeCache.delete(pendingKey));

  runtimeCache.set(pendingKey, request);
  return request;
}
