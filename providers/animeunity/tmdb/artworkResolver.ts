import { ProviderContext } from "../../types";
import { getProviderRuntimeCache } from "../mappings/runtimeCache";
import { parseTmdbDetailsPage } from "./details";
import { fetchTmdbHtml, TMDB_BASE_URL } from "./http";
import {
  mergeTmdbImages,
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
import {
  TmdbArtworkField,
  TmdbArtworkMetadata,
  TmdbImageSize,
  TmdbImageMetadata,
  TmdbMediaType,
} from "./types";

const ARTWORK_SOFT_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_SCHEMA = "v3";

const ROUTES: Record<
  TmdbArtworkField,
  { route: "logos" | "posters" | "backdrops"; type: TmdbImageMetadata["type"] }
> = {
  logo: { route: "logos", type: "logo" },
  poster: { route: "posters", type: "poster" },
  background: { route: "backdrops", type: "backdrop" },
};

type ArtworkCacheValue = {
  metadata: TmdbArtworkMetadata;
  resolvedFields: TmdbArtworkField[];
};

function mediaPath(type: TmdbMediaType, id: number): string {
  return `/${type}/${id}`;
}

function selectLocaleImage(
  images: TmdbImageMetadata[],
  locale: string
): string | undefined {
  const language = languageCodeFromLocale(locale);
  const exact = images.filter((image) => image.language === language);
  return mergeTmdbImages([exact], [locale])[0]?.url;
}

function pickFields(
  metadata: TmdbArtworkMetadata,
  fields: TmdbArtworkField[],
  imageSize: TmdbImageSize
): TmdbArtworkMetadata {
  return {
    id: metadata.id,
    type: metadata.type,
    source: metadata.source,
    sourceUrl: metadata.sourceUrl,
    originalLanguage: metadata.originalLanguage,
    seasonNumber: metadata.seasonNumber,
    logo: fields.includes("logo")
      ? normalizeTmdbImageUrl(metadata.logo, imageSize)
      : undefined,
    poster: fields.includes("poster")
      ? normalizeTmdbImageUrl(metadata.poster, imageSize)
      : undefined,
    background: fields.includes("background")
      ? normalizeTmdbImageUrl(metadata.background, imageSize)
      : undefined,
  };
}

export async function resolveTmdbArtworkMetadata({
  providerContext,
  id,
  type,
  fields = ["logo", "poster", "background"],
  imageSize = "original",
}: {
  providerContext: ProviderContext;
  id: number;
  type: TmdbMediaType;
  fields?: TmdbArtworkField[];
  imageSize?: TmdbImageSize;
}): Promise<TmdbArtworkMetadata | null> {
  if (!Number.isFinite(id) || id <= 0 || fields.length === 0) return null;
  const requestedFields = Array.from(new Set(fields));
  const persistentKey = `animeunity:tmdb:${CACHE_SCHEMA}:artwork:${type}:${id}`;
  const cached = readTmdbPersistentCache<ArtworkCacheValue>(
    providerContext,
    persistentKey
  );
  const cachedResolved = new Set(cached?.value.resolvedFields || []);
  if (
    cached &&
    cached.ageMs <= ARTWORK_SOFT_TTL_MS &&
    requestedFields.every((field) => cachedResolved.has(field))
  ) {
    return pickFields(cached.value.metadata, requestedFields, imageSize);
  }

  const runtimeCache = getProviderRuntimeCache(providerContext);
  const pendingKey = `${persistentKey}:pending:${requestedFields.sort().join(",")}`;
  const pending = runtimeCache.get(pendingKey) as
    | Promise<TmdbArtworkMetadata | null>
    | undefined;
  if (pending) return pending;

  const request = (async (): Promise<TmdbArtworkMetadata | null> => {
    const path = mediaPath(type, id);
    const detailsHtml = await fetchTmdbHtml(
      providerContext,
      path,
      TMDB_PRIMARY_LOCALE,
      !!cached && cached.ageMs > ARTWORK_SOFT_TTL_MS
    );
    const details = detailsHtml
      ? parseTmdbDetailsPage(
          detailsHtml,
          providerContext.cheerio,
          TMDB_PRIMARY_LOCALE
        )
      : null;
    if (!details && cached) {
      return pickFields(cached.value.metadata, requestedFields, imageSize);
    }
    if (!details) return null;

    const originalLanguage =
      resolveOriginalLocale(details.originalLanguageName) ||
      cached?.value.metadata.originalLanguage;
    const locales = buildLocalePriority(originalLanguage);
    const metadata: TmdbArtworkMetadata = {
      id,
      type,
      source: "tmdb-web",
      sourceUrl: `${TMDB_BASE_URL}${path}`,
      originalLanguage,
      ...cached?.value.metadata,
    };
    const unresolved = new Set<TmdbArtworkField>(requestedFields);

    for (const locale of locales) {
      if (unresolved.size === 0) break;
      const activeFields = Array.from(unresolved);
      const results = await Promise.all(
        activeFields.map(async (field) => {
          const config = ROUTES[field];
          const html = await fetchTmdbHtml(
            providerContext,
            `${path}/images/${config.route}`,
            locale,
            !!cached && cached.ageMs > ARTWORK_SOFT_TTL_MS
          );
          if (!html) return { field, url: undefined };
          const images = parseTmdbImageGallery(
            html,
            providerContext.cheerio,
            config.type,
            languageCodeFromLocale(locale)
          );
          return { field, url: selectLocaleImage(images, locale) };
        })
      );
      results.forEach(({ field, url }) => {
        if (!url) return;
        metadata[field] = url;
        unresolved.delete(field);
      });
    }

    if (unresolved.has("poster") && details.poster) {
      metadata.poster = details.poster;
      unresolved.delete("poster");
    }
    if (unresolved.has("background") && details.background) {
      metadata.background = details.background;
      unresolved.delete("background");
    }

    const resolvedFields = Array.from(
      new Set([...(cached?.value.resolvedFields || []), ...requestedFields])
    );
    writeTmdbPersistentCache(providerContext, persistentKey, {
      metadata,
      resolvedFields,
    } as ArtworkCacheValue);
    return pickFields(metadata, requestedFields, imageSize);
  })()
    .catch(() =>
      cached ? pickFields(cached.value.metadata, requestedFields, imageSize) : null
    )
    .finally(() => runtimeCache.delete(pendingKey));

  runtimeCache.set(pendingKey, request);
  return request;
}
