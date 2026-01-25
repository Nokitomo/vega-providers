import { Info, ProviderContext } from "../types";
import {
  buildMetaFromInfo,
  extractAnimeId,
  parseAnimeFromHtml,
  RelatedItem,
} from "./parsers/meta";
import { normalizeImageUrl } from "./utils";

const BASE_HOST = "https://www.animeunity.so";
const DEFAULT_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
};

async function resolveRelatedImages(
  items: RelatedItem[],
  axios: ProviderContext["axios"]
): Promise<Info["related"]> {
  const resolved = await Promise.all(
    items.map(async (item) => {
      if (item.image) return item;
      if (!item.id) return item;
      try {
        const detailRes = await axios.get(`${BASE_HOST}/info_api/${item.id}/`, {
          headers: DEFAULT_HEADERS,
          timeout: 15000,
        });
        const detail = detailRes.data || {};
        const image = normalizeImageUrl(
          detail?.imageurl || detail?.cover || detail?.imageurl_cover
        );
        return {
          ...item,
          image: image || item.image,
        };
      } catch (_) {
        return item;
      }
    })
  );

  return resolved.map((item) => ({
    title: item.title,
    link: item.link,
    image: item.image || "",
    type: item.type,
    year: item.year,
  }));
}

export const getMeta = async function ({
  link,
  providerContext,
}: {
  link: string;
  providerContext: ProviderContext;
}): Promise<Info> {
  try {
    const { axios, cheerio } = providerContext;
    const animeId = extractAnimeId(link);
    if (!animeId) {
      throw new Error("Invalid anime id");
    }

    const infoRes = await axios.get(`${BASE_HOST}/info_api/${animeId}/`, {
      headers: DEFAULT_HEADERS,
      timeout: 15000,
    });
    const info = infoRes.data || {};
    let animeFromHtml: any = null;
    try {
      const htmlRes = await axios.get(
        `${BASE_HOST}/anime/${animeId}-${info?.slug || ""}`,
        { headers: DEFAULT_HEADERS, timeout: 15000 }
      );
      animeFromHtml = parseAnimeFromHtml(htmlRes.data, cheerio);
    } catch (_) {
      // ignore html fallback errors
    }
    const metaPayload = buildMetaFromInfo(
      info,
      BASE_HOST,
      animeId,
      animeFromHtml
    );
    const background = metaPayload.background;
    const related = await resolveRelatedImages(metaPayload.relatedBase, axios);

    return {
      title: metaPayload.title,
      synopsis: metaPayload.synopsis,
      image: background || metaPayload.poster,
      poster: metaPayload.poster,
      imdbId: "",
      type: metaPayload.isMovie ? "movie" : "series",
      tags: metaPayload.tags,
      genres: metaPayload.genres,
      rating: metaPayload.rating,
      studio: metaPayload.studio || "",
      episodesCount: metaPayload.episodesCount,
      extra: metaPayload.extra,
      related,
      linkList: metaPayload.linkList,
    };
  } catch (err) {
    console.error("animeunity meta error", err);
    return {
      title: "",
      synopsis: "",
      image: "",
      imdbId: "",
      type: "series",
      linkList: [],
    };
  }
};
