type ArchiveFilterOption = {
  title: string;
  titleKey?: string;
  value: string;
  providerValue?: string;
};

type ArchiveNumericOption = {
  title: string;
  titleKey?: string;
  value: number;
};

export type ArchiveGenre = {
  id: number;
  name: string;
  title: string;
  titleKey?: string;
  type: "movie" | "tv" | "all";
};

export const ARCHIVE_SORT_OPTIONS: ArchiveFilterOption[] = [
  {
    title: "Release date",
    titleKey: "Release date",
    value: "release_date",
    providerValue: "Data di uscita",
  },
  {
    title: "Last air date",
    titleKey: "Last air date",
    value: "last_air_date",
    providerValue: "Data di aggiornamento",
  },
  {
    title: "Date added",
    titleKey: "Date added",
    value: "created_at",
    providerValue: "Data di aggiunta",
  },
  {
    title: "Score",
    titleKey: "Score",
    value: "score",
    providerValue: "Valutazione",
  },
  { title: "Views", titleKey: "Views", value: "views", providerValue: "Views" },
  { title: "Name", titleKey: "Name", value: "name", providerValue: "Nome" },
];

export const ARCHIVE_TYPE_OPTIONS: ArchiveFilterOption[] = [
  { title: "TV Show", titleKey: "TV Show", value: "tv", providerValue: "Serie TV" },
  { title: "Movie", titleKey: "Movie", value: "movie", providerValue: "Film" },
];

export const ARCHIVE_SCORE_OPTIONS: ArchiveNumericOption[] = Array.from(
  { length: 10 },
  (_, index) => {
    const value = index + 1;
    return { title: String(value), value };
  }
);

export const ARCHIVE_VIEWS_OPTIONS: ArchiveNumericOption[] = [
  { title: "25k+", value: 25_000 },
  { title: "50k+", value: 50_000 },
  { title: "75k+", value: 75_000 },
  { title: "100k+", value: 100_000 },
  { title: "250k+", value: 250_000 },
  { title: "500k+", value: 500_000 },
  { title: "1M+", value: 1_000_000 },
  { title: "2M+", value: 2_000_000 },
  { title: "5M+", value: 5_000_000 },
  { title: "10M+", value: 10_000_000 },
];

export const ARCHIVE_SERVICE_OPTIONS: ArchiveFilterOption[] = [
  { title: "Netflix", value: "netflix", providerValue: "Netflix" },
  { title: "PrimeVideo", value: "prime", providerValue: "PrimeVideo" },
  { title: "Disney+", value: "disney", providerValue: "Disney+" },
  { title: "AppleTV+", value: "apple", providerValue: "AppleTV+" },
  { title: "NowTV", value: "now", providerValue: "NowTV" },
  { title: "HBOMax", value: "hbo", providerValue: "HBOMax" },
];

export const ARCHIVE_QUALITY_OPTIONS: ArchiveFilterOption[] = [
  { title: "HD", value: "HD", providerValue: "HD" },
  { title: "SD", value: "SD", providerValue: "SD" },
  { title: "TS", value: "TS", providerValue: "TS" },
  { title: "CAM", value: "CAM", providerValue: "CAM" },
];

export const ARCHIVE_AGE_OPTIONS: ArchiveNumericOption[] = [
  { title: "7+", value: 7 },
  { title: "12+", value: 12 },
  { title: "14+", value: 14 },
  { title: "16+", value: 16 },
  { title: "18+", value: 18 },
];

export const ARCHIVE_GENRES: ArchiveGenre[] = [
  { id: 4, name: "Azione", title: "Action", titleKey: "Action", type: "movie" },
  {
    id: 13,
    name: "Action & Adventure",
    title: "Action & Adventure",
    titleKey: "Action & Adventure",
    type: "tv",
  },
  {
    id: 11,
    name: "Avventura",
    title: "Adventure",
    titleKey: "Adventure",
    type: "movie",
  },
  {
    id: 19,
    name: "Animazione",
    title: "Animation",
    titleKey: "Animation",
    type: "all",
  },
  {
    id: 12,
    name: "Commedia",
    title: "Comedy",
    titleKey: "Comedy",
    type: "all",
  },
  { id: 2, name: "Crime", title: "Crime", titleKey: "Crime", type: "all" },
  {
    id: 24,
    name: "Documentario",
    title: "Documentary",
    titleKey: "Documentary",
    type: "all",
  },
  { id: 1, name: "Dramma", title: "Drama", titleKey: "Drama", type: "all" },
  {
    id: 16,
    name: "Famiglia",
    title: "Family",
    titleKey: "Family",
    type: "all",
  },
  {
    id: 8,
    name: "Fantasy",
    title: "Fantasy",
    titleKey: "Fantasy",
    type: "movie",
  },
  {
    id: 22,
    name: "Storia",
    title: "Historical",
    titleKey: "Historical",
    type: "movie",
  },
  {
    id: 7,
    name: "Horror",
    title: "Horror",
    titleKey: "Horror",
    type: "movie",
  },
  { id: 25, name: "Kids", title: "Kids", titleKey: "Kids", type: "tv" },
  {
    id: 26,
    name: "Korean drama",
    title: "Korean Drama",
    titleKey: "Korean Drama",
    type: "all",
  },
  {
    id: 14,
    name: "Musica",
    title: "Music",
    titleKey: "Music",
    type: "movie",
  },
  {
    id: 6,
    name: "Mistero",
    title: "Mystery",
    titleKey: "Mystery",
    type: "all",
  },
  { id: 37, name: "News", title: "News", titleKey: "News", type: "all" },
  {
    id: 18,
    name: "Reality",
    title: "Reality",
    titleKey: "Reality",
    type: "tv",
  },
  {
    id: 15,
    name: "Romance",
    title: "Romance",
    titleKey: "Romance",
    type: "all",
  },
  {
    id: 3,
    name: "Sci-Fi & Fantasy",
    title: "Sci-Fi & Fantasy",
    titleKey: "Sci-Fi & Fantasy",
    type: "tv",
  },
  {
    id: 10,
    name: "Fantascienza",
    title: "Science Fiction",
    titleKey: "Science Fiction",
    type: "movie",
  },
  { id: 23, name: "Soap", title: "Soap", titleKey: "Soap", type: "tv" },
  {
    id: 5,
    name: "Thriller",
    title: "Thriller",
    titleKey: "Thriller",
    type: "movie",
  },
  {
    id: 21,
    name: "televisione film",
    title: "TV Movie",
    titleKey: "TV Movie",
    type: "movie",
  },
  { id: 9, name: "Guerra", title: "War", titleKey: "War", type: "movie" },
  {
    id: 17,
    name: "War & Politics",
    title: "War & Politics",
    titleKey: "War & Politics",
    type: "tv",
  },
  {
    id: 20,
    name: "Western",
    title: "Western",
    titleKey: "Western",
    type: "all",
  },
];

export const ARCHIVE_YEAR_MIN = 1910;

export const buildArchiveYears = (): ArchiveNumericOption[] => {
  const maxYear = new Date().getFullYear();
  const options: ArchiveNumericOption[] = [];
  const seen = new Set<number>();
  for (let year = maxYear; year > ARCHIVE_YEAR_MIN; year -= 1) {
    const value = year > 2000 ? year : Math.floor(year / 10) * 10;
    if (seen.has(value)) continue;
    seen.add(value);
    options.push({ title: String(value), value });
  }
  return options;
};

export const ARCHIVE_YEAR_OPTIONS = buildArchiveYears();

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

const ARCHIVE_SORT_MAP: Record<string, string> = {
  releasedate: "release_date",
  release: "release_date",
  released: "release_date",
  datauscita: "release_date",
  lastairdate: "last_air_date",
  lastair: "last_air_date",
  dataaggiornamento: "last_air_date",
  dateadded: "created_at",
  created: "created_at",
  createdat: "created_at",
  dataaggiunta: "created_at",
  score: "score",
  rating: "score",
  valutazione: "score",
  views: "views",
  visualizzazioni: "views",
  name: "name",
  nome: "name",
};

const ARCHIVE_TYPE_MAP: Record<string, string> = {
  tv: "tv",
  serie: "tv",
  series: "tv",
  show: "tv",
  tvshow: "tv",
  tvshows: "tv",
  tvseries: "tv",
  movie: "movie",
  movies: "movie",
  film: "movie",
  films: "movie",
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

const ARCHIVE_SERVICE_MAP: Record<string, string> = {
  netflix: "netflix",
  prime: "prime",
  primevideo: "prime",
  amazon: "prime",
  disney: "disney",
  disneyplus: "disney",
  appletv: "apple",
  appletvplus: "apple",
  apple: "apple",
  now: "now",
  nowtv: "now",
  hbo: "hbo",
  hbomax: "hbo",
  hbomaxplus: "hbo",
};

const ARCHIVE_QUALITY_MAP: Record<string, string> = {
  hd: "HD",
  sd: "SD",
  ts: "TS",
  cam: "CAM",
};

const ALLOWED_SORT = new Set(ARCHIVE_SORT_OPTIONS.map((option) => option.value));
const ALLOWED_VIEWS = new Set(ARCHIVE_VIEWS_OPTIONS.map((option) => option.value));
const ALLOWED_SCORE = new Set(ARCHIVE_SCORE_OPTIONS.map((option) => option.value));
const ALLOWED_AGE = new Set(ARCHIVE_AGE_OPTIONS.map((option) => option.value));
const ALLOWED_YEAR = new Set(ARCHIVE_YEAR_OPTIONS.map((option) => option.value));

const normalizeMappedValue = (
  value: string | null | undefined,
  mapping: Record<string, string>
): string | undefined => {
  if (!value) return undefined;
  const normalized = normalizeKey(value);
  if (!normalized) return undefined;
  return mapping[normalized] || value.trim();
};

export const normalizeArchiveSort = (
  value?: string | null
): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (ALLOWED_SORT.has(trimmed)) return trimmed;
  const mapped = normalizeMappedValue(trimmed, ARCHIVE_SORT_MAP);
  return mapped && ALLOWED_SORT.has(mapped) ? mapped : undefined;
};

export const normalizeArchiveType = (
  value?: string | null
): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed === "tv" || trimmed === "movie") return trimmed;
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
  if (!ALLOWED_YEAR.has(parsed)) return undefined;
  return String(parsed);
};

export const normalizeArchiveScore = (
  value?: string | null
): string | undefined => {
  if (!value) return undefined;
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || !ALLOWED_SCORE.has(parsed)) return undefined;
  return String(parsed);
};

export const normalizeArchiveViews = (
  value?: string | null
): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return undefined;
  const numeric = trimmed.replace(/[^0-9km]/g, "");
  let parsed = Number.parseInt(numeric, 10);
  if (!Number.isFinite(parsed)) return undefined;
  if (numeric.includes("m")) parsed *= 1_000_000;
  if (numeric.includes("k")) parsed *= 1_000;
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return ALLOWED_VIEWS.has(parsed) ? String(parsed) : String(parsed);
};

export const normalizeArchiveService = (
  value?: string | null
): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const normalized = normalizeKey(trimmed);
  return ARCHIVE_SERVICE_MAP[normalized] || trimmed;
};

export const normalizeArchiveQuality = (
  value?: string | null
): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed === "HD" || trimmed === "SD" || trimmed === "TS" || trimmed === "CAM") {
    return trimmed;
  }
  const normalized = normalizeKey(trimmed);
  return ARCHIVE_QUALITY_MAP[normalized];
};

export const normalizeArchiveAge = (
  value?: string | null
): string | undefined => {
  if (!value) return undefined;
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || !ALLOWED_AGE.has(parsed)) return undefined;
  return String(parsed);
};
