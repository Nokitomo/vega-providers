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
  poster?: string;
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
      crunchyId?: number | string;
      disneyId?: number | string;
      netflixId?: number | string;
      primeId?: number | string;
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
  link: string;
}

export interface Link {
  title: string;
  titleKey?: string;
  titleParams?: I18nParams;
  quality?: string;
  episodesLink?: string;
  directLinks?: {
    title: string;
    titleKey?: string;
    titleParams?: I18nParams;
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
