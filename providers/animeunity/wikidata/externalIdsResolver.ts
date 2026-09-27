import { ProviderContext } from "../../types";
import { readExternalCache, writeExternalCache } from "../externalCache";
import { getProviderRuntimeCache } from "../mappings/runtimeCache";
import { TmdbMediaType } from "../tmdb/types";

const WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql";
const CACHE_SCHEMA = "v1";
const SUCCESS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

export type WikidataExternalIds = {
  source: "wikidata";
  sourceUrl: string;
  wikidataId: string;
  tmdbId: number;
  type: TmdbMediaType;
  imdbId?: string;
  tvdbId?: number;
  traktSlug?: string;
};

type WikidataCacheValue = {
  metadata: WikidataExternalIds | null;
};

function normalizePositiveInt(value: unknown): number | undefined {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeImdbId(value: unknown): string | undefined {
  const text = String(value ?? "").trim().toLowerCase();
  return /^tt\d{5,}$/.test(text) ? text : undefined;
}

function normalizeTraktSlug(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return /^[a-z0-9][a-z0-9-]*$/i.test(text) ? text : undefined;
}

function extractWikidataId(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  const match = text.match(/(?:^|\/)(Q\d+)$/i);
  return match?.[1]?.toUpperCase();
}

function sparqlString(value: string): string {
  return JSON.stringify(value);
}

function buildQuery(type: TmdbMediaType, tmdbId: number): string {
  const tmdbProperty = type === "movie" ? "P4947" : "P4983";
  return `
SELECT ?item ?imdb ?tvdbSeries ?tvdbMovie ?trakt WHERE {
  ?item wdt:${tmdbProperty} ${sparqlString(String(tmdbId))}.
  OPTIONAL { ?item wdt:P345 ?imdb. }
  OPTIONAL { ?item wdt:P4835 ?tvdbSeries. }
  OPTIONAL { ?item wdt:P12196 ?tvdbMovie. }
  OPTIONAL { ?item wdt:P8013 ?trakt. }
}
LIMIT 5`;
}

function bindingValue(binding: any, key: string): string | undefined {
  const value = binding?.[key]?.value;
  return typeof value === "string" ? value : undefined;
}

function parseWikidataResponse(
  payload: any,
  type: TmdbMediaType,
  tmdbId: number
): WikidataExternalIds | null {
  const bindings = Array.isArray(payload?.results?.bindings)
    ? payload.results.bindings
    : [];
  for (const binding of bindings) {
    const wikidataId = extractWikidataId(bindingValue(binding, "item"));
    if (!wikidataId) continue;
    const tvdbId =
      normalizePositiveInt(bindingValue(binding, "tvdbSeries")) ||
      normalizePositiveInt(bindingValue(binding, "tvdbMovie"));
    return {
      source: "wikidata",
      sourceUrl: `https://www.wikidata.org/wiki/${wikidataId}`,
      wikidataId,
      tmdbId,
      type,
      imdbId: normalizeImdbId(bindingValue(binding, "imdb")),
      tvdbId,
      traktSlug: normalizeTraktSlug(bindingValue(binding, "trakt")),
    };
  }
  return null;
}

export async function resolveWikidataExternalIds({
  providerContext,
  type,
  tmdbId,
}: {
  providerContext: ProviderContext;
  type: TmdbMediaType;
  tmdbId?: number;
}): Promise<WikidataExternalIds | null> {
  const id = Math.trunc(Number(tmdbId));
  if (!Number.isFinite(id) || id <= 0) return null;

  const persistentKey = `wikidata:${CACHE_SCHEMA}:external-ids:${type}:${id}`;
  const cached = readExternalCache<WikidataCacheValue>(
    providerContext,
    persistentKey,
    SUCCESS_TTL_MS
  );
  if (cached) {
    if (cached.value.metadata || cached.ageMs <= FAILURE_TTL_MS) {
      return cached.value.metadata;
    }
    providerContext.cache?.delete?.(persistentKey);
  }

  const runtimeCache = getProviderRuntimeCache(providerContext);
  const pendingKey = `${persistentKey}:pending`;
  const pending = runtimeCache.get(pendingKey) as
    Promise<WikidataExternalIds | null> | undefined;
  if (pending) return pending;

  const request = providerContext.axios
    .get(WIKIDATA_SPARQL_URL, {
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        Accept: "application/sparql-results+json, application/json",
        "User-Agent":
          "VegaProviders/1.0 (https://github.com/nokitomo/vega-providers)",
      },
      params: {
        format: "json",
        query: buildQuery(type, id),
      },
    })
    .then((response) => parseWikidataResponse(response?.data, type, id))
    .catch(() => null)
    .then((metadata) => {
      writeExternalCache(providerContext, persistentKey, {
        metadata,
      } as WikidataCacheValue);
      return metadata;
    })
    .finally(() => runtimeCache.delete(pendingKey));

  runtimeCache.set(pendingKey, request);
  return request;
}
