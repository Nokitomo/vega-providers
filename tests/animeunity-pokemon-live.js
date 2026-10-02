const assert = require("assert");
const axios = require("axios");
const cheerio = require("cheerio");

const { getMeta } = require("../dist/animeunity/meta.js");
const { getEpisodes } = require("../dist/animeunity/episodes.js");

const values = new Map();
const providerContext = {
  axios,
  cheerio,
  getBaseUrl: async () => "https://www.animeunity.so",
  commonHeaders: {},
  kvStore: {
    get: async key => values.get(key),
    set: async (key, value) => values.set(key, value),
    delete: async key => values.delete(key),
    keys: async () => Array.from(values.keys()),
    clear: async () => values.clear(),
  },
};

(async () => {
  const meta = await getMeta({ link: "1306", providerContext });
  const seasons = new Map(meta.linkList.map(item => [item.seasonNumber, item]));
  assert.strictEqual(seasons.get(6)?.episodesLink, "1306|1|40|tmdb_show%3A60572%3As6|records");
  assert.strictEqual(seasons.get(9)?.episodesLink, "1306|146|192|tmdb_show%3A60572%3As9|records");

  const advanced = await getEpisodes({
    url: seasons.get(6).episodesLink,
    providerContext,
  });
  assert.strictEqual(advanced.length, 40);
  assert.strictEqual(advanced[0].sourceEpisodeNumber, 1);
  assert.strictEqual(advanced[0].externalMappings.find(item => item.provider === "tmdb_show").episodeNumbers[0], 1);
  assert.strictEqual(advanced[2].sourceEpisodeNumber, 3);
  assert.strictEqual(advanced[2].externalMappings.find(item => item.provider === "tmdb_show").episodeNumbers[0], 3);

  const frontier = await getEpisodes({
    url: seasons.get(9).episodesLink,
    providerContext,
  });
  assert.strictEqual(frontier.length, 46);
  const deoxys = frontier.find(item => item.sourceEpisodeNumber === 171);
  assert(deoxys, "combined AnimeUnity episode 171-172 is missing");
  assert.strictEqual(deoxys.sourceEpisodeEndNumber, 172);
  assert.deepStrictEqual(
    deoxys.externalMappings.find(item => item.provider === "tmdb_show").episodeNumbers,
    [26],
  );
  assert.strictEqual(deoxys.title, "Un Deoxys in crisi");
  assert(deoxys.synopsis);
  assert(deoxys.thumbnail);

  console.log(JSON.stringify({
    seasons: meta.linkList.map(item => ({ season: item.seasonNumber, link: item.episodesLink })),
    first: { source: advanced[0].sourceEpisodeNumber, title: advanced[0].title },
    third: { source: advanced[2].sourceEpisodeNumber, title: advanced[2].title },
    combined: {
      source: `${deoxys.sourceEpisodeNumber}-${deoxys.sourceEpisodeEndNumber}`,
      tmdb: deoxys.externalMappings.find(item => item.provider === "tmdb_show").episodeNumbers[0],
      title: deoxys.title,
    },
  }, null, 2));
})().catch(error => {
  console.error(error);
  process.exit(1);
});
