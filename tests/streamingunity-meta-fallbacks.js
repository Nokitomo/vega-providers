const assert = require("assert");
const cheerio = require("cheerio");

const metaModule = require("../dist/streamingunity/meta.js");

const BASE_URL = "https://streamingunity.test";

const inertiaHtml = (props) => {
  const encoded = JSON.stringify({ props })
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
  return `<div id="app" data-page="${encoded}"></div>`;
};

const completeProviderTitle = {
  id: 77,
  type: "movie",
  tmdb_id: 9001,
  tvdb_movie_id: 8001,
  imdb_id: "tt9001",
  name: "Provider Movie",
  slug: "provider-movie",
  plot: "Provider plot",
  runtime: 98,
  score: 8.2,
  release_date: "2025-01-01",
  status: "released",
  genres: [{ name: "Drama" }],
  main_actors: [{ name: "Actor One" }],
  images: [
    { type: "poster", filename: "provider-poster.jpg" },
    { type: "background", filename: "provider-background.jpg" },
    { type: "logo", filename: "provider-logo.png" },
  ],
  translations: [
    { locale: "it", key: "name", value: "Film Provider" },
    { locale: "it", key: "plot", value: "Trama provider" },
    { locale: "it", key: "slug", value: "provider-movie" },
  ],
};

const buildContext = () => {
  const requests = [];
  const axios = {
    get: async (url) => {
      requests.push(String(url));
      if (url === `${BASE_URL}/it/titles/77-provider-movie`) {
        return {
          data: inertiaHtml({
            title: completeProviderTitle,
            cdn_url: "https://cdn.streamingunity.test",
          }),
        };
      }
      if (
        url ===
        "https://www.themoviedb.org/movie/9001?language=it-IT"
      ) {
        return {
          data: `<!doctype html><html><head><title>The Movie Database</title><script type="application/ld+json">{"@type":"Movie","name":"Provider Movie"}</script></head><body></body></html>`,
        };
      }
      if (
        url ===
        "https://www.themoviedb.org/movie/9001/images/logos?language=it-IT"
      ) {
        return {
          data: `<!doctype html><html><head><title>The Movie Database</title></head><body><li class="card" data-image-id="tmdb-logo"><div class="image_content"><a href="https://image.tmdb.org/t/p/original/tmdb-logo.png"><img src="https://image.tmdb.org/t/p/w500/tmdb-logo.png" /></a></div><input data-language="it" /></li></body></html>`,
        };
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  };
  return {
    requests,
    providerContext: {
      axios,
      cheerio,
      commonHeaders: { "User-Agent": "StreamingUnityMetaFixture/1.0" },
      getBaseUrl: async () => BASE_URL,
    },
  };
};

(async () => {
  const context = buildContext();
  const info = await metaModule.getMeta({
    link: `${BASE_URL}/it/titles/77-provider-movie`,
    providerContext: context.providerContext,
  });

  assert.strictEqual(info.title, "Film Provider");
  assert.strictEqual(info.synopsis, "Trama provider");
  assert.strictEqual(
    info.poster,
    "https://cdn.streamingunity.test/images/provider-poster.jpg",
  );
  assert.strictEqual(
    info.logo,
    "https://image.tmdb.org/t/p/original/tmdb-logo.png",
  );
  assert.strictEqual(
    info.background,
    "https://cdn.streamingunity.test/images/provider-background.jpg",
  );
  assert.deepStrictEqual(info.extra.artworkSources, {
    logo: "tmdb",
    poster: "provider",
    background: "provider",
  });
  assert.deepStrictEqual(info.extra.artworkCandidates.logo, [
    {
      source: "tmdb",
      url: "https://image.tmdb.org/t/p/original/tmdb-logo.png",
    },
    {
      source: "provider",
      url: "https://cdn.streamingunity.test/images/provider-logo.png",
    },
  ]);
  assert.deepStrictEqual(info.extra.artworkCandidates.poster, [
    {
      source: "provider",
      url: "https://cdn.streamingunity.test/images/provider-poster.jpg",
    },
  ]);
  assert.deepStrictEqual(info.extra.artworkCandidates.background, [
    {
      source: "provider",
      url: "https://cdn.streamingunity.test/images/provider-background.jpg",
    },
  ]);
  const externalRequests = context.requests.filter(
    (url) =>
      url.includes("themoviedb.org") ||
      url.includes("thetvdb.com") ||
      url.includes("query.wikidata.org"),
  );
  assert.ok(
    externalRequests.some((url) =>
      url.includes("themoviedb.org/movie/9001/images/logos"),
    ),
    "TMDB logo artwork must be requested ahead of the provider logo",
  );

  console.log("streamingunity meta fallbacks: OK");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
