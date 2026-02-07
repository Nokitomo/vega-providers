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

export const catalog = [
  {
    title: "Trending Titles",
    titleKey: "Trending Titles",
    filter: "browse/trending",
    staleTimeMs: 10 * 60 * 1000,
  },
  {
    title: "Recently Added",
    titleKey: "Recently Added",
    filter: "browse/latest",
    staleTimeMs: 10 * 60 * 1000,
  },
  {
    title: "Top 10 Titles Today",
    titleKey: "Top 10 Titles Today",
    filter: "browse/top10",
    staleTimeMs: 10 * 60 * 1000,
  },
  {
    title: "Movie",
    titleKey: "Movie",
    filter: "archive?type=movie",
    staleTimeMs: 6 * 60 * 60 * 1000,
  },
  {
    title: "TV Show",
    titleKey: "TV Show",
    filter: "archive?type=tv",
    staleTimeMs: 6 * 60 * 60 * 1000,
  },
  {
    title: "Archive",
    titleKey: "Archive",
    filter: "archive",
    staleTimeMs: 6 * 60 * 60 * 1000,
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
