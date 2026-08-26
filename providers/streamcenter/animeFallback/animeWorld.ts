import { ProviderContext, Stream } from "../../types";
import { AnimeFallbackContext, AnimeWorldPlayback, ExternalAnimeIds } from "./types";
import {
  absoluteUrl,
  extractNumericId,
  inferStreamType,
  mapWithConcurrency,
  normalizeEpisodeNumber,
  normalizeTitle,
  titleScore,
} from "./utils";
import { resolveFallbackDomain } from "./domains";

type SearchItem = {
  url: string;
  title: string;
  otherTitle?: string;
  dubbed: boolean;
  score: number;
};

type PageData = ExternalAnimeIds & {
  title: string;
  dubbed: boolean;
  episodes: Map<string, AnimeWorldPlayback>;
};

const REQUEST_TIMEOUT_MS = 12_000;
const DETAIL_LIMIT = 12;

export const parseAnimeWorldSearchHtml = (
  html: string,
  baseUrl: string,
  query: string,
  cheerio: ProviderContext["cheerio"]
): SearchItem[] => {
  const $ = cheerio.load(html || "");
  return $("div.film-list > .item")
    .map((_, element) => {
      const item = $(element);
      const anchor = item.find("a.name[href]").first();
      const title = anchor.text().trim();
      const href = anchor.attr("href") || "";
      if (!title || !href) return null;
      const otherTitle = String(anchor.attr("data-jtitle") || "").trim();
      const score = Math.max(
        titleScore(title, query),
        otherTitle ? titleScore(otherTitle, query) : 0
      );
      if (score <= 0) return null;
      return {
        url: absoluteUrl(baseUrl, href).replace(/\/+$/, ""),
        title,
        otherTitle: otherTitle || undefined,
        dubbed:
          item.find(".status .dub").length > 0 ||
          /\(ITA\)/i.test(title) ||
          /\(ITA\)/i.test(otherTitle),
        score,
      } as SearchItem;
    })
    .get()
    .filter((item): item is SearchItem => Boolean(item?.url));
};

export const parseAnimeWorldPageHtml = (
  html: string,
  pageUrl: string,
  fallbackTitle: string,
  fallbackDubbed: boolean,
  cheerio: ProviderContext["cheerio"]
): PageData | null => {
  const $ = cheerio.load(html || "");
  const dubbed = fallbackDubbed || /window\.animeDub\s*=\s*true/i.test(html);
  const preferred = $(
    ".widget.servers .server[data-name='9'] a[data-id][data-episode-num]"
  );
  const anchors = preferred.length
    ? preferred
    : $(".widget.servers a[data-id][data-episode-num]");
  const episodes = new Map<string, AnimeWorldPlayback>();
  anchors.each((_, element) => {
    const anchor = $(element);
    const token = String(anchor.attr("data-id") || "").trim();
    const number = normalizeEpisodeNumber(
      anchor.attr("data-episode-num") || anchor.attr("data-num") || anchor.text()
    );
    if (!token || !number || episodes.has(number)) return;
    episodes.set(number, {
      source: "animeworld",
      label: dubbed ? "DUB" : "SUB",
      pageUrl,
      episodeToken: token,
    });
  });
  if (episodes.size === 0) return null;

  return {
    title: fallbackTitle,
    dubbed,
    anilistId: extractNumericId(
      $("#anilist-button[href]").first().attr("href") || "",
      /anilist\.co\/anime\/(\d+)/i
    ),
    malId: extractNumericId(
      $("#mal-button[href]").first().attr("href") || "",
      /myanimelist\.net\/anime\/(\d+)/i
    ),
    episodes,
  };
};

const matchesIdentity = (page: PageData, identity: AnimeFallbackContext): boolean =>
  Boolean(
    (identity.anilistId && page.anilistId === identity.anilistId) ||
      (identity.malId && page.malId === identity.malId)
  );

export const discoverAnimeWorldEpisodes = async (
  identity: AnimeFallbackContext,
  providerContext: ProviderContext,
  signal?: AbortSignal
): Promise<Map<string, AnimeWorldPlayback[]>> => {
  try {
    if (!identity.title) return new Map();
    const baseUrl = await resolveFallbackDomain("animeworld", providerContext);
    const searchUrl = `${baseUrl}/filter?sort=0&keyword=${encodeURIComponent(identity.title)}`;
    const response = await providerContext.axios.get(searchUrl, {
      headers: providerContext.commonHeaders,
      timeout: REQUEST_TIMEOUT_MS,
      signal,
    });
    const candidates = parseAnimeWorldSearchHtml(
      String(response.data || ""),
      baseUrl,
      identity.title,
      providerContext.cheerio
    )
      .sort((left, right) => right.score - left.score)
      .filter(
        (item, index, values) =>
          values.findIndex((candidate) => candidate.url === item.url) === index
      )
      .slice(0, DETAIL_LIMIT);

    const hasIds = Boolean(identity.anilistId || identity.malId);
    const pages: PageData[] = [];
    for (let index = 0; index < candidates.length; index += 4) {
      const batch = candidates.slice(index, index + 4);
      const batchPages = (
        await mapWithConcurrency(batch, 4, async (candidate) => {
          try {
            const detail = await providerContext.axios.get(candidate.url, {
              headers: providerContext.commonHeaders,
              timeout: REQUEST_TIMEOUT_MS,
              signal,
            });
            return parseAnimeWorldPageHtml(
              String(detail.data || ""),
              candidate.url,
              candidate.title,
              candidate.dubbed,
              providerContext.cheerio
            );
          } catch (_) {
            return null;
          }
        })
      ).filter((page): page is PageData => Boolean(page));
      pages.push(...batchPages);
      const foundSafeMatch = hasIds
        ? batchPages.some((page) => matchesIdentity(page, identity))
        : batchPages.some(
            (page) => normalizeTitle(page.title) === normalizeTitle(identity.title)
          );
      if (foundSafeMatch) break;
    }

    const idMatches = pages.filter((page) => matchesIdentity(page, identity));
    const selected = idMatches.length
      ? idMatches
      : pages.filter(
          (page) =>
            (!hasIds || (!page.anilistId && !page.malId)) &&
            normalizeTitle(page.title) === normalizeTitle(identity.title)
        );
    const ordered = selected.sort((left, right) => {
      if (left.dubbed === right.dubbed) return 0;
      return left.dubbed === Boolean(identity.dubbed) ? -1 : 1;
    });

    const output = new Map<string, AnimeWorldPlayback[]>();
    ordered.forEach((page) => {
      page.episodes.forEach((playback, number) => {
        const list = output.get(number) || [];
        list.push(playback);
        output.set(number, list);
      });
    });
    return output;
  } catch (_) {
    return new Map();
  }
};

export const resolveAnimeWorldStream = async (
  playback: AnimeWorldPlayback,
  providerContext: ProviderContext,
  signal: AbortSignal
): Promise<Stream[]> => {
  try {
    const baseUrl = await resolveFallbackDomain("animeworld", providerContext);
    const response = await providerContext.axios.get(
      `${baseUrl}/api/episode/info?id=${encodeURIComponent(playback.episodeToken)}`,
      {
        headers: {
          ...providerContext.commonHeaders,
          Referer: playback.pageUrl,
        },
        timeout: REQUEST_TIMEOUT_MS,
        signal,
      }
    );
    const grabber = String(response.data?.grabber || "").trim();
    const target = String(response.data?.target || "");
    if (
      !/^https?:\/\//i.test(grabber) ||
      /listeamed\.net/i.test(grabber) ||
      /listeamed\.net/i.test(target)
    ) {
      return [];
    }
    return [
      {
        server: `AnimeWorld ${playback.label}`,
        link: grabber,
        type: inferStreamType(grabber),
        headers: {
          Referer: baseUrl,
          ...(providerContext.commonHeaders["User-Agent"]
            ? { "User-Agent": providerContext.commonHeaders["User-Agent"] }
            : {}),
        },
      },
    ];
  } catch (_) {
    return [];
  }
};
