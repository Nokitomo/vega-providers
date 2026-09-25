import { Info, ProviderContext } from "../types";
import {
  buildMetaFromInfo,
  extractAnimeId,
  parseAnimeFromHtml,
  RelatedItem,
} from "./parsers/meta";
import { normalizeImageUrl } from "./utils";
import { DEFAULT_BASE_HOST, DEFAULT_HEADERS, TIMEOUTS } from "./config";
import { AnimeUnityArtwork, resolveAniZipArtwork } from "./artwork";
import { resolveAnimeUnityTrailer } from "./trailers";
import { buildAniBridgeExtra, resolveAnimeMappings } from "./mappings";
import { resolveAnimeTmdbMetadata, selectTmdbPreferredArtwork } from "./tmdb";

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
    const [related, mappingResolution, trailer] =
      await Promise.all([
        resolveRelatedImages(metaPayload.relatedBase, axios, baseHost),
        resolveAnimeMappings({
          providerContext,
          anilistId: providerIds.anilistId,
          malId: providerIds.malId,
          isMovie: metaPayload.isMovie,
        }),
        resolveAnimeUnityTrailer({
          axios,
          anilistId: providerIds.anilistId,
          malId: providerIds.malId,
        }),
      ]);
    const tmdbMetadata = await resolveAnimeTmdbMetadata({
      providerContext,
      mappingResolution,
      isMovie: metaPayload.isMovie,
    });
    const providerArtwork = {
      poster: metaPayload.poster,
      background: metaPayload.background,
    };
    const needsAniZip =
      !tmdbMetadata?.logo ||
      !(tmdbMetadata?.poster || providerArtwork.poster) ||
      !(tmdbMetadata?.background || providerArtwork.background);
    const aniZipArtwork: AnimeUnityArtwork = needsAniZip
      ? await resolveAniZipArtwork({
          axios,
          anilistId: providerIds.anilistId,
          malId: providerIds.malId,
        })
      : {};
    const imdbId = mappingResolution.imdbId || aniZipArtwork.imdbId || "";
    const aniBridgeExtra = buildAniBridgeExtra(mappingResolution);
    const artwork = selectTmdbPreferredArtwork({
      tmdb: tmdbMetadata,
      provider: providerArtwork,
      cinemeta: null,
      aniZip: aniZipArtwork,
    });
    const title = metaPayload.title;
    const titleKey = metaPayload.titleKey;

    const artworkSources = {
      logo: tmdbMetadata?.logo
        ? "tmdb" as const
        : aniZipArtwork.logo
          ? "anizip" as const
          : "provider" as const,
      poster: tmdbMetadata?.poster
        ? "tmdb" as const
        : providerArtwork.poster
          ? "provider" as const
          : "anizip" as const,
      background: tmdbMetadata?.background
        ? "tmdb" as const
        : providerArtwork.background
          ? "provider" as const
          : "anizip" as const,
    };

    return {
      titleKey,
      title,
      synopsis: metaPayload.synopsis,
      image: artwork.background || artwork.poster,
      poster: artwork.poster || undefined,
      logo: artwork.logo || undefined,
      background: artwork.background || undefined,
      trailers: trailer ? [trailer] : undefined,
      imdbId,
      type: metaPayload.isMovie ? "movie" : "series",
      tags: metaPayload.tags,
      tagKeys: metaPayload.tagKeys,
      genres: metaPayload.genres,
      rating: metaPayload.rating,
      studio: metaPayload.studio || "",
      episodesCount: metaPayload.episodesCount,
      extra: {
        ...metaPayload.extra,
        ids: {
          ...metaPayload.extra?.ids,
          ...aniBridgeExtra.ids,
        },
        mappings: aniBridgeExtra.mappings,
        artworkSources,
      },
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

export const getArtwork = async function ({
  link,
  fields = ["poster"],
  providerContext,
}: {
  link: string;
  fields?: Array<"logo" | "poster" | "background">;
  providerContext: ProviderContext;
}): Promise<{ logo?: string; poster?: string; background?: string }> {
  try {
    const { axios } = providerContext;
    const resolved =
      (await providerContext.getBaseUrl("animeunity")) || DEFAULT_BASE_HOST;
    const baseHost = normalizeBaseUrl(resolved);
    const animeId = extractAnimeId(link);
    if (!animeId) return {};
    const infoRes = await axios.get(`${baseHost}/info_api/${animeId}/`, {
      headers: DEFAULT_HEADERS,
      timeout: TIMEOUTS.LONG,
    });
    const info = infoRes.data || {};
    const payload = buildMetaFromInfo(info, baseHost, animeId, null);
    const mappingResolution = await resolveAnimeMappings({
      providerContext,
      anilistId: Number(info?.anilist_id) || undefined,
      malId: Number(info?.mal_id) || undefined,
      isMovie: payload.isMovie,
      includeLegacyImdb: false,
    });
    const tmdb = await resolveAnimeTmdbMetadata({
      providerContext,
      mappingResolution,
      isMovie: payload.isMovie,
      fields,
    });
    return {
      logo: tmdb?.logo,
      poster: tmdb?.poster,
      background: tmdb?.background,
    };
  } catch (_) {
    return {};
  }
};
