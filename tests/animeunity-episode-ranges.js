const assert = require("assert");
const {
  buildEpisodeFetchRanges,
  buildEpisodeRangeLinks,
  parseEpisodeRangeRequest,
} = require("../dist/animeunity/episodeRanges.js");

assert.deepStrictEqual(parseEpisodeRangeRequest("20"), {
  animeId: 20,
  start: 1,
  end: undefined,
});
assert.deepStrictEqual(parseEpisodeRangeRequest("20|121|240"), {
  animeId: 20,
  start: 121,
  end: 240,
});
assert.strictEqual(parseEpisodeRangeRequest("invalid"), null);

const links = buildEpisodeRangeLinks(20, 250);
assert.strictEqual(links.length, 3);
assert.strictEqual(links[0].episodesLink, "20|1|120");
assert.strictEqual(links[1].episodesLink, "20|121|240");
assert.strictEqual(links[2].episodesLink, "20|241|250");
assert.strictEqual(links[2].titleKey, "Episodes {{start}}-{{end}}");

assert.deepStrictEqual(
  buildEpisodeFetchRanges({ animeId: 20, start: 121, end: 240 }, 250),
  [{ start: 121, end: 240 }]
);
assert.deepStrictEqual(
  buildEpisodeFetchRanges({ animeId: 20, start: 241, end: 250 }, 250),
  [{ start: 241, end: 280 }]
);
assert.deepStrictEqual(
  buildEpisodeFetchRanges({ animeId: 20, start: 1 }, 220),
  [
    { start: 0, end: 119 },
    { start: 120, end: 239 },
    { start: 240, end: 250 },
  ]
);

console.log("animeunity episode ranges: OK");
