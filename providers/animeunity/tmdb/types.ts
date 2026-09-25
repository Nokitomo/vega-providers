import {
  TmdbEpisodeMetadata,
  TmdbEpisodeGroupMetadata,
  TmdbImageMetadata,
  TmdbLocalizedText,
  TmdbMediaMetadata,
  TmdbPersonCredit,
  TmdbSeasonMetadata,
  TmdbTranslationMetadata,
  TmdbVideoMetadata,
  TmdbWatchProviderMetadata,
} from "../../types";

export type TmdbMediaType = "movie" | "tv";

export type TmdbArtworkField = "logo" | "poster" | "background";
export type TmdbImageSize = "original" | "w300" | "w780";

export type TmdbArtworkMetadata = {
  id: number;
  type: TmdbMediaType;
  source: "tmdb-web";
  sourceUrl: string;
  originalLanguage?: string;
  seasonNumber?: number;
  logo?: string;
  poster?: string;
  background?: string;
};

export type TmdbPageMetadata = {
  locale: string;
  title?: string;
  originalTitle?: string;
  overview?: string;
  tagline?: string;
  originalLanguageName?: string;
  startDate?: string;
  endDate?: string;
  releaseDate?: string;
  certification?: string;
  status?: string;
  mediaType?: string;
  rating?: number;
  ratingCount?: number;
  contentScore?: number;
  numberOfEpisodes?: number;
  genres: string[];
  countries: string[];
  facts: Record<string, string>;
  keywords: string[];
  networks: TmdbMediaMetadata["networks"];
  socialLinks: Record<string, string>;
  cast: TmdbPersonCredit[];
  poster?: string;
  background?: string;
  schema: Record<string, unknown>;
};

export type TmdbSeasonPageMetadata = Omit<
  TmdbSeasonMetadata,
  "name" | "overview" | "posters" | "backgrounds"
> & {
  locale: string;
  name?: string;
  overview?: string;
  posterLanguage?: string;
};

export type TmdbExtendedMetadata = {
  cast: TmdbPersonCredit[];
  crew: TmdbPersonCredit[];
  videos: TmdbVideoMetadata[];
  watchProviders: TmdbWatchProviderMetadata[];
  episodeGroups: TmdbEpisodeGroupMetadata[];
  translations: TmdbTranslationMetadata[];
};

export type {
  TmdbEpisodeMetadata,
  TmdbEpisodeGroupMetadata,
  TmdbImageMetadata,
  TmdbLocalizedText,
  TmdbMediaMetadata,
  TmdbPersonCredit,
  TmdbSeasonMetadata,
  TmdbTranslationMetadata,
  TmdbVideoMetadata,
  TmdbWatchProviderMetadata,
};
