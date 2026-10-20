import { ProviderContext } from "../../types";
import { readTmdbApiKey, resolveApiMedia } from "./api";
import { getProviderRuntimeCache } from "../mappings/runtimeCache";
import { fetchTmdbHtml, TMDB_BASE_URL } from "./http";
import { parseTmdbDetailsPage } from "./details";
import { parseTmdbExpandedEpisode } from "./episodeDetails";
import {
  mergeTmdbVideos,
  parseTmdbCreditsPage,
  parseTmdbEpisodeGroupsPage,
  parseTmdbTranslationsPage,
  parseTmdbVideosPage,
  parseTmdbWatchProvidersPage,
} from "./extended";
import {
  mergeTmdbImages,
  parseTmdbImageGallery,
} from "./images";
import {
  buildLogoLocalePriority,
  buildLocalePriority,
  languageCodeFromLocale,
  pickLocalizedText,
  resolveOriginalLocale,
  TMDB_ENGLISH_LOCALE,
  TMDB_NO_LANGUAGE_LOCALE,
  TMDB_PRIMARY_LOCALE,
} from "./locales";
import {
  mergeTmdbEpisodes,
  mergeTmdbSeasons,
  parseTmdbSeasonEpisodesPage,
  parseTmdbSeasonsPage,
} from "./seasons";
import {
  TmdbEpisodeMetadata,
  TmdbExtendedMetadata,
  TmdbImageMetadata,
  TmdbMediaMetadata,
  TmdbMediaType,
  TmdbPageMetadata,
  TmdbSeasonMetadata,
  TmdbTranslationMetadata,
} from "./types";

const SUCCESS_TTL_MS = 12 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 30 * 60 * 1000;

const EMPTY_EXTENDED_METADATA: TmdbExtendedMetadata = {
  cast: [],
  crew: [],
  videos: [],
  watchProviders: [],
  episodeGroups: [],
  translations: [],
};

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

function mediaPath(type: TmdbMediaType, id: number): string {
  return `/${type}/${id}`;
}

function firstNonEmptyArray<T>(
  pages: TmdbPageMetadata[],
  read: (page: TmdbPageMetadata) => T[]
): T[] {
  for (const page of pages) {
    const value = read(page);
    if (value.length > 0) return value;
  }
  return [];
}

function firstNonEmptyRecord(
  pages: TmdbPageMetadata[],
  read: (page: TmdbPageMetadata) => Record<string, string>
): Record<string, string> {
  for (const page of pages) {
    const value = read(page);
    if (Object.keys(value).length > 0) return value;
  }
  return {};
}

async function loadLocalizedDetails(
  providerContext: ProviderContext,
  type: TmdbMediaType,
  id: number
): Promise<{ pages: TmdbPageMetadata[]; locales: string[] }> {
  const baseLocales = [TMDB_PRIMARY_LOCALE, TMDB_ENGLISH_LOCALE];
  const basePages = await Promise.all(
    baseLocales.map(async (locale) => {
      const html = await fetchTmdbHtml(providerContext, mediaPath(type, id), locale);
      return html
        ? parseTmdbDetailsPage(html, providerContext.cheerio, locale)
        : null;
    })
  );
  const englishPage = basePages[1] || basePages[0];
  const originalLocale = resolveOriginalLocale(
    englishPage?.originalLanguageName
  );
  const locales = buildLocalePriority(originalLocale);
  const pages = basePages.filter((page): page is TmdbPageMetadata => page != null);

  const remainingLocales = locales.filter(
    (locale) => !baseLocales.includes(locale)
  );
  const remainingPages = await Promise.all(
    remainingLocales.map(async (locale) => {
      const html = await fetchTmdbHtml(
        providerContext,
        mediaPath(type, id),
        locale
      );
      return html
        ? parseTmdbDetailsPage(html, providerContext.cheerio, locale)
        : null;
    })
  );
  pages.push(
    ...remainingPages.filter((page): page is TmdbPageMetadata => page != null)
  );

  pages.sort(
    (left, right) => locales.indexOf(left.locale) - locales.indexOf(right.locale)
  );
  return { pages, locales };
}

async function loadMediaImages(
  providerContext: ProviderContext,
  type: TmdbMediaType,
  id: number,
  locales: string[]
): Promise<TmdbMediaMetadata["images"]> {
  const imageLocales = Array.from(new Set([...locales, TMDB_NO_LANGUAGE_LOCALE]));
  const loadType = async (
    route: "logos" | "posters" | "backdrops",
    typeName: TmdbImageMetadata["type"],
    priorityLocales = locales
  ) => {
    const requestLocales = Array.from(
      new Set([...priorityLocales, TMDB_NO_LANGUAGE_LOCALE])
    );
    const groups = await Promise.all(
      requestLocales.map(async (locale) => {
        const html = await fetchTmdbHtml(
          providerContext,
          `${mediaPath(type, id)}/images/${route}`,
          locale
        );
        return html
          ? parseTmdbImageGallery(
              html,
              providerContext.cheerio,
              typeName,
              languageCodeFromLocale(locale)
            )
          : [];
      })
    );
    return mergeTmdbImages(groups, priorityLocales);
  };

  const [logos, posters, backdrops] = await Promise.all([
    loadType("logos", "logo", buildLogoLocalePriority()),
    loadType("posters", "poster"),
    loadType("backdrops", "backdrop"),
  ]);
  return { logos, posters, backdrops };
}

async function loadExtendedMetadata(
  providerContext: ProviderContext,
  type: TmdbMediaType,
  id: number,
  locales: string[]
): Promise<TmdbExtendedMetadata> {
  const path = mediaPath(type, id);
  const primaryLocale = locales[0] || TMDB_PRIMARY_LOCALE;
  const [creditsHtml, translationsHtml, videoGroups, watchHtml, groupsHtml] =
    await Promise.all([
      fetchTmdbHtml(providerContext, `${path}/cast`, primaryLocale),
      fetchTmdbHtml(providerContext, `${path}/translations`, primaryLocale),
      Promise.all(
        locales.map(async (locale) => {
          const html = await fetchTmdbHtml(
            providerContext,
            `${path}/videos`,
            locale
          );
          return html
            ? parseTmdbVideosPage(html, providerContext.cheerio, locale)
            : [];
        })
      ),
      fetchTmdbHtml(providerContext, `${path}/watch`, primaryLocale),
      type === "tv"
        ? fetchTmdbHtml(
            providerContext,
            `${path}/episode_groups`,
            primaryLocale
          )
        : Promise.resolve(null),
    ]);
  const credits = creditsHtml
    ? parseTmdbCreditsPage(creditsHtml, providerContext.cheerio)
    : { cast: [], crew: [] };
  return {
    ...credits,
    videos: mergeTmdbVideos(videoGroups),
    watchProviders: watchHtml
      ? parseTmdbWatchProvidersPage(watchHtml, providerContext.cheerio)
      : [],
    episodeGroups: groupsHtml
      ? parseTmdbEpisodeGroupsPage(groupsHtml, providerContext.cheerio, id)
      : [],
    translations: translationsHtml
      ? parseTmdbTranslationsPage(translationsHtml, providerContext.cheerio)
      : [],
  };
}

function mergeDetails(
  type: TmdbMediaType,
  id: number,
  pages: TmdbPageMetadata[],
  images: TmdbMediaMetadata["images"],
  seasons: TmdbSeasonMetadata[],
  extended: TmdbExtendedMetadata
): TmdbMediaMetadata | null {
  const primary = pages[0];
  if (!primary) return null;
  const title = pickLocalizedText(pages, (page) => page.title, (page) => page.locale);
  const overview = pickLocalizedText(
    pages,
    (page) => page.overview,
    (page) => page.locale
  );
  const tagline = pickLocalizedText(
    pages,
    (page) => page.tagline,
    (page) => page.locale
  );
  const localizedPages: TmdbTranslationMetadata[] = pages.map((page) => ({
    language: page.locale,
    title: page.title,
    overview: page.overview,
    tagline: page.tagline,
  }));

  return {
    source: "tmdb-web",
    id,
    type,
    sourceUrl: `${TMDB_BASE_URL}${mediaPath(type, id)}`,
    fetchedAt: new Date().toISOString(),
    originalLanguage: resolveOriginalLocale(
      pages.find((page) => page.locale === TMDB_ENGLISH_LOCALE)
        ?.originalLanguageName || primary.originalLanguageName
    ),
    title,
    originalTitle: pages.find((page) => page.originalTitle)?.originalTitle,
    overview,
    tagline,
    startDate: pages.find((page) => page.startDate)?.startDate,
    endDate: pages.find((page) => page.endDate)?.endDate,
    releaseDate: pages.find((page) => page.releaseDate)?.releaseDate,
    certification: pages.find((page) => page.certification)?.certification,
    status: primary.status || pages.find((page) => page.status)?.status,
    mediaType: primary.mediaType || pages.find((page) => page.mediaType)?.mediaType,
    rating: pages.find((page) => page.rating != null)?.rating,
    ratingCount: pages.find((page) => page.ratingCount != null)?.ratingCount,
    contentScore: pages.find((page) => page.contentScore != null)?.contentScore,
    numberOfEpisodes: pages.find((page) => page.numberOfEpisodes != null)
      ?.numberOfEpisodes,
    numberOfSeasons: type === "tv" ? seasons.length : undefined,
    genres: firstNonEmptyArray(pages, (page) => page.genres),
    countries: firstNonEmptyArray(pages, (page) => page.countries),
    facts: firstNonEmptyRecord(pages, (page) => page.facts),
    keywords: firstNonEmptyArray(pages, (page) => page.keywords),
    networks: firstNonEmptyArray(pages, (page) => page.networks),
    socialLinks: firstNonEmptyRecord(pages, (page) => page.socialLinks),
    cast:
      extended.cast.length > 0
        ? extended.cast
        : firstNonEmptyArray(pages, (page) => page.cast),
    crew: extended.crew,
    videos: extended.videos,
    watchProviders: extended.watchProviders,
    episodeGroups: extended.episodeGroups,
    translations:
      extended.translations.length > 0
        ? extended.translations
        : localizedPages,
    images,
    logo: images.logos[0]?.url,
    poster: images.posters[0]?.url || primary.poster,
    background: images.backdrops[0]?.url || primary.background,
    seasons,
    schema:
      pages.find((page) => Object.keys(page.schema).length > 0)?.schema || {},
  };
}

async function resolveTmdbMediaWeb({
  providerContext,
  id,
  type,
  includeExtended = false,
  coreFieldsOnly = false,
}: {
  providerContext: ProviderContext;
  id: number;
  type: TmdbMediaType;
  includeExtended?: boolean;
  coreFieldsOnly?: boolean;
}): Promise<TmdbMediaMetadata | null> {
  if (!Number.isFinite(id) || id <= 0) return null;
  const cache = getProviderRuntimeCache(providerContext);
  const cacheKey = `animeunity:tmdb:media:${type}:${id}:${
    includeExtended ? "extended" : coreFieldsOnly ? "core-fields" : "core"
  }`;
  const pendingKey = `${cacheKey}:pending`;
  const cached = cache.get(cacheKey) as
    | CacheEntry<TmdbMediaMetadata | null>
    | undefined;
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = cache.get(pendingKey) as
    | Promise<TmdbMediaMetadata | null>
    | undefined;
  if (pending) return pending;

  const request = loadLocalizedDetails(providerContext, type, id)
    .then(async ({ pages, locales }) => {
      if (pages.length === 0) return null;
      const [images, seasonGroups, extended] = await Promise.all([
        coreFieldsOnly
          ? Promise.resolve({ logos: [], posters: [], backdrops: [] })
          : loadMediaImages(providerContext, type, id, locales),
        type === "tv" && !coreFieldsOnly
          ? Promise.all(
              locales.map(async (locale) => {
                const html = await fetchTmdbHtml(
                  providerContext,
                  `${mediaPath(type, id)}/seasons`,
                  locale
                );
                return html
                  ? parseTmdbSeasonsPage(
                      html,
                      providerContext.cheerio,
                      locale,
                      id
                    )
                  : [];
              })
            )
          : Promise.resolve([]),
        includeExtended
          ? loadExtendedMetadata(providerContext, type, id, locales)
          : Promise.resolve(EMPTY_EXTENDED_METADATA),
      ]);
      const seasons = type === "tv" ? mergeTmdbSeasons(seasonGroups) : [];
      return mergeDetails(type, id, pages, images, seasons, extended);
    })
    .catch(() => null)
    .then((metadata) => {
      cache.set(cacheKey, {
        expiresAt:
          Date.now() + (metadata ? SUCCESS_TTL_MS : FAILURE_TTL_MS),
        value: metadata,
      } as CacheEntry<TmdbMediaMetadata | null>);
      return metadata;
    })
    .finally(() => cache.delete(pendingKey));

  cache.set(pendingKey, request);
  return request;
}

export async function resolveTmdbMediaMetadata(args: {
  providerContext: ProviderContext;
  id: number;
  type: TmdbMediaType;
  includeExtended?: boolean;
}): Promise<TmdbMediaMetadata | null> {
  const { providerContext, id, type, includeExtended = false } = args;
  if (!Number.isFinite(id) || id <= 0) return null;
  const apiKey = await readTmdbApiKey(providerContext);
  if (!apiKey || includeExtended) return resolveTmdbMediaWeb(args);
  const api = await resolveApiMedia({ providerContext, apiKey, id, type });
  if (hasCompleteApiMetadata(api, type)) return api;
  const web = await resolveTmdbMediaWeb(args);
  return mergeApiAndWebMetadata(api, web);
}

type TmdbInfoField = "title" | "overview" | "year" | "runtime" | "rating" | "genres" | "cast";

function hasCompleteApiMetadata(
  api: TmdbMediaMetadata | null, type: TmdbMediaType
): boolean {
  return !!(
    api?.title?.value && api.overview?.value &&
    (type !== "tv" || api.seasons.length > 0) &&
    api.cast.length > 0 && api.genres.length > 0 &&
    api.facts.Runtime && api.rating != null &&
    (api.releaseDate || api.startDate)
  );
}

/** Fetch only the TMDB fields used to fill gaps in StreamingUnity Info. */
export async function resolveTmdbInfoFields({
  providerContext, id, type, fields,
}: {
  providerContext: ProviderContext;
  id: number;
  type: TmdbMediaType;
  fields: TmdbInfoField[];
}): Promise<TmdbMediaMetadata | null> {
  if (!Number.isFinite(id) || id <= 0 || fields.length === 0) return null;
  const apiKey = await readTmdbApiKey(providerContext);
  const webArgs = { providerContext, id, type, coreFieldsOnly: true };
  if (!apiKey) return resolveTmdbMediaWeb(webArgs);
  const api = await resolveApiMedia({
    providerContext, apiKey, id, type,
    includeImages: false,
    includeCredits: fields.includes("cast") || fields.includes("year"),
  });
  const hasRequestedFields = api && fields.every((field) => {
    switch (field) {
      case "title": return !!api.title?.value;
      case "overview": return !!api.overview?.value;
      // The old resolver skips web only when API metadata is complete. If it
      // does merge web, releaseDate takes precedence over start/end dates.
      case "year": return hasCompleteApiMetadata(api, type);
      case "runtime": return !!api.facts.Runtime;
      case "rating": return api.rating != null;
      case "genres": return api.genres.length > 0;
      case "cast": return api.cast.length > 0;
    }
  });
  if (hasRequestedFields) return api;
  const web = await resolveTmdbMediaWeb(webArgs);
  return mergeApiAndWebMetadata(api, web);
}

function mergeApiAndWebMetadata(
  api: TmdbMediaMetadata | null,
  web: TmdbMediaMetadata | null
): TmdbMediaMetadata | null {
  if (!api) return web;
  if (!web) return api;
  const prefer = <T>(primary: T[], fallback: T[]): T[] =>
    primary.length ? primary : fallback;
  const preferRecord = (
    primary: Record<string, string>, fallback: Record<string, string>
  ): Record<string, string> =>
    Object.keys(primary).length ? primary : fallback;
  return {
    ...web, ...api,
    title: api.title || web.title,
    overview: api.overview || web.overview,
    tagline: api.tagline || web.tagline,
    originalTitle: api.originalTitle || web.originalTitle,
    releaseDate: api.releaseDate || web.releaseDate,
    startDate: api.startDate || web.startDate,
    endDate: api.endDate || web.endDate,
    certification: api.certification || web.certification,
    status: api.status || web.status,
    rating: api.rating ?? web.rating,
    ratingCount: api.ratingCount ?? web.ratingCount,
    seasons: api.seasons.length ? api.seasons : web.seasons,
    cast: api.cast.length ? api.cast : web.cast,
    crew: prefer(api.crew, web.crew),
    videos: prefer(api.videos, web.videos),
    watchProviders: prefer(api.watchProviders, web.watchProviders),
    episodeGroups: prefer(api.episodeGroups, web.episodeGroups),
    translations: prefer(api.translations, web.translations),
    genres: prefer(api.genres, web.genres),
    countries: prefer(api.countries, web.countries),
    keywords: prefer(api.keywords, web.keywords),
    networks: prefer(api.networks, web.networks),
    socialLinks: preferRecord(api.socialLinks, web.socialLinks),
    facts: preferRecord(api.facts, web.facts),
    schema: Object.keys(api.schema).length ? api.schema : web.schema,
    images: {
      logos: api.images.logos.length ? api.images.logos : web.images.logos,
      posters: api.images.posters.length ? api.images.posters : web.images.posters,
      backdrops: api.images.backdrops.length
        ? api.images.backdrops : web.images.backdrops,
    },
    logo: api.logo || web.logo,
    poster: api.poster || web.poster,
    background: api.background || web.background,
  };
}

export async function resolveTmdbSeasonMetadata({
  providerContext,
  mediaId,
  seasonNumber,
}: {
  providerContext: ProviderContext;
  mediaId: number;
  seasonNumber: number;
}): Promise<TmdbSeasonMetadata | null> {
  if (!Number.isFinite(mediaId) || mediaId <= 0 || seasonNumber < 0) return null;
  const cache = getProviderRuntimeCache(providerContext);
  const cacheKey = `animeunity:tmdb:season:${mediaId}:${seasonNumber}`;
  const pendingKey = `${cacheKey}:pending`;
  const cached = cache.get(cacheKey) as
    | CacheEntry<TmdbSeasonMetadata | null>
    | undefined;
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = cache.get(pendingKey) as
    | Promise<TmdbSeasonMetadata | null>
    | undefined;
  if (pending) return pending;

  const request = resolveTmdbMediaMetadata({
    providerContext,
    id: mediaId,
    type: "tv",
  })
    .then(async (media) => {
      if (!media) return null;
      const locales = buildLocalePriority(media.originalLanguage);
      const [episodeGroups, posterGroups] = await Promise.all([
        Promise.all(
          locales.map(async (locale) => {
            const html = await fetchTmdbHtml(
              providerContext,
              `/tv/${mediaId}/season/${seasonNumber}`,
              locale
            );
            return html
              ? parseTmdbSeasonEpisodesPage(
                  html,
                  providerContext.cheerio,
                  locale,
                  mediaId,
                  seasonNumber
                )
              : [];
          })
        ),
        Promise.all(
          Array.from(new Set([...locales, TMDB_NO_LANGUAGE_LOCALE])).map(
            async (locale) => {
              const html = await fetchTmdbHtml(
                providerContext,
                `/tv/${mediaId}/season/${seasonNumber}/images/posters`,
                locale
              );
              return html
                ? parseTmdbImageGallery(
                    html,
                    providerContext.cheerio,
                    "poster",
                    languageCodeFromLocale(locale)
                  )
                : [];
            }
          )
        ),
      ]);
      const episodes = mergeTmdbEpisodes(episodeGroups);
      const posters = mergeTmdbImages(posterGroups, locales);
      const backgrounds = mergeTmdbImages(
        episodes.map((episode) => episode.stills),
        locales
      );
      const base = media.seasons.find(
        (season) => season.seasonNumber === seasonNumber
      );
      return {
        seasonNumber,
        name: base?.name,
        overview: base?.overview,
        year: base?.year,
        episodeCount: episodes.length || base?.episodeCount,
        poster: posters[0]?.url || base?.poster,
        posters: posters.length ? posters : base?.posters || [],
        backgrounds,
        episodes,
        sourceUrl: `https://www.themoviedb.org/tv/${mediaId}/season/${seasonNumber}`,
      } as TmdbSeasonMetadata;
    })
    .catch(() => null)
    .then((season) => {
      cache.set(cacheKey, {
        expiresAt: Date.now() + (season ? SUCCESS_TTL_MS : FAILURE_TTL_MS),
        value: season,
      } as CacheEntry<TmdbSeasonMetadata | null>);
      return season;
    })
    .finally(() => cache.delete(pendingKey));

  cache.set(pendingKey, request);
  return request;
}

export async function resolveTmdbEpisodeExtendedMetadata({
  providerContext,
  mediaId,
  seasonNumber,
  episodeNumber,
}: {
  providerContext: ProviderContext;
  mediaId: number;
  seasonNumber: number;
  episodeNumber: number;
}): Promise<TmdbEpisodeMetadata | null> {
  if (
    !Number.isFinite(mediaId) ||
    mediaId <= 0 ||
    seasonNumber < 0 ||
    episodeNumber <= 0
  ) {
    return null;
  }
  const cache = getProviderRuntimeCache(providerContext);
  const cacheKey = `animeunity:tmdb:episode:${mediaId}:${seasonNumber}:${episodeNumber}`;
  const cached = cache.get(cacheKey) as
    | CacheEntry<TmdbEpisodeMetadata | null>
    | undefined;
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const season = await resolveTmdbSeasonMetadata({
    providerContext,
    mediaId,
    seasonNumber,
  });
  const episode = season?.episodes?.find(
    (item) => item.episodeNumber === episodeNumber
  );
  let result = episode || null;
  if (episode?.id) {
    const html = await fetchTmdbHtml(
      providerContext,
      `/tv/${mediaId}/remote/episode/${episode.id}/expanded_info`,
      TMDB_PRIMARY_LOCALE
    );
    if (html) {
      const extended = parseTmdbExpandedEpisode(html, providerContext.cheerio);
      result = {
        ...episode,
        ...extended,
        stills: mergeTmdbImages(
          [episode.stills, extended.stills],
          [TMDB_PRIMARY_LOCALE, TMDB_ENGLISH_LOCALE]
        ),
      };
    }
  }
  cache.set(cacheKey, {
    expiresAt: Date.now() + (result ? SUCCESS_TTL_MS : FAILURE_TTL_MS),
    value: result,
  } as CacheEntry<TmdbEpisodeMetadata | null>);
  return result;
}
