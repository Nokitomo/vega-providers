import { EpisodeLink, ProviderContext } from "../types";
import {
  DEFAULT_LOCALE,
  REQUEST_TIMEOUT,
  extractInertiaPage,
  extractTitleId,
  getTranslationValue,
  normalizeText,
  resolveBaseUrl,
  resolveUrl,
} from "./utils";

const fetchHtml = async (
  url: string,
  providerContext: ProviderContext
): Promise<string> => {
  const { axios, commonHeaders } = providerContext;
  const res = await axios.get(url, {
    headers: {
      ...commonHeaders,
      Referer: url,
    },
    timeout: REQUEST_TIMEOUT,
  });
  return typeof res.data === "string" ? res.data : String(res.data ?? "");
};

const toSeasonNumber = (value: unknown): number | undefined => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.floor(parsed);
};

const parseSeasonNumberFromUrl = (url: string): number | undefined => {
  const match = String(url || "").match(/\/season-(\d+)\b/i);
  if (!match?.[1]) {
    return undefined;
  }
  return toSeasonNumber(match[1]);
};

const mapEpisodes = (
  episodes: any[],
  titleId: string,
  seasonNumber?: number
): EpisodeLink[] => {
  if (!Array.isArray(episodes) || episodes.length === 0 || !titleId) {
    return [];
  }

  return episodes
    .map((episode) => {
      const episodeId = String(episode?.id || "").trim();
      if (!episodeId) return null;

      const rawNumber = episode?.number != null ? String(episode.number) : "";
      const parsedEpisodeNumber = Number.parseInt(rawNumber, 10);
      const translatedName = getTranslationValue(
        episode?.translations,
        "name",
        DEFAULT_LOCALE
      );
      const name = normalizeText(translatedName || episode?.name || "");
      const title = name || (rawNumber ? `Episode ${rawNumber}` : "Episode");
      const titleKey = !name && rawNumber ? "Episode {{number}}" : undefined;

      return {
        title,
        titleKey,
        titleParams: titleKey ? { number: rawNumber } : undefined,
        episodeNumber: Number.isFinite(parsedEpisodeNumber)
          ? parsedEpisodeNumber
          : undefined,
        seasonNumber,
        link: `${titleId}::${episodeId}`,
      } as EpisodeLink;
    })
    .filter((episode): episode is EpisodeLink => !!episode && !!episode.link);
};

export const getEpisodes = async function ({
  url,
  providerContext,
}: {
  url: string;
  providerContext: ProviderContext;
}): Promise<EpisodeLink[]> {
  try {
    const baseUrl = await resolveBaseUrl(providerContext);
    const seasonUrl = resolveUrl(url, baseUrl);
    if (!seasonUrl) return [];

    const html = await fetchHtml(seasonUrl, providerContext);
    const page = extractInertiaPage(html, providerContext.cheerio);
    const titleId = String(
      page?.props?.title?.id || extractTitleId(seasonUrl) || ""
    ).trim();
    if (!titleId) return [];

    const loadedSeason = page?.props?.loadedSeason;
    const seasonNumber =
      toSeasonNumber(loadedSeason?.number) ||
      parseSeasonNumberFromUrl(seasonUrl);
    const episodes = Array.isArray(loadedSeason?.episodes)
      ? loadedSeason.episodes
      : [];

    return mapEpisodes(episodes, titleId, seasonNumber);
  } catch (err) {
    console.error("streamingunity episodes error", err);
    return [];
  }
};
