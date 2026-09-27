const assert = require("assert");
const cheerio = require("cheerio");

const episodesModule = require("../dist/streamingunity/episodes.js");
const {
  ANIBRIDGE_MAPPINGS_URL,
} = require("../dist/animeunity/mappings/index.js");

const BASE_URL = "https://streamingunity.test";
const WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql";

const inertiaHtml = (props) => {
  const encoded = JSON.stringify({ props })
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
  return `<div id="app" data-page="${encoded}"></div>`;
};

const tmdbDetails = `<!doctype html><html><head><title>The Movie Database</title></head>
  <body><section class="facts"><p><strong>Lingua originale</strong> English</p></section></body></html>`;

const tmdbSeason = `<!doctype html><html><head><title>The Movie Database</title></head><body>
  <div class="episode_list">
    <div class="card" data-object-id="episode-1">
      <img class="backdrop" src="https://media.themoviedb.org/t/p/w500/tmdb-episode-1.jpg">
      <a data-episode-number="1" data-episode-id="episode-1"></a>
      <div class="episode_title"><h3><a>Titolo TMDB 1</a></h3></div>
      <div class="overview"><p>Sinossi TMDB 1</p></div>
    </div>
    <div class="card" data-object-id="episode-2">
      <img class="backdrop" src="https://media.themoviedb.org/t/p/w500/tmdb-episode-2.jpg">
      <a data-episode-number="2" data-episode-id="episode-2"></a>
      <div class="episode_title"><h3><a>Titolo TMDB 2</a></h3></div>
      <div class="overview"><p>Sinossi TMDB 2</p></div>
    </div>
  </div>
</body></html>`;

const emptyTmdbSeason = `<!doctype html><html><head><title>The Movie Database</title></head><body>
  <div class="episode_list">
    <div class="card" data-object-id="episode-2">
      <a data-episode-number="2" data-episode-id="episode-2"></a>
      <div class="episode_title"><h3><a></a></h3></div>
      <div class="overview"><p></p></div>
    </div>
  </div>
</body></html>`;

const tvdbSeriesPage = `<!doctype html><html><head><title>TheTVDB</title></head><body>
  <a href="/series/tvdb-test-show/edit">Edit Series</a>
</body></html>`;

const tvdbSeasonPage = `<!doctype html><html><head><title>TheTVDB</title></head><body>
  <a href="/episodes/111">1</a>
  <a href="/episodes/222">2</a>
</body></html>`;

const tvdbEpisodePage = `<!doctype html><html><head><title>TheTVDB</title></head><body>
  <div class="change_translation_text" data-language="eng" data-title="Titolo TVDB 2">
    <p>Sinossi TVDB 2</p>
  </div>
  <img src="https://artworks.thetvdb.com/banners/v4/episode/222/thumb.jpg">
</body></html>`;

const buildContext = () => {
  const requests = [];
  const title = {
    id: 10,
    tmdb_id: 5001,
    imdb_id: "tt5001",
  };
  const loadedSeason = {
    number: 1,
    episodes: [
      {
        id: 101,
        number: 1,
        name: "Titolo provider",
        plot: "Sinossi provider",
        images: [{ filename: "provider-episode-1.webp", type: "cover" }],
        translations: [
          { locale: "it", key: "name", value: "Titolo provider" },
          { locale: "it", key: "plot", value: "Sinossi provider" },
        ],
      },
      {
        id: 102,
        number: 2,
        name: "",
        plot: "",
        images: [],
        translations: [],
      },
    ],
  };
  const axios = {
    get: async (url) => {
      requests.push(url);
      if (url === `${BASE_URL}/it/titles/10-fixture/season-1`) {
        return {
          data: inertiaHtml({
            title,
            loadedSeason,
            cdn_url: "https://cdn.streamingunity.test",
          }),
        };
      }
      if (url.startsWith("https://www.themoviedb.org/tv/5001/season/1?")) {
        return { data: tmdbSeason };
      }
      if (url.startsWith("https://www.themoviedb.org/tv/5001?")) {
        return { data: tmdbDetails };
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  };
  return {
    requests,
    providerContext: {
      axios,
      cheerio,
      commonHeaders: { "User-Agent": "StreamingUnityEpisodesFixture/1.0" },
      getBaseUrl: async () => BASE_URL,
    },
  };
};

const buildTvdbFallbackContext = () => {
  const requests = [];
  const title = {
    id: 20,
    tmdb_id: 5002,
    tvdb_id: 7002,
    imdb_id: "tt5002",
  };
  const loadedSeason = {
    number: 1,
    episodes: [
      {
        id: 201,
        number: 1,
        name: "Titolo provider",
        plot: "Sinossi provider",
        images: [{ filename: "provider-episode-1.webp", type: "cover" }],
        translations: [
          { locale: "it", key: "name", value: "Titolo provider" },
          { locale: "it", key: "plot", value: "Sinossi provider" },
        ],
      },
      {
        id: 202,
        number: 2,
        name: "",
        plot: "",
        images: [],
        translations: [],
      },
    ],
  };
  const axios = {
    get: async (url) => {
      requests.push(url);
      if (url === `${BASE_URL}/it/titles/20-fixture/season-1`) {
        return {
          data: inertiaHtml({
            title,
            loadedSeason,
            cdn_url: "https://cdn.streamingunity.test",
          }),
        };
      }
      if (url.startsWith("https://www.themoviedb.org/tv/5002/season/1?")) {
        return { data: emptyTmdbSeason };
      }
      if (url.startsWith("https://www.themoviedb.org/tv/5002?")) {
        return { data: tmdbDetails };
      }
      if (url === "https://www.thetvdb.com/?id=7002&tab=series") {
        return {
          data: tvdbSeriesPage,
          request: {
            res: {
              responseUrl: "https://www.thetvdb.com/series/tvdb-test-show",
            },
          },
        };
      }
      if (
        url ===
        "https://www.thetvdb.com/series/tvdb-test-show/seasons/official/1"
      ) {
        return { data: tvdbSeasonPage, request: { res: { responseUrl: url } } };
      }
      if (url === "https://www.thetvdb.com/episodes/222") {
        return { data: tvdbEpisodePage, request: { res: { responseUrl: url } } };
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  };
  return {
    requests,
    providerContext: {
      axios,
      cheerio,
      commonHeaders: { "User-Agent": "StreamingUnityEpisodesFixture/1.0" },
      getBaseUrl: async () => BASE_URL,
    },
  };
};

const buildReverseAniBridgeTvdbContext = () => {
  const requests = [];
  const title = {
    id: 30,
    tmdb_id: 5003,
    imdb_id: "",
    genres: [{ name: "Anime" }],
  };
  const loadedSeason = {
    number: 1,
    episodes: [
      {
        id: 302,
        number: 2,
        name: "",
        plot: "",
        images: [],
        translations: [],
      },
    ],
  };
  const axios = {
    get: async (url) => {
      requests.push(url);
      if (url === `${BASE_URL}/it/titles/30-fixture/season-1`) {
        return {
          data: inertiaHtml({
            title,
            loadedSeason,
            cdn_url: "https://cdn.streamingunity.test",
          }),
        };
      }
      if (url.startsWith("https://www.themoviedb.org/tv/5003/season/1?")) {
        return { data: emptyTmdbSeason };
      }
      if (url.startsWith("https://www.themoviedb.org/tv/5003?")) {
        return { data: tmdbDetails };
      }
      if (url === ANIBRIDGE_MAPPINGS_URL) {
        return {
          data: {
            $meta: { schema_version: "3.0.3", generated_on: "2026-09-26" },
            "anilist:303": {
              "tmdb_show:5003:s1": { "1-12": "1-12" },
              "tvdb_show:7003:s1": { "1-12": "1-12" },
            },
          },
        };
      }
      if (url === "https://www.thetvdb.com/?id=7003&tab=series") {
        return {
          data: tvdbSeriesPage,
          request: {
            res: {
              responseUrl: "https://www.thetvdb.com/series/tvdb-test-show",
            },
          },
        };
      }
      if (
        url ===
        "https://www.thetvdb.com/series/tvdb-test-show/seasons/official/1"
      ) {
        return { data: tvdbSeasonPage, request: { res: { responseUrl: url } } };
      }
      if (url === "https://www.thetvdb.com/episodes/222") {
        return { data: tvdbEpisodePage, request: { res: { responseUrl: url } } };
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  };
  return {
    requests,
    providerContext: {
      axios,
      cheerio,
      commonHeaders: { "User-Agent": "StreamingUnityEpisodesFixture/1.0" },
      getBaseUrl: async () => BASE_URL,
    },
  };
};

const buildWikidataTvdbContext = () => {
  const requests = [];
  const title = {
    id: 40,
    tmdb_id: 5004,
    imdb_id: "",
    genres: [{ name: "Drama" }],
  };
  const loadedSeason = {
    number: 1,
    episodes: [
      {
        id: 402,
        number: 2,
        name: "",
        plot: "",
        images: [],
        translations: [],
      },
    ],
  };
  const axios = {
    get: async (url) => {
      requests.push(url);
      if (url === `${BASE_URL}/it/titles/40-fixture/season-1`) {
        return {
          data: inertiaHtml({
            title,
            loadedSeason,
            cdn_url: "https://cdn.streamingunity.test",
          }),
        };
      }
      if (url.startsWith("https://www.themoviedb.org/tv/5004/season/1?")) {
        return { data: emptyTmdbSeason };
      }
      if (url.startsWith("https://www.themoviedb.org/tv/5004?")) {
        return { data: tmdbDetails };
      }
      if (url === WIKIDATA_SPARQL_URL) {
        return {
          data: {
            results: {
              bindings: [
                {
                  item: {
                    value: "http://www.wikidata.org/entity/Q5004",
                  },
                  imdb: { value: "tt0050040" },
                  tvdbSeries: { value: "7004" },
                  trakt: { value: "wikidata-test-show" },
                },
              ],
            },
          },
        };
      }
      if (url === "https://www.thetvdb.com/?id=7004&tab=series") {
        return {
          data: tvdbSeriesPage,
          request: {
            res: {
              responseUrl: "https://www.thetvdb.com/series/tvdb-test-show",
            },
          },
        };
      }
      if (
        url ===
        "https://www.thetvdb.com/series/tvdb-test-show/seasons/official/1"
      ) {
        return { data: tvdbSeasonPage, request: { res: { responseUrl: url } } };
      }
      if (url === "https://www.thetvdb.com/episodes/222") {
        return { data: tvdbEpisodePage, request: { res: { responseUrl: url } } };
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  };
  return {
    requests,
    providerContext: {
      axios,
      cheerio,
      commonHeaders: { "User-Agent": "StreamingUnityEpisodesFixture/1.0" },
      getBaseUrl: async () => BASE_URL,
    },
  };
};

(async () => {
  const context = buildContext();
  const episodes = await episodesModule.getEpisodes({
    url: `${BASE_URL}/it/titles/10-fixture/season-1`,
    providerContext: context.providerContext,
  });

  assert.strictEqual(episodes.length, 2);
  assert.strictEqual(episodes[0].title, "Titolo provider");
  assert.strictEqual(episodes[0].synopsis, "Sinossi provider");
  assert.strictEqual(
    episodes[0].thumbnail,
    "https://cdn.streamingunity.test/images/provider-episode-1.webp",
  );
  assert.strictEqual(episodes[1].title, "Titolo TMDB 2");
  assert.strictEqual(episodes[1].synopsis, "Sinossi TMDB 2");
  assert.strictEqual(
    episodes[1].thumbnail,
    "https://image.tmdb.org/t/p/w300/tmdb-episode-2.jpg",
  );
  assert(
    context.requests.filter((url) => url.includes("themoviedb.org")).length > 0,
    "TMDB must be requested only when a provider episode misses metadata",
  );

  const tvdbContext = buildTvdbFallbackContext();
  const tvdbEpisodes = await episodesModule.getEpisodes({
    url: `${BASE_URL}/it/titles/20-fixture/season-1`,
    providerContext: tvdbContext.providerContext,
  });
  assert.strictEqual(tvdbEpisodes.length, 2);
  assert.strictEqual(tvdbEpisodes[0].title, "Titolo provider");
  assert.strictEqual(tvdbEpisodes[1].title, "Titolo TVDB 2");
  assert.strictEqual(tvdbEpisodes[1].synopsis, "Sinossi TVDB 2");
  assert.strictEqual(
    tvdbEpisodes[1].thumbnail,
    "https://artworks.thetvdb.com/banners/v4/episode/222/thumb.jpg",
  );
  assert(
    tvdbContext.requests.some((url) => url.includes("themoviedb.org")),
    "TMDB should be tried before TVDB when episode metadata is missing",
  );
  assert(
    tvdbContext.requests.some((url) => url.includes("thetvdb.com")),
    "TVDB should be requested when TMDB still misses episode metadata",
  );

  const reverseContext = buildReverseAniBridgeTvdbContext();
  const reverseEpisodes = await episodesModule.getEpisodes({
    url: `${BASE_URL}/it/titles/30-fixture/season-1`,
    providerContext: reverseContext.providerContext,
  });
  assert.strictEqual(reverseEpisodes.length, 1);
  assert.strictEqual(reverseEpisodes[0].title, "Titolo TVDB 2");
  assert.strictEqual(reverseEpisodes[0].synopsis, "Sinossi TVDB 2");
  assert.strictEqual(
    reverseEpisodes[0].thumbnail,
    "https://artworks.thetvdb.com/banners/v4/episode/222/thumb.jpg",
  );
  assert(
    reverseContext.requests.includes(ANIBRIDGE_MAPPINGS_URL),
    "AniBridge reverse lookup should run when an anime-like StreamingUnity title lacks TVDB",
  );
  assert(
    reverseContext.requests.some((url) => url.includes("thetvdb.com")),
    "TVDB should be requested through the AniBridge reverse TVDB id",
  );

  const wikidataContext = buildWikidataTvdbContext();
  const wikidataEpisodes = await episodesModule.getEpisodes({
    url: `${BASE_URL}/it/titles/40-fixture/season-1`,
    providerContext: wikidataContext.providerContext,
  });
  assert.strictEqual(wikidataEpisodes.length, 1);
  assert.strictEqual(wikidataEpisodes[0].title, "Titolo TVDB 2");
  assert.strictEqual(wikidataEpisodes[0].synopsis, "Sinossi TVDB 2");
  assert(
    wikidataContext.requests.includes(WIKIDATA_SPARQL_URL),
    "Wikidata should run for non-anime StreamingUnity titles that lack TVDB",
  );
  assert(
    !wikidataContext.requests.includes(ANIBRIDGE_MAPPINGS_URL),
    "AniBridge reverse lookup should stay anime-only",
  );
  assert(
    wikidataContext.requests.some((url) => url.includes("thetvdb.com")),
    "TVDB should be requested through the Wikidata TVDB id",
  );

  console.log("streamingunity episodes: OK");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
