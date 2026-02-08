import { Info, Link, ProviderContext } from "../types";
import {
  DEFAULT_LOCALE,
  REQUEST_TIMEOUT,
  buildLocaleUrl,
  extractInertiaPage,
  getTranslationValue,
  normalizeText,
  pickImageByType,
  buildImageUrl,
  resolveBaseUrl,
  resolveTitleName,
  resolveTitleSlug,
  buildTitleUrl,
  extractTitleId,
} from "./utils";

const DEFAULT_CDN_URL = "https://cdn.streamingunity.tv";

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

const parseAvailabilityDate = (value: unknown): AvailabilityInfo => {
  if (value === null || value === undefined) {
    return { hasDate: false, isFuture: false };
  }

  const text = String(value).trim();
  if (!text) {
    return { hasDate: false, isFuture: false };
  }

  const utcNow = new Date();
  const todayUtc = Date.UTC(
    utcNow.getUTCFullYear(),
    utcNow.getUTCMonth(),
    utcNow.getUTCDate()
  );

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const dateValue = new Date(`${text}T00:00:00Z`);
    const time = dateValue.getTime();
    if (Number.isFinite(time)) {
      return {
        hasDate: true,
        date: text,
        precision: "day",
        isFuture: time > todayUtc,
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
        isFuture: year > utcNow.getUTCFullYear(),
      };
    }
  }

  return {
    hasDate: true,
    date: text,
    precision: "unknown",
    isFuture: false,
  };
};

const fetchHtml = async (
  url: string,
  providerContext: ProviderContext,
  signal?: AbortSignal
): Promise<string> => {
  const { axios, commonHeaders } = providerContext;
  const res = await axios.get(url, {
    headers: {
      ...commonHeaders,
      Referer: url,
    },
    timeout: REQUEST_TIMEOUT,
    signal,
  });
  return typeof res.data === "string" ? res.data : String(res.data ?? "");
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
  signal,
}: {
  title: any;
  slug: string;
  baseUrl: string;
  loadedSeason: any;
  providerContext: ProviderContext;
  signal?: AbortSignal;
}): Promise<{ linkList: Link[]; episodesCount?: number }> => {
  const seasons: any[] = Array.isArray(title?.seasons) ? title.seasons : [];
  if (seasons.length === 0) {
    return { linkList: [] };
  }

  const titleId = String(title.id || "").trim();
  const seasonById = new Map<string, any>();
  seasons.forEach((season) => {
    if (season?.id != null) {
      seasonById.set(String(season.id), season);
    }
  });

  const episodesBySeason = new Map<number, any[]>();
  if (loadedSeason?.id && Array.isArray(loadedSeason.episodes)) {
    const seasonInfo = seasonById.get(String(loadedSeason.id));
    const seasonNumber = Number(seasonInfo?.number);
    if (Number.isFinite(seasonNumber) && seasonNumber > 0) {
      episodesBySeason.set(seasonNumber, loadedSeason.episodes);
    }
  }

  const sortedSeasons = [...seasons].sort((a, b) => {
    const left = Number(a?.number) || 0;
    const right = Number(b?.number) || 0;
    return left - right;
  });

  const linkList: Link[] = [];
  let episodesCount = 0;

  for (const season of sortedSeasons) {
    const seasonNumber = Number(season?.number);
    if (!Number.isFinite(seasonNumber) || seasonNumber <= 0 || !titleId) {
      continue;
    }
    let episodes = episodesBySeason.get(seasonNumber);
    if (!episodes) {
      try {
        const seasonUrl = buildSeasonUrl(baseUrl, titleId, slug, seasonNumber);
        const html = await fetchHtml(seasonUrl, providerContext, signal);
        const page = extractInertiaPage(html, providerContext.cheerio);
        episodes = page?.props?.loadedSeason?.episodes || [];
        if (Array.isArray(episodes)) {
          episodesBySeason.set(seasonNumber, episodes);
        }
      } catch (err) {
        console.error("streamingunity season fetch error", err);
        episodes = [];
      }
    }

    const built = buildEpisodeLinks(episodes || [], titleId, seasonNumber);
    episodesCount += built.count;

    const seasonAvailability = parseAvailabilityDate(
      season?.release_date_it || season?.release_date
    );
    const seasonEpisodesCount = Number(season?.episodes_count);
    const hasSeasonEpisodesCount = Number.isFinite(seasonEpisodesCount);
    const isUpcomingSeason =
      built.count === 0 &&
      (seasonAvailability.isFuture ||
        (seasonAvailability.hasDate &&
          hasSeasonEpisodesCount &&
          seasonEpisodesCount === 0));

    const seasonLink: Link = {
      title: `Season ${seasonNumber}`,
      titleKey: "Season {{number}}",
      titleParams: { number: seasonNumber },
      seasonNumber,
      directLinks: built.links,
      availabilityStatus: isUpcomingSeason ? "upcoming" : "available",
    };

    if (isUpcomingSeason && seasonAvailability.hasDate) {
      seasonLink.availabilityDate = seasonAvailability.date;
      seasonLink.availabilityPrecision = seasonAvailability.precision;
    }

    linkList.push(seasonLink);
  }

  return { linkList, episodesCount: episodesCount || undefined };
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
    const cdnUrl = page?.props?.cdn_url || DEFAULT_CDN_URL;

    const titleName = resolveTitleName(title, DEFAULT_LOCALE);
    const plot = getTranslationValue(title?.translations, "plot", DEFAULT_LOCALE) ||
      String(title?.plot || "");

    const poster = pickImageByType(title?.images, cdnUrl, [
      "poster",
      "cover",
      "cover_mobile",
      "background",
    ]);
    const logo = pickLogoImage(title?.images, cdnUrl);
    const background = pickImageByType(title?.images, cdnUrl, [
      "background",
      "cover",
      "cover_mobile",
    ]);

    const genres = normalizeGenres(title?.genres || []);
    const keywords = normalizeKeywords(title?.keywords || []);
    const tags = mergeTags(genres, keywords);

    const cast = normalizePeople(title?.main_actors || []);
    const directors = normalizePeople(title?.main_directors || []);

    const releaseDate = title?.release_date_it || title?.release_date;
    const lastAirDate = title?.last_air_date_it || title?.last_air_date;

    const year = extractYear(releaseDate || lastAirDate);
    const runtime = normalizeRuntime(title?.runtime);
    const rating = title?.score != null ? String(title.score) : "";

    const type = String(title?.type || "").toLowerCase() === "tv" ? "series" : "movie";

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
      });
      linkList = seriesLinks.linkList;
      episodesCount = seriesLinks.episodesCount;
    } else {
      const titleUrl = buildTitleUrl(titleId, slug, baseUrl);
      const movieAvailability = parseAvailabilityDate(releaseDate);
      const movieStatus = title?.status;
      const isMovieUpcoming =
        hasStatusToken(movieStatus, UPCOMING_STATUS_TOKENS) ||
        (!hasStatusToken(movieStatus, RELEASED_STATUS_TOKENS) &&
          movieAvailability.hasDate &&
          movieAvailability.isFuture);

      const movieLink: Link = {
        title: "Play",
        titleKey: "Play",
        availabilityStatus: isMovieUpcoming ? "upcoming" : "available",
      };

      if (isMovieUpcoming && movieAvailability.hasDate) {
        movieLink.availabilityDate = movieAvailability.date;
        movieLink.availabilityPrecision = movieAvailability.precision;
      } else {
        movieLink.directLinks = [
          {
            title: "Play",
            titleKey: "Play",
            link: titleUrl,
            type: "movie",
          },
        ];
      }

      linkList = [movieLink];
    }

    const viewsRaw = title?.views_it || title?.views;
    const dailyViewsRaw = title?.daily_views_it || title?.daily_views;

    return {
      title: titleName,
      synopsis: normalizeText(plot || ""),
      image: poster || background || "",
      logo: logo || undefined,
      background: background || poster || undefined,
      poster: poster || undefined,
      imdbId: String(title?.imdb_id || ""),
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
