const assert = require("assert");

const settingsModule = require("../dist/torrentio/settings.js");
const streamModule = require("../dist/torrentio/stream.js");
const postsModule = require("../dist/torrentio/posts.js");

const createContext = (values, responseData, requests) => ({
  axios: {
    get: async (url) => {
      requests.push(url);
      return { data: responseData };
    },
  },
  kvStore: {
    get: async (key) => values[key],
    set: async (key, value) => {
      values[key] = value;
    },
    delete: async (key) => delete values[key],
    keys: async () => Object.keys(values),
    clear: async () => {
      Object.keys(values).forEach((key) => delete values[key]);
    },
  },
});

(async () => {
  const schema = await settingsModule.getSettingsSchema({
    providerContext: createContext({}, {}, []),
  });
  assert.strictEqual(schema.length, 6);
  assert.strictEqual(
    schema.find((field) => field.key === "debridApiKey").secure,
    true,
  );

  const torrentRequests = [];
  const torrentContext = createContext(
    {},
    {
      streams: [
        {
          name: "Torrentio 1080p",
          title: "Example\n👤 42\n💾 1.5 GB",
          infoHash: "0123456789abcdef0123456789abcdef01234567",
          fileIdx: 3,
        },
      ],
    },
    torrentRequests,
  );
  const torrents = await streamModule.getStream({
    link: "https://torrentio.local/watch/movie/tt0133093",
    type: "movie",
    providerContext: torrentContext,
  });
  assert.strictEqual(torrents.length, 1);
  assert.strictEqual(torrents[0].type, "torrent");
  assert(torrents[0].link.includes("xt=urn:btih:"));
  assert(torrents[0].link.includes("so=3"));
  assert.strictEqual(
    torrentRequests[0],
    "https://torrentio.strem.fun/stream/movie/tt0133093.json",
  );

  const directRequests = [];
  const directContext = createContext(
    {
      debridService: "realdebrid",
      debridApiKey: "personal-token",
      qualityFilter: "720",
      sortBy: "seeders",
    },
    {
      streams: [
        {name: "Torrentio 1080p", url: "https://cdn.test/1080.mp4"},
        {name: "Torrentio 720p", url: "https://cdn.test/720.mp4"},
      ],
    },
    directRequests,
  );
  const direct = await streamModule.getStream({
    link: "https://torrentio.local/watch/series/tt0944947/1/2",
    type: "series",
    providerContext: directContext,
  });
  assert.strictEqual(direct.length, 1);
  assert.strictEqual(direct[0].link, "https://cdn.test/720.mp4");
  assert.strictEqual(direct[0].type, "mp4");
  assert(
    directRequests[0].includes(
      "/sort=seeders|realdebrid=personal-token/stream/series/tt0944947:1:2.json",
    ),
  );

  const postRequests = [];
  const posts = await postsModule.getPosts({
    filter: "movie/top",
    page: 2,
    signal: undefined,
    providerContext: createContext(
      {},
      {
        metas: [
          {
            id: "tt0133093",
            type: "movie",
            name: "The Matrix",
            poster: "https://images.test/matrix.jpg",
          },
        ],
      },
      postRequests,
    ),
  });
  assert.strictEqual(posts.length, 1);
  assert.strictEqual(posts[0].provider, "torrentio");
  assert(postRequests[0].endsWith("/catalog/movie/top/skip=100.json"));

  console.log("torrentio provider: OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
