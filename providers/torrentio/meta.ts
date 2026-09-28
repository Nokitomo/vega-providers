import {EpisodeLink, Info, Link, ProviderContext} from "../types";

type CinemetaVideo = {
  id?: string;
  name?: string;
  season?: number;
  episode?: number;
  number?: number;
  released?: string;
  firstAired?: string;
};

type CinemetaMeta = {
  id?: string;
  imdb_id?: string;
  type?: string;
  name?: string;
  description?: string;
  poster?: string;
  background?: string;
  logo?: string;
  releaseInfo?: string;
  runtime?: string;
  country?: string | string[];
  director?: string | string[];
  genres?: string[];
  imdbRating?: string;
  cast?: string[];
  videos?: CinemetaVideo[];
  trailerStreams?: {ytId?: string}[];
};

const parseMetaLink = (link: string): {type: "movie" | "series"; imdbId: string} => {
  const match = link.match(/\/meta\/(movie|series)\/(tt\d+)\.json/i);
  if (match) {
    return {type: match[1].toLowerCase() as "movie" | "series", imdbId: match[2]};
  }
  const imdbId = link.match(/tt\d+/i)?.[0];
  if (!imdbId) throw new Error("Torrentio metadata link does not contain an IMDb ID");
  return {type: /series/i.test(link) ? "series" : "movie", imdbId};
};

const watchLink = (
  type: "movie" | "series",
  imdbId: string,
  season?: number,
  episode?: number,
) => {
  const suffix = type === "series" ? `/${season || 0}/${episode || 0}` : "";
  return `https://torrentio.local/watch/${type}/${imdbId}${suffix}`;
};

const episodeTitle = (video: CinemetaVideo, episode: number) =>
  video.name ? `E${episode} - ${video.name}` : `Episode ${episode}`;

export const getMeta = async function ({
  link,
  providerContext,
}: {
  link: string;
  providerContext: ProviderContext;
}): Promise<Info> {
  const {type, imdbId} = parseMetaLink(link);
  const response = await providerContext.axios.get(
    `https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`,
  );
  const meta = response.data?.meta as CinemetaMeta | undefined;
  if (!meta) throw new Error(`No Cinemeta metadata found for ${imdbId}`);

  const linkList: Link[] = [];
  if (type === "series") {
    const seasons = new Map<number, EpisodeLink[]>();
    const now = Date.now();
    for (const video of meta.videos || []) {
      const season = Number(video.season || 0);
      const episode = Number(video.episode ?? video.number ?? 0);
      if (season <= 0 || episode <= 0) continue;
      const release = video.released || video.firstAired;
      if (release) {
        const releaseTime = new Date(release).getTime();
        if (Number.isFinite(releaseTime) && releaseTime > now) continue;
      }
      const entries = seasons.get(season) || [];
      entries.push({
        title: episodeTitle(video, episode),
        episodeNumber: episode,
        seasonNumber: season,
        link: watchLink("series", imdbId, season, episode),
      });
      seasons.set(season, entries);
    }
    for (const season of [...seasons.keys()].sort((a, b) => a - b)) {
      linkList.push({
        title: `Season ${season}`,
        seasonNumber: season,
        directLinks: (seasons.get(season) || []).map(episode => ({
          title: episode.title,
          episodeNumber: episode.episodeNumber,
          seasonNumber: season,
          link: episode.link,
          type: "series",
        })),
      });
    }
  } else {
    linkList.push({
      title: meta.name || "Movie",
      directLinks: [
        {title: "Movie", link: watchLink("movie", imdbId), type: "movie"},
      ],
    });
  }

  const country = Array.isArray(meta.country) ? meta.country.join(", ") : meta.country;
  const director = Array.isArray(meta.director) ? meta.director.join(", ") : meta.director;
  return {
    title: meta.name || imdbId,
    synopsis: meta.description || "",
    image: meta.background || meta.poster || "",
    poster: meta.poster,
    background: meta.background,
    logo: meta.logo,
    imdbId,
    type,
    year: meta.releaseInfo,
    runtime: meta.runtime,
    country,
    director,
    genres: meta.genres,
    rating: meta.imdbRating,
    cast: meta.cast,
    trailers: (meta.trailerStreams || [])
      .map(trailer => trailer.ytId && `https://www.youtube.com/watch?v=${trailer.ytId}`)
      .filter((url): url is string => Boolean(url)),
    linkList,
  };
};
