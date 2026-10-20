import { ProviderContext } from "../../types";
import { getProviderRuntimeCache } from "../mappings/runtimeCache";
import { mergeTmdbImages } from "./images";
import {
  buildLocalePriority,
  buildLogoLocalePriority,
  languageCodeFromLocale,
  pickLocalizedText,
  TMDB_PRIMARY_LOCALE,
} from "./locales";
import { mergeTmdbEpisodes } from "./seasons";
import {
  TmdbArtworkField,
  TmdbArtworkMetadata,
  TmdbEpisodeMetadata,
  TmdbImageMetadata,
  TmdbImageSize,
  TmdbMediaMetadata,
  TmdbMediaType,
  TmdbSeasonMetadata,
} from "./types";

const API_BASE_URL = "https://api.themoviedb.org/3";
const WEB_BASE_URL = "https://www.themoviedb.org";
const REQUEST_TIMEOUT_MS = 15000;
const API_CACHE_TTL_MS = 4 * 60 * 60 * 1000;

type ApiRecord = Record<string, any>;

const record = (value: unknown): ApiRecord | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as ApiRecord)
    : null;
const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;
const positiveNumber = (value: unknown): number | undefined => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
};
const rows = (value: unknown): ApiRecord[] =>
  Array.isArray(value) ? value.map(record).filter((row): row is ApiRecord => !!row) : [];

const imageUrl = (path: unknown, size: TmdbImageSize = "original") => {
  const value = text(path);
  return value && /^\/[a-z\d_-]+\.(?:jpe?g|png|webp|avif|svg)$/i.test(value)
    ? `https://image.tmdb.org/t/p/${size}${value}`
    : undefined;
};

const originalLocale = (language: unknown): string | undefined => {
  const code = text(language)?.toLowerCase();
  if (!code || !/^[a-z]{2}$/.test(code)) return undefined;
  const regions: Record<string, string> = {
    ar: "SA", de: "DE", en: "US", es: "ES", fr: "FR", hi: "IN",
    it: "IT", ja: "JP", ko: "KR", pt: "BR", ru: "RU", th: "TH", zh: "CN",
  };
  return `${code}-${regions[code] || code.toUpperCase()}`;
};

export async function readTmdbApiKey(
  providerContext: ProviderContext
): Promise<string | undefined> {
  try {
    return text(await providerContext.kvStore.get<string>("tmdbApiKey"));
  } catch (_) {
    return undefined;
  }
}

async function request(
  providerContext: ProviderContext,
  apiKey: string,
  path: string,
  params: Record<string, string> = {}
): Promise<ApiRecord | null> {
  const cache = getProviderRuntimeCache(providerContext);
  const cacheKey = `animeunity:tmdb:api:${JSON.stringify([path, params, apiKey])}`;
  const cached = cache.get(cacheKey) as
    | { expiresAt: number; value: ApiRecord }
    | undefined;
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const pendingKey = `${cacheKey}:pending`;
  const pending = cache.get(pendingKey) as Promise<ApiRecord | null> | undefined;
  if (pending) return pending;
  const promise = providerContext.axios.get(`${API_BASE_URL}${path}`, {
    params: { ...params, api_key: apiKey },
    timeout: REQUEST_TIMEOUT_MS,
    headers: { Accept: "application/json" },
  }).then((response) => {
    const data = record(response?.data);
    if (data) cache.set(cacheKey, {
      expiresAt: Date.now() + API_CACHE_TTL_MS, value: data,
    });
    return data;
  }).catch(() => {
    // Do not log the Axios error: its config may contain the user's API key.
    return null;
  }).finally(() => cache.delete(pendingKey));
  cache.set(pendingKey, promise);
  return promise;
}

function mapImages(
  source: unknown,
  type: TmdbImageMetadata["type"]
): TmdbImageMetadata[] {
  return rows(source).flatMap((item) => {
    const url = imageUrl(item.file_path);
    if (!url) return [];
    return [{
      type,
      url,
      previewUrl: imageUrl(item.file_path, "w300"),
      language: text(item.iso_639_1)?.toLowerCase() || "xx",
      width: positiveNumber(item.width),
      height: positiveNumber(item.height),
    }];
  });
}

async function loadImages(
  providerContext: ProviderContext,
  apiKey: string,
  path: string,
  originalLanguage?: string
): Promise<TmdbMediaMetadata["images"]> {
  const locales = buildLocalePriority(originalLocale(originalLanguage));
  const languages = Array.from(new Set([
    ...locales.map(languageCodeFromLocale).filter((value) => value !== "xx"),
    "null",
  ])).join(",");
  const data = await request(providerContext, apiKey, `${path}/images`, {
    include_image_language: languages,
  });
  return {
    logos: mergeTmdbImages([mapImages(data?.logos, "logo")], buildLogoLocalePriority()),
    posters: mergeTmdbImages([mapImages(data?.posters, "poster")], locales),
    backdrops: mergeTmdbImages([mapImages(data?.backdrops, "backdrop")], locales),
  };
}

async function loadDetails(
  providerContext: ProviderContext,
  apiKey: string,
  path: string
): Promise<{ pages: Array<{ locale: string; data: ApiRecord }>; locales: string[] }> {
  const primary = await request(providerContext, apiKey, path, {
    language: TMDB_PRIMARY_LOCALE,
  });
  if (!primary) return { pages: [], locales: [] };
  const locales = buildLocalePriority(originalLocale(primary.original_language))
    .filter((locale) => locale !== "xx-XX");
  const otherPages = await Promise.all(
    locales.slice(1).map(async (locale) => ({
      locale,
      data: await request(providerContext, apiKey, path, { language: locale }),
    }))
  );
  return {
    pages: [
      { locale: TMDB_PRIMARY_LOCALE, data: primary },
      ...otherPages.filter((page): page is { locale: string; data: ApiRecord } => !!page.data),
    ],
    locales,
  };
}

function localizedTranslations(
  source: ApiRecord,
  originalLanguage: unknown,
  type: TmdbMediaType
): Array<{ locale: string; data: ApiRecord }> {
  const priority = buildLocalePriority(originalLocale(originalLanguage))
    .filter((locale) => locale !== "xx-XX");
  const translations = rows(source.translations);
  return priority.flatMap((locale) => {
    const [language, region] = locale.toLowerCase().split("-");
    const match = translations.find((item) =>
      item.iso_639_1?.toLowerCase() === language &&
      item.iso_3166_1?.toLowerCase() === region
    ) || translations.find((item) => item.iso_639_1?.toLowerCase() === language);
    const data = record(match?.data);
    if (!data) return [];
    return [{ locale, data }];
  });
}

export async function resolveApiArtwork({
  providerContext, apiKey, id, type, fields, imageSize,
}: {
  providerContext: ProviderContext;
  apiKey: string;
  id: number;
  type: TmdbMediaType;
  fields: TmdbArtworkField[];
  imageSize: TmdbImageSize;
}): Promise<TmdbArtworkMetadata | null> {
  const path = `/${type}/${id}`;
  const details = await request(providerContext, apiKey, path, {
    language: TMDB_PRIMARY_LOCALE,
  });
  if (!details) return null;
  const images = await loadImages(
    providerContext, apiKey, path, details.original_language
  );
  const resize = (url?: string) => url?.replace("/original/", `/${imageSize}/`);
  return {
    id, type, source: "tmdb-api", sourceUrl: `${WEB_BASE_URL}${path}`,
    originalLanguage: originalLocale(details.original_language),
    logo: fields.includes("logo") ? resize(images.logos[0]?.url) : undefined,
    poster: fields.includes("poster")
      ? resize(images.posters[0]?.url || imageUrl(details.poster_path))
      : undefined,
    background: fields.includes("background")
      ? resize(images.backdrops[0]?.url || imageUrl(details.backdrop_path))
      : undefined,
  };
}

function mapEpisode(
  item: ApiRecord,
  mediaId: number,
  seasonNumber: number,
  locale: string
): TmdbEpisodeMetadata | null {
  const episodeNumber = positiveNumber(item.episode_number);
  if (!episodeNumber) return null;
  const still = imageUrl(item.still_path);
  return {
    id: positiveNumber(item.id)?.toString(),
    seasonNumber,
    episodeNumber,
    title: text(item.name) ? { value: text(item.name)!, language: locale } : undefined,
    overview: text(item.overview)
      ? { value: text(item.overview)!, language: locale }
      : undefined,
    airDateText: text(item.air_date)
      ? { value: text(item.air_date)!, language: locale }
      : undefined,
    runtimeMinutes: positiveNumber(item.runtime),
    rating: positiveNumber(item.vote_average),
    thumbnail: imageUrl(item.still_path, "w300"),
    stills: still ? [{ type: "still", url: still, language: "xx" }] : [],
    sourceUrl: `${WEB_BASE_URL}/tv/${mediaId}/season/${seasonNumber}/episode/${episodeNumber}`,
  };
}

export async function resolveApiEpisodeSeason({
  providerContext, apiKey, mediaId, seasonNumber, episodeNumbers = [],
}: {
  providerContext: ProviderContext;
  apiKey: string;
  mediaId: number;
  seasonNumber: number;
  episodeNumbers?: number[];
}): Promise<TmdbSeasonMetadata | null> {
  const series = await request(providerContext, apiKey, `/tv/${mediaId}`, {
    language: TMDB_PRIMARY_LOCALE,
  });
  if (!series) return null;
  const locales = buildLocalePriority(originalLocale(series.original_language))
    .filter((locale) => locale !== "xx-XX");
  const groups: TmdbEpisodeMetadata[][] = [];
  const requested = new Set(episodeNumbers);
  let firstSeason: ApiRecord | null = null;
  for (const locale of locales) {
    const season = await request(
      providerContext, apiKey, `/tv/${mediaId}/season/${seasonNumber}`,
      { language: locale }
    );
    if (!season) continue;
    firstSeason ||= season;
    groups.push(rows(season.episodes)
      .map((episode) => mapEpisode(episode, mediaId, seasonNumber, locale))
      .filter((episode): episode is TmdbEpisodeMetadata => !!episode));
    const merged = mergeTmdbEpisodes(groups);
    if (requested.size > 0 && Array.from(requested).every((number) => {
      const episode = merged.find((item) => item.episodeNumber === number);
      return !!episode?.title?.value && !!episode?.overview?.value;
    })) break;
  }
  if (!firstSeason) return null;
  const episodes = mergeTmdbEpisodes(groups);
  return {
    seasonNumber,
    name: text(firstSeason.name)
      ? { value: text(firstSeason.name)!, language: TMDB_PRIMARY_LOCALE }
      : undefined,
    overview: text(firstSeason.overview)
      ? { value: text(firstSeason.overview)!, language: TMDB_PRIMARY_LOCALE }
      : undefined,
    year: Number.parseInt(text(firstSeason.air_date)?.slice(0, 4) || "", 10) || undefined,
    episodeCount: episodes.length || positiveNumber(firstSeason.episode_count),
    poster: imageUrl(firstSeason.poster_path),
    posters: [], backgrounds: [], episodes,
    sourceUrl: `${WEB_BASE_URL}/tv/${mediaId}/season/${seasonNumber}`,
  };
}

export async function resolveApiSeasonPoster({
  providerContext, apiKey, mediaId, seasonNumber, imageSize,
}: {
  providerContext: ProviderContext;
  apiKey: string;
  mediaId: number;
  seasonNumber: number;
  imageSize: TmdbImageSize;
}): Promise<TmdbArtworkMetadata | null> {
  const path = `/tv/${mediaId}/season/${seasonNumber}`;
  const [series, season] = await Promise.all([
    request(providerContext, apiKey, `/tv/${mediaId}`),
    request(providerContext, apiKey, path, { language: TMDB_PRIMARY_LOCALE }),
  ]);
  if (!season) return null;
  const images = await loadImages(
    providerContext, apiKey, path, series?.original_language
  );
  return {
    id: mediaId, type: "tv", source: "tmdb-api",
    sourceUrl: `${WEB_BASE_URL}${path}`, seasonNumber,
    originalLanguage: originalLocale(series?.original_language),
    poster: (images.posters[0]?.url || imageUrl(season.poster_path))
      ?.replace("/original/", `/${imageSize}/`),
  };
}

export async function resolveApiMedia({
  providerContext, apiKey, id, type, includeImages = true, includeCredits = true,
}: {
  providerContext: ProviderContext;
  apiKey: string;
  id: number;
  type: TmdbMediaType;
  includeImages?: boolean;
  includeCredits?: boolean;
}): Promise<TmdbMediaMetadata | null> {
  const path = `/${type}/${id}`;
  const { pages } = await loadDetails(providerContext, apiKey, path);
  if (!pages.length) return null;
  const primary = pages[0].data;
  const [images, credits, translationResponse] = await Promise.all([
    includeImages
      ? loadImages(providerContext, apiKey, path, primary.original_language)
      : Promise.resolve({ logos: [], posters: [], backdrops: [] }),
    includeCredits
      ? request(providerContext, apiKey, `${path}/credits`)
      : Promise.resolve(null),
    request(providerContext, apiKey, `${path}/translations`),
  ]);
  // A localized details response can silently contain an original-language
  // title. Only the translations endpoint identifies actual translations.
  if (!translationResponse) return null;
  const translations = localizedTranslations(
    translationResponse, primary.original_language, type
  );
  const localized = (field: string) => pickLocalizedText(
    translations, (page) => text(page.data[field]), (page) => page.locale
  );
  const seasons: TmdbSeasonMetadata[] = rows(primary.seasons).flatMap((season) => {
    const seasonNumber = Number(season.season_number);
    if (!Number.isFinite(seasonNumber) || seasonNumber < 0) return [];
    return [{
      seasonNumber,
      name: text(season.name)
        ? { value: text(season.name)!, language: TMDB_PRIMARY_LOCALE }
        : undefined,
      overview: text(season.overview)
        ? { value: text(season.overview)!, language: TMDB_PRIMARY_LOCALE }
        : undefined,
      year: Number.parseInt(text(season.air_date)?.slice(0, 4) || "", 10) || undefined,
      episodeCount: positiveNumber(season.episode_count),
      poster: imageUrl(season.poster_path),
      posters: [], backgrounds: [],
      sourceUrl: `${WEB_BASE_URL}/tv/${id}/season/${seasonNumber}`,
    }];
  });
  const cast = rows(credits?.cast).flatMap((person) => {
    const name = text(person.name);
    return name ? [{
      id: positiveNumber(person.id), name, role: text(person.character),
      profile: imageUrl(person.profile_path),
    }] : [];
  });
  const runtime = positiveNumber(primary.runtime)
    || positiveNumber(Array.isArray(primary.episode_run_time) && primary.episode_run_time[0]);
  return {
    source: "tmdb-api", id, type,
    sourceUrl: `${WEB_BASE_URL}${path}`,
    fetchedAt: new Date().toISOString(),
    originalLanguage: originalLocale(primary.original_language),
    title: localized(type === "movie" ? "title" : "name") ||
      (text(type === "movie" ? primary.original_title : primary.original_name)
        ? {
            value: text(type === "movie" ? primary.original_title : primary.original_name)!,
            language: originalLocale(primary.original_language) || "xx-XX",
          }
        : undefined),
    originalTitle: text(type === "movie" ? primary.original_title : primary.original_name),
    overview: localized("overview"), tagline: localized("tagline"),
    startDate: text(primary.first_air_date), endDate: text(primary.last_air_date),
    releaseDate: text(primary.release_date), status: text(primary.status),
    rating: positiveNumber(primary.vote_average),
    ratingCount: positiveNumber(primary.vote_count),
    numberOfEpisodes: positiveNumber(primary.number_of_episodes),
    numberOfSeasons: positiveNumber(primary.number_of_seasons),
    genres: rows(primary.genres).map((genre) => text(genre.name)).filter((name): name is string => !!name),
    countries: rows(primary.production_countries)
      .map((country) => text(country.name)).filter((name): name is string => !!name),
    facts: runtime ? { Runtime: `${runtime}m` } : {},
    keywords: [],
    networks: rows(primary.networks).map((network) => ({
      id: positiveNumber(network.id), name: text(network.name),
      logo: imageUrl(network.logo_path),
    })),
    socialLinks: {}, cast, crew: [], videos: [], watchProviders: [],
    episodeGroups: [],
    translations: translations.map((page) => ({
      language: page.locale,
      title: text(page.data[type === "movie" ? "title" : "name"]),
      overview: text(page.data.overview), tagline: text(page.data.tagline),
    })),
    images,
    logo: images.logos[0]?.url,
    poster: images.posters[0]?.url || imageUrl(primary.poster_path),
    background: images.backdrops[0]?.url || imageUrl(primary.backdrop_path),
    seasons,
    schema: {},
  };
}
