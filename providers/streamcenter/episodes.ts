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

type StreamRouteData = {
  url: string;
  title?: string;
  anilistId?: number;
  malId?: number;
  dubbed?: boolean;
  episodeNumber?: number;
};

const wrapAnimeEpisode = (
  episode: EpisodeLink,
  identity: EpisodesRouteData
): EpisodeLink => ({
  ...episode,
  link: encodeRoute<StreamRouteData>("stream", "animeunity", {
    url: episode.link,
    title: identity.title,
    anilistId: identity.anilistId,
    malId: identity.malId,
    dubbed: identity.dubbed,
    episodeNumber: episode.episodeNumber,
  }),
});

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
      link:
        route.source === "animeunity"
          ? wrapAnimeEpisode(episode, route.data).link
          : encodeRoute<StreamRouteData>("stream", "streamingunity", {
              url: episode.link,
            }),
    })),
  }));
};

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

  return getAnimeEpisodes({
    url: route.data.url,
    providerContext,
    knownEpisodes: sourceKnown,
  }).then((episodes) =>
    episodes.map((episode) => wrapAnimeEpisode(episode, route.data))
  );
};
