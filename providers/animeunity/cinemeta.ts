import { ProviderContext } from "../types";
import { getProviderRuntimeCache } from "./mappings/runtimeCache";

const CINEMETA_BASE_URL = "https://v3-cinemeta.strem.io/meta";
const CINEMETA_TIMEOUT_MS = 10000;
const CINEMETA_SUCCESS_TTL_MS = 12 * 60 * 60 * 1000;
const CINEMETA_MISS_TTL_MS = 60 * 60 * 1000;

type CinemetaMetadata = {
  title?: string;
  logo?: string;
  poster?: string;
  background?: string;
};

type CinemetaMetadataCacheEntry = {
  expiresAt: number;
  metadata: CinemetaMetadata;
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
  const cacheKey = `animeunity:cinemeta:${type}:${imdbId}`;
  const cache = getProviderRuntimeCache(providerContext);
  const cached = cache.get(cacheKey) as CinemetaMetadataCacheEntry | undefined;
  if (cached && cached.expiresAt > Date.now()) {
    return {
      cinemetaTitle: cached.metadata.title,
      logo: cached.metadata.logo,
      poster: cached.metadata.poster,
      background: cached.metadata.background,
    };
  }

  let metadata: CinemetaMetadata = {};
  try {
    const response = await providerContext.axios.get(
      `${CINEMETA_BASE_URL}/${type}/${imdbId}.json`,
      {
        timeout: CINEMETA_TIMEOUT_MS,
        headers: { Accept: "application/json" },
      }
    );
    metadata = parseCinemetaMetadata(response?.data);
  } catch (_) {
    metadata = {};
  }

  const successful = Object.values(metadata).some(Boolean);
  cache.set(cacheKey, {
    expiresAt:
      Date.now() +
      (successful ? CINEMETA_SUCCESS_TTL_MS : CINEMETA_MISS_TTL_MS),
    metadata,
  } as CinemetaMetadataCacheEntry);

  return {
    cinemetaTitle: metadata.title,
    logo: metadata.logo,
    poster: metadata.poster,
    background: metadata.background,
  };
}
