const assert = require("assert");
const cheerio = require("cheerio");

const streamingMeta = require("../dist/streamingunity/meta.js");
const streamingEpisodes = require("../dist/streamingunity/episodes.js");
const streamCenterMeta = require("../dist/streamcenter/meta.js");
const { encodeRoute } = require("../dist/streamcenter/routing.js");
const { parseStreamingUnityPlaybackLink } = require("../dist/streamingunity/playback.js");

const baseUrl = "https://streamingunity.test";
const titleUrl = `${baseUrl}/it/titles/42-helluva-boss`;
const seasonUrl = `${titleUrl}/season-0`;
const html = props =>
  `<div id="app" data-page="${JSON.stringify({ props }).replace(/"/g, "&quot;")}"></div>`;

const title = {
  id: 42,
  name: "Helluva Boss",
  slug: "helluva-boss",
  plot: "Fixture plot",
  type: "tv",
  status: "Returning Series",
  tmdb_id: 289892,
  seasons: [
    { id: 100, number: 0, episodes_count: 1 },
    { id: 101, number: 1, episodes_count: 2 },
  ],
  images: [{ type: "poster", filename: "poster.jpg" }],
  genres: [{ name: "Animation" }],
  main_actors: [{ name: "Fixture Actor" }],
};
const loadedSeason = {
  id: 100,
  number: 0,
  episodes: [{ id: 910, number: 10, name: "Special", plot: "Provider plot" }],
};
const calls = [];
const providerContext = {
  cheerio,
  commonHeaders: {},
  getBaseUrl: async () => baseUrl,
  axios: {
    get: async url => {
      calls.push(url);
      if (url === titleUrl) {
        return { data: html({ title, loadedSeason }) };
      }
      if (url === seasonUrl) {
        return { data: html({ title, loadedSeason }) };
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  },
};

(async () => {
  const info = await streamingMeta.getMeta({
    link: titleUrl,
    provider: "streamingunity",
    providerContext,
  });
  assert.deepStrictEqual(info.linkList.map(season => season.seasonNumber), [0, 1]);
  assert.strictEqual(info.linkList[0].episodesLink, seasonUrl);
  assert.strictEqual(info.episodesCount, 3);

  const inventory = await streamingMeta.getContentInventory({
    link: titleUrl,
    providerContext,
  });
  assert.strictEqual(inventory.episodesCount, 3);
  assert.deepStrictEqual(JSON.parse(inventory.seasonsSignature).map(season => season.number), [0, 1]);

  const episodes = await streamingEpisodes.getEpisodes({ url: seasonUrl, providerContext });
  assert.strictEqual(episodes.length, 1);
  assert.strictEqual(episodes[0].seasonNumber, 0);
  assert.strictEqual(episodes[0].episodeNumber, 10);
  const playback = parseStreamingUnityPlaybackLink(episodes[0].link);
  assert.strictEqual(playback.episodeId, "910");
  assert.strictEqual(playback.seasonNumber, 0);

  const episodeInventory = await streamingEpisodes.getEpisodeInventory({
    url: seasonUrl,
    providerContext,
  });
  assert.strictEqual(episodeInventory.episodes[0].seasonNumber, 0);

  const streamCenterInfo = await streamCenterMeta.getMeta({
    link: encodeRoute("meta", "streamingunity", { url: titleUrl }),
    provider: "streamcenter",
    providerContext,
  });
  assert.strictEqual(streamCenterInfo.linkList[0].seasonNumber, 0);
  assert(calls.includes(titleUrl));
  assert(calls.includes(seasonUrl));
  console.log("streamingunity season zero: OK");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
