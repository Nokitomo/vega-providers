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
    titleKey: "Latest Episodes",
    filter: "latest",
  },
  {
    title: "Popular",
    titleKey: "Popular",
    filter: "top?popular=true",
  },
  {
    title: "Upcoming",
    titleKey: "Upcoming",
    filter: "top?status=upcoming",
  },
  {
    title: "Ongoing",
    titleKey: "Ongoing",
    filter: "top?status=ongoing",
  },
  {
    title: "Most Viewed",
    titleKey: "Most Viewed",
    filter: "top?order=most_viewed",
  },
  {
    title: "Favorites",
    titleKey: "Favorites",
    filter: "top?order=favorites",
  },
  {
    title: "TV",
    titleKey: "TV",
    filter: "archive?type=tv&order=rating",
  },
  {
    title: "Movie",
    titleKey: "Movie",
    filter: "archive?type=movie&order=rating",
  },
  {
    title: "Special",
    titleKey: "Special",
    filter: "archive?type=special&order=rating",
  },
  {
    title: "Calendar",
    titleKey: "Calendar",
    filter: "calendar",
  },
  {
    title: "Archive",
    titleKey: "Archive",
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
  title: { key: "title", type: "text", title: "Title", titleKey: "Title" },
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
  dubbed: {
    key: "dubbed",
    type: "boolean",
    title: "Dubbed",
    titleKey: "Dubbed",
    value: "true",
  },
};
