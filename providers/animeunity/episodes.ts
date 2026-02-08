import { EpisodeLink, ProviderContext } from "../types";
import { DEFAULT_HEADERS, DEFAULT_BASE_HOST, TIMEOUTS } from "./config";

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

const RANGE_SIZE = 120;
const SPECIALS_LOOKAHEAD = 30;

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
    let animeId: number | null = null;
    let rangeStart = 1;
    let rangeEnd = 0;
    if (url.includes("|")) {
      const parts = url.split("|");
      const parsedId = parseInt(parts[0], 10);
      const parsedStart = parseInt(parts[1], 10);
      const parsedEnd = parseInt(parts[2], 10);
      animeId = Number.isFinite(parsedId) ? parsedId : null;
      rangeStart = Number.isFinite(parsedStart) ? parsedStart : 1;
      rangeEnd = Number.isFinite(parsedEnd) ? parsedEnd : 0;
    } else {
      const parsedId = parseInt(url, 10);
      animeId = Number.isFinite(parsedId) ? parsedId : null;
    }
    if (!Number.isFinite(animeId)) {
      return [];
    }

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
    const effectiveRangeStart =
      rangeEnd > 0 ? (rangeStart <= 1 ? 0 : rangeStart) : 0;
    let start = effectiveRangeStart;
    const requestedLast = rangeEnd > 0 ? rangeEnd : totalCount;
    const isLastRequestedRange = requestedLast >= totalCount;
    let last = isLastRequestedRange
      ? requestedLast + SPECIALS_LOOKAHEAD
      : requestedLast;
    while (start <= last) {
      const end = Math.min(start + RANGE_SIZE - 1, last);
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
      start = end + 1;
    }

    return episodes;
  } catch (err) {
    console.error("animeunity episodes error", err);
    return [];
  }
};
