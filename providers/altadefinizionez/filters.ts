type ArchiveFilterOption = {
  title: string;
  titleKey?: string;
  value: string;
  providerValue: string;
};

export type ArchiveGenre = {
  id: number;
  name: string;
  title: string;
  titleKey?: string;
};

const DIACRITICS_REGEX = /[\u0300-\u036f]/g;

const normalizeKey = (value: string | null | undefined): string => {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_REGEX, "")
    .replace(/[^a-z0-9]+/g, "");
};

export const ARCHIVE_TYPE_OPTIONS: ArchiveFilterOption[] = [
  { title: "TV Show", titleKey: "TV Show", value: "series", providerValue: "2" },
  { title: "Movie", titleKey: "Movie", value: "movie", providerValue: "1" },
];

export const ARCHIVE_GENRES: ArchiveGenre[] = [
  { id: 1, name: "Azione", title: "Action", titleKey: "Action" },
  { id: 2, name: "Animazione", title: "Animation", titleKey: "Animation" },
  { id: 3, name: "Avventura", title: "Adventure", titleKey: "Adventure" },
  { id: 4, name: "Biografico", title: "Biography", titleKey: "Biography" },
  { id: 5, name: "Commedia", title: "Comedy", titleKey: "Comedy" },
  { id: 24, name: "Crime", title: "Crime", titleKey: "Crime" },
  { id: 6, name: "Documentario", title: "Documentary", titleKey: "Documentary" },
  { id: 7, name: "Drammatico", title: "Drama", titleKey: "Drama" },
  { id: 8, name: "Erotico", title: "Erotic", titleKey: "Erotic" },
  { id: 26, name: "Famiglia", title: "Family", titleKey: "Family" },
  {
    id: 9,
    name: "Fantascienza",
    title: "Science Fiction",
    titleKey: "Science Fiction",
  },
  { id: 10, name: "Fantasy", title: "Fantasy", titleKey: "Fantasy" },
  { id: 11, name: "Giallo", title: "Mystery", titleKey: "Mystery" },
  { id: 12, name: "Guerra", title: "War", titleKey: "War" },
  { id: 13, name: "Horror", title: "Horror", titleKey: "Horror" },
  { id: 14, name: "Musical", title: "Musical", titleKey: "Musical" },
  { id: 15, name: "Poliziesco", title: "Police", titleKey: "Police" },
  { id: 16, name: "Romantico", title: "Romance", titleKey: "Romance" },
  { id: 23, name: "Storico", title: "Historical", titleKey: "Historical" },
  { id: 17, name: "Spionaggio", title: "Spy", titleKey: "Spy" },
  { id: 18, name: "Sportivo", title: "Sport", titleKey: "Sport" },
  { id: 19, name: "Thriller", title: "Thriller", titleKey: "Thriller" },
  { id: 20, name: "Western", title: "Western", titleKey: "Western" },
];

export const ARCHIVE_YEAR_MIN = 1960;
export const ARCHIVE_YEAR_MAX_OFFSET = 0;

export const ARCHIVE_RATING_MIN = 1;
export const ARCHIVE_RATING_MAX = 10;

export const ARCHIVE_AUDIO_OPTIONS: ArchiveFilterOption[] = [
  { title: "Italian", titleKey: "Italian", value: "ita", providerValue: "ITA" },
  {
    title: "Original (SUB-ITA)",
    titleKey: "Original (SUB-ITA)",
    value: "sub-ita",
    providerValue: "Sub ITA",
  },
];

export const ARCHIVE_COUNTRY_OPTIONS: ArchiveFilterOption[] = [
  { title: "Italy", titleKey: "Italy", value: "italy", providerValue: "Italia" },
  {
    title: "United States",
    titleKey: "United States",
    value: "usa",
    providerValue: "USA",
  },
  {
    title: "United Kingdom",
    titleKey: "United Kingdom",
    value: "uk",
    providerValue: "Regno Unito",
  },
  { title: "Spain", titleKey: "Spain", value: "spain", providerValue: "Spagna" },
  { title: "France", titleKey: "France", value: "france", providerValue: "Francia" },
  {
    title: "Germany",
    titleKey: "Germany",
    value: "germany",
    providerValue: "Germania",
  },
  { title: "Canada", titleKey: "Canada", value: "canada", providerValue: "Canada" },
  { title: "Japan", titleKey: "Japan", value: "japan", providerValue: "Giappone" },
  { title: "India", titleKey: "India", value: "india", providerValue: "India" },
  {
    title: "Australia",
    titleKey: "Australia",
    value: "australia",
    providerValue: "Australia",
  },
  { title: "Russia", titleKey: "Russia", value: "russia", providerValue: "Russia" },
  {
    title: "Belgium",
    titleKey: "Belgium",
    value: "belgium",
    providerValue: "Belgio",
  },
  { title: "Mexico", titleKey: "Mexico", value: "mexico", providerValue: "Messico" },
  { title: "Brazil", titleKey: "Brazil", value: "brazil", providerValue: "Brasile" },
  { title: "Poland", titleKey: "Poland", value: "poland", providerValue: "Polonia" },
  { title: "Norway", titleKey: "Norway", value: "norway", providerValue: "Norvegia" },
];

export const ARCHIVE_SORT_OPTIONS: ArchiveFilterOption[] = [
  { title: "Date", titleKey: "Date", value: "date", providerValue: "date" },
  {
    title: "Rating",
    titleKey: "Rating",
    value: "rating",
    providerValue: "toprating",
  },
  {
    title: "Name - A-Z",
    titleKey: "Name - A-Z",
    value: "title",
    providerValue: "title",
  },
  {
    title: "Trending Movies",
    titleKey: "Trending Movies",
    value: "popfilm",
    providerValue: "popfilm",
  },
  {
    title: "Trending TV Series",
    titleKey: "Trending TV Series",
    value: "popserie",
    providerValue: "popserie",
  },
  {
    title: "Most Anticipated",
    titleKey: "Most Anticipated",
    value: "soon",
    providerValue: "soon",
  },
];

const ARCHIVE_TYPE_MAP: Record<string, string> = {
  movie: "1",
  movies: "1",
  film: "1",
  films: "1",
  serie: "2",
  series: "2",
  tv: "2",
  tvshow: "2",
  tvshows: "2",
  tvseries: "2",
  show: "2",
  shows: "2",
};

const GENRE_ID_SET = new Set(ARCHIVE_GENRES.map((genre) => genre.id));
const GENRE_ID_BY_KEY: Record<string, number> = ARCHIVE_GENRES.reduce(
  (acc, genre) => {
    acc[normalizeKey(genre.name)] = genre.id;
    acc[normalizeKey(genre.title)] = genre.id;
    return acc;
  },
  {} as Record<string, number>
);

const ARCHIVE_LANGUAGE_MAP: Record<string, string> = {
  ita: "ITA",
  italian: "ITA",
  italiano: "ITA",
  subita: "Sub ITA",
  sub: "Sub ITA",
  subitaoriginal: "Sub ITA",
  original: "Sub ITA",
  originale: "Sub ITA",
  originalsubita: "Sub ITA",
  subitaoriginale: "Sub ITA",
};

const ARCHIVE_COUNTRY_MAP: Record<string, string> = ARCHIVE_COUNTRY_OPTIONS.reduce(
  (acc, country) => {
    acc[normalizeKey(country.title)] = country.providerValue;
    acc[normalizeKey(country.providerValue)] = country.providerValue;
    acc[normalizeKey(country.value)] = country.providerValue;
    return acc;
  },
  {} as Record<string, string>
);

ARCHIVE_COUNTRY_MAP.unitedstatesofamerica = "USA";
ARCHIVE_COUNTRY_MAP.unitedstates = "USA";
ARCHIVE_COUNTRY_MAP.us = "USA";
ARCHIVE_COUNTRY_MAP.u = "USA";
ARCHIVE_COUNTRY_MAP.uk = "Regno Unito";
ARCHIVE_COUNTRY_MAP.england = "Regno Unito";
ARCHIVE_COUNTRY_MAP.britain = "Regno Unito";
ARCHIVE_COUNTRY_MAP.greatbritain = "Regno Unito";

const ARCHIVE_SORT_MAP: Record<string, string> = {
  date: "date",
  data: "date",
  latest: "date",
  newest: "date",
  recent: "date",
  toprating: "toprating",
  rating: "toprating",
  score: "toprating",
  valutazione: "toprating",
  title: "title",
  name: "title",
  nome: "title",
  az: "title",
  a: "title",
  nomeaz: "title",
  nameaz: "title",
  popfilm: "popfilm",
  trendingmovies: "popfilm",
  popularmovies: "popfilm",
  popserie: "popserie",
  trendingseries: "popserie",
  trendingtvseries: "popserie",
  popularseries: "popserie",
  soon: "soon",
  upcoming: "soon",
  mostanticipated: "soon",
  piuattesi: "soon",
};

const normalizeMappedValue = (
  value: string | null | undefined,
  mapping: Record<string, string>
): string | undefined => {
  if (!value) return undefined;
  const normalized = normalizeKey(value);
  if (!normalized) return undefined;
  return mapping[normalized] || value.trim();
};

export const normalizeArchiveType = (
  value?: string | null
): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed === "1" || trimmed === "2") return trimmed;
  const normalized = normalizeKey(trimmed);
  return ARCHIVE_TYPE_MAP[normalized];
};

export const normalizeArchiveGenre = (
  value?: string | null
): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  if (Number.isFinite(parsed) && GENRE_ID_SET.has(parsed)) {
    return String(parsed);
  }
  const normalized = normalizeKey(trimmed);
  const resolved = GENRE_ID_BY_KEY[normalized];
  return resolved ? String(resolved) : undefined;
};

export const normalizeArchiveYear = (
  value?: string | null
): string | undefined => {
  if (!value) return undefined;
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed)) return undefined;
  const maxYear = new Date().getFullYear() + ARCHIVE_YEAR_MAX_OFFSET;
  if (parsed < ARCHIVE_YEAR_MIN || parsed > maxYear) return undefined;
  return String(parsed);
};

export const normalizeArchiveRating = (
  value?: string | null
): string | undefined => {
  if (!value) return undefined;
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed)) return undefined;
  if (parsed < ARCHIVE_RATING_MIN || parsed > ARCHIVE_RATING_MAX) {
    return undefined;
  }
  return String(parsed);
};

export const normalizeArchiveLanguage = (
  value?: string | null
): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed === "ITA" || trimmed === "Sub ITA") return trimmed;
  return normalizeMappedValue(trimmed, ARCHIVE_LANGUAGE_MAP);
};

export const normalizeArchiveCountry = (
  value?: string | null
): string | undefined => {
  if (!value) return undefined;
  return normalizeMappedValue(value, ARCHIVE_COUNTRY_MAP);
};

export const normalizeArchiveSorting = (
  value?: string | null
): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (
    trimmed === "date" ||
    trimmed === "toprating" ||
    trimmed === "title" ||
    trimmed === "popfilm" ||
    trimmed === "popserie" ||
    trimmed === "soon"
  ) {
    return trimmed;
  }
  return normalizeMappedValue(trimmed, ARCHIVE_SORT_MAP);
};
