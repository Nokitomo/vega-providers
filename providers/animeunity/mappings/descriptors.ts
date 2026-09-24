import { AniBridgeDescriptor, AniBridgeProvider } from "./types";

const PROVIDERS = new Set<AniBridgeProvider>([
  "anidb",
  "anilist",
  "imdb_movie",
  "imdb_show",
  "mal",
  "tmdb_movie",
  "tmdb_show",
  "tvdb_movie",
  "tvdb_show",
]);

export function parseAniBridgeDescriptor(
  value: unknown
): AniBridgeDescriptor | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  const [providerValue, idValue, ...scopeParts] = raw.split(":");
  if (!PROVIDERS.has(providerValue as AniBridgeProvider)) return null;

  const id = String(idValue || "").trim();
  if (!id) return null;

  const provider = providerValue as AniBridgeProvider;
  const isImdb = provider === "imdb_movie" || provider === "imdb_show";
  if (isImdb) {
    if (!/^tt\d+$/i.test(id)) return null;
  } else if (!/^\d+$/.test(id) || Number.parseInt(id, 10) <= 0) {
    return null;
  }

  const scope = scopeParts.join(":").trim() || undefined;
  return {
    provider,
    id: isImdb ? id.toLowerCase() : id,
    scope,
    raw,
  };
}

export function buildAniBridgeDescriptor(
  provider: "anilist" | "mal",
  id?: number
): string | undefined {
  return Number.isFinite(id) && Number(id) > 0
    ? `${provider}:${Math.trunc(Number(id))}`
    : undefined;
}

export function parseSeasonScope(scope?: string): number | undefined {
  const match = String(scope || "").match(/^s(\d+)$/i);
  if (!match?.[1]) return undefined;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}
