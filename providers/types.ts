import { AxiosStatic } from "axios";
import * as cheerio from "cheerio";

export type I18nParams = Record<string, string | number>;

// Content type for providers (replaces zustand import)
export interface Content {
  provider: string;
  [key: string]: any;
}

// getPosts
export interface Post {
  title: string;
  link: string;
  image: string;
  provider?: string;
  day?: string;
  episodeLabel?: string;
  episodeLabelKey?: string;
  episodeLabelParams?: I18nParams;
  episodeId?: string | number;
  rating?: string;
  dubStatus?: "subbed" | "dubbed" | "both";
  dubStatusKey?: "Subbed" | "Dubbed" | "Subbed and dubbed";
  variants?: PostVariant[];
  artworkHints?: {
    anilistId?: number;
    malId?: number;
    isMovie?: boolean;
  };
}

export interface PostVariant {
  status: "subbed" | "dubbed";
  statusKey: "Subbed" | "Dubbed";
  title: string;
  link: string;
  image: string;
  episodeLabel?: string;
  episodeLabelKey?: string;
  episodeLabelParams?: I18nParams;
  episodeId?: string | number;
}

export type TextTracks = {
  title: string;
  language: string;
  type: "application/x-subrip" | "application/ttml+xml" | "text/vtt";
  uri: string;
}[];

// getStream
export interface Stream {
  server: string;
  link: string;
  type: string;
  quality?: "360" | "480" | "720" | "1080" | "2160";
  subtitles?: TextTracks;
  headers?: any;
}

// getInfo
export interface Info {
  titleKey?: string;
  titleParams?: I18nParams;
  title: string;
  image: string;
  logo?: string;
  background?: string;
  poster?: string;
  trailers?: string[];
  synopsis: string;
  imdbId: string;
  year?: string | number;
  runtime?: string;
  country?: string;
  director?: string;
  type: string;
  tags?: string[];
  tagKeys?: Record<string, string>;
  cast?: string[];
  rating?: string;
  genres?: string[];
  studio?: string;
  episodesCount?: number;
  extra?: {
    ids?: {
      malId?: number;
      anilistId?: number;
      malIds?: number[];
      anilistIds?: number[];
      anidbIds?: number[];
      imdbMovieIds?: string[];
      imdbShowIds?: string[];
      tmdbMovieIds?: number[];
      tmdbShowIds?: number[];
      tvdbMovieIds?: number[];
      tvdbShowIds?: number[];
      crunchyId?: number | string;
      disneyId?: number | string;
      netflixId?: number | string;
      primeId?: number | string;
    };
    mappings?: {
      source: "anibridge-v3";
      schemaVersion: string;
      generatedOn?: string;
      sourceDescriptors: string[];
      imdbSource?: "anibridge-v3" | "plexanibridge-v2";
      targets: ExternalIdMapping[];
    };
    stats?: {
      scoreRaw?: string;
      favorites?: number;
      members?: number;
      views?: number;
      episodesCountRaw?: number | string;
      episodesLength?: number | string;
    };
    flags?: {
      dub?: number | boolean;
      alwaysHome?: boolean;
    };
    artworkSources?: {
      logo?: "tmdb" | "provider" | "anizip";
      poster?: "tmdb" | "provider" | "anizip";
      background?: "tmdb" | "provider" | "anizip";
    };
    meta?: {
      day?: string;
      season?: string;
      status?: string;
      type?: string;
      createdAt?: string;
      author?: string;
      userId?: number | string;
    };
  };
  related?: {
    title: string;
    link: string;
    image?: string;
    type?: string;
    year?: string;
  }[];
  linkList: Link[];
}
// getEpisodeLinks
export interface EpisodeLink {
  title: string;
  titleKey?: string;
  titleParams?: I18nParams;
  episodeNumber?: number;
  sourceEpisodeNumber?: number;
  seasonNumber?: number;
  synopsis?: string;
  thumbnail?: string;
  externalMappings?: ExternalEpisodeMapping[];
  link: string;
}

export interface ExternalIdMapping {
  provider:
    | "anidb"
    | "anilist"
    | "imdb_movie"
    | "imdb_show"
    | "mal"
    | "tmdb_movie"
    | "tmdb_show"
    | "tvdb_movie"
    | "tvdb_show";
  id: string;
  scope?: string;
  ranges?: Record<string, string>;
}

export interface ExternalEpisodeMapping {
  provider: ExternalIdMapping["provider"];
  id: string;
  scope?: string;
  seasonNumber?: number;
  episodeNumbers: number[];
}

export interface TmdbLocalizedText {
  value: string;
  language: string;
}

export interface TmdbImageMetadata {
  id?: string;
  type: "logo" | "poster" | "backdrop" | "still";
  url: string;
  previewUrl?: string;
  language: string;
  width?: number;
  height?: number;
  format?: string;
  primary?: boolean;
  addedBy?: string;
}

export interface TmdbPersonCredit {
  id?: number;
  name: string;
  role?: string;
  department?: string;
  jobs?: string[];
  episodeCount?: number;
  profile?: string;
}

export interface TmdbVideoMetadata {
  id?: string;
  key: string;
  site: string;
  name: string;
  language: string;
  type?: string;
  details?: string;
  url?: string;
  thumbnail?: string;
  channel?: string;
  restrictedRegions: string[];
}

export interface TmdbWatchProviderMetadata {
  name: string;
  category?: string;
  monetizationType?: string;
  quality?: string;
  logo?: string;
  url?: string;
  region: string;
}

export interface TmdbEpisodeGroupMetadata {
  id: string;
  name: string;
  type?: string;
  groupCount?: number;
  episodeCount?: number;
  overview?: string;
  sourceUrl: string;
}

export interface TmdbNetworkMetadata {
  id?: number;
  name?: string;
  logo?: string;
  url?: string;
}

export interface TmdbEpisodeMetadata {
  id?: string;
  seasonNumber: number;
  episodeNumber: number;
  title?: TmdbLocalizedText;
  overview?: TmdbLocalizedText;
  airDateText?: TmdbLocalizedText;
  runtimeMinutes?: number;
  rating?: number;
  thumbnail?: string;
  stills: TmdbImageMetadata[];
  directors?: TmdbPersonCredit[];
  writers?: TmdbPersonCredit[];
  guestStars?: TmdbPersonCredit[];
  sourceUrl: string;
}

export interface TmdbSeasonMetadata {
  seasonNumber: number;
  name?: TmdbLocalizedText;
  overview?: TmdbLocalizedText;
  year?: number;
  episodeCount?: number;
  poster?: string;
  posters: TmdbImageMetadata[];
  backgrounds: TmdbImageMetadata[];
  episodes?: TmdbEpisodeMetadata[];
  sourceUrl: string;
}

export interface TmdbTranslationMetadata {
  language: string;
  title?: string;
  overview?: string;
  tagline?: string;
}

export interface TmdbMediaMetadata {
  source: "tmdb-web";
  id: number;
  type: "movie" | "tv";
  sourceUrl: string;
  fetchedAt: string;
  originalLanguage?: string;
  title?: TmdbLocalizedText;
  originalTitle?: string;
  overview?: TmdbLocalizedText;
  tagline?: TmdbLocalizedText;
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
  numberOfSeasons?: number;
  genres: string[];
  countries: string[];
  facts: Record<string, string>;
  keywords: string[];
  networks: TmdbNetworkMetadata[];
  socialLinks: Record<string, string>;
  cast: TmdbPersonCredit[];
  crew: TmdbPersonCredit[];
  videos: TmdbVideoMetadata[];
  watchProviders: TmdbWatchProviderMetadata[];
  episodeGroups: TmdbEpisodeGroupMetadata[];
  translations: TmdbTranslationMetadata[];
  images: {
    logos: TmdbImageMetadata[];
    posters: TmdbImageMetadata[];
    backdrops: TmdbImageMetadata[];
  };
  logo?: string;
  poster?: string;
  background?: string;
  seasons: TmdbSeasonMetadata[];
  schema: Record<string, unknown>;
}

export interface Link {
  title: string;
  titleKey?: string;
  titleParams?: I18nParams;
  quality?: string;
  seasonNumber?: number;
  availabilityStatus?: "upcoming" | "available";
  availabilityDate?: string;
  availabilityPrecision?: "day" | "year" | "unknown";
  episodesLink?: string;
  directLinks?: {
    title: string;
    titleKey?: string;
    titleParams?: I18nParams;
    episodeNumber?: number;
    seasonNumber?: number;
    link: string;
    type?: "movie" | "series";
  }[];
}

// catalog
export interface Catalog {
  title: string;
  titleKey?: string;
  titleParams?: I18nParams;
  filter: string;
}

export interface ProviderType {
  searchFilter?: string;
  catalog: Catalog[];
  genres: Catalog[];
  blurImage?: boolean;
  nonStreamableServer?: string[];
  nonDownloadableServer?: string[];
  GetStream: ({
    link,
    type,
    signal,
    providerContext,
  }: {
    link: string;
    type: string;
    signal: AbortSignal;
    providerContext: ProviderContext;
  }) => Promise<Stream[]>;
  GetHomePosts: ({
    filter,
    page,
    providerValue,
    signal,
    providerContext,
  }: {
    filter: string;
    page: number;
    providerValue: string;
    signal: AbortSignal;
    providerContext: ProviderContext;
  }) => Promise<Post[]>;
  GetEpisodeLinks?: ({
    url,
    providerContext,
  }: {
    url: string;
    providerContext: ProviderContext;
  }) => Promise<EpisodeLink[]>;
  GetMetaData: ({
    link,
    provider,
    providerContext,
  }: {
    link: string;
    provider: Content["provider"];
    providerContext: ProviderContext;
  }) => Promise<Info>;
  GetSearchPosts: ({
    searchQuery,
    page,
    providerValue,
    signal,
    providerContext,
  }: {
    searchQuery: string;
    page: number;
    providerValue: string;
    signal: AbortSignal;
    providerContext: ProviderContext;
  }) => Promise<Post[]>;
}

export type ProviderContext = {
  axios: AxiosStatic;
  Aes: any; // AES encryption utility, if used
  getBaseUrl: (providerValue: string) => Promise<string>;
  commonHeaders: Record<string, string>;
  cheerio: typeof cheerio;
  cache?: {
    getString: (key: string) => string | undefined;
    setString: (key: string, value: string) => void;
    delete?: (key: string) => void;
  };
  extractors: {
    hubcloudExtracter: (link: string, signal: AbortSignal) => Promise<Stream[]>;
    gofileExtracter: (id: string) => Promise<{
      link: string;
      token: string;
    }>;
    superVideoExtractor: (data: any) => Promise<string>;
    gdFlixExtracter: (link: string, signal: AbortSignal) => Promise<Stream[]>;
  };
};
