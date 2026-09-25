import { ProviderContext } from "../../types";
import { readExternalCache, writeExternalCache } from "../externalCache";
import { getProviderRuntimeCache } from "../mappings/runtimeCache";
import { parseAniZipMetadata } from "./parser";
import { AniZipMetadata } from "./types";

const ANIZIP_URL = "https://api.ani.zip/mappings";
const REQUEST_TIMEOUT_MS = 5000;
const SUCCESS_SOFT_TTL_MS = 24 * 60 * 60 * 1000;
const MISS_SOFT_TTL_MS = 60 * 60 * 1000;
const CACHE_SCHEMA = "v2";

type AniZipCacheValue = {
  metadata: AniZipMetadata;
  sourceRevision?: string;
  successful: boolean;
};

function buildQuery(anilistId?: number, malId?: number): string {
  if (anilistId && anilistId > 0) return `anilist_id=${anilistId}`;
  if (malId && malId > 0) return `mal_id=${malId}`;
  return "";
}

function hasMetadata(metadata: AniZipMetadata): boolean {
  return !!(
    metadata.imdbId ||
    metadata.episodes.length ||
    Object.values(metadata.artwork).some(Boolean)
  );
}

export async function resolveAniZipMetadata({
  providerContext,
  anilistId,
  malId,
  sourceRevision,
}: {
  providerContext: ProviderContext;
  anilistId?: number;
  malId?: number;
  sourceRevision?: string;
}): Promise<AniZipMetadata> {
  const query = buildQuery(anilistId, malId);
  const empty: AniZipMetadata = { artwork: {}, episodes: [] };
  if (!query) return empty;

  const persistentKey = `animeunity:anizip:${CACHE_SCHEMA}:${query}`;
  const cached = readExternalCache<AniZipCacheValue>(
    providerContext,
    persistentKey
  );
  const softTtl = cached?.value.successful
    ? SUCCESS_SOFT_TTL_MS
    : MISS_SOFT_TTL_MS;
  const revisionChanged =
    !!sourceRevision && cached?.value.sourceRevision !== sourceRevision;
  if (cached && cached.ageMs <= softTtl && !revisionChanged) {
    return cached.value.metadata;
  }

  const runtimeCache = getProviderRuntimeCache(providerContext);
  const pendingKey = `${persistentKey}:pending:${sourceRevision || "none"}`;
  const pending = runtimeCache.get(pendingKey) as
    | Promise<AniZipMetadata>
    | undefined;
  if (pending) return pending;

  const request = providerContext.axios
    .get(`${ANIZIP_URL}?${query}`, {
      timeout: REQUEST_TIMEOUT_MS,
      headers: { Accept: "application/json" },
    })
    .then((response) => {
      const metadata = parseAniZipMetadata(response?.data);
      writeExternalCache(providerContext, persistentKey, {
        metadata,
        sourceRevision,
        successful: hasMetadata(metadata),
      } as AniZipCacheValue);
      return metadata;
    })
    .catch(() => cached?.value.metadata || empty)
    .finally(() => runtimeCache.delete(pendingKey));

  runtimeCache.set(pendingKey, request);
  return request;
}
