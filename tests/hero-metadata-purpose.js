const assert = require("assert");
const cheerio = require("cheerio");
const { getMeta: streamingMeta } = require("../dist/streamingunity/meta.js");
const { getMeta: streamCenterMeta } = require("../dist/streamcenter/meta.js");

const base = "https://streamingunity.test";
const link = `${base}/it/titles/77-fixture-series`;
const page = (props) => `<div id="app" data-page="${JSON.stringify({ props })
  .replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"></div>`;
const title = {
  id: 77, name: "Fixture series", slug: "fixture-series", type: "tv",
  plot: "Fixture synopsis", status: "Returning Series",
  release_date: "2020-01-01", runtime: 24, score: 8,
  genres: [{ name: "Animation" }], main_actors: [{ name: "Actor" }],
  tmdb_id: 90077, tvdb_show_id: 80077, imdb_id: "tt90077",
  images: [{ type: "poster", filename: "poster.jpg" },
    { type: "background", filename: "background.jpg" }],
  seasons: [{ id: 1, number: 1, episodes_count: 0,
    release_date: "2020-01-01" }],
};

function makeContext() {
  const requests = [];
  return {
    requests,
    providerContext: {
      cheerio,
      commonHeaders: { "User-Agent": "HeroFixture/1.0" },
      getBaseUrl: async () => base,
      axios: { get: async (url) => {
        requests.push(String(url));
        if (url === link) return { data: page({ title, loadedSeason: null, sliders: [] }) };
        if (url === `${link}/season-1`) return { data: page({
          loadedSeason: { episodes: [{ id: 1 }] },
        }) };
        return { data: "<html><head><title>Fixture</title></head><body></body></html>" };
      } },
    },
  };
}

const visibleFields = (info) => {
  const { linkList, episodesCount, ...visible } = info;
  return visible;
};

(async () => {
  for (const [name, resolver] of [
    ["StreamingUnity", streamingMeta],
    ["StreamCenter", streamCenterMeta],
  ]) {
    const fullContext = makeContext();
    const heroContext = makeContext();
    const full = await resolver({
      link, provider: name.toLowerCase(), providerContext: fullContext.providerContext,
    });
    const hero = await resolver({
      link, provider: name.toLowerCase(), purpose: "hero",
      providerContext: heroContext.providerContext,
    });
    assert(full.linkList.length > 0, `${name} full metadata lost seasons`);
    assert.strictEqual(full.linkList[0].availabilityStatus, "available");
    assert.strictEqual(full.episodesCount, 1);
    assert.deepStrictEqual(hero.linkList, [], `${name} hero loaded seasons`);
    assert.deepStrictEqual(visibleFields(hero), visibleFields(full),
      `${name} hero changed visible metadata or artwork fallback`);
    assert(fullContext.requests.includes(`${link}/season-1`));
    assert(!heroContext.requests.includes(`${link}/season-1`),
      `${name} hero probed season availability`);
    console.log(`${name} hero: visible fields identical; season probe skipped`);
  }
})().catch((error) => { console.error(error); process.exit(1); });
