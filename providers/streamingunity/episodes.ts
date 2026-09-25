import { EpisodeLink, ProviderContext } from "../types";
import {
  DEFAULT_LOCALE,
  REQUEST_TIMEOUT,
  extractInertiaPage,
  extractTitleId,
  getTranslationValue,
  normalizeText,
  pickImageByType,
  resolveCdnUrl,
  resolveBaseUrl,
  resolveUrl,
} from "./utils";
import { buildStreamingUnityPlaybackLink } from "./playback";
import { resolveTmdbEpisodeSeasonMetadata } from "../animeunity/tmdb";

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
  seasonNumber: number | undefined,
  imdbId: string,
  tmdbId: string,
  cdnUrl: string
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
      const translatedPlot = getTranslationValue(
        episode?.translations,
        "plot",
        DEFAULT_LOCALE
      );
      const name = normalizeText(translatedName || episode?.name || "");
      const synopsis = normalizeText(translatedPlot || episode?.plot || "");
      const thumbnail =
        pickImageByType(episode?.images, cdnUrl, [
          "cover",
          "background",
          "still",
          "poster",
        ]) || "";
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
        synopsis: synopsis || undefined,
        thumbnail: thumbnail || undefined,
        link: buildStreamingUnityPlaybackLink(titleId, {
          episodeId,
          mediaType: "series",
          imdbId,
          tmdbId,
          seasonNumber,
          episodeNumber: Number.isFinite(parsedEpisodeNumber)
            ? parsedEpisodeNumber
            : undefined,
        }),
      } as EpisodeLink;
    })
    .filter((episode): episode is EpisodeLink => !!episode && !!episode.link);
};

const hasEpisodeText = (value?: string): boolean =>
  typeof value === "string" && value.trim().length > 0;

const enrichEpisodesFromTmdb = async ({
  episodes,
  tmdbId,
  seasonNumber,
  providerContext,
  sourceRevision,
}: {
  episodes: EpisodeLink[];
  tmdbId: string;
  seasonNumber?: number;
  providerContext: ProviderContext;
  sourceRevision?: string;
}): Promise<EpisodeLink[]> => {
  const mediaId = Number.parseInt(tmdbId, 10);
  if (
    !Number.isFinite(mediaId) ||
    mediaId <= 0 ||
    seasonNumber == null ||
    seasonNumber < 0 ||
    episodes.length === 0
  ) {
    return episodes;
  }

  const missing = episodes.filter(
    (episode) =>
      episode.episodeNumber != null &&
      (!hasEpisodeText(episode.title) ||
        episode.titleKey ||
        !hasEpisodeText(episode.synopsis) ||
        !hasEpisodeText(episode.thumbnail))
  );
  if (missing.length === 0) return episodes;

  const season = await resolveTmdbEpisodeSeasonMetadata({
    providerContext,
    mediaId,
    seasonNumber,
    episodeNumbers: missing
      .map((episode) => episode.episodeNumber)
      .filter((value): value is number => value != null),
    sourceRevision,
  });
  if (!season?.episodes?.length) return episodes;
  const tmdbEpisodes = season.episodes;

  return episodes.map((episode) => {
    if (episode.episodeNumber == null) return episode;
    const tmdbEpisode = tmdbEpisodes.find(
      (candidate) => candidate.episodeNumber === episode.episodeNumber
    );
    if (!tmdbEpisode) return episode;
    const tmdbTitle = tmdbEpisode.title?.value;
    return {
      ...episode,
      title:
        (!hasEpisodeText(episode.title) || episode.titleKey) && tmdbTitle
          ? tmdbTitle
          : episode.title,
      titleKey:
        (!hasEpisodeText(episode.title) || episode.titleKey) && tmdbTitle
          ? undefined
          : episode.titleKey,
      titleParams:
        (!hasEpisodeText(episode.title) || episode.titleKey) && tmdbTitle
          ? undefined
          : episode.titleParams,
      synopsis: hasEpisodeText(episode.synopsis)
        ? episode.synopsis
        : tmdbEpisode.overview?.value || episode.synopsis,
      thumbnail: hasEpisodeText(episode.thumbnail)
        ? episode.thumbnail
        : tmdbEpisode.thumbnail || episode.thumbnail,
    };
  });
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
    if (!baseUrl) {
      console.error("streamingunity episodes error: missing base url");
      return [];
    }
    const seasonUrl = resolveUrl(url, baseUrl);
    if (!seasonUrl) return [];

    const html = await fetchHtml(seasonUrl, providerContext);
    const page = extractInertiaPage(html, providerContext.cheerio);
    const title = page?.props?.title;
    const titleId = String(title?.id || extractTitleId(seasonUrl) || "").trim();
    if (!titleId) return [];
    const cdnUrl = resolveCdnUrl(page?.props, baseUrl);

    const loadedSeason = page?.props?.loadedSeason;
    const seasonNumber =
      toSeasonNumber(loadedSeason?.number) ||
      parseSeasonNumberFromUrl(seasonUrl);
    const episodes = Array.isArray(loadedSeason?.episodes)
      ? loadedSeason.episodes
      : [];

    const mapped = mapEpisodes(
      episodes,
      titleId,
      seasonNumber,
      String(title?.imdb_id || "").trim(),
      String(title?.tmdb_id || "").trim(),
      cdnUrl
    );
    return enrichEpisodesFromTmdb({
      episodes: mapped,
      tmdbId: String(title?.tmdb_id || "").trim(),
      seasonNumber,
      providerContext,
      sourceRevision: String(episodes.length || ""),
    });
  } catch (err) {
    console.error("streamingunity episodes error", err);
    return [];
  }
};
