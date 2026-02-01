import { Info, Link, ProviderContext } from "../types";

const DEFAULT_BASE_URL = "https://altadefinizionez.sbs";
const REQUEST_TIMEOUT = 10000;

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, "");

const resolveBaseUrl = async (
  providerContext: ProviderContext
): Promise<string> => {
  try {
    const resolved = await providerContext.getBaseUrl("altadefinizionez");
    if (resolved) {
      return normalizeBaseUrl(resolved);
    }
  } catch (_) {
    // ignore and fall back to default
  }
  return DEFAULT_BASE_URL;
};

const resolveUrl = (href: string, baseUrl: string): string => {
  if (!href) return "";
  if (/^https?:\/\//i.test(href)) return href;
  return new URL(href, baseUrl).href;
};

const cleanText = (value: string): string =>
  value
    .replace(/Leggi tutto/gi, "")
    .replace(/\.\.\./g, "")
    .replace(/\s+/g, " ")
    .trim();

const extractImdbId = (html: string): string => {
  const match = html.match(/tt\d{6,9}/i);
  return match ? match[0] : "";
};

const normalizeText = (value: string): string =>
  value.replace(/\s+/g, " ").trim().toLowerCase();

const extractImage = (element: any, baseUrl: string): string => {
  const img = element.find("img").first();
  const src =
    img.attr("data-src") ||
    img.attr("data-lazy-src") ||
    img.attr("data-original") ||
    img.attr("src") ||
    "";
  return src ? resolveUrl(src, baseUrl) : "";
};

const isDetailLink = (href: string, baseUrl: string): boolean => {
  if (!href) return false;
  try {
    const resolved = new URL(href, baseUrl);
    const baseHost = new URL(baseUrl).hostname;
    if (!resolved.hostname.endsWith(baseHost)) return false;
    return /\/\d+[^/]*\.html\/?$/i.test(resolved.pathname);
  } catch (_) {
    return false;
  }
};


const GENRE_KEY_MAP: Record<string, string> = {
  azione: "Action",
  animazione: "Animation",
  commedia: "Comedy",
  drammatico: "Drama",
  fantascienza: "Science Fiction",
  thriller: "Thriller",
};

const resolveGenreKey = (value: string): string | undefined => {
  const normalized = value.trim().toLowerCase();
  return GENRE_KEY_MAP[normalized];
};

const buildTagKeys = (values: string[]): Record<string, string> => {
  const tags: Record<string, string> = {};
  values.forEach((value: string) => {
    const key = resolveGenreKey(value);
    if (key) {
      tags[value] = key;
    }
  });
  return tags;
};

const extractDetailRow = (
  $: any,
  label: string
): any => {
  const target = label.toLowerCase();
  let row: any = null;
  $(".movie_entry-details .row").each((_index: number, element: any) => {
    const labelText = $(element)
      .find(".label-text")
      .first()
      .text()
      .replace(/:$/, "")
      .trim()
      .toLowerCase();
    if (labelText === target) {
      row = $(element);
      return false;
    }
  });
  return row;
};

const extractDetailValue = (
  $: any,
  label: string
): string => {
  const row = extractDetailRow($, label);
  if (!row) return "";
  const value = row
    .find(".col-auto")
    .last()
    .text()
    .replace(/\s+/g, " ")
    .trim();
  return value;
};

const extractDetailList = (
  $: any,
  label: string
): string[] => {
  const row = extractDetailRow($, label);
  if (!row) return [];
  const linked = row
    .find("a")
    .map((_index: number, el: any) => $(el).text().trim())
    .get()
    .filter(Boolean);
  if (linked.length > 0) return linked;
  const raw = row
    .find(".col-auto")
    .last()
    .text()
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return [];
  return raw
    .split("/")
    .map((value: string) => value.trim())
    .filter(Boolean);
};

const buildSeriesLinks = (
  $: any,
  pageUrl: string
): { linkList: Link[]; episodesCount: number } => {
  const seasons = new Map<
    string,
    Array<{ key: string; label: string; episodeNumber: string }>
  >();

  $(".dropdown.episodes[data-season]").each((_index: number, element: any) => {
    const season = ($(element).attr("data-season") || "").trim();
    if (!season) return;

    $(element)
      .find(".dropdown-item[data-episode]")
      .each((_index: number, item: any) => {
        const episodeKey = ($(item).attr("data-episode") || "").trim();
        if (!episodeKey) return;
        const parts = episodeKey.split("-");
        const episodeNumber = parts[1] || parts[0] || "";
        const label =
          $(item).text().trim() ||
          (episodeNumber ? `Episode ${episodeNumber}` : "Episode");

        const list = seasons.get(season) || [];
        list.push({
          key: episodeKey,
          label,
          episodeNumber,
        });
        seasons.set(season, list);
      });
  });

  const linkList: Link[] = [];
  let episodesCount = 0;

  Array.from(seasons.entries())
    .sort(([a], [b]) => Number(a) - Number(b))
    .forEach(([season, episodes]) => {
      const directLinks = episodes.map((episode) => {
        const titleKey = episode.episodeNumber
          ? "Episode {{number}}"
          : undefined;
        const titleParams = episode.episodeNumber
          ? { number: episode.episodeNumber }
          : undefined;
        return {
          title: episode.label,
          titleKey,
          titleParams,
          link: `${pageUrl}::${episode.key}`,
          type: "series" as const,
        };
      });

      episodesCount += episodes.length;

      linkList.push({
        title: `Season ${season}`,
        titleKey: season ? "Season {{number}}" : undefined,
        titleParams: season ? { number: season } : undefined,
        directLinks,
      });
    });

  return { linkList, episodesCount };
};

const extractRelatedItems = (
  $: any,
  baseUrl: string
): Info["related"] | undefined => {
  const relatedLabels = new Set([
    "correlati",
    "potrebbe piacerti",
    "consigliati",
    "simili",
  ]);
  const titleNode = $("h5.section-title, h4.section-title, h3.section-title")
    .filter((_idx: number, element: any) =>
      relatedLabels.has(normalizeText($(element).text()))
    )
    .first();

  let containers: any[] = [];
  if (titleNode.length) {
    const section = titleNode.closest("section");
    if (section.length) {
      containers = section.find(".movie_horizontal").toArray();
    } else {
      containers = titleNode
        .closest(".section-head")
        .nextAll(".movie_horizontal")
        .toArray();
    }
  }

  if (containers.length === 0) {
    containers = $(
      ".related-movies, .related-posts, .movie-related, .related, .movie_horizontal"
    ).toArray();
  }

  if (containers.length === 0) {
    return undefined;
  }

  const related: NonNullable<Info["related"]> = [];
  const seen = new Set<string>();

  containers.forEach((element: any) => {
    const item = $(element);
    const anchor =
      item.find(".movie_horizontal-title a[href]").first() ||
      item.find("a[href]").first();
    const href = anchor.attr("href") || "";
    const resolved = resolveUrl(href, baseUrl);
    if (!isDetailLink(resolved, baseUrl)) return;
    if (seen.has(resolved)) return;

    const title =
      anchor.text().trim() ||
      anchor.attr("aria-label") ||
      anchor.attr("title") ||
      "";
    if (!title) return;

    const image = extractImage(item, baseUrl);
    const type = /\/serie-tv\//i.test(resolved) ? "series" : "movie";

    related.push({
      title,
      link: resolved,
      image: image || undefined,
      type,
    });
    seen.add(resolved);
  });

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
    const { axios, cheerio, commonHeaders } = providerContext;
    const baseUrl = await resolveBaseUrl(providerContext);
    const pageUrl = resolveUrl(link, baseUrl).split("#")[0];

    const res = await axios.get(pageUrl, {
      headers: {
        ...commonHeaders,
        Referer: `${baseUrl}/`,
      },
      timeout: REQUEST_TIMEOUT,
    });

    const html = res.data || "";
    const $ = cheerio.load(html);

    const title =
      $(".movie_entry-title").first().text().trim() ||
      $("meta[property='og:title']").attr("content")?.trim() ||
      $("h1").first().text().trim() ||
      "";

    const posterRaw =
      $(".movie_entry-poster").attr("data-src") ||
      $(".movie_entry-poster").attr("src") ||
      $("meta[property='og:image']").attr("content") ||
      "";
    const image = posterRaw ? resolveUrl(posterRaw, baseUrl) : "";

    const synopsis = cleanText($(".movie_entry-plot").text() || "");
    const imdbId = extractImdbId(html);
    const rating = $(".label.imdb").first().text().trim() || "";

    const yearRaw = extractDetailValue($, "Anno");
    const runtime = extractDetailValue($, "Durata");
    const country = extractDetailValue($, "Paese");
    const director =
      extractDetailValue($, "Regista") || extractDetailValue($, "Regia");
    const genres = extractDetailList($, "Genere");
    const tagKeys = buildTagKeys(genres);
    const tags = genres.length > 0 ? genres : undefined;
    const castRaw = extractDetailValue($, "Cast");
    const cast = castRaw
      ? castRaw
          .split(",")
          .map((value: string) => value.trim())
          .filter(Boolean)
      : [];

    const isSeries =
      $(".series-select").length > 0 || /\/serie-tv\//i.test(pageUrl);

    const related = extractRelatedItems($, baseUrl);

    let linkList: Link[] = [];
    let episodesCount: number | undefined = undefined;

    if (isSeries) {
      const seriesLinks = buildSeriesLinks($, pageUrl);
      linkList = seriesLinks.linkList;
      episodesCount = seriesLinks.episodesCount || undefined;
    } else {
      linkList = [
        {
          title: "Play",
          titleKey: "Play",
          directLinks: [
            {
              title: "Play",
              titleKey: "Play",
              link: pageUrl,
              type: "movie",
            },
          ],
        },
      ];
    }

    return {
      title,
      synopsis,
      image,
      poster: image,
      imdbId,
      year: yearRaw || undefined,
      runtime: runtime || undefined,
      country: country || undefined,
      director: director || undefined,
      type: isSeries ? "series" : "movie",
      rating,
      genres,
      tags,
      tagKeys: Object.keys(tagKeys).length > 0 ? tagKeys : undefined,
      cast,
      episodesCount,
      related,
      linkList,
    };
  } catch (err) {
    console.error("altadefinizionez meta error", err);
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
