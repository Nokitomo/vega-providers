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
  commonHeaders: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123 Safari/537.36",
  },
  kvStore: {
    get: async (key) => values.get(key),
    set: async (key, value) => values.set(key, value),
    delete: async (key) => values.delete(key),
    keys: async () => Array.from(values.keys()),
    clear: async () => values.clear(),
  },
};

async function verifyAnime({ id, expectedStart, expectedEnd }) {
  const meta = await getMeta({link: String(id), providerContext});
  assert(meta.title, `AnimeUnity metadata missing for ${id}`);
  assert.strictEqual(meta.linkList.length, 1, `${id} must expose one season`);
  const season = meta.linkList[0];
  assert.strictEqual(season.seasonNumber, 1, `${id} must use TMDB season 1`);
  assert(
    season.episodesLink.endsWith("tmdb_show%3A95479%3As1"),
    `${id} must preserve the selected TMDB mapping`,
  );

  const episodes = await getEpisodes({
    url: season.episodesLink,
    providerContext,
  });
  assert(episodes.length > 0, `${id} must expose episodes`);
  const first = episodes[0];
  const last = episodes[episodes.length - 1];
  const firstTmdb = first.externalMappings.find(
    mapping => mapping.provider === "tmdb_show",
  );
  const lastTmdb = last.externalMappings.find(
    mapping => mapping.provider === "tmdb_show",
  );
  assert.strictEqual(firstTmdb.seasonNumber, 1);
  assert.deepStrictEqual(firstTmdb.episodeNumbers, [expectedStart]);
  assert.deepStrictEqual(lastTmdb.episodeNumbers, [expectedEnd]);
  assert(first.title && !/^Episode\s+1$/i.test(first.title));
  assert(first.synopsis, `${id} first episode must have a TMDB synopsis`);
  assert(first.thumbnail, `${id} first episode must have a TMDB thumbnail`);

  return {
    id,
    title: meta.title,
    season: season.title,
    episodeCount: episodes.length,
    first: {
      source: first.sourceEpisodeNumber,
      tmdb: firstTmdb.episodeNumbers[0],
      title: first.title,
      thumbnail: first.thumbnail,
    },
    last: {
      source: last.sourceEpisodeNumber,
      tmdb: lastTmdb.episodeNumbers[0],
      title: last.title,
    },
  };
}

Promise.all([
  verifyAnime({id: 4197, expectedStart: 25, expectedEnd: 47}),
  verifyAnime({id: 7209, expectedStart: 48, expectedEnd: 59}),
])
  .then(results => console.log(JSON.stringify(results, null, 2)))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
