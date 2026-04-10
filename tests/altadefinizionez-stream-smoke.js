const assert = require("assert");
const axios = require("axios");
const cheerio = require("cheerio");

const { getBaseUrl } = require("../dist/getBaseUrl.js");
const { hubcloudExtracter } = require("../dist/hubcloudExtractor.js");
const { gofileExtracter } = require("../dist/gofileExtracter.js");
const { superVideoExtractor } = require("../dist/superVideoExtractor.js");
const { gdFlixExtracter } = require("../dist/gdFlixExtractor.js");

const postsModule = require("../dist/altadefinizionez/posts.js");
const metaModule = require("../dist/altadefinizionez/meta.js");
const streamModule = require("../dist/altadefinizionez/stream.js");

const providerContext = {
  axios,
  cheerio,
  getBaseUrl,
  commonHeaders: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  },
  extractors: {
    hubcloudExtracter,
    gofileExtracter,
    superVideoExtractor,
    gdFlixExtracter,
  },
  Crypto: {},
};

function assertStreamShape(stream) {
  assert.ok(typeof stream.server === "string" && stream.server.trim().length > 0);
  assert.ok(typeof stream.link === "string" && /^https?:\/\//i.test(stream.link));
  assert.ok(stream.type === "m3u8" || stream.type === "mp4");

  const server = stream.server || "";
  if (
    server.startsWith("Server 1") ||
    server.startsWith("Mixdrop") ||
    server.startsWith("Dropload") ||
    server.startsWith("StreamHG")
  ) {
    assert.ok(stream.headers && typeof stream.headers === "object");
    assert.ok(typeof stream.headers.Referer === "string" && stream.headers.Referer);
    assert.ok(typeof stream.headers.Origin === "string" && stream.headers.Origin);
  }

  if (Array.isArray(stream.subtitles)) {
    for (const subtitle of stream.subtitles) {
      assert.ok(typeof subtitle.uri === "string" && /^https?:\/\//i.test(subtitle.uri));
      assert.ok(typeof subtitle.language === "string" && subtitle.language);
    }
  }
}

async function run() {
  const signal = new AbortController().signal;
  const posts = await postsModule.getPosts({
    filter: "film?tipo=1",
    page: 1,
    providerValue: "altadefinizionez",
    signal,
    providerContext,
  });

  assert.ok(Array.isArray(posts) && posts.length > 0, "Nessun post film disponibile");

  const candidates = posts.slice(0, 5);
  let successCount = 0;

  for (const post of candidates) {
    const meta = await metaModule.getMeta({
      link: post.link,
      providerContext,
    });
    const playable = (meta.linkList || []).flatMap((item) => item.directLinks || [])[0];
    if (!playable || !playable.link) {
      continue;
    }

    const streams = await streamModule.getStream({
      link: playable.link,
      type: playable.type || "movie",
      signal,
      providerContext,
    });

    if (!Array.isArray(streams) || streams.length === 0) {
      continue;
    }

    successCount += 1;
    const seenServers = new Set();
    for (const stream of streams) {
      assertStreamShape(stream);
      assert.ok(!seenServers.has(stream.server), "Server duplicato nello stesso risultato");
      seenServers.add(stream.server);
    }
  }

  assert.ok(successCount > 0, "Nessun caso valido con stream disponibili nel campione");
  console.log(`altadefinizionez smoke: OK (${successCount} casi con stream validi)`);
}

run().catch((error) => {
  console.error("altadefinizionez smoke: FAILED");
  console.error(error);
  process.exit(1);
});
