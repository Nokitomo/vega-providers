import {
  ARCHIVE_GENRES,
  ARCHIVE_ORDER_OPTIONS,
  ARCHIVE_SEASON_OPTIONS,
  ARCHIVE_STATUS_OPTIONS,
  ARCHIVE_TYPE_OPTIONS,
  ARCHIVE_YEAR_MAX_OFFSET,
  ARCHIVE_YEAR_MIN,
} from "./filters";

export const catalog = [
  {
    title: "Latest Episodes",
    filter: "latest",
  },
  {
    title: "Top Anime",
    filter: "archive?order=rating",
  },
  {
    title: "Calendar",
    filter: "calendar",
  },
  {
    title: "Archive",
    filter: "archive",
  },
];

const buildArchiveYears = (): number[] => {
  const maxYear = new Date().getFullYear() + ARCHIVE_YEAR_MAX_OFFSET;
  const years: number[] = [];
  for (let year = maxYear; year >= ARCHIVE_YEAR_MIN; year -= 1) {
    years.push(year);
  }
  return years;
};

export const genres = ARCHIVE_GENRES.map((genre) => ({
  title: genre.name,
  filter: `archive?genres=${genre.id}`,
}));

export const archiveFilters = {
  title: { key: "title", type: "text", title: "Title" },
  year: {
    key: "year",
    type: "number",
    min: ARCHIVE_YEAR_MIN,
    maxOffset: ARCHIVE_YEAR_MAX_OFFSET,
    values: buildArchiveYears(),
  },
  order: ARCHIVE_ORDER_OPTIONS,
  status: ARCHIVE_STATUS_OPTIONS,
  type: ARCHIVE_TYPE_OPTIONS,
  season: ARCHIVE_SEASON_OPTIONS,
  genres: ARCHIVE_GENRES,
  dubbed: { key: "dubbed", type: "boolean", title: "Dubbed", value: "true" },
};
