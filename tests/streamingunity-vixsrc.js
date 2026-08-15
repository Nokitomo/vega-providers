const assert = require("assert");
const cheerio = require("cheerio");

const {
  buildStreamingUnityPlaybackLink,
  buildStreamingUnityVixsrcUrl,
  parseStreamingUnityPlaybackLink,
} = require("../dist/streamingunity/playback.js");
const { getStream } = require("../dist/streamingunity/stream.js");

const BASE_URL = "https://streamingunity.test";
const VIXCLOUD_URL = "https://vixcloud.co/embed/123";
const VIXSRC_PAGE_URL = "https://vixsrc.to/movie/tt1234567";
const VIXSRC_API_URL = "https://vixsrc.to/api/movie/tt1234567";
const VIXSRC_EMBED_URL =
  "https://vixsrc.to/embed/99?token=embed-token&expires=456";

const inertiaHtml = (props) =>
  `<div id="app" data-page="${JSON.stringify({ props }).replace(
    /"/g,
    "&quot;"
  )}"></div>`;

const createContext = (vixCloudHtml, calls) => ({
  axios: {
    get: async (url) => {
      calls.push(url);
      if (url === `${BASE_URL}/it/watch/42`) {
        return {
          data: inertiaHtml({ embedUrl: `${BASE_URL}/it/iframe/42` }),
        };
      }
      if (url === `${BASE_URL}/it/iframe/42`) {
        return { data: `<iframe src="${VIXCLOUD_URL}"></iframe>` };
      }
      if (url === VIXCLOUD_URL) {
        if (vixCloudHtml instanceof Error) throw vixCloudHtml;
        return { data: vixCloudHtml };
      }
      if (url === VIXSRC_PAGE_URL) {
        return { data: "<html>VixSrc Next page</html>" };
      }
      if (url === VIXSRC_API_URL) {
        return { data: { src: "/embed/99?token=embed-token&expires=456" } };
      }
      if (url === VIXSRC_EMBED_URL) {
        return {
          data: `
            <script>
              window.masterPlaylist = {
                url: 'https://cdn.vixsrc.test/playlist/99.m3u8',
                params: {'token': 'fallback-token', 'expires': '123'}
              };
            </script>
          `,
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
  },
  cheerio,
  getBaseUrl: async () => BASE_URL,
  commonHeaders: { "User-Agent": "StreamingUnity test" },
  extractors: {},
});

const testPlaybackCodec = () => {
  assert.deepStrictEqual(parseStreamingUnityPlaybackLink("42::900"), {
    titleId: "42",
    episodeId: "900",
  });

  const seriesLink = buildStreamingUnityPlaybackLink("42", {
    episodeId: "900",
    mediaType: "series",
    imdbId: "tt7654321",
    tmdbId: "987",
    seasonNumber: 2,
    episodeNumber: 5,
  });
  const parsedSeries = parseStreamingUnityPlaybackLink(seriesLink);
  assert.deepStrictEqual(parsedSeries, {
    titleId: "42",
    episodeId: "900",
    mediaType: "series",
    imdbId: "tt7654321",
    tmdbId: "987",
    seasonNumber: 2,
    episodeNumber: 5,
  });
  assert.strictEqual(
    buildStreamingUnityVixsrcUrl(parsedSeries),
    "https://vixsrc.to/tv/tt7654321/2/5"
  );

  const movieLink = buildStreamingUnityPlaybackLink(
    `${BASE_URL}/it/titles/42-film`,
    { mediaType: "movie", tmdbId: "321" }
  );
  assert.strictEqual(
    buildStreamingUnityVixsrcUrl(
      parseStreamingUnityPlaybackLink(movieLink)
    ),
    "https://vixsrc.to/movie/321"
  );
};

const testVixCloudPriority = async () => {
  const calls = [];
  const link = buildStreamingUnityPlaybackLink(
    `${BASE_URL}/it/titles/42-film`,
    { mediaType: "movie", imdbId: "tt1234567" }
  );
  const streams = await getStream({
    link,
    type: "movie",
    signal: new AbortController().signal,
    providerContext: createContext(
      `window.masterPlaylist = {url: 'https://cdn.vixcloud.test/playlist/123'};`,
      calls
    ),
  });

  assert.strictEqual(streams.length, 2);
  assert(streams.every((stream) => stream.server.startsWith("StreamingUnity VixCloud")));
  assert(!calls.includes(VIXSRC_PAGE_URL));
};

const testVixsrcFallback = async () => {
  const calls = [];
  const link = buildStreamingUnityPlaybackLink(
    `${BASE_URL}/it/titles/42-film`,
    { mediaType: "movie", imdbId: "tt1234567" }
  );
  const streams = await getStream({
    link,
    type: "movie",
    signal: new AbortController().signal,
    providerContext: createContext(new Error("VixCloud unavailable"), calls),
  });

  assert.strictEqual(streams.length, 1);
  assert.strictEqual(streams[0].server, "StreamingUnity VixSrc Server 1");
  assert.strictEqual(streams[0].type, "m3u8");
  assert.strictEqual(
    streams[0].link,
    "https://cdn.vixsrc.test/playlist/99.m3u8?token=fallback-token&expires=123"
  );
  assert(calls.includes(VIXSRC_PAGE_URL));
  assert(calls.includes(VIXSRC_API_URL));
  assert(calls.includes(VIXSRC_EMBED_URL));
};

const run = async () => {
  testPlaybackCodec();
  await testVixCloudPriority();
  await testVixsrcFallback();
  console.log("streamingunity VixSrc: OK");
};

run().catch((error) => {
  console.error("streamingunity VixSrc: FAILED");
  console.error(error);
  process.exit(1);
});
