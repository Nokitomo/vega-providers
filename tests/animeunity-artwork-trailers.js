const assert = require("assert");
const { parseAniZipArtwork } = require("../dist/animeunity/artwork.js");
const { parseCinemetaMetadata } = require("../dist/animeunity/cinemeta.js");
const {
  normalizeAnimeTrailerUrl,
  resolveAnimeUnityTrailer,
} = require("../dist/animeunity/trailers.js");

assert.deepStrictEqual(
  parseAniZipArtwork({
    mappings: { imdb_id: "TT1234567" },
    images: [
      { coverType: "Poster", url: "https://img.test/poster.jpg" },
      { coverType: "Fanart", url: "https://img.test/background.jpg" },
      { coverType: "Clearlogo", url: "https://img.test/logo.png" },
      { coverType: "Logo", url: "http://unsafe.test/logo.png" },
    ],
  }),
  {
    imdbId: "tt1234567",
    logo: "https://img.test/logo.png",
    poster: "https://img.test/poster.jpg",
    background: "https://img.test/background.jpg",
  }
);

assert.deepStrictEqual(
  parseCinemetaMetadata({
    meta: {
      name: "  Naruto  ",
      logo: "https://img.test/logo.png",
      poster: "https://img.test/poster.jpg",
      background: "javascript:alert(1)",
    },
  }),
  {
    title: "Naruto",
    logo: "https://img.test/logo.png",
    poster: "https://img.test/poster.jpg",
    background: undefined,
  }
);

assert.strictEqual(
  normalizeAnimeTrailerUrl({ site: "youtube", id: "abc123" }),
  "https://www.youtube.com/watch?v=abc123"
);
assert.strictEqual(
  normalizeAnimeTrailerUrl({ embed_url: "https://www.youtube.com/embed/xyz789?x=1" }),
  "https://www.youtube.com/watch?v=xyz789"
);

const fallbackAxios = {
  post: async () => {
    throw new Error("AniList unavailable");
  },
  get: async () => ({
    data: { data: { trailer: { youtube_id: "jikan123" } } },
  }),
};

resolveAnimeUnityTrailer({
  axios: fallbackAxios,
  anilistId: 999001,
  malId: 999002,
}).then((trailer) => {
  assert.strictEqual(trailer, "https://www.youtube.com/watch?v=jikan123");
  console.log("animeunity artwork trailers: OK");
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
