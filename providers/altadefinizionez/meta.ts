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
      type: isSeries ? "series" : "movie",
      rating,
      genres,
      tags,
      tagKeys: Object.keys(tagKeys).length > 0 ? tagKeys : undefined,
      cast,
      episodesCount,
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