import { EpisodeLink, ProviderContext } from "../types";
import { DEFAULT_HEADERS, DEFAULT_BASE_HOST, TIMEOUTS } from "./config";
import {
  buildEpisodeFetchRanges,
  parseEpisodeRangeRequest,
} from "./episodeRanges";

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
          const title = hasNumber ? `Episode ${number}` : "Episode";
          episodes.push({
            title,
            titleKey: hasNumber ? "Episode {{number}}" : "Episode",
            titleParams: hasNumber ? { number } : undefined,
            episodeNumber: parsedEpisodeNumber,
            link,
          });
        });
      } catch (_) {
        // Skip failed range and continue with the next one.
      }
    }

    return episodes;
  } catch (err) {
    console.error("animeunity episodes error", err);
    return [];
  }
};
