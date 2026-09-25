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
    titleKey: item.titleKey,
    seasonNumber: item.seasonNumber,
    episodesLink: item.episodesLink,
  })),
  [
    {
      titleKey: "Season {{number}}",
      seasonNumber: 1,
      episodesLink: "12|1|61",
    },
    {
      titleKey: "Season {{number}}",
      seasonNumber: 2,
      episodesLink: "12|62|77",
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

console.log("animeunity season links: OK");
