import { ProviderContext } from "../types";

const PAB_MAPPINGS_URL =
  "https://raw.githubusercontent.com/eliasbenb/PlexAniBridge-Mappings/v2/mappings.json";
const CINEMETA_BASE_URL = "https://v3-cinemeta.strem.io/meta";

const MAPPINGS_TIMEOUT_MS = 20000;
const CINEMETA_TIMEOUT_MS = 10000;
const MAPPINGS_TTL_MS = 24 * 60 * 60 * 1000;
const CINEMETA_SUCCESS_TTL_MS = 12 * 60 * 60 * 1000;
const CINEMETA_MISS_TTL_MS = 60 * 60 * 1000;

type MappingIndex = {
  expiresAt: number;
  byAnilistId: Map<number, string[]>;
  byMalId: Map<number, string[]>;
};

type CinemetaTitleCacheEntry = {
  expiresAt: number;
  title?: string;
};

let mappingIndexCache: MappingIndex | null = null;
let mappingIndexPromise: Promise<MappingIndex | null> | null = null;
const cinemetaTitleCache = new Map<string, CinemetaTitleCacheEntry>();

function toPositiveInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

function splitValueList(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => splitValueList(item));
  }
  const text = String(value).trim();
  if (!text) return [];
  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseImdbIds(value: unknown): string[] {
  const imdbIds = splitValueList(value)
    .map((item) => item.toLowerCase())
    .filter((item) => /^tt\d+$/.test(item));
  return Array.from(new Set(imdbIds)).sort();
}

function parseNumericIds(value: unknown): number[] {
  const ids = splitValueList(value)
    .map((item) => toPositiveInt(item))
    .filter((item): item is number => item != null);
  return Array.from(new Set(ids)).sort((a, b) => a - b);
}

function mergeImdbMap(target: Map<number, Set<string>>, id: number, imdbIds: string[]) {
  if (imdbIds.length === 0) return;
  if (!target.has(id)) {
    target.set(id, new Set());
  }
  const entry = target.get(id);
  if (!entry) return;
  imdbIds.forEach((imdbId) => entry.add(imdbId));
}

function freezeMap(target: Map<number, Set<string>>): Map<number, string[]> {
  const output = new Map<number, string[]>();
  target.forEach((imdbSet, id) => {
    output.set(id, Array.from(imdbSet).sort());
  });
  return output;
}

async function buildMappingIndex(
  axios: ProviderContext["axios"]
): Promise<MappingIndex | null> {
  try {
    const response = await axios.get(PAB_MAPPINGS_URL, {
      timeout: MAPPINGS_TIMEOUT_MS,
      headers: { Accept: "application/json" },
    });
    const payload = response?.data;
    if (!payload || typeof payload !== "object") {
      return null;
    }

    const byAnilistMutable = new Map<number, Set<string>>();
    const byMalMutable = new Map<number, Set<string>>();
    const records = payload as Record<string, unknown>;

    Object.entries(records).forEach(([key, rawValue]) => {
      if (key.startsWith("$")) return;
      if (!rawValue || typeof rawValue !== "object") return;

      const entry = rawValue as Record<string, unknown>;
      const imdbIds = parseImdbIds(entry.imdb_id);
      if (imdbIds.length === 0) return;

      const keyAnilistId = toPositiveInt(key);
      if (keyAnilistId) {
        mergeImdbMap(byAnilistMutable, keyAnilistId, imdbIds);
      }

      parseNumericIds(entry.anilist_id).forEach((anilistId) => {
        mergeImdbMap(byAnilistMutable, anilistId, imdbIds);
      });
      parseNumericIds(entry.mal_id).forEach((malId) => {
        mergeImdbMap(byMalMutable, malId, imdbIds);
      });
    });

    return {
      expiresAt: Date.now() + MAPPINGS_TTL_MS,
      byAnilistId: freezeMap(byAnilistMutable),
      byMalId: freezeMap(byMalMutable),
    };
  } catch (_) {
    return null;
  }
}

async function getMappingIndex(
  axios: ProviderContext["axios"]
): Promise<MappingIndex | null> {
  if (mappingIndexCache && mappingIndexCache.expiresAt > Date.now()) {
    return mappingIndexCache;
  }

  if (mappingIndexPromise) {
    return mappingIndexPromise;
  }

  mappingIndexPromise = buildMappingIndex(axios)
    .then((index) => {
      if (index) {
        mappingIndexCache = index;
      }
      return index;
    })
    .finally(() => {
      mappingIndexPromise = null;
    });

  return mappingIndexPromise;
}

function chooseImdbId(
  anilistIds: string[],
  malIds: string[]
): string | undefined {
  if (anilistIds.length > 0 && malIds.length > 0) {
    const malSet = new Set(malIds);
    const intersection = anilistIds.filter((item) => malSet.has(item));
    if (intersection.length > 0) {
      return intersection[0];
    }
  }
  if (anilistIds.length > 0) return anilistIds[0];
  if (malIds.length > 0) return malIds[0];
  return undefined;
}

async function resolveImdbIdFromMappings({
  axios,
  anilistId,
  malId,
}: {
  axios: ProviderContext["axios"];
  anilistId?: number;
  malId?: number;
}): Promise<string | undefined> {
  const index = await getMappingIndex(axios);
  if (!index) return undefined;

  const anilistImdbIds =
    anilistId != null ? index.byAnilistId.get(anilistId) || [] : [];
  const malImdbIds = malId != null ? index.byMalId.get(malId) || [] : [];

  return chooseImdbId(anilistImdbIds, malImdbIds);
}

function normalizeCinemetaType(isMovie: boolean): "movie" | "series" {
  return isMovie ? "movie" : "series";
}

async function fetchCinemetaTitle({
  axios,
  imdbId,
  isMovie,
}: {
  axios: ProviderContext["axios"];
  imdbId: string;
  isMovie: boolean;
}): Promise<string | undefined> {
  const type = normalizeCinemetaType(isMovie);
  const cacheKey = `${type}:${imdbId}`;
  const cached = cinemetaTitleCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.title;
  }

  try {
    const response = await axios.get(`${CINEMETA_BASE_URL}/${type}/${imdbId}.json`, {
      timeout: CINEMETA_TIMEOUT_MS,
      headers: { Accept: "application/json" },
    });
    const title = response?.data?.meta?.name;
    const resolvedTitle =
      typeof title === "string" && title.trim() ? title.trim() : undefined;
    cinemetaTitleCache.set(cacheKey, {
      expiresAt: Date.now() + (resolvedTitle ? CINEMETA_SUCCESS_TTL_MS : CINEMETA_MISS_TTL_MS),
      title: resolvedTitle,
    });
    return resolvedTitle;
  } catch (_) {
    cinemetaTitleCache.set(cacheKey, {
      expiresAt: Date.now() + CINEMETA_MISS_TTL_MS,
      title: undefined,
    });
    return undefined;
  }
}

export async function resolveAnimeUnityCinemetaMetadata({
  axios,
  anilistId,
  malId,
  isMovie,
}: {
  axios: ProviderContext["axios"];
  anilistId?: number;
  malId?: number;
  isMovie: boolean;
}): Promise<{ imdbId?: string; cinemetaTitle?: string }> {
  const imdbId = await resolveImdbIdFromMappings({ axios, anilistId, malId });
  if (!imdbId) {
    return {};
  }

  const cinemetaTitle = await fetchCinemetaTitle({
    axios,
    imdbId,
    isMovie,
  });

  return {
    imdbId,
    cinemetaTitle,
  };
}
