const assert = require("assert");
const cheerio = require("cheerio");
const {
  resolveTmdbArtworkMetadata,
  resolveTmdbEpisodeSeasonMetadata,
  resolveTmdbMediaMetadata,
} = require("../dist/animeunity/tmdb/index.js");

const makeContext = (key, respond) => {
  const calls = [];
  return {
    calls,
    cheerio,
    kvStore: { get: async (name) => name === "tmdbApiKey" ? key : undefined },
    axios: {
      get: async (url, options = {}) => {
        calls.push({ url, params: options.params });
        const data = await respond(url, options.params || {});
        if (data === undefined) throw new Error("Not found");
        return { data };
      },
    },
  };
};

const run = async () => {
  for (const provider of ["animeunity", "streamingunity", "streamcenter"]) {
    const schema = await require(`../dist/${provider}/settings.js`)
      .getSettingsSchema({ providerContext: {} });
    assert.strictEqual(schema[0].key, "tmdbApiKey");
    assert.strictEqual(schema[0].secure, true);
  }

  const artworkContext = makeContext("provider-one-key", (url) => {
    if (url.endsWith("/tv/123")) return { id: 123, original_language: "ja" };
    if (url.endsWith("/tv/123/images")) return {
      logos: [
        { file_path: "/english.png", iso_639_1: "en" },
        { file_path: "/italian.png", iso_639_1: "it" },
      ],
      posters: [{ file_path: "/poster.jpg", iso_639_1: "it" }],
      backdrops: [{ file_path: "/backdrop.jpg", iso_639_1: null }],
    };
  });
  const artwork = await resolveTmdbArtworkMetadata({
    providerContext: artworkContext, id: 123, type: "tv",
  });
  assert.strictEqual(artwork.source, "tmdb-api");
  assert(artwork.logo.endsWith("/italian.png"));
  assert(artwork.poster.endsWith("/poster.jpg"));
  assert(artwork.background.endsWith("/backdrop.jpg"));
  assert(artworkContext.calls.every((call) => call.url.startsWith("https://api.themoviedb.org/3/")));
  assert(artworkContext.calls.every((call) => call.params.api_key === "provider-one-key"));

  const partialContext = makeContext("partial-key", (url) => {
    if (url.endsWith("/movie/56")) return { id: 56, original_language: "en" };
    if (url.endsWith("/movie/56/images")) return {
      logos: [{ file_path: "/api-logo.png", iso_639_1: "it" }],
      posters: [], backdrops: [],
    };
    if (url.startsWith("https://www.themoviedb.org/movie/56")) return `
      <html><head><title>The Movie Database</title></head><body>
      <div class="poster_wrapper"><img class="poster"
        src="https://image.tmdb.org/t/p/original/web-poster.jpg" /></div>
      </body></html>`;
  });
  const partial = await resolveTmdbArtworkMetadata({
    providerContext: partialContext, id: 56, type: "movie",
    fields: ["logo", "poster"],
  });
  assert(partial.logo.endsWith("/api-logo.png"));
  assert(partial.poster.endsWith("/web-poster.jpg"));
  assert(partialContext.calls.some((call) => call.url.startsWith("https://www.themoviedb.org/")));

  const episodeContext = makeContext("provider-two-key", (url, params) => {
    if (url.endsWith("/tv/123")) return { id: 123, original_language: "ja" };
    if (url.endsWith("/tv/123/season/1")) {
      const isItalian = params.language === "it-IT";
      return {
        id: 1,
        episodes: [{
          id: 10, episode_number: 1,
          name: isItalian ? "" : "English title",
          overview: isItalian ? "" : "English overview",
          still_path: "/still.jpg",
        }],
      };
    }
  });
  const season = await resolveTmdbEpisodeSeasonMetadata({
    providerContext: episodeContext, mediaId: 123,
    seasonNumber: 1, episodeNumbers: [1],
  });
  assert.strictEqual(season.episodes[0].title.value, "English title");
  assert.strictEqual(season.episodes[0].title.language, "en-US");
  assert(episodeContext.calls.every((call) => call.url.startsWith("https://api.themoviedb.org/3/")));
  assert(episodeContext.calls.every((call) => call.params.api_key === "provider-two-key"));

  const italianContext = makeContext("italian-key", (url) => {
    if (url.endsWith("/tv/123")) return { id: 123, original_language: "ja" };
    if (url.endsWith("/tv/123/season/1")) return {
      episodes: [{ id: 10, episode_number: 1,
        name: "Titolo italiano", overview: "Trama italiana",
        still_path: "/still.jpg" }],
    };
  });
  const italian = await resolveTmdbEpisodeSeasonMetadata({
    providerContext: italianContext, mediaId: 123,
    seasonNumber: 1, episodeNumbers: [1],
  });
  assert.strictEqual(italian.episodes[0].title.value, "Titolo italiano");
  assert(italianContext.calls.every((call) => call.url.startsWith("https://api.themoviedb.org/3/")));
  assert(!italianContext.calls.some((call) => call.params?.language === "en-US"));

  const mixedContext = makeContext("mixed-key", (url, params) => {
    if (url.endsWith("/tv/123")) return { id: 123, original_language: "ja" };
    if (url.endsWith("/tv/123/season/1")) return {
      episodes: [{ id: 10, episode_number: 1,
        name: params.language === "it-IT" ? "Titolo italiano" : "English title",
        overview: params.language === "it-IT" ? "" : "English overview",
        still_path: "/still.jpg" }],
    };
  });
  const mixed = await resolveTmdbEpisodeSeasonMetadata({
    providerContext: mixedContext, mediaId: 123,
    seasonNumber: 1, episodeNumbers: [1],
  });
  assert.strictEqual(mixed.episodes[0].title.value, "Titolo italiano");
  assert.strictEqual(mixed.episodes[0].overview.value, "English overview");

  const mediaContext = makeContext("media-key", (url, params) => {
    if (url.endsWith("/movie/55")) return {
      id: 55, original_language: "en",
      title: params.language === "it-IT" ? "Titolo italiano" : "English title",
      overview: params.language === "it-IT" ? "Trama italiana" : "English plot",
      genres: [{ name: "Drama" }], runtime: 120,
      release_date: "2020-01-01", vote_average: 7.5,
    };
    if (url.endsWith("/movie/55/images")) return {
      logos: [], posters: [], backdrops: [],
    };
    if (url.endsWith("/movie/55/credits")) return {
      cast: [{ id: 1, name: "Actor" }],
    };
    if (url.endsWith("/movie/55/translations")) return {
      translations: [
        { iso_639_1: "it", iso_3166_1: "IT", data: { title: "Titolo italiano", overview: "Trama italiana" } },
        { iso_639_1: "en", iso_3166_1: "US", data: { title: "English title", overview: "English plot" } },
      ],
    };
  });
  const media = await resolveTmdbMediaMetadata({
    providerContext: mediaContext, id: 55, type: "movie",
  });
  assert.strictEqual(media.source, "tmdb-api");
  assert.strictEqual(media.title.value, "Titolo italiano");
  assert.strictEqual(media.facts.Runtime, "120m");
  assert(mediaContext.calls.every((call) => call.url.startsWith("https://api.themoviedb.org/3/")));

  const translatedContext = makeContext("translated-key", (url, params) => {
    if (url.endsWith("/movie/57")) return {
      id: 57, original_language: "ja",
      title: params.language === "it-IT" ? "Titolo originale" : "English title",
      original_title: "Titolo originale",
      overview: params.language === "it-IT" ? "Trama italiana" : "English plot",
      genres: [{ name: "Drama" }], runtime: 90,
      release_date: "2021-01-01", vote_average: 7,
    };
    if (url.endsWith("/movie/57/images")) return {
      logos: [], posters: [], backdrops: [],
    };
    if (url.endsWith("/movie/57/credits")) return {
      cast: [{ id: 1, name: "Actor" }],
    };
    if (url.endsWith("/movie/57/translations")) return {
      translations: [
        { iso_639_1: "it", iso_3166_1: "IT", data: { title: "", overview: "Trama italiana" } },
        { iso_639_1: "en", iso_3166_1: "US", data: { title: "English title", overview: "English plot" } },
      ],
    };
  });
  const translated = await resolveTmdbMediaMetadata({
    providerContext: translatedContext, id: 57, type: "movie",
  });
  assert.strictEqual(translated.title.value, "English title");
  assert.strictEqual(translated.title.language, "en-US");
  assert.strictEqual(translated.overview.value, "Trama italiana");

  const fallbackContext = makeContext("invalid-key", (url) => {
    if (url.startsWith("https://api.themoviedb.org/3/")) return undefined;
    if (url.startsWith("https://www.themoviedb.org/movie/55")) return `
      <html><head><title>The Movie Database</title></head><body>
      <div class="poster_wrapper"><img class="poster"
        src="https://image.tmdb.org/t/p/original/web-poster.jpg" /></div>
      </body></html>`;
  });
  const fallback = await resolveTmdbArtworkMetadata({
    providerContext: fallbackContext, id: 55, type: "movie", fields: ["poster"],
  });
  assert.strictEqual(fallback.source, "tmdb-web");

  const noKeyContext = makeContext(undefined, (url) => {
    if (url.startsWith("https://www.themoviedb.org/movie/55")) return `
      <html><head><title>The Movie Database</title></head><body>
      <div class="poster_wrapper"><img class="poster"
        src="https://image.tmdb.org/t/p/original/web-only.jpg" /></div>
      </body></html>`;
  });
  const noKey = await resolveTmdbArtworkMetadata({
    providerContext: noKeyContext, id: 55, type: "movie", fields: ["poster"],
  });
  assert.strictEqual(noKey.source, "tmdb-web");
  assert(noKeyContext.calls.every((call) => !call.url.startsWith("https://api.themoviedb.org/3/")));
  assert(fallback.poster.endsWith("/web-poster.jpg"));
  assert(fallbackContext.calls.some((call) => call.url.startsWith("https://api.themoviedb.org/3/")));
  assert(fallbackContext.calls.some((call) => call.url.startsWith("https://www.themoviedb.org/")));
  console.log("tmdb api key: OK");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
