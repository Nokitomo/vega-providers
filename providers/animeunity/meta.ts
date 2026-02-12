import { Info, ProviderContext } from "../types";
import {
  buildMetaFromInfo,
  extractAnimeId,
  parseAnimeFromHtml,
  RelatedItem,
} from "./parsers/meta";
import { normalizeImageUrl } from "./utils";
import { DEFAULT_BASE_HOST, DEFAULT_HEADERS, TIMEOUTS } from "./config";
import { resolveAnimeUnityCinemetaMetadata } from "./cinemeta";

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

async function resolveRelatedImages(
  items: RelatedItem[],
  axios: ProviderContext["axios"],
  baseHost: string
): Promise<Info["related"]> {
  const resolved = await Promise.all(
    items.map(async (item) => {
      if (item.image) return item;
      if (!item.id) return item;
      try {
        const detailRes = await axios.get(`${baseHost}/info_api/${item.id}/`, {
          headers: DEFAULT_HEADERS,
          timeout: TIMEOUTS.RELATED,
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
    const resolved =
      (await providerContext.getBaseUrl("animeunity")) || DEFAULT_BASE_HOST;
    const baseHost = normalizeBaseUrl(resolved);
    const animeId = extractAnimeId(link);
    if (!animeId) {
      throw new Error("Invalid anime id");
    }

    const infoRes = await axios.get(`${baseHost}/info_api/${animeId}/`, {
      headers: DEFAULT_HEADERS,
      timeout: TIMEOUTS.LONG,
    });
    const info = infoRes.data || {};
    let animeFromHtml: any = null;
    try {
      const htmlRes = await axios.get(
        `${baseHost}/anime/${animeId}-${info?.slug || ""}`,
        { headers: DEFAULT_HEADERS, timeout: TIMEOUTS.LONG }
      );
      animeFromHtml = parseAnimeFromHtml(htmlRes.data, cheerio);
    } catch (_) {
      // ignore html fallback errors
    }
    const metaPayload = buildMetaFromInfo(
      info,
      baseHost,
      animeId,
      animeFromHtml
    );
    const providerIds = metaPayload.extra?.ids || {};
    const [related, externalMeta] = await Promise.all([
      resolveRelatedImages(metaPayload.relatedBase, axios, baseHost),
      resolveAnimeUnityCinemetaMetadata({
        axios,
        anilistId: providerIds.anilistId,
        malId: providerIds.malId,
        isMovie: metaPayload.isMovie,
      }),
    ]);
    const background = metaPayload.background;
    const title = externalMeta.cinemetaTitle || metaPayload.title;
    const titleKey = externalMeta.cinemetaTitle
      ? undefined
      : metaPayload.titleKey;
    const imdbId = externalMeta.imdbId || "";

    return {
      titleKey,
      title,
      synopsis: metaPayload.synopsis,
      image: background || metaPayload.poster,
      poster: metaPayload.poster,
      imdbId,
      type: metaPayload.isMovie ? "movie" : "series",
      tags: metaPayload.tags,
      tagKeys: metaPayload.tagKeys,
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
