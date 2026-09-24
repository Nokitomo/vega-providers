import { EpisodeLink, ProviderContext } from "../types";
import { DEFAULT_HEADERS, DEFAULT_BASE_HOST, TIMEOUTS } from "./config";
import {
  buildEpisodeFetchRanges,
  parseEpisodeRangeRequest,
} from "./episodeRanges";
import {
  resolveAniBridgeEpisodeMappings,
  resolveAnimeMappings,
} from "./mappings";
import { resolveTmdbSeasonMetadata } from "./tmdb";

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
        const list = res.data?.episodes || [];
        list.forEach((episode: any) => {
          const number = normalizeEpisodeNumber(episode?.number);
          const id = episode?.id;
          if (!id) return;
          const link = String(id);
          if (seenEpisodeIds.has(link)) return;
          seenEpisodeIds.add(link);
          const hasNumber = !!number;
          const parsedEpisodeNumber = parseEpisodeNumber(number);
          const mappedEpisode =
            parsedEpisodeNumber != null
              ? resolveAniBridgeEpisodeMappings(
                  mappingResolution,
                  parsedEpisodeNumber
                )
              : undefined;
          const title = hasNumber ? `Episode ${number}` : "Episode";
          episodes.push({
            title,
            titleKey: hasNumber ? "Episode {{number}}" : "Episode",
            titleParams: hasNumber ? { number } : undefined,
            episodeNumber: parsedEpisodeNumber,
            sourceEpisodeNumber: parsedEpisodeNumber,
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
      { mediaId: number; seasonNumber: number }
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
        tmdbSeasonTargets.set(key, {
          mediaId,
          seasonNumber: mapping.seasonNumber,
        });
      });
    });

    const tmdbSeasons = new Map<string, Awaited<ReturnType<typeof resolveTmdbSeasonMetadata>>>();
    await Promise.all(
      Array.from(tmdbSeasonTargets.entries()).map(async ([key, target]) => {
        const season = await resolveTmdbSeasonMetadata({
          providerContext,
          ...target,
        });
        tmdbSeasons.set(key, season);
      })
    );

    return episodes.map((episode) => {
      const tmdbMapping = episode.externalMappings?.find(
        (mapping) =>
          mapping.provider === "tmdb_show" &&
          mapping.seasonNumber != null &&
          mapping.episodeNumbers.length > 0
      );
      if (!tmdbMapping || tmdbMapping.seasonNumber == null) return episode;
      const season = tmdbSeasons.get(
        `${tmdbMapping.id}:${tmdbMapping.seasonNumber}`
      );
      const tmdbEpisode = season?.episodes?.find((candidate) =>
        tmdbMapping.episodeNumbers.includes(candidate.episodeNumber)
      );
      if (!tmdbEpisode) return episode;

      return {
        ...episode,
        title: tmdbEpisode.title?.value || episode.title,
        titleKey: tmdbEpisode.title?.value ? undefined : episode.titleKey,
        titleParams: tmdbEpisode.title?.value ? undefined : episode.titleParams,
        synopsis: tmdbEpisode.overview?.value,
        thumbnail: tmdbEpisode.thumbnail,
      };
    });
  } catch (err) {
    console.error("animeunity episodes error", err);
    return [];
  }
};
