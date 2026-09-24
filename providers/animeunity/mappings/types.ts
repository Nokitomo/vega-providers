import { ExternalEpisodeMapping, ExternalIdMapping } from "../../types";

export type AniBridgeProvider = ExternalIdMapping["provider"];

export type AniBridgeDescriptor = {
  provider: AniBridgeProvider;
  id: string;
  scope?: string;
  raw: string;
};

export type AniBridgeTarget = AniBridgeDescriptor & {
  ranges: Record<string, string>;
};

export type AniBridgeSourceRecord = {
  sourceDescriptor: string;
  targets: AniBridgeTarget[];
};

export type AniBridgeIndex = {
  schemaVersion: string;
  generatedOn?: string;
  expiresAt: number;
  records: Map<string, AniBridgeSourceRecord>;
};

export type AniBridgeIds = {
  anidbIds: number[];
  anilistIds: number[];
  imdbMovieIds: string[];
  imdbShowIds: string[];
  malIds: number[];
  tmdbMovieIds: number[];
  tmdbShowIds: number[];
  tvdbMovieIds: number[];
  tvdbShowIds: number[];
};

export type AnimeMappingResolution = {
  schemaVersion?: string;
  generatedOn?: string;
  sourceDescriptors: string[];
  targets: AniBridgeTarget[];
  ids: AniBridgeIds;
  imdbId?: string;
  imdbSource?: "anibridge-v3" | "plexanibridge-v2";
};

export type EpisodeMappingResolution = {
  seasonNumber?: number;
  mappings: ExternalEpisodeMapping[];
};
