import { EpisodeInventory, EpisodeLink, ProviderContext } from "../types";
import {
  getEpisodeInventory as getAnimeEpisodeInventory,
  getEpisodes as getAnimeEpisodes,
} from "../animeunity/episodes";
import {
  getEpisodeInventory as getStreamingEpisodeInventory,
  getEpisodes as getStreamingEpisodes,
} from "../streamingunity/episodes";
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

export const getEpisodeInventory = ({
  url,
  providerContext,
}: {
  url: string;
  providerContext: ProviderContext;
}): Promise<EpisodeInventory> => {
  const route = decodeRoute<EpisodesRouteData>(url, "episodes");
  if (!route?.data?.url) {
    throw new Error("Invalid StreamCenter episode route");
  }
  const inventoryPromise =
    route.source === "animeunity"
      ? getAnimeEpisodeInventory({url: route.data.url, providerContext})
      : getStreamingEpisodeInventory({url: route.data.url, providerContext});
  return inventoryPromise.then((inventory): EpisodeInventory => ({
    complete: true,
    episodes: inventory.episodes.map((episode) => ({
      ...episode,
      link: encodeRoute<StreamRouteData>("stream", route.source, {
        url: episode.link,
      }),
    })),
  }));
};

const episodeKey = (episode: EpisodeLink): string | null =>
  normalizeEpisodeNumber(
    episode.episodeNumber ??
      String(episode.title || "").match(/(?:episode|episodio)\s+([0-9.]+)/i)?.[1]
  );

export const getEpisodes = function ({
  url,
  providerContext,
  knownEpisodes = [],
}: {
  url: string;
  providerContext: ProviderContext;
  knownEpisodes?: EpisodeLink[];
}): Promise<EpisodeLink[]> {
  const route = decodeRoute<EpisodesRouteData>(url, "episodes");
  if (!route?.data?.url) return Promise.resolve([]);

  const sourceKnown = knownEpisodes.flatMap((episode) => {
    const decoded = decodeRoute<StreamRouteData>(episode.link, "stream");
    return decoded?.source === route.source && decoded.data?.url
      ? [{...episode, link: decoded.data.url}]
      : [];
  });

  if (route.source === "streamingunity") {
    return getStreamingEpisodes({
      url: route.data.url,
      providerContext,
      knownEpisodes: sourceKnown,
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
    getAnimeEpisodes({
      url: route.data.url,
      providerContext,
      knownEpisodes: sourceKnown,
    }),
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
