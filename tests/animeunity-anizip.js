const assert = require("assert");
const cheerio = require("cheerio");
const {
  parseAniZipMetadata,
  resolveAniZipArtwork,
  resolveAniZipEpisodeFallbacks,
} = require("../dist/animeunity/anizip/index.js");
const { getEpisodes } = require("../dist/animeunity/episodes.js");
const {
  ANIBRIDGE_MAPPINGS_URL,
} = require("../dist/animeunity/mappings/index.js");

const aniZipPayload = {
  mappings: { imdb_id: "TT1234567", thetvdb_id: 777 },
  images: [
    { coverType: "Banner", url: "https://img.test/banner.jpg" },
    { coverType: "Fanart", url: "https://img.test/fanart.jpg" },
    { coverType: "Clearlogo", url: "https://img.test/logo.png" },
    { coverType: "Poster", url: "https://img.test/poster.jpg" },
  ],
  episodes: {
    1: {
      tvdbShowId: 777,
      seasonNumber: 2,
      episodeNumber: 1,
      absoluteEpisodeNumber: 13,
      title: { it: "Titolo italiano", en: "English title" },
      overview: "English overview",
      summary: "Wrong summary\nSource: Crunchyroll",
      image: "https://img.test/episode-1.jpg",
    },
  },
};

const parsed = parseAniZipMetadata(aniZipPayload);
assert.strictEqual(parsed.imdbId, "tt1234567");
assert.strictEqual(parsed.artwork.fanart, "https://img.test/fanart.jpg");
assert.strictEqual(parsed.artwork.banner, "https://img.test/banner.jpg");
assert.strictEqual(parsed.artwork.logo, "https://img.test/logo.png");
assert.strictEqual(parsed.episodes[0].titleIt, "Titolo italiano");
assert.strictEqual(parsed.episodes[0].overview, "English overview");
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(parsed.episodes[0], "summary"),
  false,
  "AniZip summary must never enter normalized metadata"
);

const iconOnlyPayload = {
  images: [
    {
      coverType: "Clearlogo",
      url: "https://artworks.thetvdb.com/banners/v4/series/463051/icons/680e1e4070eb5.png",
    },
    {
      coverType: "Poster",
      url: "https://artworks.thetvdb.com/banners/v4/series/463051/posters/680e1e60858db.jpg",
    },
  ],
};
const iconOnly = parseAniZipMetadata(iconOnlyPayload);
assert.strictEqual(
  iconOnly.artwork.logo,
  undefined,
  "TVDB icon artwork must not be treated as a clear logo"
);

const createCache = () => {
  const values = new Map();
  return {
    getString: (key) => values.get(key),
    setString: (key, value) => values.set(key, value),
    delete: (key) => values.delete(key),
  };
};

const tmdbDetails = `<!doctype html><html><head><title>The Movie Database</title></head>
  <body><section class="facts left_column"><p><strong>Original Language</strong> Japanese</p></section></body></html>`;
const tmdbEpisode = ({ complete }) => `<!doctype html><html><head><title>The Movie Database</title></head><body>
  <div class="episode_list"><div class="card" data-object-id="episode-1">
    ${complete ? '<img class="backdrop" src="https://media.themoviedb.org/t/p/w500/tmdb-episode.jpg">' : ""}
    <a data-episode-number="1" data-episode-id="episode-1"></a>
    <div class="episode_title"><h3><a>${complete ? "Titolo TMDB" : ""}</a></h3></div>
    <div class="overview"><p>${complete ? "Sinossi TMDB" : ""}</p></div>
  </div></div></body></html>`;

function mappingPayload(anilistId, tmdbId) {
  return {
    $meta: { schema_version: "3.0.3" },
    [`anilist:${anilistId}`]: {
      [`tmdb_show:${tmdbId}:s2`]: { "1": "1" },
      "tvdb_show:777:s2": { "1": "1" },
    },
  };
}

function createEpisodeContext({ anilistId, tmdbId, complete }) {
  const calls = [];
  const context = {
    cheerio,
    cache: createCache(),
    getBaseUrl: async () => "https://anime.test",
    axios: {
      get: async (url) => {
        calls.push(url);
        if (url === "https://anime.test/info_api/99/") {
          return { data: { episodes_count: 1, anilist_id: anilistId } };
        }
        if (url === ANIBRIDGE_MAPPINGS_URL) {
          return { data: mappingPayload(anilistId, tmdbId) };
        }
        if (url.includes("/info_api/99/1?start_range=0&end_range=31")) {
          return { data: { episodes: [{ id: 9001, number: "1" }] } };
        }
        if (url.startsWith(`https://www.themoviedb.org/tv/${tmdbId}/season/2?`)) {
          return { data: tmdbEpisode({ complete }) };
        }
        if (url.startsWith(`https://www.themoviedb.org/tv/${tmdbId}?`)) {
          return { data: tmdbDetails };
        }
        if (url.startsWith("https://api.ani.zip/mappings?")) {
          return { data: aniZipPayload };
        }
        throw new Error(`Unexpected URL: ${url}`);
      },
    },
  };
  return { context, calls };
}

(async () => {
  let directCalls = 0;
  const directContext = {
    cache: createCache(),
    axios: {
      get: async () => {
        directCalls += 1;
        return { data: aniZipPayload };
      },
    },
  };
  const requests = [
    {
      sourceEpisodeNumber: 1,
      seasonNumber: 2,
      externalMappings: [
        {
          provider: "tvdb_show",
          id: "777",
          seasonNumber: 2,
          episodeNumbers: [1],
        },
      ],
    },
  ];
  const fallbacks = await resolveAniZipEpisodeFallbacks({
    providerContext: directContext,
    anilistId: 100,
    sourceRevision: "12",
    requests,
  });
  assert.deepStrictEqual(fallbacks[0], {
    title: "Titolo italiano",
    synopsis: "English overview",
    thumbnail: "https://img.test/episode-1.jpg",
  });
  await resolveAniZipArtwork({
    providerContext: directContext,
    anilistId: 100,
  });
  assert.strictEqual(directCalls, 1, "artwork and episodes must share the cache");
  await resolveAniZipEpisodeFallbacks({
    providerContext: directContext,
    anilistId: 100,
    sourceRevision: "13",
    requests,
  });
  assert.strictEqual(directCalls, 2, "a changed source revision must refresh AniZip");

  const complete = createEpisodeContext({
    anilistId: 1001,
    tmdbId: 5001,
    complete: true,
  });
  const completeEpisodes = await getEpisodes({
    url: "99|1|1",
    providerContext: complete.context,
  });
  assert.strictEqual(completeEpisodes[0].title, "Titolo TMDB");
  assert.strictEqual(completeEpisodes[0].synopsis, "Sinossi TMDB");
  assert.strictEqual(
    complete.calls.some((url) => url.startsWith("https://api.ani.zip/")),
    false,
    "AniZip must not be requested when TMDB has every episode field"
  );

  const partial = createEpisodeContext({
    anilistId: 1002,
    tmdbId: 5002,
    complete: false,
  });
  const partialEpisodes = await getEpisodes({
    url: "99|1|1",
    providerContext: partial.context,
  });
  assert.strictEqual(partialEpisodes[0].title, "Titolo italiano");
  assert.strictEqual(partialEpisodes[0].synopsis, "English overview");
  assert.strictEqual(
    partialEpisodes[0].thumbnail,
    "https://img.test/episode-1.jpg"
  );
  assert.strictEqual(
    partial.calls.filter((url) => url.startsWith("https://api.ani.zip/")).length,
    1,
    "all missing episode fields must be resolved with one AniZip request"
  );

  console.log("animeunity anizip: OK");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
