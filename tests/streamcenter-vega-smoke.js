const assert = require("assert");
const axios = require("axios");
const cheerio = require("cheerio");

const postsModule = require("../dist/streamcenter/posts.js");
const metaModule = require("../dist/streamcenter/meta.js");
const episodesModule = require("../dist/streamcenter/episodes.js");
const streamModule = require("../dist/streamcenter/stream.js");
const routing = require("../dist/streamcenter/routing.js");
const { getBaseUrl } = require("../dist/getBaseUrl.js");

const providerContext = {
  axios,
  cheerio,
  getBaseUrl,
  commonHeaders: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/135 Safari/537.36",
  },
  Aes: {},
  extractors: {},
};

const runPipeline = async (query, source, signal) => {
  const posts = await postsModule.getSearchPosts({
    searchQuery: query,
    page: 1,
    providerValue: "streamcenter",
    signal,
    providerContext,
  });
  const post = posts.find(
    (item) => routing.decodeRoute(item.link, "meta")?.source === source,
  );
  assert(post, `${source} search result must exist`);

  const info = await metaModule.getMeta({
    link: post.link,
    provider: "streamcenter",
    providerContext,
  });
  assert(info.title, `${source} meta title must exist`);
  const group = info.linkList.find(
    (item) => item.episodesLink || item.directLinks?.length,
  );
  assert(group, `${source} playable group must exist`);
  const episodes = group.episodesLink
    ? await episodesModule.getEpisodes({
        url: group.episodesLink,
        providerContext,
      })
    : group.directLinks;
  assert(episodes.length > 0, `${source} episodes must exist`);
  const streams = await streamModule.getStream({
    link: episodes[0].link,
    type: info.type,
    signal,
    providerContext,
  });
  assert(streams.length > 0, `${source} streams must exist`);
  return { post, info, episodes, streams };
};

(async () => {
  const signal = new AbortController().signal;
  const archive = await postsModule.getPosts({
    filter: "catalog/all?random=true",
    page: 1,
    providerValue: "streamcenter",
    signal,
    providerContext,
  });
  assert(archive.length > 0, "mixed hero archive must not be empty");

  const anime = await runPipeline("one piece", "animeunity", signal);
  const fallbackServers = new Set(
    anime.streams
      .map((stream) => stream.server)
      .filter((server) => /AnimeWorld|AnimeSaturn/.test(server)),
  );
  assert(fallbackServers.size > 0, "at least one anime fallback must resolve");

  const streaming = await runPipeline("dark", "streamingunity", signal);
  console.log(
    JSON.stringify(
      {
        archive: archive.length,
        anime: {
          title: anime.info.title,
          episodes: anime.episodes.length,
          servers: anime.streams.map((stream) => stream.server),
        },
        streaming: {
          title: streaming.info.title,
          episodes: streaming.episodes.length,
          servers: streaming.streams.map((stream) => stream.server),
        },
      },
      null,
      2,
    ),
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
