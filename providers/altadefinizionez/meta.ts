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

const extractDetailRow = (
  $: ReturnType<ProviderContext["cheerio"]["load"]>,
  label: string
): ReturnType<ProviderContext["cheerio"]["load"]> | null => {
  const target = label.toLowerCase();
  let row: ReturnType<ProviderContext["cheerio"]["load"]> | null = null;
  $(".movie_entry-details .row").each((_, element) => {
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
  $: ReturnType<ProviderContext["cheerio"]["load"]>,
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
  $: ReturnType<ProviderContext["cheerio"]["load"]>,
  label: string
): string[] => {
  const row = extractDetailRow($, label);
  if (!row) return [];
  const linked = row
    .find("a")
    .map((_, el) => $(el).text().trim())
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
    .map((value) => value.trim())
    .filter(Boolean);
};

const buildSeriesLinks = (
  $: ReturnType<ProviderContext["cheerio"]["load"]>,
  pageUrl: string
): { linkList: Link[]; episodesCount: number } => {
  const seasons = new Map<
    string,
    Array<{ key: string; label: string; episodeNumber: string }>
  >();

  $(".dropdown.episodes[data-season]").each((_, element) => {
    const season = ($(element).attr("data-season") || "").trim();
    if (!season) return;

    $(element)
      .find(".dropdown-item[data-episode]")
      .each((__, item) => {
        const episodeKey = ($(item).attr("data-episode") || "").trim();
        if (!episodeKey) return;
        const parts = episodeKey.split("-");
        const episodeNumber = parts[1] || parts[0] || "";
        const label =
          $(item).text().trim() ||
          (episodeNumber ? `Episodio ${episodeNumber}` : "Episodio");

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
      const directLinks = episodes.map((episode) => ({
        title: episode.label,
        link: `${pageUrl}::${episode.key}`,
        type: "series" as const,
      }));

      episodesCount += episodes.length;

      linkList.push({
        title: `Stagione ${season}`,
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
    const castRaw = extractDetailValue($, "Cast");
    const cast = castRaw
      ? castRaw
          .split(",")
          .map((value) => value.trim())
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
          title: "Streaming",
          directLinks: [
            {
              title: "Guarda",
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