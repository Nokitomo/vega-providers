import { ProviderContext } from "../../types";
import {
  buildAniBridgeDescriptor,
  parseAniBridgeDescriptor,
} from "./descriptors";
import { getProviderRuntimeCache } from "./runtimeCache";
import {
  AniBridgeDescriptor,
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
    if (!source) {
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
  return findAniBridgeRecordsByDescriptors(index, [
    buildAniBridgeDescriptor("anilist", anilistId),
    buildAniBridgeDescriptor("mal", malId),
  ]);
}

function descriptorMatchesQuery(
  descriptor: AniBridgeDescriptor,
  query: AniBridgeDescriptor
): boolean {
  if (descriptor.provider !== query.provider || descriptor.id !== query.id) {
    return false;
  }
  return !query.scope || descriptor.scope === query.scope;
}

function invertRanges(ranges: Record<string, string>): Record<string, string> {
  const output: Record<string, string> = {};
  Object.entries(ranges).forEach(([sourceRange, targetRange]) => {
    if (sourceRange && targetRange) output[targetRange] = sourceRange;
  });
  return output;
}

function composeReverseRanges(
  queryTarget: AniBridgeTarget,
  siblingTarget: AniBridgeTarget
): Record<string, string> {
  const output: Record<string, string> = {};
  Object.entries(siblingTarget.ranges).forEach(([sourceRange, siblingRange]) => {
    const queryRange = queryTarget.ranges[sourceRange];
    if (queryRange && siblingRange) output[queryRange] = siblingRange;
  });
  return output;
}

function targetFromDescriptor(
  descriptor: AniBridgeDescriptor,
  ranges: Record<string, string> = {}
): AniBridgeTarget {
  return {
    ...descriptor,
    ranges,
  };
}

function mergeRecordTargets(targets: AniBridgeTarget[]): AniBridgeTarget[] {
  const merged = new Map<string, AniBridgeTarget>();
  targets.forEach((target) => {
    const key = `${target.provider}:${target.id}:${target.scope || ""}`;
    const current = merged.get(key);
    if (current) {
      current.ranges = { ...current.ranges, ...target.ranges };
      return;
    }
    merged.set(key, { ...target, ranges: { ...target.ranges } });
  });
  return Array.from(merged.values()).sort((left, right) =>
    left.raw.localeCompare(right.raw)
  );
}

function buildReverseRecordTargets(
  record: AniBridgeSourceRecord,
  queryTarget: AniBridgeTarget
): AniBridgeTarget[] {
  const source = parseAniBridgeDescriptor(record.sourceDescriptor);
  const targets: AniBridgeTarget[] = [];
  if (source) {
    targets.push(targetFromDescriptor(source, invertRanges(queryTarget.ranges)));
  }
  record.targets.forEach((target) => {
    if (
      target.provider === queryTarget.provider &&
      target.id === queryTarget.id &&
      target.scope === queryTarget.scope
    ) {
      return;
    }
    targets.push(
      targetFromDescriptor(target, composeReverseRanges(queryTarget, target))
    );
  });
  return mergeRecordTargets(targets);
}

export function findAniBridgeRecordsByDescriptors(
  index: AniBridgeIndex,
  descriptors: Array<string | undefined>
): AniBridgeSourceRecord[] {
  const queries = descriptors
    .filter((value): value is string => !!value)
    .map((descriptor) => parseAniBridgeDescriptor(descriptor))
    .filter((descriptor): descriptor is AniBridgeDescriptor => !!descriptor);
  if (queries.length === 0) return [];

  const output = new Map<string, AniBridgeSourceRecord>();
  const addRecord = (sourceDescriptor: string, targets: AniBridgeTarget[]) => {
    if (targets.length === 0) return;
    const current = output.get(sourceDescriptor);
    output.set(sourceDescriptor, {
      sourceDescriptor,
      targets: mergeRecordTargets([...(current?.targets || []), ...targets]),
    });
  };

  queries.forEach((query) => {
    const directTargets: AniBridgeTarget[] = [];
    const reverseTargets: AniBridgeTarget[] = [];
    index.records.forEach((record) => {
      const source = parseAniBridgeDescriptor(record.sourceDescriptor);
      if (source && descriptorMatchesQuery(source, query)) {
        directTargets.push(...record.targets);
      }

      record.targets.forEach((target) => {
        if (!descriptorMatchesQuery(target, query)) return;
        reverseTargets.push(...buildReverseRecordTargets(record, target));
      });
    });
    addRecord(query.raw, reverseTargets);
    addRecord(query.raw, directTargets);
  });

  return Array.from(output.values()).sort((left, right) =>
    left.sourceDescriptor.localeCompare(right.sourceDescriptor)
  );
}
