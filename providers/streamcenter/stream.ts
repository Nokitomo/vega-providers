import { ProviderContext, Stream } from "../types";
import { getStream as getAnimeStream } from "../animeunity/stream";
import { getStream as getStreamingStream } from "../streamingunity/stream";
import { deduplicateStreams } from "../streamDedup";
import { AnimeFallbackPlayback, resolveAnimeFallbackStream } from "./animeFallback";
import { decodeRoute } from "./routing";

type StreamRouteData = {
  url: string;
  fallbacks?: AnimeFallbackPlayback[];
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

  const uniqueFallbacks = (route.data.fallbacks || []).filter(
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
    getAnimeStream({
      link: route.data.url,
      type,
      signal,
      providerContext,
    }),
    ...uniqueFallbacks.map((playback) =>
      resolveAnimeFallbackStream(playback, providerContext, signal)
    ),
  ]).then(deduplicateStreams);
};
