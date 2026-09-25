import { ProviderContext } from "../../types";
import { resolveAniZipMetadata } from "./client";
import {
  AniZipEpisode,
  AniZipEpisodeFallback,
  AniZipEpisodeRequest,
} from "./types";

function findMappedEpisode(
  episodes: AniZipEpisode[],
  request: AniZipEpisodeRequest
): AniZipEpisode | undefined {
  const tvdbMappings = (request.externalMappings || []).filter(
    (mapping) =>
      mapping.provider === "tvdb_show" &&
      mapping.seasonNumber != null &&
      mapping.episodeNumbers.length > 0
  );

  for (const mapping of tvdbMappings) {
    const tvdbShowId = Number.parseInt(mapping.id, 10);
    const exact = episodes.find(
      (episode) =>
        episode.tvdbShowId === tvdbShowId &&
        episode.seasonNumber === mapping.seasonNumber &&
        episode.episodeNumber != null &&
        mapping.episodeNumbers.includes(episode.episodeNumber)
    );
    if (exact) return exact;
  }

  if (request.seasonNumber != null && request.sourceEpisodeNumber != null) {
    const scoped = episodes.find(
      (episode) =>
        episode.seasonNumber === request.seasonNumber &&
        episode.episodeNumber === request.sourceEpisodeNumber
    );
    if (scoped) return scoped;
  }

  if (request.sourceEpisodeNumber == null) return undefined;
  const regularSeasons = new Set(
    episodes
      .map((episode) => episode.seasonNumber)
      .filter((season): season is number => season != null && season > 0)
  );
  if (regularSeasons.size !== 1) return undefined;
  return episodes.find(
    (episode) =>
      episode.seasonNumber === Array.from(regularSeasons)[0] &&
      episode.episodeNumber === request.sourceEpisodeNumber
  );
}

export async function resolveAniZipEpisodeFallbacks({
  providerContext,
  anilistId,
  malId,
  sourceRevision,
  requests,
}: {
  providerContext: ProviderContext;
  anilistId?: number;
  malId?: number;
  sourceRevision?: string;
  requests: AniZipEpisodeRequest[];
}): Promise<Array<AniZipEpisodeFallback | undefined>> {
  if (requests.length === 0) return [];
  const metadata = await resolveAniZipMetadata({
    providerContext,
    anilistId,
    malId,
    sourceRevision,
  });

  return requests.map((request) => {
    const episode = findMappedEpisode(metadata.episodes, request);
    if (!episode) return undefined;
    return {
      title: episode.titleIt || episode.titleEn,
      synopsis: episode.overview,
      thumbnail: episode.image,
    };
  });
}
