const assert = require("assert");
const cheerio = require("cheerio");
const { getMeta } = require("../dist/animeunity/meta.js");
const { getMeta: getStreamCenterMeta } = require("../dist/streamcenter/meta.js");
const baseline = process.env.BASELINE_ANIME_META
  ? require(process.env.BASELINE_ANIME_META).getMeta : null;
const { ANIBRIDGE_MAPPINGS_URL } = require("../dist/animeunity/mappings/index.js");

const details = `<!doctype html><html><head><title>The Movie Database</title>
  <script type="application/ld+json">${JSON.stringify({
    "@type": "TVSeries", name: "Fixture anime", startDate: "2020-01-01",
    description: "Fixture description", genre: ["Animation"],
  })}</script></head><body></body></html>`;
const seasons = `<!doctype html><html><head><title>The Movie Database</title></head>
  <body><div class="season_wrapper"><div class="season">
  <a href="/tv/90020/season/1"></a><h2><a href="/tv/90020/season/1">Stagione uno</a></h2>
  <h4>2020 · 12 Episodes</h4></div></div></body></html>`;

function makeContext() {
  const calls = [];
  const providerContext = {
    cheerio,
    commonHeaders: { "User-Agent": "Fixture/1.0" },
    getBaseUrl: async () => "https://animeunity.test",
    axios: {
      get: async (url) => {
        calls.push(String(url));
        if (url === "https://animeunity.test/info_api/99/") return { data: {
          id: 99, slug: "fixture", title: "Fixture anime",
          episodes_count: 12, anilist_id: 20,
        } };
        if (url === ANIBRIDGE_MAPPINGS_URL) return { data: {
          $meta: { schema_version: "3.0.3" },
          "anilist:20": {
            "tmdb_show:90020:s1": { "1-12": "1-12" },
            "tvdb_show:80020:s1": { "1-12": "1-12" },
            "imdb_show:tt90020": {},
          },
        } };
        if (url.startsWith("https://www.themoviedb.org/tv/90020")) {
          return { data: new URL(url).pathname.endsWith("/seasons") ? seasons : details };
        }
        return { data: "<html><head><title>The Movie Database</title></head><body></body></html>" };
      },
      post: async () => ({ data: { data: { Media: { trailer: null } } } }),
    },
  };
  return { providerContext, calls };
}

async function run(module) {
  const context = makeContext();
  const info = await module({
    link: "https://animeunity.test/anime/99-fixture",
    providerContext: context.providerContext,
  });
  return { info, calls: context.calls };
}

(async () => {
  const after = await run(getMeta);
  assert.strictEqual(after.info.title, "Fixture anime");
  assert.strictEqual(after.info.episodesCount, 12);
  assert(after.info.linkList.length > 0);
  if (baseline) {
    const before = await run(baseline);
    assert.deepStrictEqual(after.info, before.info, "AnimeUnity Info changed");
    console.log(`AnimeUnity Info identical; total requests ${before.calls.length} -> ${after.calls.length}`);
  } else {
    console.log("AnimeUnity season layout Info: OK");
  }
  const streamCenter = makeContext();
  const delegated = await getStreamCenterMeta({
    link: "https://animeunity.test/anime/99-fixture",
    provider: "streamcenter",
    providerContext: streamCenter.providerContext,
  });
  assert.strictEqual(delegated.title, after.info.title);
  assert.strictEqual(delegated.episodesCount, after.info.episodesCount);
  assert.deepStrictEqual(
    delegated.linkList.map((group) => ({ title: group.title, seasonNumber: group.seasonNumber })),
    after.info.linkList.map((group) => ({ title: group.title, seasonNumber: group.seasonNumber })),
  );
  console.log("StreamCenter AnimeUnity delegation: OK");
})().catch((error) => { console.error(error); process.exit(1); });
