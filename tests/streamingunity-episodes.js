const assert = require("assert");
const cheerio = require("cheerio");

const episodesModule = require("../dist/streamingunity/episodes.js");

const BASE_URL = "https://streamingunity.test";

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

  console.log("streamingunity episodes: OK");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
