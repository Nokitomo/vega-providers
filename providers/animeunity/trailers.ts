import { ProviderContext } from "../types";

const ANILIST_URL = "https://graphql.anilist.co";
const JIKAN_URL = "https://api.jikan.moe/v4/anime";
const REQUEST_TIMEOUT_MS = 7000;
const SUCCESS_TTL_MS = 12 * 60 * 60 * 1000;
const MISS_TTL_MS = 60 * 60 * 1000;

type CacheEntry = { expiresAt: number; trailer?: string };
const cache = new Map<string, CacheEntry>();

export const normalizeAnimeTrailerUrl = (value: any): string | undefined => {
  if (!value) return undefined;
  const site = String(value?.site || "").trim().toLowerCase();
  const id = String(value?.id || value?.youtube_id || value?.youtubeId || "").trim();
  if ((site === "youtube" || !site) && id) {
    return `https://www.youtube.com/watch?v=${id}`;
  }
  const direct = String(value?.url || "").trim();
  if (/^https:\/\//i.test(direct)) return direct;
  const embed = String(value?.embed_url || value?.embedUrl || "").trim();
  const match = embed.match(/youtube(?:-nocookie)?\.com\/embed\/([^?&/]+)/i);
  return match?.[1] ? `https://www.youtube.com/watch?v=${match[1]}` : undefined;
};

const fetchAniListTrailer = async (
  axios: ProviderContext["axios"],
  anilistId?: number,
  malId?: number
): Promise<string | undefined> => {
  if (!anilistId && !malId) return undefined;
  const variable = anilistId ? "id" : "idMal";
  const value = anilistId || malId;
  const response = await axios.post(
    ANILIST_URL,
    {
      query: `query ($${variable}: Int) { Media(${variable}: $${variable}, type: ANIME) { trailer { id site } } }`,
      variables: { [variable]: value },
    },
    { timeout: REQUEST_TIMEOUT_MS, headers: { Accept: "application/json" } }
  );
  return normalizeAnimeTrailerUrl(response?.data?.data?.Media?.trailer);
};

const fetchJikanTrailer = async (
  axios: ProviderContext["axios"],
  malId?: number
): Promise<string | undefined> => {
  if (!malId) return undefined;
  const response = await axios.get(`${JIKAN_URL}/${malId}/full`, {
    timeout: REQUEST_TIMEOUT_MS,
    headers: { Accept: "application/json" },
  });
  return normalizeAnimeTrailerUrl(response?.data?.data?.trailer);
};

export const resolveAnimeUnityTrailer = async ({
  axios,
  anilistId,
  malId,
}: {
  axios: ProviderContext["axios"];
  anilistId?: number;
  malId?: number;
}): Promise<string | undefined> => {
  const key = anilistId ? `anilist:${anilistId}` : malId ? `mal:${malId}` : "";
  if (!key) return undefined;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.trailer;

  let trailer: string | undefined;
  try {
    trailer = await fetchAniListTrailer(axios, anilistId, malId);
  } catch (_) {
    // Try Jikan below.
  }
  if (!trailer) {
    try {
      trailer = await fetchJikanTrailer(axios, malId);
    } catch (_) {
      // Optional metadata must not fail the provider.
    }
  }
  cache.set(key, {
    expiresAt: Date.now() + (trailer ? SUCCESS_TTL_MS : MISS_TTL_MS),
    trailer,
  });
  return trailer;
};
