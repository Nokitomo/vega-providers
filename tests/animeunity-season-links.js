const assert = require("assert");

const { buildTmdbSeasonEpisodeLinks } = require("../dist/animeunity/seasonLinks.js");

const links = buildTmdbSeasonEpisodeLinks({
  animeId: 12,
  totalCount: 130,
  mappingResolution: {
    targets: [
      {
        provider: "tmdb_show",
        id: "37854",
        scope: "s1",
        ranges: { "1-61": "1-61" },
      },
      {
        provider: "tmdb_show",
        id: "37854",
        scope: "s2",
        ranges: { "62-77": "62-77" },
      },
      {
        provider: "tmdb_show",
        id: "999",
        scope: "s1",
        ranges: { "1": "1" },
      },
    ],
  },
});

assert.deepStrictEqual(
  links.map((item) => ({
    title: item.title,
    titleKey: item.titleKey,
    seasonNumber: item.seasonNumber,
    episodesLink: item.episodesLink,
  })),
  [
    {
      title: "Season 1",
      titleKey: "Season {{number}}",
      seasonNumber: 1,
      episodesLink: "12|1|61",
    },
    {
      title: "Season 2",
      titleKey: "Season {{number}}",
      seasonNumber: 2,
      episodesLink: "12|62|77",
    },
    {
      title: "Episodes 78-130",
      titleKey: "Episodes {{start}}-{{end}}",
      seasonNumber: undefined,
      episodesLink: "12|78|130",
    },
  ],
);

assert.deepStrictEqual(
  buildTmdbSeasonEpisodeLinks({
    animeId: 12,
    totalCount: 12,
    mappingResolution: {
      targets: [
        {
          provider: "tmdb_show",
          id: "1",
          scope: "s1",
          ranges: { "1-12": "1-12" },
        },
      ],
    },
  }),
  [],
  "single-season shows should keep the existing direct/range presentation",
);

const extendedLinks = buildTmdbSeasonEpisodeLinks({
  animeId: 12,
  totalCount: 130,
  mappingResolution: {
    ids: { tmdbShowIds: [37854] },
    targets: [
      {
        provider: "tmdb_show",
        id: "37854",
        scope: "s1",
        ranges: { "1-61": "1-61" },
      },
      {
        provider: "tmdb_show",
        id: "37854",
        scope: "s2",
        ranges: { "62-77": "62-77" },
      },
    ],
  },
  tmdbSeasons: [
    { seasonNumber: 1, episodeCount: 61, name: { value: "East Blue", language: "en-US" }, posters: [], backgrounds: [], sourceUrl: "" },
    { seasonNumber: 2, episodeCount: 16, name: { value: "Alabasta", language: "en-US" }, posters: [], backgrounds: [], sourceUrl: "" },
    { seasonNumber: 3, episodeCount: 53, name: { value: "Skypiea", language: "en-US" }, posters: [], backgrounds: [], sourceUrl: "" },
  ],
});
assert.deepStrictEqual(
  extendedLinks.map((item) => ({
    title: item.title,
    titleKey: item.titleKey,
    seasonNumber: item.seasonNumber,
    episodesLink: item.episodesLink,
  })),
  [
    { title: "East Blue", titleKey: undefined, seasonNumber: 1, episodesLink: "12|1|61" },
    { title: "Alabasta", titleKey: undefined, seasonNumber: 2, episodesLink: "12|62|77" },
    { title: "Skypiea", titleKey: undefined, seasonNumber: 3, episodesLink: "12|78|130" },
  ],
  "TMDB seasons should extend incomplete AniBridge ranges when the known ranges match"
);

const fallbackLinks = buildTmdbSeasonEpisodeLinks({
  animeId: 12,
  totalCount: 130,
  mappingResolution: {
    ids: { tmdbShowIds: [37854] },
    targets: [
      {
        provider: "tmdb_show",
        id: "37854",
        scope: "s1",
        ranges: { "1-60": "1-60" },
      },
      {
        provider: "tmdb_show",
        id: "37854",
        scope: "s2",
        ranges: { "61-77": "61-77" },
      },
    ],
  },
  tmdbSeasons: [
    { seasonNumber: 1, episodeCount: 61, posters: [], backgrounds: [], sourceUrl: "" },
    { seasonNumber: 2, episodeCount: 16, posters: [], backgrounds: [], sourceUrl: "" },
    { seasonNumber: 3, episodeCount: 53, posters: [], backgrounds: [], sourceUrl: "" },
  ],
});
assert.strictEqual(
  fallbackLinks[fallbackLinks.length - 1].titleKey,
  "Episodes {{start}}-{{end}}",
  "unsafe TMDB alignment should keep uncovered episodes visible as a generic range"
);

console.log("animeunity season links: OK");
