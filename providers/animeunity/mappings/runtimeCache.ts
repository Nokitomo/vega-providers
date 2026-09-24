import { ProviderContext } from "../../types";

const RUNTIME_CACHE_KEY = "__vegaProviderRuntimeCacheV1";
const localFallbackCache = new Map<string, unknown>();

export function getProviderRuntimeCache(
  providerContext: ProviderContext
): Map<string, unknown> {
  const host = providerContext as ProviderContext & {
    [RUNTIME_CACHE_KEY]?: Map<string, unknown>;
  };

  const current = host[RUNTIME_CACHE_KEY];
  if (current instanceof Map) return current;

  try {
    const cache = new Map<string, unknown>();
    Object.defineProperty(host, RUNTIME_CACHE_KEY, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: cache,
    });
    return cache;
  } catch (_) {
    return localFallbackCache;
  }
}
