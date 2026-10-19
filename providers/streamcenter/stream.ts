import { ProviderContext, Stream } from "../types";
import { getStream as getAnimeStream } from "../animeunity/stream";
import { getStream as getStreamingStream } from "../streamingunity/stream";
import { deduplicateStreams } from "../streamDedup";
import {
  AnimeFallbackPlayback,
  discoverAnimeFallbackEpisodes,
  resolveAnimeFallbackStream,
} from "./animeFallback";
import { decodeRoute } from "./routing";
import { normalizeEpisodeNumber } from "./animeFallback/utils";

type StreamRouteData = {
  url: string;
  fallbacks?: AnimeFallbackPlayback[];
  title?: string;
  anilistId?: number;
  malId?: number;
  dubbed?: boolean;
  episodeNumber?: number | string;
};

const collectStreams = (
  tasks: Array<Promise<Stream[]>>
): Promise<Stream[]> =>
  Promise.allSettled(tasks).then((results) =>
    results.flatMap((result) =>
      result.status === "fulfilled" && Array.isArray(result.value)
        ? result.value
        : []
    )
  );

export const getStream = function ({
  link,
  type,
  signal,
  providerContext,
}: {
  link: string;
  type: string;
  signal: AbortSignal;
  providerContext: ProviderContext;
}): Promise<Stream[]> {
  if (signal?.aborted) return Promise.resolve([]);
  const route = decodeRoute<StreamRouteData>(link, "stream");
  if (!route?.data?.url) return Promise.resolve([]);

  if (route.source === "streamingunity") {
    return getStreamingStream({
      link: route.data.url,
      type,
      signal,
      providerContext,
    });
  }

  const episodeNumber = normalizeEpisodeNumber(route.data.episodeNumber);
  const fallbackPromise =
    route.data.fallbacks || !route.data.title || !episodeNumber
      ? Promise.resolve(route.data.fallbacks || [])
      : discoverAnimeFallbackEpisodes(
          {
            title: route.data.title,
            anilistId: route.data.anilistId,
            malId: route.data.malId,
            dubbed: route.data.dubbed,
          },
          providerContext,
          signal
        )
          .then((byEpisode) =>
            byEpisode.get(episodeNumber || "") || []
          )
          .catch(() => []);
  const primaryStream = getAnimeStream({
    link: route.data.url,
    type,
    signal,
    providerContext,
  }).catch(() => [] as Stream[]);
  return fallbackPromise.then((fallbacks) => {
    const uniqueFallbacks = fallbacks.filter(
      (playback, index, values) =>
        values.findIndex(
          (candidate) =>
            candidate.source === playback.source &&
            candidate.label === playback.label &&
            (candidate.source === "animeworld"
              ? candidate.episodeToken ===
                (playback.source === "animeworld" ? playback.episodeToken : "")
              : candidate.watchUrl ===
                (playback.source === "animesaturn" ? playback.watchUrl : ""))
        ) === index
    );
    return collectStreams([
      primaryStream,
      ...uniqueFallbacks.map((playback) =>
        resolveAnimeFallbackStream(playback, providerContext, signal)
      ),
    ]).then(deduplicateStreams);
  });
};
