const assert = require("assert");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");

const postsModule = require(path.join("..", "dist", "animeunity", "posts.js"));
const metaModule = require(path.join("..", "dist", "animeunity", "meta.js"));
const episodesModule = require(path.join("..", "dist", "animeunity", "episodes.js"));
const streamModule = require(path.join("..", "dist", "animeunity", "stream.js"));
const { getBaseUrl } = require(path.join("..", "dist", "getBaseUrl.js"));
const { hubcloudExtracter } = require(path.join("..", "dist", "hubcloudExtractor.js"));
const { gofileExtracter } = require(path.join("..", "dist", "gofileExtracter.js"));
const { superVideoExtractor } = require(path.join("..", "dist", "superVideoExtractor.js"));
const { gdFlixExtracter } = require(path.join("..", "dist", "gdFlixExtractor.js"));

const providerContext = {
  axios,
  cheerio,
  getBaseUrl,
  commonHeaders: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  },
  Aes: {},
  extractors: {
    hubcloudExtracter,
    gofileExtracter,
    superVideoExtractor,
    gdFlixExtracter,
  },
};

async function run() {
  const signal = new AbortController().signal;

  const latestPosts = await postsModule.getPosts({
    filter: "latest",
    page: 1,
    providerValue: "animeunity",
    signal,
    providerContext,
  });
  assert(Array.isArray(latestPosts), "latest posts must be an array");
  assert(latestPosts.length > 0, "latest posts must not be empty");

  const firstPost = latestPosts[0];
  assert(firstPost.link, "first post link must exist");

  const meta = await metaModule.getMeta({
    link: firstPost.link,
    providerContext,
  });
  assert(meta && meta.title, "meta title must exist");
  assert(Array.isArray(meta.linkList), "meta.linkList must be an array");

  let episodeLinks = [];
  const firstLinkList = meta.linkList[0];
  if (firstLinkList && firstLinkList.episodesLink) {
    episodeLinks = await episodesModule.getEpisodes({
      url: firstLinkList.episodesLink,
      providerContext,
    });
  }
  assert(Array.isArray(episodeLinks), "episode links must be an array");
  assert(episodeLinks.length > 0, "episode links must not be empty");

  const streamLinks = await streamModule.getStream({
    link: episodeLinks[0].link,
    type: "series",
    signal,
    providerContext,
  });
  assert(Array.isArray(streamLinks), "stream links must be an array");
  assert(streamLinks.length > 0, "stream links must not be empty");

  console.log(
    JSON.stringify(
      {
        latestCount: latestPosts.length,
        title: meta.title,
        episodesCount: episodeLinks.length,
        streamCount: streamLinks.length,
        firstStream: streamLinks[0].link,
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
