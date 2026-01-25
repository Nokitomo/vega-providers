type ArchiveFilterOption = {
  title: string;
  value: string;
  providerValue: string;
};

type ArchiveGenre = {
  id: number;
  name: string;
};

const POPULARITA = "Popolarit\u00e0";

export const ARCHIVE_ORDER_OPTIONS: ArchiveFilterOption[] = [
  { title: "A-Z", value: "a-z", providerValue: "Lista A-Z" },
  { title: "Z-A", value: "z-a", providerValue: "Lista Z-A" },
  { title: "Popularity", value: "popularity", providerValue: POPULARITA },
  { title: "Rating", value: "rating", providerValue: "Valutazione" },
];

export const ARCHIVE_STATUS_OPTIONS: ArchiveFilterOption[] = [
  { title: "Ongoing", value: "ongoing", providerValue: "In Corso" },
  { title: "Completed", value: "completed", providerValue: "Terminato" },
  { title: "Upcoming", value: "upcoming", providerValue: "In Uscita" },
  { title: "Dropped", value: "dropped", providerValue: "Droppato" },
];

export const ARCHIVE_TYPE_OPTIONS: ArchiveFilterOption[] = [
  { title: "TV", value: "tv", providerValue: "TV" },
  { title: "TV Short", value: "tv-short", providerValue: "TV Short" },
  { title: "OVA", value: "ova", providerValue: "OVA" },
  { title: "ONA", value: "ona", providerValue: "ONA" },
  { title: "Special", value: "special", providerValue: "Special" },
  { title: "Movie", value: "movie", providerValue: "Movie" },
];

export const ARCHIVE_SEASON_OPTIONS: ArchiveFilterOption[] = [
  { title: "Winter", value: "winter", providerValue: "Inverno" },
  { title: "Spring", value: "spring", providerValue: "Primavera" },
  { title: "Summer", value: "summer", providerValue: "Estate" },
  { title: "Autumn", value: "autumn", providerValue: "Autunno" },
];

export const ARCHIVE_YEAR_MIN = 1966;
export const ARCHIVE_YEAR_MAX_OFFSET = 1;

export const ARCHIVE_GENRES: ArchiveGenre[] = [
  { id: 51, name: "Action" },
  { id: 21, name: "Adventure" },
  { id: 43, name: "Avant Garde" },
  { id: 59, name: "Boys Love" },
  { id: 37, name: "Comedy" },
  { id: 13, name: "Demons" },
  { id: 22, name: "Drama" },
  { id: 5, name: "Ecchi" },
  { id: 9, name: "Fantasy" },
  { id: 44, name: "Game" },
  { id: 58, name: "Girls Love" },
  { id: 52, name: "Gore" },
  { id: 56, name: "Gourmet" },
  { id: 15, name: "Harem" },
  { id: 4, name: "Hentai" },
  { id: 30, name: "Historical" },
  { id: 3, name: "Horror" },
  { id: 53, name: "Isekai" },
  { id: 45, name: "Josei" },
  { id: 14, name: "Kids" },
  { id: 57, name: "Mahou Shoujo" },
  { id: 31, name: "Martial Arts" },
  { id: 38, name: "Mecha" },
  { id: 46, name: "Military" },
  { id: 16, name: "Music" },
  { id: 24, name: "Mystery" },
  { id: 32, name: "Parody" },
  { id: 39, name: "Police" },
  { id: 47, name: "Psychological" },
  { id: 29, name: "Racing" },
  { id: 54, name: "Reincarnation" },
  { id: 17, name: "Romance" },
  { id: 25, name: "Samurai" },
  { id: 33, name: "School" },
  { id: 40, name: "Sci-fi" },
  { id: 49, name: "Seinen" },
  { id: 18, name: "Shoujo" },
  { id: 34, name: "Shounen" },
  { id: 50, name: "Slice of Life" },
  { id: 19, name: "Space" },
  { id: 27, name: "Sports" },
  { id: 35, name: "Super Power" },
  { id: 42, name: "Supernatural" },
  { id: 55, name: "Survival" },
  { id: 48, name: "Thriller" },
  { id: 20, name: "Vampire" },
];

const DIACRITICS_REGEX = /[\u0300-\u036f]/g;

function normalizeKey(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_REGEX, "")
    .replace(/[^a-z0-9]+/g, "");
}

const ARCHIVE_ORDER_MAP: Record<string, string> = {
  listaaz: "Lista A-Z",
  listaza: "Lista Z-A",
  az: "Lista A-Z",
  za: "Lista Z-A",
  alphabetical: "Lista A-Z",
  alphabeticalasc: "Lista A-Z",
  alphabeticaldesc: "Lista Z-A",
  popularity: POPULARITA,
  popularita: POPULARITA,
  popular: POPULARITA,
  rating: "Valutazione",
  score: "Valutazione",
  valutazione: "Valutazione",
};

const ARCHIVE_STATUS_MAP: Record<string, string> = {
  incorso: "In Corso",
  ongoing: "In Corso",
  airing: "In Corso",
  terminato: "Terminato",
  completed: "Terminato",
  finished: "Terminato",
  inuscita: "In Uscita",
  upcoming: "In Uscita",
  comingsoon: "In Uscita",
  droppato: "Droppato",
  dropped: "Droppato",
};

const ARCHIVE_TYPE_MAP: Record<string, string> = {
  tv: "TV",
  tvshort: "TV Short",
  tvs: "TV Short",
  ova: "OVA",
  ona: "ONA",
  special: "Special",
  specials: "Special",
  movie: "Movie",
  movies: "Movie",
  film: "Movie",
};

const ARCHIVE_SEASON_MAP: Record<string, string> = {
  inverno: "Inverno",
  winter: "Inverno",
  primavera: "Primavera",
  spring: "Primavera",
  estate: "Estate",
  summer: "Estate",
  autunno: "Autunno",
  autumn: "Autunno",
  fall: "Autunno",
};

const GENRE_ID_BY_KEY: Record<string, number> = ARCHIVE_GENRES.reduce(
  (acc, genre) => {
    acc[normalizeKey(genre.name)] = genre.id;
    return acc;
  },
  {} as Record<string, number>
);

function normalizeMappedValue(
  value: string | null | undefined,
  mapping: Record<string, string>
): string | undefined {
  if (!value) return undefined;
  const normalized = normalizeKey(value);
  if (!normalized) return undefined;
  return mapping[normalized] || value.trim();
}

export function normalizeArchiveOrder(value?: string | null): string | undefined {
  return normalizeMappedValue(value, ARCHIVE_ORDER_MAP);
}

export function normalizeArchiveStatus(
  value?: string | null
): string | undefined {
  return normalizeMappedValue(value, ARCHIVE_STATUS_MAP);
}

export function normalizeArchiveType(value?: string | null): string | undefined {
  return normalizeMappedValue(value, ARCHIVE_TYPE_MAP);
}

export function normalizeArchiveSeason(
  value?: string | null
): string | undefined {
  return normalizeMappedValue(value, ARCHIVE_SEASON_MAP);
}

export function resolveArchiveGenreId(
  value?: string | null
): number | undefined {
  if (!value) return undefined;
  const normalized = normalizeKey(value);
  if (!normalized) return undefined;
  return GENRE_ID_BY_KEY[normalized];
}
