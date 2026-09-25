import { ProviderContext } from "../../types";
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

export async function resolveTmdbMediaMetadata({
  providerContext,
  id,
  type,
  includeExtended = false,
}: {
  providerContext: ProviderContext;
  id: number;
  type: TmdbMediaType;
  includeExtended?: boolean;
}): Promise<TmdbMediaMetadata | null> {
  if (!Number.isFinite(id) || id <= 0) return null;
  const cache = getProviderRuntimeCache(providerContext);
  const cacheKey = `animeunity:tmdb:media:${type}:${id}:${
    includeExtended ? "extended" : "core"
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
        loadMediaImages(providerContext, type, id, locales),
        type === "tv"
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
