const assert = require("assert");
const {
  buildAnimeVariantKey,
  deduplicateAnimeVariantPosts,
  normalizeAnimeVariantTitle,
  stripAnimeDubSuffix,
} = require("../dist/animeunity/variants.js");

const makePost = (id, title, episode) => ({
  title,
  image: `https://img.test/${id}.jpg`,
  link: `https://animeunity.test/anime/${id}`,
  episodeLabel: episode ? `Ep. ${episode}` : undefined,
  episodeLabelKey: episode ? "Ep. {{number}}" : undefined,
  episodeLabelParams: episode ? { number: episode } : undefined,
  episodeId: episode ? `${id}-${episode}` : undefined,
});

assert.strictEqual(stripAnimeDubSuffix("Naruto (ITA)"), "Naruto");
assert.strictEqual(normalizeAnimeVariantTitle("Pokémon (ITA)"), "pokemon");
assert.strictEqual(buildAnimeVariantKey({ anilist_id: 20 }), "anilist:20");
assert.strictEqual(buildAnimeVariantKey({ mal_id: 21 }), "mal:21");

const posts = deduplicateAnimeVariantPosts([
  {
    anime: { id: 2, title: "Naruto (ITA)", dub: 1, anilist_id: 20, episodes_count: 100 },
    post: makePost(2, "Naruto (ITA)", 100),
  },
  {
    anime: { id: 1, title: "Naruto", dub: 0, anilist_id: 20, episodes_count: 90 },
    post: makePost(1, "Naruto", 90),
  },
  {
    anime: { id: 3, title: "Bleach", dub: 0, mal_id: 269, episodes_count: 366 },
    post: makePost(3, "Bleach", 366),
  },
]);

assert.strictEqual(posts.length, 2);
assert.strictEqual(posts[0].title, "Naruto");
assert.strictEqual(posts[0].link, "https://animeunity.test/anime/1");
assert.strictEqual(posts[0].dubStatus, "both");
assert.strictEqual(posts[0].dubStatusKey, "Subbed and dubbed");
assert.strictEqual(posts[0].episodeLabel, "Ep. 100");
assert.strictEqual(posts[1].dubStatus, "subbed");

console.log("animeunity variants: OK");
