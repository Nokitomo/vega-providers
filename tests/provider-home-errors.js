const assert = require("assert");
const cheerio = require("cheerio");
const { getPosts: getAnimePosts } = require("../dist/animeunity/posts.js");
const { getPosts: getStreamingPosts } = require("../dist/streamingunity/posts.js");
const { getPosts: getStreamCenterPosts } = require("../dist/streamcenter/posts.js");

const makeArgs = (filter, axios) => ({
  filter,
  page: 1,
  providerValue: "animeunity",
  signal: new AbortController().signal,
  providerContext: {
    axios,
    cheerio,
    getBaseUrl: async () => "https://www.animeunity.co",
  },
});

const networkFailure = () => Promise.reject(new Error("network unavailable"));

const makeStreamingArgs = (filter, axios) => ({
  ...makeArgs(filter, axios),
  providerValue: "streamingunity",
  providerContext: {
    axios,
    cheerio,
    commonHeaders: {},
    getBaseUrl: async () => "https://streamingunity.example",
  },
});

async function testFailuresRemainFailures() {
  for (const filter of ["latest", "calendar", "top?popular=true", "archive", "archive?random=true"]) {
    const args = makeArgs(filter, { get: networkFailure, post: networkFailure });
    await assert.rejects(getAnimePosts(args), /network unavailable|archive unavailable/);
  }

  const calendarArgs = makeArgs("calendar", { get: networkFailure, post: networkFailure });
  await assert.rejects(getStreamCenterPosts(calendarArgs), /network unavailable/);

  for (const filter of ["browse/trending", "archive", "browse/genre?g=drama"]) {
    await assert.rejects(
      getStreamingPosts(makeStreamingArgs(filter, { get: networkFailure })),
      /network unavailable/
    );
  }

  await assert.rejects(
    getStreamCenterPosts(makeArgs("archive", { get: networkFailure, post: networkFailure })),
    /network unavailable|archive unavailable/
  );
}

async function testGenuinelyEmptyResultsRemainEmpty() {
  const axios = {
    get: async () => ({ data: "<html></html>", headers: {} }),
    post: async () => ({ data: { records: [], tot: 0 } }),
  };
  for (const filter of ["latest", "calendar", "top?popular=true", "archive"]) {
    assert.deepStrictEqual(await getAnimePosts(makeArgs(filter, axios)), []);
  }

  const streamingAxios = { get: async () => ({ data: '{"titles":[]}' }) };
  for (const filter of ["browse/trending", "archive", "browse/genre?g=drama"]) {
    assert.deepStrictEqual(
      await getStreamingPosts(makeStreamingArgs(filter, streamingAxios)),
      []
    );
  }
}

async function testStreamCenterKeepsAvailableSource() {
  const context = {
    cheerio,
    commonHeaders: {},
    getBaseUrl: async name => name === "animeunity"
      ? "https://www.animeunity.co"
      : "https://streamingunity.example",
    axios: {
      get: async url => url.includes("animeunity.co")
        ? { data: "<html></html>", headers: {} }
        : { data: JSON.stringify({ titles: [{
          id: 42,
          slug: "sample",
          name: "Sample",
          images: [{ type: "poster", filename: "sample.jpg" }],
        }] }) },
      post: networkFailure,
    },
  };
  const posts = await getStreamCenterPosts({
    ...makeArgs("archive", context.axios),
    providerValue: "streamcenter",
    providerContext: context,
  });
  assert.strictEqual(posts.length, 1);
  assert.strictEqual(posts[0].title, "Sample");
}

(async () => {
  await testFailuresRemainFailures();
  await testGenuinelyEmptyResultsRemainEmpty();
  await testStreamCenterKeepsAvailableSource();
  console.log("Provider Home error handling: OK");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
