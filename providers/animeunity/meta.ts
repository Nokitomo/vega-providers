import { Info, ProviderContext } from "../types";
import {
  buildMetaFromInfo,
  extractAnimeId,
  parseAnimeFromHtml,
  RelatedItem,
} from "./parsers/meta";
import { buildAnimeLink, normalizeImageUrl } from "./utils";
import { DEFAULT_BASE_HOST, DEFAULT_HEADERS, TIMEOUTS } from "./config";
import { AnimeUnityArtwork, resolveAniZipArtwork } from "./artwork";
import { resolveAnimeUnityCinemetaMetadata } from "./cinemeta";
import { resolveAnimeUnityTrailer } from "./trailers";
import {
  buildAniBridgeExtra,
  parseSeasonScope,
  resolveAnimeMappings,
} from "./mappings";
import {
  resolveAnimeTmdbMetadata,
  resolveTmdbMediaMetadata,
  selectPrimaryTmdbId,
  selectTmdbPreferredArtwork,
} from "./tmdb";
import { resolveTvdbArtworkMetadata } from "./tvdb";
import { deduplicateAnimeVariantPosts } from "./variants";
import { buildTmdbSeasonEpisodeLinks } from "./seasonLinks";

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function selectPrimaryTvdbTarget(
  mappingResolution: Awaited<ReturnType<typeof resolveAnimeMappings>>,
  isMovie: boolean,
): { id: number; mediaType: "series" | "movie"; seasonNumber?: number } | null {
  if (isMovie) {
    const selectedId = String(mappingResolution.ids.tvdbMovieIds[0] || "");
    const id = Number.parseInt(selectedId, 10);
    return Number.isFinite(id) && id > 0 ? { id, mediaType: "movie" } : null;
  }

  const targets = mappingResolution.targets.filter(
    (target) => target.provider === "tvdb_show",
  );
  const selectedId =
    targets[0]?.id || String(mappingResolution.ids.tvdbShowIds[0] || "");
  const id = Number.parseInt(selectedId, 10);
  if (!Number.isFinite(id) || id <= 0) return null;

  const matchingTargets = targets.filter((target) => target.id === selectedId);
  const seasons = matchingTargets.map((target) =>
    parseSeasonScope(target.scope),
  );
  const scopedSeasons = Array.from(
    new Set(seasons.filter((season): season is number => season != null)),
  );
  const seasonNumber =
    matchingTargets.length > 0 &&
    seasons.every((season) => season != null) &&
    scopedSeasons.length === 1
      ? scopedSeasons[0]
      : undefined;

  return { id, mediaType: "series", seasonNumber };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const output: R[] = [];
  for (let index = 0; index < items.length; index += limit) {
    const batch = items.slice(index, index + limit);
    output.push(...(await Promise.all(batch.map(mapper))));
  }
  return output;
}

async function resolveRelatedImages(
  items: RelatedItem[],
  axios: ProviderContext["axios"],
  baseHost: string,
): Promise<Info["related"]> {
  const resolvedItems = await mapWithConcurrency(items, 6, async (item) => {
    if (!item.id) return item;
    try {
      const detailRes = await axios.get(`${baseHost}/info_api/${item.id}/`, {
        headers: DEFAULT_HEADERS,
        timeout: TIMEOUTS.RELATED,
      });
      const detail = detailRes.data || {};
      const image = normalizeImageUrl(
        detail?.imageurl || detail?.cover || detail?.imageurl_cover,
      );
      const slug = detail?.slug || item.slug;
      return {
        ...item,
        slug,
        title:
          item.title ||
          detail?.title_eng ||
          detail?.title ||
          detail?.title_it ||
          "",
        link: buildAnimeLink(baseHost, item.id, slug),
        image: image || item.image,
        raw: {
          ...(item.raw || {}),
          ...detail,
          id: detail?.id || item.id,
        },
      };
    } catch (_) {
      return item;
    }
  });

  const entries = resolvedItems.map((item) => ({
    anime: {
      ...(item.raw || {}),
      id: item.raw?.id || item.id,
      slug: item.raw?.slug || item.slug,
      title_eng: item.raw?.title_eng || item.title,
      title: item.raw?.title || item.title,
      imageurl: item.raw?.imageurl || item.image,
    },
    post: {
      title: item.title,
      link: item.link,
      image: item.image || "",
      provider: "animeunity",
    },
  }));
  const grouped = deduplicateAnimeVariantPosts(entries);
  const byLink = new Map(resolvedItems.map((item) => [item.link, item]));

  return grouped.map((post) => {
    const item = byLink.get(post.link);
    return {
      title: post.title,
      link: post.link,
      image: post.image || item?.image || "",
      type: item?.type,
      year: item?.year,
      dubStatus: post.dubStatus,
      dubStatusKey: post.dubStatusKey,
      variants: post.variants,
    };
  });
}

export const getMeta = async function ({
  link,
  purpose = "full",
  providerContext,
}: {
  link: string;
  purpose?: "full" | "hero";
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
    if (purpose !== "hero") {
      try {
        const htmlRes = await axios.get(
          `${baseHost}/anime/${animeId}-${info?.slug || ""}`,
          { headers: DEFAULT_HEADERS, timeout: TIMEOUTS.LONG },
        );
        animeFromHtml = parseAnimeFromHtml(htmlRes.data, cheerio);
      } catch (_) {
        // ignore html fallback errors
      }
    }
    const metaPayload = buildMetaFromInfo(
      info,
      baseHost,
      animeId,
      animeFromHtml,
    );
    const providerIds = metaPayload.extra?.ids || {};
    const mappingPromise = resolveAnimeMappings({
      providerContext,
      anilistId: providerIds.anilistId,
      malId: providerIds.malId,
      isMovie: metaPayload.isMovie,
    });
    const [related, mappingResolution, trailer] =
      purpose === "hero"
        ? [[], await mappingPromise, undefined]
        : await Promise.all([
            resolveRelatedImages(metaPayload.relatedBase, axios, baseHost),
            mappingPromise,
            resolveAnimeUnityTrailer({
              axios,
              anilistId: providerIds.anilistId,
              malId: providerIds.malId,
            }),
          ]);
    const providerArtwork = {
      poster: metaPayload.poster,
      background: metaPayload.background,
    };
    const tmdbFields: Array<"logo" | "poster" | "background"> = [
      "logo",
      "poster",
      "background",
    ];
    const tmdbMetadata = await resolveAnimeTmdbMetadata({
      providerContext,
      mappingResolution,
      isMovie: metaPayload.isMovie,
      fields: tmdbFields,
    });

    let aniZipArtwork: AnimeUnityArtwork = {};
    let imdbId = mappingResolution.imdbId || "";
    const needsCinemeta =
      !tmdbMetadata?.logo ||
      !(tmdbMetadata?.poster || providerArtwork.poster) ||
      !tmdbMetadata?.background;
    if (needsCinemeta && !imdbId) {
      aniZipArtwork = await resolveAniZipArtwork({
        providerContext,
        anilistId: providerIds.anilistId,
        malId: providerIds.malId,
      });
      imdbId = aniZipArtwork.imdbId || "";
    }

    const cinemetaMetadata = needsCinemeta
      ? await resolveAnimeUnityCinemetaMetadata({
          providerContext,
          imdbId,
          isMovie: metaPayload.isMovie,
        })
      : {};
    const tvdbTarget = selectPrimaryTvdbTarget(
      mappingResolution,
      metaPayload.isMovie,
    );
    const tvdbFields: Array<"logo" | "poster" | "background"> = [];
    if (!tmdbMetadata?.poster) tvdbFields.push("poster");
    if (!(tmdbMetadata?.logo || cinemetaMetadata.logo)) tvdbFields.push("logo");
    if (!(tmdbMetadata?.background || cinemetaMetadata.background)) {
      tvdbFields.push("background");
    }
    const tvdbMetadata =
      tvdbTarget && tvdbFields.length > 0
        ? await resolveTvdbArtworkMetadata({
            providerContext,
            tvdbId: tvdbTarget.id,
            mediaType: tvdbTarget.mediaType,
            seasonNumber: tvdbTarget.seasonNumber,
            fields: tvdbFields,
          })
        : null;
    const needsAniZip =
      !(tmdbMetadata?.logo || cinemetaMetadata.logo || tvdbMetadata?.logo) ||
      !(
        tmdbMetadata?.poster ||
        tvdbMetadata?.poster ||
        providerArtwork.poster ||
        cinemetaMetadata.poster
      ) ||
      !(
        tmdbMetadata?.background ||
        cinemetaMetadata.background ||
        tvdbMetadata?.background
      );
    if (needsAniZip && !Object.values(aniZipArtwork).some(Boolean)) {
      aniZipArtwork = await resolveAniZipArtwork({
        providerContext,
        anilistId: providerIds.anilistId,
        malId: providerIds.malId,
      });
      imdbId = imdbId || aniZipArtwork.imdbId || "";
    }
    const aniBridgeExtra = buildAniBridgeExtra(mappingResolution);
    let seasonMappedLinkList = buildTmdbSeasonEpisodeLinks({
      animeId,
      totalCount: metaPayload.episodesCount,
      mappingResolution,
    });
    const needsTmdbSeasonLayout =
      purpose !== "hero" &&
      !metaPayload.isMovie &&
      Number(metaPayload.episodesCount || 0) > 0 &&
      seasonMappedLinkList.length > 1;
    if (needsTmdbSeasonLayout) {
      const tmdbTarget = selectPrimaryTmdbId(mappingResolution, false);
      const tmdbMedia =
        tmdbTarget?.type === "tv"
          ? await resolveTmdbMediaMetadata({
              providerContext,
              id: tmdbTarget.id,
              type: "tv",
            })
          : null;
      if (tmdbMedia?.seasons?.length) {
        seasonMappedLinkList = buildTmdbSeasonEpisodeLinks({
          animeId,
          totalCount: metaPayload.episodesCount,
          mappingResolution,
          tmdbSeasons: tmdbMedia.seasons,
        });
      }
    }
    const artwork = selectTmdbPreferredArtwork({
      tmdb: tmdbMetadata,
      tvdb: tvdbMetadata,
      provider: providerArtwork,
      cinemeta: cinemetaMetadata,
      aniZip: aniZipArtwork,
    });
    const title = metaPayload.title;
    const titleKey = metaPayload.titleKey;

    const artworkSources: NonNullable<Info["extra"]>["artworkSources"] = {
      logo: tmdbMetadata?.logo
        ? ("tmdb" as const)
        : cinemetaMetadata.logo
          ? ("cinemeta" as const)
          : tvdbMetadata?.logo
            ? ("tvdb" as const)
            : aniZipArtwork.logo
              ? ("anizip" as const)
              : ("provider" as const),
      poster: tmdbMetadata?.poster
        ? ("tmdb" as const)
        : tvdbMetadata?.poster
          ? ("tvdb" as const)
          : providerArtwork.poster
            ? ("provider" as const)
            : cinemetaMetadata.poster
              ? ("cinemeta" as const)
              : ("anizip" as const),
      background: tmdbMetadata?.background
        ? ("tmdb" as const)
        : cinemetaMetadata.background
          ? ("cinemeta" as const)
          : tvdbMetadata?.background
            ? ("tvdb" as const)
            : aniZipArtwork.background
              ? ("anizip" as const)
              : providerArtwork.background
                ? ("provider" as const)
                : undefined,
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
      linkList:
        seasonMappedLinkList.length > 0
          ? seasonMappedLinkList
          : metaPayload.linkList,
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
  hints,
  imageSize = "original",
  providerContext,
}: {
  link: string;
  fields?: Array<"logo" | "poster" | "background">;
  hints?: { anilistId?: number; malId?: number; isMovie?: boolean };
  imageSize?: "original" | "w300" | "w780";
  providerContext: ProviderContext;
}): Promise<{
  logo?: string;
  poster?: string;
  background?: string;
  resolved?: boolean;
}> {
  try {
    const { axios } = providerContext;
    const animeId = extractAnimeId(link);
    if (!animeId) return { resolved: false };
    const hintedAnilistId = Number(hints?.anilistId) || undefined;
    const hintedMalId = Number(hints?.malId) || undefined;
    let info: any = null;
    let inferredIsMovie = hints?.isMovie;
    if (!hintedAnilistId && !hintedMalId) {
      const resolved =
        (await providerContext.getBaseUrl("animeunity")) || DEFAULT_BASE_HOST;
      const baseHost = normalizeBaseUrl(resolved);
      const infoRes = await axios.get(`${baseHost}/info_api/${animeId}/`, {
        headers: DEFAULT_HEADERS,
        timeout: TIMEOUTS.LONG,
      });
      info = infoRes.data || {};
      inferredIsMovie = buildMetaFromInfo(
        info,
        baseHost,
        animeId,
        null,
      ).isMovie;
    }
    const mappingResolution = await resolveAnimeMappings({
      providerContext,
      anilistId: hintedAnilistId || Number(info?.anilist_id) || undefined,
      malId: hintedMalId || Number(info?.mal_id) || undefined,
      isMovie: inferredIsMovie === true,
      includeLegacyImdb: false,
    });
    const isMovie =
      typeof inferredIsMovie === "boolean"
        ? inferredIsMovie
        : mappingResolution.ids.tmdbShowIds.length === 0 &&
          mappingResolution.ids.tmdbMovieIds.length > 0;
    const tmdb = await resolveAnimeTmdbMetadata({
      providerContext,
      mappingResolution,
      isMovie,
      fields,
      imageSize,
    });
    const missingFields = fields.filter((field) => !tmdb?.[field]);
    const tvdbTarget = selectPrimaryTvdbTarget(mappingResolution, isMovie);
    const tvdb =
      tvdbTarget && missingFields.length > 0
        ? await resolveTvdbArtworkMetadata({
            providerContext,
            tvdbId: tvdbTarget.id,
            mediaType: tvdbTarget.mediaType,
            seasonNumber: tvdbTarget.seasonNumber,
            fields: missingFields,
          })
        : null;
    return {
      logo: tmdb?.logo || tvdb?.logo,
      poster: tmdb?.poster || tvdb?.poster,
      background: tmdb?.background || tvdb?.background,
      resolved: true,
    };
  } catch (_) {
    return { resolved: false };
  }
};
