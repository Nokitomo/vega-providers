import { EpisodeLink, ProviderContext } from "../../types";
import { readExternalCache, writeExternalCache } from "../externalCache";
import { getProviderRuntimeCache } from "../mappings/runtimeCache";
import { fetchTvdbHtml, TVDB_BASE_URL } from "./http";
import { extractTvdbEntityPath } from "./parser";

const CACHE_SCHEMA = "v1";
const SOFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TEXT_LANGUAGE_PRIORITY = ["ita", "eng"];

type TvdbEpisodeFallback = {
  episodeNumber: number;
  title?: string;
  synopsis?: string;
  thumbnail?: string;
};

type TvdbEpisodeCacheValue = {
  episodes: TvdbEpisodeFallback[];
  sourceRevision?: string;
};

function cleanText(value: string): string | undefined {
  const text = value.replace(/\s+/g, " ").trim();
  return text || undefined;
}

function normalizeImageUrl(value?: string): string | undefined {
  const text = String(value || "").trim();
  return /^https:\/\/artworks\.thetvdb\.com\//i.test(text) ? text : undefined;
}

function parseSeasonEpisodeLinks(
  html: string,
  cheerio: any
): Array<{ episodeNumber: number; href: string }> {
  const $ = cheerio.load(html);
  const output: Array<{ episodeNumber: number; href: string }> = [];
  const seen = new Set<string>();
  $('a[href*="/episodes/"]').each((_: number, element: any) => {
    const href = String($(element).attr("href") || "").trim();
    if (!href || seen.has(href)) return;
    seen.add(href);
    output.push({ episodeNumber: output.length + 1, href });
  });
  return output;
}

function parseEpisodePage(
  html: string,
  cheerio: any,
  episodeNumber: number
): TvdbEpisodeFallback {
  const $ = cheerio.load(html);
  const translations = new Map<string, { title?: string; synopsis?: string }>();

  $(".change_translation_text[data-language]").each((_: number, element: any) => {
    const container = $(element);
    const language = String(container.attr("data-language") || "")
      .trim()
      .toLowerCase();
    if (!TEXT_LANGUAGE_PRIORITY.includes(language)) return;
    translations.set(language, {
      title: cleanText(String(container.attr("data-title") || "")),
      synopsis: cleanText(container.find("p").first().text()),
    });
  });

  const text =
    TEXT_LANGUAGE_PRIORITY.map((language) => translations.get(language)).find(
      (value) => value?.title || value?.synopsis
    ) || {};
  const thumbnail = normalizeImageUrl(
    [
      ...html.matchAll(
        /https:\/\/artworks\.thetvdb\.com\/banners\/v4\/episode\/[^"'\s<>]+/gi
      ),
    ][0]?.[0]
  );

  return {
    episodeNumber,
    title: text.title,
    synopsis: text.synopsis,
    thumbnail,
  };
}

export async function resolveTvdbEpisodeFallbacks({
  providerContext,
  tvdbShowId,
  seasonNumber,
  episodeNumbers,
  sourceRevision,
}: {
  providerContext: ProviderContext;
  tvdbShowId?: number;
  seasonNumber?: number;
  episodeNumbers: number[];
  sourceRevision?: string;
}): Promise<TvdbEpisodeFallback[]> {
  const showId = Math.trunc(Number(tvdbShowId));
  if (
    !Number.isFinite(showId) ||
    showId <= 0 ||
    seasonNumber == null ||
    seasonNumber < 0 ||
    episodeNumbers.length === 0
  ) {
    return [];
  }

  const requested = Array.from(
    new Set(
      episodeNumbers
        .map((value) => Math.trunc(Number(value)))
        .filter((value) => Number.isFinite(value) && value > 0)
    )
  );
  if (requested.length === 0) return [];

  const persistentKey = `animeunity:tvdb:${CACHE_SCHEMA}:episodes:${showId}:season:${seasonNumber}`;
  const cached = readExternalCache<TvdbEpisodeCacheValue>(
    providerContext,
    persistentKey,
    SOFT_TTL_MS
  );
  const revisionChanged =
    !!sourceRevision && cached?.value.sourceRevision !== sourceRevision;
  if (cached && !revisionChanged) {
    const cachedEpisodes = cached.value.episodes.filter((episode) =>
      requested.includes(episode.episodeNumber)
    );
    if (cachedEpisodes.length === requested.length) return cachedEpisodes;
  }

  const runtimeCache = getProviderRuntimeCache(providerContext);
  const pendingKey = `${persistentKey}:pending:${sourceRevision || "none"}`;
  const pending = runtimeCache.get(pendingKey) as
    | Promise<TvdbEpisodeFallback[]>
    | undefined;
  if (pending) return pending;

  const request = (async (): Promise<TvdbEpisodeFallback[]> => {
    const seriesResponse = await fetchTvdbHtml(
      providerContext,
      `/?id=${encodeURIComponent(String(showId))}&tab=series`,
      revisionChanged
    );
    if (!seriesResponse) return cached?.value.episodes || [];
    const seriesPath = extractTvdbEntityPath(
      seriesResponse.html,
      "series",
      seriesResponse.url
    );
    if (!seriesPath) return cached?.value.episodes || [];

    const seasonPath = `${seriesPath}/seasons/official/${encodeURIComponent(
      String(seasonNumber)
    )}`;
    const seasonResponse = await fetchTvdbHtml(providerContext, seasonPath);
    if (!seasonResponse) return cached?.value.episodes || [];
    const links = parseSeasonEpisodeLinks(
      seasonResponse.html,
      providerContext.cheerio
    ).filter((episode) => requested.includes(episode.episodeNumber));

    const episodes = await Promise.all(
      links.map(async (episode) => {
        const url = episode.href.startsWith("http")
          ? episode.href
          : `${TVDB_BASE_URL}${episode.href}`;
        const detail = await fetchTvdbHtml(providerContext, url);
        return detail
          ? parseEpisodePage(
              detail.html,
              providerContext.cheerio,
              episode.episodeNumber
            )
          : { episodeNumber: episode.episodeNumber };
      })
    );

    const merged = [
      ...(cached?.value.episodes || []).filter(
        (episode) =>
          !episodes.some(
            (candidate) => candidate.episodeNumber === episode.episodeNumber
          )
      ),
      ...episodes,
    ];
    writeExternalCache(providerContext, persistentKey, {
      episodes: merged,
      sourceRevision,
    } as TvdbEpisodeCacheValue);
    return episodes;
  })()
    .catch(() => cached?.value.episodes || [])
    .finally(() => runtimeCache.delete(pendingKey));

  runtimeCache.set(pendingKey, request);
  return request;
}

