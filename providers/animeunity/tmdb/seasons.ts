import { normalizeTmdbImageUrl } from "./images";
import { pickLocalizedText } from "./locales";
import {
  TmdbEpisodeMetadata,
  TmdbImageMetadata,
  TmdbSeasonMetadata,
  TmdbSeasonPageMetadata,
} from "./types";

function cleanText(value: unknown): string | undefined {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

function parseIntValue(value: unknown): number | undefined {
  const match = String(value ?? "").match(/\d+/);
  const parsed = Number.parseInt(match?.[0] || "", 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseTmdbSeasonsPage(
  html: string,
  cheerio: any,
  locale: string,
  mediaId: number
): TmdbSeasonPageMetadata[] {
  const $ = cheerio.load(html);
  return $(".season_wrapper .season, .season")
    .map((_: number, element: any) => {
      const season = $(element);
      const link = season.find('a[href*="/season/"]').first();
      const seasonNumber = parseIntValue(
        link.attr("href")?.match(/\/season\/(\d+)/)?.[1]
      );
      if (seasonNumber == null) return null;
      const summary = cleanText(season.find("h4").first().text());
      const numbers = String(summary || "").match(/\d+/g) || [];
      const yearValue = numbers.find((value) => /^\d{4}$/.test(value));
      const episodeValue = numbers[numbers.length - 1];
      const year = yearValue ? Number.parseInt(yearValue, 10) : undefined;
      const episodeCount = episodeValue && episodeValue !== yearValue
        ? Number.parseInt(episodeValue, 10)
        : undefined;
      return {
        locale,
        seasonNumber,
        name: cleanText(season.find("h2 a").first().text()),
        overview: cleanText(season.find(".season_overview").text()),
        year,
        episodeCount,
        poster: normalizeTmdbImageUrl(season.find("img.poster").attr("src")),
        posterLanguage: locale.split("-")[0],
        sourceUrl: `https://www.themoviedb.org/tv/${mediaId}/season/${seasonNumber}`,
      } as TmdbSeasonPageMetadata;
    })
    .get()
    .filter(Boolean) as TmdbSeasonPageMetadata[];
}

export function mergeTmdbSeasons(
  localizedSeasons: TmdbSeasonPageMetadata[][]
): TmdbSeasonMetadata[] {
  const byNumber = new Map<number, TmdbSeasonPageMetadata[]>();
  localizedSeasons.forEach((seasons) =>
    seasons.forEach((season) => {
      const values = byNumber.get(season.seasonNumber) || [];
      values.push(season);
      byNumber.set(season.seasonNumber, values);
    })
  );

  return Array.from(byNumber.entries())
    .sort(([left], [right]) => left - right)
    .map(([seasonNumber, values]) => {
      const posters: TmdbImageMetadata[] = [];
      values.forEach((value) => {
        if (!value.poster || posters.some((poster) => poster.url === value.poster)) {
          return;
        }
        posters.push({
          type: "poster",
          url: value.poster,
          previewUrl: value.poster,
          language: value.posterLanguage || value.locale.split("-")[0],
        });
      });
      return {
        seasonNumber,
        name: pickLocalizedText(values, (value) => value.name, (value) => value.locale),
        overview: pickLocalizedText(
          values,
          (value) => value.overview,
          (value) => value.locale
        ),
        year: values.find((value) => value.year)?.year,
        episodeCount: values.find((value) => value.episodeCount)?.episodeCount,
        poster: posters[0]?.url,
        posters,
        backgrounds: [],
        sourceUrl: values[0].sourceUrl,
      };
    });
}

export function parseTmdbSeasonEpisodesPage(
  html: string,
  cheerio: any,
  locale: string,
  mediaId: number,
  seasonNumber: number
): TmdbEpisodeMetadata[] {
  const $ = cheerio.load(html);
  return $(".episode_list .card")
    .map((_: number, element: any) => {
      const card = $(element);
      const episodeLink = card.find("a[data-episode-number]").first();
      const episodeNumber = parseIntValue(
        episodeLink.attr("data-episode-number") ||
          card.find(".episode_number").text()
      );
      if (episodeNumber == null) return null;
      const rawThumbnail = card.find("img.backdrop").attr("src");
      const thumbnail = normalizeTmdbImageUrl(rawThumbnail, "w300");
      const originalStill = normalizeTmdbImageUrl(rawThumbnail);
      const runtimeMinutes = parseIntValue(card.find("span.runtime").text());
      const ratingPercent = parseIntValue(card.find(".rating").first().text());
      const internalId =
        String(episodeLink.attr("data-episode-id") || card.attr("data-object-id") || "")
          .trim() || undefined;
      const stills: TmdbImageMetadata[] = originalStill
        ? [
            {
              type: "still",
              url: originalStill,
              previewUrl: thumbnail,
              language: "xx",
            },
          ]
        : [];
      return {
        id: internalId,
        seasonNumber,
        episodeNumber,
        title: cleanText(card.find(".episode_title h3 a").first().text())
          ? {
              value: cleanText(card.find(".episode_title h3 a").first().text())!,
              language: locale,
            }
          : undefined,
        overview: cleanText(card.find(".overview p").first().text())
          ? {
              value: cleanText(card.find(".overview p").first().text())!,
              language: locale,
            }
          : undefined,
        airDateText: cleanText(card.find("span.date").first().text())
          ? {
              value: cleanText(card.find("span.date").first().text())!,
              language: locale,
            }
          : undefined,
        runtimeMinutes,
        rating: ratingPercent != null ? ratingPercent / 10 : undefined,
        thumbnail,
        stills,
        sourceUrl: `https://www.themoviedb.org/tv/${mediaId}/season/${seasonNumber}/episode/${episodeNumber}`,
      } as TmdbEpisodeMetadata;
    })
    .get()
    .filter(Boolean) as TmdbEpisodeMetadata[];
}

export function mergeTmdbEpisodes(
  localizedEpisodes: TmdbEpisodeMetadata[][]
): TmdbEpisodeMetadata[] {
  const byNumber = new Map<number, TmdbEpisodeMetadata[]>();
  localizedEpisodes.forEach((episodes) =>
    episodes.forEach((episode) => {
      const values = byNumber.get(episode.episodeNumber) || [];
      values.push(episode);
      byNumber.set(episode.episodeNumber, values);
    })
  );
  return Array.from(byNumber.entries())
    .sort(([left], [right]) => left - right)
    .map(([episodeNumber, values]) => {
      const first = values[0];
      const stills = new Map<string, TmdbImageMetadata>();
      values.flatMap((value) => value.stills).forEach((image) => stills.set(image.url, image));
      return {
        ...first,
        episodeNumber,
        title: pickLocalizedText(
          values,
          (value) => value.title?.value,
          (value) => value.title?.language || "xx"
        ),
        overview: pickLocalizedText(
          values,
          (value) => value.overview?.value,
          (value) => value.overview?.language || "xx"
        ),
        airDateText: pickLocalizedText(
          values,
          (value) => value.airDateText?.value,
          (value) => value.airDateText?.language || "xx"
        ),
        thumbnail: values.find((value) => value.thumbnail)?.thumbnail,
        stills: Array.from(stills.values()),
      };
    });
}
