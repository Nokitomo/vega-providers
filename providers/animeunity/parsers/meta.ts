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
  isMovie: boolean;
  linkList: Link[];
  episodesCount?: number;
  studio?: string;
  relatedBase: RelatedItem[];
};

export function buildMetaFromInfo(
  info: any,
  baseHost: string,
  animeId: number
): MetaPayload {
  const title = info?.title_eng || info?.title || info?.title_it || "Unknown";
  const synopsis = (info?.plot || "").toString();
  const poster = normalizeImageUrl(info?.imageurl || info?.cover);
  const background = normalizeImageUrl(info?.imageurl_cover || info?.cover);

  const tags = uniqueTags(
    [
      info?.type,
      info?.status,
      info?.season,
      info?.date ? String(info.date) : "",
      ...(info?.genres?.map((genre: any) => genre?.name) || []),
    ].filter(Boolean)
  );

  const isMovie =
    typeof info?.type === "string" &&
    info.type.toLowerCase().includes("movie");

  const ranges = buildEpisodeRanges(info?.episodes_count || 0);
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

  const relatedBase = mapRelatedBase(info?.related || [], baseHost);
  return {
    title,
    synopsis,
    poster,
    background,
    tags,
    isMovie,
    linkList,
    episodesCount:
      typeof info?.episodes_count === "number"
        ? info.episodes_count
        : parseInt(info?.episodes_count, 10) || undefined,
    studio: info?.studio || "",
    relatedBase,
  };
}
