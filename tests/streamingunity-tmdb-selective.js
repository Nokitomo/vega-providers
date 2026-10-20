const assert = require("assert");
const cheerio = require("cheerio");
const current = require("../dist/streamingunity/meta.js");
const { resolveTmdbMediaMetadata, resolveTmdbInfoFields } = require("../dist/animeunity/tmdb/index.js");
const baseline = process.env.BASELINE_META ? require(process.env.BASELINE_META) : null;

const baseUrl = "https://streamingunity.test";
const titleUrl = `${baseUrl}/it/titles/77-provider-movie`;
const title = {
  id: 77, type: "movie", tmdb_id: 9001, name: "Provider Movie",
  slug: "provider-movie", plot: "Provider plot", runtime: 98,
  score: 8.2, release_date: "2025-01-01", status: "released",
  genres: [{ name: "Drama" }], main_actors: [],
  images: [{ type: "poster", filename: "provider-poster.jpg" },
    { type: "background", filename: "provider-background.jpg" },
    { type: "logo", filename: "provider-logo.png" }],
};

const tmdbHtml = `<!doctype html><html><head><title>The Movie Database</title>
  <script type="application/ld+json">${JSON.stringify({
    "@type": "Movie", name: "TMDB Movie", description: "TMDB plot",
    datePublished: "2024-01-01", genre: ["Comedy"],
    aggregateRating: { ratingValue: 7.2 },
  })}</script></head><body>
  <section class="top_billed"><div class="people scroller"><div class="card">
    <p><a href="/person/1">Actor One</a></p><p class="character">Role</p>
  </div></div></section></body></html>`;

function makeContext() {
  const requests = [];
  return {
    requests,
    providerContext: {
      cheerio,
      commonHeaders: { "User-Agent": "Fixture/1.0" },
      getBaseUrl: async () => baseUrl,
      axios: { get: async (url) => {
        requests.push(String(url));
        if (url === titleUrl) {
          const page = JSON.stringify({ props: { title, cdn_url: "https://cdn.streamingunity.test" } })
            .replace(/&/g, "&amp;").replace(/"/g, "&quot;");
          return { data: `<div id="app" data-page="${page}"></div>` };
        }
        if (url.startsWith("https://www.themoviedb.org/movie/9001")) {
          return { data: tmdbHtml };
        }
        throw new Error(`Unexpected request: ${url}`);
      } },
    },
  };
}

async function run(module) {
  const context = makeContext();
  const info = await module.getMeta({ link: titleUrl, providerContext: context.providerContext });
  return { info, requests: context.requests };
}

(async () => {
  const after = await run(current);
  assert.strictEqual(after.info.title, "Provider Movie");
  assert.strictEqual(after.info.synopsis, "Provider plot");
  assert.strictEqual(after.info.year, "2025");
  assert.deepStrictEqual(after.info.cast, ["Actor One"]);
  assert.strictEqual(after.info.poster, "https://cdn.streamingunity.test/images/provider-poster.jpg");
  assert.strictEqual(after.info.runtime, "1h 38m");
  if (baseline) {
    const before = await run(baseline);
    assert.deepStrictEqual(after.info, before.info, "Info must be identical before and after");
    console.log(`streamingunity selective TMDB: same Info, requests ${before.requests.length} -> ${after.requests.length}`);
  } else {
    console.log("streamingunity selective TMDB: OK");
  }

  const makeTvContext = () => {
    const calls = [];
    return {
      calls,
      cheerio,
      axios: { get: async (url) => {
        calls.push(String(url));
        return { data: `<!doctype html><html><head><title>The Movie Database</title>
          <script type="application/ld+json">${JSON.stringify({
            "@type": "TVSeries", name: "Series", description: "Story",
            startDate: "2020-01-01", genre: ["Comedy"],
            aggregateRating: { ratingValue: 8.1 },
          })}</script></head><body><section class="top_billed">
          <div class="people scroller"><div class="card"><p><a href="/person/1">Actor One</a></p>
          </div></div></section></body></html>` };
      } },
    };
  };
  const fullContext = makeTvContext();
  const selectiveContext = makeTvContext();
  const full = await resolveTmdbMediaMetadata({ providerContext: fullContext, id: 9002, type: "tv" });
  const selective = await resolveTmdbInfoFields({
    providerContext: selectiveContext, id: 9002, type: "tv", fields: ["cast"],
  });
  assert.deepStrictEqual(selective.cast, full.cast);
  assert.strictEqual(selectiveContext.calls.some((url) => /\/seasons\?/.test(url)), false);
  assert.strictEqual(selectiveContext.calls.some((url) => /\/images\//.test(url)), false);
  assert(selectiveContext.calls.length < fullContext.calls.length);
  console.log(`TMDB TV core requests ${fullContext.calls.length} -> ${selectiveContext.calls.length}`);

  const apiCalls = [];
  const apiContext = {
    cheerio,
    kvStore: { get: async (name) => name === "tmdbApiKey" ? "fixture-key" : undefined },
    axios: { get: async (url, options = {}) => {
      apiCalls.push(String(url));
      if (url.endsWith("/movie/55")) return { data: {
        id: 55, original_language: "en", title: options.params.language === "it-IT"
          ? "Titolo italiano" : "English title", overview: "Plot",
        genres: [{ name: "Drama" }], runtime: 120,
        release_date: "2020-01-01", vote_average: 7.5,
      } };
      if (url.endsWith("/movie/55/translations")) return { data: { translations: [
        { iso_639_1: "it", iso_3166_1: "IT", data: { title: "Titolo italiano", overview: "Trama italiana" } },
        { iso_639_1: "en", iso_3166_1: "US", data: { title: "English title", overview: "English plot" } },
      ] } };
      throw new Error("Unneeded TMDB endpoint");
    } },
  };
  const apiInfo = await resolveTmdbInfoFields({
    providerContext: apiContext, id: 55, type: "movie", fields: ["title"],
  });
  assert.strictEqual(apiInfo.title.value, "Titolo italiano");
  assert.strictEqual(apiCalls.some((url) => /\/(images|credits)$/.test(url)), false);
  assert.strictEqual(apiCalls.some((url) => url.startsWith("https://www.themoviedb.org/")), false);
  console.log("TMDB API selective fields: OK");

  const tvApiCalls = [];
  const completeTvContext = {
    cheerio,
    kvStore: { get: async (name) => name === "tmdbApiKey" ? "fixture-key" : undefined },
    axios: { get: async (url, options = {}) => {
      tvApiCalls.push(String(url));
      if (url.endsWith("/tv/56")) return { data: {
        id: 56, original_language: "en", name: "Series", overview: "Story",
        first_air_date: "2020-01-01", genres: [{ name: "Comedy" }],
        episode_run_time: [24], vote_average: 8.1,
        seasons: [{ season_number: 1, name: "Season 1", episode_count: 10 }],
      } };
      if (url.endsWith("/tv/56/credits")) return { data: {
        cast: [{ id: 1, name: "Actor One" }],
      } };
      if (url.endsWith("/tv/56/translations")) return { data: { translations: [
        { iso_639_1: "en", iso_3166_1: "US", data: { name: "Series", overview: "Story" } },
      ] } };
      throw new Error(`Unneeded endpoint: ${url}`);
    } },
  };
  const tvYear = await resolveTmdbInfoFields({
    providerContext: completeTvContext, id: 56, type: "tv", fields: ["year"],
  });
  assert.strictEqual(tvYear.startDate, "2020-01-01");
  assert.strictEqual(tvApiCalls.some((url) => url.startsWith("https://www.themoviedb.org/")), false);
  assert.strictEqual(tvApiCalls.some((url) => /\/images$/.test(url)), false);
  console.log("TMDB API year precedence: OK");
})().catch((error) => { console.error(error); process.exit(1); });
