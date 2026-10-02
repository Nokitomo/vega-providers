import { EpisodeLink, ProviderContext } from "../types";
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

export const getEpisodes = async function ({
  url,
  providerContext,
}: {
  url: string;
  providerContext: ProviderContext;
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

    const tmdbSeasonTargets = new Map<
      string,
      { mediaId: number; seasonNumber: number; episodeNumbers: Set<number> }
    >();
    episodes.forEach((episode) => {
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

    const tmdbResolved = episodes.map((episode) => {
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
      const tmdbEpisode = season?.episodes?.find((candidate) =>
        tmdbMapping.episodeNumbers.includes(candidate.episodeNumber)
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
        !tmdbEpisode?.title?.value ||
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
