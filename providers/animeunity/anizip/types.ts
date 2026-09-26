import { ExternalEpisodeMapping } from "../../types";

export type AniZipArtwork = {
  logo?: string;
  poster?: string;
  fanart?: string;
  banner?: string;
};

export type AniZipEpisode = {
  tvdbShowId?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  absoluteEpisodeNumber?: number;
  titleIt?: string;
  titleEn?: string;
  overview?: string;
  image?: string;
};

export type AniZipMetadata = {
  imdbId?: string;
  tmdbId?: number;
  tvdbId?: number;
  mediaType?: "movie" | "series";
  artwork: AniZipArtwork;
  episodes: AniZipEpisode[];
};

export type AniZipEpisodeRequest = {
  sourceEpisodeNumber?: number;
  seasonNumber?: number;
  externalMappings?: ExternalEpisodeMapping[];
};

export type AniZipEpisodeFallback = {
  title?: string;
  synopsis?: string;
  thumbnail?: string;
};
