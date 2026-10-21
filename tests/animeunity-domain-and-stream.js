const assert = require("assert");

async function testBaseUrl() {
  const originalFetch = global.fetch;
  try {
    const calls = [];
    global.fetch = async (url) => {
      calls.push(url);
      return url.includes("pastebin")
        ? { text: async () => "https://www.animeunity.so" }
        : { ok: true, url: "https://www.animeunity.co/" };
    };
    delete require.cache[require.resolve("../dist/getBaseUrl.js")];
    const { getBaseUrl } = require("../dist/getBaseUrl.js");
    assert.strictEqual(await getBaseUrl("animeunity"), "https://www.animeunity.co");
    assert.strictEqual(await getBaseUrl("animeunity"), "https://www.animeunity.co");
    assert.strictEqual(calls.length, 2, "the resolved host should be cached");
  } finally {
    global.fetch = originalFetch;
  }
}

async function testUnavailableOldHost() {
  const originalFetch = global.fetch;
  try {
    global.fetch = async (url) => {
      if (url.includes("pastebin")) {
        return { text: async () => "https://www.animeunity.so" };
      }
      if (url.includes("animeunity.so")) {
        throw new Error("DNS unavailable");
      }
      return { ok: true, url: "https://www.animeunity.co/" };
    };
    delete require.cache[require.resolve("../dist/getBaseUrl.js")];
    const { getBaseUrl } = require("../dist/getBaseUrl.js");
    assert.strictEqual(await getBaseUrl("animeunity"), "https://www.animeunity.co");
  } finally {
    global.fetch = originalFetch;
  }
}

async function testStreamHost(host) {
  const { getStream } = require("../dist/animeunity/stream.js");
  const embedUrl = `https://${host}/embed/123?token=test`;
  const html = `window.masterPlaylist = { url: 'https://${host}/playlist/123' };`;
  const context = {
    getBaseUrl: async () => "https://www.animeunity.co",
    axios: {
      get: async (url) =>
        url.includes("/embed-url/")
          ? { data: embedUrl, headers: {} }
          : { data: html },
    },
  };
  const streams = await getStream({
    link: "123",
    type: "series",
    signal: new AbortController().signal,
    providerContext: context,
  });
  assert.strictEqual(streams.length, 2, `${host} should expose two streams`);
  assert(streams.every((stream) => stream.link.includes(host)));
}

function testLegacyImageHost() {
  const { normalizeImageUrl } = require("../dist/animeunity/utils.js");
  assert.strictEqual(
    normalizeImageUrl("https://img.animeunity.so/anime/42.jpg"),
    "https://img.animeunity.co/anime/42.jpg"
  );
  assert.strictEqual(
    normalizeImageUrl("https://cdn.example/42.jpg"),
    "https://cdn.example/42.jpg"
  );
}

(async () => {
  await testBaseUrl();
  await testUnavailableOldHost();
  testLegacyImageHost();
  await testStreamHost("vixcloud.co");
  await testStreamHost("vixcloud.cc");
  await testStreamHost("vixcloud.example");
  console.log("AnimeUnity redirect and stream host checks passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
