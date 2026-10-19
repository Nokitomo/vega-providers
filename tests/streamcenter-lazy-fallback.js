const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {execFileSync} = require("child_process");

// The shipped bundles inline dependencies; compile unbundled modules to inject
// deterministic source responses without contacting external sites.
const tempRoot = fs.realpathSync(os.tmpdir());
const compiledDir = fs.mkdtempSync(path.join(tempRoot, "vega-streamcenter-test-"));
const load = (moduleName) => require(path.join(compiledDir, moduleName));
execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "--outDir", compiledDir], {
  cwd: path.join(__dirname, ".."),
  stdio: "pipe",
});

const routing = load("streamcenter/routing.js");
const animeEpisodes = load("animeunity/episodes.js");
const streamingEpisodes = load("streamingunity/episodes.js");
const animeStream = load("animeunity/stream.js");
const streamingStream = load("streamingunity/stream.js");
const fallbacks = load("streamcenter/animeFallback/index.js");
const animeWorld = load("streamcenter/animeFallback/animeWorld.js");
const animeSaturn = load("streamcenter/animeFallback/animeSaturn.js");
const streamcenterEpisodes = load("streamcenter/episodes.js");
const streamcenterStream = load("streamcenter/stream.js");

const originals = {
  animeGetEpisodes: animeEpisodes.getEpisodes,
  animeGetInventory: animeEpisodes.getEpisodeInventory,
  streamingGetEpisodes: streamingEpisodes.getEpisodes,
  animeGetStream: animeStream.getStream,
  streamingGetStream: streamingStream.getStream,
  discover: fallbacks.discoverAnimeFallbackEpisodes,
  resolve: fallbacks.resolveAnimeFallbackStream,
  discoverWorld: animeWorld.discoverAnimeWorldEpisodes,
  discoverSaturn: animeSaturn.discoverAnimeSaturnEpisodes,
};

const animeEpisode = {title: "Episodio 6", episodeNumber: 6, link: "anime-episode-6"};
const fallback = {
  source: "animeworld",
  label: "SUB",
  pageUrl: "https://example.test/anime",
  episodeToken: "token-6",
};
const identity = {
  url: "anime-season",
  title: "Example anime",
  anilistId: 21,
  malId: 44,
  dubbed: false,
};

(async () => {
  let discoveryCalls = 0;
  let sourceKnown;
  animeEpisodes.getEpisodes = async ({knownEpisodes}) => {
    sourceKnown = knownEpisodes;
    return [animeEpisode];
  };
  animeEpisodes.getEpisodeInventory = async () => ({
    complete: true,
    episodes: [animeEpisode],
  });
  fallbacks.discoverAnimeFallbackEpisodes = async (receivedIdentity, _context, signal) => {
    discoveryCalls += 1;
    assert.strictEqual(receivedIdentity.title, identity.title);
    assert.strictEqual(receivedIdentity.anilistId, identity.anilistId);
    assert.strictEqual(receivedIdentity.malId, identity.malId);
    assert.strictEqual(receivedIdentity.dubbed, identity.dubbed);
    assert(signal instanceof AbortSignal);
    return new Map([["6", [fallback]]]);
  };
  fallbacks.resolveAnimeFallbackStream = async () => [
    {server: "AnimeWorld", link: "https://example.test/fallback.m3u8"},
  ];
  animeStream.getStream = async ({link}) => {
    assert.strictEqual(link, animeEpisode.link);
    return [{server: "AnimeUnity", link: "https://example.test/primary.m3u8"}];
  };

  const route = routing.encodeRoute("episodes", "animeunity", identity);
  const episodes = await streamcenterEpisodes.getEpisodes({
    url: route,
    providerContext: {},
  });
  assert.strictEqual(discoveryCalls, 0, "listing episodes must not search fallback sites");
  assert.strictEqual(episodes.length, 1);
  const decoded = routing.decodeRoute(episodes[0].link, "stream");
  assert.strictEqual(decoded.source, "animeunity");
  assert.deepStrictEqual(decoded.data, {
    url: animeEpisode.link,
    title: identity.title,
    anilistId: identity.anilistId,
    malId: identity.malId,
    dubbed: identity.dubbed,
    episodeNumber: 6,
  });

  const inventory = await streamcenterEpisodes.getEpisodeInventory({
    url: route,
    providerContext: {},
  });
  assert.strictEqual(discoveryCalls, 0, "inventory must remain lightweight");
  assert.strictEqual(
    routing.decodeRoute(inventory.episodes[0].link, "stream").data.episodeNumber,
    6,
  );

  const controller = new AbortController();
  const streams = await streamcenterStream.getStream({
    link: episodes[0].link,
    type: "series",
    signal: controller.signal,
    providerContext: {},
  });
  assert.strictEqual(discoveryCalls, 1, "fallback search must run on playback");
  assert.deepStrictEqual(streams.map(item => item.server), ["AnimeUnity", "AnimeWorld"]);

  const legacyLink = routing.encodeRoute("stream", "animeunity", {
    url: animeEpisode.link,
    fallbacks: [fallback],
  });
  const legacyStreams = await streamcenterStream.getStream({
    link: legacyLink,
    type: "series",
    signal: controller.signal,
    providerContext: {},
  });
  assert.strictEqual(discoveryCalls, 1, "saved links must use their embedded fallbacks");
  assert.deepStrictEqual(legacyStreams.map(item => item.server), ["AnimeUnity", "AnimeWorld"]);

  fallbacks.discoverAnimeFallbackEpisodes = async () => {
    discoveryCalls += 1;
    throw new Error("Fallback site unavailable");
  };
  const primaryOnly = await streamcenterStream.getStream({
    link: episodes[0].link,
    type: "series",
    signal: controller.signal,
    providerContext: {},
  });
  assert.deepStrictEqual(primaryOnly.map(item => item.server), ["AnimeUnity"]);
  assert.strictEqual(discoveryCalls, 2);
  const cancelled = new AbortController();
  cancelled.abort();
  assert.deepStrictEqual(await streamcenterStream.getStream({
    link: episodes[0].link,
    type: "series",
    signal: cancelled.signal,
    providerContext: {},
  }), []);

  animeWorld.discoverAnimeWorldEpisodes = async () => new Promise(() => {});
  animeSaturn.discoverAnimeSaturnEpisodes = async () => new Promise(() => {});
  const pendingAbort = new AbortController();
  const pendingDiscovery = originals.discover(identity, {}, pendingAbort.signal);
  pendingAbort.abort();
  assert.strictEqual((await pendingDiscovery).size, 0, "cancelled discovery must finish promptly");

  const oldKnown = [{...animeEpisode, link: legacyLink}];
  await streamcenterEpisodes.getEpisodes({
    url: route,
    providerContext: {},
    knownEpisodes: oldKnown,
  });
  assert.strictEqual(sourceKnown[0].link, animeEpisode.link);

  streamingEpisodes.getEpisodes = async () => [
    {title: "Episode 1", episodeNumber: 1, link: "streaming-episode-1"},
  ];
  streamingStream.getStream = async () => [
    {server: "StreamingUnity", link: "https://example.test/streaming.m3u8"},
  ];
  const streamingRoute = routing.encodeRoute("episodes", "streamingunity", {
    url: "streaming-season",
  });
  const streamingList = await streamcenterEpisodes.getEpisodes({
    url: streamingRoute,
    providerContext: {},
  });
  const streamingResult = await streamcenterStream.getStream({
    link: streamingList[0].link,
    type: "series",
    signal: controller.signal,
    providerContext: {},
  });
  assert.strictEqual(discoveryCalls, 2, "StreamingUnity must not search anime fallback sites");
  assert.strictEqual(streamingResult[0].server, "StreamingUnity");

  console.log("StreamCenter lazy fallback and saved-link compatibility passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  animeEpisodes.getEpisodes = originals.animeGetEpisodes;
  animeEpisodes.getEpisodeInventory = originals.animeGetInventory;
  streamingEpisodes.getEpisodes = originals.streamingGetEpisodes;
  animeStream.getStream = originals.animeGetStream;
  streamingStream.getStream = originals.streamingGetStream;
  fallbacks.discoverAnimeFallbackEpisodes = originals.discover;
  fallbacks.resolveAnimeFallbackStream = originals.resolve;
  animeWorld.discoverAnimeWorldEpisodes = originals.discoverWorld;
  animeSaturn.discoverAnimeSaturnEpisodes = originals.discoverSaturn;
  if (!path.resolve(compiledDir).startsWith(tempRoot + path.sep)) {
    throw new Error("Unexpected temporary compiler directory");
  }
  fs.rmSync(compiledDir, {recursive: true, force: true});
});
