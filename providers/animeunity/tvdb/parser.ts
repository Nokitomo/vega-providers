import { normalizeTvdbLanguage } from "./languages";
import { TVDB_BASE_URL } from "./http";
import { TvdbArtwork, TvdbArtworkField, TvdbMediaType } from "./types";

const ARTWORK_RELS_BY_FIELD: Record<TvdbArtworkField, string[]> = {
  logo: ["artwork_clearlogo", "artwork_25"],
  poster: ["artwork_posters", "artwork_14"],
  background: ["artwork_backgrounds", "artwork_15"],
};

function absoluteTvdbUrl(value?: string): string | undefined {
  const text = String(value || "").trim();
  if (!text) return undefined;
  if (/^https?:\/\//i.test(text)) return text;
  return `${TVDB_BASE_URL}${text.startsWith("/") ? "" : "/"}${text}`;
}

export function extractSeriesPathFromTvdbPage(
  html: string,
  url?: string,
): string | undefined {
  try {
    const parsed = new URL(String(url || ""));
    const match = parsed.pathname.match(/^\/series\/([^/?#]+)/i);
    if (match?.[1] && !/^\d+$/.test(match[1])) {
      return `/series/${match[1]}`;
    }
  } catch (_) {
    // fall through to HTML parsing
  }

  const slugMatch = html.match(
    /href="(\/series\/(?!create\b)(?!\d+\/)[^"/?#]+)(?:[/?#][^"]*)?"/i,
  );
  return slugMatch?.[1];
}

export function extractMoviePathFromTvdbPage(
  html: string,
  url?: string,
): string | undefined {
  try {
    const parsed = new URL(String(url || ""));
    const match = parsed.pathname.match(/^\/movies\/([^/?#]+)/i);
    if (match?.[1] && !/^\d+$/.test(match[1])) {
      return `/movies/${match[1]}`;
    }
  } catch (_) {
    // fall through to HTML parsing
  }

  const slugMatch = html.match(
    /href="(\/movies\/(?!create\b)(?!\d+\/)[^"/?#]+)(?:[/?#][^"]*)?"/i,
  );
  return slugMatch?.[1];
}

export function extractTvdbEntityPath(
  html: string,
  mediaType: TvdbMediaType,
  url?: string,
): string | undefined {
  return mediaType === "movie"
    ? extractMoviePathFromTvdbPage(html, url)
    : extractSeriesPathFromTvdbPage(html, url);
}

export function parseTvdbTitle(html: string, cheerio: any): string | undefined {
  const text = cheerio.load(html)("h1").first().text().trim();
  return text || undefined;
}

export function parseTvdbOriginalLanguage(
  html: string,
  cheerio: any,
): string | undefined {
  const $ = cheerio.load(html);
  let language: string | undefined;
  $("li, .list-group-item").each((_: number, element: any) => {
    if (language) return;
    const label = $(element).find("strong").first().text().trim();
    if (!/original language/i.test(label)) return;
    const text = $(element).find("span").first().text().trim();
    language = normalizeTvdbLanguage(text) || text || undefined;
  });
  return language;
}

export function parseTvdbArtworkGrid(
  html: string,
  cheerio: any,
  field: TvdbArtworkField,
): TvdbArtwork[] {
  const $ = cheerio.load(html);
  const rels = ARTWORK_RELS_BY_FIELD[field];
  const seen = new Set<string>();
  const items: TvdbArtwork[] = [];

  rels.forEach((rel) => {
    $(`a.lightbox[rel="${rel}"]`).each((_: number, element: any) => {
      const link = $(element);
      const url = absoluteTvdbUrl(
        link.attr("href") || link.find("img").attr("data-src"),
      );
      if (!url || seen.has(url)) return;
      seen.add(url);
      items.push({
        id: String(link.attr("data-id") || "").trim() || undefined,
        url,
        type: field,
      });
    });
  });

  return items;
}

export function parseTvdbArtworkDetails(
  html: string,
  cheerio: any,
  fallback: TvdbArtwork,
): TvdbArtwork {
  const $ = cheerio.load(html);
  const imageUrl =
    absoluteTvdbUrl(
      $(".thumbnail img, img.img-responsive").first().attr("src"),
    ) || fallback.url;
  let language = fallback.language;

  $("li.list-group-item, li").each((_: number, element: any) => {
    if (language) return;
    const label = $(element).find("strong").first().text().trim();
    if (!/^language$/i.test(label)) return;
    const text = $(element).find("span").first().text().trim();
    language = normalizeTvdbLanguage(text) || text || undefined;
  });

  return {
    ...fallback,
    url: imageUrl,
    language,
  };
}
