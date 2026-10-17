const assert = require("assert");
const cheerio = require("cheerio");
const { getMeta } = require("../dist/streamingunity/meta.js");
const { getMeta: getAnimeMeta } = require("../dist/animeunity/meta.js");
const {
  ANIBRIDGE_MAPPINGS_URL,
} = require("../dist/animeunity/mappings/index.js");

const baseUrl = "https://streamingunity.test";
const pageHtml = (props) => {
  const encoded = JSON.stringify({ props })
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
  return `<div id="app" data-page="${encoded}"></div>`;
};

const withTimeout = (promise, label) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(label)), 1000)),
]);

const testStreamingUnityOverlap = async () => {
  let releaseTmdb;
  const tmdbGate = new Promise((resolve) => { releaseTmdb = resolve; });
  let sawTmdb;
  const tmdbStarted = new Promise((resolve) => { sawTmdb = resolve; });
  let sawSeasonProbe;
  const seasonProbeStarted = new Promise((resolve) => { sawSeasonProbe = resolve; });
  const requests = [];
  const title = {
    id: 77,
    name: "Complete provider title",
    slug: "complete-provider-title",
    plot: "Provider synopsis",
    type: "tv",
    status: "Returning Series",
    release_date: "2020-01-01",
    runtime: 45,
    score: 8,
    genres: [{ name: "Drama" }],
    main_actors: [{ name: "Actor" }],
    translations: [],
    tmdb_id: 90077,
    tvdb_show_id: 80077,
    imdb_id: "tt90077",
    seasons: [{ id: 1, number: 1, episodes_count: 0, release_date: "2020-01-01" }],
  };
  const providerContext = {
    cheerio,
    commonHeaders: { "User-Agent": "MetaCriticalPathFixture/1.0" },
    getBaseUrl: async () => baseUrl,
    axios: {
      get: async (url) => {
        requests.push(String(url));
        if (url === `${baseUrl}/it/titles/77-complete-provider-title`) {
          return { data: pageHtml({ title, loadedSeason: null, sliders: [] }) };
        }
        if (url === `${baseUrl}/it/titles/77-complete-provider-title/season-1`) {
          sawSeasonProbe();
          return { data: pageHtml({ loadedSeason: { episodes: [{ id: 1 }] } }) };
        }
        if (String(url).startsWith("https://www.themoviedb.org/tv/90077?")) {
          sawTmdb();
          await tmdbGate;
          return { data: "<html><head><title>The Movie Database</title></head><body></body></html>" };
        }
        return { data: "<html><body></body></html>" };
      },
    },
  };

  const result = getMeta({
    link: `${baseUrl}/it/titles/77-complete-provider-title`,
    provider: "streamingunity",
    providerContext,
  });
  try {
    await withTimeout(Promise.all([tmdbStarted, seasonProbeStarted]),
      "Season availability probe waited for TMDB artwork");
  } finally {
    releaseTmdb();
  }
  const info = await result;
  assert.strictEqual(info.title, "Complete Provider Title");
  assert.strictEqual(info.linkList[0].availabilityStatus, "available");
  assert.strictEqual(info.linkList[0].episodesLink,
    `${baseUrl}/it/titles/77-complete-provider-title/season-1`);
  assert.strictEqual(info.episodesCount, 1);
  assert(requests.some((url) => url.includes("themoviedb.org")));
};

const testAnimeUnityOverlap = async () => {
  let releaseRelated;
  const relatedGate = new Promise((resolve) => { releaseRelated = resolve; });
  let sawRelated;
  const relatedStarted = new Promise((resolve) => { sawRelated = resolve; });
  let sawTmdb;
  const tmdbStarted = new Promise((resolve) => { sawTmdb = resolve; });
  const providerContext = {
    cheerio,
    commonHeaders: { "User-Agent": "MetaCriticalPathFixture/1.0" },
    getBaseUrl: async () => "https://animeunity.test",
    axios: {
      get: async (url) => {
        if (url === "https://animeunity.test/info_api/99/") {
          return { data: {
            id: 99,
            slug: "fixture",
            title: "Anime fixture",
            episodes_count: 1,
            anilist_id: 20,
            related: [{ id: 100, title: "Related fixture", slug: "related" }],
          } };
        }
        if (url === "https://animeunity.test/info_api/100/") {
          sawRelated();
          await relatedGate;
          return { data: { id: 100, slug: "related", title: "Related fixture" } };
        }
        if (url === ANIBRIDGE_MAPPINGS_URL) {
          return { data: {
            $meta: { schema_version: "3.0.3" },
            "anilist:20": {
              "tmdb_show:90020:s1": { "1": "1" },
              "tvdb_show:80020:s1": { "1": "1" },
              "imdb_show:tt90020": {},
            },
          } };
        }
        if (String(url).startsWith("https://www.themoviedb.org/tv/90020?")) {
          sawTmdb();
        }
        return { data: "<html><head><title>Fixture</title></head><body></body></html>" };
      },
      post: async () => ({ data: { data: { Media: { trailer: null } } } }),
    },
  };
  const result = getAnimeMeta({
    link: "https://animeunity.test/anime/99-fixture",
    providerContext,
  });
  try {
    await withTimeout(Promise.all([relatedStarted, tmdbStarted]),
      "AnimeUnity artwork waited for related titles");
  } finally {
    releaseRelated();
  }
  const info = await result;
  assert.strictEqual(info.title, "Anime fixture");
  assert.strictEqual(info.related.length, 1);
  assert.strictEqual(info.related[0].title, "Related fixture");
  assert(info.linkList.length > 0);
};

(async () => {
  await testStreamingUnityOverlap();
  await testAnimeUnityOverlap();
  console.log("metadata critical path: OK");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
