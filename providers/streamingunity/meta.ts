import { Info, Link, ProviderContext } from "../types";
import {
  DEFAULT_CDN_URL,
  DEFAULT_LOCALE,
  REQUEST_TIMEOUT,
  buildLocaleUrl,
  decodeHtmlEntities,
  extractInertiaPage,
  getTranslationValue,
  normalizeText,
  pickImageByType,
  buildImageUrl,
  resolveCdnUrl,
  resolveBaseUrl,
  resolveUrl,
  resolveTitleName,
  resolveTitleSlug,
  buildTitleUrl,
  extractTitleId,
} from "./utils";
import { extractVixCloudStreams } from "../animeunity/parsers/stream";
import { buildStreamingUnityPlaybackLink } from "./playback";
import {
  resolveTmdbArtworkMetadata,
  resolveTmdbMediaMetadata,
} from "../animeunity/tmdb";
import {
  resolveTvdbArtworkMetadata,
  resolveTvdbMediaTextMetadata,
} from "../animeunity/tvdb";
import { TmdbArtworkField, TmdbMediaType } from "../animeunity/tmdb/types";
import {
  readStreamingUnityExternalIds,
  resolveStreamingUnityExternalIds,
  StreamingUnityExternalIds,
} from "./externalMappings";
import { buildAniBridgeExtra } from "../animeunity/mappings";

const pickLogoImage = (
  images: any[] | undefined,
  cdnUrl: string
): string => {
  if (!Array.isArray(images) || images.length === 0) return "";
  const logos = images.filter(
    (img) => String(img?.type || "").toLowerCase() === "logo"
  );
  if (logos.length === 0) return "";
  const localized = logos.find(
    (img) => String(img?.lang || "").toLowerCase() === DEFAULT_LOCALE
  );
  const fallback = localized || logos.find((img) => !img?.lang) || logos[0];
  return buildImageUrl(fallback, cdnUrl);
};

const extractYear = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  const match = String(value).match(/\d{4}/);
  return match ? match[0] : undefined;
};

const normalizeRuntime = (
  value?: string | number | null
): string | undefined => {
  if (value === null || value === undefined) return undefined;
  const raw = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (Number.isFinite(raw)) {
    const total = Math.max(0, Math.floor(raw));
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h`;
    return `${minutes}m`;
  }
  const trimmed = String(value).trim();
  return trimmed || undefined;
};

const toNumber = (value: any): number | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const extractSlugFromLink = (link: string): string => {
  if (!link) return "";
  const match = link.match(/\/titles\/\d+-([^/?#]+)/i);
  return match?.[1] ? String(match[1]).trim() : "";
};

const normalizePeople = (items: any[]): string[] => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (!item) return "";
      if (typeof item === "string") return item.trim();
      return String(item?.name || item?.title || "").trim();
    })
    .filter(Boolean);
};

const normalizeGenreName = (genre: any): string => {
  const translated = getTranslationValue(genre?.translations, "name", DEFAULT_LOCALE);
  return translated || String(genre?.name || "").trim();
};

const normalizeGenres = (genres: any[]): string[] => {
  if (!Array.isArray(genres)) return [];
  return genres
    .map((genre) => normalizeGenreName(genre))
    .filter(Boolean);
};

const normalizeKeywords = (keywords: any[]): string[] => {
  if (!Array.isArray(keywords)) return [];
  return keywords
    .map((keyword) => String(keyword?.name || "").trim())
    .filter(Boolean);
};

const mergeTags = (genres: string[], keywords: string[]): string[] => {
  const merged = new Set<string>();
  genres.forEach((value) => value && merged.add(value));
  keywords.forEach((value) => value && merged.add(value));
  return Array.from(merged);
};

type AvailabilityPrecision = NonNullable<Link["availabilityPrecision"]>;

type AvailabilityInfo = {
  hasDate: boolean;
  date?: string;
  precision?: AvailabilityPrecision;
  isFuture: boolean;
  isPast: boolean;
};

const hasText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const pickPresent = <T>(primary: T | undefined, fallback: T | undefined) =>
  primary !== undefined && primary !== null && String(primary).trim() !== ""
    ? primary
    : fallback;

const resolveStreamingUnityTvdbId = (
  title: any,
  type: "movie" | "series",
): number | undefined =>
  type === "movie"
    ? toNumber(title?.tvdb_movie_id) ||
      toNumber(title?.thetvdb_id) ||
      toNumber(title?.tvdb_id)
    : toNumber(title?.tvdb_show_id) ||
      toNumber(title?.thetvdb_id) ||
      toNumber(title?.tvdb_id);

const resolveExternalFallbackArtwork = async ({
  providerContext,
  title,
  type,
  tvdbId,
  resolveMissingExternalIds,
  poster,
  logo,
  background,
}: {
  providerContext: ProviderContext;
  title: any;
  type: "movie" | "series";
  tvdbId?: number;
  resolveMissingExternalIds?: () => Promise<StreamingUnityExternalIds>;
  poster?: string;
  logo?: string;
  background?: string;
}): Promise<{
  logo?: string;
  poster?: string;
  background?: string;
  sources: {
    logo?: "provider" | "tmdb" | "tvdb";
    poster?: "provider" | "tmdb" | "tvdb";
    background?: "provider" | "tmdb" | "tvdb";
  };
}> => {
  const sources: {
    logo?: "provider" | "tmdb" | "tvdb";
    poster?: "provider" | "tmdb" | "tvdb";
    background?: "provider" | "tmdb" | "tvdb";
  } = {
    logo: hasText(logo) ? "provider" : undefined,
    poster: hasText(poster) ? "provider" : undefined,
    background: hasText(background) ? "provider" : undefined,
  };
  let resolvedLogo = logo;
  let resolvedPoster = poster;
  let resolvedBackground = background;

  const missingFields = (): TmdbArtworkField[] => {
    const fields: TmdbArtworkField[] = [];
    if (!hasText(resolvedLogo)) fields.push("logo");
    if (!hasText(resolvedPoster)) fields.push("poster");
    if (!hasText(resolvedBackground)) fields.push("background");
    return fields;
  };

  const tmdbId = toNumber(title?.tmdb_id);
  const tmdbType: TmdbMediaType = type === "series" ? "tv" : "movie";
  const tmdbFields = missingFields();
  if (tmdbId && tmdbFields.length > 0) {
    const tmdb = await resolveTmdbArtworkMetadata({
      providerContext,
      id: tmdbId,
      type: tmdbType,
      fields: tmdbFields,
    });
    if (!hasText(resolvedLogo) && hasText(tmdb?.logo)) {
      resolvedLogo = tmdb.logo;
      sources.logo = "tmdb";
    }
    if (!hasText(resolvedPoster) && hasText(tmdb?.poster)) {
      resolvedPoster = tmdb.poster;
      sources.poster = "tmdb";
    }
    if (!hasText(resolvedBackground) && hasText(tmdb?.background)) {
      resolvedBackground = tmdb.background;
      sources.background = "tmdb";
    }
  }

  let resolvedTvdbId = tvdbId || resolveStreamingUnityTvdbId(title, type);
  const tvdbFields = missingFields();
  if (!resolvedTvdbId && tvdbFields.length > 0 && resolveMissingExternalIds) {
    resolvedTvdbId = (await resolveMissingExternalIds()).tvdbId;
  }
  if (resolvedTvdbId && tvdbFields.length > 0) {
    const tvdb = await resolveTvdbArtworkMetadata({
      providerContext,
      tvdbId: resolvedTvdbId,
      mediaType: type === "series" ? "series" : "movie",
      fields: tvdbFields,
    });
    if (!hasText(resolvedLogo) && hasText(tvdb?.logo)) {
      resolvedLogo = tvdb.logo;
      sources.logo = "tvdb";
    }
    if (!hasText(resolvedPoster) && hasText(tvdb?.poster)) {
      resolvedPoster = tvdb.poster;
      sources.poster = "tvdb";
    }
    if (!hasText(resolvedBackground) && hasText(tvdb?.background)) {
      resolvedBackground = tvdb.background;
      sources.background = "tvdb";
    }
  }

  return {
    logo: resolvedLogo,
    poster: resolvedPoster,
    background: resolvedBackground,
    sources,
  };
};

const UPCOMING_STATUS_TOKENS = [
  "upcoming",
  "inproduction",
  "postproduction",
  "planned",
  "announced",
  "inarrivo",
  "comingsoon",
];

const RELEASED_STATUS_TOKENS = [
  "released",
  "returningseries",
  "ended",
  "cancelled",
  "canceled",
];

const normalizeStatusToken = (value: unknown): string =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const hasStatusToken = (value: unknown, tokens: string[]): boolean => {
  const normalized = normalizeStatusToken(value);
  if (!normalized) return false;
  return tokens.some((token) => normalized.includes(token));
};

const isEnabledFlag = (value: unknown): boolean => {
  if (value === true || value === 1) return true;
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const parseAvailabilityDate = (value: unknown): AvailabilityInfo => {
  if (value === null || value === undefined) {
    return { hasDate: false, isFuture: false, isPast: false };
  }

  const text = String(value).trim();
  if (!text) {
    return { hasDate: false, isFuture: false, isPast: false };
  }

  const localNow = new Date();
  const todayLocal = Date.UTC(
    localNow.getFullYear(),
    localNow.getMonth(),
    localNow.getDate()
  );

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const dateValue = new Date(`${text}T00:00:00Z`);
    const time = dateValue.getTime();
    if (Number.isFinite(time)) {
      return {
        hasDate: true,
        date: text,
        precision: "day",
        isFuture: time > todayLocal,
        isPast: time < todayLocal,
      };
    }
  }

  const yearMatch = text.match(/\b(\d{4})\b/);
  if (yearMatch?.[1]) {
    const year = Number.parseInt(yearMatch[1], 10);
    if (Number.isFinite(year)) {
      return {
        hasDate: true,
        date: String(year),
        precision: "year",
        isFuture: year > localNow.getFullYear(),
        isPast: year < localNow.getFullYear(),
      };
    }
  }

  return {
    hasDate: true,
    date: text,
    precision: "unknown",
    isFuture: false,
    isPast: false,
  };
};

const VIXCLOUD_PLAYABLE_PATTERN =
  /https?:\/\/[^"'\s]*vixcloud\.co\/(?:embed|playlist)(?:\/\d+|\/?\?)[^"'\s]*/i;
const ABSOLUTE_IFRAME_PATTERN =
  /https?:\/\/[^"'\s]+\/it\/iframe\/\d+[^"'\s]*/i;
const RELATIVE_IFRAME_PATTERN = /\/it\/iframe\/\d+[^"'\s]*/i;

const shouldProbeInconsistentUpcoming = (availability: AvailabilityInfo): boolean =>
  availability.hasDate && !availability.isFuture;

const fetchHtml = async (
  url: string,
  providerContext: ProviderContext,
  signal?: AbortSignal,
  referer?: string
): Promise<string> => {
  const { axios, commonHeaders } = providerContext;
  const res = await axios.get(url, {
    headers: {
      ...commonHeaders,
      Referer: referer || url,
    },
    timeout: REQUEST_TIMEOUT,
    signal,
  });
  return typeof res.data === "string" ? res.data : String(res.data ?? "");
};

const getUserAgent = (headers: Record<string, string>): string => {
  const candidate = headers["User-Agent"] || headers["user-agent"];
  return typeof candidate === "string" && candidate.trim()
    ? candidate
    : "Mozilla/5.0";
};

const buildTitlePath = (titleId: string, slug: string): string => {
  if (!slug) return `/titles/${titleId}`;
  return `/titles/${titleId}-${slug}`;
};

const buildSeasonUrl = (
  baseUrl: string,
  titleId: string,
  slug: string,
  seasonNumber: number
): string => {
  const path = `${buildTitlePath(titleId, slug)}/season-${seasonNumber}`;
  return buildLocaleUrl(path, baseUrl);
};

const extractIframeUrlFromHtml = (
  html: string,
  baseUrl: string,
  cheerio: ProviderContext["cheerio"]
): string => {
  if (!html) return "";
  const $ = cheerio.load(html);
  const iframeSrc = $("iframe[src]").first().attr("src") || "";
  if (iframeSrc) {
    return resolveUrl(decodeHtmlEntities(String(iframeSrc)), baseUrl);
  }
  const iframeHref = $("a[href*='/it/iframe/']").first().attr("href") || "";
  if (iframeHref) {
    return resolveUrl(decodeHtmlEntities(String(iframeHref)), baseUrl);
  }
  const absoluteMatch = html.match(ABSOLUTE_IFRAME_PATTERN);
  if (absoluteMatch?.[0]) {
    return decodeHtmlEntities(absoluteMatch[0]);
  }
  const relativeMatch = html.match(RELATIVE_IFRAME_PATTERN);
  if (relativeMatch?.[0]) {
    return resolveUrl(decodeHtmlEntities(relativeMatch[0]), baseUrl);
  }
  return "";
};

const extractPlayableVixcloudUrl = (
  html: string,
  cheerio: ProviderContext["cheerio"]
): string => {
  if (!html) return "";
  const $ = cheerio.load(html);
  const iframeSrc = $("iframe[src]").first().attr("src") || "";
  const normalizedIframeSrc = decodeHtmlEntities(String(iframeSrc || ""));
  if (normalizedIframeSrc && VIXCLOUD_PLAYABLE_PATTERN.test(normalizedIframeSrc)) {
    return normalizedIframeSrc;
  }
  const directMatch = html.match(VIXCLOUD_PLAYABLE_PATTERN);
  return directMatch?.[0] ? decodeHtmlEntities(directMatch[0]) : "";
};

const probeMovieAvailability = async ({
  baseUrl,
  titleId,
  providerContext,
  cheerio,
}: {
  baseUrl: string;
  titleId: string;
  providerContext: ProviderContext;
  cheerio: ProviderContext["cheerio"];
}): Promise<boolean> => {
  try {
    const watchUrl = buildLocaleUrl(`/watch/${titleId}`, baseUrl);
    const watchHtml = await fetchHtml(watchUrl, providerContext);
    const watchPage = extractInertiaPage(watchHtml, cheerio);
    const embedUrlFromPage = normalizeText(String(watchPage?.props?.embedUrl || ""));
    const iframeUrl = embedUrlFromPage
      ? resolveUrl(decodeHtmlEntities(embedUrlFromPage), baseUrl)
      : extractIframeUrlFromHtml(watchHtml, baseUrl, cheerio);
    if (!iframeUrl) {
      return false;
    }

    const iframeHtml = await fetchHtml(
      iframeUrl,
      providerContext,
      undefined,
      watchUrl
    );
    const playableUrl = extractPlayableVixcloudUrl(iframeHtml, cheerio);
    if (!playableUrl) {
      return false;
    }

    const playableHtml = await fetchHtml(
      playableUrl,
      providerContext,
      undefined,
      iframeUrl
    );
    if (/^#EXTM3U/m.test(playableHtml)) {
      return true;
    }
    return extractVixCloudStreams(
      playableHtml,
      playableUrl,
      getUserAgent(providerContext.commonHeaders)
    ).length > 0;
  } catch (err) {
    console.warn("streamingunity movie availability probe failed", err);
    return false;
  }
};

const probeSeasonEpisodesCount = async ({
  seasonUrl,
  providerContext,
  cheerio,
}: {
  seasonUrl: string;
  providerContext: ProviderContext;
  cheerio: ProviderContext["cheerio"];
}): Promise<number> => {
  try {
    const seasonHtml = await fetchHtml(seasonUrl, providerContext);
    const seasonPage = extractInertiaPage(seasonHtml, cheerio);
    const episodes = seasonPage?.props?.loadedSeason?.episodes;
    return Array.isArray(episodes) ? episodes.length : 0;
  } catch (err) {
    console.warn("streamingunity season availability probe failed", err);
    return 0;
  }
};

const buildEpisodeLinks = (
  episodes: any[],
  titleId: string,
  seasonNumber?: number
): { links: Link["directLinks"]; count: number } => {
  if (!Array.isArray(episodes) || episodes.length === 0) {
    return { links: [], count: 0 };
  }

  const links = episodes
    .map((episode) => {
      const number = episode?.number != null ? String(episode.number) : "";
      const parsedEpisodeNumber = number ? Number.parseInt(number, 10) : NaN;
      const translatedName = getTranslationValue(
        episode?.translations,
        "name",
        DEFAULT_LOCALE
      );
      const name = normalizeText(translatedName || episode?.name || "");
      const title = name || (number ? `Episode ${number}` : "Episode");
      const titleKey = !name && number ? "Episode {{number}}" : undefined;
      const titleParams = titleKey ? { number } : undefined;
      return {
        title,
        titleKey,
        titleParams,
        episodeNumber: Number.isFinite(parsedEpisodeNumber)
          ? parsedEpisodeNumber
          : undefined,
        seasonNumber:
          seasonNumber && Number.isFinite(seasonNumber)
            ? seasonNumber
            : undefined,
        link: `${titleId}::${episode?.id || ""}`,
        type: "series" as const,
      };
    })
    .filter((link) => link.link && link.title);

  return { links, count: links.length };
};

const buildSeriesLinks = async ({
  title,
  slug,
  baseUrl,
  loadedSeason,
  providerContext,
  cheerio,
}: {
  title: any;
  slug: string;
  baseUrl: string;
  loadedSeason: any;
  providerContext: ProviderContext;
  cheerio: ProviderContext["cheerio"];
}): Promise<{ linkList: Link[]; episodesCount?: number }> => {
  const seasons: any[] = Array.isArray(title?.seasons) ? title.seasons : [];
  if (seasons.length === 0) {
    return { linkList: [] };
  }

  const titleId = String(title.id || "").trim();
  if (!titleId) {
    return { linkList: [] };
  }

  const seasonById = new Map<string, any>();
  seasons.forEach((season) => {
    if (season?.id != null) {
      seasonById.set(String(season.id), season);
    }
  });

  const sortedSeasons = [...seasons].sort((a, b) => {
    const left = Number(a?.number) || 0;
    const right = Number(b?.number) || 0;
    return left - right;
  });

  const loadedSeasonInfo =
    loadedSeason?.id != null
      ? seasonById.get(String(loadedSeason.id))
      : undefined;
  const loadedSeasonNumber = Number(loadedSeasonInfo?.number);
  const loadedSeasonEpisodes = Array.isArray(loadedSeason?.episodes)
    ? loadedSeason.episodes
    : [];
  const loadedSeasonBuilt =
    Number.isFinite(loadedSeasonNumber) && loadedSeasonNumber > 0
      ? buildEpisodeLinks(loadedSeasonEpisodes, titleId, loadedSeasonNumber)
      : { links: [], count: 0 };

  const linkList: Link[] = [];
  let episodesCount = 0;
  let hasEpisodesCount = false;

  for (const season of sortedSeasons) {
    const seasonNumber = Number(season?.number);
    if (!Number.isFinite(seasonNumber) || seasonNumber <= 0) {
      continue;
    }
    const seasonUrl = buildSeasonUrl(baseUrl, titleId, slug, seasonNumber);
    const rawSeasonEpisodesCount = Number(season?.episodes_count);
    const hasRawSeasonEpisodesCount = Number.isFinite(rawSeasonEpisodesCount);

    let seasonEpisodesCount = hasRawSeasonEpisodesCount
      ? Math.max(0, Math.floor(rawSeasonEpisodesCount))
      : 0;

    if (
      seasonEpisodesCount === 0 &&
      Number.isFinite(loadedSeasonNumber) &&
      loadedSeasonNumber === seasonNumber
    ) {
      seasonEpisodesCount = loadedSeasonBuilt.count;
    }

    if (seasonEpisodesCount > 0) {
      episodesCount += seasonEpisodesCount;
      hasEpisodesCount = true;
    }

    const seasonAvailability = parseAvailabilityDate(
      season?.release_date_it || season?.release_date
    );
    const isUpcomingSeason =
      seasonEpisodesCount === 0 &&
      (seasonAvailability.isFuture ||
        (seasonAvailability.hasDate &&
          hasRawSeasonEpisodesCount &&
          rawSeasonEpisodesCount === 0));

    let reconciledSeasonEpisodesCount = seasonEpisodesCount;
    if (
      isUpcomingSeason &&
      shouldProbeInconsistentUpcoming(seasonAvailability)
    ) {
      const probedEpisodesCount = await probeSeasonEpisodesCount({
        seasonUrl,
        providerContext,
        cheerio,
      });
      if (probedEpisodesCount > 0) {
        reconciledSeasonEpisodesCount = probedEpisodesCount;
        episodesCount += probedEpisodesCount;
        hasEpisodesCount = true;
      }
    }
    const shouldKeepSeasonUpcoming =
      isUpcomingSeason && reconciledSeasonEpisodesCount === 0;

    const seasonLink: Link = {
      title: `Season ${seasonNumber}`,
      titleKey: "Season {{number}}",
      titleParams: { number: seasonNumber },
      seasonNumber,
      availabilityStatus: shouldKeepSeasonUpcoming ? "upcoming" : "available",
    };

    if (shouldKeepSeasonUpcoming) {
      if (seasonAvailability.hasDate && !seasonAvailability.isPast) {
        seasonLink.availabilityDate = seasonAvailability.date;
        seasonLink.availabilityPrecision = seasonAvailability.precision;
      }
      linkList.push(seasonLink);
      continue;
    }

    seasonLink.episodesLink = seasonUrl;

    linkList.push(seasonLink);
  }

  return { linkList, episodesCount: hasEpisodesCount ? episodesCount : undefined };
};

const buildRelated = (
  sliders: any[],
  baseUrl: string,
  cdnUrl: string
): Info["related"] | undefined => {
  if (!Array.isArray(sliders)) return undefined;
  const relatedSlider = sliders.find(
    (slider) => String(slider?.name || "").toLowerCase() === "related"
  );
  const titles = relatedSlider?.titles || [];
  if (!Array.isArray(titles) || titles.length === 0) return undefined;

  type RelatedItem = NonNullable<Info["related"]>[number];

  const related = titles
    .map((item): RelatedItem | null => {
      if (!item?.id) return null;
      const slug = resolveTitleSlug(item, DEFAULT_LOCALE);
      const link = buildTitleUrl(item.id, slug, baseUrl);
      const name = resolveTitleName(item, DEFAULT_LOCALE);
      const image = pickImageByType(item?.images, cdnUrl, [
        "poster",
        "cover",
        "background",
      ]);
      const year = extractYear(item?.release_date || item?.last_air_date);
      return {
        title: name,
        link,
        image: image || undefined,
        type: String(item?.type || "").toLowerCase() === "tv" ? "series" : "movie",
        year,
      };
    })
    .filter((item): item is RelatedItem => !!item && !!item.title && !!item.link);

  return related.length > 0 ? related : undefined;
};

export const getMeta = async function ({
  link,
  providerContext,
}: {
  link: string;
  provider: string;
  providerContext: ProviderContext;
}): Promise<Info> {
  try {
    const { cheerio } = providerContext;
    const baseUrl = await resolveBaseUrl(providerContext);
    if (!baseUrl) {
      console.error("streamingunity meta error: missing base url");
      return {
        title: "",
        synopsis: "",
        image: "",
        imdbId: "",
        type: "movie",
        linkList: [],
      };
    }
    const titleId = extractTitleId(link);
    if (!titleId) {
      throw new Error("Invalid title id");
    }

    const slugFromLink = extractSlugFromLink(link);
    const url = buildLocaleUrl(buildTitlePath(titleId, slugFromLink), baseUrl);
    const html = await fetchHtml(url, providerContext);
    const page = extractInertiaPage(html, cheerio);
    const title = page?.props?.title;
    if (!title) {
      throw new Error("Missing title data");
    }

    const slug = resolveTitleSlug(title, DEFAULT_LOCALE) || slugFromLink;
    const cdnUrl = resolveCdnUrl(page?.props, baseUrl, DEFAULT_CDN_URL);

    let titleName = resolveTitleName(title, DEFAULT_LOCALE);
    let plot = getTranslationValue(title?.translations, "plot", DEFAULT_LOCALE) ||
      String(title?.plot || "");

    let poster = pickImageByType(title?.images, cdnUrl, [
      "poster",
      "cover",
      "cover_mobile",
      "background",
    ]);
    let logo = pickLogoImage(title?.images, cdnUrl);
    let background = pickImageByType(title?.images, cdnUrl, [
      "background",
      "cover",
      "cover_mobile",
    ]);

    let genres = normalizeGenres(title?.genres || []);
    const keywords = normalizeKeywords(title?.keywords || []);
    let tags = mergeTags(genres, keywords);

    let cast = normalizePeople(title?.main_actors || []);
    const directors = normalizePeople(title?.main_directors || []);

    const releaseDate = title?.release_date_it || title?.release_date;
    const lastAirDate = title?.last_air_date_it || title?.last_air_date;

    let year = extractYear(releaseDate || lastAirDate);
    let runtime = normalizeRuntime(title?.runtime);
    let rating = title?.score != null ? String(title.score) : "";

    const type = String(title?.type || "").toLowerCase() === "tv" ? "series" : "movie";
    const providerExternalIds = readStreamingUnityExternalIds(title, type);
    const tmdbId = providerExternalIds.tmdbId;
    let tvdbId = providerExternalIds.tvdbId;
    let imdbId = providerExternalIds.imdbId || "";
    let resolvedExternalIds: StreamingUnityExternalIds | null = null;
    const resolveMissingExternalIds = async (): Promise<StreamingUnityExternalIds> => {
      if (!resolvedExternalIds) {
        resolvedExternalIds = await resolveStreamingUnityExternalIds({
          providerContext,
          title,
          type,
          needTvdb: !tvdbId,
          needImdb: !imdbId,
        });
        tvdbId = tvdbId || resolvedExternalIds.tvdbId;
        imdbId = imdbId || resolvedExternalIds.imdbId || "";
      }
      return resolvedExternalIds;
    };
    const tmdbType: TmdbMediaType = type === "series" ? "tv" : "movie";
    const needsTmdbCore =
      !!tmdbId &&
      (!hasText(titleName) ||
        !hasText(plot) ||
        !hasText(year) ||
        !hasText(runtime) ||
        !hasText(rating) ||
        genres.length === 0 ||
        cast.length === 0);
    const tmdbCore = needsTmdbCore
      ? await resolveTmdbMediaMetadata({
          providerContext,
          id: tmdbId!,
          type: tmdbType,
        })
      : null;
    titleName = pickPresent(titleName, tmdbCore?.title?.value) || "";
    plot = pickPresent(plot, tmdbCore?.overview?.value) || "";
    year =
      pickPresent(
        year,
        extractYear(tmdbCore?.releaseDate || tmdbCore?.startDate || tmdbCore?.endDate)
      ) || "";
    runtime = pickPresent(runtime, tmdbCore?.facts?.Runtime) || "";
    rating = pickPresent(
      rating,
      tmdbCore?.rating != null ? String(tmdbCore.rating) : undefined
    ) || "";
    genres = genres.length > 0 ? genres : tmdbCore?.genres || [];
    tags = mergeTags(genres, keywords);
    cast =
      cast.length > 0
        ? cast
        : (tmdbCore?.cast || [])
            .map((person) => person.name)
            .filter((name): name is string => hasText(name))
            .slice(0, 12);

    if (!tvdbId && tmdbId && (!hasText(titleName) || !hasText(plot))) {
      await resolveMissingExternalIds();
    }
    const needsTvdbText = !!tvdbId && (!hasText(titleName) || !hasText(plot));
    const tvdbText = needsTvdbText
      ? await resolveTvdbMediaTextMetadata({
          providerContext,
          tvdbId,
          mediaType: type === "series" ? "series" : "movie",
        })
      : null;
    titleName = pickPresent(titleName, tvdbText?.title) || "";
    plot = pickPresent(plot, tvdbText?.synopsis) || "";

    const fallbackArtwork = await resolveExternalFallbackArtwork({
      providerContext,
      title,
      type,
      tvdbId,
      resolveMissingExternalIds,
      poster,
      logo,
      background,
    });
    poster = fallbackArtwork.poster || "";
    logo = fallbackArtwork.logo || "";
    background = fallbackArtwork.background || "";

    const related = buildRelated(page?.props?.sliders || [], baseUrl, cdnUrl);

    let linkList: Link[] = [];
    let episodesCount: number | undefined = undefined;

    if (type === "series") {
      const seriesLinks = await buildSeriesLinks({
        title,
        slug,
        baseUrl,
        loadedSeason: page?.props?.loadedSeason,
        providerContext,
        cheerio,
      });
      linkList = seriesLinks.linkList;
      episodesCount = seriesLinks.episodesCount;
    } else {
      const titleUrl = buildTitleUrl(titleId, slug, baseUrl);
      const movieAvailability = parseAvailabilityDate(releaseDate);
      const movieStatus = title?.status;
      const isExplicitlyComingSoon = isEnabledFlag(title?.coming_soon);
      const isMovieUpcoming =
        isExplicitlyComingSoon ||
        hasStatusToken(movieStatus, UPCOMING_STATUS_TOKENS) ||
        (!hasStatusToken(movieStatus, RELEASED_STATUS_TOKENS) &&
          movieAvailability.hasDate &&
          movieAvailability.isFuture);
      const shouldProbeMovieAvailability =
        isMovieUpcoming &&
        !isExplicitlyComingSoon &&
        shouldProbeInconsistentUpcoming(movieAvailability);
      const hasPlayableMovie = shouldProbeMovieAvailability
        ? await probeMovieAvailability({
            baseUrl,
            titleId,
            providerContext,
            cheerio,
          })
        : false;
      const shouldKeepMovieUpcoming = isMovieUpcoming && !hasPlayableMovie;

      const movieLink: Link = {
        title: "Play",
        titleKey: "Play",
        availabilityStatus: shouldKeepMovieUpcoming ? "upcoming" : "available",
      };

      if (shouldKeepMovieUpcoming) {
        if (movieAvailability.hasDate && !movieAvailability.isPast) {
          movieLink.availabilityDate = movieAvailability.date;
          movieLink.availabilityPrecision = movieAvailability.precision;
        }
      } else {
        movieLink.directLinks = [
          {
            title: "Play",
            titleKey: "Play",
            link: buildStreamingUnityPlaybackLink(titleUrl, {
              mediaType: "movie",
              imdbId,
              tmdbId: tmdbId ? String(tmdbId) : "",
            }),
            type: "movie",
          },
        ];
      }

      linkList = [movieLink];
    }

    const viewsRaw = title?.views_it || title?.views;
    const dailyViewsRaw = title?.daily_views_it || title?.daily_views;
    const resolvedMapping = (resolvedExternalIds as StreamingUnityExternalIds | null)
      ?.mappingResolution;
    const wikidataId = (resolvedExternalIds as StreamingUnityExternalIds | null)
      ?.wikidataId;
    const traktSlug = (resolvedExternalIds as StreamingUnityExternalIds | null)
      ?.traktSlug;
    const aniBridgeExtra: Partial<
      Pick<NonNullable<Info["extra"]>, "ids" | "mappings">
    > = resolvedMapping
      ? buildAniBridgeExtra(resolvedMapping)
      : {};

    return {
      title: titleName,
      synopsis: normalizeText(plot || ""),
      image: poster || background || "",
      logo: logo || undefined,
      background: background || poster || undefined,
      poster: poster || undefined,
      imdbId,
      year: year || undefined,
      runtime: runtime || undefined,
      country: title?.country || undefined,
      director: directors[0] || undefined,
      type,
      tags: tags.length > 0 ? tags : undefined,
      genres: genres.length > 0 ? genres : undefined,
      cast: cast.length > 0 ? cast : undefined,
      rating: rating || undefined,
      episodesCount,
      extra: {
        ids: {
          ...aniBridgeExtra.ids,
          tmdbMovieIds:
            type === "movie" && tmdbId
              ? [tmdbId]
              : undefined,
          tmdbShowIds:
            type === "series" && tmdbId
              ? [tmdbId]
              : undefined,
          tvdbMovieIds:
            type === "movie" && tvdbId
              ? [tvdbId]
              : undefined,
          tvdbShowIds:
            type === "series" && tvdbId
              ? [tvdbId]
              : undefined,
          wikidataIds: wikidataId ? [wikidataId] : undefined,
          traktSlugs: traktSlug ? [traktSlug] : undefined,
          netflixId: title?.netflix_id || undefined,
          primeId: title?.prime_id || undefined,
          disneyId: title?.disney_id || undefined,
        },
        stats: {
          scoreRaw: title?.score != null ? String(title.score) : undefined,
          views: toNumber(viewsRaw),
          members: undefined,
          favorites: undefined,
          episodesCountRaw: title?.seasons_count || undefined,
        },
        flags: {
          dub: title?.dub_ita || undefined,
        },
        mappings: aniBridgeExtra.mappings,
        artworkSources: fallbackArtwork.sources,
        meta: {
          status: title?.status || undefined,
          type: title?.type || undefined,
          createdAt: title?.created_at || undefined,
        },
      },
      related,
      linkList,
    };
  } catch (err) {
    console.error("streamingunity meta error", err);
    return {
      title: "",
      synopsis: "",
      image: "",
      imdbId: "",
      type: "movie",
      linkList: [],
    };
  }
};
