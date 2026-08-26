const assert = require("assert");
const cheerio = require("cheerio");

const metaModule = require("../dist/streamingunity/meta.js");

const BASE_URL = "https://streamingunity.test";

const inertiaHtml = (props) => {
  const encoded = JSON.stringify({ props })
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
  return `<div id="app" data-page="${encoded}"></div>`;
};

const buildTitle = (id, overrides = {}) => ({
  id,
  name: `Availability fixture ${id}`,
  slug: `availability-fixture-${id}`,
  plot: "Fixture plot",
  type: "movie",
  status: "Released",
  coming_soon: false,
  release_date: "2000-01-01",
  release_date_it: "2000-01-01",
  imdb_id: `tt00000${id}`,
  tmdb_id: id,
  translations: [],
  images: [],
  genres: [],
  keywords: [],
  main_actors: [],
  main_directors: [],
  ...overrides,
});

const createContext = ({ title, playable = false }) => {
  const requests = [];
  const axios = {
    get: async (url) => {
      requests.push(url);
      if (url.includes("/it/titles/")) {
        return { data: inertiaHtml({ title, loadedSeason: null, sliders: [] }) };
      }
      if (url.includes("/it/watch/")) {
        return {
          data: inertiaHtml({
            embedUrl: `${BASE_URL}/it/iframe/${title.id}`,
          }),
        };
      }
      if (url.includes("/it/iframe/")) {
        return {
          data:
            '<iframe src="https://vixcloud.co/embed/?token=fixture-token"></iframe>',
        };
      }
      if (url.startsWith("https://vixcloud.co/embed/?token=")) {
        return {
          data: playable
            ? "window.masterPlaylist = { url: 'https://cdn.test/master.m3u8' };"
            : "<html><body>Video non disponibile</body></html>",
        };
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  };

  return {
    requests,
    providerContext: {
      axios,
      cheerio,
      commonHeaders: { "User-Agent": "AvailabilityFixture/1.0" },
      getBaseUrl: async () => BASE_URL,
    },
  };
};

const getFixtureMeta = async (title, playable = false) => {
  const context = createContext({ title, playable });
  const info = await metaModule.getMeta({
    link: `${BASE_URL}/it/titles/${title.id}-${title.slug}`,
    provider: "streamingunity",
    providerContext: context.providerContext,
  });
  return { info, requests: context.requests };
};

(async () => {
  const explicitUpcoming = await getFixtureMeta(
    buildTitle(1, { status: "Released", coming_soon: true }),
  );
  assert.strictEqual(
    explicitUpcoming.info.linkList[0].availabilityStatus,
    "upcoming",
  );
  assert.strictEqual(explicitUpcoming.info.linkList[0].availabilityDate, undefined);
  assert.strictEqual(explicitUpcoming.info.linkList[0].directLinks, undefined);
  assert.strictEqual(
    explicitUpcoming.requests.some((url) => url.includes("/it/watch/")),
    false,
    "coming_soon must be authoritative and skip availability probing",
  );

  const futureUpcoming = await getFixtureMeta(
    buildTitle(5, {
      status: "Released",
      coming_soon: "1",
      release_date: "2999-01-01",
      release_date_it: "2999-01-01",
    }),
  );
  assert.strictEqual(futureUpcoming.info.linkList[0].availabilityStatus, "upcoming");
  assert.strictEqual(
    futureUpcoming.info.linkList[0].availabilityDate,
    "2999-01-01",
  );
  assert.strictEqual(futureUpcoming.info.linkList[0].directLinks, undefined);

  const unavailableProbe = await getFixtureMeta(
    buildTitle(2, { status: "Post Production" }),
    false,
  );
  assert.strictEqual(
    unavailableProbe.info.linkList[0].availabilityStatus,
    "upcoming",
  );
  assert.strictEqual(unavailableProbe.info.linkList[0].availabilityDate, undefined);
  assert.strictEqual(unavailableProbe.info.linkList[0].directLinks, undefined);
  assert(
    unavailableProbe.requests.some((url) =>
      url.startsWith("https://vixcloud.co/embed/?token="),
    ),
    "token-based VixCloud embeds must be probed",
  );

  const playableProbe = await getFixtureMeta(
    buildTitle(3, { status: "Post Production" }),
    true,
  );
  assert.strictEqual(playableProbe.info.linkList[0].availabilityStatus, "available");
  assert.strictEqual(playableProbe.info.linkList[0].directLinks.length, 1);

  const released = await getFixtureMeta(buildTitle(4));
  assert.strictEqual(released.info.linkList[0].availabilityStatus, "available");
  assert.strictEqual(released.info.linkList[0].directLinks.length, 1);

  const expiredSeason = await getFixtureMeta(
    buildTitle(6, {
      type: "tv",
      status: "Returning Series",
      seasons: [
        {
          id: 60,
          number: 1,
          episodes_count: 0,
          release_date: "2000-01-01",
          release_date_it: "2000-01-01",
        },
      ],
    }),
  );
  assert.strictEqual(expiredSeason.info.linkList[0].availabilityStatus, "upcoming");
  assert.strictEqual(expiredSeason.info.linkList[0].availabilityDate, undefined);
  assert.strictEqual(expiredSeason.info.linkList[0].episodesLink, undefined);

  console.log(
    JSON.stringify({
      comingSoon: "authoritative",
      expiredDate: "hidden",
      futureDate: "preserved",
      tokenEmbedProbe: "validated",
      releasedPlayback: "preserved",
      expiredSeasonDate: "hidden",
    }),
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
