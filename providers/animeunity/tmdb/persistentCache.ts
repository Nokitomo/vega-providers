import { ProviderContext } from "../../types";

export const TMDB_PERSISTENT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type PersistentEntry<T> = {
  schema: 1;
  updatedAt: number;
  value: T;
};

export type PersistentCacheResult<T> = {
  ageMs: number;
  value: T;
};

export function readTmdbPersistentCache<T>(
  providerContext: ProviderContext,
  key: string,
  maxAgeMs = TMDB_PERSISTENT_MAX_AGE_MS
): PersistentCacheResult<T> | null {
  const raw = providerContext.cache?.getString(key);
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as PersistentEntry<T>;
    if (
      entry?.schema !== 1 ||
      !Number.isFinite(entry.updatedAt) ||
      entry.updatedAt <= 0
    ) {
      return null;
    }
    const ageMs = Math.max(0, Date.now() - entry.updatedAt);
    if (ageMs > maxAgeMs) {
      providerContext.cache?.delete?.(key);
      return null;
    }
    return { ageMs, value: entry.value };
  } catch (_) {
    providerContext.cache?.delete?.(key);
    return null;
  }
}

export function writeTmdbPersistentCache<T>(
  providerContext: ProviderContext,
  key: string,
  value: T
): void {
  try {
    providerContext.cache?.setString(
      key,
      JSON.stringify({ schema: 1, updatedAt: Date.now(), value } as PersistentEntry<T>)
    );
  } catch (_) {
    // Persistent caching is an optimization and must never break metadata loading.
  }
}
