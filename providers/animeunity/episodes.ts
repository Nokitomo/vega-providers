import { EpisodeLink, ProviderContext } from "../types";
import { BASE_HOST, DEFAULT_HEADERS } from "./utils";

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
    const animeId = parseInt(url, 10);
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
    let start = 1;
    while (start <= totalCount) {
      const end = Math.min(start + RANGE_SIZE - 1, totalCount);
      const rangeUrl = `${BASE_HOST}/info_api/${animeId}/1?start_range=${start}&end_range=${end}`;
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
      start = end + 1;
    }

    return episodes;
  } catch (err) {
    console.error("animeunity episodes error", err);
    return [];
  }
};
