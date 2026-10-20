const assert = require("assert");
const cheerio = require("cheerio");
const current = require("../dist/animeunity/tmdb/index.js");

const details = `<!doctype html><html><head><title>The Movie Database</title>
  <script type="application/ld+json">${JSON.stringify({
    "@type": "TVSeries", name: "Fixture series", description: "Fixture plot",
    startDate: "2020-01-01", genre: ["Animation"],
  })}</script></head><body><section class="facts left_column">
  <p><strong>Original Language</strong> English</p></section></body></html>`;

function seasonsHtml(locale) {
  const name = locale === "it-IT" ? "Stagione uno" : "Season one";
  return `<!doctype html><html><head><title>The Movie Database</title></head>
    <body><div class="season_wrapper"><div class="season">
    <a href="/tv/123/season/1"></a><h2><a href="/tv/123/season/1">${name}</a></h2>
    <h4>2020 · 12 Episodes</h4><div class="season_overview">Description</div>
    </div></div></body></html>`;
}

function makeContext(mode) {
  const calls = [];
  const providerContext = {
    cheerio,
    ...(mode !== "web" && {
      kvStore: { get: async (name) => name === "tmdbApiKey" ? "fixture-key" : undefined },
    }),
    axios: { get: async (url, options = {}) => {
      calls.push(String(url));
      if (url.startsWith("https://api.themoviedb.org/3/")) {
        if (url.endsWith("/tv/123")) return { data: {
          id: 123, original_language: "en", name: "Fixture series",
          overview: "Fixture plot", first_air_date: "2020-01-01",
          genres: [{ name: "Animation" }], episode_run_time: [24],
          vote_average: 8, seasons: mode === "api-empty" ? [] : [{
            season_number: 1, name: "Stagione uno", episode_count: 12,
            air_date: "2020-01-01", poster_path: "/season.jpg",
          }],
        } };
        if (url.endsWith("/tv/123/images")) return { data: {
          logos: [], posters: [], backdrops: [],
        } };
        if (url.endsWith("/tv/123/credits")) return { data: { cast: [] } };
        if (url.endsWith("/tv/123/translations")) return { data: { translations: [
          { iso_639_1: "it", iso_3166_1: "IT", data: {
            name: "Fixture series", overview: "Fixture plot",
          } },
        ] } };
      }
      if (url.startsWith("https://www.themoviedb.org/tv/123")) {
        const parsed = new URL(url);
        return { data: parsed.pathname.endsWith("/seasons")
          ? seasonsHtml(parsed.searchParams.get("language")) : details };
      }
      throw new Error(`Unexpected request: ${url} ${JSON.stringify(options.params || {})}`);
    } },
  };
  return { providerContext, calls };
}

(async () => {
  for (const mode of ["web", "api", "api-empty"]) {
    const oldContext = makeContext(mode);
    const newContext = makeContext(mode);
    const before = await current.resolveTmdbMediaMetadata({
      providerContext: oldContext.providerContext, id: 123, type: "tv",
    });
    const after = await current.resolveTmdbSeasonLayout({
      providerContext: newContext.providerContext, id: 123,
    });
    assert(before, `full metadata missing in ${mode}`);
    assert.deepStrictEqual(after, before.seasons, `season metadata changed in ${mode}`);
    assert(newContext.calls.length < oldContext.calls.length,
      `no request reduction in ${mode}`);
    assert.strictEqual(newContext.calls.some((url) => /\/images(?:\/|\?)/.test(url)), false);
    if (mode === "api") {
      assert.strictEqual(newContext.calls.some((url) => url.startsWith("https://www.themoviedb.org/")), false);
    }
    console.log(`season layout ${mode}: same seasons, requests ${oldContext.calls.length} -> ${newContext.calls.length}`);
  }
})().catch((error) => { console.error(error); process.exit(1); });
