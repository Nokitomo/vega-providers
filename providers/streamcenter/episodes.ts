import { EpisodeLink, ProviderContext } from "../types";
import { getEpisodes as getAnimeEpisodes } from "../animeunity/episodes";
import { getEpisodes as getStreamingEpisodes } from "../streamingunity/episodes";
import { EpisodesRouteData } from "./content";
import { decodeRoute, encodeRoute } from "./routing";
import {
  AnimeFallbackPlayback,
  discoverAnimeFallbackEpisodes,
} from "./animeFallback";
import { normalizeEpisodeNumber } from "./animeFallback/utils";

type StreamRouteData = {
  url: string;
  fallbacks?: AnimeFallbackPlayback[];
};

const episodeKey = (episode: EpisodeLink): string | null =>
  normalizeEpisodeNumber(
    episode.episodeNumber ??
      String(episode.title || "").match(/(?:episode|episodio)\s+([0-9.]+)/i)?.[1]
  );

export const getEpisodes = function ({
  url,
  providerContext,
}: {
  url: string;
  providerContext: ProviderContext;
}): Promise<EpisodeLink[]> {
  const route = decodeRoute<EpisodesRouteData>(url, "episodes");
  if (!route?.data?.url) return Promise.resolve([]);

  if (route.source === "streamingunity") {
    return getStreamingEpisodes({
      url: route.data.url,
      providerContext,
    }).then((episodes) =>
      episodes.map((episode) => ({
        ...episode,
        link: encodeRoute<StreamRouteData>("stream", "streamingunity", {
          url: episode.link,
        }),
      }))
    );
  }

  return Promise.all([
    getAnimeEpisodes({ url: route.data.url, providerContext }),
    discoverAnimeFallbackEpisodes(
      {
        title: route.data.title,
        anilistId: route.data.anilistId,
        malId: route.data.malId,
        dubbed: route.data.dubbed,
      },
      providerContext
    ),
  ]).then(([episodes, fallbackMap]) =>
    episodes.map((episode) => {
      const key = episodeKey(episode);
      return {
        ...episode,
        link: encodeRoute<StreamRouteData>("stream", "animeunity", {
          url: episode.link,
          fallbacks: key ? fallbackMap.get(key) || [] : [],
        }),
      };
    })
  );
};
