import {
  ARCHIVE_AGE_OPTIONS,
  ARCHIVE_GENRES,
  ARCHIVE_QUALITY_OPTIONS,
  ARCHIVE_SCORE_OPTIONS,
  ARCHIVE_SERVICE_OPTIONS,
  ARCHIVE_SORT_OPTIONS,
  ARCHIVE_TYPE_OPTIONS,
  ARCHIVE_VIEWS_OPTIONS,
  ARCHIVE_YEAR_OPTIONS,
} from "./filters";

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

export const catalog = [
  {
    title: "Trending Titles",
    titleKey: "Trending Titles",
    filter: "browse/trending",
    staleTimeMs: TWENTY_FOUR_HOURS_MS,
  },
  {
    title: "Recently Added",
    titleKey: "Recently Added",
    filter: "browse/latest",
    staleTimeMs: TWENTY_FOUR_HOURS_MS,
  },
  {
    title: "Top 10 Titles Today",
    titleKey: "Top 10 Titles Today",
    filter: "browse/top10",
    staleTimeMs: TWELVE_HOURS_MS,
  },
  {
    title: "In arrivo",
    titleKey: "StreamingUnity In Arrivo",
    filter: "browse/upcoming",
    staleTimeMs: TWENTY_FOUR_HOURS_MS,
  },
  {
    title: "Korean drama",
    titleKey: "StreamingUnity Korean Drama",
    filter: "browse/genre?g=Korean%20drama",
    staleTimeMs: FORTY_EIGHT_HOURS_MS,
  },
  {
    title: "televisione film",
    titleKey: "StreamingUnity Televisione Film",
    filter: "browse/genre?g=televisione%20film",
    staleTimeMs: FORTY_EIGHT_HOURS_MS,
  },
  {
    title: "musica",
    titleKey: "StreamingUnity Musica",
    filter: "browse/genre?g=Musica",
    staleTimeMs: FORTY_EIGHT_HOURS_MS,
  },
  {
    title: "romance",
    titleKey: "StreamingUnity Romance",
    filter: "browse/genre?g=Romance",
    staleTimeMs: FORTY_EIGHT_HOURS_MS,
  },
  {
    title: "soap",
    titleKey: "StreamingUnity Soap",
    filter: "browse/genre?g=Soap",
    staleTimeMs: FORTY_EIGHT_HOURS_MS,
  },
  {
    title: "dramma",
    titleKey: "StreamingUnity Dramma",
    filter: "browse/genre?g=Dramma",
    staleTimeMs: FORTY_EIGHT_HOURS_MS,
  },
  {
    title: "crime",
    titleKey: "StreamingUnity Crime",
    filter: "browse/genre?g=Crime",
    staleTimeMs: FORTY_EIGHT_HOURS_MS,
  },
  {
    title: "fantascienza",
    titleKey: "StreamingUnity Fantascienza",
    filter: "browse/genre?g=Fantascienza",
    staleTimeMs: FORTY_EIGHT_HOURS_MS,
  },
  {
    title: "fantasy",
    titleKey: "StreamingUnity Fantasy",
    filter: "browse/genre?g=Fantasy",
    staleTimeMs: FORTY_EIGHT_HOURS_MS,
  },
  {
    title: "reality",
    titleKey: "StreamingUnity Reality",
    filter: "browse/genre?g=Reality",
    staleTimeMs: FORTY_EIGHT_HOURS_MS,
  },
  {
    title: "documentario",
    titleKey: "StreamingUnity Documentario",
    filter: "browse/genre?g=Documentario",
    staleTimeMs: FORTY_EIGHT_HOURS_MS,
  },
  {
    title: "famiglia",
    titleKey: "StreamingUnity Famiglia",
    filter: "browse/genre?g=Famiglia",
    staleTimeMs: FORTY_EIGHT_HOURS_MS,
  },
  {
    title: "western",
    titleKey: "StreamingUnity Western",
    filter: "browse/genre?g=Western",
    staleTimeMs: FORTY_EIGHT_HOURS_MS,
  },
  {
    title: "commedia",
    titleKey: "StreamingUnity Commedia",
    filter: "browse/genre?g=Commedia",
    staleTimeMs: FORTY_EIGHT_HOURS_MS,
  },
  {
    title: "action & adventure",
    titleKey: "StreamingUnity Action & Adventure",
    filter: "browse/genre?g=Action%20%26%20Adventure",
    staleTimeMs: FORTY_EIGHT_HOURS_MS,
  },
  {
    title: "thriller",
    titleKey: "StreamingUnity Thriller",
    filter: "browse/genre?g=Thriller",
    staleTimeMs: FORTY_EIGHT_HOURS_MS,
  },
  {
    title: "guerra",
    titleKey: "StreamingUnity Guerra",
    filter: "browse/genre?g=Guerra",
    staleTimeMs: FORTY_EIGHT_HOURS_MS,
  },
  {
    title: "avventura",
    titleKey: "StreamingUnity Avventura",
    filter: "browse/genre?g=Avventura",
    staleTimeMs: FORTY_EIGHT_HOURS_MS,
  },
  {
    title: "kids",
    titleKey: "StreamingUnity Kids",
    filter: "browse/genre?g=Kids",
    staleTimeMs: FORTY_EIGHT_HOURS_MS,
  },
  {
    title: "mistero",
    titleKey: "StreamingUnity Mistero",
    filter: "browse/genre?g=Mistero",
    staleTimeMs: FORTY_EIGHT_HOURS_MS,
  },
  {
    title: "storia",
    titleKey: "StreamingUnity Storia",
    filter: "browse/genre?g=Storia",
    staleTimeMs: FORTY_EIGHT_HOURS_MS,
  },
  {
    title: "azione",
    titleKey: "StreamingUnity Azione",
    filter: "browse/genre?g=Azione",
    staleTimeMs: FORTY_EIGHT_HOURS_MS,
  },
  {
    title: "sci-fi & fantasy",
    titleKey: "StreamingUnity Sci-Fi & Fantasy",
    filter: "browse/genre?g=Sci-Fi%20%26%20Fantasy",
    staleTimeMs: FORTY_EIGHT_HOURS_MS,
  },
  {
    title: "animazione",
    titleKey: "StreamingUnity Animazione",
    filter: "browse/genre?g=Animazione",
    staleTimeMs: FORTY_EIGHT_HOURS_MS,
  },
  {
    title: "horror",
    titleKey: "StreamingUnity Horror",
    filter: "browse/genre?g=Horror",
    staleTimeMs: FORTY_EIGHT_HOURS_MS,
  },
  {
    title: "war & politics",
    titleKey: "StreamingUnity War & Politics",
    filter: "browse/genre?g=War%20%26%20Politics",
    staleTimeMs: FORTY_EIGHT_HOURS_MS,
  },
  {
    title: "Movie",
    titleKey: "Movie",
    filter: "archive?type=movie",
    staleTimeMs: FORTY_EIGHT_HOURS_MS,
  },
  {
    title: "TV Show",
    titleKey: "TV Show",
    filter: "archive?type=tv",
    staleTimeMs: FORTY_EIGHT_HOURS_MS,
  },
  {
    title: "Archive",
    titleKey: "Archive",
    filter: "archive",
    staleTimeMs: FORTY_EIGHT_HOURS_MS,
  },
];

export const genres = ARCHIVE_GENRES.map((genre) => ({
  title: genre.title,
  titleKey: genre.titleKey,
  filter: `archive?genre[]=${genre.id}`,
}));

export const archiveFilters = {
  title: { key: "title", type: "text", title: "Title", titleKey: "Title" },
  year: {
    key: "year",
    type: "number",
    values: ARCHIVE_YEAR_OPTIONS.map((option) => option.value),
  },
  sort: ARCHIVE_SORT_OPTIONS,
  type: ARCHIVE_TYPE_OPTIONS,
  genres: ARCHIVE_GENRES,
  score: ARCHIVE_SCORE_OPTIONS,
  views: ARCHIVE_VIEWS_OPTIONS,
  service: ARCHIVE_SERVICE_OPTIONS,
  quality: ARCHIVE_QUALITY_OPTIONS,
  age: ARCHIVE_AGE_OPTIONS,
};
