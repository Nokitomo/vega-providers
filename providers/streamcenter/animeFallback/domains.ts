import { ProviderContext } from "../../types";
import { AnimeFallbackSource } from "./types";

const PASTEBIN_URL = "https://pastebin.com/raw/KgQ4jTy6";
const DOMAIN_TTL_MS = 6 * 60 * 60 * 1000;
const CONFIG: Record<
  AnimeFallbackSource,
  { match: RegExp; fallback: string }
> = {
  animeworld: {
    match: /(?:^|\.)animeworld\./i,
    fallback: "https://www.animeworld.ac",
  },
  animesaturn: {
    match: /(?:^|\.)animesaturn\./i,
    fallback: "https://www.animesaturn.net",
  },
};

const cache = new Map<AnimeFallbackSource, { value: string; fetchedAt: number }>();
let registryPromise: Promise<string[]> | null = null;

const normalize = (value: string): string => value.replace(/\/+$/, "");

const loadRegistry = async (providerContext: ProviderContext): Promise<string[]> => {
  if (!registryPromise) {
    registryPromise = providerContext.axios
      .get(PASTEBIN_URL, { timeout: 8_000, responseType: "text" })
      .then((response) =>
        String(response.data || "")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
      )
      .catch(() => [])
      .finally(() => {
        registryPromise = null;
      });
  }
  return registryPromise;
};

export const resolveFallbackDomain = async (
  source: AnimeFallbackSource,
  providerContext: ProviderContext
): Promise<string> => {
  const cached = cache.get(source);
  if (cached && Date.now() - cached.fetchedAt < DOMAIN_TTL_MS) {
    return cached.value;
  }

  const config = CONFIG[source];
  const lines = await loadRegistry(providerContext);
  const match = lines.find((line) => {
    try {
      return config.match.test(new URL(line).hostname);
    } catch (_) {
      return false;
    }
  });
  const value = normalize(match || config.fallback);
  cache.set(source, { value, fetchedAt: Date.now() });
  return value;
};
