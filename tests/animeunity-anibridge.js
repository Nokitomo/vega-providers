const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  ANIBRIDGE_MAPPINGS_URL,
  PLEXANIBRIDGE_MAPPINGS_URL,
  buildAniBridgeExtra,
  mapAniBridgeEpisodeRange,
  parseAniBridgeDescriptor,
  parseAniBridgePayload,
  resolveAniBridgeEpisodeMappings,
  resolveAnimeMappings,
} = require("../dist/animeunity/mappings/index.js");
const { getEpisodes } = require("../dist/animeunity/episodes.js");

const executeVegaBundle = (fileName) => {
  const moduleCode = fs.readFileSync(
    path.join(__dirname, "..", "dist", "animeunity", fileName),
    "utf8",
  );
  const executionContext = {
    exports: {},
    console,
    Promise,
    Object,
  };
  return new Function(
    "context",
    `
      const exports = context.exports;
      const console = context.console;
      const Promise = context.Promise;
      const Object = context.Object;
      ${moduleCode}
      return exports;
    `,
  )(executionContext);
};

const fixture = {
  $meta: {
    schema_version: "3.0.3",
    generated_on: "2026-09-24",
  },
  "anilist:20": {
    "mal:20": {},
    "tmdb_show:46260:s1": { "1-52": "1-52" },
    "tmdb_show:46260:s2": { "53-104": "53-104" },
    "tvdb_show:78857:s2": { "53-104": "1-52" },
  },
  "mal:20": {
    "anilist:20": {},
    "tmdb_show:46260:s2": { "53-104": "53-104" },
  },
  "anilist:5": {
    "imdb_movie:tt0275277": {},
    "tmdb_movie:11299": {},
  },
  "anilist:30": {
    "mal:30": {},
    "tvdb_show:78857:s2": { "1-13": "1-13" },
  },
};

assert.deepStrictEqual(parseAniBridgeDescriptor("tmdb_show:46260:s2"), {
  provider: "tmdb_show",
  id: "46260",
  scope: "s2",
  raw: "tmdb_show:46260:s2",
});
assert.strictEqual(parseAniBridgeDescriptor("unknown:1"), null);
assert.strictEqual(parseAniBridgeDescriptor("imdb_movie:not-imdb"), null);

const index = parseAniBridgePayload(fixture, 1000);
assert(index);
assert.strictEqual(index.schemaVersion, "3.0.3");
assert.strictEqual(index.generatedOn, "2026-09-24");
assert.strictEqual(index.records.size, 4);
assert.strictEqual(parseAniBridgePayload("not-json"), null);

assert.deepStrictEqual(mapAniBridgeEpisodeRange("53-104", "1-52", 53), [1]);
assert.deepStrictEqual(mapAniBridgeEpisodeRange("1-2", "1-4|2", 2), [3, 4]);
assert.deepStrictEqual(mapAniBridgeEpisodeRange("1-4", "1-2|-2", 3), [2]);
assert.deepStrictEqual(mapAniBridgeEpisodeRange("1-4", "1-2|-2", 5), []);
assert.deepStrictEqual(mapAniBridgeEpisodeRange("1-3", "1,3-4", 2), [3]);

const createContext = (handler) => ({
  axios: { get: handler },
  getBaseUrl: async () => "https://anime.test",
});

(async () => {
  const movieCalls = [];
  const movieContext = createContext(async (url) => {
    movieCalls.push(url);
    if (url === ANIBRIDGE_MAPPINGS_URL) return { data: fixture };
    throw new Error(`Unexpected URL: ${url}`);
  });
  const movie = await resolveAnimeMappings({
    providerContext: movieContext,
    anilistId: 5,
    malId: 5,
    isMovie: true,
  });
  assert.strictEqual(movie.imdbId, "tt0275277");
  assert.strictEqual(movie.imdbSource, "anibridge-v3");
  assert.deepStrictEqual(movie.ids.tmdbMovieIds, [11299]);
  assert.strictEqual(movieCalls.includes(PLEXANIBRIDGE_MAPPINGS_URL), false);

  const seriesCalls = [];
  const seriesContext = createContext(async (url) => {
    seriesCalls.push(url);
    if (url === ANIBRIDGE_MAPPINGS_URL) return { data: fixture };
    if (url === PLEXANIBRIDGE_MAPPINGS_URL) {
      return {
        data: {
          20: { anilist_id: 20, mal_id: 20, imdb_id: "tt0409591" },
        },
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  });
  const series = await resolveAnimeMappings({
    providerContext: seriesContext,
    anilistId: 20,
    malId: 20,
    isMovie: false,
  });
  assert.strictEqual(series.imdbId, "tt0409591");
  assert.strictEqual(series.imdbSource, "plexanibridge-v2");
  assert.deepStrictEqual(series.ids.anilistIds, [20]);
  assert.deepStrictEqual(series.ids.malIds, [20]);
  assert.deepStrictEqual(series.ids.tmdbShowIds, [46260]);
  assert.deepStrictEqual(series.ids.tvdbShowIds, [78857]);
  assert.strictEqual(
    seriesCalls.filter((url) => url === ANIBRIDGE_MAPPINGS_URL).length,
    1,
  );
  assert.strictEqual(
    seriesCalls.filter((url) => url === PLEXANIBRIDGE_MAPPINGS_URL).length,
    1,
  );

  const episodeMapping = resolveAniBridgeEpisodeMappings(series, 53);
  assert.strictEqual(episodeMapping.seasonNumber, 2);
  assert.deepStrictEqual(
    episodeMapping.mappings.find(
      (mapping) => mapping.provider === "tmdb_show" && mapping.id === "46260",
    ),
    {
      provider: "tmdb_show",
      id: "46260",
      scope: "s2",
      seasonNumber: 2,
      episodeNumbers: [53],
    },
  );

  const extra = buildAniBridgeExtra(series);
  assert.strictEqual(extra.mappings.schemaVersion, "3.0.3");
  assert.strictEqual(extra.mappings.imdbSource, "plexanibridge-v2");
  assert(
    extra.mappings.targets.some((target) => target.provider === "tmdb_show"),
  );

  const aniZipFallbackCalls = [];
  const aniZipFallbackContext = createContext(async (url) => {
    aniZipFallbackCalls.push(url);
    if (url === ANIBRIDGE_MAPPINGS_URL) return { data: fixture };
    if (String(url).startsWith("https://api.ani.zip/mappings?")) {
      return {
        data: {
          mappings: {
            anilist_id: 30,
            mal_id: 30,
            type: "TV",
            thetvdb_id: 78857,
            themoviedb_id: "46260",
          },
        },
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  });
  const aniZipFallback = await resolveAnimeMappings({
    providerContext: aniZipFallbackContext,
    anilistId: 30,
    malId: 30,
    isMovie: false,
    includeLegacyImdb: false,
  });
  assert.deepStrictEqual(aniZipFallback.ids.tmdbShowIds, [46260]);
  assert.deepStrictEqual(
    aniZipFallback.targets.find(
      (target) => target.provider === "tmdb_show" && target.id === "46260",
    ),
    {
      provider: "tmdb_show",
      id: "46260",
      scope: "s2",
      raw: "tmdb_show:46260:s2",
      ranges: { "1-13": "1-13" },
    },
  );
  assert(
    aniZipFallbackCalls.some((url) =>
      String(url).startsWith("https://api.ani.zip/mappings?"),
    ),
  );

  const episodeCalls = [];
  const episodeContext = createContext(async (url) => {
    episodeCalls.push(url);
    if (url === "https://anime.test/info_api/99/") {
      return { data: { episodes_count: 104, anilist_id: 20, mal_id: 20 } };
    }
    if (url === ANIBRIDGE_MAPPINGS_URL) return { data: fixture };
    if (url.includes("/info_api/99/1?start_range=53&end_range=134")) {
      return { data: { episodes: [{ id: 9001, number: "53" }] } };
    }
    throw new Error(`Unexpected URL: ${url}`);
  });
  const episodes = await getEpisodes({
    url: "99|53|104",
    providerContext: episodeContext,
  });
  assert.strictEqual(episodes.length, 1);
  assert.strictEqual(episodes[0].episodeNumber, 53);
  assert.strictEqual(episodes[0].sourceEpisodeNumber, 53);
  assert.strictEqual(episodes[0].seasonNumber, 2);
  assert.deepStrictEqual(episodes[0].externalMappings[0].episodeNumbers, [53]);
  assert.strictEqual(episodeCalls.includes(PLEXANIBRIDGE_MAPPINGS_URL), false);

  const vegaCalls = [];
  const vegaContext = createContext(async (url) => {
    vegaCalls.push(url);
    if (url === "https://anime.test/info_api/99/") {
      return { data: { episodes_count: 104, anilist_id: 20, mal_id: 20 } };
    }
    if (url === ANIBRIDGE_MAPPINGS_URL) return { data: fixture };
    if (url.includes("/info_api/99/1?start_range=53&end_range=134")) {
      return { data: { episodes: [{ id: 9001, number: "53" }] } };
    }
    throw new Error(`Unexpected URL: ${url}`);
  });
  const firstVegaModule = executeVegaBundle("episodes.js");
  const secondVegaModule = executeVegaBundle("episodes.js");
  const firstVegaEpisodes = await firstVegaModule.getEpisodes({
    url: "99|53|104",
    providerContext: vegaContext,
  });
  const secondVegaEpisodes = await secondVegaModule.getEpisodes({
    url: "99|53|104",
    providerContext: vegaContext,
  });
  assert.strictEqual(firstVegaEpisodes[0].seasonNumber, 2);
  assert.strictEqual(secondVegaEpisodes[0].seasonNumber, 2);
  assert.strictEqual(
    vegaCalls.filter((url) => url === ANIBRIDGE_MAPPINGS_URL).length,
    1,
  );

  console.log("animeunity anibridge: OK");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
