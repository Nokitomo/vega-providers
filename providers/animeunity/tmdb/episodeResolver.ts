import { runMetadataTask } from "../metadataTasks";
import { ProviderContext } from "../../types";
import { readTmdbApiKey, resolveApiEpisodeSeason } from "./api";
import { parseTmdbDetailsPage } from "./details";
import { fetchTmdbHtml, TMDB_BASE_URL } from "./http";
import {
  buildLocalePriority,
  resolveOriginalLocale,
  TMDB_NO_LANGUAGE_LOCALE,
  TMDB_PRIMARY_LOCALE,
} from "./locales";
import {
  readTmdbPersistentCache,
  writeTmdbPersistentCache,
} from "./persistentCache";
import {
  mergeTmdbEpisodes,
  parseTmdbSeasonEpisodesPage,
} from "./seasons";
import { TmdbEpisodeMetadata, TmdbSeasonMetadata } from "./types";

const EPISODE_SOFT_TTL_MS = 4 * 60 * 60 * 1000;
const LANGUAGE_SOFT_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_SCHEMA = "v2";

type LocaleSeasonCache = {
  episodes: TmdbEpisodeMetadata[];
  sourceRevision?: string;
};

async function resolveOriginalLanguage(
  providerContext: ProviderContext,
  mediaId: number
): Promise<string | undefined> {
  const key = `animeunity:tmdb:${CACHE_SCHEMA}:language:tv:${mediaId}`;
  const cached = readTmdbPersistentCache<string | undefined>(
    providerContext,
    key
  );
  if (cached && cached.ageMs <= LANGUAGE_SOFT_TTL_MS) return cached.value;
  const html = await fetchTmdbHtml(
    providerContext,
    `/tv/${mediaId}`,
    TMDB_PRIMARY_LOCALE,
    !!cached && cached.ageMs > LANGUAGE_SOFT_TTL_MS
  );
  if (!html) return cached?.value;
  const page = parseTmdbDetailsPage(
    html,
    providerContext.cheerio,
    TMDB_PRIMARY_LOCALE
  );
  const language = resolveOriginalLocale(page.originalLanguageName);
  writeTmdbPersistentCache(providerContext, key, language);
  return language;
}

async function loadSeasonLocale({
  providerContext,
  mediaId,
  seasonNumber,
  locale,
  sourceRevision,
}: {
  providerContext: ProviderContext;
  mediaId: number;
  seasonNumber: number;
  locale: string;
  sourceRevision?: string;
}): Promise<TmdbEpisodeMetadata[]> {
  const key = `animeunity:tmdb:${CACHE_SCHEMA}:season:${mediaId}:${seasonNumber}:${locale}`;
  const cached = readTmdbPersistentCache<LocaleSeasonCache>(providerContext, key);
  const revisionChanged =
    !!sourceRevision && cached?.value.sourceRevision !== sourceRevision;
  if (
    cached &&
    cached.ageMs <= EPISODE_SOFT_TTL_MS &&
    !revisionChanged
  ) {
    return cached.value.episodes;
  }

  const html = await fetchTmdbHtml(
    providerContext,
    `/tv/${mediaId}/season/${seasonNumber}`,
    locale,
    revisionChanged || (!!cached && cached.ageMs > EPISODE_SOFT_TTL_MS)
  );
  if (!html) return cached?.value.episodes || [];
  const episodes = parseTmdbSeasonEpisodesPage(
    html,
    providerContext.cheerio,
    locale,
    mediaId,
    seasonNumber
  );
  writeTmdbPersistentCache(providerContext, key, {
    episodes,
    sourceRevision,
  } as LocaleSeasonCache);
  return episodes;
}

function hasLocalizedText(
  episodes: TmdbEpisodeMetadata[],
  episodeNumbers: Set<number>
): boolean {
  if (episodeNumbers.size === 0) return false;
  return Array.from(episodeNumbers).every((episodeNumber) => {
    const episode = episodes.find(
      (candidate) => candidate.episodeNumber === episodeNumber
    );
    return !!episode?.title?.value && !!episode?.overview?.value;
  });
}

async function resolveTmdbEpisodeSeasonWeb({
  providerContext,
  mediaId,
  seasonNumber,
  episodeNumbers = [],
  sourceRevision,
}: {
  providerContext: ProviderContext;
  mediaId: number;
  seasonNumber: number;
  episodeNumbers?: number[];
  sourceRevision?: string;
}): Promise<TmdbSeasonMetadata | null> {
  if (!Number.isFinite(mediaId) || mediaId <= 0 || seasonNumber < 0) {
    return null;
  }
  const originalLanguage = await resolveOriginalLanguage(
    providerContext,
    mediaId
  );
  const locales = buildLocalePriority(originalLanguage).filter(
    (locale) => locale !== TMDB_NO_LANGUAGE_LOCALE
  );
  const targetNumbers = new Set(episodeNumbers);
  const groups: TmdbEpisodeMetadata[][] = [];

  for (const locale of locales) {
    const localized = await loadSeasonLocale({
      providerContext,
      mediaId,
      seasonNumber,
      locale,
      sourceRevision,
    });
    groups.push(localized);
    const merged = mergeTmdbEpisodes(groups);
    if (hasLocalizedText(merged, targetNumbers)) break;
  }

  const episodes = mergeTmdbEpisodes(groups);
  return {
    seasonNumber,
    episodeCount: episodes.length,
    posters: [],
    backgrounds: [],
    episodes,
    sourceUrl: `${TMDB_BASE_URL}/tv/${mediaId}/season/${seasonNumber}`,
  };
}

async function resolveTmdbEpisodeSeasonMetadataUncached(args: {
  providerContext: ProviderContext;
  mediaId: number;
  seasonNumber: number;
  episodeNumbers?: number[];
  sourceRevision?: string;
}): Promise<TmdbSeasonMetadata | null> {
  const { providerContext, mediaId, seasonNumber } = args;
  if (!Number.isFinite(mediaId) || mediaId <= 0 || seasonNumber < 0) return null;
  const apiKey = await readTmdbApiKey(providerContext);
  if (!apiKey) return resolveTmdbEpisodeSeasonWeb(args);
  const api = await resolveApiEpisodeSeason({
    providerContext, apiKey, mediaId, seasonNumber,
    episodeNumbers: args.episodeNumbers,
  });
  const targets = args.episodeNumbers || [];
  if (api?.episodes?.length && targets.every((number) => {
    const episode = api.episodes?.find((item) => item.episodeNumber === number);
    return !!episode?.title?.value && !!episode?.overview?.value &&
      !!episode?.thumbnail;
  })) return api;
  const web = await resolveTmdbEpisodeSeasonWeb(args);
  if (!api) return web;
  if (!web) return api;
  const byNumber = new Map((web.episodes || []).map((item) => [
    item.episodeNumber, item,
  ]));
  for (const episode of api.episodes || []) {
    const fallback = byNumber.get(episode.episodeNumber);
    byNumber.set(episode.episodeNumber, fallback ? {
      ...fallback, ...episode,
      title: episode.title || fallback.title,
      overview: episode.overview || fallback.overview,
      thumbnail: episode.thumbnail || fallback.thumbnail,
      stills: episode.stills.length ? episode.stills : fallback.stills,
    } : episode);
  }
  return {
    ...web, ...api,
    episodes: Array.from(byNumber.values()).sort(
      (left, right) => left.episodeNumber - right.episodeNumber
    ),
  };
}

export function resolveTmdbEpisodeSeasonMetadata(args: Parameters<typeof resolveTmdbEpisodeSeasonMetadataUncached>[0]): ReturnType<typeof resolveTmdbEpisodeSeasonMetadataUncached> {
  return runMetadataTask(args, "tmdb", "episodes", episodeNumbers =>
    resolveTmdbEpisodeSeasonMetadataUncached({...args, episodeNumbers: episodeNumbers ?? args.episodeNumbers}));
}
