import { ProviderContext } from "../../types";
import { getProviderRuntimeCache } from "./runtimeCache";

export const PLEXANIBRIDGE_MAPPINGS_URL =
  "https://raw.githubusercontent.com/eliasbenb/PlexAniBridge-Mappings/v2/mappings.json";

const CACHE_KEY = "animeunity:plexanibridge-v2:index";
const PENDING_KEY = "animeunity:plexanibridge-v2:pending";
const TIMEOUT_MS = 20000;
const SUCCESS_TTL_MS = 24 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 30 * 60 * 1000;

type LegacyIndex = {
  expiresAt: number;
  byAnilistId: Map<number, string[]>;
  byMalId: Map<number, string[]>;
};

function toPositiveInt(value: unknown): number | undefined {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function splitValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(splitValues);
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseImdbIds(value: unknown): string[] {
  return Array.from(
    new Set(
      splitValues(value)
        .map((item) => item.toLowerCase())
        .filter((item) => /^tt\d+$/.test(item))
    )
  ).sort();
}

function addIds(
  target: Map<number, Set<string>>,
  id: number | undefined,
  imdbIds: string[]
) {
  if (!id || imdbIds.length === 0) return;
  const ids = target.get(id) || new Set<string>();
  imdbIds.forEach((imdbId) => ids.add(imdbId));
  target.set(id, ids);
}

function freezeIndex(source: Map<number, Set<string>>): Map<number, string[]> {
  return new Map(
    Array.from(source.entries()).map(([id, values]) => [
      id,
      Array.from(values).sort(),
    ])
  );
}

export function parsePlexAniBridgePayload(
  payload: unknown,
  now = Date.now()
): LegacyIndex | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const byAnilistId = new Map<number, Set<string>>();
  const byMalId = new Map<number, Set<string>>();
  Object.entries(payload as Record<string, unknown>).forEach(([key, raw]) => {
    if (key.startsWith("$") || !raw || typeof raw !== "object") return;
    const entry = raw as Record<string, unknown>;
    const imdbIds = parseImdbIds(entry.imdb_id);
    if (imdbIds.length === 0) return;

    addIds(byAnilistId, toPositiveInt(key), imdbIds);
    splitValues(entry.anilist_id).forEach((value) =>
      addIds(byAnilistId, toPositiveInt(value), imdbIds)
    );
    splitValues(entry.mal_id).forEach((value) =>
      addIds(byMalId, toPositiveInt(value), imdbIds)
    );
  });

  return {
    expiresAt: now + SUCCESS_TTL_MS,
    byAnilistId: freezeIndex(byAnilistId),
    byMalId: freezeIndex(byMalId),
  };
}

async function loadIndex(providerContext: ProviderContext): Promise<LegacyIndex | null> {
  const cache = getProviderRuntimeCache(providerContext);
  const cached = cache.get(CACHE_KEY) as LegacyIndex | undefined;
  if (cached && cached.expiresAt > Date.now()) return cached;

  const pending = cache.get(PENDING_KEY) as Promise<LegacyIndex | null> | undefined;
  if (pending) return pending;

  const request = providerContext.axios
    .get(PLEXANIBRIDGE_MAPPINGS_URL, {
      timeout: TIMEOUT_MS,
      headers: { Accept: "application/json" },
    })
    .then((response) => {
      const raw = response?.data;
      const payload = typeof raw === "string" ? JSON.parse(raw) : raw;
      return parsePlexAniBridgePayload(payload);
    })
    .catch(() => null)
    .then((index) => {
      const value =
        index ||
        ({
          expiresAt: Date.now() + FAILURE_TTL_MS,
          byAnilistId: new Map(),
          byMalId: new Map(),
        } as LegacyIndex);
      cache.set(CACHE_KEY, value);
      return index;
    })
    .finally(() => cache.delete(PENDING_KEY));

  cache.set(PENDING_KEY, request);
  return request;
}

function chooseImdbId(anilistIds: string[], malIds: string[]): string | undefined {
  if (anilistIds.length && malIds.length) {
    const malSet = new Set(malIds);
    const shared = anilistIds.find((id) => malSet.has(id));
    if (shared) return shared;
  }
  return anilistIds[0] || malIds[0];
}

export async function resolveLegacyImdbId({
  providerContext,
  anilistId,
  malId,
}: {
  providerContext: ProviderContext;
  anilistId?: number;
  malId?: number;
}): Promise<string | undefined> {
  const index = await loadIndex(providerContext);
  if (!index) return undefined;
  return chooseImdbId(
    anilistId ? index.byAnilistId.get(anilistId) || [] : [],
    malId ? index.byMalId.get(malId) || [] : []
  );
}
