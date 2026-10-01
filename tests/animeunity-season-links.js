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
      episodesLink: "12|1|61|tmdb_show%3A37854%3As1",
    },
    {
      title: "Season 2",
      titleKey: "Season {{number}}",
      seasonNumber: 2,
      episodesLink: "12|62|77|tmdb_show%3A37854%3As2",
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
    { title: "East Blue", titleKey: undefined, seasonNumber: 1, episodesLink: "12|1|61|tmdb_show%3A37854%3As1" },
    { title: "Alabasta", titleKey: undefined, seasonNumber: 2, episodesLink: "12|62|77|tmdb_show%3A37854%3As2" },
    { title: "Skypiea", titleKey: undefined, seasonNumber: 3, episodesLink: "12|78|130|tmdb_show%3A37854%3As3" },
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
        ranges: { "1-59": "1-59" },
      },
      {
        provider: "tmdb_show",
        id: "37854",
        scope: "s2",
        ranges: { "60-77": "60-77" },
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

const jujutsuSeasonTwo = buildTmdbSeasonEpisodeLinks({
  animeId: 4197,
  totalCount: 23,
  mappingResolution: {
    ids: { tmdbShowIds: [95479] },
    targets: [
      {
        provider: "tmdb_show",
        id: "95479",
        scope: "s1",
        raw: "tmdb_show:95479:s1",
        ranges: { "1-23": "25-47" },
      },
      {
        provider: "tmdb_show",
        id: "95479",
        scope: "s2",
        raw: "tmdb_show:95479:s2",
        ranges: { "1-23": "1-23" },
      },
      {
        provider: "tvdb_show",
        id: "377543",
        scope: "s2",
        raw: "tvdb_show:377543:s2",
        ranges: { "1-23": "1-23" },
      },
    ],
  },
  tmdbSeasons: [
    { seasonNumber: 1, episodeCount: 59, name: { value: "Stagione 1", language: "it-IT" }, posters: [], backgrounds: [], sourceUrl: "" },
  ],
});
assert.deepStrictEqual(
  jujutsuSeasonTwo.map((item) => ({
    seasonNumber: item.seasonNumber,
    episodesLink: item.episodesLink,
  })),
  [
    {
      seasonNumber: 1,
      episodesLink: "4197|1|23|tmdb_show%3A95479%3As1",
    },
  ],
  "overlapping absolute and season-local mappings should resolve to one canonical season"
);

const jujutsuSeasonThree = buildTmdbSeasonEpisodeLinks({
  animeId: 7209,
  totalCount: 12,
  mappingResolution: {
    ids: { tmdbShowIds: [95479] },
    targets: [
      {
        provider: "tmdb_show",
        id: "95479",
        scope: "s0",
        raw: "tmdb_show:95479:s0",
        ranges: { "1-9": "1-9" },
      },
      {
        provider: "tmdb_show",
        id: "95479",
        scope: "s1",
        raw: "tmdb_show:95479:s1",
        ranges: { "1-12": "48-59" },
      },
      {
        provider: "tvdb_show",
        id: "377543",
        scope: "s3",
        raw: "tvdb_show:377543:s3",
        ranges: { "1-12": "1-12" },
      },
    ],
  },
  tmdbSeasons: [
    { seasonNumber: 0, episodeCount: 9, name: { value: "Speciali", language: "it-IT" }, posters: [], backgrounds: [], sourceUrl: "" },
    { seasonNumber: 1, episodeCount: 59, name: { value: "Stagione 1", language: "it-IT" }, posters: [], backgrounds: [], sourceUrl: "" },
  ],
});
assert.deepStrictEqual(
  jujutsuSeasonThree.map((item) => ({
    seasonNumber: item.seasonNumber,
    episodesLink: item.episodesLink,
  })),
  [
    {
      seasonNumber: 1,
      episodesLink: "7209|1|12|tmdb_show%3A95479%3As1",
    },
  ],
  "a partial specials mapping must not override the complete regular-season mapping"
);

const onePieceLinks = buildTmdbSeasonEpisodeLinks({
  animeId: 12,
  totalCount: 1180,
  mappingResolution: {
    ids: { tmdbShowIds: [37854] },
    targets: [
      { provider: "tmdb_show", id: "37854", scope: "s1", raw: "tmdb_show:37854:s1", ranges: { "1-61": "1-61" } },
      { provider: "tmdb_show", id: "37854", scope: "s2", raw: "tmdb_show:37854:s2", ranges: { "62-77": "62-77" } },
      { provider: "tmdb_show", id: "37854", scope: "s3", raw: "tmdb_show:37854:s3", ranges: { "78-91": "78-91" } },
      { provider: "tmdb_show", id: "37854", scope: "s4", raw: "tmdb_show:37854:s4", ranges: { "92-130": "92-130" } },
      { provider: "tmdb_show", id: "37854", scope: "s5", raw: "tmdb_show:37854:s5", ranges: { "131-143": "1-13" } },
      { provider: "tmdb_show", id: "37854", scope: "s6", raw: "tmdb_show:37854:s6", ranges: { "143-195": "1-52", "144-195": "144-195" } },
      ...[
        [7, 196, 228], [8, 229, 263], [9, 264, 336], [10, 337, 381],
        [11, 382, 407], [12, 408, 421], [13, 422, 522], [14, 523, 580],
        [15, 581, 642], [16, 643, 692], [17, 693, 748], [18, 749, 803],
        [19, 804, 877], [20, 878, 891],
      ].map(([season, start, end]) => ({
        provider: "tmdb_show",
        id: "37854",
        scope: `s${season}`,
        raw: `tmdb_show:37854:s${season}`,
        ranges: { [`${start}-${end}`]: `${start}-${end}` },
      })),
      { provider: "tmdb_show", id: "37854", scope: "s21", raw: "tmdb_show:37854:s21", ranges: { "892-1088": "892-1088" } },
      { provider: "tmdb_show", id: "37854", scope: "s22", raw: "tmdb_show:37854:s22", ranges: { "1089-": "1089-" } },
    ],
  },
  tmdbSeasons: [
    { seasonNumber: 1, episodeCount: 61, name: { value: "Saga del Mare Orientale", language: "it-IT" }, posters: [], backgrounds: [], sourceUrl: "" },
    { seasonNumber: 2, episodeCount: 16, posters: [], backgrounds: [], sourceUrl: "" },
    { seasonNumber: 3, episodeCount: 14, posters: [], backgrounds: [], sourceUrl: "" },
    { seasonNumber: 4, episodeCount: 39, posters: [], backgrounds: [], sourceUrl: "" },
    { seasonNumber: 5, episodeCount: 13, name: { value: "Saga Della Nebbia Arcobaleno", language: "it-IT" }, posters: [], backgrounds: [], sourceUrl: "" },
    { seasonNumber: 6, episodeCount: 52, name: { value: "Saga dell'Isola nel Cielo", language: "it-IT" }, posters: [], backgrounds: [], sourceUrl: "" },
    ...Array.from({ length: 14 }, (_, index) => ({ seasonNumber: index + 7, episodeCount: [33, 35, 73, 45, 26, 14, 101, 58, 62, 50, 56, 55, 74, 14][index], posters: [], backgrounds: [], sourceUrl: "" })),
    { seasonNumber: 21, episodeCount: 197, name: { value: "Saga del Paese di Wa", language: "it-IT" }, posters: [], backgrounds: [], sourceUrl: "" },
    { seasonNumber: 22, episodeCount: 67, name: { value: "Saga di Egghead", language: "it-IT" }, posters: [], backgrounds: [], sourceUrl: "" },
    { seasonNumber: 23, episodeCount: 25, name: { value: "Elbaph", language: "it-IT" }, posters: [], backgrounds: [], sourceUrl: "" },
  ],
});
const onePieceBySeason = new Map(
  onePieceLinks.map((item) => [item.seasonNumber, item])
);
assert.strictEqual(
  onePieceBySeason.get(5).episodesLink,
  "12|131|143|tmdb_show%3A37854%3As5",
  "a one-episode mapping overlap must not remove the preceding season",
);
assert.strictEqual(
  onePieceBySeason.get(6).episodesLink,
  "12|144|195|tmdb_show%3A37854%3As6",
  "TMDB boundaries must correct a noisy AniBridge boundary",
);
assert.strictEqual(
  onePieceBySeason.get(22).episodesLink,
  "12|1089|1155|tmdb_show%3A37854%3As22",
  "open AniBridge ranges must stop at the matching TMDB season boundary",
);
assert.strictEqual(
  onePieceBySeason.get(23).episodesLink,
  "12|1156|1180|tmdb_show%3A37854%3As23",
  "TMDB must extend the layout beyond the last AniBridge season",
);
assert.strictEqual(
  onePieceLinks.some((item) => item.titleKey === "Episodes {{start}}-{{end}}"),
  false,
  "fully covered TMDB ranges must not leave a generic fallback season",
);

console.log("animeunity season links: OK");
