import { Info, ProviderContext } from "../types";
import {
  buildMetaFromInfo,
  extractAnimeId,
  parseAnimeFromHtml,
  RelatedItem,
} from "./parsers/meta";
import { normalizeImageUrl } from "./utils";
import { BASE_HOST, DEFAULT_HEADERS, TIMEOUTS } from "./config";

function isHostedOnAnimeUnity(url?: string): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.endsWith("animeunity.so") || host.endsWith("img.animeunity.so");
  } catch (_) {
    return false;
  }
}

function pickRelatedImage(item: RelatedItem): string | undefined {
  if (item.image && isHostedOnAnimeUnity(item.image)) {
    return item.image;
  }
  if (item.cover && isHostedOnAnimeUnity(item.cover)) {
    return item.cover;
  }
  return item.image || item.cover;
}

async function resolveRelatedImages(
  items: RelatedItem[],
  axios: ProviderContext["axios"]
): Promise<Info["related"]> {
  const resolved = await Promise.all(
    items.map(async (item) => {
      const preferredImage = pickRelatedImage(item);
      if (preferredImage && isHostedOnAnimeUnity(preferredImage)) {
        return { ...item, image: preferredImage };
      }
      if (!item.id) return item;
      try {
        const detailRes = await axios.get(`${BASE_HOST}/info_api/${item.id}/`, {
          headers: DEFAULT_HEADERS,
          timeout: TIMEOUTS.RELATED,
        });
        const detail = detailRes.data || {};
        const image = normalizeImageUrl(
          detail?.imageurl || detail?.cover || detail?.imageurl_cover
        );
        return {
          ...item,
          image: image || preferredImage || item.image,
        };
      } catch (_) {
        return { ...item, image: preferredImage || item.image };
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
      timeout: TIMEOUTS.LONG,
    });
    const info = infoRes.data || {};
    let animeFromHtml: any = null;
    try {
      const htmlRes = await axios.get(
        `${BASE_HOST}/anime/${animeId}-${info?.slug || ""}`,
        { headers: DEFAULT_HEADERS, timeout: TIMEOUTS.LONG }
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
