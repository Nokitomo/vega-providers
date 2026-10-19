import { ProviderContext, Stream } from "../../types";
import { AnimeFallbackContext, AnimeFallbackEpisodeMap, AnimeFallbackPlayback } from "./types";
import { discoverAnimeWorldEpisodes, resolveAnimeWorldStream } from "./animeWorld";
import { discoverAnimeSaturnEpisodes, resolveAnimeSaturnStream } from "./animeSaturn";

export type { AnimeFallbackPlayback } from "./types";

const DISCOVERY_TIMEOUT_MS = 15_000;

export const discoverAnimeFallbackEpisodes = async (
  identity: AnimeFallbackContext,
  providerContext: ProviderContext,
  signal?: AbortSignal
): Promise<AnimeFallbackEpisodeMap> => {
  if (signal?.aborted) return new Map();
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const emptyPair: [
    Map<string, AnimeFallbackPlayback[]>,
    Map<string, AnimeFallbackPlayback[]>,
  ] = [new Map(), new Map()];
  const discovery = Promise.all([
    discoverAnimeWorldEpisodes(identity, providerContext, controller.signal),
    discoverAnimeSaturnEpisodes(identity, providerContext, controller.signal),
  ]);
  const timedOut = new Promise<typeof emptyPair>((resolve) => {
    timeout = setTimeout(() => {
      controller.abort();
      resolve(emptyPair);
    }, DISCOVERY_TIMEOUT_MS);
  });
  const aborted = new Promise<typeof emptyPair>((resolve) => {
    onAbort = () => {
      controller.abort();
      resolve(emptyPair);
    };
    signal?.addEventListener("abort", onAbort, {once: true});
    if (signal?.aborted) onAbort();
  });
  let pair: typeof emptyPair;
  try {
    pair = await Promise.race(signal ? [discovery, timedOut, aborted] : [discovery, timedOut]);
  } finally {
    if (timeout) clearTimeout(timeout);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  }
  const [animeWorld, animeSaturn] = pair;
  const output: AnimeFallbackEpisodeMap = new Map();
  [animeWorld, animeSaturn].forEach((sourceMap) => {
    sourceMap.forEach((playbacks, number) => {
      output.set(number, [...(output.get(number) || []), ...playbacks]);
    });
  });
  return output;
};

export const resolveAnimeFallbackStream = async (
  playback: AnimeFallbackPlayback,
  providerContext: ProviderContext,
  signal: AbortSignal
): Promise<Stream[]> =>
  playback.source === "animeworld"
    ? resolveAnimeWorldStream(playback, providerContext, signal)
    : resolveAnimeSaturnStream(playback, providerContext, signal);
