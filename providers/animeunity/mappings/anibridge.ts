import { ProviderContext } from "../../types";
import {
  buildAniBridgeDescriptor,
  parseAniBridgeDescriptor,
} from "./descriptors";
import { getProviderRuntimeCache } from "./runtimeCache";
import {
  AniBridgeIndex,
  AniBridgeSourceRecord,
  AniBridgeTarget,
} from "./types";

export const ANIBRIDGE_MAPPINGS_URL =
  "https://github.com/anibridge/anibridge-mappings/releases/download/v3/mappings.min.json";

const CACHE_KEY = "animeunity:anibridge-v3:index";
const PENDING_KEY = "animeunity:anibridge-v3:pending";
const TIMEOUT_MS = 30000;
const SUCCESS_TTL_MS = 24 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 30 * 60 * 1000;

function parseRanges(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const ranges: Record<string, string> = {};
  Object.entries(value as Record<string, unknown>).forEach(
    ([source, target]) => {
      if (source.trim() && typeof target === "string" && target.trim()) {
        ranges[source] = target;
      }
    }
  );
  return ranges;
}

export function parseAniBridgePayload(
  rawPayload: unknown,
  now = Date.now()
): AniBridgeIndex | null {
  let payload = rawPayload;
  if (typeof rawPayload === "string") {
    try {
      payload = JSON.parse(rawPayload);
    } catch (_) {
      return null;
    }
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const root = payload as Record<string, unknown>;
  const metadata =
    root.$meta && typeof root.$meta === "object"
      ? (root.$meta as Record<string, unknown>)
      : {};
  const schemaVersion = String(metadata.schema_version || "").trim();
  if (!/^3(?:\.|$)/.test(schemaVersion)) return null;

  const generatedOnValue = metadata.generated_on ?? metadata.generated_at;
  const generatedOn =
    typeof generatedOnValue === "string" && generatedOnValue.trim()
      ? generatedOnValue.trim()
      : undefined;
  const records = new Map<string, AniBridgeSourceRecord>();

  Object.entries(root).forEach(([sourceValue, rawTargets]) => {
    if (sourceValue.startsWith("$")) return;
    const source = parseAniBridgeDescriptor(sourceValue);
    if (
      !source ||
      (source.provider !== "anilist" && source.provider !== "mal")
    ) {
      return;
    }
    if (
      !rawTargets ||
      typeof rawTargets !== "object" ||
      Array.isArray(rawTargets)
    ) {
      return;
    }

    const targets: AniBridgeTarget[] = [];
    Object.entries(rawTargets as Record<string, unknown>).forEach(
      ([targetValue, rawRanges]) => {
        const descriptor = parseAniBridgeDescriptor(targetValue);
        if (!descriptor) return;
        targets.push({
          ...descriptor,
          ranges: parseRanges(rawRanges),
        });
      }
    );
    records.set(source.raw, { sourceDescriptor: source.raw, targets });
  });

  return {
    schemaVersion,
    generatedOn,
    expiresAt: now + SUCCESS_TTL_MS,
    records,
  };
}

export async function getAniBridgeIndex(
  providerContext: ProviderContext
): Promise<AniBridgeIndex | null> {
  const cache = getProviderRuntimeCache(providerContext);
  const cached = cache.get(CACHE_KEY) as AniBridgeIndex | undefined;
  if (cached && cached.expiresAt > Date.now()) {
    return cached.schemaVersion ? cached : null;
  }

  const pending = cache.get(PENDING_KEY) as
    | Promise<AniBridgeIndex | null>
    | undefined;
  if (pending) return pending;

  const request = providerContext.axios
    .get(ANIBRIDGE_MAPPINGS_URL, {
      timeout: TIMEOUT_MS,
      headers: { Accept: "application/json" },
    })
    .then((response) => parseAniBridgePayload(response?.data))
    .catch(() => null)
    .then((index) => {
      const cachedValue =
        index ||
        ({
          schemaVersion: "",
          expiresAt: Date.now() + FAILURE_TTL_MS,
          records: new Map(),
        } as AniBridgeIndex);
      cache.set(CACHE_KEY, cachedValue);
      return index;
    })
    .finally(() => cache.delete(PENDING_KEY));

  cache.set(PENDING_KEY, request);
  return request;
}

export function findAniBridgeSourceRecords(
  index: AniBridgeIndex,
  anilistId?: number,
  malId?: number
): AniBridgeSourceRecord[] {
  return [
    buildAniBridgeDescriptor("anilist", anilistId),
    buildAniBridgeDescriptor("mal", malId),
  ]
    .filter((value): value is string => !!value)
    .map((descriptor) => index.records.get(descriptor))
    .filter((record): record is AniBridgeSourceRecord => record != null);
}
