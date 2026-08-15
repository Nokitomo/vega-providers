import { ProviderContext } from "../types";

const ANIZIP_URL = "https://api.ani.zip/mappings";
const REQUEST_TIMEOUT_MS = 5000;
const SUCCESS_TTL_MS = 12 * 60 * 60 * 1000;
const MISS_TTL_MS = 60 * 60 * 1000;

export type AnimeUnityArtwork = {
  imdbId?: string;
  logo?: string;
  poster?: string;
  background?: string;
};

type CacheEntry = {
  expiresAt: number;
  artwork: AnimeUnityArtwork;
};

const cache = new Map<string, CacheEntry>();

const normalizeHttpsUrl = (value: unknown): string | undefined => {
  const text = typeof value === "string" ? value.trim() : "";
  return /^https:\/\//i.test(text) && text.length <= 2048 ? text : undefined;
};

const normalizeImdbId = (value: unknown): string | undefined => {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^tt\d{5,}$/.test(text) ? text : undefined;
};

export const parseAniZipArtwork = (payload: any): AnimeUnityArtwork => {
  const images = Array.isArray(payload?.images) ? payload.images : [];
  const findImage = (types: string[]): string | undefined => {
    const normalizedTypes = types.map((type) => type.toLowerCase());
    const match = images.find((image: any) =>
      normalizedTypes.includes(String(image?.coverType || "").trim().toLowerCase())
    );
    return normalizeHttpsUrl(match?.url);
  };
  return {
    imdbId: normalizeImdbId(payload?.mappings?.imdb_id),
    logo: findImage(["Clearlogo", "Clear Logo", "Logo"]),
    poster: findImage(["Poster"]),
    background: findImage(["Fanart", "Banner"]),
  };
};

export const resolveAniZipArtwork = async ({
  axios,
  anilistId,
  malId,
}: {
  axios: ProviderContext["axios"];
  anilistId?: number;
  malId?: number;
}): Promise<AnimeUnityArtwork> => {
  const query = anilistId && anilistId > 0
    ? `anilist_id=${anilistId}`
    : malId && malId > 0
      ? `mal_id=${malId}`
      : "";
  if (!query) return {};

  const cached = cache.get(query);
  if (cached && cached.expiresAt > Date.now()) return cached.artwork;
  try {
    const response = await axios.get(`${ANIZIP_URL}?${query}`, {
      timeout: REQUEST_TIMEOUT_MS,
      headers: { Accept: "application/json" },
    });
    const artwork = parseAniZipArtwork(response?.data);
    const successful = Object.values(artwork).some(Boolean);
    cache.set(query, {
      expiresAt: Date.now() + (successful ? SUCCESS_TTL_MS : MISS_TTL_MS),
      artwork,
    });
    return artwork;
  } catch (_) {
    cache.set(query, { expiresAt: Date.now() + MISS_TTL_MS, artwork: {} });
    return {};
  }
};
