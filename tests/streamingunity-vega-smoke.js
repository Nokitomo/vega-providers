const assert = require("assert");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");

const postsModule = require(path.join("..", "dist", "streamingunity", "posts.js"));
const metaModule = require(path.join("..", "dist", "streamingunity", "meta.js"));
const episodesModule = require(path.join("..", "dist", "streamingunity", "episodes.js"));
const streamModule = require(path.join("..", "dist", "streamingunity", "stream.js"));
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
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 Edg/135.0.0.0",
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

  const trending = await postsModule.getPosts({
    filter: "browse/trending",
    page: 1,
    providerValue: "streamingunity",
    signal,
    providerContext,
  });
  assert(Array.isArray(trending) && trending.length > 0, "trending must not be empty");

  const latest = await postsModule.getPosts({
    filter: "browse/latest",
    page: 1,
    providerValue: "streamingunity",
    signal,
    providerContext,
  });
  assert(Array.isArray(latest) && latest.length > 0, "latest must not be empty");

  const top10 = await postsModule.getPosts({
    filter: "browse/top10",
    page: 1,
    providerValue: "streamingunity",
    signal,
    providerContext,
  });
  assert(Array.isArray(top10) && top10.length > 0, "top10 must not be empty");

  const upcoming = await postsModule.getPosts({
    filter: "browse/upcoming",
    page: 1,
    providerValue: "streamingunity",
    signal,
    providerContext,
  });
  assert(Array.isArray(upcoming) && upcoming.length > 0, "upcoming must not be empty");

  const genre = await postsModule.getPosts({
    filter: "browse/genre?g=Fantascienza",
    page: 1,
    providerValue: "streamingunity",
    signal,
    providerContext,
  });
  assert(Array.isArray(genre) && genre.length > 0, "genre must not be empty");

  const archive = await postsModule.getPosts({
    filter: "archive",
    page: 1,
    providerValue: "streamingunity",
    signal,
    providerContext,
  });
  assert(Array.isArray(archive) && archive.length > 0, "archive must not be empty");

  const search = await postsModule.getSearchPosts({
    searchQuery: "dark",
    page: 1,
    providerValue: "streamingunity",
    signal,
    providerContext,
  });
  assert(Array.isArray(search) && search.length > 0, "search must not be empty");

  const pagedArchive = await postsModule.getPosts({
    filter: "archive",
    page: 2,
    providerValue: "streamingunity",
    signal,
    providerContext,
  });
  assert(Array.isArray(pagedArchive) && pagedArchive.length > 0, "archive page 2 must not be empty");
  assert(
    archive[0]?.link && pagedArchive[0]?.link && archive[0].link !== pagedArchive[0].link,
    "archive page 1 and 2 should differ"
  );

  const meta = await metaModule.getMeta({
    link: search[0].link,
    providerContext,
  });
  assert(meta && meta.title, "meta title must exist");
  assert(Array.isArray(meta.linkList) && meta.linkList.length > 0, "meta.linkList must not be empty");

  const episodicLink = meta.linkList.find((entry) => entry?.episodesLink);
  assert(episodicLink?.episodesLink, "an episodic link must exist");

  const episodes = await episodesModule.getEpisodes({
    url: episodicLink.episodesLink,
    providerContext,
  });
  assert(Array.isArray(episodes) && episodes.length > 0, "episodes must not be empty");

  const streamLinks = await streamModule.getStream({
    link: episodes[0].link,
    type: "series",
    signal,
    providerContext,
  });
  assert(Array.isArray(streamLinks) && streamLinks.length > 0, "stream links must not be empty");

  console.log(
    JSON.stringify(
      {
        trending: trending.length,
        latest: latest.length,
        top10: top10.length,
        upcoming: upcoming.length,
        genre: genre.length,
        archive: archive.length,
        archivePage2: pagedArchive.length,
        search: search.length,
        metaTitle: meta.title,
        episodes: episodes.length,
        streams: streamLinks.length,
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
