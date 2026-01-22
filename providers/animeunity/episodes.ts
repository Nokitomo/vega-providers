import { EpisodeLink, ProviderContext } from "../types";

const BASE_HOST = "https://www.animeunity.so";
const DEFAULT_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
};

const RANGE_SIZE = 120;

export const getEpisodes = async function ({
  url,
  providerContext,
}: {
  url: string;
  providerContext: ProviderContext;
}): Promise<EpisodeLink[]> {
  try {
    const { axios } = providerContext;
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

    const infoRes = await axios.get(`${BASE_HOST}/info_api/${animeId}/`, {
      headers: {
        ...DEFAULT_HEADERS,
        Referer: `${BASE_HOST}/`,
      },
      timeout: 15000,
    });
    const totalCount = infoRes.data?.episodes_count || 0;
    if (!totalCount) return [];

    const episodes: EpisodeLink[] = [];
    let start = rangeEnd > 0 ? rangeStart : 1;
    let last = rangeEnd > 0 ? rangeEnd : totalCount;
    while (start <= last) {
      const end = Math.min(start + RANGE_SIZE - 1, last);
      const rangeUrl = `${BASE_HOST}/info_api/${animeId}/1?start_range=${start}&end_range=${end}`;
      try {
        const res = await axios.get(rangeUrl, {
          headers: {
            ...DEFAULT_HEADERS,
            Referer: `${BASE_HOST}/`,
          },
          timeout: 15000,
        });
        const list = res.data?.episodes || [];
        list.forEach((episode: any) => {
          const number = episode?.number ?? "";
          const id = episode?.id;
          if (!id) return;
          const title = number ? `Episode ${number}` : "Episode";
          episodes.push({
            title,
            link: String(id),
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
