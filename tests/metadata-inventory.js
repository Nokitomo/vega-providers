const assert = require('assert');
const cheerio = require('cheerio');

const animeMeta = require('../dist/animeunity/meta.js');
const animeEpisodes = require('../dist/animeunity/episodes.js');
const streamingMeta = require('../dist/streamingunity/meta.js');
const streamingEpisodes = require('../dist/streamingunity/episodes.js');

const inertiaHtml = props =>
  `<div id="app" data-page="${JSON.stringify({props})
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')}"></div>`;

async function run() {
  const animeCalls = [];
  const animeContext = {
    cheerio,
    commonHeaders: {},
    getBaseUrl: async () => 'https://animeunity.test',
    axios: {
      get: async url => {
        animeCalls.push(url);
        if (url === 'https://animeunity.test/info_api/20/') {
          return {
            data: {
              id: 20,
              title: 'Fixture',
              status: 'In Corso',
              episodes_count: 2,
            },
          };
        }
        if (url.startsWith('https://animeunity.test/info_api/20/1?')) {
          return {
            data: {
              episodes: [
                {id: 101, number: '1'},
                {id: 102, number: '2'},
              ],
            },
          };
        }
        throw new Error(`Unexpected AnimeUnity request: ${url}`);
      },
    },
  };
  const animeContent = await animeMeta.getContentInventory({
    link: 'https://animeunity.test/anime/20-fixture',
    providerContext: animeContext,
  });
  assert.strictEqual(animeContent.status, 'In Corso');
  assert.strictEqual(animeContent.episodesCount, 2);
  const animeInventory = await animeEpisodes.getEpisodeInventory({
    url: '20|1|2',
    providerContext: animeContext,
  });
  assert.strictEqual(animeInventory.complete, true);
  assert.deepStrictEqual(animeInventory.episodes.map(item => item.link), [
    '101',
    '102',
  ]);
  assert(animeCalls.every(url => url.startsWith('https://animeunity.test/')));

  const streamingCalls = [];
  const streamingContext = {
    cheerio,
    commonHeaders: {},
    getBaseUrl: async () => 'https://streamingunity.test',
    axios: {
      get: async url => {
        streamingCalls.push(url);
        if (url === 'https://streamingunity.test/it/titles/10-fixture') {
          return {
            data: inertiaHtml({
              title: {
                id: 10,
                type: 'tv',
                status: 'Returning Series',
                seasons: [{id: 501, number: 1, episodes_count: 2}],
              },
            }),
          };
        }
        if (
          url === 'https://streamingunity.test/it/titles/10-fixture/season-1' ||
          url === 'https://streamingunity.test/titles/10-fixture/season-1'
        ) {
          return {
            data: inertiaHtml({
              title: {id: 10, type: 'tv', tmdb_id: 5001},
              loadedSeason: {
                id: 501,
                number: 1,
                episodes: [
                  {id: 101, number: 1, name: 'One'},
                  {id: 102, number: 2, name: 'Two'},
                ],
              },
            }),
          };
        }
        throw new Error(`Unexpected StreamingUnity request: ${url}`);
      },
    },
  };
  const streamingContent = await streamingMeta.getContentInventory({
    link: 'https://streamingunity.test/titles/10-fixture',
    providerContext: streamingContext,
  });
  assert.strictEqual(streamingContent.status, 'Returning Series');
  assert.strictEqual(streamingContent.episodesCount, 2);
  const streamingInventory = await streamingEpisodes.getEpisodeInventory({
    url: 'https://streamingunity.test/titles/10-fixture/season-1',
    providerContext: streamingContext,
  });
  assert.strictEqual(streamingInventory.complete, true);
  assert.strictEqual(streamingInventory.episodes.length, 2);
  assert(streamingCalls.every(url => url.startsWith('https://streamingunity.test/')));
  console.log('metadata inventories: OK');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
