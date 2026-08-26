import { ProviderContext, Stream } from "../../types";
import { AnimeFallbackContext, AnimeSaturnPlayback, ExternalAnimeIds } from "./types";
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
  dubbed: boolean;
  score: number;
};

type PageData = ExternalAnimeIds & {
  title: string;
  dubbed: boolean;
  episodes: Map<string, AnimeSaturnPlayback>;
};

const REQUEST_TIMEOUT_MS = 12_000;
const DETAIL_LIMIT = 18;

const titleFromHref = (href: string): string =>
  String(href || "")
    .split("/anime/")[1]
    ?.split("?")[0]
    ?.replace(/\/[\s\S]*$/, "")
    ?.replace(/-[A-Za-z0-9]{5}$/, "")
    ?.replace(/-/g, " ")
    ?.trim() || "";

export const parseAnimeSaturnSearchHtml = (
  html: string,
  baseUrl: string,
  query: string,
  cheerio: ProviderContext["cheerio"]
): SearchItem[] => {
  const $ = cheerio.load(html || "");
  const output: SearchItem[] = [];
  $(
    "a.ac[href^='/anime/'], a.ac[href*='/anime/'], a[href^='/anime/'], a[href*='animesaturn.net/anime/']"
  ).each((_, element) => {
    const item = $(element);
    const href = String(item.attr("href") || "").trim();
    if (!href || /\/ep-/i.test(href)) return;
    const parsed =
      item.find(".ac__title, h3, h4, .title").first().text().trim() ||
      String(item.find("img[alt]").first().attr("alt") || "").trim() ||
      String(item.attr("title") || "").trim() ||
      item.text().trim();
    const title = /^(dettagli|detail|details)$/i.test(parsed)
      ? titleFromHref(href)
      : parsed || titleFromHref(href);
    const score = titleScore(title, query);
    if (!title || score <= 0) return;
    output.push({
      url: absoluteUrl(baseUrl, href).replace(/\/+$/, ""),
      title,
      dubbed:
        item.find(".ac__dub-badge").length > 0 ||
        /(?:^|[-\s(])ita(?:$|[-\s)])/i.test(title) ||
        /(?:^|[-/])ita(?:$|[-/])/i.test(href),
      score,
    });
  });
  return output;
};

export const parseAnimeSaturnPageHtml = (
  html: string,
  pageUrl: string,
  fallbackTitle: string,
  fallbackDubbed: boolean,
  baseUrl: string,
  cheerio: ProviderContext["cheerio"]
): PageData | null => {
  const $ = cheerio.load(html || "");
  const dubbed =
    fallbackDubbed ||
    /(?:^|[-/])ita(?:$|[-/])/i.test(pageUrl) ||
    /(?:^|[-\s(])ita(?:$|[-\s)])/i.test(fallbackTitle);
  const episodes = new Map<string, AnimeSaturnPlayback>();
  $(
    "a.ep-tile[href*='/ep-'], a[href*='/episode/'][href*='/ep-'], a[href*='/anime/'][href*='/ep-']"
  ).each((_, element) => {
    const anchor = $(element);
    const href = String(anchor.attr("href") || "").trim();
    const rawNumber =
      href.match(/\/ep-([0-9]+(?:\.[0-9]+)?)/i)?.[1] ||
      String(anchor.attr("title") || "").match(/episodio\s+([0-9]+(?:\.[0-9]+)?)/i)?.[1];
    const number = normalizeEpisodeNumber(rawNumber);
    if (!href || !number || episodes.has(number)) return;
    const normalizedHref = href.replace(/^\/episode\//i, "/anime/");
    episodes.set(number, {
      source: "animesaturn",
      label: dubbed ? "DUB" : "SUB",
      watchUrl: absoluteUrl(baseUrl, normalizedHref),
    });
  });
  if (episodes.size === 0) return null;

  return {
    title: fallbackTitle,
    dubbed,
    anilistId: extractNumericId(html, /(?:anilist\.co\/anime\/|\/anilist\/)(\d+)/i),
    malId: extractNumericId(
      html,
      /(?:myanimelist\.net\/anime\/|\/mal\/)(\d+)/i
    ),
    episodes,
  };
};

const matchesIdentity = (page: PageData, identity: AnimeFallbackContext): boolean =>
  Boolean(
    (identity.anilistId && page.anilistId === identity.anilistId) ||
      (identity.malId && page.malId === identity.malId)
  );

export const discoverAnimeSaturnEpisodes = async (
  identity: AnimeFallbackContext,
  providerContext: ProviderContext,
  signal?: AbortSignal
): Promise<Map<string, AnimeSaturnPlayback[]>> => {
  try {
    if (!identity.title) return new Map();
    const baseUrl = await resolveFallbackDomain("animesaturn", providerContext);
    const searchUrl = `${baseUrl}/filter?key=${encodeURIComponent(identity.title)}`;
    const response = await providerContext.axios.get(searchUrl, {
      headers: providerContext.commonHeaders,
      timeout: REQUEST_TIMEOUT_MS,
      signal,
    });
    const candidates = parseAnimeSaturnSearchHtml(
      String(response.data || ""),
      baseUrl,
      identity.title,
      providerContext.cheerio
    )
      .sort((left, right) => right.score - left.score || left.title.length - right.title.length)
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
            return parseAnimeSaturnPageHtml(
              String(detail.data || ""),
              candidate.url,
              candidate.title,
              candidate.dubbed,
              baseUrl,
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

    const output = new Map<string, AnimeSaturnPlayback[]>();
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

const decodeBase64 = (encoded: string): number[] | null => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = String(encoded || "").replace(/\s+/g, "").replace(/=+$/, "");
  if (!clean) return null;
  let bits = 0;
  let bitCount = 0;
  const output: number[] = [];
  for (const character of clean) {
    const value = alphabet.indexOf(character);
    if (value < 0) return null;
    bits = (bits << 6) | value;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      output.push((bits >> bitCount) & 0xff);
    }
  }
  return output;
};

export const decodeAnimeSaturnPayload = (
  encoded: string,
  key: string
): string | null => {
  if (!key) return null;
  const bytes = decodeBase64(encoded);
  if (!bytes) return null;
  try {
    const decoded = bytes
      .map((byte, index) =>
        String.fromCharCode(byte ^ key.charCodeAt(index % key.length))
      )
      .join("");
    return decodeURIComponent(
      decoded
        .split("")
        .map((character) =>
          `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`
        )
        .join("")
    );
  } catch (_) {
    return null;
  }
};

export const resolveAnimeSaturnStream = async (
  playback: AnimeSaturnPlayback,
  providerContext: ProviderContext,
  signal: AbortSignal
): Promise<Stream[]> => {
  try {
    const response = await providerContext.axios.get(playback.watchUrl, {
      headers: providerContext.commonHeaders,
      timeout: REQUEST_TIMEOUT_MS,
      signal,
    });
    const html = String(response.data || "");
    const $ = providerContext.cheerio.load(html);
    const baseUrl = await resolveFallbackDomain("animesaturn", providerContext);
    const rawEmbed =
      $("iframe#watch-iframe[src], iframe[src*='play.saturncdn.net'][src]")
        .first()
        .attr("src") ||
      html
        .match(/"initialVideoUrl"\s*:\s*"([^"]+)"/i)?.[1]
        ?.replace(/\\\//g, "/")
        ?.replace(/\\u0026/g, "&") ||
      "";
    const embedUrl = absoluteUrl(baseUrl, rawEmbed);
    const match = embedUrl.match(/\/embed\/(\d+)\?token=([^&]+)&expires=(\d+)/i);
    if (!match) return [];
    const [, id, token, expires] = match;
    const playlistBase = embedUrl.split("/embed/")[0];
    const playlistUrl = `${playlistBase}/embed/${id}/playlist?token=${token}&expires=${expires}`;
    const playlist = await providerContext.axios.get(playlistUrl, {
      headers: {
        ...providerContext.commonHeaders,
        Referer: embedUrl,
      },
      timeout: REQUEST_TIMEOUT_MS,
      signal,
    });
    const encoded = String(playlist.data?.d || "").trim();
    const decoded = decodeAnimeSaturnPayload(encoded, token);
    if (!decoded || decoded.startsWith("youtube/")) return [];
    return [
      {
        server: `AnimeSaturn ${playback.label}`,
        link: decoded,
        type: inferStreamType(decoded),
        headers: {
          Referer: embedUrl,
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
