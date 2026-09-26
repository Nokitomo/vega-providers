export type TvdbArtworkField = "logo" | "poster" | "background";
export type TvdbMediaType = "series" | "movie";

export type TvdbArtwork = {
  id?: string;
  url: string;
  language?: string;
  type: TvdbArtworkField;
};

export type TvdbArtworkMetadata = {
  source: "tvdb-web";
  sourceUrl: string;
  tvdbId: number;
  mediaType: TvdbMediaType;
  tvdbShowId?: number;
  tvdbMovieId?: number;
  seasonNumber?: number;
  title?: string;
  originalLanguage?: string;
  logo?: string;
  poster?: string;
  background?: string;
};
