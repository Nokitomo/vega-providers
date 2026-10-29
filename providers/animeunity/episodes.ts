import { EpisodeInventory, EpisodeLink, ProviderContext } from "../types";
import { DEFAULT_HEADERS, DEFAULT_BASE_HOST, TIMEOUTS } from "./config";
import {
  buildEpisodeFetchRanges,
  parseEpisodeRangeRequest,
} from "./episodeRanges";
import {
  parseAniBridgeDescriptor,
  parseSeasonScope,
  resolveAniBridgeEpisodeMappings,
  resolveAnimeMappings,
} from "./mappings";
import { resolveTmdbEpisodeSeasonMetadata } from "./tmdb";
import { resolveAniZipEpisodeFallbacks } from "./anizip";
import { parseAnimeUnityEpisodeSpan } from "./episodeRecords";

export function selectUnambiguousMappedEpisode<T extends { episodeNumber: number }>(
  episodes: T[],
  episodeNumbers: number[]
): T | undefined {
  const matches = episodes.filter((episode) =>
    episodeNumbers.includes(episode.episodeNumber)
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeEpisodeNumber(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const text = String(value).trim();
  return text ? text : undefined;
}

function parseEpisodeNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** A complete provider-only inventory; no TMDB, TVDB or AniZip requests. */
export const getEpisodeInventory = async ({
  url,
  providerContext,
}: {
  url: string;
  providerContext: ProviderContext;
}): Promise<EpisodeInventory> => {
  const request = parseEpisodeRangeRequest(url);
  if (!request) {
    throw new Error("Invalid AnimeUnity episode range");
  }
  const baseHost = normalizeBaseUrl(
    (await providerContext.getBaseUrl("animeunity")) || DEFAULT_BASE_HOST
  );
  const headers = { ...DEFAULT_HEADERS, Referer: `${baseHost}/` };
  const infoResponse = await providerContext.axios.get(
    `${baseHost}/info_api/${request.animeId}/`,
    { headers, timeout: TIMEOUTS.LONG }
  );
  const totalCount = Number(infoResponse.data?.episodes_count);
  if (!Number.isFinite(totalCount) || totalCount < 0) {
    throw new Error("AnimeUnity episode count unavailable");
  }
  if (totalCount === 0) {
    return { episodes: [], complete: true };
  }

  const episodes: EpisodeLink[] = [];
  const seen = new Set<string>();
  for (const { start, end } of buildEpisodeFetchRanges(request, totalCount)) {
    const response = await providerContext.axios.get(
      `${baseHost}/info_api/${request.animeId}/1?start_range=${start}&end_range=${end}`,
      { headers, timeout: TIMEOUTS.LONG }
    );
    if (!Array.isArray(response.data?.episodes)) {
      throw new Error("Incomplete AnimeUnity episode inventory");
    }
    for (const record of response.data.episodes) {
      const link = String(record?.id || "").trim();
      if (!link || seen.has(link)) continue;
      seen.add(link);
      const number = normalizeEpisodeNumber(record?.number);
      const span = parseAnimeUnityEpisodeSpan(number);
      const isRange = !!span && span.end > span.start;
      episodes.push({
        link,
        title: number
          ? isRange
            ? `Episodes ${span.start}-${span.end}`
            : `Episode ${number}`
          : "Episode",
        titleKey: number
          ? isRange
            ? "Episodes {{start}}-{{end}}"
            : "Episode {{number}}"
          : "Episode",
        titleParams: number
          ? isRange
            ? { start: span.start, end: span.end }
            : { number }
          : undefined,
        episodeNumber: parseEpisodeNumber(number),
        sourceEpisodeNumber: parseEpisodeNumber(number),
        sourceEpisodeEndNumber: isRange ? span.end : undefined,
      });
    }
  }
  episodes.sort(
    (left, right) =>
      (left.sourceEpisodeNumber || 0) - (right.sourceEpisodeNumber || 0)
  );
  return { episodes, complete: true };
};

export const getEpisodes = async function ({
  url,
  providerContext,
  knownEpisodes = [],
}: {
  url: string;
  providerContext: ProviderContext;
  knownEpisodes?: EpisodeLink[];
}): Promise<EpisodeLink[]> {
  try {
    const { axios } = providerContext;
    const resolved =
      (await providerContext.getBaseUrl("animeunity")) || DEFAULT_BASE_HOST;
    const baseHost = normalizeBaseUrl(resolved);
    const request = parseEpisodeRangeRequest(url);
    if (!request) return [];
    const animeId = request.animeId;
    const preferredMapping = parseAniBridgeDescriptor(
      request.mappingDescriptor
    );

    const infoRes = await axios.get(`${baseHost}/info_api/${animeId}/`, {
      headers: {
        ...DEFAULT_HEADERS,
        Referer: `${baseHost}/`,
      },
      timeout: TIMEOUTS.LONG,
    });
    const totalCount = infoRes.data?.episodes_count || 0;
    if (!totalCount) return [];
    const anilistId = Number(infoRes.data?.anilist_id) || undefined;
    const malId = Number(infoRes.data?.mal_id) || undefined;
    const mappingResolution = await resolveAnimeMappings({
      providerContext,
      anilistId,
      malId,
      isMovie: false,
      includeLegacyImdb: false,
    });

    const episodes: EpisodeLink[] = [];
    const seenEpisodeIds = new Set<string>();
    let recordAlignedEpisodeIndex = 0;
    const ranges = buildEpisodeFetchRanges(request, totalCount);
    for (const { start, end } of ranges) {
      const rangeUrl = `${baseHost}/info_api/${animeId}/1?start_range=${start}&end_range=${end}`;
      try {
        const res = await axios.get(rangeUrl, {
          headers: {
            ...DEFAULT_HEADERS,
            Referer: `${baseHost}/`,
          },
          timeout: TIMEOUTS.LONG,
        });
        const list = [...(res.data?.episodes || [])].sort((left: any, right: any) => {
          const leftSpan = parseAnimeUnityEpisodeSpan(left?.number);
          const rightSpan = parseAnimeUnityEpisodeSpan(right?.number);
          return (leftSpan?.start || 0) - (rightSpan?.start || 0);
        });
        list.forEach((episode: any) => {
          const number = normalizeEpisodeNumber(episode?.number);
          const sourceSpan = parseAnimeUnityEpisodeSpan(number);
          const id = episode?.id;
          if (!id) return;
          const link = String(id);
          if (seenEpisodeIds.has(link)) return;
          seenEpisodeIds.add(link);
          const hasNumber = !!number;
          const parsedEpisodeNumber = parseEpisodeNumber(number);
          const isRequestedRecord =
            !!request.recordAligned &&
            !!sourceSpan &&
            sourceSpan.start >= request.start &&
            sourceSpan.end <= (request.end ?? totalCount);
          const recordEpisodeNumber = isRequestedRecord
            ? ++recordAlignedEpisodeIndex
            : undefined;
          let mappedEpisode =
            parsedEpisodeNumber != null
              ? resolveAniBridgeEpisodeMappings(
                  mappingResolution,
                  parsedEpisodeNumber,
                  preferredMapping?.provider === "tmdb_show"
                    ? preferredMapping
                    : undefined
                )
              : undefined;
          if (
            recordEpisodeNumber != null &&
            preferredMapping?.provider === "tmdb_show"
          ) {
            const preferredSeason = parseSeasonScope(preferredMapping.scope);
            if (preferredSeason != null) {
              mappedEpisode = {
                seasonNumber: preferredSeason,
                mappings: [
                  ...(mappedEpisode?.mappings || []).filter(
                    (mapping) => mapping.provider !== "tmdb_show"
                  ),
                  {
                    provider: "tmdb_show",
                    id: preferredMapping.id,
                    scope: preferredMapping.scope,
                    seasonNumber: preferredSeason,
                    episodeNumbers: [recordEpisodeNumber],
                  },
                ],
              };
            }
          } else if (
            mappedEpisode &&
            parsedEpisodeNumber != null &&
            preferredMapping?.provider === "tmdb_show" &&
            !mappedEpisode.mappings.some(
              (mapping) =>
                mapping.provider === preferredMapping.provider &&
                mapping.id === preferredMapping.id &&
                mapping.scope === preferredMapping.scope
            )
          ) {
            const preferredSeason = parseSeasonScope(preferredMapping.scope);
            if (preferredSeason != null) {
              mappedEpisode = {
                seasonNumber: preferredSeason,
                mappings: [
                  ...mappedEpisode.mappings.filter(
                    (mapping) => mapping.provider !== "tmdb_show"
                  ),
                  {
                    provider: "tmdb_show",
                    id: preferredMapping.id,
                    scope: preferredMapping.scope,
                    seasonNumber: preferredSeason,
                    episodeNumbers: [parsedEpisodeNumber],
                  },
                ],
              };
            }
          }
          const isEpisodeRange =
            !!sourceSpan && sourceSpan.end > sourceSpan.start;
          const title = hasNumber
            ? isEpisodeRange
              ? `Episodes ${sourceSpan.start}-${sourceSpan.end}`
              : `Episode ${number}`
            : "Episode";
          episodes.push({
            title,
            titleKey: hasNumber
              ? isEpisodeRange
                ? "Episodes {{start}}-{{end}}"
                : "Episode {{number}}"
              : "Episode",
            titleParams: hasNumber
              ? isEpisodeRange
                ? { start: sourceSpan.start, end: sourceSpan.end }
                : { number }
              : undefined,
            episodeNumber: parsedEpisodeNumber,
            sourceEpisodeNumber: parsedEpisodeNumber,
            sourceEpisodeEndNumber: isEpisodeRange
              ? sourceSpan.end
              : undefined,
            seasonNumber: mappedEpisode?.seasonNumber,
            externalMappings:
              mappedEpisode && mappedEpisode.mappings.length > 0
                ? mappedEpisode.mappings
                : undefined,
            link,
          });
        });
      } catch (_) {
        // Skip failed range and continue with the next one.
      }
    }

    const knownByLink = new Map(knownEpisodes.map((episode) => [episode.link, episode]));
    const mergedEpisodes = episodes.map((episode) => {
      const previous = knownByLink.get(episode.link);
      return previous
        ? {
            ...episode,
            ...previous,
            link: episode.link,
            episodeNumber: episode.episodeNumber,
            sourceEpisodeNumber: episode.sourceEpisodeNumber,
            sourceEpisodeEndNumber: episode.sourceEpisodeEndNumber,
          }
        : episode;
    });

    const tmdbSeasonTargets = new Map<
      string,
      { mediaId: number; seasonNumber: number; episodeNumbers: Set<number> }
    >();
    mergedEpisodes.forEach((episode) => {
      if (knownByLink.has(episode.link)) return;
      episode.externalMappings?.forEach((mapping) => {
        if (
          mapping.provider !== "tmdb_show" ||
          mapping.seasonNumber == null
        ) {
          return;
        }
        const mediaId = Number.parseInt(mapping.id, 10);
        if (!Number.isFinite(mediaId) || mediaId <= 0) return;
        const key = `${mediaId}:${mapping.seasonNumber}`;
        const target = tmdbSeasonTargets.get(key) || {
          mediaId,
          seasonNumber: mapping.seasonNumber,
          episodeNumbers: new Set<number>(),
        };
        mapping.episodeNumbers.forEach((number) =>
          target.episodeNumbers.add(number)
        );
        tmdbSeasonTargets.set(key, target);
      });
    });

    const tmdbSeasons = new Map<
      string,
      Awaited<ReturnType<typeof resolveTmdbEpisodeSeasonMetadata>>
    >();
    await Promise.all(
      Array.from(tmdbSeasonTargets.entries()).map(async ([key, target]) => {
        const season = await resolveTmdbEpisodeSeasonMetadata({
          providerContext,
          mediaId: target.mediaId,
          seasonNumber: target.seasonNumber,
          episodeNumbers: Array.from(target.episodeNumbers),
          sourceRevision: String(totalCount),
        });
        tmdbSeasons.set(key, season);
      })
    );

    const tmdbResolved = mergedEpisodes.map((episode) => {
      if (knownByLink.has(episode.link)) {
        return { episode, tmdbEpisode: undefined };
      }
      const tmdbMapping = episode.externalMappings?.find(
        (mapping) =>
          mapping.provider === "tmdb_show" &&
          mapping.seasonNumber != null &&
          mapping.episodeNumbers.length > 0
      );
      if (!tmdbMapping || tmdbMapping.seasonNumber == null) {
        return { episode, tmdbEpisode: undefined };
      }
      const season = tmdbSeasons.get(
        `${tmdbMapping.id}:${tmdbMapping.seasonNumber}`
      );
      const tmdbEpisode = selectUnambiguousMappedEpisode(
        season?.episodes || [], tmdbMapping.episodeNumbers
      );
      if (!tmdbEpisode) return { episode, tmdbEpisode: undefined };

      return {
        episode: {
          ...episode,
          title: tmdbEpisode.title?.value || episode.title,
          titleKey: tmdbEpisode.title?.value ? undefined : episode.titleKey,
          titleParams: tmdbEpisode.title?.value
            ? undefined
            : episode.titleParams,
          synopsis: tmdbEpisode.overview?.value || episode.synopsis,
          thumbnail: tmdbEpisode.thumbnail || episode.thumbnail,
        },
        tmdbEpisode,
      };
    });

    const missingIndexes = tmdbResolved
      .map(({ tmdbEpisode }, index) =>
        knownByLink.has(mergedEpisodes[index].link)
          ? -1
          : !tmdbEpisode?.title?.value ||
              !tmdbEpisode?.overview?.value ||
              !tmdbEpisode?.thumbnail
            ? index
            : -1
      )
      .filter((index) => index >= 0);
    if (missingIndexes.length === 0) {
      return tmdbResolved.map(({ episode }) => episode);
    }

    const aniZipFallbacks = await resolveAniZipEpisodeFallbacks({
      providerContext,
      anilistId,
      malId,
      sourceRevision: String(totalCount),
      requests: missingIndexes.map((index) => {
        const episode = tmdbResolved[index].episode;
        return {
          sourceEpisodeNumber: episode.sourceEpisodeNumber,
          seasonNumber: episode.seasonNumber,
          externalMappings: episode.externalMappings,
        };
      }),
    });
    const fallbackByIndex = new Map(
      missingIndexes.map((episodeIndex, fallbackIndex) => [
        episodeIndex,
        aniZipFallbacks[fallbackIndex],
      ])
    );

    return tmdbResolved.map(({ episode, tmdbEpisode }, index) => {
      const fallback = fallbackByIndex.get(index);
      if (!fallback) return episode;
      const fallbackTitle = !tmdbEpisode?.title?.value
        ? fallback.title
        : undefined;
      return {
        ...episode,
        title: fallbackTitle || episode.title,
        titleKey: fallbackTitle ? undefined : episode.titleKey,
        titleParams: fallbackTitle ? undefined : episode.titleParams,
        synopsis: episode.synopsis || fallback.synopsis,
        thumbnail: episode.thumbnail || fallback.thumbnail,
      };
    });
  } catch (err) {
    console.error("animeunity episodes error", err);
    return [];
  }
};
