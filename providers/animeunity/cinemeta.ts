import { ProviderContext } from "../types";
import { readExternalCache, writeExternalCache } from "./externalCache";
import { getProviderRuntimeCache } from "./mappings/runtimeCache";

const CINEMETA_BASE_URL = "https://v3-cinemeta.strem.io/meta";
const CINEMETA_TIMEOUT_MS = 10000;
const CINEMETA_SUCCESS_TTL_MS = 24 * 60 * 60 * 1000;
const CINEMETA_MISS_TTL_MS = 60 * 60 * 1000;
const CACHE_SCHEMA = "v2";

type CinemetaMetadata = {
  title?: string;
  logo?: string;
  poster?: string;
  background?: string;
};

type CinemetaMetadataCacheEntry = {
  metadata: CinemetaMetadata;
  successful: boolean;
};

const normalizeHttpsUrl = (value: unknown): string | undefined => {
  const text = typeof value === "string" ? value.trim() : "";
  return /^https:\/\//i.test(text) && text.length <= 2048 ? text : undefined;
};

export const parseCinemetaMetadata = (payload: any): CinemetaMetadata => {
  const meta = payload?.meta || {};
  const rawTitle = meta?.name;
  return {
    title:
      typeof rawTitle === "string" && rawTitle.trim()
        ? rawTitle.trim()
        : undefined,
    logo: normalizeHttpsUrl(meta?.logo),
    poster: normalizeHttpsUrl(meta?.poster),
    background: normalizeHttpsUrl(meta?.background),
  };
};

export async function resolveAnimeUnityCinemetaMetadata({
  providerContext,
  imdbId,
  isMovie,
}: {
  providerContext: ProviderContext;
  imdbId?: string;
  isMovie: boolean;
}): Promise<{
  cinemetaTitle?: string;
  logo?: string;
  poster?: string;
  background?: string;
}> {
  if (!imdbId || !/^tt\d+$/.test(imdbId)) return {};

  const type = isMovie ? "movie" : "series";
  const cacheKey = `animeunity:cinemeta:${CACHE_SCHEMA}:${type}:${imdbId}`;
  const cached = readExternalCache<CinemetaMetadataCacheEntry>(
    providerContext,
    cacheKey
  );
  const softTtl = cached?.value.successful
    ? CINEMETA_SUCCESS_TTL_MS
    : CINEMETA_MISS_TTL_MS;
  if (cached && cached.ageMs <= softTtl) {
    return {
      cinemetaTitle: cached.value.metadata.title,
      logo: cached.value.metadata.logo,
      poster: cached.value.metadata.poster,
      background: cached.value.metadata.background,
    };
  }

  const runtimeCache = getProviderRuntimeCache(providerContext);
  const pendingKey = `${cacheKey}:pending`;
  const existing = runtimeCache.get(pendingKey) as
    | Promise<CinemetaMetadata>
    | undefined;
  const request =
    existing ||
    providerContext.axios
      .get(`${CINEMETA_BASE_URL}/${type}/${imdbId}.json`, {
        timeout: CINEMETA_TIMEOUT_MS,
        headers: { Accept: "application/json" },
      })
      .then((response) => {
        const metadata = parseCinemetaMetadata(response?.data);
        writeExternalCache(providerContext, cacheKey, {
          metadata,
          successful: Object.values(metadata).some(Boolean),
        } as CinemetaMetadataCacheEntry);
        return metadata;
      })
      .catch(() => cached?.value.metadata || {})
      .finally(() => runtimeCache.delete(pendingKey));
  if (!existing) runtimeCache.set(pendingKey, request);
  const metadata = await request;

  return {
    cinemetaTitle: metadata.title,
    logo: metadata.logo,
    poster: metadata.poster,
    background: metadata.background,
  };
}
