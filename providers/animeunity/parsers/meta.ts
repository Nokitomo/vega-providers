import { Info, Link, ProviderContext } from "../../types";
import { buildAnimeLink, decodeHtmlAttribute, normalizeImageUrl } from "../utils";

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
): { title: string; start: number; end: number }[] {
  if (!totalCount || totalCount <= 0) {
    return [];
  }
  const ranges: { title: string; start: number; end: number }[] = [];
  let start = 1;
  while (start <= totalCount) {
    const end = Math.min(start + rangeSize - 1, totalCount);
    ranges.push({
      title: `Episodi ${start}-${end}`,
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
  title: string;
  synopsis: string;
  poster: string;
  background: string;
  tags: string[];
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
  const title =
    info?.title_eng ||
    info?.title ||
    info?.title_it ||
    htmlAnime?.title_eng ||
    htmlAnime?.title ||
    htmlAnime?.title_it ||
    "Unknown";
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
  const genres = normalizeGenres(
    Array.isArray(info?.genres) && info.genres.length > 0
      ? info.genres
      : htmlAnime?.genres
  );

  const isMovie =
    typeof type === "string" && type.toLowerCase().includes("movie");

  const episodesCountRaw =
    info?.episodes_count ?? htmlAnime?.episodes_count ?? 0;
  const ranges = buildEpisodeRanges(
    typeof episodesCountRaw === "number"
      ? episodesCountRaw
      : parseInt(String(episodesCountRaw), 10) || 0
  );
  const linkList: Link[] = ranges.length
    ? ranges.map((range) => ({
        title: range.title,
        episodesLink: `${animeId}|${range.start}|${range.end}`,
      }))
    : [
        {
          title,
          episodesLink: String(animeId),
        },
      ];

  const relatedSource =
    Array.isArray(htmlAnime?.related) && htmlAnime.related.length > 0
      ? htmlAnime.related
      : info?.related || [];
  const relatedBase = mapRelatedBase(relatedSource, baseHost);
  return {
    title,
    synopsis,
    poster,
    background,
    tags,
    genres,
    isMovie,
    linkList,
    episodesCount:
      typeof episodesCountRaw === "number"
        ? episodesCountRaw
        : parseInt(String(episodesCountRaw), 10) || undefined,
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
