import { Info, Link, ProviderContext } from "../../types";
import { buildAnimeLink, decodeHtmlAttribute, normalizeImageUrl } from "../utils";

const EPISODE_RANGE_KEY = "Episodes {{start}}-{{end}}";
const DIACRITICS_REGEX = /[\u0300-\u036f]/g;
type AvailabilityPrecision = NonNullable<Link["availabilityPrecision"]>;

const TAG_KEY_MAP: Record<string, string> = {
  tv: "TV",
  tvshort: "TV Short",
  ova: "OVA",
  ona: "ONA",
  special: "Special",
  movie: "Movie",
  ongoing: "Ongoing",
  incorso: "Ongoing",
  airing: "Ongoing",
  completed: "Completed",
  terminato: "Completed",
  finished: "Completed",
  upcoming: "Upcoming",
  inuscita: "Upcoming",
  inuscitaprossimamente: "Upcoming",
  comingsoon: "Upcoming",
  dropped: "Dropped",
  droppato: "Dropped",
  winter: "Winter",
  inverno: "Winter",
  spring: "Spring",
  primavera: "Spring",
  summer: "Summer",
  estate: "Summer",
  autumn: "Autumn",
  autunno: "Autumn",
  fall: "Autumn",
};

function normalizeTagKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_REGEX, "")
    .replace(/[^a-z0-9]+/g, "");
}

function buildTagKeys(tags: string[]): Record<string, string> {
  return tags.reduce((acc, tag) => {
    const normalized = normalizeTagKey(tag);
    const key = TAG_KEY_MAP[normalized];
    if (key) {
      acc[tag] = key;
    }
    return acc;
  }, {} as Record<string, string>);
}

export function extractAnimeId(link: string): number | null {
  if (!link) return null;
  const direct = parseInt(link, 10);
  if (Number.isFinite(direct)) {
    return direct;
  }
  const match = link.match(/\/anime\/(\d+)/);
  if (match?.[1]) {
    const parsed = parseInt(match[1], 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function buildEpisodeRanges(
  totalCount: number,
  rangeSize = 120
): { title: string; titleKey: string; titleParams: { start: number; end: number }; start: number; end: number }[] {
  if (!totalCount || totalCount <= 0) {
    return [];
  }
  const ranges: { title: string; titleKey: string; titleParams: { start: number; end: number }; start: number; end: number }[] = [];
  let start = 1;
  while (start <= totalCount) {
    const end = Math.min(start + rangeSize - 1, totalCount);
    ranges.push({
      title: `Episodes ${start}-${end}`,
      titleKey: EPISODE_RANGE_KEY,
      titleParams: { start, end },
      start,
      end,
    });
    start = end + 1;
  }
  return ranges;
}

function uniqueTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  tags.forEach((tag) => {
    const normalized = tag.trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });
  return result;
}

function normalizeGenreName(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === "object") {
    const name = (value as { name?: string }).name;
    if (typeof name === "string" && name.trim()) {
      return name.trim();
    }
  }
  return undefined;
}

function normalizeGenres(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const names = raw
    .map((item) => normalizeGenreName(item))
    .filter(Boolean) as string[];
  return uniqueTags(names);
}

function formatRating(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim().replace(",", ".");
  if (!text) return undefined;
  const parsed = Number.parseFloat(text);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed.toFixed(1);
}

function toNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const text = String(value).trim().replace(",", ".");
  if (!text) return undefined;
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toStringValue(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}

function pickTitle(item: any): string {
  return item?.title_eng || item?.title || item?.title_it || "";
}

function pickYear(item: any): string | undefined {
  const raw = item?.date ?? item?.year ?? "";
  if (!raw) return undefined;
  const match = String(raw).match(/(\d{4})/);
  return match?.[1];
}

const UPCOMING_STATUS_KEYS = [
  "upcoming",
  "inuscita",
  "inuscitaprossimamente",
  "comingsoon",
  "prossimamente",
];

function isUpcomingStatus(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const normalized = normalizeTagKey(String(value));
  if (!normalized) return false;
  return UPCOMING_STATUS_KEYS.some((key) => normalized.includes(key));
}

function parseAvailabilityDate(value: unknown): {
  date?: string;
  precision?: AvailabilityPrecision;
  isFuture: boolean;
} {
  if (value === null || value === undefined) {
    return { isFuture: false };
  }
  const text = String(value).trim();
  if (!text) {
    return { isFuture: false };
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
        date: String(year),
        precision: "year",
        isFuture: year > utcNow.getUTCFullYear(),
      };
    }
  }

  return {
    date: text,
    precision: "unknown",
    isFuture: false,
  };
}

export type RelatedItem = {
  id?: number | string;
  title: string;
  link: string;
  image?: string;
  type?: string;
  year?: string;
};

export function mapRelatedBase(
  items: any[],
  baseHost: string
): RelatedItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const title = pickTitle(item);
      const id = item?.id;
      const slug = item?.slug;
      if (!title || !id) return null;
      return {
        id,
        title,
        link: buildAnimeLink(baseHost, id, slug),
        image: normalizeImageUrl(item?.imageurl),
        type: item?.type || item?.relation || item?.rel,
        year: pickYear(item),
      };
    })
    .filter(Boolean) as RelatedItem[];
}

export function parseAnimeFromHtml(
  html: string,
  cheerio: ProviderContext["cheerio"]
) {
  const $ = cheerio.load(html);
  let raw =
    $("video-player").attr("anime") ||
    $("[anime]").first().attr("anime") ||
    "";
  if (!raw) {
    const match = html.match(/anime="([^"]+)"/);
    raw = match?.[1] || "";
  }
  if (!raw) return null;
  try {
    return JSON.parse(decodeHtmlAttribute(raw));
  } catch (_) {
    return null;
  }
}

export type MetaPayload = {
  titleKey?: string;
  titleParams?: Info["titleParams"];
  title: string;
  synopsis: string;
  poster: string;
  background: string;
  tags: string[];
  tagKeys: Record<string, string>;
  genres: string[];
  isMovie: boolean;
  linkList: Link[];
  episodesCount?: number;
  studio?: string;
  rating?: string;
  extra?: Info["extra"];
  relatedBase: RelatedItem[];
};

export function buildMetaFromInfo(
  info: any,
  baseHost: string,
  animeId: number,
  animeFromHtml?: any
): MetaPayload {
  const htmlAnime =
    animeFromHtml && typeof animeFromHtml === "object" ? animeFromHtml : {};
  const resolvedTitle =
    info?.title_eng ||
    info?.title ||
    info?.title_it ||
    htmlAnime?.title_eng ||
    htmlAnime?.title ||
    htmlAnime?.title_it ||
    "";
  const title = resolvedTitle || "Unknown";
  const titleKey = resolvedTitle ? undefined : "Unknown";
  const synopsis = (info?.plot ?? htmlAnime?.plot ?? "").toString();
  const poster = normalizeImageUrl(
    info?.imageurl || info?.cover || htmlAnime?.imageurl || htmlAnime?.cover
  );
  const background = normalizeImageUrl(
    info?.imageurl_cover ||
      info?.cover ||
      htmlAnime?.imageurl_cover ||
      htmlAnime?.cover
  );

  const type = info?.type ?? htmlAnime?.type;
  const status = info?.status ?? htmlAnime?.status;
  const season = info?.season ?? htmlAnime?.season;
  const dateValue = info?.date ?? htmlAnime?.date;
  const tags = uniqueTags(
    [type, status, season, dateValue ? String(dateValue) : ""].filter(Boolean)
  );
  const tagKeys = buildTagKeys(tags);
  const genres = normalizeGenres(
    Array.isArray(info?.genres) && info.genres.length > 0
      ? info.genres
      : htmlAnime?.genres
  );

  const isMovie =
    typeof type === "string" && type.toLowerCase().includes("movie");

  const episodesCountRaw =
    info?.episodes_count ?? htmlAnime?.episodes_count ?? 0;
  const parsedEpisodesCount =
    typeof episodesCountRaw === "number"
      ? episodesCountRaw
      : parseInt(String(episodesCountRaw), 10) || 0;
  const normalizedEpisodesCount =
    Number.isFinite(parsedEpisodesCount) && parsedEpisodesCount > 0
      ? parsedEpisodesCount
      : 0;
  const availability = parseAvailabilityDate(dateValue);
  const isUpcomingContent =
    normalizedEpisodesCount === 0 &&
    (isUpcomingStatus(status) || availability.isFuture);
  const ranges = buildEpisodeRanges(
    normalizedEpisodesCount
  );
  let linkList: Link[] = [];
  if (ranges.length > 0) {
    linkList = ranges.map((range) => ({
      title: range.title,
      titleKey: range.titleKey,
      titleParams: range.titleParams,
      availabilityStatus: "available",
      episodesLink: `${animeId}|${range.start}|${range.end}`,
    }));
  } else if (isUpcomingContent) {
    linkList = [
      {
        title: "Upcoming",
        titleKey: "Upcoming",
        availabilityStatus: "upcoming",
        availabilityDate: availability.date,
        availabilityPrecision: availability.precision,
      },
    ];
  } else {
    linkList = [
      {
        title,
        availabilityStatus: "available",
        episodesLink: String(animeId),
      },
    ];
  }

  const relatedBase = mapRelatedBase(info?.related || [], baseHost);
  return {
    titleKey,
    title,
    synopsis,
    poster,
    background,
    tags,
    tagKeys,
    genres,
    isMovie,
    linkList,
    episodesCount: normalizedEpisodesCount || undefined,
    studio: info?.studio || htmlAnime?.studio || "",
    rating: formatRating(info?.score ?? htmlAnime?.score),
    extra: {
      ids: {
        malId: toNumber(info?.mal_id ?? htmlAnime?.mal_id),
        anilistId: toNumber(info?.anilist_id ?? htmlAnime?.anilist_id),
        crunchyId: info?.crunchy_id ?? htmlAnime?.crunchy_id,
        disneyId: info?.disney_id ?? htmlAnime?.disney_id,
        netflixId: info?.netflix_id ?? htmlAnime?.netflix_id,
        primeId: info?.prime_id ?? htmlAnime?.prime_id,
      },
      stats: {
        scoreRaw: toStringValue(info?.score ?? htmlAnime?.score),
        favorites: toNumber(htmlAnime?.favorites),
        members: toNumber(htmlAnime?.members),
        views: toNumber(htmlAnime?.visite),
        episodesCountRaw:
          info?.episodes_count ?? htmlAnime?.episodes_count ?? undefined,
        episodesLength: htmlAnime?.episodes_length ?? undefined,
      },
      flags: {
        dub: info?.dub ?? htmlAnime?.dub,
        alwaysHome: htmlAnime?.always_home,
      },
      meta: {
        day: toStringValue(htmlAnime?.day),
        season: toStringValue(season),
        status: toStringValue(status),
        type: toStringValue(type),
        createdAt: toStringValue(htmlAnime?.created_at),
        author: toStringValue(htmlAnime?.author),
        userId: htmlAnime?.user_id ?? undefined,
      },
    },
    relatedBase,
  };
}
