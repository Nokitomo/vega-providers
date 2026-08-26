import { AnimeIdentity } from "../content";

export type AnimeFallbackSource = "animeworld" | "animesaturn";

export type AnimeWorldPlayback = {
  source: "animeworld";
  label: "SUB" | "DUB";
  pageUrl: string;
  episodeToken: string;
};

export type AnimeSaturnPlayback = {
  source: "animesaturn";
  label: "SUB" | "DUB";
  watchUrl: string;
};

export type AnimeFallbackPlayback = AnimeWorldPlayback | AnimeSaturnPlayback;

export type AnimeFallbackContext = AnimeIdentity;

export type AnimeFallbackEpisodeMap = Map<string, AnimeFallbackPlayback[]>;

export type ExternalAnimeIds = {
  anilistId?: number;
  malId?: number;
};
